"use client";

import { useParams } from "next/navigation";
import { BackLink } from "@/components/dashboard/back-link";
import { useApi } from "@/lib/hooks";
import { api, formatCurrency } from "@/lib/api";
import { FormEvent, useState } from "react";
import { Banknote, CheckCircle2, Download, MessageCircle, Pencil, Plane, Plus, Printer, Send, Trash2, X } from "lucide-react";

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  sortOrder: number;
}

interface InvoiceData {
  id: string;
  pnr: string;
  referenceNumber: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  invoiceNumber: string | null;
  invoiceIssuedAt: string | null;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  status: string;
  airline: string | null;
  flightNumber: string | null;
  fromAirport?: string | null;
  toAirport?: string | null;
  fromCity: string | null;
  toCity: string | null;
  departureDate: string;
  departureTime: string | null;
  amount: number | null;
  currency: string | null;
  baseFare: number | null;
  discount: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  subtotal: number;
  taxable: number;
  total: number;
  paidAmount: number;
  due: number;
  items: InvoiceItem[];
}

interface InvoiceSettings {
  business: { id: string; name: string; email: string; phone: string | null; logo: string | null } | null;
  preferences: { gstEnabled: boolean; gstRate: number; gstin: string | null; invoicePrefix: string | null; nextInvoiceNo: number } | null;
}

