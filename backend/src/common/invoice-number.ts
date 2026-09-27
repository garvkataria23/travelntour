import { InternalServerErrorException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * Atomically bumps the business invoice counter and hands back the number that was
 * reserved by this call.
 *
 * `nextInvoiceNo` means "the number to allocate next", so the row is incremented first
 * and the pre-increment value is the one given out. Concurrent callers serialise on the
 * row lock, so two bookings created in the same instant can never be handed the same
 * number. Do not read the counter and compute in JavaScript - that reintroduces the race.
 */
async function bumpAndRead(
  tx: Prisma.TransactionClient,
  businessId: string,
): Promise<{ prefix: string; allocated: number } | null> {
  const rows = await tx.$queryRaw<Array<{ prefix: string | null; allocated: number }>>`
    UPDATE "BusinessSetting"
       SET "nextInvoiceNo" = "nextInvoiceNo" + 1,
           "updatedAt" = NOW()
     WHERE "businessId" = ${businessId}
 RETURNING "invoicePrefix" AS prefix, "nextInvoiceNo" - 1 AS allocated
  `;
  if (rows.length === 0) return null;
  return { prefix: rows[0]!.prefix || 'INV', allocated: Number(rows[0]!.allocated) };
}

export function formatInvoiceNumber(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(5, '0')}`;
}

/**
 * Reserves the next invoice number inside an existing transaction, so a rolled back
 * booking gives its number back instead of leaving a gap in the sequence.
 */
export async function allocateInvoiceNumber(
  tx: Prisma.TransactionClient,
  businessId: string,
): Promise<string> {
  const first = await bumpAndRead(tx, businessId);
  if (first) return formatInvoiceNumber(first.prefix, first.allocated);

  // BusinessSetting row is missing (business created before the row became mandatory).
  // Seed it so the first allocation yields 1, then let the atomic path do the work.
  try {
    await tx.businessSetting.create({ data: { businessId, nextInvoiceNo: 2 } });
  } catch {
    // Lost the race - the row exists now, so the retry below will find it.
  }

  const second = await bumpAndRead(tx, businessId);
  if (!second) {
    throw new InternalServerErrorException({
      message: 'Could not allocate an invoice number',
      code: 'INVOICE_ALLOC_FAILED',
    });
  }
  return formatInvoiceNumber(second.prefix, second.allocated);
}
