"use client";

import { AppShell } from "@/components/dashboard/app-shell";
import { BookingsTable, SectionCard, StatCard } from "@/components/dashboard/ui";
import { useApi } from "@/lib/hooks";
import { formatDate, getStoredUser } from "@/lib/api";
import { Bell, CalendarCheck, CheckCircle2, MessageCircle, Plane, Users, AlertTriangle, ChevronDown } from "lucide-react";
import type { ApiBookingRow } from "@/components/dashboard/ui";
import { useEffect, useState } from "react";

interface Overview {
  stats: {
    totalBookings: number;
    todayJourneys: number;
    upcomingJourneys: number;
    messagesSent: number;
    pendingMessages: number;
    failedMessages: number;
  };
  messageStatus: { total: number; sent: number; delivered: number; pending: number; failed: number; read: number };
  bookingTrend: Array<{ date: string; count: number }>;
  reminders: Array<{ id: string; scheduledAt: string; type: string; status: string; customer: { id: string; name: string; phone: string }; pnr: string }>;
  activities: Array<{ id: string; action: string; entity: string; message: string; createdAt: string }>;
}

export default function DashboardPage() {
  const [days, setDays] = useState(7);
  const overview = useApi<Overview>(days ? `/reports/overview?days=${days}` : "/reports/overview");
  const todays = useApi<{ items: ApiBookingRow[] }>("/bookings?period=today&limit=8&sort=departureDate&order=asc");

  useEffect(() => {
    const timer = window.setInterval(() => {
      overview.refetch();
      todays.refetch();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [overview.refetch, todays.refetch]);

  const user = getStoredUser();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  const firstName = user?.name?.split(" ")[0] ?? "Guest";

  const stats = overview.data?.stats;
  const message = overview.data?.messageStatus;
  const trend = overview.data?.bookingTrend ?? [];

  const maxCount = trend.reduce((max, b) => Math.max(max, b.count), 1);
  const barMax = 124;

  return (
    <AppShell>
      <div className="space-y-4">
        <section className="relative overflow-hidden rounded-xl bg-gradient-to-r from-[#0e7ae4] via-[#1d8af3] to-[#4aa6ff] px-7 py-9 text-white shadow-sm md:px-9">
          <div className="absolute inset-0 bg-white/10" />
          <div className="relative z-10">
            <p className="text-2xl font-light">{greeting},</p>
            <h1 className="mt-1 text-[42px] font-extrabold leading-tight tracking-[-0.04em]">{firstName} 👋</h1>
            <p className="mt-2 text-base text-white/90">Here&apos;s what&apos;s happening with your travel automation today.</p>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard title="Total Bookings" value={String(stats?.totalBookings ?? 0)} icon={Plane} tone="blue" sub="all bookings" href="/bookings" />
          <StatCard title="Today's Journeys" value={String(stats?.todayJourneys ?? 0)} icon={CalendarCheck} tone="green" sub="departing today" href="/bookings?period=today" />
          <StatCard title="Upcoming Journeys" value={String(stats?.upcomingJourneys ?? 0)} icon={Users} tone="purple" sub="total upcoming" href="/upcoming-journeys" />
          <StatCard title="Messages Sent" value={String(message?.total ?? 0)} icon={MessageCircle} tone="emerald" sub="all time" href="/whatsapp-messages" />
          <StatCard title="Pending Messages" value={String(stats?.pendingMessages ?? 0)} icon={CalendarCheck} tone="orange" sub="awaiting delivery" href="/whatsapp-messages" />
          <StatCard title="Failed Messages" value={String(stats?.failedMessages ?? 0)} icon={AlertTriangle} tone="rose" sub="needs attention" href="/whatsapp-messages" />
        </div>

        <div className="grid gap-3 xl:grid-cols-[1.58fr_1fr]">
          <SectionCard title="Today's Journeys" action={<a className="text-sm font-bold text-[#087df0]" href="/bookings">View All →</a>}>
            <BookingsTable compact rows={todays.data?.items ?? []} />
          </SectionCard>
          <SectionCard title="Upcoming Reminders" action={<a className="text-sm font-bold text-[#087df0]" href="/whatsapp-messages">View All →</a>}>
            <div className="divide-y divide-[#e5edf6] px-4 pb-3">
              {(overview.data?.reminders ?? []).map((item) => (
                <div key={item.id} className="grid grid-cols-[76px_1fr_34px] items-center gap-3 py-3">
                  <div className="whitespace-pre-line text-sm leading-5 text-[#33415e]">{formatDate(item.scheduledAt, true)}</div>
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-[#e5e2ff] text-[#7d79a9]"><Users className="h-5 w-5" /></span>
                    <div><div className="font-bold">{item.customer.name}</div><div className="text-sm text-[#596782]">{item.type} · PNR: {item.pnr}</div></div>
                  </div>
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#e5fbf0] text-[#00ad55]"><MessageCircle className="h-5 w-5" /></span>
                </div>
              ))}
              {(overview.data?.reminders ?? []).length === 0 ? <p className="px-2 py-6 text-center text-sm text-[#596782]">No upcoming reminders.</p> : null}
            </div>
          </SectionCard>
        </div>

        <div className="grid gap-3 xl:grid-cols-[1.07fr_.82fr_.8fr]">
          <SectionCard title="Bookings Overview" subtitle={`Total bookings in the last ${days} days`} action={<label className="flex items-center gap-2 rounded-lg border border-[#d6e1ef] px-3 py-2 text-sm"><select value={days} onChange={(event) => setDays(Number(event.target.value))} className="bg-transparent font-medium outline-none"><option value={7}>Last 7 Days</option><option value={30}>Last 30 Days</option><option value={90}>Last 90 Days</option></select><ChevronDown className="h-4 w-4" /></label>}>
            <div className="flex h-[210px] items-end gap-6 px-7 pb-9 pt-5">
              {trend.length === 0 ? <p className="text-sm text-[#596782]">No booking data.</p> : trend.map((entry) => {
                const height = Math.max(entry.count === 0 ? 4 : Math.round((entry.count / maxCount) * barMax), 4);
                return (
                  <div key={entry.date} className="flex flex-1 flex-col items-center gap-2">
                    <span className="text-sm font-bold">{entry.count}</span>
                    <div className="w-full max-w-[34px] rounded-t-md bg-gradient-to-t from-[#78b9f8] to-[#49a1ff]" style={{ height: `${height}px` }} />
                    <span className="whitespace-nowrap text-xs text-[#596782]">{entry.date}</span>
                  </div>
                );
              })}
            </div>
            {todays.error ? <p className="px-7 pb-3 text-xs text-rose-600">{todays.error}</p> : null}
          </SectionCard>
          <SectionCard title="Message Delivery Status">
            <div className="flex flex-col items-center gap-5 px-5 pb-7 pt-2 sm:flex-row">
              <div className="relative h-44 w-44 rounded-full" style={{ background: "conic-gradient(#41c879 0 80%, #3696f5 80% 94%, #ff9f27 94% 97%, #ff315e 97% 100%)" }}>
                <div className="absolute inset-7 grid place-items-center rounded-full bg-white text-center"><div><div className="text-3xl font-extrabold">{message?.total ?? 0}</div><div className="text-sm text-[#596782]">Total Messages</div></div></div>
              </div>
              <div className="grid gap-4 text-sm">
                {[
                  ["Delivered", `${message?.delivered ?? 0}`, "bg-[#41c879]"],
                  ["Sent", `${message?.sent ?? 0}`, "bg-[#3696f5]"],
                  ["Pending", `${message?.pending ?? 0}`, "bg-[#ff9f27]"],
                  ["Failed", `${message?.failed ?? 0}`, "bg-[#ff315e]"],
                ].map(([label, value, color]) => <div key={label} className="grid grid-cols-[14px_1fr_auto] items-center gap-3"><span className={`h-3.5 w-3.5 rounded-full ${color}`} /><span>{label}</span><b>{value}</b></div>)}
              </div>
            </div>
          </SectionCard>
          <SectionCard title="Recent Activity" action={<a className="text-sm font-bold text-[#087df0]" href="/settings">View All →</a>}>
            <div className="divide-y divide-[#e5edf6] px-4 pb-3">
              {(overview.data?.activities ?? []).map((item) => <ActivityRow key={item.id} action={item.action} title={item.message} time={formatDate(item.createdAt, true)} />)}
              {(overview.data?.activities ?? []).length === 0 ? <p className="px-2 py-6 text-center text-sm text-[#596782]">No recent activity.</p> : null}
            </div>
          </SectionCard>
        </div>
        {overview.error ? <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-center text-sm font-medium text-rose-700">{overview.error}</p> : null}
      </div>
    </AppShell>
  );
}

function ActivityRow({ action, title, time }: { action: string; title: string; time: string }) {
  const type = action === "BOOKING_CREATED" ? "success" : action === "BOOKING_CANCELLED" ? "danger" : action === "CUSTOMER_CREATED" ? "user" : action.includes("MESSAGE") ? "bell" : "info";
  const icon = type === "danger" ? AlertTriangle : type === "user" ? Users : type === "bell" ? Bell : CalendarCheck;
  const Icon = icon;
  const color = type === "danger" ? "bg-rose-100 text-rose-500" : type === "success" ? "bg-green-100 text-green-600" : type === "user" ? "bg-purple-100 text-purple-600" : "bg-blue-100 text-blue-600";
  const fallback = type === "info" ? CheckCircle2 : Icon;
  const FinalIcon = fallback;
  return <div className="grid grid-cols-[34px_1fr_auto] items-center gap-3 py-2.5"><span className={`grid h-8 w-8 place-items-center rounded-full ${color}`}><FinalIcon className="h-4 w-4" /></span><div><div className="text-sm font-semibold">{title}</div></div><span className="text-sm text-[#596782]">{time}</span></div>;
}