import { computeInvoiceTotals } from './invoice-totals';

const emptyItems: Array<{ amount: number }> = [];

describe('computeInvoiceTotals', () => {
  it('falls back to the booking amounts when there are no line items', () => {
    const totals = computeInvoiceTotals(
      { baseFare: 1000, discount: 100, taxRate: 5, taxAmount: 45, currency: 'USD' },
      emptyItems,
    );
    expect(totals.subtotal).toBe(1000);
    expect(totals.taxable).toBe(900);
    // With no items the stored taxAmount is authoritative (it may be imported from elsewhere).
    expect(totals.taxAmount).toBe(45);
    expect(totals.total).toBe(945);
  });

  it('derives tax from the rate when line items exist, ignoring a stale stored taxAmount', () => {
    const totals = computeInvoiceTotals(
      { baseFare: 1000, taxRate: 10, taxAmount: 999, currency: 'USD' },
      [{ amount: 1000 }],
    );
    expect(totals.taxAmount).toBe(100);
    expect(totals.total).toBe(1100);
  });

  it('reconstructs the taxable base from amount/taxAmount when baseFare is absent', () => {
    const totals = computeInvoiceTotals(
      { amount: 118, taxAmount: 18, currency: 'USD' },
      emptyItems,
    );
    expect(totals.subtotal).toBe(100);
    expect(totals.total).toBe(118);
  });

  it('never returns a negative total when the discount exceeds the subtotal', () => {
    const totals = computeInvoiceTotals(
      { baseFare: 100, discount: 500, taxRate: 5, currency: 'USD' },
      emptyItems,
    );
    expect(totals.taxable).toBe(0);
    expect(totals.total).toBe(0);
  });

  it('sums line items without float drift', () => {
    const totals = computeInvoiceTotals(
      { taxRate: 0, currency: 'USD' },
      Array.from({ length: 3 }, () => ({ amount: 0.1 })),
    );
    expect(totals.subtotal).toBe(0.3);
    expect(totals.total).toBe(0.3);
  });

  it('treats a missing tax rate as zero tax rather than NaN', () => {
    const totals = computeInvoiceTotals({ baseFare: 500, currency: 'USD' }, emptyItems);
    expect(totals.taxAmount).toBe(0);
    expect(totals.total).toBe(500);
  });

  it('applies the currency minor unit', () => {
    const totals = computeInvoiceTotals({ baseFare: 100.75, currency: 'AED' }, emptyItems);
    expect(totals.total).toBe(101);
  });
});