"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, Banknote, BarChart3, Bell, CalendarCheck, Check, ChevronDown, Clock3, Command, FileText, Home, LogOut, Menu, MessageCircle, PanelLeftClose, PanelLeftOpen, Plane, Plus, Receipt, RefreshCw, Search, Settings, Users, Wallet, Workflow, X, type LucideIcon } from "lucide-react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { api, clearSession, formatDate, getAccessToken, getStoredUser, type ApiUser } from "@/lib/api";
import { useApi, useOffline } from "@/lib/hooks";
import { CurrencyProvider, useCurrency } from "@/lib/currency";
import { logOut as firebaseLogOut } from "@/lib/firebase";
import { CollaboratorPresence } from "@/components/collaborator-presence";

export interface NavGroup {
  title: string;
  items: Array<{ label: string; href: string; icon: LucideIcon }>;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Operations",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: Home },
      { label: "Bookings", href: "/bookings", icon: Plane },
      { label: "Add Booking", href: "/bookings/add", icon: Plus },
      { label: "Upcoming Journeys", href: "/upcoming-journeys", icon: CalendarCheck },
    ],
  },
  {
    title: "Communications",
    items: [
      { label: "Customers", href: "/customers", icon: Users },
      { label: "WhatsApp Messages", href: "/whatsapp-messages", icon: MessageCircle },
      { label: "Automation", href: "/automation", icon: Settings },
      { label: "Message Templates", href: "/message-templates", icon: FileText },
    ],
  },
  {
    title: "Financials",
    items: [
      { label: "Reports", href: "/reports", icon: BarChart3 },
      { label: "Invoices", href: "/invoices", icon: Receipt },
      { label: "Expenses", href: "/expenses", icon: Wallet },
      { label: "Income", href: "/income", icon: Banknote },
      { label: "Currency", href: "/currency", icon: RefreshCw },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Settings", href: "/settings", icon: Workflow },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [railHover, setRailHover] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [user, setUser] = useState<ApiUser | null>(null);
  const router = useRouter();
  const me = useApi<{ business?: { id?: string; name?: string | null; currency?: string | null } }>("/settings");
  const offline = useOffline();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedPin = window.localStorage.getItem("fc_sidebar_pinned");
      if (savedPin !== null) {
        setPinned(savedPin === "1");
      } else if (window.innerWidth >= 1536) {
        setPinned(true);
      }
    }
  }, []);

  const togglePin = () => {
    setPinned((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("fc_sidebar_pinned", next ? "1" : "0");
      }
      return next;
    });
  };

  useEffect(() => {
    if (me.data?.business?.id && typeof window !== "undefined") {
      window.localStorage.setItem("fc_business_id", me.data.business.id);
    }
  }, [me.data?.business?.id]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/");
      return;
    }
    const stored = getStoredUser();
    if (!stored) {
      clearSession();
      router.replace("/");
      return;
    }
    setUser(stored);
  }, [router]);

  if (!user) return null;

  const businessName = me.data?.business?.name || user.name;
  const paddingLeft = pinned ? "lg:pl-[240px]" : "lg:pl-[72px]";

  return (
    <CurrencyProvider businessCurrency={me.data?.business?.currency}>
      <div className="flyconnect-app min-h-screen overflow-x-clip bg-[#f4f9ff] text-[#08142e]">
        <Sidebar
          open={open}
          onClose={() => setOpen(false)}
          user={user}
          onLogout={() => setLogoutOpen(true)}
          pinned={pinned}
          onTogglePin={togglePin}
          hovered={railHover}
          onHoverChange={setRailHover}
        />
        <div className={`min-h-screen overflow-x-clip transition-[padding] duration-200 ${paddingLeft}`}>
          <Topbar onMenu={() => setOpen(true)} user={user} businessName={businessName} onLogout={() => setLogoutOpen(true)} />
          {offline ? (
            <div className="flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-amber-800" role="status">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
              Offline — showing saved data. Reconnecting…
            </div>
          ) : null}
          <main className="mx-auto w-full max-w-[1720px] min-w-0 px-3.5 py-4 sm:px-6 lg:px-6 xl:px-8 2xl:px-10">{children}</main>
        </div>
        <LogoutDialog
          open={logoutOpen}
          onCancel={() => setLogoutOpen(false)}
          onConfirm={async () => {
            try {
              const { cleanUpPresence } = await import("@/lib/sync");
              await cleanUpPresence();
            } catch {
              // ignore
            }
            try {
              await firebaseLogOut();
            } catch {
              // ignore
            }
            clearSession();
            router.replace("/");
          }}
        />
      </div>
    </CurrencyProvider>
  );
}

