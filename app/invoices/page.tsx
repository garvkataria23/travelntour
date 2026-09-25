"use client";

import { AppShell } from "@/components/dashboard/app-shell";
import { StatCard } from "@/components/dashboard/ui";
import { useApi } from "@/lib/hooks";
import { api, formatCurrency } from "@/lib/api";
import { useState } from "react";
import { Banknote, CheckCircle2, ChevronLeft, ChevronRight, Download, FileText, Receipt, Search, TrendingDown } from "lucide-react";
import Link from "next/link";

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface InvoiceRow {
  id: string;
  pnr: string;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  invoiceNumber: string | null;
  invoiceIssuedAt: string | null;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  status: string;
  fromCity: string;
  toCity: string;
  departureDate: string;
  departureTime: string;
  currency: string;
  subtotal: number;
  total: number;
  paidAmount: number;
  due: number;
  items: InvoiceItem[];
}

interface InvoiceList {
  items: InvoiceRow[];
  stats: {
    issued: number;
    pending: number;
    partial: number;
    paid: number;
    totalBilled: number;
    totalCollected: number;
    outstanding: number;
  };
  meta: { page: number; limit: number; total: number; pages: number };
}

export default function InvoicesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [selected, setSelected] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [actionError, setActionError] = useState("");

  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  if (status) params.set("paymentStatus", status);
  params.set("page", String(page));
  params.set("limit", String(limit));

  const list = useApi<InvoiceList>(`/invoices?${params.toString()}`);
  const pageIds = list.data?.items.map((row) => row.id) ?? [];

  function toggleSelect(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectAll() {
    if (pageIds.length > 0 && pageIds.every((id) => selected.includes(id))) {
      setSelected((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelected((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  }

  async function downloadPdf(id: string) {
    const file = await api<{ fileName: string; base64: string }>(`/invoices/${id}/pdf`);
    const link = document.createElement("a");
    link.href = `data:application/pdf;base64,${file.base64}`;
    link.download = file.fileName || "invoice.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function downloadSelected() {
    setActionError("");
    setDownloading(true);
    try {
      for (const id of selected) {
        await downloadPdf(id);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to download invoices");
    } finally {
      setDownloading(false);
    }
  }

  async function downloadAll() {
    setActionError("");
    setDownloading(true);
    try {
      const allParams = new URLSearchParams();
      if (search.trim()) allParams.set("search", search.trim());
      if (status) allParams.set("paymentStatus", status);
      allParams.set("page", "1");
      allParams.set("limit", "1000");
      const all = await api<InvoiceList>(`/invoices?${allParams.toString()}`, { skipCache: true });
      const ids = (all.items ?? []).map((row) => row.id);
      for (const id of ids) {
        await downloadPdf(id);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to download invoices");
    } finally {
      setDownloading(false);
    }
  }

  const stats = list.data?.stats;

  return (
    <AppShell>
      <div className="space-y-4 pt-2">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-[34px] font-extrabold tracking-[-0.04em]">Invoices</h1>
            <p className="text-base text-[#596782]">Issue, track and send invoices to your customers on WhatsApp.</p>
          </div>
          <Link href="/bookings" className="flex h-11 items-center gap-2 rounded-lg bg-[#1688f9] px-6 font-bold text-white"><FileText className="h-4 w-4" />Issue from Bookings</Link>
        </div>

        {actionError ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{actionError}</p> : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Total Billed" value={stats ? formatCurrency(stats.totalBilled) : "—"} icon={Receipt} tone="blue" sub={`${stats?.issued ?? 0} invoices issued`} />
          <StatCard title="Collected" value={stats ? formatCurrency(stats.totalCollected) : "—"} icon={Banknote} tone="green" sub="amount received" />
          <StatCard title="Outstanding" value={stats ? formatCurrency(stats.outstanding) : "—"} icon={TrendingDown} tone="orange" sub="yet to be collected" />
          <StatCard title="Payment Status" value={`${stats?.paid ?? 0}`} icon={CheckCircle2} tone="purple" sub={`${stats?.pending ?? 0} unpaid · ${stats?.partial ?? 0} partial`} />
        </div>

        <section className="overflow-hidden rounded-xl border border-[#dce7f4] bg-white shadow-[0_10px_24px_rgba(31,61,105,0.04)]">
          <div className="flex flex-col gap-3 border-b border-[#e5edf6] p-4 sm:flex-row sm:items-center">
            <div className="flex h-11 flex-1 items-center gap-3 rounded-lg border border-[#d6e1ef] px-3"><Search className="h-4 w-4 text-[#65728a]" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search by invoice number, PNR, customer or flight..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div>
            <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-11 rounded-lg border border-[#d6e1ef] bg-white px-4 text-sm outline-none">
              <option value="">All payment status</option>
              <option value="UNPAID">Unpaid</option>
              <option value="PARTIAL">Partial</option>
              <option value="PAID">Paid</option>
            </select>
            <button onClick={downloadAll} disabled={downloading} className="flex h-11 items-center gap-2 rounded-lg border border-[#d6e1ef] bg-white px-4 text-sm font-semibold text-[#405174] disabled:opacity-50"><Download className="h-4 w-4" />Download All</button>
            <button onClick={downloadSelected} disabled={downloading || selected.length === 0} className="flex h-11 items-center gap-2 rounded-lg bg-[#071832] px-4 text-sm font-bold text-white disabled:opacity-50"><Download className="h-4 w-4" />{downloading ? "Downloading..." : selected.length > 0 ? `Download PDFs (${selected.length})` : "Download PDFs"}</button>
          </div>

          {list.error ? <p className="px-5 py-6 text-center text-sm text-rose-600">{list.error}</p> : null}
          {!list.loading && list.data && list.data.items.length === 0 ? <p className="px-5 py-12 text-center text-sm text-[#596782]">No invoices found. Issue an invoice from any booking to see it here.</p> : null}
          {list.loading ? <p className="px-5 py-12 text-center text-sm text-[#596782]">Loading invoices…</p> : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-[#f4f7fb] text-[#071333]">
                <tr>
                  <th className="w-12 px-4 py-4"><input type="checkbox" checked={pageIds.length > 0 && pageIds.every((id) => selected.includes(id))} onChange={toggleSelectAll} aria-label="Select all on page" className="h-4 w-4 accent-[#1688f9]" /></th>
                  <th className="px-4 py-4 font-semibold">Invoice #</th>
                  <th className="px-4 py-4 font-semibold">Customer</th>
                  <th className="px-4 py-4 font-semibold">PNR</th>
                  <th className="px-4 py-4 font-semibold">Route</th>
                  <th className="px-4 py-4 font-semibold">Issued On</th>
                  <th className="px-4 py-4 text-right font-semibold">Total</th>
                  <th className="px-4 py-4 text-right font-semibold">Paid</th>
                  <th className="px-4 py-4 font-semibold">Status</th>
                  <th className="px-4 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5edf6]">
                {(list.data?.items ?? []).map((row) => (
                  <tr key={row.id} className={`bg-white hover:bg-blue-50/30 ${selected.includes(row.id) ? "bg-blue-50/50" : ""}`}>
                    <td className="px-4 py-3"><input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggleSelect(row.id)} aria-label={`Select ${row.invoiceNumber ?? row.pnr}`} className="h-4 w-4 accent-[#1688f9]" /></td>
                    <td className="px-4 py-3"><div className="font-bold text-[#087df0]">{row.invoiceNumber ?? "—"}</div>{row.due > 0 ? <div className="text-xs text-[#65728a]">due {formatCurrency(row.due, row.currency)}</div> : null}</td>
                    <td className="px-4 py-3"><div className="font-semibold text-[#071333]">{row.customerName ?? "—"}</div>{row.customerPhone ? <div className="text-[#65728a]">{row.customerPhone}</div> : null}</td>
                    <td className="px-4 py-3 font-medium">{row.pnr}</td>
                    <td className="px-4 py-3 text-[#405174]">{row.fromCity || "—"} → {row.toCity || "—"}</td>
                    <td className="px-4 py-3 text-[#405174]">{formatDate(row.invoiceIssuedAt)}</td>
                    <td className="px-4 py-3 text-right font-bold text-[#071333]">{formatCurrency(row.total, row.currency)}</td>
                    <td className="px-4 py-3 text-right font-medium text-[#00a451]">{formatCurrency(row.paidAmount, row.currency)}</td>
                    <td className="px-4 py-3"><PaymentBadge value={row.paymentStatus} /></td>
                    <td className="px-4 py-3 text-right"><Link href={`/bookings/${row.id}/invoice`} className="rounded-lg border border-[#d4dfed] px-4 py-2 font-semibold text-[#405174] transition hover:bg-slate-50">View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(list.data?.meta?.total ?? 0) > 0 ? (
            <div className="flex flex-col items-center justify-between gap-4 border-t border-[#e5edf6] px-5 py-4 text-sm text-[#455574] sm:flex-row">
              <span>Showing {(list.data!.meta.page - 1) * list.data!.meta.limit + 1} to {Math.min(list.data!.meta.page * list.data!.meta.limit, list.data!.meta.total)} of {list.data!.meta.total} invoices</span>
              <div className="flex items-center gap-2">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6e1ef] disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                <span className="px-2">Page {list.data!.meta.page} of {list.data!.meta.pages}</span>
                <button disabled={page >= list.data!.meta.pages} onClick={() => setPage(page + 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6e1ef] disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
              </div>
              <label className="flex items-center gap-3 rounded-lg border border-[#d6e1ef] bg-white px-4 py-2">Rows per page
                <select value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }} className="bg-transparent font-bold outline-none"><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select>
              </label>
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}

function PaymentBadge({ value }: { value: string }) {
  if (value === "PAID") return <span className="inline-flex items-center gap-1 rounded-md bg-[#d9f7e8] px-3 py-1 font-bold text-[#00a451]"><CheckCircle2 className="h-3.5 w-3.5" />Paid</span>;
  if (value === "PARTIAL") return <span className="inline-flex items-center gap-1 rounded-md bg-[#e0efff] px-3 py-1 font-bold text-[#0979ee]">Partial</span>;
  return <span className="inline-flex items-center gap-1 rounded-md bg-[#fff0dc] px-3 py-1 font-bold text-[#fb8500]">Unpaid</span>;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}