"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { StatCard, StatusBadge, initialsOf } from "@/components/dashboard/ui";
import { useApi } from "@/lib/hooks";
import { api, formatCurrency, formatDate, statusTone } from "@/lib/api";
import { Ban, CalendarDays, Edit, Mail, MessageCircle, Phone, Plane, PlaneLanding, PlaneTakeoff, Plus, Star, X } from "lucide-react";
import { FormEvent, useState } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CustomerBooking {
  id: string;
  pnr: string;
  flightNumber: string | null;
  airline: string | null;
  fromAirport: string | null;
  fromCity: string | null;
  toAirport: string | null;
  toCity: string | null;
  departureDate: string;
  departureTime: string;
  amount: number | null;
  currency: string | null;
  status: string;
}

interface CustomerDetail {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  createdAt: string;
  stats: { totalBookings: number; upcomingTrips: number; totalSpent: number };
  bookings: CustomerBooking[];
  messages: Array<{ id: string; name: string; messageType: string; scheduledAt: string; status: string; renderedContent: string | null }>;
}

interface BookingDetail {
  id: string;
  pnr: string;
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
  source: string | null;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; name: string; phone: string; email: string | null } | null;
}

function route(c: { fromCity: string | null; fromAirport: string | null; toCity: string | null; toAirport: string | null }): string {
  const a = c.fromAirport || c.fromCity || "—";
  const b = c.toAirport || c.toCity || "—";
  return `${a} → ${b}`;
}

