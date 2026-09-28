import { renderInvoicePdf } from '../invoices/invoice-pdf.util';
import { compressJson, compressPdf, compressionRatio, decompressJson, decompressPdf } from './pdf-compression';

const booking = {
  id: 'b1',
  businessId: 'biz1',
  customerId: 'c1',
  pnr: 'ABC1234',
  referenceNumber: null,
  flightNumber: 'EK 585',
  airline: 'Emirates',
  fromAirport: 'BOM',
  fromCity: 'Mumbai',
  toAirport: 'DXB',
  toCity: 'Dubai',
  departureDate: new Date('2026-10-15'),
  departureTime: '21:30',
  terminal: '2',
  status: 'CONFIRMED',
  source: 'DIRECT',
  amount: 24500,
  currency: 'AED',
  baseFare: 20000,
  cost: 19000,
  discount: 0,
  taxRate: 5,
  taxAmount: 1000,
  invoiceNumber: 'INV-2026-0001',
  invoiceIssuedAt: new Date('2026-09-27T10:00:00Z'),
  paymentStatus: 'UNPAID',
  paidAmount: null,
  createdBy: 'u1',
  updatedBy: null,
  version: 0,
  createdAt: new Date('2026-09-20T09:00:00Z'),
  updatedAt: new Date('2026-09-27T10:00:00Z'),
} as never;

const customer = {
  name: 'Rajesh Kumar Sharma',
  phone: '+91 98765 43210',
  email: 'rajesh.sharma@example.com',
};

const items = Array.from({ length: 6 }, (_, i) => ({
  id: `i${i}`,
  bookingId: 'b1',
  description: i === 0 ? 'Air ticket BOM-DXB Emirates EK585 Economy' : `Extra service charge ${i + 1}`,
  quantity: 1,
  unitPrice: 2000,
  amount: 2000,
  sortOrder: i,
  createdAt: new Date(),
  updatedAt: new Date(),
})) as never[];

/**
 * Fixed so the fixture is reproducible. Without it `generatedAt` defaults to now, PDF
 * dates are second-granular, and two renders in the same second compare equal by luck
 * while renders a second apart do not - a test that passes or fails on timing.
 */
const GENERATED_AT = new Date('2026-09-27T10:00:00Z');

const render = (over: Partial<Parameters<typeof renderInvoicePdf>[0]> = {}) =>
  renderInvoicePdf({
    booking,
    customer,
    business: { name: 'FlyConnect Travels India', email: 'hello@flyconnect.com', phone: '+91 22 4000 1234', logo: null },
    setting: { gstin: '27ABCDE1234F1Z5', gstRate: 5, gstEnabled: true },
    items,
    subtotal: 12000,
    discount: 0,
    taxAmount: 600,
    total: 12600,
    paidAmount: 0,
    generatedAt: GENERATED_AT,
    ...over,
  });

