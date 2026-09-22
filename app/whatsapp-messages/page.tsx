"use client";

import Link from "next/link";
import { AppShell } from "@/components/dashboard/app-shell";
import { Pagination, StatCard, WhatsAppBadge, initialsOf } from "@/components/dashboard/ui";
import { useApi } from "@/lib/hooks";
import { api, formatDate, statusTone } from "@/lib/api";
import { AlertTriangle, CalendarCheck, Clock3, Download, Eye, MessageCircle, MoreHorizontal, Search, Send, User as UserIcon, X } from "lucide-react";
import { useEffect, useState } from "react";

interface MessageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface MessageItem {
  id: string;
  name: string;
  messageType: string;
  messageTypeLabel: string;
  status: string;
  scheduledAt: string;
  sentAt: string | null;
  customer: { id: string; name: string; phone: string } | null;
  booking: { id: string; pnr: string; flightNumber: string; airline: string } | null;
}

interface MessageList {
  items: MessageItem[];
  stats: { total: number; delivered: number; read: number; sent: number; pending: number; failed: number; cancelled: number };
  meta: MessageMeta;
}

interface LogItem {
  id: string;
  status: string;
  createdAt: string;
  content: string | null;
  errorMessage: string | null;
  errorCode: string | null;
}

interface MessageDetail {
  id: string;
  name: string;
  messageType: string;
  status: string;
  scheduledAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  attempts: number;
  lastError: string | null;
  renderedContent: string | null;
  waMessageId: string | null;
  customer: { id: string; name: string; phone: string; email: string | null } | null;
  booking: {
    id: string;
    pnr: string;
    flightNumber: string | null;
    airline: string | null;
    fromCity: string | null;
    fromAirport: string | null;
    toCity: string | null;
    toAirport: string | null;
    departureDate: string;
    departureTime: string | null;
    customer: { id: string; name: string; phone: string } | null;
  } | null;
  template: { id: string; name: string } | null;
  logs: LogItem[];
}

interface CustomerPick {
  id: string;
  name: string;
  phone: string;
}

interface CustomerPickList {
  items: CustomerPick[];
}