function Sidebar({
  open,
  onClose,
  user,
  onLogout,
  pinned,
  onTogglePin,
  hovered,
  onHoverChange,
}: {
  open: boolean;
  onClose: () => void;
  user: ApiUser;
  onLogout: () => void;
  pinned: boolean;
  onTogglePin: () => void;
  hovered: boolean;
  onHoverChange: (value: boolean) => void;
}) {
  const pathname = usePathname();
  const full = pinned || hovered || open;
  const initials = (user.name || user.email || "?")
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-xs transition lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      <aside
        onMouseEnter={() => !pinned && onHoverChange(true)}
        onMouseLeave={() => !pinned && onHoverChange(false)}
        className={`fixed inset-y-0 left-0 z-50 flex flex-col overflow-hidden bg-[#071832] text-white shadow-2xl transition-[width,transform] duration-200 lg:translate-x-0 ${
          pinned ? "lg:w-[240px]" : hovered ? "lg:w-[240px] lg:shadow-[6px_0_28px_rgba(0,0,0,0.4)]" : "lg:w-[72px]"
        } ${open ? "w-[240px] translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div className={`flex h-[64px] items-center ${full ? "justify-between" : "justify-center"} border-b border-white/8 px-4`}>
          <Link href="/dashboard" className="flex items-center gap-2.5" onClick={onClose}>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#218bf3] to-[#1268c7] shadow-md shadow-[#218bf3]/20">
              <Plane className="h-6 w-6 -rotate-45 fill-white stroke-white" />
            </div>
            {full ? (
              <div className="overflow-hidden">
                <div className="text-[19px] font-extrabold leading-none tracking-[-0.03em]">
                  Fly<span className="text-[#38bdf8]">Connect</span>
                </div>
                <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  Agency Workspace
                </div>
              </div>
            ) : null}
          </Link>
          {full ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onTogglePin}
                title={pinned ? "Collapse sidebar" : "Pin sidebar"}
                aria-label={pinned ? "Collapse sidebar" : "Pin sidebar"}
                className="hidden rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white lg:inline-flex"
              >
                {pinned ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
              </button>
              <button className="rounded-lg p-1.5 text-slate-400 hover:text-white lg:hidden" onClick={onClose} type="button">
                <X className="h-5 w-5" />
              </button>
            </div>
          ) : null}
        </div>

        <nav className="no-scrollbar mt-2 flex-1 space-y-3 overflow-y-auto px-2.5 py-1">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="space-y-0.5">
              {full ? (
                <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400/90">
                  {group.title}
                </div>
              ) : (
                <div className="mx-auto my-2 h-px w-8 bg-white/10" />
              )}

              {group.items.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  (item.href === "/bookings" && pathname.startsWith("/bookings") && pathname !== "/bookings/add") ||
                  (item.href === "/bookings/add" && pathname === "/bookings/add");

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    title={!full ? item.label : undefined}
                    className={`group relative flex h-[38px] items-center rounded-lg text-[14px] font-medium transition ${
                      full ? "gap-3 px-3" : "justify-center px-0"
                    } ${
                      active
                        ? "bg-[#1d4ed8] text-white font-semibold shadow-sm shadow-[#1d4ed8]/40"
                        : "text-slate-300 hover:bg-white/8 hover:text-white"
                    }`}
                  >
                    {active ? (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-[#60a5fa]" />
                    ) : null}
                    <Icon className={`h-[19px] w-[19px] shrink-0 ${active ? "text-white" : "text-slate-400 group-hover:text-white"}`} />
                    {full ? <span className="truncate">{item.label}</span> : null}

                    {!full ? (
                      <div className="pointer-events-none absolute left-[68px] z-50 hidden whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white shadow-xl group-hover:block">
                        {item.label}
                      </div>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={`mt-auto border-t border-white/8 ${full ? "p-3" : "py-3 px-2"} bg-[#051329]`}>
          <div className={`flex items-center ${full ? "gap-2.5" : "justify-center"}`}>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-400 to-purple-600 text-[13px] font-bold text-white shadow-sm">
              {initials}
            </div>
            {full ? (
              <>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-white">{user.name}</div>
                  <div className="truncate text-[11px] capitalize text-slate-400">{user.role?.toLowerCase() || "Agent"}</div>
                </div>
                <button
                  aria-label="Log out"
                  onClick={onLogout}
                  title="Sign out"
                  type="button"
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-400"
                >
                  <LogOut className="h-4 w-4" />
                </button>
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
    <header className="sticky top-0 z-30 flex h-[62px] items-center justify-between border-b border-[#d9e4f2] bg-white/95 px-3.5 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex flex-1 items-center gap-2 sm:gap-3 min-w-0 pr-2">
        <button className="rounded-lg border border-slate-200 p-2 lg:hidden shrink-0" onClick={onMenu} type="button" aria-label="Open navigation menu">
          <Menu className="h-5 w-5 text-slate-700" />
        </button>
        <GlobalSearch />
      </div>
      <div className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
        <Link
          href="/bookings/add"
          className="hidden xl:inline-flex items-center gap-1.5 rounded-lg bg-[#218bf3] px-3.5 py-2 text-[13px] font-bold text-white shadow-sm shadow-[#218bf3]/25 transition hover:bg-[#127bdc] active:scale-[0.98] shrink-0"
        >
          <Plus className="h-4 w-4 stroke-[2.5]" />
          <span>New Booking</span>
        </Link>
        <CollaboratorPresence />
        <CurrencyToggle />
        <NotificationsBell />
        <AccountMenu user={user} businessName={businessName} onLogout={onLogout} />
      </div>
    </header>
  );
}

/** Compact display-currency picker. Rates come from the backend cache; the choice is per browser. */
function CurrencyToggle() {
  const { display, base, setDisplay, options } = useCurrency();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const term = query.trim().toLowerCase();
  const filtered = options
    .filter((option) => !term || option.code.toLowerCase().includes(term) || option.name.toLowerCase().includes(term))
    .slice(0, 60);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Display currency: ${display}. Change currency`}
        className="flex h-[38px] items-center gap-1.5 rounded-lg border border-[#dde7f3] bg-[#f5f8fc] px-2.5 text-[13px] font-bold text-[#1c2b4a] transition hover:border-[#1688f9] hover:bg-white"
      >
        <span className="max-w-[68px] truncate">{display}</span>
        <ChevronDown className={`h-4 w-4 text-[#526486] transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute right-0 top-[46px] z-40 w-[290px] overflow-hidden rounded-xl border border-[#dce7f4] bg-white shadow-xl">
          <div className="border-b border-[#eef3f9] p-2">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search currency…"
              className="w-full rounded-lg border border-[#e2eaf5] px-2.5 py-1.5 text-[13px] outline-none focus:border-[#1688f9]"
            />
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-[13px] text-[#7c8aa3]">No currency matches “{query}”</div>
            ) : (
              filtered.map((option) => {
                const active = option.code === display;
                return (
                  <button
                    key={option.code}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setDisplay(option.code);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-slate-50 ${active ? "bg-[#eef6ff]" : ""}`}
                  >
                    <span className="w-11 shrink-0 text-[12px] font-extrabold text-[#1c2b4a]">{option.code}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[#4a5a75]">{option.name}</span>
                    {option.code === base ? <span className="shrink-0 rounded bg-[#e7f1ff] px-1.5 py-0.5 text-[10px] font-bold text-[#1688f9]">BASE</span> : null}
                    {active ? <Check className="h-4 w-4 shrink-0 text-[#1688f9]" /> : null}
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t border-[#eef3f9] px-3 py-2 text-[11px] text-[#7c8aa3]">
            Amounts are stored in {base} and converted for display.
          </div>
        </div>
      ) : null}
    </div>
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
      api<SearchResults>(`/search?q=${encodeURIComponent(term)}`, { auth: true, skipCache: true })
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
    <div className="relative w-full max-w-[320px] sm:max-w-[400px] xl:max-w-[480px] 2xl:max-w-[560px] min-w-0">
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
        <span className="hidden text-[13px] font-semibold sm:inline truncate max-w-[90px] md:max-w-[130px] xl:max-w-[180px] 2xl:max-w-[240px]" title={businessName}>{businessName}</span>
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