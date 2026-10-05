import { createHash } from 'crypto';
import { jsPDF } from 'jspdf';
import { Booking, Customer, InvoiceItem } from '@prisma/client';
import { BASE_CURRENCY, minorUnitDigits } from '../currency/decimals';
import type { MoneyValue } from '../common/invoice-totals';
import { toNumber } from '../common/money';

export interface InvoicePdfInput {
  booking: Booking;
  customer: Pick<Customer, 'name' | 'phone' | 'email'>;
  business: { name?: string | null; email?: string | null; phone?: string | null; logo?: string | null };
  setting: {
    gstin?: string | null;
    gstRate?: MoneyValue;
    gstEnabled?: boolean | null;
    taxLabel?: string | null;
    bankName?: string | null;
    bankAccountName?: string | null;
    bankAccountNumber?: string | null;
    bankIfscSwift?: string | null;
    bankUpiId?: string | null;
    invoiceTerms?: string | null;
    invoiceNotes?: string | null;
  };
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  /**
   * Date printed in the footer, and used to derive the PDF file ID.
   *
   * Defaults to now. Pass the invoice's issue date when rendering a document that must
   * be reproducible, so the same invoice always yields the same bytes.
   */
  generatedAt?: Date;
}

/**
 * jsPDF's built-in fonts are WinAnsi-encoded, so currency symbols outside Latin-1
 * (₹, د.إ, ₺, ₴ …) render as blanks. Formatting with `currencyDisplay: 'code'` keeps the
 * output ASCII-safe and unambiguous - "AED 1,000" / "USD 1,000.00" - and `toLatin1` is a
 * final safety net for anything else that slips through.
 */
/**
 * Space-like and typographic characters WinAnsi can render, mapped to plain ASCII.
 * U+00A0 and U+202F are normalised rather than dropped so words do not run together.
 */
const ASCII_FOLD: Record<string, string> = {
  '\u00A0': ' ', '\u202F': ' ', '\u2007': ' ', '\u2009': ' ',
  '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2013': '-', '\u2014': '-', '\u2212': '-',
  '\u2018': "'", '\u2019': "'", '\u201A': "'", '\u201B': "'",
  '\u201C': '"', '\u201D': '"', '\u201E': '"',
  '\u2026': '...', '\u00D7': 'x',
};

export function toLatin1(text: string): string {
  return text
    .replace(/[\u00A0\u202F\u2007\u2009\u2010-\u2014\u2212\u2018-\u201F\u2026\u00D7]/g, (char) => ASCII_FOLD[char] ?? '')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

function fmt(value: number, currency = BASE_CURRENCY): string {
  const code = (currency || BASE_CURRENCY).toUpperCase();
  const digits = minorUnitDigits(code);
  const text = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
    currencyDisplay: 'code',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.round((Number(value) || 0) * 1000) / 1000);
  return toLatin1(text);
}

