import { createHash } from 'crypto';
import { jsPDF } from 'jspdf';
import { Booking, Customer, InvoiceItem } from '@prisma/client';
import { BASE_CURRENCY, minorUnitDigits } from '../currency/decimals';

export interface InvoicePdfInput {
  booking: Booking;
  customer: Pick<Customer, 'name' | 'phone' | 'email'>;
  business: { name?: string | null; email?: string | null; phone?: string | null; logo?: string | null };
  setting: {
    gstin?: string | null;
    gstRate?: number | null;
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
  doc.setFillColor(23, 78, 116);
  doc.rect(0, 0, pageWidth, 86, 'F');
  textY(business.name || 'Travel Agency', margin, 40, { size: 20, bold: true, color: [255, 255, 255] });
  textY('INVOICE', pageWidth - margin, 40, {
    size: 20,
    bold: true,
    align: 'right',
    color: [255, 255, 255],
  });
  textY(
    [business.email, business.phone].filter(Boolean).join('  •  ') || '',
    margin,
    58,
    { size: 9, color: [220, 230, 240] },
  );
  textY(`Invoice # ${booking.invoiceNumber || '—'}`, pageWidth - margin, 58, {
    size: 11,
    bold: true,
    align: 'right',
    color: [255, 255, 255],
  });

  // ----- Meta rows -----
  let y = 112;
  textY('Bill To', margin, y);
  textY(customer.name, margin, y + 18, { size: 12, bold: true });
  textY(customer.phone, margin, y + 34, { size: 9 });
  if (customer.email) textY(customer.email, margin, y + 48, { size: 9 });

  const metaRight: Array<[string, string]> = [
    ['Invoice Number', booking.invoiceNumber || '—'],
    ['Invoice Date', dateFmt(booking.invoiceIssuedAt || booking.createdAt)],
    ['Booking PNR', booking.pnr],
    ['Flight', `${booking.airline} ${booking.flightNumber}`],
    ['Route', `${titleCase(booking.fromCity)} → ${titleCase(booking.toCity)}`],
    ['Departure', `${dateFmt(booking.departureDate)} ${booking.departureTime}`],
  ];
  let metaY = 112;
  for (const [label, value] of metaRight) {
    textY(label, pageWidth - margin - 150, metaY, { size: 8, color: [120, 128, 140] });
    textY(value, pageWidth - margin - 10, metaY, { size: 9, align: 'right' });
    metaY += 16;
  }

  // ----- Items table -----
  y = 220;
  doc.setFillColor(240, 244, 248);
  doc.rect(margin, y - 14, contentWidth, 22, 'F');
  const cols: Array<{ label: string; x: number; w: number }> = [
    { label: 'DESCRIPTION', x: margin, w: contentWidth * 0.5 },
    { label: 'QTY', x: margin + contentWidth * 0.5, w: contentWidth * 0.12 },
    { label: 'UNIT PRICE', x: margin + contentWidth * 0.62, w: contentWidth * 0.19 },
    { label: 'AMOUNT', x: margin + contentWidth * 0.81, w: contentWidth * 0.19 },
  ];
  for (const col of cols) {
    textY(col.label, col.x + (col.label === 'DESCRIPTION' ? 0 : 12), y, {
      size: 8,
      bold: true,
      color: [90, 98, 110],
      align: col.label === 'DESCRIPTION' ? 'left' : 'right',
    });
  }

  const rows: Array<{ description: string; quantity: number; unitPrice: number; amount: number }> =
    items.length > 0
      ? items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.amount,
        }))
      : [
          {
            description: 'Flight ticket',
            quantity: 1,
            unitPrice: booking.baseFare ?? booking.amount ?? 0,
            amount: booking.baseFare ?? booking.amount ?? 0,
          },
        ];

  let rowY = y + 20;
  rows.forEach((item, index) => {
    if (rowY > 680) return;
    textY(item.description, margin, rowY, { size: 10 });
    textY(String(item.quantity), cols[1].x + 12, rowY, { size: 10, align: 'right' });
    textY(fmt(item.unitPrice, currency), cols[2].x + 12, rowY, { size: 10, align: 'right' });
    textY(fmt(item.amount, currency), cols[3].x + 12, rowY, { size: 10, align: 'right' });
    if (index < rows.length - 1) {
      doc.setDrawColor(232, 236, 240);
      doc.line(margin, rowY + 10, pageWidth - margin, rowY + 10);
    }
    rowY += 26;
  });

  // ----- Totals -----
  let totalsY = Math.min(Math.max(rowY + 8, 300), 620);
  const taxLabel = (setting?.taxLabel || 'GST').toUpperCase();
  const totalRows: Array<[string, string]> = [
    ['Subtotal', fmt(subtotal, currency)],
    ['Discount', `- ${fmt(discount, currency)}`],
    [`Tax (${taxLabel})`, fmt(taxAmount, currency)],
  ];
  for (const [label, value] of totalRows) {
    textY(label, contentWidth * 0.55 + margin, totalsY, { size: 9, color: [90, 98, 110] });
    textY(value, pageWidth - margin, totalsY, { size: 10, align: 'right' });
    totalsY += 18;
  }
  doc.setDrawColor(23, 78, 116);
  doc.setLineWidth(1.2);
  doc.line(contentWidth * 0.55 + margin, totalsY - 4, pageWidth - margin, totalsY - 4);
  textY('TOTAL', contentWidth * 0.55 + margin, totalsY + 14, { size: 12, bold: true });
  textY(fmt(total, currency), pageWidth - margin, totalsY + 14, { size: 13, bold: true, align: 'right' });

  const paid = Math.min(paidAmount || 0, total);
  const due = Math.max(0, total - paid);
  textY(`Paid: ${fmt(paid, currency)}`, contentWidth * 0.55 + margin, totalsY + 32, { size: 9 });
  textY(`Amount Due: ${fmt(due, currency)}`, pageWidth - margin, totalsY + 32, {
    size: 9,
    align: 'right',
    bold: true,
  });

  // ----- Payment status badge -----
  doc.setFillColor(240, 245, 250);
  doc.roundedRect(margin, totalsY, 160, 24, 3, 3, 'F');
  textY(`Payment Status: ${booking.paymentStatus}`, margin + 8, totalsY + 15, {
    size: 9,
    bold: true,
    color: booking.paymentStatus === 'PAID' ? [0, 164, 81] : booking.paymentStatus === 'PARTIAL' ? [9, 121, 238] : [251, 133, 0],
  });

  // ----- Bank & Payment Instructions -----
  const hasBankDetails = Boolean(
    setting?.bankName || setting?.bankAccountNumber || setting?.bankUpiId || setting?.bankIfscSwift,
  );
  if (hasBankDetails) {
    let bY = totalsY + 36;
    textY('PAYMENT DETAILS', margin, bY, { size: 8, bold: true, color: [90, 98, 110] });
    bY += 12;
    if (setting?.bankName) {
      textY(`Bank: ${toLatin1(setting.bankName)}`, margin, bY, { size: 8 });
      bY += 11;
    }
    if (setting?.bankAccountName) {
      textY(`A/C Name: ${toLatin1(setting.bankAccountName)}`, margin, bY, { size: 8 });
      bY += 11;
    }
    if (setting?.bankAccountNumber) {
      textY(`A/C / IBAN: ${toLatin1(setting.bankAccountNumber)}`, margin, bY, { size: 8, bold: true });
      bY += 11;
    }
    if (setting?.bankIfscSwift) {
      textY(`IFSC / SWIFT: ${toLatin1(setting.bankIfscSwift)}`, margin, bY, { size: 8 });
      bY += 11;
    }
    if (setting?.bankUpiId) {
      textY(`UPI: ${toLatin1(setting.bankUpiId)}`, margin, bY, { size: 8 });
    }
  }

  // ----- Terms & Notes -----
  const footerY = 792;
  let notesY = footerY - 50;
  if (setting?.invoiceTerms) {
    textY(`Terms: ${toLatin1(setting.invoiceTerms)}`, margin, notesY, { size: 7.5, color: [120, 128, 140] });
    notesY += 11;
  }
  if (setting?.invoiceNotes) {
    textY(`Note: ${toLatin1(setting.invoiceNotes)}`, margin, notesY, { size: 7.5, color: [120, 128, 140] });
  }

  // ----- Footer -----
  doc.setDrawColor(200, 208, 216);
  doc.line(margin, footerY - 24, pageWidth - margin, footerY - 24);
  if (setting?.gstin) {
    textY(`${taxLabel}IN: ${setting.gstin}`, margin, footerY - 8, { size: 8, color: [120, 128, 140] });
  }
  textY(
    `Generated by ${business.name || 'Travel Agency'} • ${new Intl.DateTimeFormat('en-IN').format(generatedAt)}`,
    pageWidth - margin,
    footerY - 8,
    { size: 8, color: [120, 128, 140], align: 'right' },
  );

  const buffer = Buffer.from(doc.output('arraybuffer'));
  return buffer;
}