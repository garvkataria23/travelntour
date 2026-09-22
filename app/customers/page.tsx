"use client";

import Link from "next/link";
import { AppShell } from "@/components/dashboard/app-shell";
import { Pagination, StatCard, initialsOf } from "@/components/dashboard/ui";
import { useApi } from "@/lib/hooks";
import { api, formatCurrency, formatDate, statusTone } from "@/lib/api";
import { AlertTriangle, CalendarDays, Edit, Mail, MessageCircle, MoreHorizontal, Phone, Plane, Plus, Repeat, Search, UserCheck, Users, UserX, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CustomerStats {
  total: number;
  active: number;
  inactive: number;
  repeat: number;
}

interface CustomerMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface CustomerItem {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  createdAt: string;
  totalBookings: number;
  lastJourney: {
    departureDate: string;
    route: { fromAirport: string | null; toAirport: string | null; fromCity: string | null; toCity: string | null };
    status: string;
  } | null;
}

interface CustomerList {
  items: CustomerItem[];
  meta: CustomerMeta;
}

interface CustomerDetail {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  createdAt: string;
  stats: { totalBookings: number; upcomingTrips: number; totalSpent: number };
  bookings: Array<{
    id: string;
    pnr: string;
    flightNumber: string | null;
    airline: string | null;
    fromCity: string | null;
    fromAirport: string | null;
    toCity: string | null;
    toAirport: string | null;
    departureDate: string;
    status: string;
    amount: number | null;
  }>;
  messages: Array<{ id: string; name: string; messageType: string; scheduledAt: string; status: string; renderedContent: string | null }>;
}

function routeLabel(city: string | null, airport: string | null): string {
  return airport || city || "—";
}

function CustomerBadge({ status }: { status: string }) {
  const tone = statusTone(status);
  if (tone === "success") return <span className="rounded-md bg-[#d9f7e8] px-4 py-1 text-sm font-bold text-[#00a451]">● Active</span>;
  return <span className="rounded-md bg-rose-100 px-4 py-1 text-sm font-bold text-rose-600">● Inactive</span>;
}

function ToneBadge({ status }: { status: string }) {
  const tone = statusTone(status);
  if (tone === "success") return <span className="rounded-md bg-[#d9f7e8] px-2.5 py-0.5 text-xs font-bold text-[#00a451]">SENT</span>;
  if (tone === "pending") return <span className="rounded-md bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-600">SCHEDULED</span>;
  if (tone === "danger") return <span className="rounded-md bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-600">FAILED</span>;
  return <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">PENDING</span>;
}

function CustomerFormModal({ mode, customer, onClose, onSaved }: { mode: "create" | "edit"; customer: CustomerItem | null; onClose: () => void; onSaved: (info: { existed: boolean; id?: string }) => void }) {
  const [form, setForm] = useState({ name: customer?.name ?? "", phone: customer?.phone ?? "", email: customer?.email ?? "", status: customer?.status ?? "ACTIVE" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mError, setMError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Name is required.";
    if (!/^\d{10}$/.test(form.phone.replace(/\D/g, ""))) errs.phone = "Enter a valid 10-digit phone number.";
    if (form.email && !EMAIL_RE.test(form.email.trim())) errs.email = "Enter a valid email address.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSubmitting(true);
    setMError("");
    try {
      if (mode === "edit" && customer) {
        await api(`/customers/${customer.id}`, { method: "PATCH", body: { name: form.name, phone: form.phone, email: form.email.trim() || undefined, status: form.status } });
        onSaved({ existed: false });
      } else {
        const res = await api<{ id?: string; existed?: boolean }>("/customers", { method: "POST", body: { name: form.name, phone: form.phone, email: form.email.trim() || undefined } });
        onSaved({ existed: Boolean(res.existed), id: res.id });
      }
    } catch (err) {
      setMError(err instanceof Error ? err.message : "Unable to save customer");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold">{mode === "edit" ? "Edit Customer" : "Add Customer"}</h2>
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5 text-[#596782]" /></button>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <Field label="Full Name" required error={errors.name}>
            <input value={form.name} onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setErrors((er) => { const n = { ...er }; delete n.name; return n; }); }} placeholder="e.g. Rahul Sharma" className="h-11 w-full rounded-md border border-[#cfdbea] px-3 text-sm outline-none focus:border-[#1688f9]" />
          </Field>
          <Field label="WhatsApp Number" required error={errors.phone}>
            <input value={form.phone} onChange={(e) => { setForm((f) => ({ ...f, phone: e.target.value })); setErrors((er) => { const n = { ...er }; delete n.phone; return n; }); }} placeholder="98765 43210" className="h-11 w-full rounded-md border border-[#cfdbea] px-3 text-sm outline-none focus:border-[#1688f9]" />
          </Field>
          <Field label="Email" required={false} error={errors.email}>
            <input value={form.email} onChange={(e) => { setForm((f) => ({ ...f, email: e.target.value })); setErrors((er) => { const n = { ...er }; delete n.email; return n; }); }} placeholder="rahul@gmail.com" className="h-11 w-full rounded-md border border-[#cfdbea] px-3 text-sm outline-none focus:border-[#1688f9]" />
          </Field>
          {mode === "edit" ? (
            <Field label="Status" required={false}>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="h-11 w-full rounded-md border border-[#cfdbea] px-3 text-sm outline-none focus:border-[#1688f9]">
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </Field>
          ) : null}
          {mError ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{mError}</p> : null}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-[#d6e1ef] bg-white px-6 py-2.5 font-semibold">Cancel</button>
            <button disabled={submitting} className="rounded-lg bg-[#1688f9] px-6 py-2.5 font-bold text-white disabled:opacity-60">{submitting ? "Saving..." : mode === "edit" ? "Save Changes" : "Add Customer"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, required, error, children }: { label: string; required: boolean; error?: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-semibold">{label} {required ? <span className="text-red-500">*</span> : null}</span>{children}{error ? <span className="mt-1.5 block text-[13px] font-medium text-rose-600">{error}</span> : null}</label>;
}

function DeleteDialog({ customer, onClose, onDeleted }: { customer: CustomerItem; onClose: () => void; onDeleted: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [dError, setDError] = useState("");

  async function handleDelete() {
    setSubmitting(true);
    setDError("");
    try {
      await api(`/customers/${customer.id}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      setDError(err instanceof Error ? err.message : "Unable to delete customer");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-rose-100 text-rose-600"><AlertTriangle className="h-5 w-5" /></div>
        <h2 className="text-lg font-extrabold">Delete customer?</h2>
        <p className="mt-1 text-sm text-[#596782]">This will permanently remove <b>{customer.name}</b>. Customers with bookings cannot be deleted.</p>
        {dError ? <p className="mt-3 rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{dError}</p> : null}
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-[#d6e1ef] bg-white px-6 py-2.5 font-semibold">Cancel</button>
          <button onClick={handleDelete} disabled={submitting} className="rounded-lg bg-rose-600 px-6 py-2.5 font-bold text-white disabled:opacity-60">{submitting ? "Deleting..." : "Delete"}</button>
        </div>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<CustomerItem | null>(null);
  const [deleteRow, setDeleteRow] = useState<CustomerItem | null>(null);
  const [notice, setNotice] = useState("");
  const pickedRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const params = new URLSearchParams();
  if (query) params.set("search", query);
  if (status) params.set("status", status);
  params.set("page", String(page));
  params.set("limit", "8");

  const stats = useApi<CustomerStats>("/customers/stats");
  const list = useApi<CustomerList>(`/customers?${params.toString()}`);
  const panel = useApi<CustomerDetail>(selectedId ? `/customers/${selectedId}` : null);

  useEffect(() => {
    if (list.data?.items.length && !pickedRef.current) {
      pickedRef.current = true;
      setSelectedId(list.data.items[0].id);
    }
  }, [list.data]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3200);
    return () => clearTimeout(t);
  }, [notice]);

  const rows = (list.data?.items ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    initials: initialsOf(c.name),
    phone: c.phone,
    email: c.email ?? "",
    bookings: c.totalBookings,
    last: c.lastJourney ? `${formatDate(c.lastJourney.departureDate)}\n${routeLabel(c.lastJourney.route.fromCity, c.lastJourney.route.fromAirport)} → ${routeLabel(c.lastJourney.route.toCity, c.lastJourney.route.toAirport)}` : "—",
    status: c.status,
  }));

  const hasDeleteVisible = Boolean(deleteRow);

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex flex-col justify-between gap-4 pt-2 sm:flex-row sm:items-start">
          <div><h1 className="text-[34px] font-extrabold tracking-[-0.04em]">Customers</h1><p className="text-base text-[#596782]">Manage your customer database, view travel history and engage with your travelers.</p></div>
          <button onClick={() => setAddOpen(true)} className="flex h-[50px] items-center gap-3 rounded-lg bg-[#1688f9] px-7 font-bold text-white"><Plus className="h-5 w-5" />Add Customer</button>
        </div>
        {list.error ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{list.error}</p> : null}
        {notice ? <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p> : null}
        <div className="grid gap-4 xl:grid-cols-[1fr_342px]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard title="Total Customers" value={stats.data ? String(stats.data.total) : "—"} icon={Users} tone="blue" delta="" sub="all customers" />
              <StatCard title="Active Customers" value={stats.data ? String(stats.data.active) : "—"} icon={UserCheck} tone="green" delta="" sub="active customers" />
              <StatCard title="Repeat Customers" value={stats.data ? String(stats.data.repeat) : "—"} icon={Repeat} tone="purple" delta="" sub="with 2+ bookings" />
              <StatCard title="Inactive Customers" value={stats.data ? String(stats.data.inactive) : "—"} icon={UserX} tone="orange" delta="" sub="inactive customers" />
            </div>
            <section className="overflow-hidden rounded-xl border border-[#dce7f4] bg-white shadow-sm">
              <div className="grid gap-3 p-3 md:grid-cols-[1.4fr_.9fr_.4fr]">
                <div className="flex h-11 items-center gap-3 rounded-lg border border-[#d6e1ef] px-3"><Search className="h-5 w-5 text-[#405174]" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="min-w-0 flex-1 outline-none" placeholder="Search customers..." /></div>
                <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-11 rounded-lg border border-[#d6e1ef] px-3 text-sm outline-none">{!status ? <option value="">All Status</option> : null}<option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
                <button onClick={() => { setSearch(""); setQuery(""); setStatus(""); setPage(1); }} className="h-11 rounded-lg border border-[#d6e1ef] font-semibold">Reset</button>
              </div>
              <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-[#f4f7fb]"><tr><th>Customer</th><th>Contact</th><th>Total Bookings</th><th>Last Journey</th><th>Status</th><th>Actions</th></tr></thead><tbody className="divide-y divide-[#e5edf6]">
                {list.loading && rows.length === 0 ? <tr><td colSpan={7} className="px-5 py-8 text-center text-[#596782]">Loading customers...</td></tr> : null}
                {!list.loading && rows.length === 0 ? <tr><td colSpan={7} className="px-5 py-8 text-center text-[#596782]">No customers found.</td></tr> : null}
                {rows.map((c, i) => <tr key={c.id} onClick={() => setSelectedId(c.id)} className={`cursor-pointer ${selectedId === c.id ? "bg-blue-50/60" : "hover:bg-blue-50/30"}`}><td><Link href={`/customers/${c.id}`} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}><span className={`grid h-10 w-10 place-items-center rounded-full font-bold text-blue-700 ${i % 2 ? "bg-purple-100" : "bg-blue-100"}`}>{c.initials}</span><span><b>{c.name}</b></span></Link></td><td><div>{c.phone}</div><div className="text-[#526282]">{c.email || "—"}</div></td><td>{c.bookings}</td><td className="whitespace-pre-line">{c.last}</td><td><CustomerBadge status={c.status} /></td><td onClick={(e) => e.stopPropagation()}><div className="relative"><button onClick={() => setMenuOpen(menuOpen === c.id ? null : c.id)} className="grid h-10 w-10 place-items-center rounded-lg border border-[#d4dfed]"><MoreHorizontal className="h-4 w-4" /></button>{menuOpen === c.id ? <><div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} /><div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-[#d6e1ef] bg-white py-1 shadow-lg"><Link href={`/customers/${c.id}`} onClick={() => setMenuOpen(null)} className="block px-3 py-2 text-sm font-medium hover:bg-blue-50">View profile</Link><button onClick={() => { setMenuOpen(null); setEditRow(list.data?.items.find((x) => x.id === c.id) ?? null); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-blue-50"><Edit className="h-4 w-4" /> Edit</button><button onClick={() => { setMenuOpen(null); setDeleteRow(list.data?.items.find((x) => x.id === c.id) ?? null); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"><AlertTriangle className="h-4 w-4" /> Delete</button></div></> : null}</div></td></tr>)}
              </tbody></table></div>
              <Pagination total={list.data?.meta.total} page={list.data?.meta.page ?? 1} limit={8} onPageChange={(p) => setPage(p)} />
            </section>
          </div>

          <aside className="rounded-xl border border-[#dce7f4] bg-white p-4 shadow-sm">
            {!selectedId || (panel.error && !panel.data) ? <div className="py-14 text-center text-[#596782]"><div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-blue-50"><Users className="h-6 w-6 text-[#1688f9]" /></div>Select a customer to view their details here.</div>
            : panel.loading && !panel.data ? <div className="py-14 text-center text-[#596782]">Loading customer...</div>
            : panel.data ? <CustomerPanel data={panel.data} /> : null}
          </aside>
        </div>
      </div>

      {addOpen ? <CustomerFormModal mode="create" customer={null} onClose={() => setAddOpen(false)} onSaved={(info) => { setAddOpen(false); stats.refetch(); list.refetch(); if (info.id) setSelectedId(info.id); setNotice(info.existed ? "Phone already registered — linked to the existing customer." : "Customer added successfully."); }} /> : null}
      {editRow ? <CustomerFormModal mode="edit" customer={editRow} onClose={() => setEditRow(null)} onSaved={() => { setEditRow(null); stats.refetch(); list.refetch(); panel.refetch(); setNotice("Customer updated successfully."); }} /> : null}
      {hasDeleteVisible ? <DeleteDialog customer={deleteRow!} onClose={() => setDeleteRow(null)} onDeleted={() => { setDeleteRow(null); stats.refetch(); list.refetch(); if (selectedId === deleteRow?.id) setSelectedId(null); setNotice("Customer deleted."); }} /> : null}
    </AppShell>
  );
}

function CustomerPanel({ data }: { data: CustomerDetail }) {
  const [tab, setTab] = useState("overview");
  const tabs = ["overview", "bookings", "messages", "notes"];
  return (
    <div>
      <div className="flex justify-end"><button onClick={() => setTab("overview")} aria-label="Close panel" className="text-[#526282]"><X /></button></div>
      <div className="flex items-center gap-4">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-blue-100 text-2xl font-bold text-blue-700">{initialsOf(data.name)}</span>
        <div><h2 className="text-lg font-extrabold">{data.name}</h2><p className="text-[#596782]">Member since {formatDate(data.createdAt)}</p></div>
        <span className="ml-auto"><CustomerBadge status={data.status} /></span>
      </div>
      <div className="mt-5 flex border-b border-[#d6e1ef]">
        {tabs.map((t) => <button key={t} onClick={() => setTab(t)} className={`px-4 py-3 capitalize first-letter:uppercase ${tab === t ? "border-b-2 border-[#1688f9] font-bold text-[#087df0]" : "text-[#596782]"}`}>{t}</button>)}
        <button onClick={() => setTab("bookings")} className={`ml-auto px-2 py-3 text-sm font-bold text-[#087df0] ${tab === "bookings" ? "border-b-2 border-[#1688f9]" : ""}`}>View All</button>
      </div>

      {tab === "overview" ? <OverviewTab data={data} /> : tab === "bookings" ? <BookingsTab data={data} /> : tab === "messages" ? <MessagesTab data={data} /> : <div className="py-10 text-center text-sm text-[#596782]">No notes saved yet.</div>}
    </div>
  );
}

function OverviewTab({ data }: { data: CustomerDetail }) {
  return <div>
    <div className="space-y-4 py-5 text-sm">
      <p><Phone className="mr-4 inline h-4 w-4" />+91 {data.phone} <MessageCircle className="float-right h-5 w-5 text-green-500" /></p>
      <p><Mail className="mr-4 inline h-4 w-4" />{data.email || "—"}</p>
      <p><CalendarDays className="mr-4 inline h-4 w-4" />Joined {formatDate(data.createdAt)}</p>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Cell value={String(data.stats.totalBookings)} label="Total Bookings" />
      <Cell value={formatCurrency(data.stats.totalSpent)} label="Total Spent" />
      <Cell value={String(data.stats.upcomingTrips)} label="Upcoming Trips" />
      <Cell value={String(data.messages.length)} label="WhatsApp Messages" />
    </div>
    <h3 className="mt-5 font-extrabold">Latest Journey</h3>
    <div className="mt-2 space-y-3">
      {data.bookings.length === 0 ? <p className="text-sm text-[#596782]">No bookings yet.</p> : data.bookings.slice(0, 2).map((b) => <p key={b.id} className="flex items-center gap-3 border-b border-[#e5edf6] pb-3 text-sm"><Plane className="h-4 w-4 shrink-0 text-[#087df0]" /><span className="flex-1"><b>{routeLabel(b.fromCity, b.fromAirport)} → {routeLabel(b.toCity, b.toAirport)}</b><span className="block text-[#596782]">{b.pnr} · {formatDate(b.departureDate)} · {b.airline || "—"}</span></span><CustomerBadge status={b.status === "COMPLETED" ? "ACTIVE" : b.status === "CANCELLED" ? "INACTIVE" : "ACTIVE"} /></p>)}
    </div>
    <Link href={`/bookings?customerId=${data.id}`} className="mt-3 block text-center text-sm font-bold text-[#087df0]">View all bookings →</Link>
  </div>;
}

function BookingsTab({ data }: { data: CustomerDetail }) {
  return <div className="py-4">
    {data.bookings.length === 0 ? <p className="py-8 text-center text-sm text-[#596782]">No bookings yet.</p> : data.bookings.map((b) => <p key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5edf6] py-3 text-sm"><span><b>{routeLabel(b.fromCity, b.fromAirport)} → {routeLabel(b.toCity, b.toAirport)}</b><span className="block text-[#596782]">{b.pnr} · {b.flightNumber || "—"} · {formatDate(b.departureDate)}</span></span><span className="flex items-center gap-2">{formatCurrency(b.amount)}<ToneBadge status={b.status === "CANCELLED" ? "FAILED" : b.status === "COMPLETED" ? "SENT" : "SCHEDULED"} /></span></p>)}
    <Link href={`/bookings?customerId=${data.id}`} className="mt-3 block text-center text-sm font-bold text-[#087df0]">View all bookings →</Link>
  </div>;
}

function MessagesTab({ data }: { data: CustomerDetail }) {
  return <div className="py-4">
    {data.messages.length === 0 ? <p className="py-8 text-center text-sm text-[#596782]">No messages sent yet.</p> : data.messages.slice(0, 8).map((m) => <div key={m.id} className="border-b border-[#e5edf6] py-3 text-sm"><div className="flex items-center justify-between gap-2"><b>{m.name}</b><ToneBadge status={m.status} /></div><p className="mt-0.5 line-clamp-2 text-[#596782]">{m.renderedContent || "—"}</p><p className="mt-0.5 text-xs text-[#8a94a6]">{formatDate(m.scheduledAt, true)}</p></div>)}
    <Link href={`/whatsapp-messages`} className="mt-3 block text-center text-sm font-bold text-[#087df0]">Open WhatsApp Messages →</Link>
  </div>;
}

function Cell({ value, label }: { value: string; label: string }) {
  return <div className="rounded-lg bg-[#f4f8fd] p-4"><b className="text-xl">{value}</b><p className="text-[#596782]">{label}</p></div>;
}