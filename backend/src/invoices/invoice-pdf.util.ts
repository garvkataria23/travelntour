import { jsPDF } from 'jspdf';
import { Booking, Customer, InvoiceItem } from '@prisma/client';

export interface InvoicePdfInput {
  booking: Booking;
  customer: Pick<Customer, 'name' | 'phone' | 'email'>;
  business: { name?: string | null; email?: string | null; phone?: string | null; logo?: string | null };
  setting: { gstin?: string | null; gstRate?: number | null; gstEnabled?: boolean | null };
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
}

function fmt(value: number, currency = 'INR'): string {
  const v = Math.round((Number(value) || 0) * 100) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(v);
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

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  const currency = booking.currency || 'INR';

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
  const totalRows: Array<[string, string]> = [
    ['Subtotal', fmt(subtotal, currency)],
    ['Discount', `- ${fmt(discount, currency)}`],
    ['Tax (GST)', fmt(taxAmount, currency)],
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

  // ----- Payment status box -----
  textY(`Payment Status: ${booking.paymentStatus}`, margin, totalsY + 12, {
    size: 10,
    bold: true,
    align: 'left',
  });

  // ----- Footer -----
  const footerY = 792;
  doc.setDrawColor(200, 208, 216);
  doc.line(margin, footerY - 24, pageWidth - margin, footerY - 24);
  if (setting?.gstin) {
    textY(`GSTIN: ${setting.gstin}`, margin, footerY - 8, { size: 8, color: [120, 128, 140] });
  }
  textY(
    `Generated by ${business.name || 'Travel Agency'} • ${new Intl.DateTimeFormat('en-IN').format(new Date())}`,
    pageWidth - margin,
    footerY - 8,
    { size: 8, color: [120, 128, 140], align: 'right' },
  );

  const buffer = Buffer.from(doc.output('arraybuffer'));
  return buffer;
}