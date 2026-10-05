import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BackupStatus, BackupTrigger, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/current-user.decorator';
import { Permission, roleHas, type PermissionKey } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { createDriveClientFromEnv, sha256Hex } from './google-drive.service-account';
import {
  DriveFacade,
  facadeForOAuth,
  facadeForServiceAccount,
} from './drive-facade';
import { DriveDestinationService, isCredentialFailure } from './drive-destination.service';
import { DriveQuota } from './google-drive-oauth';

/**
 * Server-side backups, archived to a Google Drive folder owned by a service account.
 *
 * WHAT THIS REPLACES
 *
 * There were three backup paths and none of them were backups:
 *
 *   1. `GET /storage/backup/export` streamed a JSON body to the browser and discarded it.
 *   2. A client-side Firestore export produced a *silently empty* archive on any error while
 *      reporting success.
 *   3. `lib/google-drive.ts` uploaded from the browser using a user's personal OAuth token, and on
 *      failure fell through to a local download while rendering "Actually Saved to Google Drive!
 *      Verified / Cloud Verification: Confirmed in Drive".
 *
 * Nothing was scheduled, nothing was retained, and there was no way to answer "do we have a usable
 * backup from last Tuesday?".
 *
 * WHAT THIS DOES INSTEAD
 *
 *   - Runs unattended on a schedule (see `registerScheduler`).
 *   - Writes to a service-account Drive folder, so no browser and no individual account is involved.
 *   - Records every attempt in `BackupRun`, including failures, with row counts and a checksum.
 *   - Refuses to start when Drive is unconfigured, instead of pretending to succeed.
 */

