"use client";

import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Download, Eye, Hourglass, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";

const toneClasses: Record<string, string> = {
  blue: "border-blue-100 bg-gradient-to-br from-white to-blue-50 text-[#2088f1]",
  green: "border-emerald-100 bg-gradient-to-br from-white to-emerald-50 text-[#19b96b]",
  emerald: "border-emerald-100 bg-gradient-to-br from-white to-emerald-50 text-[#22b56d]",
  purple: "border-purple-100 bg-gradient-to-br from-white to-purple-50 text-[#7f2cff]",
  orange: "border-orange-100 bg-gradient-to-br from-white to-orange-50 text-[#fb8500]",
  rose: "border-rose-100 bg-gradient-to-br from-white to-rose-50 text-[#ef2b59]"
};

const iconBg: Record<string, string> = {
  blue: "bg-[#d9edff]",
  green: "bg-[#d9f7e8]",
  emerald: "bg-[#dcf8e8]",
  purple: "bg-[#ebdcff]",
  orange: "bg-[#fff0dc]",
  rose: "bg-[#ffe0e8]"
};

export function StatCard({ title, value, icon: Icon, tone, delta, sub, negative, href }: { title: string; value: string; icon: LucideIcon; tone: string; delta?: string; sub: string; negative?: boolean; href?: string }) {
  const card = (
    <div className={`rounded-xl border p-4 ${toneClasses[tone]}`}>
      <div className="flex items-center gap-4">
        <div className={`grid h-14 w-14 place-items-center rounded-xl ${iconBg[tone]}`}><Icon className="h-7 w-7" /></div>
        <div>
          <div className="text-[27px] font-extrabold leading-tight text-[#071333]">{value}</div>
          <div className="text-[14px] text-[#08142e]">{title}</div>
        </div>
      </div>
      <div className="mt-4 pl-[72px] text-sm">{delta ? <span className={negative ? "font-bold text-red-500" : "font-bold text-green-600"}>{delta}</span> : null}<span className="ml-2 text-[#596782]">{sub}</span></div>
    </div>
  );
  return href ? <Link href={href} className="block transition hover:-translate-y-0.5 hover:shadow-md">{card}</Link> : card;
}

export function StatusBadge({ value }: { value: string }) {
  const v = value.toUpperCase();
  if (v === "CONFIRMED" || v === "COMPLETED") return <span className="inline-flex rounded-md bg-[#d9f7e8] px-3 py-1 text-sm font-bold text-[#00a451]">{v === "COMPLETED" ? "Completed" : "Confirmed"}</span>;
  if (v === "PENDING") return <span className="inline-flex items-center gap-1 rounded-md bg-[#fff0df] px-3 py-1 text-sm font-bold text-[#fb8500]"><AlertCircle className="h-3.5 w-3.5 fill-current" />Pending</span>;
  if (v === "CANCELLED") return <span className="inline-flex items-center gap-1 rounded-md bg-[#e4e9f2] px-3 py-1 text-sm font-bold text-[#5a6577]">Cancelled</span>;
  return <span className="inline-flex items-center gap-1 rounded-md bg-[#ffe2eb] px-3 py-1 text-sm font-bold text-[#f22552]"><AlertCircle className="h-3.5 w-3.5 fill-current" />Failed</span>;
}

export function WhatsAppBadge({ value }: { value: string }) {
  const v = value.toUpperCase();
  if (v === "SENT" || v === "DELIVERED" || v === "READ") return <span className="inline-flex items-center gap-1 rounded-md bg-[#dbf8ec] px-3 py-1 text-sm font-bold text-[#00a451]"><Check className="h-4 w-4" />Sent</span>;
  if (v === "SCHEDULED" || v === "PROCESSING" || v === "PENDING") return <span className="inline-flex items-center gap-1 rounded-md bg-[#e0efff] px-3 py-1 text-sm font-bold text-[#0979ee]"><Hourglass className="h-4 w-4" />Scheduled</span>;
  if (v === "CANCELLED") return <span className="inline-flex items-center gap-1 rounded-md bg-[#e4e9f2] px-3 py-1 text-sm font-bold text-[#5a6577]">Cancelled</span>;
  return <span className="inline-flex items-center gap-1 rounded-md bg-[#ffe2eb] px-3 py-1 text-sm font-bold text-[#f22552]"><AlertCircle className="h-4 w-4 fill-current" />Failed</span>;
}

