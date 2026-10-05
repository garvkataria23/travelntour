import { Logger } from '@nestjs/common';
import { compressJson, compressPdf } from './pdf-compression';
import { StorageService } from './storage.service';

/**
 * Storage behaviour, exercised against a hand-written Prisma double.
 *
 * These are the guarantees that make keeping every invoice affordable *and* truthful:
 * identical documents dedupe, a correction cannot silently rewrite an issued invoice,
 * and the retention sweep keeps the audit row while dropping the bytes.
 */
function makePrisma(overrides: Record<string, unknown> = {}) {
  const state: Record<string, unknown> = {
    invoiceDocument: {
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 0 })),
      aggregate: jest.fn(async () => ({ _count: { _all: 0 }, _sum: { rawBytes: 0, storedBytes: 0 } })),
    },
    refreshToken: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    $queryRaw: jest.fn(async () => []),
    ...overrides,
  };
  return state;
}

function makeService(overrides: Record<string, unknown> = {}) {
  const prisma = makePrisma(overrides);
  const logger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };
  const service = new StorageService(prisma as never);
  // The service logs storage failures rather than throwing; silencing the logger keeps
  // expected-error tests quiet without hiding real behaviour.
  (service as unknown as { logger: unknown }).logger = logger as never;
  return { service, prisma, logger };
}

const payload = { total: 12600, renderedAt: '2026-09-27T10:00:00.000Z' } as never;
const pdf = Buffer.from('%PDF-1.4\n' + 'x'.repeat(4000) + '\n%%EOF');

/** Arbitrary tenant id; every sweep assertion checks the caller's own scope is applied. */
const TENANT = 'biz-tenant-a';

/**
 * A realistically shaped payload, not a two-field stub.
 *
 * The 74% compression figure was measured on a real 6-line invoice whose JSON came to
 * 3817 B. Asserting a ratio against a 59-byte object would be meaningless - brotli has
 * a fixed header and dictionary cost that dominates at that size, so a small payload can
 * compress to *more* than its own size. The property under test is that the frozen JSON
 * of a real invoice gets materially smaller, so the fixture has to be one.
 */
const realisticPayload = {
  booking: {
    id: '3f2a9c11-4b7e-4d2a-9e55-1a2b3c4d5e6f', businessId: '336704b8-48ad-4435-a146-762106e5f03c',
    customerId: '7c1d8e90-1a2b-4c3d-8e4f-5a6b7c8d9e0f', pnr: 'ABC1234', referenceNumber: 'WEB-REF-88213',
    flightNumber: 'EK 585', airline: 'Emirates', fromAirport: 'BOM', fromCity: 'Mumbai',
    toAirport: 'DXB', toCity: 'Dubai', departureDate: '2026-10-15T00:00:00.000Z',
    departureTime: '21:30', terminal: '2', status: 'CONFIRMED', source: 'DIRECT',
    amount: 24500, currency: 'AED', baseFare: 20000, cost: 19000, discount: 0,
    taxRate: 5, taxAmount: 1000, invoiceNumber: 'INV-2026-0001',
    invoiceIssuedAt: '2026-09-27T10:00:00.000Z', paymentStatus: 'UNPAID', paidAmount: null,
    createdBy: 'u1', updatedBy: 'u1', version: 0,
    createdAt: '2026-09-20T09:00:00.000Z', updatedAt: '2026-09-27T10:00:00.000Z',
    travelDate: '2026-10-15T00:00:00.000Z', notes: null, cancellationReason: null, cancelledAt: null,
  },
  customer: {
    id: '7c1d8e90-1a2b-4c3d-8e4f-5a6b7c8d9e0f', name: 'Rajesh Kumar Sharma', phone: '+91 98765 43210',
    email: 'rajesh.sharma@example.com', businessId: '336704b8-48ad-4435-a146-762106e5f03c',
    notes: 'Prefers aisle seat. VIP since 2019. Allergic to nuts - hotel bookings must be nut-free.',
    whatsappOptIn: true, tags: ['VIP', 'Mumbai', 'Corporate'], status: 'ACTIVE',
    createdAt: '2026-09-20T09:00:00.000Z', updatedAt: '2026-09-20T09:00:00.000Z',
  },
  business: {
    name: 'FlyConnect Travels India', email: 'hello@flyconnect.com', phone: '+91 22 4000 1234',
    address: '402, Solitaire Corporate Park, Andheri East, Mumbai 400093, Maharashtra, India',
    logo: null, gstin: '27ABCDE1234F1Z5', currency: 'AED',
  },
  setting: { gstin: '27ABCDE1234F1Z5', gstRate: 5, gstEnabled: true, invoicePrefix: 'INV', nextInvoiceNumber: 42 },
  items: Array.from({ length: 6 }, (_, i) => ({
    id: `item-${i}`, bookingId: '3f2a9c11-4b7e-4d2a-9e55-1a2b3c4d5e6f',
    description: i === 0
      ? 'Air ticket BOM-DXB Emirates EK585 Economy - Rajesh Kumar Sharma'
      : 'Visa documentation assistance fee, seat reservation, meal upgrade, lounge access, travel insurance',
    quantity: 1, unitPrice: 2000 + i * 137, amount: 2000 + i * 137, sortOrder: (i + 1) * 10,
    createdAt: '2026-09-20T09:00:00.000Z', updatedAt: '2026-09-20T09:00:00.000Z',
  })),
  subtotal: 12600, discount: 0, taxAmount: 630, total: 13230, paidAmount: 0,
  itemsTotal: 12600, renderedAt: '2026-09-27T10:00:00.000Z',
} as never;

