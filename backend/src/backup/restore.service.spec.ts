import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/current-user.decorator';
import { sha256Hex } from './google-drive.service-account';
import { ALL_SCOPES, RestoreService } from './restore.service';
import { StorageService } from '../storage/storage.service';
import { compressJson, compressPdf } from '../storage/pdf-compression';

/** Minimal Prisma double covering only what `exportTenant` touches. */
function storagePrisma(document: Record<string, unknown>) {
  const none = async () => [];
  const one = async () => null;
  return {
    business: { findUnique: one },
    businessSetting: { findUnique: one },
    user: { findMany: none },
    customer: { findMany: none },
    booking: { findMany: none },
    expense: { findMany: none },
    income: { findMany: none },
    messageTemplate: { findMany: none },
    automationRule: { findMany: none },
    whatsAppAccount: { findMany: none },
    auditLog: { findMany: none },
    invoiceDocument: { findMany: async () => [{ id: 'doc-1', bookingId: 'bk-1', invoiceNumber: 'INV-1', sha256: 'abc', rawBytes: 10, storedBytes: 5, prunedAt: null, createdAt: new Date(0), ...document }] },
    scheduledMessage: { findMany: none },
    messageLog: { findMany: none },
  };
}

/**
 * Restore safety.
 *
 * Restore replaces a tenant's live data. The tests below pin the properties that make that
 * survivable, and each one corresponds to a way a restore can go wrong:
 *
 *   - a corrupted or foreign archive must be refused, not half-applied
 *   - a dangling reference must block the restore rather than fail midway through
 *   - the confirmation phrase must actually be required
 *   - passwords must never be restorable from an archive
 *   - scope dependencies must be pulled in automatically, because a booking without its customer
 *     violates a Restrict foreign key
 */

const SUPER_ADMIN: AuthUser = {
  id: 'admin-1',
  businessId: 'biz-1',
  email: 'owner@example.com',
  name: 'Owner',
  role: 'SUPER_ADMIN',
} as AuthUser;

const ADMIN: AuthUser = { ...SUPER_ADMIN, id: 'admin-2', role: 'ADMIN' } as AuthUser;

function archive(overrides: Record<string, unknown> = {}) {
  // `data` is typed loosely on purpose: the tests below deliberately feed malformed and hostile
  // shapes (dangling ids, a planted passwordHash) that the real archive builder would never emit,
  // and that is exactly what the integrity checks exist to catch.
  const data: Record<string, unknown[]> = {
    business: [{ id: 'biz-1', name: 'Agency' }] as unknown as Record<string, unknown>[],
    users: [{ id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'ADMIN', status: 'ACTIVE' }],
    customers: [{ id: 'cust-1', name: 'Ravi', phone: '+971500000001', status: 'ACTIVE' }],
    bookings: [
      {
        id: 'book-1',
        customerId: 'cust-1',
        createdBy: 'user-1',
        pnr: 'ABC123',
        invoiceItems: [{ id: 'item-1', description: 'Flight', amount: 100 }],
      },
    ],
    expenses: [],
    income: [],
    templates: [],
    automationRules: [],
    scheduledMessages: [],
    messageLogs: [],
    invoiceDocuments: [],
    auditLogs: [],
  };

  return {
    appName: 'FlyConnect',
    version: '2.0.0',
    exportedAt: '2026-10-01T00:00:00.000Z',
    businessId: 'biz-1',
    counts: {},
    data,
    ...overrides,
  };
}

function bufferFor(obj: unknown): Buffer {
  return Buffer.from(JSON.stringify(obj), 'utf8');
}