export function SectionCard({ title, subtitle, action, children, className = "" }: { title: string; subtitle?: string; action?: React.ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-[#dce7f4] bg-white shadow-[0_10px_24px_rgba(31,61,105,0.04)] ${className}`}>
      <div className="flex items-start justify-between gap-4 px-4 pb-3 pt-4 sm:px-5">
        <div>
          <h2 className="text-[17px] font-extrabold text-[#071333]">{title}</h2>
          {subtitle ? <p className="text-sm text-[#65728a]">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export interface ApiBookingRow {
  id: string;
  pnr: string;
  customerName: string;
  customerPhone: string;
  flightNumber: string;
  airline: string;
  fromAirport: string;
  fromCity: string;
  toAirport: string;
  toCity: string;
  departureDate: string;
  departureTime: string;
  status: string;
  amount?: number | null;
  source?: string | null;
  latestMessage?: { status: string | null; scheduledAt: string } | null;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function BookingsTable({ compact = false, rows: apiRows, onView, onCancel }: { compact?: boolean; rows: ApiBookingRow[]; onView?: (id: string) => void; onCancel?: (id: string) => void }) {
  const [menuRow, setMenuRow] = useState<string | null>(null);
  const rows = apiRows.map((row) => {
    const initial = initialsOf(row.customerName);
    const flight = row.flightNumber || "—";
    const route = `${row.fromAirport || row.fromCity || "—"} → ${row.toAirport || row.toCity || "—"}`;
    const routeLabel = `${row.fromCity || row.fromAirport || "—"} to ${row.toCity || row.toAirport || "—"}`;
    const departure = row.departureTime ? row.departureTime : "All day";
    const date = new Date(row.departureDate);
    const dateLabel = `${String(date.getDate()).padStart(2, "0")} ${date.toLocaleString("en", { month: "short" })} ${date.getFullYear()}`;
    const messageStatus = row.latestMessage?.status;
    return { key: row.id || row.pnr, id: row.id, customer: row.customerName, phone: row.customerPhone, initials: initial, pnr: row.pnr, flight, airline: row.airline || "—", route, routeLabel, departure, date: dateLabel, status: row.status, whatsapp: messageStatus || "SCHEDULED" };
  });
  return (
    <>
      {menuRow ? <div className="fixed inset-0 z-10" onClick={() => setMenuRow(null)} /> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[#f4f7fb] text-[#071333]">
            <tr>
              <th className="px-3 py-4 font-semibold">Customer</th>
              <th className="px-3 py-4 font-semibold">PNR</th>
              <th className="px-3 py-4 font-semibold">Flight</th>
              <th className="px-3 py-4 font-semibold">Route</th>
              <th className="px-3 py-4 font-semibold">Departure</th>
              {!compact ? <th className="px-3 py-4 font-semibold">Journey Date</th> : null}
              <th className="px-3 py-4 font-semibold">Status</th>
              <th className="px-3 py-4 font-semibold">WhatsApp</th>
              <th className="px-3 py-4 font-semibold">{compact ? "" : "Actions"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5edf6]">
            {rows.map((row, index) => (
              <tr key={row.pnr} className="bg-white hover:bg-blue-50/30">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    {!compact ? <span className={`grid h-9 w-9 place-items-center rounded-full font-bold text-blue-700 ${index % 2 ? "bg-purple-100" : "bg-blue-100"}`}>{row.initials}</span> : null}
                    <div><div className="font-semibold text-[#071333]">{row.customer}</div>{!compact ? <div className="text-[#526282]">{row.phone}</div> : null}</div>
                  </div>
                </td>
                <td className="px-3 py-3 font-medium">{row.pnr}</td>
                <td className="px-3 py-3"><div className="font-medium">{row.flight}</div>{!compact ? <div className="text-[#526282]">{row.airline}</div> : null}</td>
                <td className="px-3 py-3"><div className="font-medium">{row.route}</div>{!compact ? <div className="text-[#526282]">{row.routeLabel}</div> : null}</td>
                <td className="px-3 py-3 font-medium">{row.departure}</td>
                {!compact ? <td className="px-3 py-3 font-medium">{row.date}</td> : null}
                <td className="px-3 py-3">{compact ? <span className="rounded-md bg-[#e0efff] px-3 py-1 font-bold text-[#0979ee]">Today</span> : <StatusBadge value={row.status} />}</td>
                <td className="px-3 py-3"><WhatsAppBadge value={row.whatsapp} /></td>
                <td className="px-3 py-3">
                  {compact ? <Link href={`/bookings?search=${encodeURIComponent(row.pnr)}`} className="grid h-10 w-10 place-items-center rounded-lg border border-[#d4dfed]" aria-label="Open booking"><MoreHorizontal className="h-5 w-5" /></Link> : <div className="relative flex gap-3">
                    <button onClick={() => onView?.(row.key)} className="grid h-10 w-10 place-items-center rounded-lg border border-[#d4dfed]" aria-label="View booking"><Eye className="h-4 w-4" /></button>
                    <button onClick={() => setMenuRow(menuRow === row.key ? null : row.key)} className="grid h-10 w-10 place-items-center rounded-lg border border-[#d4dfed]" aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></button>
                    {menuRow === row.key ? <div className="absolute right-0 top-11 z-20 w-44 overflow-hidden rounded-lg border border-[#dce7f4] bg-white shadow-xl">
                      <Link href={`/bookings?search=${encodeURIComponent(row.pnr)}`} onClick={() => setMenuRow(null)} className="block px-4 py-2.5 text-sm font-medium hover:bg-slate-50">Open booking</Link>
                      {row.id ? <Link href={`/bookings/${row.id}/invoice`} onClick={() => setMenuRow(null)} className="block px-4 py-2.5 text-sm font-medium hover:bg-slate-50">Print invoice</Link> : null}
                      <button onClick={() => { setMenuRow(null); onCancel?.(row.key); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" />Cancel booking</button>
                    </div> : null}
                  </div>}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={compact ? 8 : 9} className="px-5 py-8 text-center text-[#596782]">No bookings found.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function BookingFilters({ search, onSearch, status, onStatus, airlines = [], airline = "", onAirline, from = "", to = "", onFrom, onTo, onReset }: { search?: string; onSearch: (value: string) => void; status?: string; onStatus: (value: string) => void; airlines?: Array<{ name: string; count: number }>; airline?: string; onAirline?: (value: string) => void; from?: string; to?: string; onFrom?: (value: string) => void; onTo?: (value: string) => void; onReset?: () => void }) {
  return (
    <div className="grid gap-3 rounded-xl bg-transparent py-4 lg:grid-cols-[1.5fr_.7fr_.7fr_1.3fr_.4fr]">
      <div className="flex h-11 items-center gap-3 rounded-lg border border-[#d6e1ef] bg-white px-3 shadow-sm"><Search className="h-5 w-5 text-[#405174]" /><input value={search} onChange={(event) => onSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search by name, PNR, flight..." /></div>
      <select value={status} onChange={(event) => onStatus(event.target.value)} className="h-11 rounded-lg border border-[#d6e1ef] bg-white px-4 text-sm shadow-sm outline-none">
        <option value="">All Status</option>
        <option value="CONFIRMED">Confirmed</option>
        <option value="PENDING">Pending</option>
        <option value="CANCELLED">Cancelled</option>
        <option value="FAILED">Failed</option>
      </select>
      <select value={airline} onChange={(event) => onAirline?.(event.target.value)} className="h-11 rounded-lg border border-[#d6e1ef] bg-white px-4 text-sm shadow-sm outline-none">
        <option value="">All Airlines</option>
        {airlines.map((option) => <option key={option.name} value={option.name}>{option.name}</option>)}
      </select>
      <div className="flex h-11 items-center gap-2 rounded-lg border border-[#d6e1ef] bg-white px-3 shadow-sm"><CalendarDays className="h-4 w-4 shrink-0 text-[#65728a]" /><input type="date" value={from} onChange={(event) => onFrom?.(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" aria-label="From date" /><span className="text-[#65728a]">→</span><input type="date" value={to} onChange={(event) => onTo?.(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" aria-label="To date" /></div>
      <button onClick={onReset} className="rounded-lg border border-[#d6e1ef] bg-white px-5 text-sm font-semibold shadow-sm">Reset</button>
    </div>
  );
}

export function BookingToolbar({ onExport }: { onExport?: () => void }) {
  return <div className="flex flex-col gap-3 sm:flex-row"><button onClick={onExport} className="flex h-[52px] items-center justify-center gap-3 rounded-lg border border-[#d6e1ef] bg-white px-7 py-3 font-semibold shadow-sm"><Download className="h-5 w-5" />Export</button><Link href="/bookings/add" className="flex h-[52px] items-center justify-center gap-3 rounded-lg bg-[#1688f9] px-7 py-3 font-bold text-white shadow-sm"><Plus className="h-5 w-5" />Add Booking</Link></div>;
}

export function Pagination({ total, page = 1, limit = 8, onPageChange, onLimitChange }: { total?: number; page?: number; limit?: number; onPageChange?: (page: number) => void; onLimitChange?: (limit: number) => void }) {
  const from = total === undefined ? 1 : (page - 1) * limit + 1;
  const to = total === undefined ? 8 : Math.min(page * limit, total);
  const pages = total === undefined ? 5 : Math.max(1, Math.ceil(total / limit));
  const current = total === undefined ? 1 : page;
  return <div className="flex flex-col items-center justify-between gap-4 border-t border-[#e5edf6] px-5 py-4 text-sm text-[#455574] sm:flex-row"><span>{total === undefined ? "Showing 1 to 8 of 124 bookings" : `Showing ${from} to ${to} of ${total} bookings`}</span><div className="flex items-center gap-2"><button disabled={current <= 1} onClick={() => onPageChange?.(current - 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6e1ef] disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>{pages <= 7 ? Array.from({ length: pages }, (_, i) => i + 1).map((p) => <button key={p} onClick={() => onPageChange?.(p)} className={`grid h-9 w-9 place-items-center rounded-lg border border-[#d6e1ef] ${p === current ? "bg-[#1688f9] text-white" : "bg-white"}`}>{p}</button>) : <span className="px-2">Page {current} of {pages}</span>}<button disabled={current >= pages} onClick={() => onPageChange?.(current + 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6e1ef] disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div><label className="flex items-center gap-3 rounded-lg border border-[#d6e1ef] bg-white px-4 py-2">Rows per page <select value={limit} onChange={(event) => onLimitChange?.(Number(event.target.value))} className="bg-transparent font-bold outline-none"><option value={8}>8</option><option value={25}>25</option><option value={50}>50</option></select><ChevronDown className="h-4 w-4" /></label></div>;
}