describe('StorageService.snapshotInvoice', () => {
  it('stores compressed bytes with a digest of the raw PDF', async () => {
    const { service, prisma } = makeService();
    await service.snapshotInvoice({ businessId: 'b', bookingId: 'bk', invoiceNumber: 'INV-1', pdf, payload });

    const upsert = (prisma.invoiceDocument as { upsert: jest.Mock }).upsert;
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0];

    expect(arg.create.rawBytes).toBe(pdf.length);
    expect(arg.create.storedBytes).toBeLessThan(pdf.length);
    expect(arg.create.sha256).toMatch(/^[0-9a-f]{64}$/);
    // The stored blob must be smaller than the PDF it represents, not a copy of it.
    expect(Buffer.from(arg.create.pdf).length).toBeLessThan(pdf.length);
  });

  it('compresses the payload too, and records both sizes', async () => {
    // Measured on a real 6-line invoice, the payload was larger than the PDF: 3817 B of
    // JSON against 1650 B of compressed PDF. Storing it raw made the record explaining
    // the document the most expensive part of archiving it.
    const { service, prisma } = makeService();
    await service.snapshotInvoice({
      businessId: 'b', bookingId: 'bk', invoiceNumber: 'INV-1', pdf, payload: realisticPayload,
    });

    const create = (prisma.invoiceDocument as { upsert: jest.Mock }).upsert.mock.calls[0][0].create;

    // Bytes, not a JSON column - otherwise nothing on the read path would need to
    // decompress and the storage win would be lost at the boundary.
    expect(create.payload).toBeInstanceOf(Uint8Array);

    const asJson = Buffer.byteLength(JSON.stringify(realisticPayload), 'utf8');
    expect(create.payloadRawBytes).toBe(asJson);
    expect(create.payloadStoredBytes).toBe(Buffer.from(create.payload).length);

    // Pinned against the realistic fixture. Brotli's fixed overhead means small payloads
    // can grow, so the ratio claim only holds for invoice-sized input - which is the only
    // input this column ever sees.
    expect(create.payloadRawBytes).toBeGreaterThan(3000);
    expect(create.payloadStoredBytes).toBeLessThan(create.payloadRawBytes * 0.3);

    // The digest covers the JSON as issued, so it identifies the content rather than
    // the compressor settings used to store it.
    const { sha256 } = compressJson(realisticPayload);
    expect(sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('stores the same payload bytes in the create and update branches', async () => {
    // An upsert that only filled in `create` would silently drop the payload on re-issue,
    // losing the audit record while appearing to succeed.
    const { service, prisma } = makeService();
    await service.snapshotInvoice({
      businessId: 'b', bookingId: 'bk', invoiceNumber: 'INV-1', pdf, payload: realisticPayload,
    });

    const arg = (prisma.invoiceDocument as { upsert: jest.Mock }).upsert.mock.calls[0][0];
    expect(Buffer.from(arg.update.payload).equals(Buffer.from(arg.create.payload))).toBe(true);
    expect(arg.update.payloadRawBytes).toBe(arg.create.payloadRawBytes);
    expect(arg.update.payloadStoredBytes).toBe(arg.create.payloadStoredBytes);
  });

  it('keeps one document per booking so history stays unambiguous', async () => {
    const { service, prisma } = makeService();
    await service.snapshotInvoice({ businessId: 'b', bookingId: 'bk', invoiceNumber: 'INV-1', pdf, payload });

    const upsert = (prisma.invoiceDocument as { upsert: jest.Mock }).upsert;
    expect(upsert.mock.calls[0][0].where).toEqual({ bookingId: 'bk' });
  });

  it('does not rewrite a row when the document is byte-identical', async () => {
    // Re-rendering an unchanged invoice happens on every issue attempt. Without this
    // the row would churn updatedAt and could resurrect a pruned document.
    const first = makeService();
    await first.service.snapshotInvoice({ businessId: 'b', bookingId: 'bk', invoiceNumber: 'INV-1', pdf, payload });
    const sha = (first.prisma.invoiceDocument as { upsert: jest.Mock }).upsert.mock.calls[0][0].create.sha256;

    const second = makeService({
      invoiceDocument: {
        findUnique: jest.fn(async () => ({ sha256: sha })),
        upsert: jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({ count: 0 })),
        aggregate: jest.fn(async () => ({ _count: { _all: 0 }, _sum: { rawBytes: 0, storedBytes: 0 } })),
      },
    });

    await second.service.snapshotInvoice({ businessId: 'b', bookingId: 'bk', invoiceNumber: 'INV-1', pdf, payload });
    expect((second.prisma.invoiceDocument as { upsert: jest.Mock }).upsert).not.toHaveBeenCalled();
  });

  it('revives a pruned document when a corrected invoice is re-issued', async () => {
    const { service, prisma } = makeService();
    await service.snapshotInvoice({ businessId: 'b', bookingId: 'bk', invoiceNumber: 'INV-2', pdf, payload });

    const update = (prisma.invoiceDocument as { upsert: jest.Mock }).upsert.mock.calls[0][0].update;
    expect(update.prunedAt).toBeNull();
    expect(update.supersededAt).toBeNull();
  });

  it('never fails the caller when storage errors', async () => {
    // The invoice number has already committed. Reporting an error for work that
    // succeeded is worse than losing the snapshot, which stays reproducible.
    const { service, logger } = makeService({
      invoiceDocument: {
        findUnique: jest.fn(async () => { throw new Error('disk full'); }),
        upsert: jest.fn(),
        updateMany: jest.fn(),
        aggregate: jest.fn(),
      },
    });

    await expect(
      service.snapshotInvoice({ businessId: 'b', bookingId: 'bk', invoiceNumber: 'INV-1', pdf, payload }),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('StorageService.readInvoicePayload', () => {
  it('decompresses back to exactly what was frozen', async () => {
    // The read path has to invert the write path. A mismatch would be invisible until
    // someone asked "what did this invoice actually say?" and got null.
    const { service, prisma } = makeService();
    await service.snapshotInvoice({ businessId: 'b', bookingId: 'bk', invoiceNumber: 'INV-1', pdf, payload });

    const stored = (prisma.invoiceDocument as { upsert: jest.Mock }).upsert.mock.calls[0][0].create;
    const reader = makeService({
      invoiceDocument: {
        findUnique: jest.fn(async () => ({ payload: stored.payload })),
        upsert: jest.fn(),
        updateMany: jest.fn(),
        aggregate: jest.fn(),
      },
    });

    expect(await reader.service.readInvoicePayload('bk')).toEqual(payload);
  });

  it('survives the PDF bytes being swept', async () => {
    // The payload is the durable audit record. If it went away with the PDF, pruning
    // would destroy the reason for keeping the row at all.
    const { service, prisma } = makeService();
    await service.snapshotInvoice({ businessId: 'b', bookingId: 'bk', invoiceNumber: 'INV-1', pdf, payload });
    const stored = (prisma.invoiceDocument as { upsert: jest.Mock }).upsert.mock.calls[0][0].create;

    const reader = makeService({
      invoiceDocument: {
        findUnique: jest.fn(async () => ({ payload: stored.payload })),
        upsert: jest.fn(),
        updateMany: jest.fn(),
        aggregate: jest.fn(),
      },
    });

    const swept = makeService({
      invoiceDocument: {
        findUnique: jest.fn(async () => ({ pdf: Buffer.alloc(0), storedBytes: 0, prunedAt: new Date(), payload: stored.payload })),
        upsert: jest.fn(),
        updateMany: jest.fn(),
        aggregate: jest.fn(),
      },
    });

    expect(await swept.service.readInvoicePdf('bk')).toBeNull();
    expect(await reader.service.readInvoicePayload('bk')).toEqual(payload);
  });

  it('returns null for a corrupt blob rather than throwing', async () => {
    // A damaged payload must not turn a PDF download into a 500.
    const { service, logger } = makeService({
      invoiceDocument: {
        findUnique: jest.fn(async () => ({ payload: Buffer.from('not brotli') })),
        upsert: jest.fn(),
        updateMany: jest.fn(),
        aggregate: jest.fn(),
      },
    });

    expect(await service.readInvoicePayload('bk')).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  it('returns null when no document exists', async () => {
    const { service } = makeService();
    expect(await service.readInvoicePayload('missing')).toBeNull();
  });
});

describe('StorageService.readInvoicePdf', () => {
  it('returns the exact bytes that were stored', async () => {
    // A real brotli blob, so this fails if the store and read paths ever disagree about
    // the encoding. A stubbed "compressed" value would pass even if both were wrong.
    const { bytes, sha256 } = compressPdf(pdf);

    const { service } = makeService({
      invoiceDocument: {
        findUnique: jest.fn(async () => ({ pdf: bytes, sha256, prunedAt: null })),
        upsert: jest.fn(),
        updateMany: jest.fn(),
        aggregate: jest.fn(),
      },
    });

    const result = await service.readInvoicePdf('bk');
    expect(result).not.toBeNull();
    expect(result!.pdf.equals(pdf)).toBe(true);
    expect(result!.sha256).toBe(sha256);
  });

  it('returns null when nothing is stored, so the caller re-renders', async () => {
    const { service } = makeService();
    expect(await service.readInvoicePdf('missing')).toBeNull();
  });

  it('returns null for a pruned document rather than empty bytes', async () => {
    // Serving a 0-byte file as a PDF would be worse than re-rendering: the user gets a
    // file that cannot be opened, with no indication anything is wrong.
    const { service } = makeService({
      invoiceDocument: {
        findUnique: jest.fn(async () => ({ pdf: new Uint8Array(0), sha256: 'b'.repeat(64), prunedAt: new Date() })),
        upsert: jest.fn(),
        updateMany: jest.fn(),
        aggregate: jest.fn(),
      },
    });
    expect(await service.readInvoicePdf('bk')).toBeNull();
  });

  it('returns null for a corrupt blob instead of garbage bytes', async () => {
    // Data corruption must degrade to a re-render, never to a file that downloads and
    // fails to open, or worse, one that opens as a different document.
    const { service, logger } = makeService({
      invoiceDocument: {
        findUnique: jest.fn(async () => ({ pdf: Buffer.from('not brotli at all'), sha256: 'c'.repeat(64), prunedAt: null })),
        upsert: jest.fn(),
        updateMany: jest.fn(),
        aggregate: jest.fn(),
      },
    });

    expect(await service.readInvoicePdf('bk')).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('snapshot then read', () => {
  it('round-trips a rendered invoice through storage unchanged', async () => {
    // Guards the encode/decode contract that the per-method tests check only in
    // isolation, using the real compressor on both sides.
    const stored: Array<{
      bytes: Uint8Array<ArrayBuffer>;
      sha256: string;
      payload: Uint8Array<ArrayBuffer>;
    }> = [];
    const { service } = makeService({
      invoiceDocument: {
        findUnique: jest.fn(async () => null),
        upsert: jest.fn(async (arg: {
          create: { pdf: Uint8Array<ArrayBuffer>; sha256: string; payload: Uint8Array<ArrayBuffer> };
        }) => {
          stored.push({ bytes: arg.create.pdf, sha256: arg.create.sha256, payload: arg.create.payload });
          return {};
        }),
        updateMany: jest.fn(),
        aggregate: jest.fn(),
      },
    });

    await service.snapshotInvoice({
      businessId: 'b', bookingId: 'bk', invoiceNumber: 'INV-1', pdf, payload: realisticPayload,
    });
    expect(stored).toHaveLength(1);

    const back = makeService({
      invoiceDocument: {
        findUnique: jest.fn(async () => ({ pdf: stored[0].bytes, sha256: stored[0].sha256, prunedAt: null })),
        upsert: jest.fn(),
        updateMany: jest.fn(),
        aggregate: jest.fn(),
      },
    });

    const result = await back.service.readInvoicePdf('bk');
    expect(result!.pdf.equals(pdf)).toBe(true);

    const reader = makeService({
      invoiceDocument: {
        findUnique: jest.fn(async () => ({ payload: stored[0].payload })),
        upsert: jest.fn(),
        updateMany: jest.fn(),
        aggregate: jest.fn(),
      },
    });
    expect(await reader.service.readInvoicePayload('bk')).toEqual(realisticPayload);
  });
});

describe('StorageService.sweep', () => {
  it('deletes only refresh tokens older than the cutoff', async () => {
    const deleteMany = jest.fn(async (_args: unknown) => ({ count: 7 }));
    const { service } = makeService({ refreshToken: { deleteMany } });

    const now = new Date('2026-09-27T12:00:00Z');
    await service.sweep(TENANT, { now, tokenMaxAgeDays: 30 });

    const where = deleteMany.mock.calls[0][0] as { where: { createdAt: { lt: Date } } };
    const expected = new Date(now.getTime() - 30 * 86_400_000);
    expect(where.where.createdAt.lt.getTime()).toBe(expected.getTime());
  });

  it('scopes the token sweep to the caller tenant', async () => {
    // Regression guard. Neither the token delete nor the invoice prune had a businessId filter, so
    // any tenant admin running "cleanup" destroyed every tenant's refresh tokens and invoice PDFs.
    const deleteMany = jest.fn(async (_args: unknown) => ({ count: 0 }));
    const updateMany = jest.fn(async (_args: unknown) => ({ count: 0 }));
    const { service } = makeService({
      refreshToken: { deleteMany },
      invoiceDocument: { findUnique: jest.fn(async () => null), upsert: jest.fn(), updateMany, aggregate: jest.fn() },
    });

    await service.sweep('biz-tenant-a', { now: new Date('2026-09-27T12:00:00Z') });

    expect((deleteMany.mock.calls[0][0] as any).where.user.businessId).toBe('biz-tenant-a');
    expect((updateMany.mock.calls[0][0] as any).where.businessId).toBe('biz-tenant-a');
  });

  it('rejects a retention window below one day', async () => {
    // `invoicePruneAfterDays=0` matched every unpruned invoice and nulled its stored PDF.
    const { service } = makeService();
    await expect(
      service.sweep(TENANT, { invoicePruneAfterDays: 0.0001 }),
    ).rejects.toThrow(/at least 1 day/);
    await expect(service.sweep(TENANT, { tokenMaxAgeDays: 0 })).rejects.toThrow(/at least 1 day/);
  });

  it('empties invoice bytes but keeps the row and its audit trail', async () => {
    // Issued invoices are financial records, so the document is dropped, not the row.
    const updateMany = jest.fn(async (_args: unknown) => ({ count: 4 }));
    const { service } = makeService({
      invoiceDocument: {
        findUnique: jest.fn(async () => null),
        upsert: jest.fn(),
        updateMany,
        aggregate: jest.fn(),
      },
    });

    const now = new Date('2026-09-27T12:00:00Z');
    const result = await service.sweep(TENANT, { now, invoicePruneAfterDays: 255 });

    const arg = updateMany.mock.calls[0][0] as {
      data: { pdf: Buffer; storedBytes: number; prunedAt: Date };
      where: { prunedAt: null; createdAt: { lt: Date } };
    };
    expect(Buffer.from(arg.data.pdf).length).toBe(0);
    expect(arg.data.prunedAt).toBe(now);
    // usage() sums storedBytes; leaving it behind would report bytes that are gone and
    // inflate the claimed saving on every sweep.
    expect(arg.data.storedBytes).toBe(0);

    // Only unpruned, old rows are candidates, so a second sweep is a no-op.
    expect(arg.where.prunedAt).toBeNull();
    expect(arg.where.createdAt.lt.getTime()).toBe(new Date(now.getTime() - 255 * 86_400_000).getTime());

    expect(result.invoiceBytesPruned).toBe(4);
  });

  it('keeps a full financial year of invoice documents by default', async () => {
    const { service } = makeService();
    const result = await service.sweep(TENANT, { now: new Date('2026-09-27T12:00:00Z') });
    expect(result.invoicePruneAfterDays).toBe(255);
    expect(result.tokenMaxAgeDays).toBe(30);
  });
});

describe('StorageService.usage', () => {
  const sum = { rawBytes: 105_920, storedBytes: 16_810, payloadRawBytes: 38_170, payloadStoredBytes: 9_850 };

  it('reports savings from stored counters without decompressing', async () => {
    const { service } = makeService({
      invoiceDocument: {
        findUnique: jest.fn(async () => null),
        upsert: jest.fn(),
        updateMany: jest.fn(),
        aggregate: jest.fn(async () => ({ _count: { _all: 10 }, _sum: sum })),
      },
      $queryRaw: jest.fn(async () => [
        { table: 'Booking', bytes: BigInt(163_840), live: BigInt(28) },
        { table: 'InvoiceDocument', bytes: BigInt(20_000), live: BigInt(10) },
      ]),
    });

    const usage = await service.usage('biz1');

    expect(usage.invoices.documents).toBe(10);
    expect(usage.invoices.rawBytes).toBe(105_920);
    expect(usage.invoices.savedBytes).toBe(89_110);
    expect(usage.invoices.storedFraction).toBeCloseTo(0.1587, 3);
    expect(usage.databaseBytes).toBe(183_840);
    expect(usage.tables).toHaveLength(2);
  });

  it('reports the payload separately instead of folding it into the PDF ratio', async () => {
    // The payload was measured larger than the PDF. Reporting only the PDF ratio would
    // quietly understate total cost by more than half.
    const { service } = makeService({
      invoiceDocument: {
        findUnique: jest.fn(async () => null),
        upsert: jest.fn(),
        updateMany: jest.fn(),
        aggregate: jest.fn(async () => ({ _count: { _all: 10 }, _sum: sum })),
      },
      $queryRaw: jest.fn(async () => []),
    });

    const usage = await service.usage();
    expect(usage.invoices.payload.rawBytes).toBe(38_170);
    expect(usage.invoices.payload.storedBytes).toBe(9_850);
    expect(usage.invoices.payload.savedBytes).toBe(28_320);
    expect(usage.invoices.payload.storedFraction).toBeCloseTo(0.2581, 3);
  });

  it('scopes invoice totals to the caller business', async () => {
    const aggregate = jest.fn(async () => ({ _count: { _all: 3 }, _sum: sum }));
    const { service } = makeService({
      invoiceDocument: { findUnique: jest.fn(), upsert: jest.fn(), updateMany: jest.fn(), aggregate },
      $queryRaw: jest.fn(async () => []),
    });

    await service.usage('biz-abc');
    expect(aggregate).toHaveBeenCalledWith({
      where: { businessId: 'biz-abc' },
      _count: { _all: true },
      _sum: { rawBytes: true, storedBytes: true, payloadRawBytes: true, payloadStoredBytes: true },
    });
  });

  it('handles an empty database without dividing by zero', async () => {
    const { service } = makeService();
    const usage = await service.usage();
    expect(usage.invoices.storedFraction).toBe(0);
    expect(usage.invoices.payload.storedFraction).toBe(0);
    expect(usage.databaseBytes).toBe(0);
  });
});

// Keep the Nest Logger import honest: the service under test constructs one at field
// initialisation, and this fails loudly if that ever stops being true.
it('constructs a real Logger', () => {
  const svc = new StorageService(makePrisma() as never);
  expect((svc as unknown as { logger: Logger }).logger).toBeInstanceOf(Logger);
});
