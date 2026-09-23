"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, BarChart3, Bell, CalendarCheck, Check, ChevronDown, Clock3, Command, FileText, Home, LogOut, Menu, MessageCircle, Plane, Plus, Search, Settings, Users, Wallet, Workflow, X, type LucideIcon } from "lucide-react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { api, clearSession, formatDate, getAccessToken, getStoredUser, type ApiUser } from "@/lib/api";
import { useApi } from "@/lib/hooks";

const NAV_ITEMS: Array<{ label: string; href: string; icon: LucideIcon }> = [
  { label: "Dashboard", href: "/dashboard", icon: Home },
  { label: "Bookings", href: "/bookings", icon: Plane },
  { label: "Add Booking", href: "/bookings/add", icon: Plus },
  { label: "Upcoming Journeys", href: "/upcoming-journeys", icon: CalendarCheck },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "WhatsApp Messages", href: "/whatsapp-messages", icon: MessageCircle },
  { label: "Automation", href: "/automation", icon: Settings },
  { label: "Message Templates", href: "/message-templates", icon: FileText },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Expenses", href: "/expenses", icon: Wallet },
  { label: "Settings", href: "/settings", icon: Workflow },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [railHover, setRailHover] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [user, setUser] = useState<ApiUser | null>(null);
  const router = useRouter();
  const me = useApi<{ business?: { name?: string | null } }>("/settings");

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/");
      return;
    }
    setUser(getStoredUser());
  }, [router]);

  if (!user) return null;

  const businessName = me.data?.business?.name || user.name;

  return (
    <div className="flyconnect-app min-h-screen bg-[#f4f9ff] text-[#08142e]">
      <Sidebar open={open} onClose={() => setOpen(false)} user={user} onLogout={() => setLogoutOpen(true)} expanded={railHover} onHoverChange={setRailHover} />
      <div className={`min-h-screen transition-[padding] duration-200 ${railHover ? "lg:pl-[237px]" : "lg:pl-[76px]"}`}>
        <Topbar onMenu={() => setOpen(true)} user={user} businessName={businessName} onLogout={() => setLogoutOpen(true)} />
        <main className="px-4 py-4 sm:px-6 lg:px-5 xl:px-8">{children}</main>
      </div>
      <LogoutDialog
        open={logoutOpen}
        onCancel={() => setLogoutOpen(false)}
        onConfirm={() => { clearSession(); router.replace("/"); }}
      />
    </div>
  );
}