function tripDone(departureDate: string): boolean {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(departureDate)
    ? (() => { const [y, m, day] = departureDate.split("-").map(Number); return new Date(y, (m || 1) - 1, day || 1); })()
    : new Date(departureDate);
  return d.getTime() < Date.now();
}

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const detail = useApi<CustomerDetail>(id ? `/customers/${id}` : null);
  const customer = detail.data;
  const bookings = customer?.bookings ?? [];

  const [viewId, setViewId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("bookings");

  const view = useApi<BookingDetail>(viewId ? `/bookings/${viewId}` : null);

  async function handleCancel() {
    if (!cancelId) return;
    try {
      await api(`/bookings/${cancelId}/cancel`, { method: "POST" });
      setCancelId(null);
      setViewId(null);
      detail.refetch();
      setNotice("Booking cancelled successfully.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Unable to cancel booking");
    }
  }

  const name = customer?.name ?? "Loading...";
  const initials = name === "Loading..." ? "—" : initialsOf(name);
  const active = customer ? customer.status === "ACTIVE" : true;

  const stats = [
    { title: "Total Bookings", value: customer ? String(customer.stats.totalBookings) : "—", icon: Plane, tone: "blue", delta: "", sub: "all time" },
    { title: "Total Spent", value: customer ? formatCurrency(customer.stats.totalSpent) : "—", icon: Star, tone: "green", delta: "", sub: "across bookings" },
    { title: "Upcoming Trips", value: customer ? String(customer.stats.upcomingTrips) : "—", icon: CalendarDays, tone: "purple", delta: "", sub: "not yet departed" },
  ];

  return (
    <AppShell>
      <div className="space-y-4">
        <section className="flex flex-col justify-between gap-4 pt-2 xl:flex-row xl:items-start">
          <div className="flex gap-5">
            <span className="grid h-20 w-20 place-items-center rounded-full bg-blue-100 text-3xl font-bold text-blue-700">{initials}</span>
            <div>
              <h1 className="text-[28px] font-extrabold">{customer ? customer.name : "—"} <span className={`ml-2 rounded-md px-3 py-1 text-sm ${active ? "bg-[#d9f7e8] text-[#00a451]" : "bg-[#ffe2eb] text-[#f22552]"}`}>{active ? "Active" : "Inactive"}</span></h1>
              <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <span><Phone className="mr-2 inline h-4 w-4" />+91 {customer?.phone ?? "—"}</span>
                <span><Mail className="mr-2 inline h-4 w-4" />{customer?.email ?? "—"}</span>
                <span><CalendarDays className="mr-2 inline h-4 w-4" />Member since {customer ? formatDate(customer.createdAt) : "—"}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 sm:grid-cols-2">
            <Link href="/customers" className="py-3 text-[#087df0]">← Back to Customers</Link>
            <button onClick={() => setEditOpen(true)} className="rounded-lg border border-[#d6e1ef] bg-white px-7 py-3 font-bold"><Edit className="mr-2 inline h-4 w-4" />Edit Customer</button>
            <Link href="/bookings/add" className="rounded-lg bg-[#1688f9] px-7 py-3 font-bold text-white"><Plus className="mr-2 inline h-4 w-4" />New Booking</Link>
            <Link href="/whatsapp-messages" className="rounded-lg border border-[#d6e1ef] bg-white px-7 py-3 font-bold"><MessageCircle className="mr-2 inline h-4 w-4 text-green-600" />Send WhatsApp</Link>
          </div>
        </section>
        {detail.error ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{detail.error}</p> : null}
        {notice ? <p className={notice.startsWith("Booking cancelled") ? "rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700" : "rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700"}>{notice}</p> : null}
        <div className="grid gap-3 xl:grid-cols-[1fr_275px]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{stats.map((s) => <StatCard key={s.title} {...s} />)}</div>
            <div className="flex gap-8 border-b border-[#d6e1ef]">
              {["bookings", "history", "activity"].map((t) => <button key={t} onClick={() => setTab(t)} className={`py-3 capitalize ${tab === t ? "border-b-2 border-[#1688f9] font-bold text-[#087df0]" : "text-[#405174]"}`}>{t === "history" ? "Travel History" : t === "activity" ? "Activity" : t}</button>)}
            </div>

            {tab === "bookings" ? (
              <section className="rounded-xl border border-[#dce7f4] bg-white p-4 shadow-sm">
                <div className="mb-4 flex justify-between">
                  <div><h2 className="text-xl font-extrabold">Bookings ({customer ? bookings.length : "—"})</h2><p className="text-[#596782]">View and manage all bookings for this customer.</p></div>
                  <Link href="/bookings/add" className="rounded-lg bg-[#1688f9] px-6 py-2 font-bold text-white"><Plus className="mr-2 inline h-4 w-4" />Add Booking</Link>
                </div>
                <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-[#f4f7fb]"><tr><th className="p-3">Date</th><th>PNR</th><th>Route</th><th>Airline</th><th>Status</th><th>Amount</th><th>Actions</th></tr></thead><tbody className="divide-y divide-[#e5edf6]">
                  {detail.loading && bookings.length === 0 ? <tr><td colSpan={7} className="p-3 text-center text-[#596782]">Loading bookings...</td></tr> : null}
                  {!detail.loading && bookings.length === 0 ? <tr><td colSpan={7} className="p-3 text-center text-[#596782]">No bookings found.</td></tr> : null}
                  {bookings.map((b) => <tr key={b.id}><td className="p-3">{formatDate(b.departureDate)}</td><td>{b.pnr}</td><td>{route(b)}</td><td className="whitespace-pre-line">{b.airline || "—"}{"\n"}{b.flightNumber || ""}</td><td><StatusBadge value={b.status} /></td><td><b>{formatCurrency(b.amount, b.currency ?? undefined)}</b></td><td><div className="relative inline-block"><button onClick={() => setViewId(b.id)} className="mr-2 rounded-lg border border-[#d6e1ef] px-5 py-2 font-bold text-[#087df0]">View</button><button onClick={() => setCancelId(b.id)} className="rounded-lg border border-[#d6e1ef] p-2" title="Cancel booking"><Ban className="h-4 w-4" /></button></div></td></tr>)}
                </tbody></table></div>
                <p className="mt-4 text-[#596782]">Showing 1 to {bookings.length} of {bookings.length} bookings</p>
              </section>
            ) : tab === "history" ? (
              <section className="rounded-xl border border-[#dce7f4] bg-white p-4 shadow-sm">
                <h2 className="text-xl font-extrabold">Travel History</h2>
                <p className="mb-2 text-[#596782]">All past and upcoming journeys in chronological order.</p>
                <div className="relative space-y-6 pt-4 before:absolute before:left-[7px] before:top-6 before:h-[calc(100%-24px)] before:w-px before:bg-[#b8d7ff]">
                  {bookings.length === 0 ? <p className="ml-10 text-sm text-[#596782]">No journeys yet.</p> : bookings.map((b) => {
                    const done = b.departureDate ? tripDone(b.departureDate) : false;
                    return <div key={b.id} className="relative flex items-start gap-4"><span className="relative z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-[#1688f9] bg-white" /><div className="flex-1 rounded-lg border border-[#e5edf6] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><b>{route(b)}</b><StatusBadge value={b.status} /></div><p className="mt-0.5 text-sm text-[#596782]">{b.airline || "—"} {b.flightNumber || ""} · PNR {b.pnr} · {formatDate(b.departureDate)} {done ? "(Completed)" : "(Upcoming)"}</p>{b.amount ? <p className="mt-0.5 text-sm font-semibold">{formatCurrency(b.amount, b.currency ?? undefined)}</p> : null}</div></div>;
                  })}
                </div>
              </section>
            ) : (
              <div className="space-y-4">
                <section className="rounded-xl border border-[#dce7f4] bg-white p-4 shadow-sm">
                  <h2 className="text-lg font-extrabold">Recent Activity</h2>
                  {customer && customer.messages.length === 0 ? <p className="mt-3 text-sm text-[#596782]">No activity yet.</p> : (customer?.messages ?? []).slice(0, 10).map((m) => <p key={m.id} className="mt-4 flex gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${messageIcon(m.status)}`}>{messageGlyph(m.status)}</span><span className="flex-1"><b>{m.name}</b><span className="block text-[#596782]">{m.renderedContent || "—"}</span></span><span className="text-xs text-[#405174]">{formatDate(m.scheduledAt, true)}</span></p>)}
                </section>
                <section className="rounded-xl border border-[#dce7f4] bg-white p-4">
                  <h2 className="text-lg font-extrabold">Notes</h2>
                  <p className="mt-3 text-sm text-[#596782]">No notes saved yet.</p>
                </section>
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <Box title="Customer Details" items={[`Full Name|${customer?.name ?? "—"}`, `Phone|+91 ${customer?.phone ?? "—"}`, `Email|${customer?.email ?? "—"}`, `Status|${active ? "Active" : "Inactive"}`, `Member Since|${customer ? formatDate(customer.createdAt) : "—"}`]} />
            <Box title="Quick Actions" items={[]}>
              <div className="mt-1 space-y-2">
                <Link href="/bookings/add" className="flex items-center gap-2 rounded-lg bg-[#1688f9] px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" /> New Booking</Link>
                <Link href="/whatsapp-messages" className="flex items-center gap-2 rounded-lg border border-[#d6e1ef] px-4 py-2.5 text-sm font-bold"><MessageCircle className="h-4 w-4 text-green-600" /> Send WhatsApp</Link>
                <Link href={`/bookings?customerId=${customer?.id ?? ""}`} className="flex items-center gap-2 rounded-lg border border-[#d6e1ef] px-4 py-2.5 text-sm font-bold"><Plane className="h-4 w-4 text-[#087df0]" /> All bookings</Link>
              </div>
            </Box>
          </aside>
        </div>
      </div>

      {editOpen ? <EditCustomerModal customer={customer} onClose={() => setEditOpen(false)} onSaved={(message) => { setEditOpen(false); detail.refetch(); setNotice(message); }} /> : null}
      {viewId ? <BookingDetailModal id={viewId} data={view.data} loading={view.loading} onClose={() => setViewId(null)} onCancel={() => setCancelId(viewId)} /> : null}
      {cancelId ? <ConfirmDialog title="Cancel this booking?" message={`Booking ${bookings.find((b) => b.id === cancelId)?.pnr ?? ""} will be marked as cancelled. This action cannot be undone.`} confirmLabel="Cancel booking" onCancel={() => setCancelId(null)} onConfirm={handleCancel} /> : null}
    </AppShell>
  );
}

function messageIcon(status: string): string {
  const tone = statusTone(status);
  if (tone === "danger") return "bg-rose-100 text-rose-600";
  if (tone === "pending") return "bg-amber-100 text-amber-600";
  return "bg-green-100 text-green-600";
}

function messageGlyph(status: string): string {
  return statusTone(status) === "danger" ? "✕" : statusTone(status) === "pending" ? "⏱" : "✓";
}

function Box({ title, items, children }: { title: string; items: string[]; children?: React.ReactNode }) {
  return <section className="rounded-xl border border-[#dce7f4] bg-white p-4">
    <h2 className="mb-4 text-lg font-extrabold">{title}</h2>
    {items.map((i) => <p key={i} className="mb-4 text-sm"><span className="block text-[#596782]">{i.split("|")[0]}</span>{i.split("|")[1]}</p>)}
    {children}
  </section>;
}

function EditCustomerModal({ customer, onClose, onSaved }: { customer: CustomerDetail | null; onClose: () => void; onSaved: (message: string) => void }) {
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
      await api(`/customers/${customer?.id}`, { method: "PATCH", body: { name: form.name, phone: form.phone, email: form.email.trim() || undefined, status: form.status } });
      onSaved("Customer updated successfully.");
    } catch (err) {
      setMError(err instanceof Error ? err.message : "Unable to update customer");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-extrabold">Edit Customer</h2><button onClick={onClose} aria-label="Close"><X className="h-5 w-5 text-[#596782]" /></button></div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <EditField label="Full Name" required error={errors.name}>
            <input value={form.name} onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setErrors((er) => { const n = { ...er }; delete n.name; return n; }); }} className="h-11 w-full rounded-md border border-[#cfdbea] px-3 text-sm outline-none focus:border-[#1688f9]" />
          </EditField>
          <EditField label="Phone" required error={errors.phone}>
            <input value={form.phone} onChange={(e) => { setForm((f) => ({ ...f, phone: e.target.value })); setErrors((er) => { const n = { ...er }; delete n.phone; return n; }); }} className="h-11 w-full rounded-md border border-[#cfdbea] px-3 text-sm outline-none focus:border-[#1688f9]" />
          </EditField>
          <EditField label="Email" required={false} error={errors.email}>
            <input value={form.email} onChange={(e) => { setForm((f) => ({ ...f, email: e.target.value })); setErrors((er) => { const n = { ...er }; delete n.email; return n; }); }} className="h-11 w-full rounded-md border border-[#cfdbea] px-3 text-sm outline-none focus:border-[#1688f9]" />
          </EditField>
          <EditField label="Status" required={false}>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="h-11 w-full rounded-md border border-[#cfdbea] px-3 text-sm outline-none focus:border-[#1688f9]"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
          </EditField>
          {mError ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{mError}</p> : null}
          <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={onClose} className="rounded-lg border border-[#d6e1ef] px-6 py-2.5 font-semibold">Cancel</button><button disabled={submitting} className="rounded-lg bg-[#1688f9] px-6 py-2.5 font-bold text-white disabled:opacity-60">{submitting ? "Saving..." : "Save Changes"}</button></div>
        </form>
      </div>
    </div>
  );
}

function EditField({ label, required, error, children }: { label: string; required: boolean; error?: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-semibold">{label} {required ? <span className="text-red-500">*</span> : null}</span>{children}{error ? <span className="mt-1.5 block text-[13px] font-medium text-rose-600">{error}</span> : null}</label>;
}

function BookingDetailModal({ id, data, loading, onClose, onCancel }: { id: string; data: BookingDetail | null; loading: boolean; onClose: () => void; onCancel: () => void }) {
  const booking = data;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-[560px] overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-[#e5edf6] bg-white px-5 py-4">
          <div><h3 className="text-lg font-extrabold">Booking Details</h3><p className="text-sm text-[#596782]">PNR {booking?.pnr ?? id}</p></div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6e1ef]" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        {loading ? <div className="px-5 py-10 text-center text-sm text-[#596782]">Loading booking…</div> : !booking ? <div className="px-5 py-10 text-center text-sm text-[#596782]">Booking not found.</div> : (
          <div className="space-y-5 px-5 py-5">
            <div className="flex items-center gap-4 rounded-xl bg-[#f4f8fd] p-4">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-blue-100 font-bold text-blue-700">{initialsOf(booking.customer?.name ?? "?")}</span>
              <div className="min-w-0 flex-1"><div className="font-bold">{booking.customer?.name ?? "—"}</div><div className="text-sm text-[#596782]">{booking.customer?.phone ?? "—"}</div></div>
              <div className="text-right"><div className="text-sm font-bold text-[#071333]">{formatCurrency(booking.amount, booking.currency ?? undefined)}</div><div className="text-xs text-[#596782]">{booking.source ?? ""}</div></div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[#dce7f4] p-4">
              <div className="text-center"><div className="text-xs font-bold uppercase text-[#8a97ad]">From</div><PlaneTakeoff className="mx-auto my-1 h-5 w-5 text-[#087df0]" /><div className="font-extrabold">{booking.fromAirport || booking.fromCity || "—"}</div><div className="text-xs text-[#596782]">{booking.fromCity || booking.fromAirport || ""}</div></div>
              <div className="h-px flex-1 border-t border-dashed border-[#c6d4e5]" />
              <div className="text-center"><div className="text-xs font-bold uppercase text-[#8a97ad]">To</div><PlaneLanding className="mx-auto my-1 h-5 w-5 text-[#087df0]" /><div className="font-extrabold">{booking.toAirport || booking.toCity || "—"}</div><div className="text-xs text-[#596782]">{booking.toCity || booking.toAirport || ""}</div></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {detailRow("Flight", `${booking.airline || ""} ${booking.flightNumber || ""}`.trim() || "—")}
              {detailRow("Departure", `${booking.departureDate ? formatDate(booking.departureDate) : "—"}${booking.departureTime ? ` · ${booking.departureTime}` : ""}`)}
              {detailRow("Reference", booking.referenceNumber ?? "—")}
              {detailRow("Status", booking.status.replace(/_/g, " "))}
              {detailRow("Created", booking.createdAt ? formatDate(booking.createdAt) : "—")}
              {detailRow("Last updated", booking.updatedAt ? formatDate(booking.updatedAt) : "—")}
            </div>
            {booking.status === "CONFIRMED" || booking.status === "PENDING" ? <button onClick={onCancel} className="w-full rounded-lg bg-[#f61f55] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#e01549]">Cancel booking</button> : null}
          </div>
        )}
      </div>
    </div>
  );
}

function detailRow(label: string, value: string) {
  return <div className="rounded-lg bg-[#f4f8fd] px-4 py-3"><div className="text-xs font-bold uppercase text-[#8a97ad]">{label}</div><div className="mt-0.5 font-semibold capitalize">{value}</div></div>;
}

function ConfirmDialog({ title, message, confirmLabel, onCancel, onConfirm }: { title: string; message: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-[380px] rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <h3 className="text-lg font-extrabold">{title}</h3>
        <p className="mt-1 text-sm text-[#596782]">{message}</p>
        <div className="mt-6 flex gap-3">
          <button className="flex-1 rounded-lg border border-[#d6e1ef] px-4 py-2.5 font-bold transition hover:bg-slate-50" onClick={onCancel}>Keep booking</button>
          <button className="flex-1 rounded-lg bg-[#f61f55] px-4 py-2.5 font-bold text-white transition hover:bg-[#e01549]" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}