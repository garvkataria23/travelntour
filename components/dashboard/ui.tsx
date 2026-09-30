"use client";

import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Copy, Download, Eye, Hourglass, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
    <div className={`group rounded-xl border p-3 sm:p-3.5 xl:p-4 transition-all duration-200 hover:shadow-md min-w-0 ${toneClasses[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500" title={title}>{title}</div>
          <div className="mt-1 text-lg sm:text-xl xl:text-2xl 2xl:text-[26px] font-extrabold tracking-tight text-[#071333] tabular-nums truncate" title={value}>{value}</div>
        </div>
        <div className={`grid h-9 w-9 sm:h-10 sm:w-10 xl:h-11 xl:w-11 shrink-0 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${iconBg[tone]}`}>
          <Icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
        </div>
      </div>
      <div className="mt-2 sm:mt-2.5 flex items-center text-xs text-slate-500 truncate">
        {delta ? <span className={`mr-1.5 font-bold shrink-0 ${negative ? "text-rose-600" : "text-emerald-600"}`}>{delta}</span> : null}
        <span className="truncate">{sub}</span>
      </div>
    </div>
  );
  return href ? <Link href={href} className="block min-w-0 transition hover:-translate-y-0.5">{card}</Link> : card;
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

export function BookingsTable({ compact = false, dense = false, rows: apiRows, highlightedIds, onView, onCancel, onEdit }: { compact?: boolean; dense?: boolean; rows: ApiBookingRow[]; highlightedIds?: Set<string>; onView?: (id: string) => void; onCancel?: (id: string) => void; onEdit?: (id: string) => void }) {
  const [menuRow, setMenuRow] = useState<string | null>(null);
  const [copiedPnr, setCopiedPnr] = useState<string | null>(null);
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

  const cellPadding = dense ? "px-3 py-2" : "px-3.5 py-3";

  return (
    <>
      {menuRow ? <div className="fixed inset-0 z-10" onClick={() => setMenuRow(null)} /> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[#f4f7fb] text-xs font-bold uppercase tracking-wider text-slate-600 border-b border-[#e5edf6]">
            <tr>
              <th className="px-3.5 py-3 font-semibold">Customer</th>
              <th className="px-3.5 py-3 font-semibold">PNR</th>
              <th className="px-3.5 py-3 font-semibold">Flight</th>
              <th className="px-3.5 py-3 font-semibold">Route</th>
              <th className="px-3.5 py-3 font-semibold">Departure</th>
              {!compact ? <th className="px-3.5 py-3 font-semibold">Journey Date</th> : null}
              <th className="px-3.5 py-3 font-semibold">Status</th>
              <th className="px-3.5 py-3 font-semibold">WhatsApp</th>
              <th className="px-3.5 py-3 font-semibold">{compact ? "" : "Actions"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5edf6]">
            {rows.map((row, index) => {
              const isHighlighted = !!(row.id && highlightedIds?.has(row.id));
              return (
              <tr
                key={row.pnr}
                className={`transition-all duration-300 ${
                  isHighlighted
                    ? "bg-emerald-50/90 ring-1 ring-inset ring-emerald-400"
                    : "bg-white hover:bg-blue-50/40"
                }`}
              >
                <td className={cellPadding}>
                  <div className="flex items-center gap-2.5">
                    {!compact ? <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold text-blue-700 ${index % 2 ? "bg-purple-100" : "bg-blue-100"}`}>{row.initials}</span> : null}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-semibold text-[#071333] truncate">
                        <span>{row.customer}</span>
                        {isHighlighted && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.2 text-[9px] font-extrabold text-emerald-800 animate-pulse">
                            ● Live
                          </span>
                        )}
                      </div>
                      {!compact ? <div className="text-xs text-slate-500 truncate">{row.phone}</div> : null}
                    </div>
                  </div>
                </td>
                <td className={cellPadding}>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof navigator !== "undefined") {
                        navigator.clipboard.writeText(row.pnr);
                        setCopiedPnr(row.pnr);
                        setTimeout(() => setCopiedPnr(null), 1500);
                      }
                    }}
                    title="Click to copy PNR"
                    className="group/pnr inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-900 hover:bg-blue-100 hover:text-blue-700 transition"
                  >
                    <span>{row.pnr}</span>
                    {copiedPnr === row.pnr ? (
                      <Check className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <Copy className="h-3 w-3 text-slate-400 opacity-60 group-hover/pnr:opacity-100" />
                    )}
                  </button>
                </td>
                <td className={cellPadding}><div className="font-semibold text-slate-900">{row.flight}</div>{!compact ? <div className="text-xs text-slate-500">{row.airline}</div> : null}</td>
                <td className={cellPadding}><div className="font-semibold text-slate-900">{row.route}</div>{!compact ? <div className="text-xs text-slate-500">{row.routeLabel}</div> : null}</td>
                <td className={cellPadding}><span className="font-mono text-xs font-semibold text-slate-800">{row.departure}</span></td>
                {!compact ? <td className={cellPadding}><span className="font-mono text-xs text-slate-700">{row.date}</span></td> : null}
                <td className={cellPadding}>{compact ? <span className="rounded-md bg-[#e0efff] px-2.5 py-0.5 text-xs font-bold text-[#0979ee]">Today</span> : <StatusBadge value={row.status} />}</td>
                <td className={cellPadding}><WhatsAppBadge value={row.whatsapp} /></td>
                <td className={cellPadding}>
                  {compact ? <Link href={`/bookings?search=${encodeURIComponent(row.pnr)}`} className="grid h-8 w-8 place-items-center rounded-lg border border-[#d4dfed] text-slate-600 hover:bg-slate-50" aria-label="Open booking"><MoreHorizontal className="h-4 w-4" /></Link> : <div className="relative flex gap-2">
                    <button onClick={() => onView?.(row.key)} className="grid h-8 w-8 place-items-center rounded-lg border border-[#d4dfed] text-slate-600 transition hover:bg-slate-50 hover:text-blue-600" aria-label="View booking"><Eye className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setMenuRow(menuRow === row.key ? null : row.key)} className="grid h-8 w-8 place-items-center rounded-lg border border-[#d4dfed] text-slate-600 transition hover:bg-slate-50 hover:text-blue-600" aria-label="More actions"><MoreHorizontal className="h-3.5 w-3.5" /></button>
                    {menuRow === row.key ? <div className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-xl border border-[#dce7f4] bg-white shadow-xl">
                      <Link href={`/bookings?search=${encodeURIComponent(row.pnr)}`} onClick={() => setMenuRow(null)} className="block px-4 py-2.5 text-xs font-medium hover:bg-slate-50">Open booking</Link>
                      <button onClick={() => { setMenuRow(null); onEdit?.(row.key); }} className="block w-full px-4 py-2.5 text-left text-xs font-medium hover:bg-slate-50">Edit booking</button>
                      {row.id ? <Link href={`/bookings/${row.id}/invoice`} onClick={() => setMenuRow(null)} className="block px-4 py-2.5 text-xs font-medium hover:bg-slate-50">Print invoice</Link> : null}
                      <button onClick={() => { setMenuRow(null); onCancel?.(row.key); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />Cancel booking</button>
                    </div> : null}
                  </div>}
                </td>
              </tr>
              );
            })}
            {rows.length === 0 ? <tr><td colSpan={compact ? 8 : 9} className="px-5 py-10 text-center text-sm text-slate-400">No bookings found.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function BookingFilters({ search, onSearch, status, onStatus, airlines = [], airline = "", onAirline, from = "", to = "", onFrom, onTo, onReset }: { search?: string; onSearch: (value: string) => void; status?: string; onStatus: (value: string) => void; airlines?: Array<{ name: string; count: number }>; airline?: string; onAirline?: (value: string) => void; from?: string; to?: string; onFrom?: (value: string) => void; onTo?: (value: string) => void; onReset?: () => void }) {
  return (
    <div className="grid gap-2.5 rounded-xl bg-transparent py-2 lg:grid-cols-[1.5fr_.7fr_.7fr_1.3fr_.4fr]">
      <div className="flex h-10 items-center gap-2.5 rounded-lg border border-[#d6e1ef] bg-white px-3 shadow-xs"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => onSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs sm:text-sm outline-none" placeholder="Search by name, PNR, flight..." /></div>
      <select value={status} onChange={(event) => onStatus(event.target.value)} className="h-10 rounded-lg border border-[#d6e1ef] bg-white px-3 text-xs sm:text-sm shadow-xs outline-none">
        <option value="">All Status</option>
        <option value="CONFIRMED">Confirmed</option>
        <option value="PENDING">Pending</option>
        <option value="COMPLETED">Completed</option>
        <option value="CANCELLED">Cancelled</option>
      </select>
      <select value={airline} onChange={(event) => onAirline?.(event.target.value)} className="h-10 rounded-lg border border-[#d6e1ef] bg-white px-3 text-xs sm:text-sm shadow-xs outline-none">
        <option value="">All Airlines</option>
        {airlines.map((option) => <option key={option.name} value={option.name}>{option.name}</option>)}
      </select>
      <div className="flex h-10 items-center gap-2 rounded-lg border border-[#d6e1ef] bg-white px-3 shadow-xs"><CalendarDays className="h-4 w-4 shrink-0 text-slate-400" /><input type="date" value={from} onChange={(event) => onFrom?.(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs sm:text-sm outline-none" aria-label="From date" /><span className="text-slate-400">→</span><input type="date" value={to} onChange={(event) => onTo?.(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs sm:text-sm outline-none" aria-label="To date" /></div>
      <button onClick={onReset} className="h-10 rounded-lg border border-[#d6e1ef] bg-white px-4 text-xs sm:text-sm font-semibold text-slate-600 shadow-xs hover:bg-slate-50 transition">Reset</button>
    </div>
  );
}

export function BookingToolbar({ onExport }: { onExport?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <button onClick={onExport} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#d6e1ef] bg-white px-4 text-xs sm:text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition">
        <Download className="h-4 w-4" />
        Export
      </button>
      <Link href="/bookings/add" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1688f9] px-4 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-[#1270d1] transition active:scale-95">
        <Plus className="h-4 w-4 stroke-[2.5]" />
        Add Booking
      </Link>
    </div>
  );
}

export function Pagination({ total = 0, page = 1, limit = 8, label = "records", onPageChange, onLimitChange }: { total?: number; page?: number; limit?: number; label?: string; onPageChange?: (page: number) => void; onLimitChange?: (limit: number) => void }) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const pages = Math.max(1, Math.ceil(total / limit));
  const current = page;
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-[#e5edf6] bg-slate-50/50 px-4 py-3 text-xs sm:text-sm text-slate-600 sm:flex-row">
      <span className="font-medium">{total === 0 ? `Showing 0 ${label}` : `Showing ${from}–${to} of ${total} ${label}`}</span>
      <div className="flex items-center gap-1.5">
        <button disabled={current <= 1} onClick={() => onPageChange?.(current - 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-[#d6e1ef] bg-white disabled:opacity-30 hover:bg-slate-50 transition" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
        {pages <= 7 ? Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
          <button key={p} onClick={() => onPageChange?.(p)} className={`grid h-8 w-8 place-items-center rounded-lg border text-xs font-bold transition ${p === current ? "border-[#1688f9] bg-[#1688f9] text-white shadow-xs" : "border-[#d6e1ef] bg-white text-slate-700 hover:bg-slate-50"}`}>{p}</button>
        )) : <span className="px-2 text-xs font-semibold">Page {current} of {pages}</span>}
        <button disabled={current >= pages} onClick={() => onPageChange?.(current + 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-[#d6e1ef] bg-white disabled:opacity-30 hover:bg-slate-50 transition" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <label className="flex items-center gap-2 rounded-lg border border-[#d6e1ef] bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
        Rows:
        <select value={limit} onChange={(event) => onLimitChange?.(Number(event.target.value))} className="bg-transparent font-bold text-slate-900 outline-none">
          <option value={8}>8</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
        </select>
        <ChevronDown className="h-3 w-3 text-slate-400" />
      </label>
    </div>
  );
}