/** Records every Prisma call so ordering and scoping can be asserted. */
function makePrisma(overrides: Record<string, unknown> = {}) {
  const calls: Array<{ op: string; args: unknown }> = [];
  const track =
    <T>(op: string, result: T) =>
    async (args: unknown) => {
      calls.push({ op, args });
      return result;
    };

  const base: Record<string, unknown> = {
    business: {
      findUnique: jest.fn(track('business.findUnique', { id: 'biz-1', name: 'Agency' })),
    },
    user: {
      findMany: jest.fn(track('user.findMany', [{ id: 'user-1', email: 'alice@example.com' }])),
      findUnique: jest.fn(track('user.findUnique', null)),
      create: jest.fn(track('user.create', {})),
      update: jest.fn(track('user.update', {})),
    },
    customer: {
      findMany: jest.fn(track('customer.findMany', [])),
      count: jest.fn(track('customer.count', 0)),
      deleteMany: jest.fn(track('customer.deleteMany', { count: 0 })),
      create: jest.fn(track('customer.create', {})),
    },
    booking: {
      count: jest.fn(track('booking.count', 0)),
      deleteMany: jest.fn(track('booking.deleteMany', { count: 0 })),
      create: jest.fn(track('booking.create', { id: 'book-1' })),
    },
    invoiceItem: { create: jest.fn(track('invoiceItem.create', {})) },
    expense: { count: jest.fn(track('expense.count', 0)), deleteMany: jest.fn(track('expense.deleteMany', { count: 0 })), create: jest.fn(track('expense.create', {})) },
    income: { count: jest.fn(track('income.count', 0)), deleteMany: jest.fn(track('income.deleteMany', { count: 0 })), create: jest.fn(track('income.create', {})) },
    messageTemplate: { findMany: jest.fn(track('template.findMany', [])), count: jest.fn(track('template.count', 0)), deleteMany: jest.fn(track('template.deleteMany', { count: 0 })), create: jest.fn(track('template.create', {})) },
    automationRule: { count: jest.fn(track('rule.count', 0)), deleteMany: jest.fn(track('rule.deleteMany', { count: 0 })), create: jest.fn(track('rule.create', {})) },
    scheduledMessage: { count: jest.fn(track('sched.count', 0)), deleteMany: jest.fn(track('sched.deleteMany', { count: 0 })), create: jest.fn(track('sched.create', {})) },
    messageLog: { count: jest.fn(track('log.count', 0)), deleteMany: jest.fn(track('log.deleteMany', { count: 0 })), create: jest.fn(track('log.create', {})) },
    invoiceDocument: { count: jest.fn(track('doc.count', 0)), deleteMany: jest.fn(track('doc.deleteMany', { count: 0 })), create: jest.fn(track('doc.create', {})) },
    auditLog: { count: jest.fn(track('audit.count', 0)), deleteMany: jest.fn(track('audit.deleteMany', { count: 0 })), create: jest.fn(track('audit.create', {})) },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(overrides['__tx'] ?? prisma)),
    ...overrides,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma = base as any;
  prisma.__calls = calls;
  return prisma;
}

function makeService(prisma: unknown = makePrisma()) {
  const audit = { log: jest.fn(async () => undefined) };
  const service = new RestoreService(prisma as never, audit as unknown as AuditService);
  return { service, prisma, audit, calls: (prisma as { __calls: Array<{ op: string; args: unknown }> }).__calls };
}

