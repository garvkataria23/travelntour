"use client";

import { AppShell } from "@/components/dashboard/app-shell";
import { BookingFilters, BookingToolbar, BookingsTable, Pagination, StatCard, initialsOf, type ApiBookingRow } from "@/components/dashboard/ui";
import { useApi } from "@/lib/hooks";
import { api, formatDate } from "@/lib/api";
import { Plane, CalendarCheck, Users, Hourglass, AlertTriangle, PlaneTakeoff, PlaneLanding, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

interface BookingStats {
  total: number;
  today: number;
  upcoming: number;
  pending: number;
  cancelled: number;
}

interface BookingList {
  items: ApiBookingRow[];
  meta: { total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean };
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

function pad2ts(n: number): string { return String(n).padStart(2, "0"); }
function localISODate(d: Date): string { return `${d.getFullYear()}-${pad2ts(d.getMonth() + 1)}-${pad2ts(d.getDate())}`; }

export default function BookingsPage() {
  return (
    <Suspense fallback={null}>
      <BookingsPageInner />
    </Suspense>
  );
}

function BookingsPageInner() {
  const searchParams = useSearchParams();
  const initial = useMemo(() => {
    const today = localISODate(new Date());
    const search = searchParams.get("search") ?? "";
    const status = searchParams.get("status") ?? "";
    const customerId = searchParams.get("customerId") ?? "";
    let from = searchParams.get("from") ?? "";
    let to = searchParams.get("to") ?? "";
    const period = searchParams.get("period");
    if (period === "today") { from = today; to = today; }
    else if (period === "upcoming") { from = today; }
    return { search, status, customerId, from, to };
  }, [searchParams]);

  const [search, setSearch] = useState(initial.search);
  const [status, setStatus] = useState(initial.status);
  const [customerId, setCustomerId] = useState(initial.customerId);
  const [airline, setAirline] = useState("");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [limit, setLimit] = useState(8);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState(initial.search);
  const [viewId, setViewId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const params = new URLSearchParams();
  if (query) params.set("search", query);
  if (status) params.set("status", status);
  if (customerId) params.set("customerId", customerId);
  if (airline) params.set("airline", airline);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  params.set("page", String(page));
  params.set("limit", String(limit));

  const stats = useApi<BookingStats>("/bookings/stats");
  const airlines = useApi<Array<{ name: string; count: number }>>("/bookings/airlines");
  const list = useApi<BookingList>(`/bookings?${params.toString()}`);
  const detail = useApi<BookingDetail>(viewId ? `/bookings/${viewId}` : null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  function resetFilters() {
    setSearch("");
    setQuery("");
    setStatus("");
    setCustomerId("");
    setAirline("");
    setFrom("");
    setTo("");
    setPage(1);
    setActionError("");
  }

  async function handleCancel(id: string) {
    setActionError("");
    try {
      await api(`/bookings/${id}/cancel`, { method: "POST" });
      setCancelId(null);
      setToast("Booking cancelled.");
      stats.refetch();
      list.refetch();
    } catch (err) {
      setCancelId(null);
      setActionError(err instanceof Error ? err.message : "Unable to cancel booking. Please try again.");
    }
  }

  async function handleExport() {
    setActionError("");
    const exportParams = new URLSearchParams();
    if (query) exportParams.set("search", query);
    if (status) exportParams.set("status", status);
    if (airline) exportParams.set("airline", airline);
    if (from) exportParams.set("from", from);
    if (to) exportParams.set("to", to);
    exportParams.set("limit", "1000");
    try {
      const result = await api<BookingList>(`/bookings?${exportParams.toString()}`);
      const header = ["PNR", "Customer", "Phone", "Flight", "Airline", "Route", "Departure Date", "Departure Time", "Status", "Amount"];
      const rows = result.items.map((booking) => [
        booking.pnr,
        booking.customerName,
        booking.customerPhone,
        booking.flightNumber,
        booking.airline,
        `${booking.fromAirport || booking.fromCity || ""} → ${booking.toAirport || booking.toCity || ""}`,
        booking.departureDate,
        booking.departureTime,
        booking.status,
        booking.amount,
      ].map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","));
      const csv = "\uFEFF" + [header.join(","), ...rows].join("\r\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      setToast(`Exported ${result.items.length} bookings.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to export bookings.");
    }
  }

  const statCards = [
    { title: "Total Bookings", value: String(stats.data?.total ?? 0), icon: Plane, tone: "blue", sub: "all bookings", href: "/bookings" },
    { title: "Today's Journeys", value: String(stats.data?.today ?? 0), icon: CalendarCheck, tone: "green", sub: "departing today", href: "/bookings?period=today" },
    { title: "Upcoming Journeys", value: String(stats.data?.upcoming ?? 0), icon: Users, tone: "purple", sub: "in the future", href: "/upcoming-journeys" },
    { title: "Pending Confirmation", value: String(stats.data?.pending ?? 0), icon: Hourglass, tone: "orange", sub: "awaiting payment", href: "/bookings?status=PENDING" },
    { title: "Cancelled", value: String(stats.data?.cancelled ?? 0), icon: AlertTriangle, tone: "rose", sub: "cancelled bookings", href: "/bookings?status=CANCELLED" },
  ];

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex flex-col justify-between gap-4 pt-2 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-[40px] font-extrabold leading-tight tracking-[-0.04em]">Bookings</h1>
            <p className="mt-1 text-lg text-[#596782]">Manage all your flight bookings in one place.</p>
          </div>
          <BookingToolbar onExport={handleExport} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {statCards.map((stat) => <StatCard key={stat.title} {...stat} />)}
        </div>
        {actionError ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{actionError}</p> : null}
        {list.error ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{list.error}</p> : null}
        <BookingFilters
          search={search}
          onSearch={(value) => { setSearch(value); setPage(1); }}
          status={status}
          onStatus={(value) => { setStatus(value); setPage(1); }}
          airlines={airlines.data ?? []}
          airline={airline}
          onAirline={(value) => { setAirline(value); setPage(1); }}
          from={from}
          to={to}
          onFrom={(value) => { setFrom(value); setPage(1); }}
          onTo={(value) => { setTo(value); setPage(1); }}
          onReset={resetFilters}
        />
        <section className="overflow-hidden rounded-xl border border-[#dce7f4] bg-white shadow-[0_10px_24px_rgba(31,61,105,0.04)]">
          <BookingsTable rows={list.data?.items ?? []} onView={(id) => setViewId(id)} onCancel={(id) => setCancelId(id)} />
          <Pagination total={list.data?.meta.total} page={list.data?.meta.page ?? 1} limit={limit} onPageChange={(p) => setPage(p)} onLimitChange={(value) => { setLimit(value); setPage(1); }} />
        </section>
      </div>

      {viewId ? <BookingDetailModal id={viewId} data={detail.data} loading={detail.loading} onClose={() => setViewId(null)} /> : null}
      {cancelId ? <ConfirmDialog title="Cancel booking?" message="This will mark the booking as cancelled and notify the customer. This action cannot be undone." confirmLabel="Cancel booking" onCancel={() => setCancelId(null)} onConfirm={() => handleCancel(cancelId)} /> : null}
      {toast ? <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-lg bg-[#071832] px-5 py-3 text-sm font-semibold text-white shadow-2xl">{toast}</div> : null}
    </AppShell>
  );
}

function BookingDetailModal({ id, data, loading, onClose }: { id: string; data: BookingDetail | null; loading: boolean; onClose: () => void }) {
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
              <div className="text-right"><div className="text-sm font-bold text-[#071333]">{formatCurrency(booking.amount, booking.currency)}</div><div className="text-xs text-[#596782]">{booking.source ?? ""}</div></div>
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
          </div>
        )}
      </div>
    </div>
  );
}

function detailRow(label: string, value: string) {
  return <div className="rounded-lg bg-[#f4f8fd] px-4 py-3"><div className="text-xs font-bold uppercase text-[#8a97ad]">{label}</div><div className="mt-0.5 font-semibold capitalize">{value}</div></div>;
}

function formatCurrency(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR", maximumFractionDigits: 0 }).format(amount);
}

function ConfirmDialog({ title, message, confirmLabel, onCancel, onConfirm }: { title: string; message: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4" onClick={onCancel}>
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