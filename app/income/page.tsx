"use client";

import { AppShell } from "@/components/dashboard/app-shell";
import { StatCard } from "@/components/dashboard/ui";
import { useApi } from "@/lib/hooks";
import { api, formatCurrency } from "@/lib/api";
import { FormEvent, useState } from "react";
import { Banknote, CalendarDays, Plus, Search, Trash2, TrendingUp, Wallet, X } from "lucide-react";

interface IncomeRow {
  id: string;
  category: "TICKET_SALE" | "COMMISSION" | "REFUND" | "OTHER";
  title: string;
  note?: string | null;
  amount: number;
  currency: string;
  reference?: string | null;
  receivedOn: string;
  createdAt: string;
}

interface IncomeList {
  items: IncomeRow[];
  meta: { page: number; limit: number; total: number; pages: number };
  summary: { total: number; count: number; byCategory: Array<{ category: string; total: number; count: number }> };
}

const CATEGORY_META: Record<IncomeRow["category"], { label: string; cls: string }> = {
  TICKET_SALE: { label: "Ticket Sale", cls: "bg-[#e0f2fe] text-[#0369a1]" },
  COMMISSION: { label: "Commission", cls: "bg-[#fff0dc] text-[#fb8500]" },
  REFUND: { label: "Refund", cls: "bg-rose-50 text-rose-600" },
  OTHER: { label: "Other", cls: "bg-[#e8edf5] text-[#5a6577]" },
};

