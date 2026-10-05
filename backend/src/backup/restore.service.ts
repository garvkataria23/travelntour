import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/current-user.decorator';
import { Permission, roleHas } from '../common/permissions';
import { sha256Hex } from './google-drive.service-account';

/**
 * Restoring a tenant from an archive.
 *
 * THIS IS THE MOST DESTRUCTIVE OPERATION IN THE SYSTEM. It deletes live rows and replaces them
 * with what an archive happened to contain. Everything here is built around that fact:
 *
 *   - `preview()` computes the full plan and validates integrity BEFORE anything is written. The
 *     UI is expected to show it and require an explicit typed confirmation.
 *   - `restore()` takes an automatic safety archive (BackupTrigger.PRE_RESTORE) before it touches
 *     anything, so a mistake is itself recoverable.
 *   - The whole rewrite runs in one transaction. A failure halfway leaves the tenant exactly as it
 *     was, rather than half-restored.
 *   - `passwordHash` is never in an archive and is never restored. A user row restored from an
 *     archive gets a fresh random password nobody knows and is reported as needing a reset, so an
 *     archive can never be used to plant a usable credential.
 *
 * FOREIGN KEY ORDERING --- the part that actually breaks restores
 *
 * Several relations are `onDelete: Restrict`, which means a naive delete-everything-then-insert
 * fails outright:
 *
 *   Booking.createdBy      -> User         Restrict  (users cannot be deleted at all)
 *   Expense.createdBy      -> User         Restrict
 *   Income.createdBy       -> User         Restrict
 *   ScheduledMessage.template -> Template  Restrict
 *
 * Consequences encoded below:
 *   - Users are NEVER deleted, only upserted, and are inserted before anything that references them.
 *   - Templates are deleted only after scheduled messages, and restored before them.
 *   - Optional references (`updatedBy`, `automationRuleId`, `messageLog.bookingId`) are nulled when
 *     their target is absent, because their FK is SetNull-tolerant but a dangling id is not.
 */

export type RestoreScope =
  | 'customers'
  | 'bookings'
  | 'expenses'
  | 'income'
  | 'templates'
  | 'automation'
  | 'messages'
  | 'documents'
  | 'audit';

export const ALL_SCOPES: RestoreScope[] = [
  'customers',
  'bookings',
  'expenses',
  'income',
  'templates',
  'automation',
  'messages',
  'documents',
  'audit',
];

/** Tables that depend on others. Restoring a parent requires its children to be in scope too. */
const SCOPE_DEPENDENCIES: Record<RestoreScope, RestoreScope[]> = {
  customers: [],
  // A booking cascades to its invoice items, and messageLogs reference the booking.
  bookings: ['customers'],
  expenses: [],
  income: [],
  templates: [],
  automation: ['templates'],
  // ScheduledMessage.bookingId is a REQUIRED foreign key (onDelete: Cascade), so a scheduled
  // message cannot exist without its booking. Bookings in turn require their customer.
  messages: ['customers', 'templates', 'bookings'],
  documents: ['bookings'],
  audit: [],
};

interface Archive {
  appName?: string;
  version?: string;
  exportedAt?: string;
  businessId?: string;
  counts?: Record<string, number>;
  data?: Record<string, unknown>;
}

export interface RestorePlan {
  runId: string;
  tenantId: string;
  tenantName: string | null;
  archiveExportedAt: string | null;
  archiveVersion: string | null;
  checksumMatches: boolean;
  scopes: RestoreScope[];
  /** Row counts that will be deleted, per table. */
  willDelete: Record<string, number>;
  /** Row counts that will be written, per table, from the archive. */
  willInsert: Record<string, number>;
  /** Non-fatal problems the operator should know about before proceeding. */
  warnings: string[];
  /** Problems that make a restore unsafe. Any entry here must block it. */
  blockers: string[];
  usersNeedingPasswordReset: Array<{ id: string; email: string }>;
}