function dateFmt(value: Date | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[\s_-]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function renderInvoicePdf(input: InvoicePdfInput): Buffer {
  const {
    booking,
    customer,
    business,
    setting,
    items,
    subtotal,
    discount,
    taxAmount,
    total,
    paidAmount,
  } = input;

  const generatedAt = input.generatedAt ?? new Date();

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  const currency = booking.currency || BASE_CURRENCY;

  // Make the output reproducible.
  //
  // jsPDF writes a PDF `/ID` into the trailer and generates it with Math.random(), so
  // two renders of byte-identical data produce different files. That breaks content
  // addressing: the same invoice can never be recognised as unchanged, so the stored
  // snapshot would be rewritten on every re-issue and its sha256 would identify
  // "the same invoice" differently each time.
  //
  // The ID is set deterministically from the invoice's identity and the date printed on
  // it, so equal inputs give equal bytes. `setFileId` validates the value, hence the
  // fixed 32 hex chars.
  const fileId = createHash('sha256')
    .update(
      [
        booking.invoiceNumber ?? '',
        booking.pnr ?? '',
        booking.businessId ?? '',
        booking.customerId ?? '',
        booking.version ?? 0,
        generatedAt.toISOString().slice(0, 10),
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 32);

  // Two sources of non-determinism have to be pinned for the output to be reproducible:
  // the trailer `/ID` (random per document) and the `/CreationDate` metadata field.
  //
  // Getting this wrong fails silently - the PDF still renders, it just gets different
  // bytes every time, which defeats the content-addressed snapshot dedupe. So the
  // identity is asserted rather than assumed.
  if (typeof doc.setFileId !== 'function' || typeof doc.setCreationDate !== 'function') {
    throw new Error(
      'jsPDF is missing setFileId/setCreationDate; invoice PDFs would be non-reproducible and stored snapshots could not be deduplicated.',
    );
  }
  doc.setFileId(fileId);
  doc.setCreationDate(generatedAt);

  const em = { semi: 'helvetica', bold: 'helvetica', size: 10 };

  const textY = (text: string, x: number, y: number, opts: Partial<{ size: number; bold: boolean; color: [number, number, number]; align: 'left' | 'right' | 'center' }> = {}) => {
    doc.setFont(em.semi, opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size ?? 10);
    doc.setTextColor(...(opts.color ?? [40, 44, 52]));
    doc.text(text, x, y, { align: opts.align ?? 'left' });
  };

  // ----- Header -----
  doc.setFillColor(14, 42, 92); // Deep Navy Travel Branding
  doc.rect(0, 0, pageWidth, 86, 'F');
  textY(business.name || 'Travel Agency', margin, 36, { size: 18, bold: true, color: [255, 255, 255] });
  textY('TAX INVOICE', pageWidth - margin, 36, {
    size: 18,
    bold: true,
    align: 'right',
    color: [255, 255, 255],
  });
  textY(
    [business.email, business.phone].filter(Boolean).join('  •  ') || 'Flight Tickets & Holiday Packages',
    margin,
    54,
    { size: 8.5, color: [210, 225, 245] },
  );
  textY(`Invoice # ${booking.invoiceNumber || '—'}`, pageWidth - margin, 54, {
    size: 11,
    bold: true,
    align: 'right',
    color: [255, 255, 255],
  });

  // Status badge in header
  const isPaid = booking.paymentStatus === 'PAID';
  const isPartial = booking.paymentStatus === 'PARTIAL';
  const statusLabel = isPaid ? 'PAID IN FULL' : isPartial ? 'PARTIALLY PAID' : 'PAYMENT DUE';
  const statusBadgeColor: [number, number, number] = isPaid ? [0, 180, 90] : isPartial ? [56, 140, 255] : [255, 170, 40];
  textY(`Status: ${statusLabel}`, pageWidth - margin, 70, {
    size: 8.5,
    bold: true,
    align: 'right',
    color: statusBadgeColor,
  });

  // ----- Meta rows -----
  let y = 104;
  textY('BILL TO / PASSENGER', margin, y, { size: 8, bold: true, color: [120, 128, 140] });
  textY(customer.name, margin, y + 16, { size: 11, bold: true });
  textY(customer.phone, margin, y + 30, { size: 8.5 });
  if (customer.email) textY(customer.email, margin, y + 42, { size: 8.5 });

  const fromDisplay = booking.fromAirport
    ? `${booking.fromAirport} (${titleCase(booking.fromCity)})`
    : titleCase(booking.fromCity);
  const toDisplay = booking.toAirport
    ? `${booking.toAirport} (${titleCase(booking.toCity)})`
    : titleCase(booking.toCity);

  const metaRight: Array<[string, string]> = [
    ['Invoice Number', booking.invoiceNumber || '—'],
    ['Invoice Date', dateFmt(booking.invoiceIssuedAt || booking.createdAt)],
    ['Booking PNR', booking.pnr],
    ['Airline & Flight', `${booking.airline} ${booking.flightNumber}`.trim()],
    ['Sector / Route', `${fromDisplay} → ${toDisplay}`],
    ['Departure', `${dateFmt(booking.departureDate)} ${booking.departureTime || ''}`.trim()],
  ];
  if (booking.terminal) {
    metaRight.push(['Terminal', booking.terminal]);
  }
  if (booking.referenceNumber) {
    metaRight.push(['Booking Ref', booking.referenceNumber]);
  }

  let metaY = 104;
  for (const [label, value] of metaRight) {
    textY(label, pageWidth - margin - 170, metaY, { size: 7.5, color: [120, 128, 140] });
    textY(value, pageWidth - margin, metaY, { size: 8.5, align: 'right' });
    metaY += 14;
  }

  // ----- Items table -----
  y = Math.max(metaY + 14, 214);
  const cols: Array<{ label: string; x: number; w: number }> = [
    { label: 'DESCRIPTION / SERVICE', x: margin, w: contentWidth * 0.5 },
    { label: 'QTY', x: margin + contentWidth * 0.5, w: contentWidth * 0.12 },
    { label: 'UNIT PRICE', x: margin + contentWidth * 0.62, w: contentWidth * 0.19 },
    { label: 'AMOUNT', x: margin + contentWidth * 0.81, w: contentWidth * 0.19 },
  ];

  const ITEM_BOTTOM = 660;
  const CONTINUATION_TOP = 130;

  const drawTableHeader = (top: number) => {
    doc.setFillColor(240, 245, 252);
    doc.rect(margin, top - 13, contentWidth, 20, 'F');
    for (const col of cols) {
      textY(col.label, col.x + (col.label === 'DESCRIPTION / SERVICE' ? 0 : 12), top, {
        size: 7.5,
        bold: true,
        color: [70, 85, 110],
        align: col.label === 'DESCRIPTION / SERVICE' ? 'left' : 'right',
      });
    }
  };
  drawTableHeader(y);

  // Money columns arrive as Prisma Decimal objects; coerced to numbers here so jsPDF never has to
  // format a Decimal.js instance (whose valueOf() is a string).
  const rows: Array<{ description: string; quantity: number; unitPrice: number; amount: number }> =
    items.length > 0
      ? items.map((item) => ({
          description: item.description,
          quantity: toNumber(item.quantity),
          unitPrice: toNumber(item.unitPrice),
          amount: toNumber(item.amount),
        }))
      : [
          {
            description: `Air Ticket: ${fromDisplay} → ${toDisplay} (${booking.airline})`,
            quantity: 1,
            unitPrice: toNumber(booking.baseFare ?? booking.amount),
            amount: toNumber(booking.baseFare ?? booking.amount),
          },
        ];

  let rowY = y + 18;
  // Long invoices used to be silently truncated: every item past rowY > 660 was skipped with
  // no page break and no warning, so a 30-line invoice printed as a 26-line invoice with the
  // totals still adding up to the full amount. Items now flow onto continuation pages.
  rows.forEach((item, index) => {
    if (rowY > ITEM_BOTTOM) {
      doc.addPage();
      rowY = CONTINUATION_TOP + 18;
      drawTableHeader(CONTINUATION_TOP);
      textY(`Invoice # ${booking.invoiceNumber || '—'} (continued)`, pageWidth - margin, CONTINUATION_TOP - 30, {
        size: 8,
        align: 'right',
        color: [120, 128, 140],
      });
    }
    textY(item.description, margin, rowY, { size: 9 });
    textY(String(item.quantity), cols[1].x + 12, rowY, { size: 9, align: 'right' });
    textY(fmt(item.unitPrice, currency), cols[2].x + 12, rowY, { size: 9, align: 'right' });
    textY(fmt(item.amount, currency), cols[3].x + 12, rowY, { size: 9, align: 'right' });
    if (index < rows.length - 1) {
      doc.setDrawColor(235, 240, 246);
      doc.line(margin, rowY + 9, pageWidth - margin, rowY + 9);
    }
    rowY += 23;
  });

  // ----- Totals -----
  // The totals block plus the payment-status box needs roughly 200pt. If the last item page
  // cannot fit it, break to a fresh page rather than overlapping the bank/terms/footer block.
  const TOTALS_REQUIRED_SPACE = 210;
  if (rowY + TOTALS_REQUIRED_SPACE > 720) {
    doc.addPage();
    rowY = 130;
  }
  let totalsY = Math.min(Math.max(rowY + 10, 300), 610);
  const taxLabel = (setting?.taxLabel || 'GST').toUpperCase();
  const totalRows: Array<[string, string]> = [
    ['Subtotal', fmt(subtotal, currency)],
  ];
  if (discount > 0) {
    totalRows.push(['Discount', `- ${fmt(discount, currency)}`]);
  }
  const taxRate = toNumber(booking.taxRate) > 0
    ? toNumber(booking.taxRate)
    : (toNumber(setting?.gstRate) > 0 ? toNumber(setting.gstRate) : 0);
  if (taxAmount > 0 || taxRate > 0) {
    const rateText = taxRate > 0 ? ` @ ${taxRate}%` : '';
    totalRows.push([`Tax (${taxLabel}${rateText})`, fmt(taxAmount, currency)]);
  }

  for (const [label, value] of totalRows) {
    textY(label, contentWidth * 0.55 + margin, totalsY, { size: 8.5, color: [90, 98, 110] });
    textY(value, pageWidth - margin, totalsY, { size: 9, align: 'right' });
    totalsY += 16;
  }

  doc.setFillColor(14, 42, 92);
  doc.rect(contentWidth * 0.55 + margin, totalsY, contentWidth * 0.45, 26, 'F');
  textY('TOTAL PAYABLE', contentWidth * 0.55 + margin + 8, totalsY + 17, { size: 10, bold: true, color: [255, 255, 255] });
  textY(fmt(total, currency), pageWidth - margin - 8, totalsY + 17, { size: 12, bold: true, align: 'right', color: [255, 255, 255] });

  const paid = Math.min(paidAmount || 0, total);
  const due = Math.max(0, total - paid);
  totalsY += 34;
  textY(`Paid: ${fmt(paid, currency)}`, contentWidth * 0.55 + margin, totalsY, { size: 9, color: [0, 140, 70], bold: true });
  textY(`Amount Due: ${due > 0 ? fmt(due, currency) : 'NIL (PAID)'}`, pageWidth - margin, totalsY, {
    size: 9.5,
    align: 'right',
    bold: true,
    color: due > 0 ? [210, 39, 79] : [0, 140, 70],
  });

  // ----- Payment Status Box (Left of totals) -----
  doc.setFillColor(245, 248, 252);
  doc.roundedRect(margin, totalsY - 48, 170, 24, 3, 3, 'F');
  textY(`Payment Status: ${booking.paymentStatus}`, margin + 8, totalsY - 32, {
    size: 8.5,
    bold: true,
    color: isPaid ? [0, 140, 70] : isPartial ? [9, 121, 238] : [210, 120, 0],
  });

  // ----- Bank & Wire Transfer Instructions -----
  const hasBankDetails = Boolean(
    setting?.bankName || setting?.bankAccountNumber || setting?.bankUpiId || setting?.bankIfscSwift,
  );
  if (hasBankDetails) {
    const bY = totalsY + 18;
    doc.setFillColor(247, 250, 254);
    doc.setDrawColor(220, 232, 245);
    doc.roundedRect(margin, bY, contentWidth, 54, 3, 3, 'FD');

    textY('BANK PAYMENT INSTRUCTIONS', margin + 10, bY + 12, { size: 7.5, bold: true, color: [14, 42, 92] });

    const bLineY = bY + 26;
    if (setting?.bankName) {
      textY(`Bank: ${toLatin1(setting.bankName)}`, margin + 10, bLineY, { size: 8 });
    }
    if (setting?.bankAccountName) {
      textY(`A/C Name: ${toLatin1(setting.bankAccountName)}`, margin + 10, bLineY + 12, { size: 8 });
    }
    if (setting?.bankAccountNumber) {
      textY(`A/C or IBAN: ${toLatin1(setting.bankAccountNumber)}`, margin + contentWidth * 0.45, bLineY, { size: 8, bold: true });
    }
    if (setting?.bankIfscSwift) {
      textY(`IFSC / SWIFT: ${toLatin1(setting.bankIfscSwift)}`, margin + contentWidth * 0.45, bLineY + 12, { size: 8 });
    }
    if (setting?.bankUpiId) {
      textY(`UPI / VPA: ${toLatin1(setting.bankUpiId)}`, margin + contentWidth * 0.75, bLineY, { size: 8, bold: true, color: [22, 136, 249] });
    }
  }

  // ----- Travel Terms & Notes -----
  const footerY = 792;
  let notesY = footerY - 52;
  const defaultTerms =
    'Report at check-in 3 hrs prior for intl & 2 hrs for domestic. Valid passport / Govt ID required. Airline fare & cancellation rules apply.';
  const effectiveTerms = setting?.invoiceTerms ? toLatin1(setting.invoiceTerms) : defaultTerms;

  textY(`Terms: ${effectiveTerms}`, margin, notesY, { size: 7, color: [110, 120, 135] });
  if (setting?.invoiceNotes) {
    notesY += 11;
    textY(`Note: ${toLatin1(setting.invoiceNotes)}`, margin, notesY, { size: 7, color: [110, 120, 135] });
  }

  // ----- Footer -----
  doc.setDrawColor(210, 220, 230);
  doc.line(margin, footerY - 20, pageWidth - margin, footerY - 20);
  if (setting?.gstin) {
    textY(`${taxLabel} Reg: ${setting.gstin}`, margin, footerY - 6, { size: 7.5, color: [120, 128, 140] });
  }
  textY(
    `Computer generated invoice • ${business.name || 'Travel Agency'} • ${dateFmt(generatedAt)}`,
    pageWidth - margin,
    footerY - 6,
    { size: 7.5, color: [120, 128, 140], align: 'right' },
  );

  const buffer = Buffer.from(doc.output('arraybuffer'));
  return buffer;
}