describe('pdf compression', () => {
  it('round-trips a rendered PDF byte for byte', () => {
    const pdf = render();
    const { bytes } = compressPdf(pdf);
    expect(decompressPdf(Buffer.from(bytes))).toEqual(pdf);
  });

  it('produces a real PDF again after decompression', () => {
    // Guards against a round-trip that is byte-equal but no longer a valid document:
    // the %PDF- magic and the EOF marker are what a reader actually needs.
    const restored = decompressPdf(Buffer.from(compressPdf(render()).bytes)).toString('latin1');
    expect(restored.startsWith('%PDF-')).toBe(true);
    expect(restored.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('shrinks a realistic invoice substantially', () => {
    // The number quoted in the migration comment and README, pinned so the storage
    // claim cannot rot unnoticed if the renderer or the compressor changes.
    const pdf = render();
    const { storedBytes, rawBytes } = compressPdf(pdf);
    expect(rawBytes).toBe(pdf.length);
    expect(storedBytes).toBeLessThan(rawBytes * 0.25);
  });

  it('hashes the uncompressed PDF, so identical documents share a digest', () => {
    // Hashing compressed bytes would tie the audit identity to compressor tuning.
    expect(compressPdf(render()).sha256).toBe(compressPdf(render()).sha256);
  });

  it('gives different documents different digests', () => {
    const other = { ...(booking as object), invoiceNumber: 'INV-2026-0002' } as never;
    const a = compressPdf(render()).sha256;
    const b = compressPdf(render({ booking: other })).sha256;
    expect(a).not.toBe(b);
  });

  it('renders the same invoice to identical bytes, so snapshots can be deduplicated', () => {
    // jsPDF randomises the trailer /ID and stamps /CreationDate, so an unpinned renderer
    // produces a different file every time. That still looks like a valid PDF, which is
    // why the failure is invisible in production: the stored snapshot is simply rewritten
    // on every issue and its sha256 never matches the same document twice.
    const a = render();
    const b = render();
    expect(a.equals(b)).toBe(true);
    expect(a.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('still separates documents that genuinely differ', () => {
    // The determinism fix must not collapse distinct invoices into one document.
    const original = render();
    expect(original.equals(render({ booking: { ...(booking as object), invoiceNumber: 'INV-2026-0002' } as never }))).toBe(false);
    expect(original.equals(render({ total: 12601 }))).toBe(false);
    expect(original.equals(render({ items: items.slice(0, 5) as never[] }))).toBe(false);
    expect(original.equals(render({ paidAmount: 12600 }))).toBe(false);
    expect(original.equals(render({ generatedAt: new Date('2026-09-28T10:00:00Z') }))).toBe(false);
  });

  it('separates documents that differ in anything actually printed', () => {
    // Every component of the file ID must be something a reader can see on the page.
    // Adding a hidden field such as the row id would instead split byte-identical
    // documents apart, which is the opposite of what content addressing is for.
    const original = render();
    expect(original.equals(render({ booking: { ...(booking as object), pnr: 'ZZZ9999' } as never }))).toBe(false);
    expect(original.equals(render({ customer: { ...customer, name: 'Someone Else' } }))).toBe(false);
  });

  it('treats two bookings that render identically as the same document', () => {
    // Distinct rows, identical visible content, so identical bytes and one digest. This
    // is the case dedupe exists to exploit, and it is why the file ID is built from
    // printed fields rather than from the row id.
    const one = render({ booking: { ...(booking as object), id: 'b1' } as never });
    const two = render({ booking: { ...(booking as object), id: 'b2' } as never });
    expect(one.equals(two)).toBe(true);
    expect(compressPdf(one).sha256).toBe(compressPdf(two).sha256);
  });

  it('fails loudly if jsPDF loses the hooks the determinism depends on', () => {
    // A silent no-op here is the bug this whole mechanism exists to prevent: the PDF
    // still renders, it is just no longer reproducible. The renderer therefore throws.
    const jspdf = require('jspdf') as { jsPDF: unknown };
    const original = jspdf.jsPDF;
    try {
      jspdf.jsPDF = function Fake() {
        return { internal: { pageSize: { getWidth: () => 595 } } };
      } as never;
      expect(() => render()).toThrow(/setFileId/);
    } finally {
      jspdf.jsPDF = original;
    }
  });

  it('reports stored fraction and handles degenerate input', () => {
    expect(compressionRatio(1000, 200)).toBe(0.2);
    expect(compressionRatio(0, 0)).toBe(0);
  });

  it('keeps a stored blob well under the raw size it represents', () => {
    const pdf = render();
    const { storedBytes } = compressPdf(pdf);
    expect(storedBytes / pdf.length).toBeLessThan(0.25);
  });
});

describe('json payload compression', () => {
  // Shaped like a real frozen invoice payload: repeated keys across nested objects,
  // which is exactly the redundancy brotli exploits and JSONB cannot.
  const payload = {
    booking: {
      id: 'b1', businessId: 'biz1', customerId: 'c1', pnr: 'ABC1234', referenceNumber: 'WEB-1',
      flightNumber: 'EK 585', airline: 'Emirates', fromAirport: 'BOM', fromCity: 'Mumbai',
      toAirport: 'DXB', toCity: 'Dubai', departureDate: '2026-10-15T00:00:00.000Z',
      departureTime: '21:30', terminal: '2', status: 'CONFIRMED', source: 'DIRECT',
      amount: 24500, currency: 'AED', baseFare: 20000, cost: 19000, discount: 0,
      taxRate: 5, taxAmount: 1000, invoiceNumber: 'INV-2026-0001',
      invoiceIssuedAt: '2026-09-27T10:00:00.000Z', paymentStatus: 'UNPAID', paidAmount: null,
      createdBy: 'u1', updatedBy: 'u1', version: 0,
      createdAt: '2026-09-20T09:00:00.000Z', updatedAt: '2026-09-27T10:00:00.000Z',
    },
    customer: {
      id: 'c1', name: 'Rajesh Kumar Sharma', phone: '+91 98765 43210', email: 'r@example.com',
      businessId: 'biz1', notes: 'Prefers aisle seat.', whatsappOptIn: true, status: 'ACTIVE',
    },
    items: Array.from({ length: 6 }, (_, i) => ({
      id: `i${i}`, bookingId: 'b1', description: `Line ${i + 1}`, quantity: 1,
      unitPrice: 2000, amount: 2000, sortOrder: (i + 1) * 10,
      createdAt: '2026-09-20T09:00:00.000Z', updatedAt: '2026-09-20T09:00:00.000Z',
    })),
    subtotal: 12600, discount: 0, taxAmount: 630, total: 13230, paidAmount: 0,
    renderedAt: '2026-09-27T10:00:00.000Z',
  };

  it('round-trips to an equal object', () => {
    const { bytes } = compressJson(payload);
    expect(decompressJson(Buffer.from(bytes))).toEqual(payload);
  });

  it('shrinks a realistic payload to a small fraction of its size', () => {
    // Pinned because the whole reason this column is BYTEA is this ratio. Uncompressed
    // it measured larger than the PDF it documents.
    const { rawBytes, storedBytes } = compressJson(payload);
    expect(rawBytes).toBe(Buffer.byteLength(JSON.stringify(payload), 'utf8'));
    expect(storedBytes / rawBytes).toBeLessThan(0.3);
  });

  it('identifies content, not compressor settings', () => {
    // Two compressions of equal content must agree, or the audit digest is useless.
    expect(compressJson(payload).sha256).toBe(compressJson(payload).sha256);
    expect(compressJson(payload).sha256).not.toBe(compressJson({ ...payload, total: 13231 }).sha256);
  });

  it('handles unicode without corrupting it', () => {
    // Customer names, airline names and notes are not ASCII. Round-tripping through
    // latin1 would silently mangle them in the audit record.
    const unicode = { customer: { name: 'राजेश कुमार — محمد ✈️ 東京', note: 'דער' } };
    expect(decompressJson<typeof unicode>(Buffer.from(compressJson(unicode).bytes))).toEqual(unicode);
  });

  it('rejects a blob that is not compressed rather than returning junk', () => {
    expect(() => decompressJson(Buffer.from('not brotli'))).toThrow();
  });
});