@Injectable()
export class RestoreService {
  private readonly logger = new Logger(RestoreService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  private assertCan(user: AuthUser): void {
    if (!roleHas(user.role, Permission.BACKUP_RESTORE)) {
      // 403, not 400. A missing permission is an authorisation failure; 400 would tell the caller
      // the request was malformed, which is wrong and would make the frontend look like it sent
      // something bad. Matches `BackupService.assertCan`.
      throw new ForbiddenException({
        message: 'Restoring a backup requires the backup:restore permission (platform owner only)',
        code: 'INSUFFICIENT_PERMISSION',
      });
    }
  }

  /**
   * Parses and integrity-checks an archive.
   *
   * Rejects anything that is not shaped like one of our archives, and verifies the SHA-256 recorded
   * against the run. A truncated or tampered archive must fail here rather than half-restoring.
   */
  private parseArchive(buffer: Buffer, expectedSha?: string | null): Archive {
    const actual = sha256Hex(buffer);
    if (expectedSha && expectedSha !== actual) {
      throw new BadRequestException({
        message: 'Archive checksum does not match the one recorded when it was created. The file is corrupt or has been altered.',
        code: 'ARCHIVE_CHECKSUM_MISMATCH',
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(buffer.toString('utf8'));
    } catch {
      throw new BadRequestException({
        message: 'Archive is not valid JSON',
        code: 'ARCHIVE_NOT_JSON',
      });
    }

    const archive = parsed as Archive;
    if (archive?.appName !== 'FlyConnect' || typeof archive.data !== 'object' || archive.data === null) {
      throw new BadRequestException({
        message: 'This file is not a FlyConnect backup archive',
        code: 'ARCHIVE_UNRECOGNISED',
      });
    }
    return archive;
  }

  /** Works out which scopes were asked for, pulling in what they depend on. */
  private resolveScopes(requested: RestoreScope[]): RestoreScope[] {
    const wanted = new Set<RestoreScope>();
    const queue = [...requested];
    while (queue.length > 0) {
      const scope = queue.pop() as RestoreScope;
      if (wanted.has(scope)) continue;
      if (!ALL_SCOPES.includes(scope)) {
        throw new BadRequestException({
          message: `Unknown restore scope "${scope}"`,
          code: 'RESTORE_SCOPE_UNKNOWN',
        });
      }
      wanted.add(scope);
      queue.push(...(SCOPE_DEPENDENCIES[scope] ?? []));
    }
    // Dependency order, so inserts never violate a Restrict FK.
    return ALL_SCOPES.filter((s) => wanted.has(s));
  }

  /**
   * Computes exactly what a restore would do. Read-only.
   *
   * Callers should show this to the operator and require confirmation. Nothing here writes.
   */
  async preview(
    user: AuthUser,
    buffer: Buffer,
    expectedSha: string | null,
    requestedScopes: RestoreScope[],
  ): Promise<RestorePlan> {
    this.assertCan(user);
    const archive = this.parseArchive(buffer, expectedSha);
    const scopes = this.resolveScopes(requestedScopes);
    const data = (archive.data ?? {}) as Record<string, unknown[]>;
    const tenantId = archive.businessId ?? "";

    const warnings: string[] = [];
    const blockers: string[] = [];

    // The archive must belong to a tenant that actually exists, otherwise restoring it would
    // create rows under a businessId with no parent.
    const tenant = tenantId
      ? await this.prisma.business.findUnique({ where: { id: tenantId }, select: { id: true, name: true } })
      : null;
    if (!tenant) {
      blockers.push(
        `The archive was taken for business "${tenantId || '(missing)'}", which no longer exists. Restore cannot attach these rows to a business.`,
      );
    }

    if (!scopes.includes('customers') && scopes.includes('bookings')) {
      // resolveScopes adds customers automatically, so this is defensive documentation of intent.
      warnings.push('Bookings require their customers; customers will be restored too.');
    }

    const arr = (key: string): unknown[] => (Array.isArray(data[key]) ? (data[key] as unknown[]) : []);

    // Users referenced by Restrict FKs must exist after the restore.
    const archivedUsers = arr('users');
    const userIds = new Set(
      archivedUsers
        .map((u) => (u as { id?: string }).id)
        .filter((id): id is string => typeof id === 'string'),
    );
    const liveUsers = await this.prisma.user.findMany({
      where: { businessId: tenantId },
      select: { id: true, email: true },
    });
    const liveById = new Map(liveUsers.map((u) => [u.id, u]));
    // Guarded rather than assumed: User.email is NOT NULL in the schema, but preview() must not be
    // the thing that crashes if that ever changes.
    const liveByEmail = new Map(
      liveUsers.filter((u) => typeof u.email === 'string').map((u) => [u.email.toLowerCase(), u]),
    );

    const usersNeedingPasswordReset: Array<{ id: string; email: string }> = [];
    for (const raw of archivedUsers) {
      const u = raw as { id?: string; email?: string; role?: string };
      if (!u.id || typeof u.email !== 'string') continue;
      if (!liveById.has(u.id) && !liveByEmail.has(u.email.toLowerCase())) {
        usersNeedingPasswordReset.push({ id: u.id, email: u.email });
      }
    }
    if (usersNeedingPasswordReset.length > 0) {
      warnings.push(
        `${usersNeedingPasswordReset.length} team member(s) in the archive do not exist now. They will be recreated with a random password that nobody knows, so their accounts will need a password reset before they can sign in.`,
      );
    }

    // Referential integrity: creators referenced with a Restrict FK must resolve to a user.
    const resolveUser = (raw: unknown): string | null => {
      const id = (raw as { createdBy?: string })?.createdBy;
      if (typeof id !== 'string') return null;
      if (userIds.has(id) || liveById.has(id)) return id;
      return null;
    };

    const bookings = arr('bookings');
    const unresolvedCreators = bookings.filter((b) => resolveUser(b) === null).length;
    if (unresolvedCreators > 0 && scopes.includes('bookings')) {
      blockers.push(
        `${unresolvedCreators} booking(s) reference a creator who is in neither the archive nor the live team. Those rows cannot be inserted.`,
      );
    }

    const customerIds = new Set(
      arr('customers')
        .map((c) => (c as { id?: string }).id)
        .filter((id): id is string => typeof id === 'string'),
    );
    const liveCustomerIds = new Set(
      (
        await this.prisma.customer.findMany({ where: { businessId: tenantId }, select: { id: true } })
      ).map((c) => c.id),
    );

    const orphanBookings = bookings.filter((b) => {
      const customerId = (b as { customerId?: string }).customerId;
      return typeof customerId === 'string' && !customerIds.has(customerId) && !liveCustomerIds.has(customerId);
    });
    if (orphanBookings.length > 0 && scopes.includes('bookings')) {
      blockers.push(
        `${orphanBookings.length} booking(s) reference a customer that is in neither the archive nor live data.`,
      );
    }

    // Templates referenced by ScheduledMessage with a Restrict FK.
    if (scopes.includes('messages')) {
      const templateIds = new Set(
        arr('templates')
          .map((t) => (t as { id?: string }).id)
          .filter((id): id is string => typeof id === 'string'),
      );
      const liveTemplateIds = new Set(
        (
          await this.prisma.messageTemplate.findMany({ where: { businessId: tenantId }, select: { id: true } })
        ).map((t) => t.id),
      );
      const orphans = arr('scheduledMessages').filter((m) => {
        const templateId = (m as { templateId?: string }).templateId;
        return (
          typeof templateId === 'string' &&
          !templateIds.has(templateId) &&
          !liveTemplateIds.has(templateId)
        );
      });
      if (orphans.length > 0) {
        blockers.push(
          `${orphans.length} scheduled message(s) reference a template that is in neither the archive nor live data.`,
        );
      }
    }

    if ((archive.version ?? '1.0') === '1.0.0') {
      warnings.push(
        'This archive predates the current format and does not include audit logs, invoice documents, scheduled messages or message history. Restoring it will leave those empty.',
      );
    }

    // Count what would be deleted.
    const where = { businessId: tenantId };
    const willDelete: Record<string, number> = {};
    const countInto = async (key: string, count: Promise<number>) => {
      willDelete[key] = await count;
    };

    const tasks: Array<Promise<void>> = [];
    if (scopes.includes('messages')) tasks.push(countInto('messageLogs', this.prisma.messageLog.count({ where: { businessId: tenantId } })));
    if (scopes.includes('messages')) tasks.push(countInto('scheduledMessages', this.prisma.scheduledMessage.count({ where })));
    if (scopes.includes('documents')) tasks.push(countInto('invoiceDocuments', this.prisma.invoiceDocument.count({ where })));
    if (scopes.includes('bookings')) tasks.push(countInto('bookings', this.prisma.booking.count({ where })));
    if (scopes.includes('expenses')) tasks.push(countInto('expenses', this.prisma.expense.count({ where })));
    if (scopes.includes('income')) tasks.push(countInto('income', this.prisma.income.count({ where })));
    if (scopes.includes('customers')) tasks.push(countInto('customers', this.prisma.customer.count({ where })));
    if (scopes.includes('templates')) tasks.push(countInto('templates', this.prisma.messageTemplate.count({ where })));
    if (scopes.includes('automation')) tasks.push(countInto('automationRules', this.prisma.automationRule.count({ where })));
    if (scopes.includes('audit')) tasks.push(countInto('auditLogs', this.prisma.auditLog.count({ where })));
    await Promise.all(tasks);

    const willInsert: Record<string, number> = {};
    if (scopes.includes('customers')) willInsert.customers = arr('customers').length;
    if (scopes.includes('bookings')) {
      willInsert.bookings = bookings.length;
      const itemCount = bookings.reduce(
        (n: number, b) => n + (((b as { invoiceItems?: unknown[] }).invoiceItems?.length ?? 0) as number),
        0,
      );
      willInsert.invoiceItems = itemCount;
    }
    if (scopes.includes('expenses')) willInsert.expenses = arr('expenses').length;
    if (scopes.includes('income')) willInsert.income = arr('income').length;
    if (scopes.includes('templates')) willInsert.templates = arr('templates').length;
    if (scopes.includes('automation')) willInsert.automationRules = arr('automationRules').length;
    if (scopes.includes('messages')) {
      willInsert.scheduledMessages = arr('scheduledMessages').length;
      willInsert.messageLogs = arr('messageLogs').length;
    }
    if (scopes.includes('documents')) willInsert.invoiceDocuments = arr('invoiceDocuments').length;
    if (scopes.includes('audit')) willInsert.auditLogs = arr('auditLogs').length;
    willInsert.users = archivedUsers.length;

    const totalDeleted = Object.values(willDelete).reduce((a, b) => a + b, 0);
    if (totalDeleted === 0) {
      warnings.push('Nothing currently exists for this tenant, so no live rows will be deleted.');
    }

    // Surfaces the export's byte budget. An operator has to be told that some invoices will come
    // back without their PDF - otherwise "restored successfully" quietly hides missing documents.
    const blobs = (archive as { invoiceBlobs?: { skippedForBudget?: number } }).invoiceBlobs;
    const skipped = blobs?.skippedForBudget ?? 0;
    if (skipped > 0) {
      warnings.push(
        `${skipped} invoice document${skipped === 1 ? '' : 's'} in this archive did not include the PDF ` +
          'because the archive exceeded its size budget. Their details will be restored, but the ' +
          'documents will not be downloadable. Re-run a backup with a larger budget to capture them.',
      );
    }

    return {
      runId: '',
      tenantId,
      tenantName: tenant?.name ?? null,
      archiveExportedAt: archive.exportedAt ?? null,
      archiveVersion: archive.version ?? null,
      checksumMatches: true,
      scopes,
      willDelete,
      willInsert,
      warnings,
      blockers,
      usersNeedingPasswordReset,
    };
  }

  /**
   * Performs the restore.
   *
   * `preview()` must have been run first: this method re-validates independently and refuses on
   * any blocker, so a caller cannot skip the checks by calling it directly.
   */
  async restore(
    user: AuthUser,
    buffer: Buffer,
    expectedSha: string | null,
    requestedScopes: RestoreScope[],
    options: {
      confirmationPhrase: string;
      /**
       * The PRE_RESTORE run taken by the caller immediately beforehand. Recorded on the audit entry
       * so an incident can be traced back to the exact archive that captured the pre-restore state.
       * Optional because the service is also callable directly; the controller always supplies it.
       */
      safetyBackupRunId?: string;
    },
  ): Promise<{
    restored: boolean;
    tenantId: string;
    scopes: RestoreScope[];
    deleted: Record<string, number>;
    inserted: Record<string, number>;
    usersNeedingPasswordReset: Array<{ id: string; email: string }>;
    warnings: string[];
    durationMs: number;
    /** The PRE_RESTORE run that captured the state this restore replaced, when the caller took one. */
    safetyBackupRunId: string | null;
  }> {
    this.assertCan(user);
    const startedAt = Date.now();

    const REQUIRED_PHRASE = 'RESTORE';
    if (options.confirmationPhrase?.trim().toUpperCase() !== REQUIRED_PHRASE) {
      throw new BadRequestException({
        message: `Type ${REQUIRED_PHRASE} to confirm. This operation permanently replaces live tenant data.`,
        code: 'RESTORE_CONFIRMATION_REQUIRED',
      });
    }

    const archive = this.parseArchive(buffer, expectedSha);
    const scopes = this.resolveScopes(requestedScopes);
    const data = (archive.data ?? {}) as Record<string, unknown[]>;
    const tenantId = archive.businessId ?? '';
    const arr = (key: string): Record<string, unknown>[] =>
      (Array.isArray(data[key]) ? (data[key] as Record<string, unknown>[]) : []);

    const plan = await this.preview(user, buffer, expectedSha, requestedScopes);
    if (plan.blockers.length > 0) {
      throw new BadRequestException({
        message: 'This archive cannot be restored safely.',
        code: 'RESTORE_BLOCKED',
        blockers: plan.blockers,
      });
    }

    const deleted: Record<string, number> = {};
    const inserted: Record<string, number> = {};
    // Declared inside the method on purpose. As module-level arrays these would be shared by
    // concurrent restores, so one tenant's result could leak into another's report.
    const restoreWarnings: string[] = [...plan.warnings];
    const restoreResets: Array<{ id: string; email: string }> = [];

    await this.prisma.$transaction(
      async (tx) => {
        // ------ 1. Users first. They are never deleted: Booking/Expense/Income.createdBy are Restrict,
        // so deleting one would fail outright, and passwordHash is not in the archive anyway.
        const archivedUsers = arr('users');

        for (const raw of archivedUsers) {
          const u = raw as {
            id: string;
            name: string;
            email: string;
            phone?: string | null;
            role?: string;
            status?: string;
          };
          if (!u.id || typeof u.email !== 'string' || !u.email.includes('@')) {
            // A user row without a usable email cannot be created (the column is unique and
            // non-null) and must not be guessed at.
            restoreWarnings.push(
              `Skipped a team member in the archive because it has no usable email address (id ${u.id ?? 'unknown'}).`,
            );
            continue;
          }

          const existing = await tx.user.findUnique({ where: { id: u.id } });
          if (existing) {
            // Keep the existing passwordHash: an archive must never be able to set a credential.
            await tx.user.update({
              where: { id: u.id },
              data: {
                name: u.name ?? existing.name,
                role: (u.role as never) ?? existing.role,
                status: (u.status as never) ?? existing.status,
              },
            });
          } else {
            const clash = await tx.user.findUnique({ where: { email: u.email.toLowerCase() } });
            if (clash) {
              // The same person already exists under a different id. Nothing is re-pointed, but the
              // report stays honest about the fact that this archive row was not applied.
              restoreResets.push({ id: clash.id, email: clash.email });
              continue;
            }
            // Fresh random password: unknown to anybody, so the account is inert until reset.
            await tx.user.create({
              data: {
                id: u.id,
                businessId: tenantId,
                name: u.name ?? u.email,
                email: u.email.toLowerCase(),
                phone: u.phone ?? null,
                role: (u.role as never) ?? 'STAFF',
                status: 'INACTIVE',
                passwordHash: createHash('sha256')
                  .update(randomBytes(32))
                  .digest('hex')
                  .concat(':unusable'),
              },
            });
            // Recorded on the outer accumulator so it survives into the returned report. It was
            // previously pushed onto a transaction-local array and never reached the caller, so
            // the operator was never told which accounts now need a password reset.
            restoreResets.push({ id: u.id, email: u.email });
          }
        }
        inserted.users = archivedUsers.length;

        // Every user id the archive mentions will exist after step 1, because users are upserted
        // rather than restored verbatim.

        // -- 2. Delete in reverse-dependency order. Children before parents.
        const drop = async (label: string, run: () => Promise<{ count: number }>) => {
          const { count } = await run();
          deleted[label] = count;
        };

        if (scopes.includes('messages')) {
          await drop('messageLogs', () => tx.messageLog.deleteMany({ where: { businessId: tenantId } }));
          await drop('scheduledMessages', () => tx.scheduledMessage.deleteMany({ where: { businessId: tenantId } }));
        }
        if (scopes.includes('documents')) {
          await drop('invoiceDocuments', () => tx.invoiceDocument.deleteMany({ where: { businessId: tenantId } }));
        }
        if (scopes.includes('bookings')) {
          await drop('bookings', () => tx.booking.deleteMany({ where: { businessId: tenantId } }));
          // InvoiceItem cascades from Booking, but an explicit count makes the report complete.
        }
        if (scopes.includes('expenses')) {
          await drop('expenses', () => tx.expense.deleteMany({ where: { businessId: tenantId } }));
        }
        if (scopes.includes('income')) {
          await drop('income', () => tx.income.deleteMany({ where: { businessId: tenantId } }));
        }
        if (scopes.includes('customers')) {
          await drop('customers', () => tx.customer.deleteMany({ where: { businessId: tenantId } }));
        }
        if (scopes.includes('automation')) {
          await drop('automationRules', () => tx.automationRule.deleteMany({ where: { businessId: tenantId } }));
        }
        if (scopes.includes('templates')) {
          await drop('templates', () => tx.messageTemplate.deleteMany({ where: { businessId: tenantId } }));
        }
        if (scopes.includes('audit')) {
          await drop('auditLogs', () => tx.auditLog.deleteMany({ where: { businessId: tenantId } }));
        }

        // ------ 3. Insert in dependency order.
        const presentUserIds = new Set(
          (await tx.user.findMany({ where: { businessId: tenantId }, select: { id: true } })).map((u) => u.id),
        );
        const safeCreator = (raw: unknown): string | null => {
          const id = (raw as { createdBy?: string }).createdBy;
          if (typeof id === 'string' && presentUserIds.has(id)) return id;
          const admins = [...presentUserIds];
          return admins.length > 0 ? (admins[0] as string) : null;
        };

        if (scopes.includes('customers')) {
          const rows = arr('customers');
          for (const row of rows) {
            // Unchecked variants throughout: an archive row is flat scalars plus foreign-key ids,
            // not a nested relation graph. The checked `CreateInput` types demand nested
            // `customer: { create: - }` shapes that cannot exist in a serialised archive.
            await tx.customer.create({
              data: { ...(row as unknown as Prisma.CustomerUncheckedCreateInput), businessId: tenantId },
            });
          }
          inserted.customers = rows.length;
        }

        if (scopes.includes('bookings')) {
          const rows = arr('bookings');
          for (const row of rows) {
            const raw = row as Record<string, unknown>;
            const { invoiceItems, ...rest } = raw;
            const created = await tx.booking.create({
              data: {
                ...(rest as Prisma.BookingUncheckedCreateInput),
                businessId: tenantId,
                // `createdBy` is a Restrict FK: a booking cannot exist without a real creator.
                // Re-point it to the restoring admin when the original author is not resolvable.
                createdBy: safeCreator(raw) ?? user.id,
                ...(presentUserIds.has(raw['updatedBy'] as string) ? {} : { updatedBy: null }),
              } as Prisma.BookingUncheckedCreateInput,
            });
            const items = (invoiceItems ?? []) as Record<string, unknown>[];
            for (const item of items) {
              await tx.invoiceItem.create({
                data: {
                  ...(item as unknown as Prisma.InvoiceItemUncheckedCreateInput),
                  bookingId: created.id,
                },
              });
            }
          }
          inserted.bookings = rows.length;
          const restoredItems = rows.reduce(
            (n: number, r) => n + (((r as { invoiceItems?: unknown[] }).invoiceItems?.length ?? 0) as number),
            0,
          );
          inserted.invoiceItems = restoredItems;
        }

        if (scopes.includes('templates')) {
          const rows = arr('templates');
          for (const row of rows) {
            await tx.messageTemplate.create({
              data: { ...(row as Prisma.MessageTemplateUncheckedCreateInput), businessId: tenantId },
            });
          }
          inserted.templates = rows.length;
        }

        if (scopes.includes('automation')) {
          const rows = arr('automationRules');
          for (const row of rows) {
            await tx.automationRule.create({
              data: { ...(row as Prisma.AutomationRuleUncheckedCreateInput), businessId: tenantId },
            });
          }
          inserted.automationRules = rows.length;
        }

        if (scopes.includes('expenses')) {
          const rows = arr('expenses');
          for (const row of rows) {
            await tx.expense.create({
              data: {
                ...(row as Prisma.ExpenseUncheckedCreateInput),
                businessId: tenantId,
                createdBy: safeCreator(row) ?? user.id,
              } as Prisma.ExpenseUncheckedCreateInput,
            });
          }
          inserted.expenses = rows.length;
        }

        if (scopes.includes('income')) {
          const rows = arr('income');
          for (const row of rows) {
            await tx.income.create({
              data: {
                ...(row as Prisma.IncomeUncheckedCreateInput),
                businessId: tenantId,
                createdBy: safeCreator(row) ?? user.id,
              } as Prisma.IncomeUncheckedCreateInput,
            });
          }
          inserted.income = rows.length;
        }

        if (scopes.includes('documents')) {
          const rows = arr('invoiceDocuments');
          for (const row of rows) {
const raw = row as Record<string, unknown>;
            await tx.invoiceDocument.create({
              data: {
                ...stripBlobColumns(raw),
                businessId: tenantId,
                // Overrides whatever the archive held: the columns arrive base64-encoded and are
                // decoded here, or dropped if the archive had no bytes for this document.
                ...restoreDocumentBlobs(raw),
              } as unknown as Prisma.InvoiceDocumentUncheckedCreateInput,
            });
          }
          inserted.invoiceDocuments = rows.length;
        }

        if (scopes.includes('messages')) {
          const sched = arr('scheduledMessages');
          for (const row of sched) {
            const raw = row as Record<string, unknown>;
            await tx.scheduledMessage.create({
              data: {
                ...(raw as unknown as Prisma.ScheduledMessageUncheckedCreateInput),
                businessId: tenantId,
                // automationRuleId is SetNull-tolerant, but a stale id still violates the FK.
                ...(raw['automationRuleId'] ? {} : { automationRuleId: null }),
              } as unknown as Prisma.ScheduledMessageUncheckedCreateInput,
            });
          }
          inserted.scheduledMessages = sched.length;

          const logs = arr('messageLogs');
          for (const row of logs) {
            const raw = row as Record<string, unknown>;
            await tx.messageLog.create({
              data: {
                ...(raw as unknown as Prisma.MessageLogUncheckedCreateInput),
                businessId: tenantId,
                ...(raw['bookingId'] ? {} : { bookingId: null }),
                ...(raw['scheduledMessageId'] ? {} : { scheduledMessageId: null }),
              } as unknown as Prisma.MessageLogUncheckedCreateInput,
            });
          }
          inserted.messageLogs = logs.length;
        }

        if (scopes.includes('audit')) {
          const rows = arr('auditLogs');
          for (const row of rows) {
            const raw = row as Record<string, unknown>;
            await tx.auditLog.create({
              data: {
                ...(raw as unknown as Prisma.AuditLogUncheckedCreateInput),
                businessId: tenantId,
                // userId is SetNull-tolerant but a dangling id still breaks the insert.
                ...(presentUserIds.has(raw['userId'] as string) ? {} : { userId: null }),
              } as unknown as Prisma.AuditLogUncheckedCreateInput,
            });
          }
          inserted.auditLogs = rows.length;
        }

        // Nothing to merge into: the accumulators are already seeded from the plan above.
      },
      // A large tenant is thousands of rows; the default 5s interactive-transaction timeout is far
      // too short and would abort a restore that was working correctly.
      { timeout: 15 * 60 * 1000, maxWait: 60_000 },
    );

    const durationMs = Date.now() - startedAt;
    this.logger.warn(
      `RESTORE tenant=${tenantId} scopes=${scopes.join(',')} deleted=${JSON.stringify(deleted)} inserted=${JSON.stringify(inserted)} in ${durationMs}ms`,
    );

    await this.audit.log(
      { id: user.id, businessId: user.businessId },
      'BACKUP_RESTORED',
      'Business',
      tenantId,
      {
        scopes,
        deleted,
        inserted,
        usersNeedingPasswordReset: restoreResets.length,
        durationMs,
        // Which PRE_RESTORE archive holds the state we just overwrote. The single most useful
        // field in this entry when someone needs to undo a bad restore.
        safetyBackupRunId: options.safetyBackupRunId ?? null,
      },
    );

    return {
      restored: true,
      tenantId,
      scopes,
      deleted,
      inserted,
      usersNeedingPasswordReset: restoreResets,
      warnings: restoreWarnings,
      durationMs,
      safetyBackupRunId: options.safetyBackupRunId ?? null,
    };
  }
}

/** Columns that arrive base64-encoded in an archive and must not be spread through as-is. */
const BLOB_COLUMNS = ['pdf', 'payload'] as const;

/**
 * Removes the encoded blob columns so they cannot reach Prisma as strings. The spread that copies
 * the archived row into `create()` would otherwise try to write the base64 text into a `Bytes`
 * column.
 */
function stripBlobColumns(row: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...row };
  for (const column of BLOB_COLUMNS) delete copy[column];
  return copy;
}

/**
 * Decodes an archived `InvoiceDocument`'s blobs back to bytes.
 *
 * Two cases, distinguished by whether the archive held any bytes:
 *
 *   - Bytes present: restored as stored, with `prunedAt: null`, so the invoice becomes
 *     downloadable again.
 *   - No bytes: either the retention sweep had already pruned it, or the archive predates PDF
 *     capture. Either way there is nothing to restore, so the row keeps its compliance metadata
 *     but is written as pruned. Restoring it as an empty blob that later decompresses to garbage
 *     would be worse than an honest "gone", and writing a zero-length PDF that a download serves
 *     as a corrupt file is exactly what the storage layer refuses to do.
 */
function restoreDocumentBlobs(row: Record<string, unknown>): Record<string, unknown> {
  const pdf = decodeArchivedBytes(row['pdf']);
  const payload = decodeArchivedBytes(row['payload']) ?? Buffer.alloc(0);
  const payloadStoredBytes = payload.byteLength;
  const payloadRawBytes =
    typeof row['payloadRawBytes'] === 'number' ? row['payloadRawBytes'] : payloadStoredBytes;

  if (!pdf) {
    return {
      pdf: Buffer.alloc(0),
      storedBytes: 0,
      rawBytes: typeof row['rawBytes'] === 'number' ? row['rawBytes'] : 0,
      payload,
      payloadRawBytes,
      payloadStoredBytes,
      prunedAt: row['prunedAt'] ? new Date(String(row['prunedAt'])) : new Date(),
    };
  }

  return {
    pdf,
    // byte counts are recomputed from what actually arrived; the archived values described the
    // source database's encoding, not this row.
    storedBytes: pdf.byteLength,
    rawBytes: typeof row['rawBytes'] === 'number' ? row['rawBytes'] : pdf.byteLength,
    payload,
    payloadRawBytes,
    payloadStoredBytes,
    // Cleared because the document is present again.
    prunedAt: null,
  };
}

function decodeArchivedBytes(value: unknown): Buffer | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const buf = Buffer.from(value, 'base64');
  return buf.byteLength === 0 ? null : buf;
}