function Sidebar({ open, onClose, user, onLogout, expanded, onHoverChange }: { open: boolean; onClose: () => void; user: ApiUser; onLogout: () => void; expanded: boolean; onHoverChange: (value: boolean) => void }) {
  const pathname = usePathname();
  const full = expanded || open;
  const initials = (user.name || user.email || "?")
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      <div className={`fixed inset-0 z-40 bg-slate-950/50 transition lg:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`} onClick={onClose} />
      <aside
        onMouseEnter={() => onHoverChange(true)}
        onMouseLeave={() => onHoverChange(false)}
        className={`fixed inset-y-0 left-0 z-50 flex w-[237px] flex-col overflow-hidden bg-[#071832] text-white shadow-2xl transition-[width,transform] duration-200 lg:translate-x-0 ${expanded ? "lg:w-[237px]" : "lg:w-[76px]"} ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className={`flex h-[88px] items-start ${full ? "justify-between" : "justify-center"} px-[17px] pt-[22px]`}>
          <Link href="/dashboard" className="flex items-center gap-2" onClick={onClose}>
            <Plane className="h-12 w-12 -rotate-45 fill-[#218bf3] stroke-[#218bf3] stroke-[1.5]" />
            {full ? (
              <div>
                <div className="text-[21px] font-extrabold leading-none tracking-[-0.04em]">Fly<span className="text-[#2494ff]">Connect</span></div>
                <div className="mt-2 text-[8px] font-bold uppercase tracking-[0.1em] text-white/75">Travel Smarter, Together</div>
              </div>
            ) : null}
          </Link>
          {full ? <button className="lg:hidden" onClick={onClose} type="button"><X className="h-5 w-5" /></button> : null}
        </div>

        <nav className="mt-2 space-y-[7px] px-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href === "/bookings" && pathname.startsWith("/bookings") && pathname !== "/bookings/add") || (item.href === "/bookings/add" && pathname === "/bookings/add");
            return (
              <Link key={item.href} href={item.href} onClick={onClose} className={`group relative flex h-12 items-center rounded-lg text-[16px] transition ${full ? "gap-4 px-4" : "justify-center px-2"} ${active ? "bg-[#213965] text-white" : "text-[#d8e3f4] hover:bg-white/8 hover:text-white"}`}>
                {active ? <span className="absolute left-0 top-0 h-full w-1 rounded-r bg-[#2a95ff]" /> : null}
                <Icon className={`h-[21px] w-[21px] shrink-0 ${active ? "text-[#58a8ff]" : "text-[#d5e2f8]"}`} />
                {full ? <span className="truncate">{item.label}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className={`mt-auto ${full ? "px-[17px]" : "px-2"} pb-[30px]`}>
          {full ? (
            <div className="mb-[54px] overflow-hidden rounded-lg bg-[url('/assets/sidebar-promo.png')] bg-cover bg-center p-4 shadow-lg">
              <div className="pt-[72px] text-[15px] font-semibold leading-5">Simplify Travel.<br />Automate Communication.</div>
              <div className="my-5 h-[2px] w-9 bg-white" />
              <div className="text-[13px] leading-5 text-white/90">Save time.<br />Deliver better experiences.</div>
            </div>
          ) : null}
          <div className={`flex items-center ${full ? "gap-3" : "justify-center"}`}>
            <div className="grid h-10 w-10 place-items-center rounded-full bg-[#d8c8ff] text-[15px] font-bold text-[#171236]">{initials}</div>
            {full ? (
              <>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">{user.name}</div>
                  <div className="capitalize text-[12px] text-white/65">{user.role?.toLowerCase()}</div>
                </div>
                <button aria-label="Log out" onClick={onLogout} type="button"><LogOut className="h-5 w-5 text-white/80" /></button>
              </>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}

function Topbar({ onMenu, user, businessName, onLogout }: { onMenu: () => void; user: ApiUser; businessName: string; onLogout: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between border-b border-[#d9e4f2] bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-7">
      <div className="flex flex-1 items-center gap-3">
        <button className="rounded-lg border border-slate-200 p-2 lg:hidden" onClick={onMenu} type="button"><Menu className="h-5 w-5" /></button>
        <GlobalSearch />
      </div>
      <div className="ml-3 flex items-center gap-3 sm:gap-5">
        <NotificationsBell />
        <AccountMenu user={user} businessName={businessName} onLogout={onLogout} />
      </div>
    </header>
  );
}

interface SearchBookingResult {
  id: string;
  pnr: string;
  flightNumber: string | null;
  airline: string | null;
  route: string;
  departureDate: string;
  status: string;
  customer: { id: string; name: string; phone: string | null } | null;
}

interface SearchResults {
  query: string;
  customers: Array<{ id: string; name: string; phone: string | null; email: string | null }>;
  bookings: SearchBookingResult[];
}

function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const term = query.trim();
      if (term.length < 2) {
        setResults(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      api<SearchResults>(`/search?q=${encodeURIComponent(term)}`, { auth: true })
        .then((result) => setResults(result))
        .catch(() => setResults(null))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const customerCount = results?.customers.length ?? 0;
  const bookingCount = results?.bookings.length ?? 0;
  const showResults = open && (loading || customerCount > 0 || bookingCount > 0 || !!results);

  return (
    <div className="relative w-full max-w-[628px]">
      <div className={`flex h-[42px] w-full items-center gap-3 rounded-xl border bg-[#f5f8fc] px-3 shadow-sm ${open ? "border-[#1688f9] ring-4 ring-blue-100" : "border-[#dde7f3]"}`}>
        <Search className="h-5 w-5 text-[#526486]" />
        <input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[#75829c]" placeholder="Search by PNR, customer name or mobile number..." />
        <span className="hidden items-center gap-1 text-xs text-[#4f5d78] sm:flex"><Command className="h-3.5 w-3.5" /> K</span>
      </div>
      {open ? <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} /> : null}
      {showResults ? (
        <div className="absolute left-0 right-0 top-[52px] z-30 overflow-hidden rounded-xl border border-[#dce7f4] bg-white shadow-xl">
          {loading ? <div className="px-4 py-3 text-sm text-[#596782]">Searching…</div> : customerCount === 0 && bookingCount === 0 ? (
            <div className="px-4 py-3 text-sm text-[#596782]">No results for “{results?.query}”.</div>
          ) : (
            <>
              {customerCount > 0 ? <div className="p-2">
                <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-[#8a97ad]">Customers</div>
                {results!.customers.map((customer) => <button key={customer.id} onClick={() => { setOpen(false); router.push(`/customers/${customer.id}`); }} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-slate-50">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-100 font-bold text-blue-700"><Users className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{customer.name}</span><span className="block truncate text-[13px] text-[#596782]">{customer.phone ?? customer.email ?? "—"}</span></span>
                </button>)}
              </div> : null}
              {bookingCount > 0 ? <div className="border-t border-[#e5edf6] p-2">
                <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-[#8a97ad]">Bookings</div>
                {results!.bookings.map((booking) => <button key={booking.id} onClick={() => { setOpen(false); router.push(`/bookings?search=${encodeURIComponent(booking.pnr)}`); }} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-slate-50">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-purple-100 text-purple-700"><Plane className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{booking.route}</span><span className="block truncate text-[13px] text-[#596782]">{booking.pnr} · {booking.customer?.name ?? "—"}</span></span>
                </button>)}
              </div> : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface NotificationItem {
  id: string;
  messageTypeLabel: string;
  status: string;
  scheduledAt: string;
  customer: { id: string; name: string; phone: string } | null;
  booking: { id: string; pnr: string; flightNumber: string; airline: string } | null;
}

function NotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const list = useApi<{ items: NotificationItem[]; stats: { pending: number; failed: number } }>("/messages?limit=6&page=1");
  const items = list.data?.items ?? [];
  const badge = (list.data?.stats?.pending ?? 0) + (list.data?.stats?.failed ?? 0);

  return (
    <div className="relative">
      <button className="relative grid h-10 w-10 place-items-center border-r border-[#e4ebf4] pr-2" type="button" aria-label="Notifications" onClick={() => setOpen((value) => !value)}>
        <Bell className="h-5 w-5 fill-[#0d1a36] text-[#0d1a36]" />
        {badge > 0 ? <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-[#f61f55] text-[10px] font-bold text-white">{badge > 9 ? "9+" : badge}</span> : null}
      </button>
      {open ? <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} /> : null}
      {open ? (
        <div className="absolute right-0 top-[54px] z-30 w-[340px] overflow-hidden rounded-xl border border-[#dce7f4] bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#e5edf6] px-4 py-3"><b>Notifications</b><button onClick={() => setOpen(false)} className="text-xs font-bold text-[#087df0]">Close</button></div>
          <div className="max-h-[360px] overflow-y-auto p-2">
            {list.loading ? <div className="px-4 py-3 text-sm text-[#596782]">Loading…</div> : items.length === 0 ? <div className="px-4 py-3 text-sm text-[#596782]">No message activity yet.</div> : items.map((item) => (
              <button key={item.id} onClick={() => { setOpen(false); router.push("/whatsapp-messages"); }} className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-slate-50">
                <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${statusTone(item.status)}`}>{statusIcon(item.status)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{item.customer?.name ?? "System"}</span>
                  <span className="block truncate text-[13px] text-[#596782]">{item.messageTypeLabel}{item.booking?.pnr ? ` · PNR ${item.booking.pnr}` : ""}</span>
                </span>
                <span className="shrink-0 text-xs text-[#8a97ad]">{formatDate(item.scheduledAt, true)}</span>
              </button>
            ))}
          </div>
          <Link href="/whatsapp-messages" onClick={() => setOpen(false)} className="block border-t border-[#e5edf6] px-4 py-3 text-center text-sm font-bold text-[#087df0]">View all messages →</Link>
        </div>
      ) : null}
    </div>
  );
}

function statusTone(status: string): string {
  const value = status.toUpperCase();
  if (value === "SENT" || value === "DELIVERED" || value === "READ") return "bg-[#d9f7e8] text-[#00a451]";
  if (value === "FAILED") return "bg-[#ffe2eb] text-[#f22552]";
  if (value === "CANCELLED") return "bg-[#e4e9f2] text-[#5a6577]";
  return "bg-[#fff0dc] text-[#fb8500]";
}

function statusIcon(status: string): ReactNode {
  const value = status.toUpperCase();
  if (value === "SENT" || value === "DELIVERED" || value === "READ") return <Check className="h-4 w-4" />;
  if (value === "FAILED") return <AlertTriangle className="h-4 w-4" />;
  if (value === "CANCELLED") return <X className="h-4 w-4" />;
  return <Clock3 className="h-4 w-4" />;
}

function AccountMenu({ user, businessName, onLogout }: { user: ApiUser; businessName: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const initials = (user.name || user.email || "?")
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="relative">
      <button className="flex items-center gap-3" type="button" onClick={() => setOpen((value) => !value)}>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[#8b22b7] text-sm font-bold text-white">{initials}</span>
        <span className="hidden text-[14px] font-semibold sm:inline">{businessName}</span>
        <ChevronDown className="h-5 w-5" />
      </button>
      {open ? <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} /> : null}
      {open ? (
        <div className="absolute right-0 top-[54px] z-30 w-[240px] overflow-hidden rounded-xl border border-[#dce7f4] bg-white shadow-2xl">
          <div className="border-b border-[#e5edf6] px-4 py-3">
            <div className="text-sm font-bold">{user.name}</div>
            <div className="mt-0.5 text-xs text-[#596782]">{user.email}<span className="ml-2 rounded bg-[#e8edf5] px-1.5 py-0.5 text-[#405174] capitalize">{user.role?.toLowerCase()}</span></div>
          </div>
          <Link href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition hover:bg-slate-50"><Settings className="h-4 w-4" />Settings</Link>
          <button onClick={onLogout} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50"><LogOut className="h-4 w-4" />Log out</button>
        </div>
      ) : null}
    </div>
  );
}

function LogoutDialog({ open, onCancel, onConfirm }: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-[380px] rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <h3 className="text-lg font-extrabold">Log out?</h3>
        <p className="mt-1 text-sm text-[#596782]">Are you sure you want to log out of FlyConnect?</p>
        <div className="mt-6 flex gap-3">
          <button className="flex-1 rounded-lg border border-[#d6e1ef] px-4 py-2.5 font-bold transition hover:bg-slate-50" onClick={onCancel}>Cancel</button>
          <button className="flex-1 rounded-lg bg-[#f61f55] px-4 py-2.5 font-bold text-white transition hover:bg-[#e01549]" onClick={onConfirm}>Log out</button>
        </div>
      </div>
    </div>
  );
}