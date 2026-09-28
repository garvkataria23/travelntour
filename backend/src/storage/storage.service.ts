import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  compressJson,
  compressPdf,
  compressionRatio,
  decompressJson,
  decompressPdf,
} from './pdf-compression';

/**
 * Every field of the invoice as it was rendered. Frozen into `payload` at issue time so
 * the document can be audited or reproduced after the live rows change.
 */
export interface InvoicePayload {
  booking: Record<string, unknown>;
  customer: Record<string, unknown>;
  business: Record<string, unknown>;
  setting: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  subtotal: number;
  discount: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  itemsTotal: number;
  renderedAt: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Freeze the document a customer was actually issued.
   *
   * Upsert on bookingId, because one booking has one authoritative document. A re-issue
   * overwrites and marks the previous row superseded rather than appending, so history
   * never becomes ambiguous about which PDF a booking had.
   *
   * Storage failures are logged and swallowed. Issuing an invoice number is the
   * operation the user is waiting on and it has already committed; failing the request
   * here would report an error for work that succeeded, and the PDF is still
   * reproducible from `payload` on any later request.
   */
  async snapshotInvoice(args: {
    businessId: string;
    bookingId: string;
    invoiceNumber: string;
    pdf: Buffer;
    payload: InvoicePayload;
  }): Promise<void> {
    const { bytes, sha256, rawBytes, storedBytes } = compressPdf(args.pdf);
    // Compressed, because on a real 6-line invoice the payload measured larger than the
    // PDF it accompanies. Left as raw JSONB it was the biggest per-invoice cost.
    const payloadBlob = compressJson(args.payload);

    try {
      const existing = await this.prisma.invoiceDocument.findUnique({
        where: { bookingId: args.bookingId },
        select: { sha256: true },
      });

      // Identical bytes mean nothing changed, so do not churn the row. Re-writing it
      // would move updatedAt and could flip an already-pruned document back to present.
      if (existing?.sha256 === sha256) return;

      await this.prisma.invoiceDocument.upsert({
        where: { bookingId: args.bookingId },
        create: {
          businessId: args.businessId,
          bookingId: args.bookingId,
          invoiceNumber: args.invoiceNumber,
          pdf: bytes,
          sha256,
          rawBytes,
          storedBytes,
          payload: payloadBlob.bytes,
          payloadRawBytes: payloadBlob.rawBytes,
          payloadStoredBytes: payloadBlob.storedBytes,
        },
        update: {
          invoiceNumber: args.invoiceNumber,
          pdf: bytes,
          sha256,
          rawBytes,
          storedBytes,
          payload: payloadBlob.bytes,
          payloadRawBytes: payloadBlob.rawBytes,
          payloadStoredBytes: payloadBlob.storedBytes,
          supersededAt: null,
          // A new document revives a row the sweep had emptied.
          prunedAt: null,
        },
      });

      const pct = (raw: number, stored: number) => `${(compressionRatio(raw, stored) * 100).toFixed(1)}%`;
      this.logger.log(
        `snapshot ${args.invoiceNumber}: pdf ${rawBytes}B -> ${storedBytes}B (${pct(rawBytes, storedBytes)}), ` +
          `payload ${payloadBlob.rawBytes}B -> ${payloadBlob.storedBytes}B (${pct(payloadBlob.rawBytes, payloadBlob.storedBytes)})`,
      );
    } catch (error) {
      this.logger.error(
        `failed to snapshot invoice ${args.invoiceNumber} for booking ${args.bookingId}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * The frozen payload for a booking, or null if never snapshotted.
   *
   * The payload outlives its PDF: the retention sweep empties the document bytes but
   * leaves this intact, so an audit question can still be answered years later.
   */
  async readInvoicePayload<T = InvoicePayload>(bookingId: string): Promise<T | null> {
    const doc = await this.prisma.invoiceDocument.findUnique({
      where: { bookingId },
      select: { payload: true },
    });
    if (!doc) return null;

    try {
      return decompressJson<T>(Buffer.from(doc.payload));
    } catch (error) {
      this.logger.error(
        `invoice payload for booking ${bookingId} failed to decompress: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /** The stored PDF for a booking, or null if never snapshotted or already pruned. */
  async readInvoicePdf(bookingId: string): Promise<{ pdf: Buffer; sha256: string } | null> {
    const doc = await this.prisma.invoiceDocument.findUnique({
      where: { bookingId },
      select: { pdf: true, sha256: true, prunedAt: true },
    });
    if (!doc || doc.prunedAt) return null;

    try {
      // `Buffer.from(uint8)` copies by default, which also re-widens the ArrayBufferLike
      // backing store into a plain Buffer that zlib accepts.
      return { pdf: decompressPdf(Buffer.from(doc.pdf)), sha256: doc.sha256 };
    } catch (error) {
      // A corrupt blob must not make the invoice permanently un-downloadable; the
      // caller re-renders from the live rows instead.
      this.logger.error(
        `invoice document for booking ${bookingId} failed to decompress: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Retention sweep.
   *
   * Two kinds of row, deliberately handled differently:
   *
   *  - Expired refresh tokens are worthless the moment they expire. Deleted outright.
   *  - Issued invoice PDFs are financial records, so the *bytes* are dropped after
   *    `pruneAfterDays` but the row survives with `payload`, number and timestamps.
   *    History stays queryable and the document can still be re-derived.
   *
   * Defaults are conservative: 30 days for token cleanup (well past the 15 minute
   * access token and any reasonable refresh lifetime) and 255 days for invoice bytes,
   * which keeps a full financial year on disk.
   */
  async sweep(options?: { tokenMaxAgeDays?: number; invoicePruneAfterDays?: number; now?: Date }) {
    const now = options?.now ?? new Date();
    const tokenMaxAgeDays = options?.tokenMaxAgeDays ?? 30;
    const invoicePruneAfterDays = options?.invoicePruneAfterDays ?? 255;

    const tokenCutoff = new Date(now.getTime() - tokenMaxAgeDays * 86_400_000);
    const invoiceCutoff = new Date(now.getTime() - invoicePruneAfterDays * 86_400_000);

    const tokens = await this.prisma.refreshToken.deleteMany({
      where: { createdAt: { lt: tokenCutoff } },
    });

    // Nulling `pdf` rather than deleting the row: Postgres keeps the dead tuple until
    // vacuum, but the logical row and its audit trail are intact, and the alternative
    // loses the record that an invoice was ever issued.
    //
    // `payload` is deliberately left alone. It is the audit record - the frozen figures
    // the document was issued with - and it is only a fraction of the PDF, so dropping
    // the big artefact while keeping the small one is the right way round for a
    // retention policy.
    //
    // `storedBytes` is zeroed alongside the blob. `usage()` sums that column, so leaving
    // it behind would keep reporting bytes that no longer exist and slowly inflate the
    // saving with every sweep. `rawBytes` is deliberately kept, since it is a fact about
    // the document that was issued rather than about what is still on disk.
    const invoices = await this.prisma.invoiceDocument.updateMany({
      where: { prunedAt: null, createdAt: { lt: invoiceCutoff } },
      data: { pdf: Buffer.alloc(0), storedBytes: 0, prunedAt: now },
    });

    const result = {
      refreshTokensDeleted: tokens.count,
      invoiceBytesPruned: invoices.count,
      invoicePruneAfterDays,
      tokenMaxAgeDays,
    };
    this.logger.log(
      `sweep: ${result.refreshTokensDeleted} refresh token(s) deleted, ` +
        `${result.invoiceBytesPruned} invoice document(s) pruned`,
    );
    return result;
  }

  /**
   * What storage actually costs, plus the real compression ratio achieved.
   *
   * The ratio is computed from stored counters rather than by decompressing, so this
   * stays cheap enough to call from a dashboard.
   *
   * `businessId` scopes only the invoice figures. Per-table sizes come from
   * `pg_total_relation_size`, which is a whole-database measurement, so they describe the
   * deployment regardless of tenant and must not be reported as one tenant's usage.
   */
  async usage(businessId?: string) {
    const tables = await this.prisma.$queryRaw<Array<{ table: string; bytes: bigint; live: bigint }>>`
      SELECT c.relname AS table,
             pg_total_relation_size(c.oid) AS bytes,
             COALESCE(s.n_live_tup, 0) AS live
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
      LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
      WHERE c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC
    `;

    const agg = businessId
      ? await this.prisma.invoiceDocument.aggregate({
          where: { businessId },
          _count: { _all: true },
          _sum: { rawBytes: true, storedBytes: true, payloadRawBytes: true, payloadStoredBytes: true },
        })
      : await this.prisma.invoiceDocument.aggregate({
          _count: { _all: true },
          _sum: { rawBytes: true, storedBytes: true, payloadRawBytes: true, payloadStoredBytes: true },
        });

    const rawBytes = agg._sum.rawBytes ?? 0;
    const storedBytes = agg._sum.storedBytes ?? 0;
    // Kept separate from the PDF figures because they are different artefacts. Folding
    // the payload into one combined "raw vs stored" pair would flatter the ratio by
    // counting the smaller, very compressible JSON as though it cost nothing.
    const payloadRawBytes = agg._sum.payloadRawBytes ?? 0;
    const payloadStoredBytes = agg._sum.payloadStoredBytes ?? 0;

    return {
      databaseBytes: tables.reduce((sum, t) => sum + Number(t.bytes), 0),
      tables: tables.map((t) => ({ table: t.table, bytes: Number(t.bytes), liveRows: Number(t.live) })),
      invoices: {
        documents: agg._count._all,
        rawBytes,
        storedBytes,
        savedBytes: rawBytes - storedBytes,
        // The headline number: what fraction of the uncompressed size we actually keep.
        storedFraction: compressionRatio(rawBytes, storedBytes),
        payload: {
          rawBytes: payloadRawBytes,
          storedBytes: payloadStoredBytes,
          savedBytes: payloadRawBytes - payloadStoredBytes,
          storedFraction: compressionRatio(payloadRawBytes, payloadStoredBytes),
        },
      },
    };
  }
}
