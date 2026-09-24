"use client";

import { AppShell } from "@/components/dashboard/app-shell";
import { StatCard } from "@/components/dashboard/ui";
import { useApi } from "@/lib/hooks";
import { api, formatCurrency, formatDate } from "@/lib/api";
import { CalendarDays, Download, MessageCircle, Plane, TrendingDown, TrendingUp, Users, X } from "lucide-react";
import { useMemo, useState } from "react";

interface TrendPoint { date: string; count: number }
interface RecentBooking { id: string; createdAt: string; pnr: string; customerName: string; fromAirport: string; toAirport: string; amount: number | null; status: string; source: string }
interface BookingsReport { total: number; revenue: number; byStatus: { status: string; count: number }[]; bySource: { source: string; count: number }[]; trend: TrendPoint[]; recent: RecentBooking[] }
interface MonthBucket { month: string; revenue: number; count: number }
interface RevenueReport { totalRevenue: number; currency: string; byMonth: MonthBucket[] }
interface OverviewStats {
  stats: {
    revenue: number;
    directCost: number;
    operatingCost: number;
    grossProfit: number;
    netProfit: number;
  };
}
interface MessagesReport { total: number; delivered: number; read: number; sent: number; pending: number; failed: number; cancelled: number; deliveryRate: number; readRate: number; failedRate: number }
interface ExpensesReport {
  total: number;
  count: number;
  currency: string;
  byCategory: { category: string; total: number; count: number }[];
  directCost: number;
  operatingCost: number;
  byTitle: { title: string; total: number; count: number }[];
  byMonth: { month: string; total: number; count: number }[];
}
interface CustomersReport { total: number; growth: { month: string; count: number }[]; top: { id: string; name: string; phone: string; bookings: number }[] }
interface RouteRow { route: string; count: number }
interface AirlineRow { airline: string | null; count: number; revenue: number; share: number }
interface InvoicesReport {
  issued: number;
  billed: number;
  collected: number;
  outstanding: number;
  currency: string;
  byStatus: { status: string; count: number }[];
  byMonth: { month: string; billed: number; collected: number; count: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  SCHEDULED: "Scheduled",
  PENDING: "Pending",
  CANCELLED: "Cancelled",
  FAILED: "Failed",
};

const SOURCE_LABELS: Record<string, string> = {
  DIRECT: "Direct (Website)",
  WEBSITE: "Direct (Website)",
  WHATSAPP: "WhatsApp",
  PHONE: "Phone",
  WALK_IN: "Walk-in",
  MANUAL: "Manual",
  OTHER: "Other",
};

const SOURCE_COLORS: Record<string, string> = {
  DIRECT: "#3b82f6",
  WEBSITE: "#3b82f6",
  WHATSAPP: "#22c55e",
  PHONE: "#f59e0b",
  WALK_IN: "#f43f5e",
  MANUAL: "#a855f7",
  OTHER: "#94a3b8",
};

const TABS = ["Overview", "Bookings", "Revenue", "Customers", "Communication", "Expenses", "Invoicing", "Routes", "Airlines"] as const;
type Tab = (typeof TABS)[number];

interface BookingExportItem {
  pnr?: string;
  fromAirport?: string | null;
  toAirport?: string | null;
  amount?: number | null;
  status?: string;
  source?: string;
  departureDate?: string;
  customer?: { name?: string } | null;
}
interface BookingExportList { items: BookingExportItem[]; meta?: { total: number } }

export default function ReportsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [active, setActive] = useState<Tab>("Overview");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [routesOpen, setRoutesOpen] = useState(false);

