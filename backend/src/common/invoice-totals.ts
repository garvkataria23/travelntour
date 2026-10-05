import { Prisma } from '@prisma/client';
import { toNumber, money, percentageOf, sum } from './money';

/**
 * Invoice total computation — the single source of truth.
 *
 * This logic previously lived twice: in InvoicesService.computeTotals and as an inline copy in
 * ReportsService, where the two had already drifted (different conditions for falling back to the
 * stored taxAmount). A report that disagreed with the invoice it was reporting on is worse than
 * no report, so both now call this.
 */

/**
 * A monetary value as it arrives from Prisma.
 *
 * Money columns are `Decimal(18,2)`, so a row read from the database carries a Prisma Decimal
 * whose `valueOf()` is a string. Accepting it here and coercing with `toNumber()` is what keeps
 * that from reaching `Math.*` and turning a total into NaN.
 */
export type MoneyValue = number | Prisma.Decimal | null | undefined;

export interface InvoiceTotalsInput {
  amount?: MoneyValue;
  baseFare?: MoneyValue;
  discount?: MoneyValue;
  taxRate?: MoneyValue;
  taxAmount?: MoneyValue;
  currency?: string | null;
}

export interface InvoiceTotals {
  subtotal: number;
  discount: number;
  taxable: number;
  taxAmount: number;
  total: number;
}

export function computeInvoiceTotals(
  booking: InvoiceTotalsInput,
  items: Array<{ amount?: MoneyValue }>,
): InvoiceTotals {
  const currency = booking.currency ?? undefined;
  const hasItems = items.length > 0;

  const subtotal = money(
    hasItems
      ? sum(items.map((i) => toNumber(i.amount)), currency)
      : (booking.baseFare != null
          ? toNumber(booking.baseFare)
          : booking.taxAmount != null
            ? Math.max(0, toNumber(booking.amount) - toNumber(booking.taxAmount))
            : toNumber(booking.amount)),
    currency,
  );

  const discount = money(booking.discount, currency);
  const taxable = money(Math.max(0, subtotal - discount), currency);
  const taxRate = toNumber(booking.taxRate);

  // With line items the tax is always derived from the rate; without them the stored taxAmount is
  // authoritative (it may have been imported from an external system).
  const taxAmount = money(
    hasItems
      ? percentageOf(taxable, taxRate, currency)
      : (booking.taxAmount != null ? toNumber(booking.taxAmount) : percentageOf(taxable, taxRate, currency)),
    currency,
  );

  return {
    subtotal,
    discount,
    taxable,
    taxAmount,
    total: money(Math.max(0, taxable + taxAmount), currency),
  };
}