describe('invoice blob budget', () => {
  /** Three documents, each carrying a PDF of `size` compressed bytes. */
  function docsOfSize(size: number, count = 3) {
    return Array.from({ length: count }, (_, i) => ({
      id: `doc-${i}`,
      bookingId: 'bk-1',
      invoiceNumber: `INV-${i}`,
      sha256: `sha-${i}`,
      createdAt: new Date(i * 1000),
      pdf: Buffer.alloc(size, 1),
      payload: Buffer.from('payload'),
    }));
  }

  function exportWith(
    docs: Array<Record<string, unknown>>,
    maxBlobBytes?: number,
  ): Promise<{ data: { invoiceDocuments: Array<Record<string, unknown>> }; invoiceBlobs?: { included: number; skippedForBudget: number; budgetBytes: number } }> {
    const prisma = {
      business: { findUnique: async () => null },
      businessSetting: { findUnique: async () => null },
      user: { findMany: async () => [] },
      customer: { findMany: async () => [] },
      booking: { findMany: async () => [] },
      expense: { findMany: async () => [] },
      income: { findMany: async () => [] },
      messageTemplate: { findMany: async () => [] },
      automationRule: { findMany: async () => [] },
      whatsAppAccount: { findMany: async () => [] },
      auditLog: { findMany: async () => [] },
      invoiceDocument: { findMany: async () => docs },
      scheduledMessage: { findMany: async () => [] },
      messageLog: { findMany: async () => [] },
    };
    return new StorageService(prisma as never).exportBusinessBackup(
      'b-1',
      maxBlobBytes === undefined ? {} : { maxBlobBytes },
    ) as never;
  }

  it('caps the encoded blob total at the budget', async () => {
    // Base64 of `size` bytes is ceil(size/3)*4. A budget of 400 admits 100-byte docs (136 chars
    // each) but not three of them.
    const archive = await exportWith(docsOfSize(100, 3), 400);
    const encodedSizes = archive.data.invoiceDocuments.map(
      (d) => (d['pdf'] as string | null)?.length ?? 0,
    );
    const total = encodedSizes.reduce((a, b) => a + b, 0);

    expect(total).toBeLessThanOrEqual(400);
    // And it actually kept some, rather than dropping everything.
    expect(archive.invoiceBlobs?.included).toBeGreaterThan(0);
  });

  it('reports skipped documents rather than dropping them silently', async () => {
    const archive = await exportWith(docsOfSize(100, 3), 400);

    const blobs = archive.invoiceBlobs;
    expect(blobs?.skippedForBudget).toBeGreaterThan(0);
    // Every document is accounted for: either carried or explicitly skipped. A document that was
    // dropped without being counted would make the archive's own numbers a lie.
    expect((blobs?.included ?? 0) + (blobs?.skippedForBudget ?? 0)).toBe(3);
  });

  it('marks a budget-skipped document as pruned, so restore cannot serve a corrupt PDF', async () => {
    const archive = await exportWith(docsOfSize(100, 3), 400);

    const skipped = archive.data.invoiceDocuments.filter((d) => d['pdf'] === null);
    expect(skipped.length).toBeGreaterThan(0);
    for (const doc of skipped) {
      expect(doc['prunedAt']).toBeInstanceOf(Date);
    }
  });

  it('always keeps the compliance payload, even when the PDF is dropped', async () => {
    // The payload is the record of what was issued. Losing it to save space would be the wrong
    // trade, and it is small next to a PDF.
    const archive = await exportWith(docsOfSize(100, 3), 400);

    for (const doc of archive.data.invoiceDocuments) {
      expect(typeof doc['payload']).toBe('string');
    }
  });

  it('tells the operator through a preview warning', async () => {
    // The warning is the only thing standing between a successful-looking restore and a customer
    // asking where their invoice went.
    const archive = await exportWith(docsOfSize(100, 3), 400);
    const { service } = makeService();

    const plan = await service.preview(SUPER_ADMIN, bufferFor(archive), null, ALL_SCOPES);

    expect(plan.warnings.join(' ')).toMatch(/did not include the PDF/);
  });

  it('warns about nothing when the archive is within budget', async () => {
    const archive = await exportWith(docsOfSize(10, 2), 10_000);
    const { service } = makeService();

    const plan = await service.preview(SUPER_ADMIN, bufferFor(archive), null, ALL_SCOPES);

    expect(plan.warnings.join(' ')).not.toMatch(/did not include the PDF/);
  });
});

describe('invoice document export', () => {
  // The archive is the only copy of an issued invoice once it has been pruned, so what
  // `exportTenant` writes has to be losslessly decodable. Asserting on the JSON is the only way to
  // catch a `Uint8Array` sneaking into the archive as one JSON number per byte.
  it('base64-encodes the PDF and payload rather than serialising raw bytes', async () => {
    // A realistic document. The compression ratios quoted elsewhere in this codebase were measured
    // on a real invoice (10592 B raw against 1681 B compressed), so use that scale rather than a
    // toy input - on a few bytes the comparison below would not be meaningful.
    const raw = Buffer.from(`%PDF-1.4\n${'invoice line item '.repeat(700)}\n%%EOF`);
    const pdf = compressPdf(raw);
    const payload = compressJson({ items: Array.from({ length: 40 }, (_, i) => ({ n: i, total: i * 31 })) });

    const service = new StorageService(
      storagePrisma({ pdf: Buffer.from(pdf.bytes), payload: Buffer.from(payload.bytes) }) as never,
    );

    const archive = (await service.exportBusinessBackup('b-1')) as {
      data: { invoiceDocuments: Array<Record<string, unknown>> };
    };
    const doc = archive.data.invoiceDocuments[0];

    // Round-trips back to the exact stored bytes.
    expect(Buffer.from(doc['pdf'] as string, 'base64').equals(Buffer.from(pdf.bytes))).toBe(true);
    expect(Buffer.from(doc['payload'] as string, 'base64').equals(Buffer.from(payload.bytes))).toBe(true);

    // The failure this guards against: a `Uint8Array` written straight into JSON becomes
    // `{"0":31,"1":139,...}`, one JSON number per byte, which is both unreadable and larger than
    // the original PDF. Compare against that cost explicitly.
    const asByteObject = JSON.stringify({
      pdf: Object.fromEntries([...pdf.bytes].map((b: number, i: number) => [i, b])),
      payload: Object.fromEntries([...payload.bytes].map((b: number, i: number) => [i, b])),
    });
    expect(JSON.stringify(doc).length).toBeLessThan(asByteObject.length / 4);
  });

  it('records a pruned document as null bytes, distinguishable from an empty PDF', async () => {
    // Pruning writes a zero-length blob. Null means "no document was ever retained", which the
    // restore path treats differently from bytes that failed to decode.
    const prisma = storagePrisma({ pdf: Buffer.alloc(0), payload: Buffer.alloc(0) });
    const service = new StorageService(prisma as never);

    const archive = (await service.exportBusinessBackup('b-1')) as {
      data: { invoiceDocuments: Array<Record<string, unknown>> };
    };
    const doc = archive.data.invoiceDocuments[0];

    expect(doc['pdf']).toBeNull();
    expect(doc['payload']).toBeNull();
    // The compliance record is kept even with no bytes.
    expect(doc['sha256']).toBe('abc');
  });
});