export default function IncomePage() {
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const list = useApi<IncomeList>(`/incomes?${search ? `search=${encodeURIComponent(search)}` : ""}${from ? `&from=${encodeURIComponent(from)}` : ""}${to ? `&to=${encodeURIComponent(to)}` : ""}`);
  const [actionError, setActionError] = useState("");
  const [toast, setToast] = useState("");

  const byCategory = new Map(list.data?.summary.byCategory.map((c) => [c.category, c.total]) ?? []);
  const pick = (c: string) => byCategory.get(c) ?? 0;

  async function handleDelete(id: string) {
    setActionError("");
    try {
      await api(`/incomes/${id}`, { method: "DELETE" });
      list.refetch();
      setToast("Income record removed.");
      window.setTimeout(() => setToast(""), 3000);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to delete income record");
    }
  }

  const statCards = [
    { title: "Total Income", value: list.data ? formatCurrency(list.data.summary.total) : "—", icon: Wallet, tone: "blue", sub: `${list.data?.summary.count ?? 0} records` },
    { title: "Commission", value: list.data ? formatCurrency(pick("COMMISSION")) : "—", icon: TrendingUp, tone: "purple", sub: "earned commission" },
    { title: "Ticket Sales", value: list.data ? formatCurrency(pick("TICKET_SALE")) : "—", icon: Banknote, tone: "orange", sub: "manual ticket income" },
    { title: "Other Income", value: list.data ? formatCurrency(pick("OTHER") + pick("REFUND")) : "—", icon: Wallet, tone: "rose", sub: "miscellaneous" },
  ];

  return (
    <AppShell>
      <div className="space-y-4 pt-2">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-[34px] font-extrabold tracking-[-0.04em]">Income</h1>
            <p className="text-base text-[#596782]">Record manual income like commissions, refunds and extra revenue beyond bookings.</p>
          </div>
          <button onClick={() => setAddOpen(true)} className="flex h-11 items-center gap-2 rounded-lg bg-[#1688f9] px-6 font-bold text-white"><Plus className="h-4 w-4" />Add Income</button>
        </div>

        {actionError ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{actionError}</p> : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{statCards.map((s) => <StatCard key={s.title} {...s} />)}</div>

        <section className="overflow-hidden rounded-xl border border-[#dce7f4] bg-white shadow-[0_10px_24px_rgba(31,61,105,0.04)]">
          <div className="flex flex-col gap-3 border-b border-[#e5edf6] p-4 lg:flex-row lg:items-center">
            <div className="flex h-11 flex-1 items-center gap-3 rounded-lg border border-[#d6e1ef] px-3"><Search className="h-4 w-4 text-[#65728a]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by title, reference or note..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div>
            <div className="flex h-11 items-center gap-2 rounded-lg border border-[#d6e1ef] px-3"><CalendarDays className="h-4 w-4 shrink-0 text-[#65728a]" /><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" aria-label="From date" /><span className="text-[#65728a]">→</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" aria-label="To date" /></div>
            <button onClick={() => { setSearch(""); setFrom(""); setTo(""); }} className="h-11 rounded-lg border border-[#d6e1ef] bg-white px-5 text-sm font-semibold">Reset</button>
          </div>
          {list.error ? <p className="px-5 py-6 text-center text-sm text-rose-600">{list.error}</p> : null}
          {!list.loading && list.data && list.data.items.length === 0 ? <p className="px-5 py-12 text-center text-sm text-[#596782]">No income recorded yet. Add commission or other manual income to see it here.</p> : null}
          {list.loading ? <p className="px-5 py-12 text-center text-sm text-[#596782]">Loading income…</p> : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-[#f4f7fb] text-[#071333]">
                <tr>
                  <th className="px-4 py-4 font-semibold">Income</th>
                  <th className="px-4 py-4 font-semibold">Category</th>
                  <th className="px-4 py-4 font-semibold">Reference</th>
                  <th className="px-4 py-4 font-semibold">Date</th>
                  <th className="px-4 py-4 text-right font-semibold">Amount</th>
                  <th className="px-4 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5edf6]">
                {(list.data?.items ?? []).map((row) => {
                  const meta = CATEGORY_META[row.category] ?? CATEGORY_META.OTHER;
                  return (
                    <tr key={row.id} className="bg-white hover:bg-blue-50/30">
                      <td className="px-4 py-3"><div className="font-semibold text-[#071333]">{row.title}</div>{row.note ? <div className="text-[#65728a]">{row.note}</div> : null}</td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-bold ${meta.cls}`}>{meta.label}</span></td>
                      <td className="px-4 py-3 text-[#405174]">{row.reference ?? "—"}</td>
                      <td className="px-4 py-3 text-[#405174]">{formatDateInput(row.receivedOn)}</td>
                      <td className="px-4 py-3 text-right font-bold text-[#071333]">{formatCurrency(row.amount, row.currency)}</td>
                      <td className="px-4 py-3 text-right"><button onClick={() => handleDelete(row.id)} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d4dfed] text-rose-500 transition hover:bg-rose-50" aria-label="Delete income record"><Trash2 className="h-4 w-4" /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {addOpen ? <AddIncomeModal onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); list.refetch(); }} /> : null}
      {toast ? <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-lg bg-[#071832] px-5 py-3 text-sm font-semibold text-white shadow-2xl">{toast}</div> : null}
    </AppShell>
  );
}

function AddIncomeModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState<IncomeRow["category"]>("COMMISSION");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [receivedOn, setReceivedOn] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const parsed = Number(amount);
    if (title.trim().length < 2) { setError("Title must be at least 2 characters."); return; }
    if (!amount || Number.isNaN(parsed) || parsed <= 0) { setError("Amount must be greater than 0."); return; }
    setSubmitting(true);
    try {
      await api("/incomes", {
        method: "POST",
        body: {
          category,
          title: title.trim(),
          amount: parsed,
          reference: reference.trim() || undefined,
          note: note.trim() || undefined,
          receivedOn: receivedOn || undefined,
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add income");
    } finally {
      setSubmitting(false);
    }
  }

  const categoryOptions: Array<IncomeRow["category"]> = ["TICKET_SALE", "COMMISSION", "REFUND", "OTHER"];
  const hints: Record<IncomeRow["category"], { label: string; hint: string }> = {
    TICKET_SALE: { label: "Ticket Sale", hint: "Flight booking income" },
    COMMISSION: { label: "Commission", hint: "Agent/GDS commission" },
    REFUND: { label: "Refund", hint: "Refund received" },
    OTHER: { label: "Other", hint: "Any other income" },
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4" onClick={onClose}>
      <div className="w-full max-w-[520px] rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#e5edf6] px-5 py-4">
          <div><h3 className="text-lg font-extrabold">Add Income</h3><p className="text-sm text-[#596782]">Record commission, refunds or other money received.</p></div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6e1ef]" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {error ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p> : null}
          <div>
            <span className="mb-2 block text-sm font-semibold">Category</span>
            <div className="grid grid-cols-2 gap-3">
              {categoryOptions.map((option) => {
                const meta = hints[option];
                const active = category === option;
                return (
                  <button type="button" key={option} onClick={() => setCategory(option)} className={`rounded-lg border px-4 py-3 text-left text-sm ${active ? "border-[#1688f9] bg-[#eef6ff] ring-2 ring-blue-100" : "border-[#d6e1ef]"}`}>
                    <b>{meta.label}</b><span className="block text-xs text-[#65728a]">{meta.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <label className="block"><span className="mb-2 block text-sm font-semibold">Title *</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Air India agent commission" className="h-11 w-full rounded-lg border border-[#d6e1ef] px-3 text-sm outline-none focus:border-[#1688f9]" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-2 block text-sm font-semibold">Amount (₹) *</span><input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 5000" className="h-11 w-full rounded-lg border border-[#d6e1ef] px-3 text-sm outline-none focus:border-[#1688f9]" /></label>
            <label className="block"><span className="mb-2 block text-sm font-semibold">Reference</span><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="e.g. PNR / invoice no" className="h-11 w-full rounded-lg border border-[#d6e1ef] px-3 text-sm outline-none focus:border-[#1688f9]" /></label>
          </div>
          <label className="block"><span className="mb-2 block text-sm font-semibold">Date Received</span><span className="relative flex h-11 items-center gap-2 rounded-lg border border-[#d6e1ef] px-3"><CalendarDays className="h-4 w-4 text-[#65728a]" /><input type="date" value={receivedOn} onChange={(event) => setReceivedOn(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" /><span className="text-xs text-[#65728a]">defaults to today</span></span></label>
          <label className="block"><span className="mb-2 block text-sm font-semibold">Note</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="Optional internal note" className="w-full rounded-lg border border-[#d6e1ef] px-3 py-2.5 text-sm outline-none focus:border-[#1688f9]" /></label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="h-11 rounded-lg border border-[#d6e1ef] px-6 font-semibold text-[#405174]">Cancel</button>
            <button type="submit" disabled={submitting} className="flex h-11 items-center gap-2 rounded-lg bg-[#1688f9] px-6 font-bold text-white disabled:opacity-60">{submitting ? "Saving..." : "Save Income"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatDateInput(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}