export default function WhatsAppMessagesPage() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [menuRow, setMenuRow] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const params = new URLSearchParams();
  if (query) params.set("search", query);
  if (type) params.set("type", type);
  if (status) params.set("status", status);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  params.set("page", String(page));
  params.set("limit", "10");

  const list = useApi<MessageList>(`/messages?${params.toString()}`);
  const panel = useApi<MessageDetail>(selectedId ? `/messages/${selectedId}` : null);

  const stats = list.data?.stats;
  const total = stats?.total ?? 0;
  const rate = (n: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : "0%");

  const statCards = [
    { title: "Total Messages", value: stats ? String(stats.total) : "—", icon: MessageCircle, tone: "green", delta: "", sub: "all messages" },
    { title: "Delivered", value: stats ? String(stats.delivered) : "—", icon: CalendarCheck, tone: "emerald", delta: rate(stats?.delivered ?? 0), sub: "delivery rate" },
    { title: "Read", value: stats ? String(stats.read) : "—", icon: CalendarCheck, tone: "blue", delta: rate(stats?.read ?? 0), sub: "read rate" },
    { title: "Pending", value: stats ? String(stats.pending) : "—", icon: Clock3, tone: "orange", delta: rate(stats?.pending ?? 0), sub: "pending" },
    { title: "Failed", value: stats ? String(stats.failed) : "—", icon: AlertTriangle, tone: "rose", delta: rate(stats?.failed ?? 0), sub: "failed rate", negative: true },
  ];

  const rows = (list.data?.items ?? []).map((m) => ({
    id: m.id,
    customer: m.customer?.name ?? "—",
    customerId: m.customer?.id,
    phone: m.customer?.phone ?? "—",
    initials: m.customer?.name ? initialsOf(m.customer.name) : "—",
    type: m.messageTypeLabel || m.messageType,
    pnr: m.booking?.pnr ?? "—",
    flight: m.booking?.flightNumber ?? "",
    sent: m.sentAt ? formatDate(m.sentAt, true).split(", ").join("\n") : "—",
    status: m.status,
    retryable: m.status === "FAILED" || m.status === "CANCELLED",
  }));

  async function handleRetry(id: string) {
    setActionError("");
    try {
      await api(`/messages/${id}/retry`, { method: "POST" });
      setMenuRow(null);
      list.refetch();
      setNotice("Message requeued for delivery.");
    } catch (err) {
      setMenuRow(null);
      setActionError(err instanceof Error ? err.message : "Unable to retry message");
    } finally {
      if (selectedId === id) panel.refetch();
    }
  }

  async function handleExport() {
    setActionError("");
    try {
      const exportParams = new URLSearchParams();
      if (query) exportParams.set("search", query);
      if (type) exportParams.set("type", type);
      if (status) exportParams.set("status", status);
      if (from) exportParams.set("from", from);
      if (to) exportParams.set("to", to);
      exportParams.set("page", "1");
      exportParams.set("limit", "1000");
      const { items } = await api<MessageList>(`/messages?${exportParams.toString()}`);
      const header = ["Customer", "Phone", "Message Type", "PNR", "Flight", "Scheduled At", "Sent At", "Status"];
      const quote = (value: string) => `"${String(value ?? "").replace(/"/g, '""')}"`;
      const lines = items.map((m) => [m.customer?.name ?? "", m.customer?.phone ?? "", m.messageTypeLabel || m.messageType, m.booking?.pnr ?? "", m.booking?.flightNumber ?? "", formatDate(m.scheduledAt, true), m.sentAt ? formatDate(m.sentAt, true) : "", m.status].map(quote).join(","));
      const csv = "\uFEFF" + [header.join(","), ...lines].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `messages-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice(`Exported ${items.length} messages.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to export messages");
    }
  }

  async function handleSend(customerId: string, bookingId: string | undefined, text: string) {
    setActionError("");
    try {
      const result = await api<{ id: string }>("/messages", { method: "POST", body: { customerId, text, bookingId } });
      list.refetch();
      setSelectedId(result.id);
      setNotice("Manual message sent.");
      return result.id;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to send message");
      return null;
    }
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex flex-col justify-between gap-4 pt-2 sm:flex-row sm:items-start">
          <div><h1 className="text-[34px] font-extrabold tracking-[-0.04em]">WhatsApp Messages</h1><p className="text-base text-[#596782]">View all sent messages, delivery status and customer conversations.</p></div>
          <div className="flex gap-3"><button onClick={handleExport} className="flex h-[52px] items-center gap-3 rounded-lg border border-[#d6e1ef] bg-white px-7 font-semibold"><Download className="h-5 w-5" />Export</button><button onClick={() => setComposeOpen(true)} className="flex h-[52px] items-center gap-3 rounded-lg bg-[#1688f9] px-7 font-bold text-white"><Send className="h-5 w-5" />Send Manual Message</button></div>
        </div>
        {list.error ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{list.error}</p> : null}
        {actionError ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{actionError}</p> : null}
        {notice ? <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{statCards.map((stat) => <StatCard key={stat.title} {...stat} />)}</div>
        <div className="grid gap-4 xl:grid-cols-[1fr_342px]">
          <section className="overflow-hidden rounded-xl border border-[#dce7f4] bg-white shadow-sm">
            <div className="grid gap-3 p-3 md:grid-cols-[1.3fr_.55fr_.55fr_.5fr_.5fr_.35fr]">
              <div className="flex h-11 items-center gap-3 rounded-lg border border-[#d6e1ef] bg-white px-3"><Search className="h-5 w-5 text-[#405174]" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search by name, PNR or message..." /></div>
              <select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} className="h-11 rounded-lg border border-[#d6e1ef] bg-white px-4 text-sm"><option value="">All Types</option><option value="BOOKING_CONFIRMATION">Booking Confirmation</option><option value="REMINDER_48H">48h Reminder</option><option value="REMINDER_24H">24h Reminder</option><option value="JOURNEY_DAY">Journey Day Reminder</option><option value="BOOKING_CANCELLATION">Booking Cancellation</option><option value="CUSTOM">Custom Message</option></select>
              <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-11 rounded-lg border border-[#d6e1ef] bg-white px-4 text-sm"><option value="">All Status</option><option value="SCHEDULED">Scheduled</option><option value="PROCESSING">Processing</option><option value="SENT">Sent</option><option value="DELIVERED">Delivered</option><option value="READ">Read</option><option value="FAILED">Failed</option><option value="CANCELLED">Cancelled</option></select>
              <input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} className="h-11 rounded-lg border border-[#d6e1ef] bg-white px-3 text-sm" title="From date" />
              <input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} className="h-11 rounded-lg border border-[#d6e1ef] bg-white px-3 text-sm" title="To date" />
              <button onClick={() => { setSearch(""); setQuery(""); setType(""); setStatus(""); setFrom(""); setTo(""); setPage(1); }} className="h-11 rounded-lg border border-[#d6e1ef] font-semibold">Reset</button>
            </div>
            <div className="overflow-x-auto"><table className="w-full min-w-[830px] text-left text-sm"><thead className="bg-[#f4f7fb]"><tr><th>Customer</th><th>Message Type</th><th>Reference</th><th>Sent At</th><th>Status</th><th>Actions</th></tr></thead><tbody className="divide-y divide-[#e5edf6]">
              {list.loading && rows.length === 0 ? <tr><td colSpan={7} className="px-5 py-8 text-center text-[#596782]">Loading messages...</td></tr> : null}
              {!list.loading && rows.length === 0 ? <tr><td colSpan={7} className="px-5 py-8 text-center text-[#596782]">No messages found.</td></tr> : null}
              {rows.map((m, i) => <tr key={m.id} onClick={() => setSelectedId(m.id)} className={`cursor-pointer ${selectedId === m.id ? "bg-blue-50/60" : "hover:bg-blue-50/30"}`}><td><div className="flex items-center gap-3"><span className={`grid h-9 w-9 place-items-center rounded-full font-bold text-blue-700 ${i % 2 ? "bg-purple-100" : "bg-blue-100"}`}>{m.initials}</span><div><b>{m.customer}</b><div className="text-[#526282]">{m.phone}</div></div></div></td><td><div className="flex items-center gap-2"><Send className="h-4 w-4 text-[#087df0]" />{m.type}</div></td><td><div>PNR: {m.pnr}</div><div>{m.flight}</div></td><td className="whitespace-pre-line">{m.sent}</td><td><WhatsAppBadge value={m.status} /></td><td onClick={(e) => e.stopPropagation()}><div className="flex gap-3"><button onClick={() => setSelectedId(m.id)} className="grid h-10 w-10 place-items-center rounded-lg border border-[#d4dfed]"><Eye className="h-4 w-4" /></button><div className="relative"><button onClick={() => setMenuRow(menuRow === m.id ? null : m.id)} className="grid h-10 w-10 place-items-center rounded-lg border border-[#d4dfed]"><MoreHorizontal className="h-4 w-4" /></button>{menuRow === m.id ? <><div className="fixed inset-0 z-10" onClick={() => setMenuRow(null)} /><div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-[#d6e1ef] bg-white py-1 shadow-lg"><button onClick={() => { setMenuRow(null); setSelectedId(m.id); }} className="block w-full px-3 py-2 text-left text-sm font-medium hover:bg-blue-50">View details</button>{m.retryable ? <button onClick={() => handleRetry(m.id)} className="block w-full px-3 py-2 text-left text-sm font-medium text-amber-600 hover:bg-amber-50">Retry delivery</button> : null}</div></> : null}</div></div></td></tr>)}
            </tbody></table></div>
            <Pagination total={list.data?.meta.total} page={list.data?.meta.page ?? 1} limit={10} onPageChange={(p) => setPage(p)} />
          </section>

          <aside className="flex flex-col overflow-hidden rounded-xl border border-[#dce7f4] bg-white shadow-sm">
            {!selectedId ? <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-[#596782]"><span className="grid h-14 w-14 place-items-center rounded-full bg-blue-50"><MessageCircle className="h-6 w-6 text-[#1688f9]" /></span>Select a message to see the conversation and delivery timeline here.</div>
            : panel.loading && !panel.data ? <div className="flex flex-1 items-center justify-center p-8 text-center text-[#596782]">Loading message...</div>
            : panel.error && !panel.data ? <div className="flex flex-1 items-center justify-center p-8 text-center text-[#596782]">{panel.error}</div>
            : panel.data ? <MessagePanel data={panel.data} onSend={handleSend} onClose={() => setSelectedId(null)} /> : null}
          </aside>
        </div>
      </div>

      {composeOpen ? <SendComposeModal onClose={() => setComposeOpen(false)} onSent={(id) => { setComposeOpen(false); setSelectedId(id); list.refetch(); setNotice("Manual message sent."); }} /> : null}
    </AppShell>
  );
}

function MessagePanel({ data, onSend, onClose }: { data: MessageDetail; onSend: (customerId: string, bookingId: string | undefined, text: string) => Promise<string | null>; onClose: () => void }) {
  const [tab, setTab] = useState<"conversation" | "timeline">("conversation");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const customer = data.customer;
  const booking = data.booking;
  const route = `${(booking?.fromAirport || booking?.fromCity || "—")} → ${(booking?.toAirport || booking?.toCity || "—")}`;

  async function submit() {
    if (!text.trim() || sending || !customer) return;
    setSending(true);
    const ok = await onSend(customer.id, booking?.id ?? undefined, text.trim());
    setSending(false);
    if (ok) setText("");
  }

  return <div className="flex h-full min-h-[540px] flex-col">
    <div className="flex items-center justify-between p-5 pb-3"><h2 className="text-lg font-extrabold">Message Details</h2><button onClick={onClose} aria-label="Close"><X className="h-5 w-5 text-[#526282]" /></button></div>
    <div className="border-b border-[#e5edf6] px-5 pb-4">
      <div className="flex items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-blue-100 text-lg font-bold text-blue-700">{customer?.name ? initialsOf(customer.name) : "—"}</span>
        <div className="flex-1"><b>{customer?.name ?? "—"}</b><div className="text-sm text-[#596782]">+91 {customer?.phone ?? ""}</div></div>
        {customer ? <Link href={`/customers/${customer.id}`} className="rounded-lg border border-[#d6e1ef] px-4 py-2 text-sm font-bold text-[#087df0]">View Customer</Link> : null}
      </div>
      {booking ? <p className="mt-4 text-sm leading-6">PNR: {booking.pnr} &nbsp;|&nbsp; Flight: {booking.flightNumber || "—"}<br />{route}<br />{booking.departureDate ? formatDate(booking.departureDate) : "—"}{booking.departureTime ? `, ${booking.departureTime}` : ""}</p> : <p className="mt-4 text-sm text-[#596782]">No booking attached.</p>}
      <div className="mt-3 flex items-center gap-2"><WhatsAppBadge value={data.status} /><span className="text-xs text-[#596782]">{data.attempts > 0 ? `${data.attempts} attempt${data.attempts > 1 ? "s" : ""}` : ""}</span></div>
    </div>
    <div className="flex border-b border-[#d6e1ef] px-5">
      <button onClick={() => setTab("conversation")} className={`px-3 py-3 font-bold ${tab === "conversation" ? "border-b-2 border-[#1688f9] text-[#087df0]" : "text-[#596782]"}`}>Conversation</button>
      <button onClick={() => setTab("timeline")} className={`px-3 py-3 font-bold ${tab === "timeline" ? "border-b-2 border-[#1688f9] text-[#087df0]" : "text-[#596782]"}`}>Message Timeline</button>
    </div>
    <div className="flex-1 overflow-y-auto bg-[#f8fbff] p-5">
      {tab === "conversation" ? (
        <div>
          {data.renderedContent ? <div className="mx-auto rounded-xl bg-[#d9ffd0] p-5 shadow-sm"><p className="whitespace-pre-line">{data.renderedContent}</p><div className="mt-2 text-right text-sm text-[#596782]">{data.sentAt ? formatDate(data.sentAt, true) : formatDate(data.scheduledAt, true)} {statusTone(data.status) === "danger" ? "✕" : statusTone(data.status) === "pending" ? "⏱" : "✓✓"}</div></div> : <p className="py-8 text-center text-sm text-[#596782]">No message content rendered.</p>}
          {(data.deliveredAt || data.readAt || data.failedAt) ? <div className="mt-5 space-y-3 text-sm">{data.deliveredAt ? <p>✅ Delivered to +91 {customer?.phone ?? ""}<br /><span className="text-[#596782]">{formatDate(data.deliveredAt, true)}</span></p> : null}{data.readAt ? <p>☑️ Read by +91 {customer?.phone ?? ""}<br /><span className="text-[#596782]">{formatDate(data.readAt, true)}</span></p> : null}{data.failedAt ? <p className="text-rose-600">✕ Delivery failed<br /><span className="text-[#596782]">{formatDate(data.failedAt, true)}{data.lastError ? ` · ${data.lastError}` : ""}</span></p> : null}</div> : null}
        </div>
      ) : (
        <div>
          <TimelineStep time={formatDate(data.scheduledAt, true)} title="Scheduled" active />
          {data.sentAt ? <TimelineStep time={formatDate(data.sentAt, true)} title={statusTone(data.status) === "danger" ? "Sent (then failed)" : "Sent"} active /> : null}
          {data.deliveredAt ? <TimelineStep time={formatDate(data.deliveredAt, true)} title="Delivered" active /> : null}
          {data.readAt ? <TimelineStep time={formatDate(data.readAt, true)} title="Read" active /> : null}
          {data.failedAt ? <TimelineStep time={formatDate(data.failedAt, true)} title={data.lastError ? `Failed — ${data.lastError}` : "Failed"} danger /> : null}
          {data.logs.length > 0 ? <div className="mt-4 border-t border-[#d6e1ef] pt-3"><p className="mb-2 text-xs font-bold uppercase text-[#8a97ad]">Logs ({data.logs.length})</p>{data.logs.slice(0, 12).map((l) => <p key={l.id} className="flex justify-between gap-2 border-b border-[#e5edf6] py-2 text-xs"><span>{l.status}{l.errorMessage ? <span className="block text-rose-600">{l.errorMessage}</span> : null}</span><span className="text-[#596782]">{formatDate(l.createdAt, true)}</span></p>)}</div> : null}
        </div>
      )}
    </div>
    <div className="flex items-center gap-2 border-t border-[#d6e1ef] p-3">
      <div className="flex h-10 flex-1 items-center rounded-lg border border-[#d6e1ef] px-3"><input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} className="min-w-0 flex-1 outline-none" placeholder="Type a message..." /></div>
      <button onClick={submit} disabled={sending || !text.trim()} className="grid h-10 w-10 place-items-center rounded-lg bg-[#1688f9] text-white disabled:opacity-50"><Send className="h-5 w-5" /></button>
    </div>
  </div>;
}

function TimelineStep({ time, title, active, danger }: { time: string; title: string; active?: boolean; danger?: boolean }) {
  return <div className="flex gap-3 py-2"><span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${danger ? "bg-rose-500" : active ? "bg-[#1688f9]" : "bg-[#b8c4d8]"}`} /><div className="flex flex-1 justify-between gap-2 text-sm"><b className={danger ? "text-rose-600" : ""}>{title}</b><span className="text-[#596782]">{time}</span></div></div>;
}

function SendComposeModal({ onClose, onSent }: { onClose: () => void; onSent: (newId: string) => void }) {
  const customers = useApi<CustomerPickList>("/customers?limit=200");
  const [customerId, setCustomerId] = useState("");
  const [text, setText] = useState("");
  const [mError, setMError] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    setMError("");
    if (!customerId) { setMError("Select a customer."); return; }
    if (!text.trim()) { setMError("Message cannot be empty."); return; }
    setSending(true);
    try {
      const result = await api<{ id: string }>("/messages", { method: "POST", body: { customerId, text: text.trim() } });
      onSent(result.id);
    } catch (err) {
      setMError(err instanceof Error ? err.message : "Unable to send message");
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-extrabold">Send Manual Message</h2><button onClick={onClose} aria-label="Close"><X className="h-5 w-5 text-[#596782]" /></button></div>
        <div className="space-y-4">
          <label className="block"><span className="mb-2 block text-sm font-semibold">Customer <span className="text-red-500">*</span></span>
            <div className="flex h-11 items-center gap-2 rounded-md border border-[#cfdbea] px-3"><UserIcon className="h-5 w-5 text-[#596782]" /><select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="h-11 w-full bg-transparent text-sm outline-none"><option value="">Select customer...</option>{(customers.data?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</select></div>
          </label>
          <label className="block"><span className="mb-2 block text-sm font-semibold">Message <span className="text-red-500">*</span></span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Type the message to send on customer's WhatsApp..." className="w-full rounded-md border border-[#cfdbea] px-3 py-2 text-sm outline-none focus:border-[#1688f9]" />
          </label>
          <p className="text-xs text-[#596782]">Message is sent immediately via the WhatsApp queue and attached to the customer's latest booking.</p>
          {mError ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{mError}</p> : null}
          <div className="flex justify-end gap-3 pt-2"><button onClick={onClose} className="rounded-lg border border-[#d6e1ef] bg-white px-6 py-2.5 font-semibold">Cancel</button><button onClick={submit} disabled={sending} className="flex items-center gap-2 rounded-lg bg-[#1688f9] px-6 py-2.5 font-bold text-white disabled:opacity-60">{sending ? "Sending..." : <>Send <Send className="h-4 w-4" /></>}</button></div>
        </div>
      </div>
    </div>
  );
}