  const rangeQs = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [from, to]);

  const bookingsRep = useApi<BookingsReport>(`/reports/bookings${rangeQs}`);
  const revenueRep = useApi<RevenueReport>(`/reports/revenue${rangeQs}`);
  const overviewRep = useApi<OverviewStats>("/reports/overview");
  const messagesRep = useApi<MessagesReport>(`/reports/messages${rangeQs}`);
  const expensesRep = useApi<ExpensesReport>(`/reports/expenses${rangeQs}`);
  const invoicesRep = useApi<InvoicesReport>(`/reports/invoices${rangeQs}`);
  const customersRep = useApi<CustomersReport>("/reports/customers");
  const routesRep = useApi<RouteRow[]>("/reports/routes");
  const airlinesRep = useApi<AirlineRow[]>("/reports/airlines");

  const line = (bookingsRep.data?.trend ?? []).map((t) => t.count);
  const maxLine = Math.max(1, ...line);

  const byMonth = revenueRep.data?.byMonth ?? [];
  const maxRevenue = Math.max(1, ...byMonth.map((b) => b.revenue));

  const bySource = bookingsRep.data?.bySource ?? [];
  const sourceTotal = bySource.reduce((sum, s) => sum + s.count, 0);
  const donutBg = useMemo(() => buildDonut(bySource, sourceTotal), [bySource, sourceTotal]);

  const routes = routesRep.data ?? [];
  const maxRoute = Math.max(1, ...routes.map((r) => r.count));
  const airlines = airlinesRep.data ?? [];

  async function ensureAirlines() { airlinesRep.refetch(); }

  async function exportReport() {
    setExporting(true);
    setExportError("");
    try {
      const listParams = new URLSearchParams();
      if (from) listParams.set("from", from);
      if (to) listParams.set("to", to);
      listParams.set("page", "1");
      listParams.set("limit", "1000");
      const data = await api<BookingExportList>(`/bookings?${listParams.toString()}`);
      const rows = (data.items ?? []).map((b) => [
        formatDate(b.departureDate ?? ""),
        b.pnr ?? "",
        b.customer?.name ?? "",
        `${b.fromAirport || "—"} → ${b.toAirport || "—"}`,
        formatCurrency(b.amount ?? 0, revenueRep.data?.currency),
        STATUS_LABELS[b.status ?? ""] ?? (b.status ?? ""),
        SOURCE_LABELS[b.source ?? ""] ?? (b.source ?? ""),
      ]);
      downloadCsv("reports-bookings.csv", [["Date", "PNR", "Customer", "Route", "Amount", "Status", "Source"], ...rows]);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Unable to export report");
    } finally {
      setExporting(false);
    }
  }

  const statCards = [
    { title: "Total Bookings", value: bookingsRep.data ? String(bookingsRep.data.total) : "—", icon: Plane, tone: "blue", delta: "", sub: from || to ? "in selected range" : "all time" },
    { title: "Total Revenue", value: revenueRep.data ? formatCurrency(revenueRep.data.totalRevenue, revenueRep.data.currency) : "—", icon: Users, tone: "green", delta: "", sub: "non-cancelled" },
    { title: "Gross Profit", value: overviewRep.data ? formatCurrency(overviewRep.data.stats.grossProfit, revenueRep.data?.currency) : "—", icon: TrendingUp, tone: "emerald", delta: "", sub: "revenue minus direct cost" },
    { title: "Net Profit", value: overviewRep.data ? formatCurrency(overviewRep.data.stats.netProfit, revenueRep.data?.currency) : "—", icon: TrendingDown, tone: overviewRep.data && overviewRep.data.stats.netProfit < 0 ? "rose" : "purple", delta: "", sub: "gross minus operating cost" },
    { title: "Total Customers", value: customersRep.data ? String(customersRep.data.total) : "—", icon: Users, tone: "purple", delta: "", sub: "all time" },
    { title: "Messages Sent", value: messagesRep.data ? String(messagesRep.data.total) : "—", icon: MessageCircle, tone: "orange", delta: "", sub: from || to ? "in selected range" : "all time" },
  ];

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex flex-col justify-between gap-4 pt-2 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-[34px] font-extrabold tracking-[-0.04em]">Reports</h1>
            <p className="text-base text-[#596782]">Get insights into your bookings, revenue, customers and communication performance.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-[#596782]">From</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-11 rounded-lg border border-[#d6e1ef] bg-white px-3 text-sm outline-none focus:border-[#1688f9]" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-[#596782]">To</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-11 rounded-lg border border-[#d6e1ef] bg-white px-3 text-sm outline-none focus:border-[#1688f9]" />
            </label>
            {(from || to) ? (
              <button onClick={() => { setFrom(""); setTo(""); }} className="grid h-11 w-11 place-items-center rounded-lg border border-[#d6e1ef] text-[#405174]" title="Reset range"><X className="h-4 w-4" /></button>
            ) : (
              <span className="flex h-11 items-center gap-2 rounded-lg border border-[#d6e1ef] bg-[#f8fbff] px-4 text-sm font-semibold text-[#596782]"><CalendarDays className="h-4 w-4" />All time</span>
            )}
            <button onClick={exportReport} disabled={exporting} className="flex h-11 items-center gap-2 rounded-lg bg-[#1688f9] px-6 font-bold text-white disabled:opacity-60"><Download className="h-4 w-4" />{exporting ? "Exporting..." : "Export Report"}</button>
          </div>
        </div>

        {bookingsRep.error ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{bookingsRep.error}</p> : null}
        {exportError ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{exportError}</p> : null}

        <div className="grid gap-3 xl:grid-cols-[1fr_205px]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{statCards.map((s) => <StatCard key={s.title} {...s} />)}</div>

            <div className="flex flex-wrap gap-2 border-b border-[#dce7f4]">
              {TABS.map((t) => (
                <button key={t} onClick={() => setActive(t)} className={`rounded-t-lg px-4 py-3 text-sm ${active === t ? "border-b-2 border-[#1688f9] font-bold text-[#087df0]" : "text-[#405174] hover:text-[#087df0]"}`}>{t}</button>
              ))}
            </div>

            {active === "Overview" ? (
              <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
                <Card title="Bookings Trend (last 30 days)">
                  <LineChart values={line} max={maxLine} labels={bookingsRep.data?.trend ?? []} />
                </Card>
                <Card title="Bookings by Source">
                  <DonutLegacy bg={donutBg} center={`${sourceTotal}\nBookings`} />
                  <Legend rows={bySource.map((s) => [SOURCE_LABELS[s.source] ?? s.source, sourceTotal > 0 ? Math.round((s.count / sourceTotal) * 100) : 0, SOURCE_COLORS[s.source] ?? "#94a3b8"])} />
                </Card>
                <Card title="Revenue Trend">
                  <RevenueChart byMonth={byMonth} max={maxRevenue} currency={revenueRep.data?.currency} />
                </Card>
                <Card title="Expense Breakdown">
                  <ExpenseBreakdown stats={overviewRep.data?.stats} currency={revenueRep.data?.currency ?? undefined} />
                </Card>
                <Card title="Top Routes" action={<button onClick={() => setRoutesOpen(true)} className="rounded-lg border border-[#d6e1ef] px-4 py-2 text-sm font-normal text-[#405174]">View All</button>}>
                  <div className="space-y-4">
                    {(routes.length ? routes.slice(0, 5) : [{ route: "No data", count: 0 }]).map((r) => (
                      <p key={r.route} className="grid grid-cols-[90px_1fr_30px] items-center gap-3 text-sm">
                        <span className="truncate text-[#405174]">{r.route}</span>
                        <span className="h-2 rounded bg-[#e5edf6]"><span className="block h-2 rounded bg-[#1688f9]" style={{ width: `${Math.max(2, Math.round((r.count / maxRoute) * 100))}%` }} /></span>
                        <b>{r.count}</b>
                      </p>
                    ))}
                  </div>
                </Card>
              </div>
            ) : null}

            {active === "Bookings" ? (
              <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.4fr]">
                <Card title="By Status">
                  <div className="space-y-3">
                    {(bookingsRep.data?.byStatus.length ? bookingsRep.data.byStatus : []).map((x) => <StatusBar key={x.status} label={STATUS_LABELS[x.status] ?? x.status} count={x.count} total={bookingsRep.data?.total ?? 1} />)}
                    {!bookingsRep.data?.byStatus.length ? <p className="text-sm text-[#596782]">No data</p> : null}
                  </div>
                </Card>
                <Card title="By Source">
                  <div className="space-y-3">
                    {bySource.map((x) => <StatusBar key={x.source} label={SOURCE_LABELS[x.source] ?? x.source} count={x.count} total={sourceTotal || 1} color={SOURCE_COLORS[x.source] ?? "#94a3b8"} />)}
                    {!bySource.length ? <p className="text-sm text-[#596782]">No data</p> : null}
                  </div>
                </Card>
                <Card title="Recent Bookings">
                  <div className="divide-y divide-[#e5edf6]">
                    {(bookingsRep.data?.recent ?? []).map((b) => (
                      <div key={b.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <div className="min-w-0"><b className="block truncate">{b.pnr} · {b.customerName}</b><span className="truncate text-[#596782]">{formatDate(b.createdAt)} · {b.fromAirport || "—"} → {b.toAirport || "—"}</span></div>
                        <div className="text-right"><span className="font-bold text-[#405174]">{formatCurrency(b.amount ?? 0, revenueRep.data?.currency)}</span><span className="block text-xs text-[#596782]">{STATUS_LABELS[b.status] ?? b.status}</span></div>
                      </div>
                    ))}
                    {!bookingsRep.data?.recent.length ? <p className="py-4 text-center text-sm text-[#596782]">No bookings found.</p> : null}
                  </div>
                </Card>
              </div>
            ) : null}

            {active === "Revenue" ? (
              <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
                <Card title={`Revenue Trend (${revenueRep.data?.currency ?? "INR"})`}>
                  <RevenueChart byMonth={byMonth} max={maxRevenue} currency={revenueRep.data?.currency} tall />
                </Card>
                <Card title="Monthly Breakdown">
                  <div className="divide-y divide-[#e5edf6]">
                    {byMonth.map((b) => (
                      <div key={b.month} className="flex items-center justify-between py-2 text-sm"><span className="font-semibold text-[#405174]">{b.month}</span><span className="text-[#596782]">{b.count} booking{b.count === 1 ? "" : "s"}</span><b>{formatCurrency(b.revenue, revenueRep.data?.currency)}</b></div>
                    ))}
                    {!byMonth.length ? <p className="py-4 text-center text-sm text-[#596782]">No revenue data.</p> : null}
                  </div>
                </Card>
              </div>
            ) : null}

            {active === "Customers" ? (
              <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
                <Card title="Customer Growth (by month)">
                  <CustomerGrowth points={customersRep.data?.growth ?? []} />
                </Card>
                <Card title="Top Customers">
                  <div className="divide-y divide-[#e5edf6]">
                    {(customersRep.data?.top ?? []).map((c) => (
                      <div key={c.id} className="flex items-center justify-between py-2 text-sm"><span className="font-semibold text-[#405174]">{c.name}</span><span className="text-[#596782]">{c.phone}</span><b>{c.bookings} booking{c.bookings === 1 ? "" : "s"}</b></div>
                    ))}
                    {!customersRep.data?.top.length ? <p className="py-4 text-center text-sm text-[#596782]">No customers yet.</p> : null}
                  </div>
                </Card>
              </div>
            ) : null}

            {active === "Communication" ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MiniStat label="Delivered" value={messagesRep.data ? String(messagesRep.data.delivered) : "—"} color="text-[#00a451]" />
                  <MiniStat label="Read" value={messagesRep.data ? String(messagesRep.data.read) : "—"} color="text-[#087df0]" />
                  <MiniStat label="Sent" value={messagesRep.data ? String(messagesRep.data.sent) : "—"} color="text-[#405174]" />
                  <MiniStat label="Pending" value={messagesRep.data ? String(messagesRep.data.pending) : "—"} color="text-amber-600" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MiniStat label="Failed" value={messagesRep.data ? String(messagesRep.data.failed) : "—"} color="text-rose-600" />
                  <MiniStat label="Cancelled" value={messagesRep.data ? String(messagesRep.data.cancelled) : "—"} color="text-[#596782]" />
                  <MiniStat label="Delivery Rate" value={messagesRep.data ? `${messagesRep.data.deliveryRate}%` : "—"} color="text-[#00a451]" />
                  <MiniStat label="Read Rate" value={messagesRep.data ? `${messagesRep.data.readRate}%` : "—"} color="text-[#087df0]" />
                </div>
                {messagesRep.data ? (
                  <Card title="Message Health">
                    <p className="mb-3 text-sm text-[#596782]">{messagesRep.data.total} message{messagesRep.data.total === 1 ? "" : "s"} in selected range · {messagesRep.data.failedRate}% failed</p>
                    <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
                      <div className="flex gap-1">
                        <Bar segment="bg-green-500" pct={messagesRep.data.total ? (messagesRep.data.delivered / messagesRep.data.total) * 100 : 0} />
                        <Bar segment="bg-blue-500" pct={messagesRep.data.total ? (messagesRep.data.sent / messagesRep.data.total) * 100 : 0} />
                        <Bar segment="bg-amber-400" pct={messagesRep.data.total ? (messagesRep.data.pending / messagesRep.data.total) * 100 : 0} />
                        <Bar segment="bg-rose-500" pct={messagesRep.data.total ? (messagesRep.data.failed / messagesRep.data.total) * 100 : 0} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <LegendDot color="bg-green-500" label={`Delivered (${messagesRep.data.delivered})`} />
                        <LegendDot color="bg-blue-500" label={`Sent (${messagesRep.data.sent})`} />
                        <LegendDot color="bg-amber-400" label={`Pending (${messagesRep.data.pending})`} />
                        <LegendDot color="bg-rose-500" label={`Failed (${messagesRep.data.failed})`} />
                      </div>
                    </div>
                  </Card>
                ) : null}
              </div>
            ) : null}

            {active === "Expenses" ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MiniStat label="Total Expenses" value={expensesRep.data ? formatCurrency(expensesRep.data.total, expensesRep.data.currency) : "—"} color="text-[#071333]" />
                  <MiniStat label="Entries" value={expensesRep.data ? String(expensesRep.data.count) : "—"} color="text-[#405174]" />
                  <MiniStat label="Direct Cost" value={expensesRep.data ? formatCurrency(expensesRep.data.directCost, expensesRep.data.currency) : "—"} color="text-orange-600" />
                  <MiniStat label="Operating Cost" value={expensesRep.data ? formatCurrency(expensesRep.data.operatingCost, expensesRep.data.currency) : "—"} color="text-[#596782]" />
                </div>
                <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr]">
                  <Card title={`Expense Trend (${expensesRep.data?.currency ?? "INR"})`}>
                    <ExpenseMonthly byMonth={expensesRep.data?.byMonth ?? []} max={Math.max(1, ...(expensesRep.data?.byMonth ?? []).map((b) => b.total))} currency={expensesRep.data?.currency ?? undefined} />
                    <p className="mt-1 text-xs text-[#596782]">{from || to ? "in selected range" : "all time"}</p>
                  </Card>
                  <Card title="By Category">
                    <div className="space-y-3">
                      {(expensesRep.data?.byCategory.length ? expensesRep.data.byCategory : []).map((c) => <StatusBar key={c.category} label={c.category} count={c.count} total={expensesRep.data?.count ?? 1} color={c.category === "DIRECT" ? "#fb8500" : "#8a97ad"} />)}
                      {!expensesRep.data?.byCategory.length ? <p className="text-sm text-[#596782]">No data</p> : null}
                    </div>
                    <div className="mt-3 space-y-1 border-t border-[#e5edf6] pt-3 text-sm">
                      <p className="flex justify-between text-[#405174]"><span>Direct (COGS)</span><b>{formatCurrency(expensesRep.data?.directCost ?? 0, expensesRep.data?.currency)}</b></p>
                      <p className="flex justify-between text-[#405174]"><span>Operating (overheads)</span><b>{formatCurrency(expensesRep.data?.operatingCost ?? 0, expensesRep.data?.currency)}</b></p>
                    </div>
                  </Card>
                  <Card title="Top Expense Heads">
                    <div className="divide-y divide-[#e5edf6]">
                      {(expensesRep.data?.byTitle ?? []).map((t) => (
                        <div key={t.title} className="flex items-center justify-between gap-2 py-2 text-sm">
                          <span className="min-w-0 truncate font-semibold text-[#405174]">{t.title}</span>
                          <span className="shrink-0 text-xs text-[#8a97ad]">×{t.count}</span>
                          <b className="shrink-0">{formatCurrency(t.total, expensesRep.data?.currency)}</b>
                        </div>
                      ))}
                      {!expensesRep.data?.byTitle.length ? <p className="py-4 text-center text-sm text-[#596782]">No expense data yet.</p> : null}
                    </div>
                  </Card>
                </div>
              </div>
            ) : null}

            {active === "Invoicing" ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MiniStat label="Invoices Issued" value={invoicesRep.data ? String(invoicesRep.data.issued) : "—"} color="text-[#071333]" />
                  <MiniStat label="Total Billed" value={invoicesRep.data ? formatCurrency(invoicesRep.data.billed, invoicesRep.data.currency) : "—"} color="text-[#405174]" />
                  <MiniStat label="Collected" value={invoicesRep.data ? formatCurrency(invoicesRep.data.collected, invoicesRep.data.currency) : "—"} color="text-emerald-600" />
                  <MiniStat label="Outstanding" value={invoicesRep.data ? formatCurrency(invoicesRep.data.outstanding, invoicesRep.data.currency) : "—"} color="text-rose-600" />
                </div>
                <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
                  <Card title={`Billing & Collections (${invoicesRep.data?.currency ?? "INR"})`}>
                    <InvoiceMonthly byMonth={invoicesRep.data?.byMonth ?? []} max={Math.max(1, ...(invoicesRep.data?.byMonth ?? []).map((b) => b.billed))} currency={invoicesRep.data?.currency ?? undefined} />
                    <p className="mt-1 text-xs text-[#596782]">{from || to ? "in selected range" : "all time"}</p>
                  </Card>
                  <Card title="By Payment Status">
                    <div className="space-y-3">
                      {(invoicesRep.data?.byStatus ?? []).map((s) => <StatusBar key={s.status} label={s.status} count={s.count} total={invoicesRep.data?.issued ?? 1} color={s.status === "PAID" ? "#059669" : s.status === "PARTIAL" ? "#fb8500" : "#f43f5e"} />)}
                      {!invoicesRep.data?.byStatus.length ? <p className="py-4 text-center text-sm text-[#596782]">No invoices yet in this range.</p> : null}
                    </div>
                  </Card>
                </div>
              </div>
            ) : null}

            {active === "Routes" ? (
              <Card title="All Routes">
                <div className="space-y-3">
                  {routes.map((r) => <StatusBar key={r.route} label={r.route} count={r.count} total={maxRoute} />)}
                  {!routes.length ? <p className="py-4 text-center text-sm text-[#596782]">No route data yet.</p> : null}
                </div>
              </Card>
            ) : null}

            {active === "Airlines" ? (
              <div className="grid gap-3 xl:grid-cols-[1fr_1fr]">
                <Card title="Airlines by Bookings" action={<button onClick={() => ensureAirlines()} className="rounded-lg border border-[#d6e1ef] px-4 py-2 text-sm font-normal text-[#405174]">Refresh</button>}>
                  <div className="space-y-3">
                    {airlines.map((a) => (
                      <div key={a.airline ?? "Unknown"} className="grid grid-cols-[130px_1fr_90px] items-center gap-3 text-sm">
                        <span className="truncate font-semibold text-[#405174]">{a.airline || "Unknown"}</span>
                        <span className="h-2 rounded bg-[#e5edf6]"><span className="block h-2 rounded bg-[#1688f9]" style={{ width: `${Math.max(2, a.share)}%` }} /></span>
                        <span className="text-right text-[#596782]">{a.count} · {a.share}%</span>
                      </div>
                    ))}
                    {!airlines.length ? <p className="py-4 text-center text-sm text-[#596782]">No airline data yet.</p> : null}
                  </div>
                </Card>
                <Card title="Airline Revenue">
                  <div className="divide-y divide-[#e5edf6]">
                    {airlines.map((a) => (
                      <div key={a.airline ?? "Unknown"} className="flex items-center justify-between py-2 text-sm"><span className="font-semibold text-[#405174]">{a.airline || "Unknown"}</span><b>{formatCurrency(a.revenue, revenueRep.data?.currency)}</b></div>
                    ))}
                    {!airlines.length ? <p className="py-4 text-center text-sm text-[#596782]">No airline data yet.</p> : null}
                  </div>
                </Card>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {routesOpen ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-extrabold">All Routes</h3><button onClick={() => setRoutesOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6e1ef]"><X className="h-4 w-4" /></button></div>
            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {routes.map((r) => <StatusBar key={r.route} label={r.route} count={r.count} total={maxRoute} />)}
              {!routes.length ? <p className="py-4 text-center text-sm text-[#596782]">No route data yet.</p> : null}
            </div>
            <div className="mt-5 flex justify-end"><button onClick={() => setRoutesOpen(false)} className="h-11 rounded-lg bg-[#1688f9] px-6 font-bold text-white">Close</button></div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-xl border border-[#dce7f4] bg-white p-4"><h2 className="mb-3 text-lg font-extrabold">{title}{action ? <span className="float-right">{action}</span> : null}</h2>{children}</section>;
}

function LineChart({ values, max, labels }: { values: number[]; max: number; labels: TrendPoint[] }) {
  return (
    <div>
      <div className="relative h-40 border-l border-b border-[#dce7f4] bg-gradient-to-t from-blue-50 to-white">
        <svg className="h-full w-full" viewBox="0 0 400 150" preserveAspectRatio="none">
          <polyline fill="none" stroke="#1688f9" strokeWidth="3" points={values.map((v, i) => `${i * Math.min(21, 400 / Math.max(1, values.length))},${140 - (v / max) * 130}`).join(" ")} />
          {values.map((v, i) => <circle key={i} cx={i * Math.min(21, 400 / Math.max(1, values.length))} cy={140 - (v / max) * 130} r="3" fill="white" stroke="#1688f9" strokeWidth="2" />)}
        </svg>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-[#596782]"><span>{labels[0]?.date ?? ""}</span><span>{labels[labels.length - 1]?.date ?? ""}</span></div>
    </div>
  );
}

function RevenueChart({ byMonth, max, currency, tall }: { byMonth: MonthBucket[]; max: number; currency?: string | null; tall?: boolean }) {
  return (
    <div>
      <div className={`flex items-end gap-2 border-l border-b border-[#dce7f4] px-4 ${tall ? "h-64" : "h-36"}`}>
        {byMonth.map((b) => (
          <div key={b.month} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${b.month}: ${formatCurrency(b.revenue, currency ?? undefined)} · ${b.count} booking${b.count === 1 ? "" : "s"}`}>
            <span className="text-[10px] font-bold text-[#405174] opacity-0 transition group-hover:opacity-100">{formatCurrency(b.revenue, currency ?? undefined)}</span>
            <span className="w-full rounded-t bg-green-400" style={{ height: `${Math.max(2, Math.round((b.revenue / max) * 100))}%` }} />
          </div>
        ))}
        {!byMonth.length ? <p className="w-full py-10 text-center text-sm text-[#596782]">No revenue data.</p> : null}
      </div>
      <div className="mt-1 flex justify-between px-4 text-[11px] text-[#596782]"><span>{byMonth[0]?.month ?? ""}</span><span>{byMonth[byMonth.length - 1]?.month ?? ""}</span></div>
    </div>
  );
}

function CustomerGrowth({ points }: { points: { month: string; count: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div>
      <div className="flex h-40 items-end gap-3 border-l border-b border-[#dce7f4] px-4">
        {points.map((p) => (
          <div key={p.month} className="flex flex-1 flex-col items-center gap-1">
            <span className="w-full rounded-t bg-purple-400" style={{ height: `${Math.max(2, Math.round((p.count / max) * 100))}px` }} />
          </div>
        ))}
        {!points.length ? <p className="w-full py-10 text-center text-sm text-[#596782]">No growth data yet.</p> : null}
      </div>
      <div className="mt-1 flex justify-between px-4 text-[11px] text-[#596782]"><span>{points[0]?.month ?? ""}</span><span>{points[points.length - 1]?.month ?? ""}</span></div>
    </div>
  );
}

function StatusBar({ label, count, total, color }: { label: string; count: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="grid grid-cols-[110px_1fr_60px] items-center gap-3 text-sm">
      <span className="truncate text-[#405174]">{label}</span>
      <span className="h-2 rounded bg-[#e5edf6]"><span className="block h-2 rounded" style={{ width: `${Math.max(2, pct)}%`, background: color ?? "#1688f9" }} /></span>
      <span className="text-right text-[#596782]">{count} · {pct}%</span>
    </div>
  );
}

function ExpenseMonthly({ byMonth, max, currency }: { byMonth: { month: string; total: number; count: number }[]; max: number; currency?: string }) {
  return (
    <div>
      <div className="flex h-40 items-end gap-2 border-l border-b border-[#dce7f4] px-4">
        {byMonth.map((b) => (
          <div key={b.month} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${b.month}: ${formatCurrency(b.total, currency)} · ${b.count} entry${b.count === 1 ? "" : "s"}`}>
            <span className="text-[10px] font-bold text-[#405174] opacity-0 transition group-hover:opacity-100">{formatCurrency(b.total, currency)}</span>
            <span className="w-full rounded-t bg-orange-400" style={{ height: `${Math.max(2, Math.round((b.total / max) * 100))}%` }} />
          </div>
        ))}
        {!byMonth.length ? <p className="w-full py-10 text-center text-sm text-[#596782]">No expense data.</p> : null}
      </div>
      <div className="mt-1 flex justify-between px-4 text-[11px] text-[#596782]"><span>{byMonth[0]?.month ?? ""}</span><span>{byMonth[byMonth.length - 1]?.month ?? ""}</span></div>
    </div>
  );
}

function InvoiceMonthly({ byMonth, max, currency }: { byMonth: { month: string; billed: number; collected: number; count: number }[]; max: number; currency?: string }) {
  return (
    <div>
      <div className="flex h-40 items-end gap-3 border-l border-b border-[#dce7f4] px-4">
        {byMonth.map((b) => (
          <div key={b.month} className="group flex h-full flex-1 items-end justify-center gap-1" title={`${b.month}: billed ${formatCurrency(b.billed, currency)} · collected ${formatCurrency(b.collected, currency)} · ${b.count} invoice${b.count === 1 ? "" : "s"}`}>
            <span className="w-1/2 max-w-[14px] rounded-t bg-[#1688f9]" style={{ height: `${b.billed > 0 ? Math.max(3, (b.billed / max) * 100) : 0}%` }} />
            <span className="w-1/2 max-w-[14px] rounded-t bg-[#059669]" style={{ height: `${b.collected > 0 ? Math.max(3, (b.collected / max) * 100) : 0}%` }} />
          </div>
        ))}
        {!byMonth.length ? <p className="w-full py-10 text-center text-sm text-[#596782]">No invoice data.</p> : null}
      </div>
      <div className="mt-1 flex justify-between px-4 text-[11px] text-[#596782]"><span>{byMonth[0]?.month ?? ""}</span><span>{byMonth[byMonth.length - 1]?.month ?? ""}</span></div>
      <div className="mt-2 flex items-center justify-end gap-4 px-4 text-xs text-[#596782]">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#1688f9]" />Billed</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#059669]" />Collected</span>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return <div className="rounded-xl border border-[#dce7f4] bg-white p-4"><p className="text-sm font-semibold text-[#596782]">{label}</p><p className={`mt-1 text-2xl font-extrabold ${color}`}>{value}</p></div>;
}

function ExpenseBreakdown({ stats, currency }: { stats?: OverviewStats["stats"]; currency?: string }) {
  if (!stats) return <p className="py-6 text-center text-sm text-[#596782]">Loading accounting data...</p>;
  const rows = [
    { label: "Revenue", value: stats.revenue, color: "#1688f9" },
    { label: "Direct Cost", value: stats.directCost, color: "#fb8500" },
    { label: "Operating Cost", value: stats.operatingCost, color: "#8a97ad" },
    { label: "Gross Profit", value: stats.grossProfit, color: "#19b96b" },
    { label: "Net Profit", value: stats.netProfit, color: stats.netProfit < 0 ? "#ef2b59" : "#7f2cff" },
  ];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  const margin = stats.revenue > 0 ? Math.round((stats.netProfit / stats.revenue) * 100) : 0;
  return (
    <div>
      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[92px_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate text-[#405174]">{row.label}</span>
            <span className="h-2.5 rounded bg-[#e5edf6]"><span className="block h-2.5 rounded" style={{ width: `${Math.max(2, Math.round((Math.abs(row.value) / max) * 100))}%`, background: row.color }} /></span>
            <b className="w-full text-right">{formatCurrency(row.value, currency ?? undefined)}</b>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-[#e5edf6] pt-3 text-sm text-[#596782]">Net margin <b className={stats.netProfit < 0 ? "text-rose-600" : "text-green-600"}>{margin}%</b> on all-time revenue</p>
    </div>
  );
}

function Bar({ segment, pct }: { segment: string; pct: number }) {
  return <div className="h-36 w-14 overflow-hidden rounded-lg bg-[#f4f7fb]" style={{ height: `${Math.max(4, pct * 1.4)}px` }}><div className={`h-full w-full ${segment}`} /></div>;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-2 text-[#405174]"><span className={`h-3 w-3 rounded-full ${color}`} />{label}</span>;
}

function Legend({ rows }: { rows: Array<[string, number, string]> }) {
  return <div className="mt-3 space-y-3">{rows.map(([label, pct, color]) => <p key={label} className="flex items-center gap-3 text-sm"><span className="h-3 w-3 rounded-full" style={{ background: color }} /><span className="flex-1 text-[#405174]">{label}</span><b>{pct}%</b></p>)}</div>;
}

function DonutLegacy({ bg, center }: { bg: string; center: string }) {
  return <div className="relative mx-auto h-40 w-40 rounded-full" style={{ background: bg }}><div className="absolute inset-8 grid place-items-center rounded-full bg-white text-center font-bold whitespace-pre-line">{center}</div></div>;
}

function buildDonut(sources: { source: string; count: number }[], total: number): string {
  if (!sources.length || total === 0) return "conic-gradient(#e2e8f0 0 100%)";
  let acc = 0;
  const segs = sources.map((s) => {
    const start = acc;
    acc += (s.count / total) * 100;
    return `${SOURCE_COLORS[s.source] ?? "#94a3b8"} ${start}% ${acc}%`;
  });
  return `conic-gradient(${segs.join(",")})`;
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const escape = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = "\uFEFF" + rows.map((r) => r.map(escape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}