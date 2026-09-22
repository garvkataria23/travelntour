"use client";

import Link from "next/link";
import { AppShell } from "@/components/dashboard/app-shell";
import { Pagination, StatCard, StatusBadge, type ApiBookingRow } from "@/components/dashboard/ui";
import { useApi } from "@/lib/hooks";
import { api, formatCurrency, formatDate } from "@/lib/api";
import { AlertTriangle, CalendarDays, CalendarCheck, ChevronLeft, ChevronRight, Clock3, MoreHorizontal, Plane, PlaneLanding, PlaneTakeoff, Plus, Search, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface BookingStats {
  total: number;
  today: number;
  upcoming: number;
  pending: number;
  cancelled: number;
}

interface JourneyList {
  items: ApiBookingRow[];
  meta: { total: number; page: number; limit: number; totalPages: number };
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

type RangeKey = "today" | "tomorrow" | "week" | "month" | "custom";

function pad2(n: number): string { return String(n).padStart(2, "0"); }
function iso(d: Date): string { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function dateKey(value: string): string {
  const d = new Date(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, day] = value.split("-").map(Number);
    return iso(new Date(y, (m || 1) - 1, day || 1));
  }
  return iso(d);
}

function airlineTag(airline?: string | null): string {
  if (!airline) return "AI";
  const a = airline.trim().toLowerCase();
  if (a.includes("indigo")) return "6E";
  if (a.includes("emirates")) return "EK";
  if (a.includes("vistara")) return "UK";
  if (a.includes("spicejet")) return "SG";
  const parts = airline.trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : airline.trim().slice(0, 2)).toUpperCase();
}

const STATUS_OPTIONS = ["CONFIRMED", "PENDING", "COMPLETED", "CANCELLED"];

export default function UpcomingJourneysPage() {
  const now = useMemo(() => new Date(), []);
  const [range, setRange] = useState<RangeKey>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [statusSel, setStatusSel] = useState("CONFIRMED");
  const [airline, setAirline] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [viewId, setViewId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [menuRow, setMenuRow] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  function rangeBounds(): { from?: string; to?: string } {
    switch (range) {
      case "today": return { from: iso(now), to: iso(now) };
      case "tomorrow": { const t = addDays(now, 1); return { from: iso(t), to: iso(t) }; }
      case "week": return { from: iso(now), to: iso(addDays(now, 6)) };
      case "custom": return customFrom && customTo ? { from: customFrom, to: customTo } : {};
      default: return { from: iso(now), to: iso(addDays(now, 29)) };
    }
  }

  const bounds = rangeBounds();
  const filterParams = (limit: number, pageNo: number) => {
    const p = new URLSearchParams();
    if (statusSel) p.set("status", statusSel);
    if (airline) p.set("airline", airline);
    if (query) p.set("search", query);
    if (bounds.from) p.set("from", bounds.from);
    if (bounds.to) p.set("to", bounds.to);
    p.set("sort", "departureDate");
    p.set("order", "asc");
    p.set("limit", String(limit));
    p.set("page", String(pageNo));
    return p.toString();
  };

  const stats = useApi<BookingStats>("/bookings/stats");
  const list = useApi<JourneyList>(`/bookings?${filterParams(20, page)}`);

  const mStart = iso(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1));
  const mEnd = iso(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0));
  const calParams = new URLSearchParams();
  if (statusSel) calParams.set("status", statusSel);
  if (airline) calParams.set("airline", airline);
  if (query) calParams.set("search", query);
  calParams.set("from", mStart);
  calParams.set("to", mEnd);
  calParams.set("limit", "500");
  calParams.set("sort", "departureDate");
  calParams.set("order", "asc");
  const calendarData = useApi<JourneyList>(`/bookings?${calParams.toString()}`);

  const countParams = (f: string, t: string) => {
    const p = new URLSearchParams();
    if (statusSel) p.set("status", statusSel);
    if (airline) p.set("airline", airline);
    if (query) p.set("search", query);
    p.set("from", f);
    p.set("to", t);
    p.set("limit", "1");
    p.set("page", "1");
    return p.toString();
  };
  const tomorrow = addDays(now, 1);
  const countTomorrow = useApi<JourneyList>(`/bookings?${countParams(iso(tomorrow), iso(tomorrow))}`);
  const countWeek = useApi<JourneyList>(`/bookings?${countParams(iso(now), iso(addDays(now, 6)))}`);
  const monthCountParams = new URLSearchParams();
  if (statusSel) monthCountParams.set("status", statusSel);
  if (airline) monthCountParams.set("airline", airline);
  if (query) monthCountParams.set("search", query);
  monthCountParams.set("period", "month");
  monthCountParams.set("limit", "1");
  monthCountParams.set("page", "1");
  const countMonth = useApi<JourneyList>(`/bookings?${monthCountParams.toString()}`);

  const view = useApi<BookingDetail>(viewId ? `/bookings/${viewId}` : null);

  const journeys = useMemo<Array<ApiBookingRow & { isToday: boolean }>>(
    () => (list.data?.items ?? []).map((b) => ({ ...b, isToday: dateKey(b.departureDate) === iso(now) })),
    [list.data, now],
  );

  const groups = useMemo(() => {
    const map = new Map<string, Array<ApiBookingRow & { isToday: boolean }>>();
    for (const j of journeys) {
      const key = formatDate(j.departureDate);
      const rows = map.get(key) ?? [];
      rows.push(j);
      map.set(key, rows);
    }
    return [...map.entries()];
  }, [journeys]);

  const marks = useMemo(() => new Set((calendarData.data?.items ?? []).map((b) => dateKey(b.departureDate))), [calendarData.data]);

  const quickFilters = [
    { key: "today" as RangeKey, label: "Today", icon: CalendarDays, count: stats.data ? String(stats.data.today) : "" },
    { key: "tomorrow" as RangeKey, label: "Tomorrow", icon: Clock3, count: countTomorrow.data ? String(countTomorrow.data.meta.total) : "" },
    { key: "week" as RangeKey, label: "This Week", icon: CalendarCheck, count: countWeek.data ? String(countWeek.data.meta.total) : "" },
    { key: "month" as RangeKey, label: "This Month", icon: CalendarCheck, count: countMonth.data ? String(countMonth.data.meta.total) : "" },
    { key: "custom" as RangeKey, label: "Custom Range", icon: CalendarDays, count: "" },
  ];

  const statCards = [
    { title: "Today's Journeys", value: stats.data ? String(stats.data.today) : "—", icon: Plane, tone: "blue", delta: "", sub: "departing today" },
    { title: "This Week", value: countWeek.data ? String(countWeek.data.meta.total) : "—", icon: CalendarCheck, tone: "green", delta: "", sub: "next 7 days" },
    { title: "This Month", value: countMonth.data ? String(countMonth.data.meta.total) : "—", icon: CalendarCheck, tone: "purple", delta: "", sub: "next 30 days" },
    { title: "Total Upcoming", value: stats.data ? String(stats.data.upcoming) : "—", icon: Users, tone: "orange", delta: "", sub: "future bookings" },
  ];

  const airlines = useApi<Array<{ name: string; count: number }>>("/bookings/airlines");
  const total = list.data?.meta.total ?? 0;
  const title = range === "today" ? `Journeys on ${formatDate(iso(now))}` : range === "custom" ? "Journeys in custom range" : "Upcoming Journeys";

  async function handleCancel() {
    if (!cancelId) return;
    setActionError("");
    try {
      await api(`/bookings/${cancelId}/cancel`, { method: "POST" });
      setCancelId(null);
      setViewId(null);
      setMenuRow(null);
      list.refetch();
      stats.refetch();
      calendarData.refetch();
      countTomorrow.refetch();
      countWeek.refetch();
      countMonth.refetch();
      setNotice("Journey cancelled. A cancellation message was scheduled.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to cancel journey");
    }
  }

  function changeRange(next: RangeKey) {
    setRange(next);
    setPage(1);
  }

  function selectDay(day: Date) {
    setCustomFrom(iso(day));
    setCustomTo(iso(day));
    setRange("custom");
    setPage(1);
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex flex-col justify-between gap-4 pt-2 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-[34px] font-extrabold leading-tight tracking-[-0.04em]">Upcoming Journeys</h1>
            <p className="mt-1 text-base text-[#596782]">View and manage all upcoming flights. Stay ahead, keep your customers informed.</p>
          </div>
          <Link href="/bookings/add" className="flex h-[52px] items-center justify-center gap-3 rounded-lg bg-[#1688f9] px-8 font-bold text-white shadow-sm"><Plus className="h-5 w-5" />Add Booking</Link>
        </div>
        {list.error ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{list.error}</p> : null}
        {actionError ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{actionError}</p> : null}
        {notice ? <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{statCards.map((stat) => <StatCard key={stat.title} {...stat} />)}</div>
        <div className="grid gap-4 xl:grid-cols-[305px_1fr]">
          <aside className="overflow-hidden rounded-xl border border-[#dce7f4] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#e5edf6] p-5">
              <h2 className="text-xl font-extrabold">{calendarMonth.toLocaleString("en", { month: "long", year: "numeric" })}</h2>
              <div className="flex gap-2"><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft className="h-5 w-5" /></button><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight className="h-5 w-5" /></button></div>
            </div>
            <CalendarGrid month={calendarMonth} marks={marks} todayKey={iso(now)} selectedKey={range === "custom" && customFrom === customTo ? customFrom : undefined} onPick={selectDay} />
            <div className="border-t border-[#e5edf6] p-5">
              <h3 className="mb-2 font-extrabold">Quick Filters</h3>
              {quickFilters.map(({ key, label, icon: Icon, count }) => (
                <button key={key} onClick={() => changeRange(key)} className={`mb-2 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm ${range === key ? "bg-[#e8f3ff] text-[#087df0]" : "bg-white"}`}><Icon className="h-4 w-4" /><span className="flex-1 text-left font-semibold">{label}</span><span>{count}</span></button>
              ))}
              <div className={`rounded-lg px-3 py-3 ${range === "custom" ? "bg-[#e8f3ff]" : ""}`}>
                <div className="mb-2 flex items-center gap-2"><CalendarDays className="h-4 w-4" /><b className="text-sm">Custom Range</b></div>
                <div className="flex gap-2">
                  <input type="date" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setRange("custom"); setPage(1); }} className="w-full rounded-md border border-[#cfdbea] px-2 py-1.5 text-xs" title="From" />
                  <input type="date" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setRange("custom"); setPage(1); }} className="w-full rounded-md border border-[#cfdbea] px-2 py-1.5 text-xs" title="To" />
                </div>
              </div>
            </div>
          </aside>
          <section className="overflow-hidden rounded-xl border border-[#dce7f4] bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-[#e5edf6] p-5 lg:flex-row lg:items-center lg:justify-between">
              <div><h2 className="text-lg font-extrabold">{title}</h2><p className="text-sm text-[#596782]">{total} bookings</p></div>
              <div className="grid gap-2 sm:grid-cols-3">
                <select value={statusSel} onChange={(e) => { setStatusSel(e.target.value); setPage(1); }} className="h-10 rounded-lg border border-[#d6e1ef] px-2 text-sm"><option value="">All Status</option>{STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}</select>
                <select value={airline} onChange={(e) => { setAirline(e.target.value); setPage(1); }} className="h-10 rounded-lg border border-[#d6e1ef] px-2 text-sm"><option value="">All Airlines</option>{(airlines.data ?? []).map((a) => <option key={a.name} value={a.name}>{a.name} ({a.count})</option>)}</select>
                <div className="flex h-10 items-center gap-2 rounded-lg border border-[#d6e1ef] px-3"><Search className="h-5 w-5 text-[#526486]" /><input value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search bookings..." /></div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm"><tbody className="divide-y divide-[#e5edf6]">
                {list.loading && groups.length === 0 ? <tr><td colSpan={9} className="px-5 py-8 text-center text-[#596782]">Loading journeys...</td></tr> : null}
                {!list.loading && groups.length === 0 ? <tr><td colSpan={9} className="px-5 py-8 text-center text-[#596782]">No journeys found.</td></tr> : null}
                {groups.map(([day, rows]) => (
                  <FragmentRow key={day} day={day} rows={rows} viewId={viewId} setViewId={setViewId} menuRow={menuRow} setMenuRow={setMenuRow} setCancelId={setCancelId} airlineTag={airlineTag} />
                ))}
              </tbody></table>
            </div>
            <Pagination total={list.data?.meta.total} page={list.data?.meta.page ?? 1} limit={20} onPageChange={(p) => setPage(p)} />
          </section>
        </div>
      </div>

      {viewId ? <BookingDetailModal id={viewId} data={view.data} loading={view.loading} onClose={() => setViewId(null)} onCancel={() => setCancelId(viewId)} /> : null}
      {cancelId ? <ConfirmDialog title="Cancel this journey?" message="The booking will be marked as cancelled. A cancellation message is scheduled automatically." confirmLabel="Cancel journey" onCancel={() => setCancelId(null)} onConfirm={handleCancel} /> : null}
    </AppShell>
  );
}