const FILE_PREFIX = 'flyconnect-backup';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  /**
   * Whichever credential is active.
   *
   * A connected Google account wins over the environment's service account. It has to: a service
   * account has no Drive storage quota, so on a personal (non-Workspace) install the service-account
   * path can create file metadata but can never upload an archive. Preferring it would mean a
   * configured-looking destination that cannot actually save anything.
   */
  private drive: DriveFacade;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly destinations?: DriveDestinationService,
  ) {
    this.drive = this.resolveDrive();
  }

  private resolveDrive(): DriveFacade {
    const oauth = this.destinations?.client();
    if (oauth) {
      // The account address is recorded at connect time, so it is available synchronously here
      // instead of costing a Drive round-trip on every status render.
      const summary = this.destinations?.summarySync();
      return facadeForOAuth(oauth, summary?.accountEmail ?? '');
    }
    return facadeForServiceAccount(createDriveClientFromEnv());
  }

  /**
   * Re-reads the active destination.
   *
   * Called after connecting or disconnecting a Google account, and after a credential failure, so a
   * change takes effect without a redeploy.
   */
  async reloadDriveClient(): Promise<void> {
    await this.destinations?.load();
    this.drive = this.resolveDrive();
  }

  private assertCan(user: AuthUser, permission: PermissionKey): void {
    if (!roleHas(user.role, permission)) {
      throw new ForbiddenException({
        message: `Backups require the ${permission} permission`,
        code: 'INSUFFICIENT_PERMISSION',
      });
    }
  }

  /** Whether archives can actually be written right now, and why not if they cannot. */
  destinationStatus(): {
    configured: boolean;
    reachable: boolean;
    serviceAccountEmail: string;
    folderId?: string;
    detail?: string;
  } {
    const configured = this.drive.isConfigured();
    return {
      configured,
      reachable: false,
      serviceAccountEmail: this.drive.email,
      folderId: this.drive.folderId,
      detail: configured
        ? undefined
        : 'Set GOOGLE_SERVICE_ACCOUNT_JSON (or the key path/email) and GOOGLE_DRIVE_FOLDER_ID',
    };
  }

  /**
   * Live credential check. The previous UI claimed "Cloud Verification: Confirmed in Drive"
   * without ever asking Drive, which is why it reported success on a failed upload.
   */
  async verifyDestination(user: AuthUser): Promise<ReturnType<BackupService['destinationStatus']> & { verifiedAt: string }> {
    this.assertCan(user, Permission.BACKUP_CONFIGURE);
    const base = this.destinationStatus();
    const result = await this.drive.verifyAccess();
    return {
      ...base,
      reachable: result.ok,
      detail: result.detail ?? base.detail,
      verifiedAt: new Date().toISOString(),
    };
  }

  /**
   * Live storage figures for the backup console.
   *
   * TWO NUMBERS, DELIBERATELY KEPT SEPARATE
   *
   *   - `drive` is what Google says the account holds. It is shared with Gmail and Photos, so it is
   *     NOT FlyConnect's usage and must never be presented as such.
   *   - `flyconnect` is the sum of `BackupRun.sizeBytes`, i.e. what this application actually wrote.
   *
   * Reporting only the first would make an operator watching to decide when to buy storage act on
   * a number that includes their mail. Reporting only the second would hide the thing that actually
   * fills a Drive.
   *
   * Both are real. When Drive will not say, `drive` comes back `live: false` and the console shows
   * "unavailable" rather than a fabricated figure - the failure mode of the old browser quota code.
   */
  async storageUsage(user: AuthUser): Promise<{
    drive: DriveQuota | null;
    flyconnect: {
      totalBytes: number;
      archiveCount: number;
      liveArchiveCount: number;
      lastSuccessAt: string | null;
    };
  }> {
    // Platform-owner only. The Drive figure describes the operator's personal account, so a tenant
    // admin has no business seeing it.
    this.assertCan(user, Permission.BACKUP_VIEW);

    const [drive, totals] = await Promise.all([
      this.drive.quota(),
      this.prisma.backupRun.aggregate({
        where: { status: BackupStatus.SUCCEEDED },
        _sum: { sizeBytes: true },
        _count: { _all: true },
      }),
    ]);

    const [liveCount, lastSuccess] = await Promise.all([
      this.prisma.backupRun.count({ where: { status: BackupStatus.SUCCEEDED, driveFileId: { not: null } } }),
      this.prisma.backupRun.findFirst({
        where: { status: BackupStatus.SUCCEEDED },
        orderBy: { finishedAt: 'desc' },
        select: { finishedAt: true },
      }),
    ]);

    return {
      drive,
      flyconnect: {
        totalBytes: Number(totals._sum.sizeBytes ?? 0),
        archiveCount: totals._count._all,
        // A SUCCEEDED run with no Drive id is inconsistent, and `chk_backup_run_completeness`
        // normally prevents it. Counted separately so a regression shows up in the panel rather
        // than being quietly folded into the totals.
        liveArchiveCount: liveCount,
        lastSuccessAt: lastSuccess?.finishedAt ? lastSuccess.finishedAt.toISOString() : null,
      },
    };
  }

  /**
   * Archives one tenant, or every tenant when `businessId` is omitted.
   *
   * Returns the finished runs rather than streaming, so a multi-tenant run reports per-tenant
   * outcomes instead of one aggregate success that hides a single failure.
   */
  async runBackup(
    actor: AuthUser | null,
    options: { businessId?: string; trigger?: BackupTrigger } = {},
  ): Promise<BackupRunResult[]> {
    const trigger = options.trigger ?? BackupTrigger.MANUAL;
    if (actor) this.assertCan(actor, Permission.BACKUP_CREATE);

    if (!this.drive.isConfigured()) {
      // Fail loudly. Writing "success" with no artefact would recreate the exact lie the old
      // client-side flow told.
      throw new BadRequestException({
        message:
          'No backup destination is configured. Set GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_DRIVE_FOLDER_ID, then verify the connection.',
        code: 'BACKUP_DESTINATION_UNCONFIGURED',
      });
    }

    const businessIds = options.businessId
      ? [options.businessId]
      : (await this.prisma.business.findMany({ select: { id: true } })).map((b) => b.id);

    if (businessIds.length === 0) {
      throw new BadRequestException({ message: 'No tenants to back up', code: 'NO_TENANTS' });
    }

    const results: BackupRunResult[] = [];
    for (const businessId of businessIds) {
      results.push(await this.runOne(businessId, trigger, actor?.id ?? null));
    }

    const failed = results.filter((r) => r.status === BackupStatus.FAILED);
    if (failed.length > 0) {
      this.logger.error(
        `${failed.length}/${results.length} backup(s) failed: ${failed
          .map((f) => `${f.businessId}: ${f.errorMessage}`)
          .join('; ')}`,
      );
    }
    return results;
  }

  private async runOne(
    businessId: string,
    trigger: BackupTrigger,
    triggeredById: string | null,
  ): Promise<BackupRunResult> {
    const run = await this.prisma.backupRun.create({
      data: { businessId, trigger, status: BackupStatus.RUNNING, triggeredById },
    });

    try {
      const archive = await this.storage.exportBusinessBackup(businessId);
      // JSON.stringify then Buffer: the archive contains Dates and Buffers that must be
      // serialised deterministically before they can be checksummed.
      const body = Buffer.from(JSON.stringify(archive, null, 0), 'utf8');
      const digest = sha256Hex(body);
      const fileName = `${FILE_PREFIX}-${businessId}-${archive.exportedAt.replace(/[:.]/g, '-')}.json`;

      const uploaded = await this.drive.upload(fileName, body, 'application/json');

      const finished = await this.prisma.backupRun.update({
        where: { id: run.id },
        data: {
          status: BackupStatus.SUCCEEDED,
          finishedAt: new Date(),
          format: 'json',
          fileName,
          driveFileId: uploaded.id,
          driveWebViewLink: uploaded.webViewLink,
          sizeBytes: BigInt(uploaded.size),
          sha256: digest,
          recordCounts: (archive.counts ?? {}) as Prisma.InputJsonValue,
        },
      });

      this.logger.log(`Backup ${run.id} for ${businessId}: ${uploaded.size} bytes -> Drive ${uploaded.id}`);
      if (triggeredById) {
        await this.audit.log(
          { id: triggeredById, businessId },
          'BACKUP_SUCCEEDED',
          'BackupRun',
          run.id,
          { sizeBytes: uploaded.size, counts: archive.counts },
        );
      }

      return this.toResult(finished);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // A broken credential is a different problem from a transient one, and needs a different
      // response from the operator. Recording FAILED either way is correct, but when the grant
      // itself is dead the console is also told, so the cause shows up in the UI instead of only
      // being rediscovered from a run of unexplained failures.
      if (isCredentialFailure(err)) {
        this.logger.error(
          `The Drive destination credential is not usable (${message}). Marked as needing reconnection.`,
        );
        await this.destinations?.markBroken(message);
      }

      const failed = await this.prisma.backupRun.update({
        where: { id: run.id },
        data: { status: BackupStatus.FAILED, finishedAt: new Date(), errorMessage: message.slice(0, 1000) },
      });
      this.logger.error(`Backup ${run.id} for ${businessId} failed: ${message}`);
      return this.toResult(failed);
    }
  }

  /** Run history, newest first. */
  async listRuns(
    user: AuthUser,
    opts: { businessId?: string; status?: string; limit?: number } = {},
  ): Promise<{ items: BackupRunResult[]; total: number }> {
    this.assertCan(user, Permission.BACKUP_VIEW);
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));

    const where: Prisma.BackupRunWhereInput = {
      ...(opts.businessId ? { businessId: opts.businessId } : {}),
      ...(opts.status && opts.status !== 'ALL' ? { status: opts.status as BackupStatus } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.backupRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: limit,
        include: { business: { select: { id: true, name: true } } },
      }),
      this.prisma.backupRun.count({ where }),
    ]);

    return { items: items.map((r) => ({ ...this.toResult(r), businessName: r.business?.name ?? null })), total };
  }

  /**
   * Coverage summary.
   *
   * Answers the question the old system could not: is every tenant actually covered by a recent
   * successful archive? A tenant with no successful run is called out explicitly rather than
   * being inferred from a total count.
   */
  async coverage(user: AuthUser): Promise<{
    tenants: number;
    covered: number;
    uncovered: Array<{ businessId: string; name: string; lastSuccessAt: string | null }>;
    oldestSuccessAt: string | null;
  }> {
    this.assertCan(user, Permission.BACKUP_VIEW);

    const businesses = await this.prisma.business.findMany({ select: { id: true, name: true } });
    const successes = await this.prisma.backupRun.findMany({
      where: { status: BackupStatus.SUCCEEDED },
      select: { businessId: true, finishedAt: true },
      orderBy: { finishedAt: 'desc' },
    });

    const latest = new Map<string, Date>();
    for (const s of successes) {
      if (!s.businessId || !s.finishedAt) continue;
      const current = latest.get(s.businessId);
      if (!current || s.finishedAt > current) latest.set(s.businessId, s.finishedAt);
    }

    const uncovered = businesses
      .filter((b) => !latest.has(b.id))
      .map((b) => ({ businessId: b.id, name: b.name, lastSuccessAt: null }));

    const allDates = [...latest.values()];

    return {
      tenants: businesses.length,
      covered: businesses.length - uncovered.length,
      uncovered,
      oldestSuccessAt: allDates.length
        ? new Date(Math.min(...allDates.map((d) => d.getTime()))).toISOString()
        : null,
    };
  }

  async getRun(user: AuthUser, id: string): Promise<BackupRunResult> {
    this.assertCan(user, Permission.BACKUP_VIEW);
    const run = await this.prisma.backupRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException({ message: 'Backup run not found', code: 'BACKUP_NOT_FOUND' });
    return this.toResult(run);
  }

  /** Streams an archive down as a file attachment. */
  async downloadRun(user: AuthUser, id: string): Promise<{ buffer: Buffer; fileName: string }> {
    this.assertCan(user, Permission.BACKUP_DOWNLOAD);
    const run = await this.getRun(user, id);
    if (run.status !== BackupStatus.SUCCEEDED || !run.driveFileId) {
      throw new BadRequestException({
        message: 'This run produced no archive to download',
        code: 'BACKUP_NOT_DOWNLOADABLE',
      });
    }
    const buffer = await this.drive.download(run.driveFileId);
    return { buffer, fileName: run.fileName ?? `${FILE_PREFIX}-${id}.json` };
  }

  /**
   * Deletes the archive from Drive and marks the run as superseded.
   *
   * The row is kept rather than deleted: the history of what existed and when it was removed is
   * itself part of the audit story.
   */
  async deleteRun(user: AuthUser, id: string): Promise<{ deleted: boolean }> {
    this.assertCan(user, Permission.BACKUP_DELETE);
    const run = await this.getRun(user, id);
    if (run.driveFileId) {
      await this.drive.remove(run.driveFileId);
    }
    await this.prisma.backupRun.update({
      where: { id },
      data: { status: BackupStatus.SKIPPED, errorMessage: 'Deleted by platform owner', driveFileId: null },
    });
    await this.audit.log(
      { id: user.id, businessId: user.businessId },
      'BACKUP_DELETED',
      'BackupRun',
      id,
      { fileName: run.fileName },
    );
    return { deleted: true };
  }

  private toResult(run: {
    id: string;
    businessId: string | null;
    trigger: BackupTrigger;
    status: BackupStatus;
    format: string;
    fileName: string | null;
    driveFileId: string | null;
    driveWebViewLink: string | null;
    sizeBytes: bigint | null;
    sha256: string | null;
    recordCounts: unknown;
    startedAt: Date;
    finishedAt: Date | null;
    errorMessage: string | null;
    triggeredById: string | null;
  }): BackupRunResult {
    return {
      id: run.id,
      businessId: run.businessId,
      trigger: run.trigger,
      status: run.status,
      format: run.format,
      fileName: run.fileName,
      driveFileId: run.driveFileId,
      driveWebViewLink: run.driveWebViewLink,
      sizeBytes: run.sizeBytes === null ? null : Number(run.sizeBytes),
      sha256: run.sha256,
      recordCounts: (run.recordCounts ?? null) as Record<string, number> | null,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
      errorMessage: run.errorMessage,
      triggeredById: run.triggeredById,
    };
  }
}

export interface BackupRunResult {
  id: string;
  businessId: string | null;
  businessName?: string | null;
  trigger: BackupTrigger;
  status: BackupStatus;
  format: string;
  fileName: string | null;
  driveFileId: string | null;
  driveWebViewLink: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  recordCounts: Record<string, number> | null;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  triggeredById: string | null;
}