export default function BookingInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const invoice = useApi<InvoiceData>(id ? `/invoices/${id}` : null);
  const settings = useApi<InvoiceSettings>("/settings");

  const [itemModal, setItemModal] = useState<{ mode: "add" | "edit"; item?: InvoiceItem } | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const data = invoice.data;

  function notify(tone: "success" | "error", text: string) {
    setMessage({ tone, text });
    window.setTimeout(() => setMessage(null), 4000);
  }

  async function run(action: () => Promise<void>, successText: string) {
    setBusy(true);
    try {
      await action();
      invoice.refetch();
      notify("success", successText);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleIssue() {
    await run(() => api(`/invoices/${id}/issue`, { method: "POST" }), "Invoice issued.");
  }

  async function handleDownloadPdf() {
    try {
      const result = await api<{ fileName: string; base64: string }>(`/invoices/${id}/pdf`);
      const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      notify("success", "PDF downloaded.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not download PDF");
    }
  }

  async function handleSendWhatsApp() {
    setBusy(true);
    try {
      const result = await api<{ sent: boolean; waMessageId: string; fileName: string }>(`/invoices/${id}/send`, { method: "POST" });
      notify("success", `Invoice sent via WhatsApp (${result.waMessageId})`);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not send invoice");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#eef3f9] text-[#08142e]">
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } } @page { margin: 12mm; }`}</style>
      <header className="no-print sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[#dce7f4] bg-white/95 px-4 py-3 backdrop-blur sm:px-8">
        <div className="flex items-center gap-3">
          <BackLink href="/invoices" className="text-sm font-semibold text-[#405174]">Invoices</BackLink>
          <span className="text-[#c8d2e2]">/</span>
          <span className="text-sm font-semibold text-[#405174]">{data?.invoiceNumber ?? "Invoice"}</span>
          {data ? <PaymentStatusBadge value={data.paymentStatus} /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data && !data.invoiceNumber ? (
            <button onClick={handleIssue} disabled={busy} className="flex h-10 items-center gap-2 rounded-lg bg-[#0e2a5c] px-4 font-bold text-white disabled:opacity-60"><Plus className="h-4 w-4" />Issue Invoice</button>
          ) : null}
          {data?.invoiceNumber ? (
            <>
              <button onClick={() => setPaymentOpen(true)} disabled={busy} className="flex h-10 items-center gap-2 rounded-lg border border-[#d6e1ef] bg-white px-4 font-bold text-[#405174] disabled:opacity-60"><Banknote className="h-4 w-4" />Update Payment</button>
              <button onClick={handleSendWhatsApp} disabled={busy} className="flex h-10 items-center gap-2 rounded-lg bg-[#22b56d] px-4 font-bold text-white disabled:opacity-60"><Send className="h-4 w-4" />Send on WhatsApp</button>
              <button onClick={handleDownloadPdf} disabled={busy} className="flex h-10 items-center gap-2 rounded-lg border border-[#d6e1ef] bg-white px-4 font-bold text-[#405174] disabled:opacity-60"><Download className="h-4 w-4" />PDF</button>
            </>
          ) : null}
          <button onClick={() => window.print()} className="flex h-10 items-center gap-2 rounded-lg bg-[#1688f9] px-4 font-bold text-white"><Printer className="h-4 w-4" />Print</button>
        </div>
      </header>

      {message ? <div className={`no-print fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-lg px-5 py-3 text-sm font-semibold text-white shadow-2xl ${message.tone === "success" ? "bg-[#0e7a4a]" : "bg-[#d2274f]"}`}>{message.text}</div> : null}
      {itemModal ? <ItemModal onClose={() => setItemModal(null)} onSaved={async () => { setItemModal(null); invoice.refetch(); }} bookingId={id} item={itemModal.item} mode={itemModal.mode} onError={(text) => notify("error", text)} /> : null}
      {paymentOpen && data ? <PaymentModal onClose={() => setPaymentOpen(false)} onSaved={async () => { setPaymentOpen(false); invoice.refetch(); }} bookingId={id} invoice={data} onError={(text) => notify("error", text)} /> : null}

      <main className="mx-auto max-w-[860px] px-4 py-8 sm:px-8">
        {invoice.loading ? <p className="rounded-xl bg-white px-6 py-12 text-center text-sm text-[#596782]">Loading invoice…</p> : null}
        {invoice.error ? <p className="rounded-xl bg-white px-6 py-12 text-center text-sm text-rose-600">{invoice.error}</p> : null}
        {!invoice.loading && data ? (
          <>
            <InvoicePaper invoice={data} settings={settings.data} />
            <div className="no-print mt-6 rounded-xl border border-[#dce7f4] bg-white p-5 shadow-[0_10px_24px_rgba(31,61,105,0.04)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-[17px] font-extrabold text-[#071333]">Invoice Items</h2>
                  <p className="text-sm text-[#65728a]">Add or edit line items. The total updates automatically.</p>
                </div>
                <button onClick={() => setItemModal({ mode: "add" })} className="flex h-10 items-center gap-2 rounded-lg bg-[#1688f9] px-4 font-bold text-white"><Plus className="h-4 w-4" />Add Item</button>
              </div>
              <div className="mt-4 overflow-x-auto">
                {data.items.length === 0 ? <p className="py-6 text-center text-sm text-[#596782]">No line items yet. Add a line item (e.g. flight ticket, convenience fee).</p> : (
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="bg-[#f4f7fb] text-[#071333]">
                      <tr>
                        <th className="px-3 py-3 font-semibold">Description</th>
                        <th className="px-3 py-3 text-right font-semibold">Qty</th>
                        <th className="px-3 py-3 text-right font-semibold">Unit Price</th>
                        <th className="px-3 py-3 text-right font-semibold">Amount</th>
                        <th className="px-3 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e5edf6]">
                      {data.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2.5 font-medium text-[#071333]">{item.description}</td>
                          <td className="px-3 py-2.5 text-right text-[#405174]">{item.quantity}</td>
                          <td className="px-3 py-2.5 text-right text-[#405174]">{formatCurrency(item.unitPrice, data.currency ?? "INR")}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-[#071333]">{formatCurrency(item.amount, data.currency ?? "INR")}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => setItemModal({ mode: "edit", item })} className="grid h-8 w-8 place-items-center rounded-lg border border-[#d4dfed] text-[#405174] hover:bg-slate-50" aria-label="Edit item"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => run(() => api(`/invoices/${id}/items/${item.id}`, { method: "DELETE" }), "Item removed.")} className="grid h-8 w-8 place-items-center rounded-lg border border-[#f4dbe2] text-rose-500 hover:bg-rose-50" aria-label="Delete item"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            <div className="no-print mt-4 flex items-center gap-2 text-sm text-[#65728a]">
              <MessageCircle className="h-4 w-4" /> Payment status updates and WhatsApp delivery actions are recorded in the message &amp; audit history.
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

function InvoicePaper({ invoice: b, settings }: { invoice: InvoiceData; settings: InvoiceSettings | null }) {
  const business = settings?.business;
  const prefs = settings?.preferences;
  const currency = b.currency ?? "INR";

  const items = b.items.length > 0 ? b.items.map((i) => ({ description: i.description, amount: i.amount })) : [{ description: "Flight ticket", amount: b.baseFare ?? 0 }];
  const route = `${b.fromCity || "—"} to ${b.toCity || "—"}`;
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
            <p className="font-bold text-[#0e2a5c]">{b.customerName ?? "—"}</p>
            <p className="text-sm text-[#65728a]">{b.customerPhone ?? ""}</p>
            <p className="text-sm text-[#65728a]">{b.customerEmail ?? ""}</p>
          </InvoiceBlock>
          <InvoiceBlock label="Journey">
            <p className="font-bold text-[#0e2a5c]">{route}</p>
            <p className="text-sm text-[#65728a]">{b.fromCity || "—"}</p>
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
            {items.map((item) => <InvoiceLine key={item.description} label={item.description} value={item.amount} />)}
            {(b.discount ?? 0) > 0 ? <InvoiceLine label="Less: Discount" value={-(b.discount ?? 0)} negative /> : null}
            <InvoiceLine label="Taxable Value" value={b.taxable} bold />
            <InvoiceLine label={`GST @ ${formatRate(b.taxRate ?? 0)}%`} value={b.taxAmount ?? 0} />
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-5" />
              <td className="pt-5">
                <div className="flex items-center justify-between rounded-xl bg-[#0e2a5c] px-5 py-4 text-white">
                  <span className="text-sm font-bold">Total Payable</span>
                  <span className="text-2xl font-extrabold">{formatMoney(b.total, currency)}</span>
                </div>
                <div className="mt-3 flex flex-col items-end gap-1 text-sm">
                  <span className="font-semibold text-[#00a451]">Paid: {formatMoney(b.paidAmount, currency)}</span>
                  <span className={`font-extrabold ${b.due > 0 ? "text-rose-600" : "text-[#0e2a5c]"}`}>Amount Due: {formatMoney(b.due, currency)}</span>
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

function PaymentStatusBadge({ value }: { value: string }) {
  if (value === "PAID") return <span className="inline-flex items-center gap-1 rounded-md bg-[#d9f7e8] px-3 py-1 text-xs font-bold text-[#00a451]"><CheckCircle2 className="h-3.5 w-3.5" />Paid</span>;
  if (value === "PARTIAL") return <span className="inline-flex items-center gap-1 rounded-md bg-[#e0efff] px-3 py-1 text-xs font-bold text-[#0979ee]">Partial</span>;
  return <span className="inline-flex items-center gap-1 rounded-md bg-[#fff0dc] px-3 py-1 text-xs font-bold text-[#fb8500]">Unpaid</span>;
}

function ItemModal({ mode, item, bookingId, onClose, onSaved, onError }: { mode: "add" | "edit"; item?: InvoiceItem; bookingId: string; onClose: () => void; onSaved: () => void; onError: (text: string) => void }) {
  const [description, setDescription] = useState(item?.description ?? "");
  const [quantity, setQuantity] = useState(item ? String(item.quantity) : "1");
  const [unitPrice, setUnitPrice] = useState(item ? String(item.unitPrice) : "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const qty = Number(quantity);
    const price = Number(unitPrice);
    if (description.trim().length < 2) { setError("Description must be at least 2 characters."); return; }
    if (!quantity || Number.isNaN(qty) || qty <= 0) { setError("Quantity must be greater than 0."); return; }
    if (!unitPrice || Number.isNaN(price) || price < 0) { setError("Unit price must be 0 or more."); return; }
    setSubmitting(true);
    try {
      if (mode === "add") {
        await api(`/invoices/${bookingId}/items`, { method: "POST", body: { description: description.trim(), quantity: qty, unitPrice: price } });
      } else if (item) {
        await api(`/invoices/${bookingId}/items/${item.id}`, { method: "PATCH", body: { description: description.trim(), quantity: qty, unitPrice: price } });
      }
      onSaved();
    } catch (err) {
      const text = err instanceof Error ? err.message : "Unable to save item";
      setError(text);
      onError(text);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4" onClick={onClose}>
      <div className="w-full max-w-[440px] rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#e5edf6] px-5 py-4">
          <div><h3 className="text-lg font-extrabold">{mode === "add" ? "Add Line Item" : "Edit Line Item"}</h3><p className="text-sm text-[#596782]">Amount is computed as quantity × unit price.</p></div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6e1ef]" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {error ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p> : null}
          <label className="block"><span className="mb-2 block text-sm font-semibold">Description *</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Flight ticket, Convenience fee" className="h-11 w-full rounded-lg border border-[#d6e1ef] px-3 text-sm outline-none focus:border-[#1688f9]" /></label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block"><span className="mb-2 block text-sm font-semibold">Quantity</span><input type="number" min="1" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="h-11 w-full rounded-lg border border-[#d6e1ef] px-3 text-sm outline-none focus:border-[#1688f9]" /></label>
            <label className="block"><span className="mb-2 block text-sm font-semibold">Unit Price (₹)</span><input type="number" min="0" step="any" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} placeholder="e.g. 2500" className="h-11 w-full rounded-lg border border-[#d6e1ef] px-3 text-sm outline-none focus:border-[#1688f9]" /></label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="h-11 rounded-lg border border-[#d6e1ef] px-6 font-semibold text-[#405174]">Cancel</button>
            <button type="submit" disabled={submitting} className="h-11 rounded-lg bg-[#1688f9] px-6 font-bold text-white disabled:opacity-60">{submitting ? "Saving..." : "Save Item"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PaymentModal({ invoice, bookingId, onClose, onSaved, onError }: { invoice: InvoiceData; bookingId: string; onClose: () => void; onSaved: () => void; onError: (text: string) => void }) {
  const [status, setStatus] = useState<"UNPAID" | "PARTIAL" | "PAID">(invoice.paymentStatus);
  const [paidAmount, setPaidAmount] = useState(invoice.paymentStatus === "PARTIAL" ? String(invoice.paidAmount) : "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    let body: Record<string, unknown> = { status };
    if (status === "PARTIAL") {
      const parsed = Number(paidAmount);
      if (!paidAmount || Number.isNaN(parsed) || parsed <= 0) { setError("Enter the amount collected."); return; }
      if (parsed >= invoice.total) { setError("Partial payment must be less than the total. Use Mark as Paid instead."); return; }
      body.paidAmount = parsed;
    }
    setSubmitting(true);
    try {
      await api(`/invoices/${bookingId}/payment`, { method: "PATCH", body });
      onSaved();
    } catch (err) {
      const text = err instanceof Error ? err.message : "Unable to update payment";
      setError(text);
      onError(text);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4" onClick={onClose}>
      <div className="w-full max-w-[420px] rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#e5edf6] px-5 py-4">
          <div><h3 className="text-lg font-extrabold">Update Payment</h3><p className="text-sm text-[#596782]">Total: {formatMoney(invoice.total)} · Due: {formatMoney(invoice.due)}</p></div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6e1ef]" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {error ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p> : null}
          <div>
            <span className="mb-2 block text-sm font-semibold">Payment Status</span>
            <div className="grid grid-cols-3 gap-2">
              {(["UNPAID", "PARTIAL", "PAID"] as const).map((option) => (
                <button key={option} type="button" onClick={() => setStatus(option)} className={`rounded-lg border px-3 py-3 text-sm font-bold capitalize ${status === option ? "border-[#1688f9] bg-[#eef6ff] ring-2 ring-blue-100" : "border-[#d6e1ef]"}`}>{option.toLowerCase()}</button>
              ))}
            </div>
          </div>
          {status === "PARTIAL" ? (
            <label className="block"><span className="mb-2 block text-sm font-semibold">Amount Collected (₹) *</span><input type="number" min="0" step="any" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} placeholder="e.g. 5000" className="h-11 w-full rounded-lg border border-[#d6e1ef] px-3 text-sm outline-none focus:border-[#1688f9]" /></label>
          ) : null}
          {status === "PAID" ? <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">Marks the invoice as fully paid.</p> : null}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="h-11 rounded-lg border border-[#d6e1ef] px-6 font-semibold text-[#405174]">Cancel</button>
            <button type="submit" disabled={submitting} className="h-11 rounded-lg bg-[#1688f9] px-6 font-bold text-white disabled:opacity-60">{submitting ? "Saving..." : "Save"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatMoney(value: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(Math.round(value * 100) / 100);
}

function formatRate(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function formatInvoiceDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}