describe('RestoreService', () => {
  describe('authorization', () => {
    it('refuses a tenant administrator', async () => {
      const { service } = makeService();
      await expect(service.preview(ADMIN, bufferFor(archive()), null, ALL_SCOPES)).rejects.toThrow(
        /backup:restore permission/,
      );
    });

    it('answers an unauthorised restore with 403, not 400', async () => {
      // A frontend distinguishes "you may not do this" (403, show nothing) from "your request was
      // malformed" (400, show a form error). Returning 400 for a permissions problem tells the
      // operator their upload was bad when in fact their role was.
      const { service } = makeService();
      const err = await service
        .preview(ADMIN, bufferFor(archive()), null, ALL_SCOPES)
        .then(() => null)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ForbiddenException);
      const response = (err as ForbiddenException).getResponse() as { code?: string };
      expect(response.code).toBe('INSUFFICIENT_PERMISSION');
    });

    it('allows the platform owner', async () => {
      const { service } = makeService();
      const plan = await service.preview(SUPER_ADMIN, bufferFor(archive()), null, ALL_SCOPES);
      expect(plan.tenantId).toBe('biz-1');
    });
  });

  describe('archive integrity', () => {
    it('accepts an archive whose bytes match the recorded checksum', async () => {
      // The mismatch test above proves tampering is caught. This proves the opposite, and it is the
      // path every real restore takes: the operator downloads the file we wrote, we re-hash the
      // bytes we actually received, and it agrees. If this ever regressed, every genuine restore
      // would be rejected and the tamper test above would keep passing happily.
      const { service } = makeService();
      const bytes = bufferFor(archive());

      const plan = await service.preview(SUPER_ADMIN, bytes, sha256Hex(bytes), ALL_SCOPES);

      expect(plan.checksumMatches).toBe(true);
      expect(plan.blockers).toEqual([]);
    });

    it('rejects a checksum mismatch rather than restoring altered data', async () => {
      const { service } = makeService();
      await expect(
        service.preview(SUPER_ADMIN, bufferFor(archive()), 'deadbeef'.repeat(8), ALL_SCOPES),
      ).rejects.toThrow(/checksum does not match/);
    });

    it('rejects a non-JSON file', async () => {
      const { service } = makeService();
      await expect(
        service.preview(SUPER_ADMIN, Buffer.from('not json at all'), null, ALL_SCOPES),
      ).rejects.toThrow(/not valid JSON/);
    });

    it('rejects a JSON file that is not one of our archives', async () => {
      const { service } = makeService();
      await expect(
        service.preview(SUPER_ADMIN, bufferFor({ hello: 'world' }), null, ALL_SCOPES),
      ).rejects.toThrow(/not a FlyConnect backup archive/);
    });

    it('blocks an archive whose tenant no longer exists', async () => {
      const prisma = makePrisma({ business: { findUnique: jest.fn(async () => null) } });
      const { service } = makeService(prisma);
      const plan = await service.preview(SUPER_ADMIN, bufferFor(archive()), null, ALL_SCOPES);
      expect(plan.blockers.join(' ')).toMatch(/no longer exists/);
    });

    it('warns rather than blocks on an old-format archive', async () => {
      const { service } = makeService();
      const plan = await service.preview(SUPER_ADMIN, bufferFor(archive({ version: '1.0.0' })), null, ALL_SCOPES);
      expect(plan.blockers).toHaveLength(0);
      expect(plan.warnings.join(' ')).toMatch(/predates/);
    });
  });

  describe('referential integrity', () => {
    it('blocks a booking whose creator exists in neither the archive nor the live team', async () => {
      const { service } = makeService();
      const bad = archive();
      bad.data.bookings = [{ id: 'b', customerId: 'cust-1', createdBy: 'ghost-user' }];
      const plan = await service.preview(SUPER_ADMIN, bufferFor(bad), null, ALL_SCOPES);
      expect(plan.blockers.join(' ')).toMatch(/reference a creator/);
    });

    it('blocks a booking whose customer is missing everywhere', async () => {
      const { service } = makeService();
      const bad = archive();
      bad.data.bookings = [{ id: 'b', customerId: 'ghost-customer', createdBy: 'user-1' }];
      const plan = await service.preview(SUPER_ADMIN, bufferFor(bad), null, ALL_SCOPES);
      expect(plan.blockers.join(' ')).toMatch(/reference a customer/);
    });

    it('blocks a scheduled message whose template is missing (Restrict FK)', async () => {
      const { service } = makeService();
      const bad = archive();
      bad.data.scheduledMessages = [{ id: 'm', templateId: 'ghost-template', bookingId: 'book-1', customerId: 'cust-1' }];
      const plan = await service.preview(SUPER_ADMIN, bufferFor(bad), null, ALL_SCOPES);
      expect(plan.blockers.join(' ')).toMatch(/reference a template/);
    });

    it('does not block when the referenced rows are present', async () => {
      const { service } = makeService();
      const plan = await service.preview(SUPER_ADMIN, bufferFor(archive()), null, ALL_SCOPES);
      expect(plan.blockers).toEqual([]);
    });
  });

  describe('scopes', () => {
    it('pulls in dependencies automatically so Restrict FKs are satisfied', async () => {
      const { service } = makeService();
      // Only bookings requested; customers and templates must be added by resolveScopes.
      const plan = await service.preview(SUPER_ADMIN, bufferFor(archive()), null, ['messages']);
      expect(plan.scopes).toContain('messages');
      expect(plan.scopes).toContain('customers');
      expect(plan.scopes).toContain('templates');
      expect(plan.scopes).toContain('bookings');
    });

    it('rejects an unknown scope instead of silently ignoring it', async () => {
      const { service } = makeService();
      await expect(
        service.preview(SUPER_ADMIN, bufferFor(archive()), null, ['everything'] as never),
      ).rejects.toThrow(/Unknown restore scope/);
    });

    it('reports what would be deleted and inserted', async () => {
      const { service } = makeService();
      const plan = await service.preview(SUPER_ADMIN, bufferFor(archive()), null, ALL_SCOPES);
      expect(plan.willInsert.customers).toBe(1);
      expect(plan.willInsert.bookings).toBe(1);
      expect(plan.willInsert.invoiceItems).toBe(1);
      expect(plan.willDelete).toHaveProperty('bookings');
    });
  });

  describe('restore', () => {
    const options = { confirmationPhrase: 'RESTORE' };

    it('requires the confirmation phrase', async () => {
      const { service } = makeService();
      await expect(
        service.restore(SUPER_ADMIN, bufferFor(archive()), null, ALL_SCOPES, {
          confirmationPhrase: 'yes',
        }),
      ).rejects.toThrow(/Type RESTORE to confirm/);
    });

    it('accepts the phrase case-insensitively', async () => {
      const { service } = makeService();
      const result = await service.restore(SUPER_ADMIN, bufferFor(archive()), null, ALL_SCOPES, {
        confirmationPhrase: ' restore ',
      });
      expect(result.restored).toBe(true);
    });

    it('reports a blocked restore as a 400 carrying the reason list', async () => {
      // Locks the HTTP contract: the controller surfaces whatever this throws, so a blocked restore
      // must arrive as a 400 with the blocker messages intact rather than a bare 500. The frontend
      // renders these strings directly in the blockers panel, so losing them would leave the
      // operator with a dead button and no explanation.
      const { service } = makeService();
      const bad = archive();
      bad.data.bookings = [{ id: 'b1', customerId: 'missing-customer', createdBy: 'user-1', pnr: 'X' }];

      const err = await service
        .restore(SUPER_ADMIN, bufferFor(bad), null, ALL_SCOPES, options)
        .then(() => null)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      const response = (err as BadRequestException).getResponse() as {
        message: string;
        code?: string;
        blockers?: string[];
      };
      expect(response.message).toMatch(/cannot be restored safely/);
      expect(response.code).toBe('RESTORE_BLOCKED');
      // The specific reasons travel with the error; the frontend renders these strings verbatim.
      expect(response.blockers?.length).toBeGreaterThan(0);
      expect(response.blockers?.join(' ')).toMatch(/customer/);
    });

    it('refuses when preview reported a blocker', async () => {
      const prisma = makePrisma({ business: { findUnique: jest.fn(async () => null) } });
      const { service } = makeService(prisma);
      await expect(
        service.restore(SUPER_ADMIN, bufferFor(archive()), null, ALL_SCOPES, options),
      ).rejects.toThrow(/cannot be restored safely/);
    });

    it('writes an audit entry', async () => {
      const { service, audit } = makeService();
      await service.restore(SUPER_ADMIN, bufferFor(archive()), null, ALL_SCOPES, options);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'admin-1' }),
        'BACKUP_RESTORED',
        'Business',
        'biz-1',
        expect.objectContaining({ durationMs: expect.any(Number) }),
      );
    });

    it('scopes every delete to the archive tenant, never a global delete', async () => {
      const { service, calls } = makeService();
      await service.restore(SUPER_ADMIN, bufferFor(archive()), null, ALL_SCOPES, options);

      const deletes = calls.filter((c) => c.op.endsWith('.deleteMany'));
      expect(deletes.length).toBeGreaterThan(0);
      for (const call of deletes) {
        expect((call.args as { where: { businessId?: string } }).where.businessId).toBe('biz-1');
      }
    });

    it('deletes children before parents', async () => {
      const { service, calls } = makeService();
      await service.restore(SUPER_ADMIN, bufferFor(archive()), null, ALL_SCOPES, options);

      const order = calls.map((c) => c.op);
      const indexOf = (op: string) => order.indexOf(op);
      // Scheduled messages reference a template with a Restrict FK, so messages must go first.
      expect(indexOf('sched.deleteMany')).toBeLessThan(indexOf('template.deleteMany'));
      expect(indexOf('rule.deleteMany')).toBeLessThan(indexOf('template.deleteMany'));
      // Invoice documents reference a booking, so documents must go before bookings.
      expect(indexOf('doc.deleteMany')).toBeLessThan(indexOf('booking.deleteMany'));
      // A booking cascades to its invoice items.
      expect(indexOf('booking.deleteMany')).toBeLessThan(indexOf('customer.deleteMany'));
    });

    it('inserts parents before children', async () => {
      const { service, calls } = makeService();
      await service.restore(SUPER_ADMIN, bufferFor(archive()), null, ALL_SCOPES, options);

      const order = calls.map((c) => c.op);
      const indexOf = (op: string) => order.indexOf(op);
      // Users exist before anything that has a Restrict creator reference.
      expect(indexOf('user.create')).toBeLessThan(indexOf('booking.create'));
      expect(indexOf('customer.create')).toBeLessThan(indexOf('booking.create'));
      expect(indexOf('booking.create')).toBeLessThan(indexOf('invoiceItem.create'));
    });

    it('never deletes a user, because Booking/Expense/Income.createdBy are Restrict', async () => {
      const { service, calls } = makeService();
      await service.restore(SUPER_ADMIN, bufferFor(archive()), null, ALL_SCOPES, options);
      expect(calls.some((c) => c.op === 'user.deleteMany')).toBe(false);
    });

    it('reuses the existing password rather than trusting an archived one', async () => {
      const prisma = makePrisma({
        user: {
          findMany: jest.fn(async () => [{ id: 'user-1', email: 'alice@example.com' }]),
          // The user already exists locally.
          findUnique: jest.fn(async () => ({ id: 'user-1', email: 'alice@example.com' })),
          create: jest.fn(async () => ({})),
          update: jest.fn(async () => ({})),
        },
      });
      const { service } = makeService(prisma);
      const withHash = archive();
      withHash.data.users = [
        { id: 'user-1', name: 'Alice', email: 'alice@example.com', passwordHash: 'attacker-controlled-hash' },
      ];

      await service.restore(SUPER_ADMIN, bufferFor(withHash), null, ALL_SCOPES, options);

      const updateArg = (prisma.user.update as jest.Mock).mock.calls[0][0] as { data: Record<string, unknown> };
      expect(updateArg.data.passwordHash).toBeUndefined();
      // And create() was never reached, so no password could be planted at all.
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('creates an unknown user INACTIVE with an unusable password and reports it', async () => {
      const prisma = makePrisma({
        user: {
          findMany: jest.fn(async () => []),
          findUnique: jest.fn(async () => null),
          create: jest.fn(async () => ({})),
          update: jest.fn(async () => ({})),
        },
      });
      const { service } = makeService(prisma);
      const result = await service.restore(SUPER_ADMIN, bufferFor(archive()), null, ALL_SCOPES, options);

      const createArg = (prisma.user.create as jest.Mock).mock.calls[0][0] as {
        data: { passwordHash: string; status: string };
      };
      expect(createArg.data.status).toBe('INACTIVE');
      expect(createArg.data.passwordHash).toMatch(/:unusable$/);
      expect(result.usersNeedingPasswordReset.map((u) => u.email)).toContain('alice@example.com');
    });

    it('restores invoice PDF bytes, so issued invoices are downloadable again', async () => {
      // The archive now carries the real PDF. Without this an issued invoice - a financial record -
      // comes back as a row whose document is permanently gone, which is not a restore.
      const pdf = compressPdf(Buffer.from('%PDF-1.4\nissued invoice\n%%EOF')).bytes;
      const withDocs = archive();
      withDocs.data.invoiceDocuments = [
        {
          id: 'doc-1',
          bookingId: 'book-1',
          sha256: 'abc',
          rawBytes: 33,
          // How `StorageService` writes it: base64 of the compressed blob.
          pdf: Buffer.from(pdf).toString('base64'),
          payload: null,
          prunedAt: null,
        },
      ];
      const prisma = makePrisma();
      const { service } = makeService(prisma);

      await service.restore(SUPER_ADMIN, bufferFor(withDocs), null, ALL_SCOPES, options);

      const arg = (prisma.invoiceDocument.create as jest.Mock).mock.calls[0][0] as {
        data: { pdf: Buffer; storedBytes: number; prunedAt: Date | null };
      };
      // Bytes recovered, and the bytes really are the archived ones.
      expect(Buffer.from(arg.data.pdf).equals(Buffer.from(pdf))).toBe(true);
      expect(arg.data.storedBytes).toBe(Buffer.from(pdf).length);
      // Present again, so not marked pruned.
      expect(arg.data.prunedAt).toBeNull();
    });

    it('never writes base64 text into a Bytes column', async () => {
      // The row is spread into `create()`, so without explicit stripping the base64 string would be
      // handed straight to Prisma as the PDF.
      const withDocs = archive();
      withDocs.data.invoiceDocuments = [
        { id: 'doc-1', bookingId: 'book-1', sha256: 'abc', pdf: 'UEsDBBQ=', payload: 'e30=' },
      ];
      const prisma = makePrisma();
      const { service } = makeService(prisma);

      await service.restore(SUPER_ADMIN, bufferFor(withDocs), null, ALL_SCOPES, options);

      const arg = (prisma.invoiceDocument.create as jest.Mock).mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(typeof arg.data.pdf).not.toBe('string');
      expect(typeof arg.data.payload).not.toBe('string');
    });

    it('keeps a document with no archived bytes as pruned, never as a corrupt empty PDF', async () => {
      // Already pruned before the backup was taken, or from an older archive. Its compliance
      // metadata is still worth restoring, but there is nothing to serve.
      const withDocs = archive();
      withDocs.data.invoiceDocuments = [
        { id: 'doc-1', bookingId: 'book-1', sha256: 'abc', pdf: null, payload: null },
      ];
      const prisma = makePrisma();
      const { service } = makeService(prisma);

      await service.restore(SUPER_ADMIN, bufferFor(withDocs), null, ALL_SCOPES, options);

      const arg = (prisma.invoiceDocument.create as jest.Mock).mock.calls[0][0] as {
        data: { pdf: Buffer; storedBytes: number; prunedAt: Date | null };
      };
      expect(Buffer.from(arg.data.pdf).length).toBe(0);
      expect(arg.data.storedBytes).toBe(0);
      expect(arg.data.prunedAt).toBeInstanceOf(Date);
    });

    it('runs the whole rewrite inside one transaction', async () => {
      const prisma = makePrisma();
      const { service } = makeService(prisma);
      await service.restore(SUPER_ADMIN, bufferFor(archive()), null, ALL_SCOPES, options);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('blocks a booking whose original author is gone, rather than failing mid-restore', async () => {
      // Preferred outcome: preview refuses before a single row is touched. The re-point logic below
      // is defence-in-depth for the case where the author disappears *between* preview and the
      // transaction.
      const { service } = makeService();
      const orphan = archive();
      orphan.data.bookings = [
        { id: 'b1', customerId: 'cust-1', createdBy: 'vanished-user', pnr: 'X', invoiceItems: [] },
      ];

      const plan = await service.preview(SUPER_ADMIN, bufferFor(orphan), null, ALL_SCOPES);
      expect(plan.blockers.join(' ')).toMatch(/reference a creator/);

      await expect(
        service.restore(SUPER_ADMIN, bufferFor(orphan), null, ALL_SCOPES, options),
      ).rejects.toThrow(/cannot be restored safely/);
    });

    it('re-points a booking whose author vanished between preview and the transaction', async () => {
      // Simulates the race: preview sees the author, the transaction does not. The Restrict FK
      // would otherwise abort the whole restore at the booking insert.
      let findManyCalls = 0;
      const prisma = makePrisma({
        user: {
          findMany: jest.fn(async () => {
            findManyCalls += 1;
            // 1st call = preview (author present), 2nd+ = inside the transaction (author gone).
            return findManyCalls === 1 ? [{ id: 'user-1', email: 'alice@example.com' }] : [];
          }),
          findUnique: jest.fn(async () => null),
          create: jest.fn(async () => ({})),
          update: jest.fn(async () => ({})),
        },
      });
      const { service } = makeService(prisma);
      // The author IS in the archive (so preview is satisfied) but the transaction cannot see it,
      // which is the exact race the fallback exists for.
      const orphan = archive();
      orphan.data.bookings = [
        { id: 'b1', customerId: 'cust-1', createdBy: 'user-1', pnr: 'X', invoiceItems: [] },
      ];

      const plan = await service.preview(SUPER_ADMIN, bufferFor(orphan), null, ALL_SCOPES);
      expect(plan.blockers).toEqual([]);

      await service.restore(SUPER_ADMIN, bufferFor(orphan), null, ALL_SCOPES, options);

      const arg = (prisma.booking.create as jest.Mock).mock.calls[0][0] as {
        data: { createdBy: string; updatedBy: string | null };
      };
      // Re-pointed to the acting admin rather than left dangling.
      expect(arg.data.createdBy).toBe('admin-1');
      expect(arg.data.updatedBy).toBeNull();
    });

    it('nulls a dangling optional reference instead of violating its foreign key', async () => {
      const withLogs = archive();
      withLogs.data.auditLogs = [{ id: 'a1', userId: 'vanished', action: 'X', entity: 'Y' }];
      const prisma = makePrisma({
        user: {
          findMany: jest.fn(async () => [{ id: 'user-1', email: 'alice@example.com' }]),
          findUnique: jest.fn(async () => ({ id: 'user-1', email: 'alice@example.com' })),
          create: jest.fn(async () => ({})),
          update: jest.fn(async () => ({})),
        },
      });
      const { service } = makeService(prisma);

      await service.restore(SUPER_ADMIN, bufferFor(withLogs), null, ALL_SCOPES, options);

      const arg = (prisma.auditLog.create as jest.Mock).mock.calls[0][0] as { data: { userId: string | null } };
      expect(arg.data.userId).toBeNull();
    });

    it('verifies the checksum before doing anything', async () => {
      const prisma = makePrisma();
      const { service } = makeService(prisma);
      await expect(
        service.restore(SUPER_ADMIN, bufferFor(archive()), 'mismatch', ALL_SCOPES, options),
      ).rejects.toThrow(/checksum/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