function FragmentRow({ day, rows, viewId, setViewId, menuRow, setMenuRow, setCancelId, airlineTag: tag }: {
  day: string;
  rows: Array<ApiBookingRow & { isToday: boolean }>;
  viewId: string | null;
  setViewId: (id: string) => void;
  menuRow: string | null;
  setMenuRow: (id: string | null) => void;
  setCancelId: (id: string) => void;
  airlineTag: (a?: string | null) => string;
}) {
  return <>
    <tr className="bg-[#f4f7fb]"><td colSpan={9} className="px-5 py-2 text-sm font-extrabold text-[#071333]">{day}</td></tr>
    {rows.map((j) => { const logo = tag(j.airline); return <tr key={j.id} className="hover:bg-blue-50/30"><td className="px-2 py-3"><b>{j.departureTime || "All day"}</b><div className="text-[#596782]">{day}</div></td><td className="px-2"><span className={`grid h-8 w-8 place-items-center rounded text-[10px] font-bold text-white ${logo === "6E" ? "bg-blue-700" : logo === "EK" ? "bg-red-100 text-red-600" : logo === "UK" ? "bg-purple-800" : logo === "SG" ? "bg-red-600" : "bg-white text-red-500"}`}>{logo}</span></td><td className="px-2"><b>{j.flightNumber || "—"}</b><div className="text-[#596782]">{j.airline || "—"}</div></td><td className="px-2"><b>{j.fromAirport || j.fromCity || "—"} → {j.toAirport || j.toCity || "—"}</b><div className="text-[#596782]">{j.fromCity || j.fromAirport || "—"} to {j.toCity || j.toAirport || "—"}</div></td><td className="px-2"><span className="text-[#596782]">PNR</span><div>{j.pnr}</div></td><td className="px-2"><b>{j.customerName}</b><div className="text-[#596782]">{j.customerPhone}</div></td><td className="px-2"><span className="rounded-md bg-[#e0efff] px-4 py-2 font-bold text-[#087df0]">{j.isToday ? "Today" : j.status === "CONFIRMED" ? "Confirmed" : j.status[0] + j.status.slice(1).toLowerCase()}</span></td><td className="px-2"><button onClick={() => setViewId(j.id)} className="rounded-lg border border-[#d6e1ef] px-5 py-2 font-bold text-[#087df0]">View</button></td><td className="px-2"><div className="relative"><button onClick={() => setMenuRow(menuRow === j.id ? null : j.id)} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6e1ef]"><MoreHorizontal className="h-4 w-4" /></button>{menuRow === j.id ? <><div className="fixed inset-0 z-10" onClick={() => setMenuRow(null)} /><div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-[#d6e1ef] bg-white py-1 shadow-lg"><Link href={`/bookings?search=${j.pnr}`} onClick={() => setMenuRow(null)} className="block px-3 py-2 text-sm font-medium hover:bg-blue-50">Open booking</Link><button onClick={() => { setMenuRow(null); setCancelId(j.id); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"><AlertTriangle className="h-4 w-4" /> Cancel journey</button></div></> : null}</div></td></tr>; })}
  </>;
}

function CalendarGrid({ month, marks, todayKey, selectedKey, onPick }: { month: Date; marks: Set<string>; todayKey: string; selectedKey?: string; onPick: (day: Date) => void }) {
  const year = month.getFullYear();
  const mm = month.getMonth();
  const start = new Date(year, mm, 1);
  const offset = start.getDay();
  const cells = Array.from({ length: 42 }, (_, i) => new Date(year, mm, 1 - offset + i));
  return <div>
    <div className="grid grid-cols-7 gap-y-4 px-6 py-5 text-center text-sm">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="text-[#697694]">{d}</div>)}
      {cells.map((date, i) => {
        const dkey = iso(date);
        const current = date.getMonth() === mm;
        const outside = !current;
        const isToday = dkey === todayKey;
        const isSelected = selectedKey === dkey;
        const marked = marks.has(dkey);
        return <div key={i}><button onClick={() => onPick(date)} className={`relative mx-auto grid h-9 w-9 place-items-center rounded-lg text-sm ${isSelected ? "bg-[#1688f9] font-bold text-white shadow-lg" : isToday ? "border-2 border-[#1688f9] font-bold text-[#1688f9]" : outside ? "text-[#8b98b2]" : "text-[#071333] hover:bg-blue-50"}`}>{date.getDate()}{marked ? <span className={`absolute -bottom-2 h-1.5 w-1.5 rounded-full ${isSelected ? "bg-white" : "bg-[#1688f9]"}`} /> : null}</button></div>;
      })}
    </div>
  </div>;
}

function BookingDetailModal({ id, data, loading, onClose, onCancel }: { id: string; data: BookingDetail | null; loading: boolean; onClose: () => void; onCancel: () => void }) {
  const booking = data;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-[560px] overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-[#e5edf6] bg-white px-5 py-4">
          <div><h3 className="text-lg font-extrabold">Journey Details</h3><p className="text-sm text-[#596782]">PNR {booking?.pnr ?? id}</p></div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6e1ef]" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        {loading ? <div className="px-5 py-10 text-center text-sm text-[#596782]">Loading journey…</div> : !booking ? <div className="px-5 py-10 text-center text-sm text-[#596782]">Journey not found.</div> : (
          <div className="space-y-5 px-5 py-5">
            <div className="flex items-center gap-4 rounded-xl bg-[#f4f8fd] p-4">
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
            {booking.status === "CONFIRMED" || booking.status === "PENDING" ? <button onClick={onCancel} className="w-full rounded-lg bg-[#f61f55] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#e01549]">Cancel journey</button> : null}
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
          <button className="flex-1 rounded-lg border border-[#d6e1ef] px-4 py-2.5 font-bold transition hover:bg-slate-50" onClick={onCancel}>Keep journey</button>
          <button className="flex-1 rounded-lg bg-[#f61f55] px-4 py-2.5 font-bold text-white transition hover:bg-[#e01549]" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}