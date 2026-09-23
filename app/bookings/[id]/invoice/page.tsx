"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { ArrowLeft, Plane, Printer } from "lucide-react";

interface InvoiceBooking {
  id: string;
  pnr: string;
  customer: { id: string; name: string; phone: string; email: string | null } | null;
  referenceNumber: string | null;
  flightNumber: string | null;
  airline: string | null;
  fromAirport: string | null;
  fromCity: string | null;
  toAirport: string | null;
  toCity: string | null;
  departureDate: string;
  departureTime: string | null;
  status: string;
  amount: number | null;
  currency: string | null;
  baseFare: number | null;
  discount: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  invoiceNumber: string | null;
  invoiceIssuedAt: string | null;
}

interface InvoiceSettings {
  business: { id: string; name: string; email: string; phone: string | null; logo: string | null } | null;
  preferences: { gstEnabled: boolean; gstRate: number; gstin: string | null; invoicePrefix: string | null; nextInvoiceNo: number } | null;
}

export default function BookingInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const booking = useApi<InvoiceBooking>(id ? `/bookings/${id}` : null);
  const settings = useApi<InvoiceSettings>("/settings");

  const b = booking.data;

  return (
    <div className="min-h-screen bg-[#eef3f9] text-[#08142e]">
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } } @page { margin: 12mm; }`}</style>
      <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[#dce7f4] bg-white/95 px-4 py-3 backdrop-blur sm:px-8">
        <Link href={`/bookings?search=${encodeURIComponent(b?.pnr ?? "")}`} className="flex items-center gap-2 text-sm font-semibold text-[#405174]"><ArrowLeft className="h-4 w-4" />Back to bookings</Link>
        <div className="flex items-center gap-3">
          {b?.invoiceNumber ? <span className="rounded-md bg-[#eef6ff] px-3 py-1.5 text-xs font-bold text-[#087df0]">{b.invoiceNumber}</span> : null}
          <button onClick={() => window.print()} className="flex h-10 items-center gap-2 rounded-lg bg-[#1688f9] px-5 font-bold text-white"><Printer className="h-4 w-4" />Print / Save PDF</button>
        </div>
      </header>

      <main className="mx-auto max-w-[820px] px-4 py-8 sm:px-8">
        {booking.loading ? <p className="rounded-xl bg-white px-6 py-12 text-center text-sm text-[#596782]">Loading invoice…</p> : null}
        {booking.error ? <p className="rounded-xl bg-white px-6 py-12 text-center text-sm text-rose-600">{booking.error}</p> : null}
        {!booking.loading && b ? (
          <InvoicePaper booking={b} settings={settings.data} />
        ) : null}
      </main>
    </div>
  );
}

function InvoicePaper({ booking: b, settings }: { booking: InvoiceBooking; settings: InvoiceSettings | null }) {
  const business = settings?.business;
  const prefs = settings?.preferences;

  const baseFare = b.baseFare ?? b.amount ?? 0;
  const discount = b.discount ?? 0;
  const taxRate = b.taxRate ?? (prefs?.gstEnabled ? prefs.gstRate ?? 0 : 0);
  const taxable = Math.max(0, baseFare - discount);
  const taxAmount = b.taxAmount ?? (taxRate > 0 ? Math.round(taxable * (taxRate / 100) * 100) / 100 : 0);
  const total = b.amount ?? Math.round((taxable + taxAmount) * 100) / 100;

  const route = `${b.fromAirport || b.fromCity || "—"} to ${b.toAirport || b.toCity || "—"}`;
  const issuedOn = b.invoiceIssuedAt ? formatInvoiceDate(b.invoiceIssuedAt) : null;

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_20px_60px_rgba(20,45,90,0.12)]">
      <div className="flex items-start justify-between gap-6 px-10 pb-8 pt-10">
        <div className="flex items-center gap-3">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#0e2a5c]"><Plane className="h-8 w-8 -rotate-45 fill-[#4fa6ff] stroke-[#4fa6ff] stroke-[1.5]" /></span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-[-0.03em] text-[#0e2a5c]">{business?.name ?? "Travel Agency"}</h1>
            <p className="text-sm text-[#65728a]">{business?.phone ?? ""}{business?.email ? ` · ${business.email}` : ""}</p>
            {prefs?.gstin ? <p className="mt-1 text-xs font-bold text-[#65728a]">GSTIN: {prefs.gstin}</p> : null}
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#1688f9]">Tax Invoice</p>
          <p className="mt-2 font-extrabold text-[#0e2a5c]">{b.invoiceNumber ?? "Invoice not issued"}</p>
          <p className="text-sm text-[#65728a]">{issuedOn ? `Issued ${issuedOn}` : "Not printed yet"}</p>
        </div>
      </div>

      <div className="border-y border-[#e5edf6] bg-[#f7fafd] px-10 py-6">
        <div className="grid gap-6 sm:grid-cols-3">
          <InvoiceBlock label="Billed To">
            <p className="font-bold text-[#0e2a5c]">{b.customer?.name ?? "—"}</p>
            <p className="text-sm text-[#65728a]">{b.customer?.phone ?? ""}</p>
            <p className="text-sm text-[#65728a]">{b.customer?.email ?? ""}</p>
          </InvoiceBlock>
          <InvoiceBlock label="Journey">
            <p className="font-bold text-[#0e2a5c]">{route}</p>
            <p className="text-sm text-[#65728a]">{b.fromAirport || b.fromCity || "—"}</p>
          </InvoiceBlock>
          <InvoiceBlock label="Ticket">
            <p className="font-bold text-[#0e2a5c]">PNR {b.pnr}</p>
            <p className="text-sm text-[#65728a]">{`${b.airline ?? ""} ${b.flightNumber ?? ""}`.trim() || "—"}</p>
            <p className="text-sm text-[#65728a]">{formatInvoiceDate(b.departureDate)}{b.departureTime ? ` · ${b.departureTime}` : ""}</p>
          </InvoiceBlock>
        </div>
      </div>

      <div className="px-10 py-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e5edf6] text-left text-[11px] font-bold uppercase tracking-wide text-[#8a97ad]">
              <th className="pb-3">Description</th>
              <th className="pb-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f4f9]">
            <InvoiceLine label="Base Fare (taxable value)" value={baseFare} />
            {discount > 0 ? <InvoiceLine label={`Less: Discount (-₹)`} value={-discount} negative /> : null}
            <InvoiceLine label="Taxable Value" value={taxable} bold />
            <InvoiceLine label={`GST @ ${formatRate(taxRate)}%`} value={taxAmount} />
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-5" />
              <td className="pt-5">
                <div className="flex items-center justify-between rounded-xl bg-[#0e2a5c] px-5 py-4 text-white">
                  <span className="text-sm font-bold">Total Payable</span>
                  <span className="text-2xl font-extrabold">{formatMoney(total)}</span>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-8 flex items-start justify-between gap-6 border-t border-[#e5edf6] pt-6">
          <p className="max-w-[340px] text-xs leading-5 text-[#8a97ad]">This is a computer generated invoice. Please verify all details before making any payment. For queries contact {business?.name ?? "us"} on {business?.phone ?? "your booked number"}.</p>
          <div className="text-center">
            <p className="text-xs italic text-[#8a97ad]">Thank you for travelling with us!</p>
            <div className="mt-10 border-t border-dashed border-[#c6d4e5] pt-1 text-xs font-bold text-[#405174]">{business?.name ?? ""}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InvoiceBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#8a97ad]">{label}</p>{children}</div>;
}

function InvoiceLine({ label, value, bold, negative }: { label: string; value: number; bold?: boolean; negative?: boolean }) {
  return (
    <tr>
      <td className={`py-3 ${bold ? "font-bold text-[#0e2a5c]" : "text-[#405174]"}`}>{label}</td>
      <td className={`py-3 text-right ${bold ? "font-bold text-[#0e2a5c]" : negative ? "text-rose-600" : "text-[#405174]"}`}>{formatMoney(value)}</td>
    </tr>
  );
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Math.round(value * 100) / 100);
}

function formatRate(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function formatInvoiceDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}