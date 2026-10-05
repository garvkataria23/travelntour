"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, Banknote, BarChart3, Bell, CalendarCheck, Check, ChevronDown, Clock3, Command, FileText, Home, LogOut, Menu, MessageCircle, PanelLeftClose, PanelLeftOpen, Plane, Plus, Receipt, RefreshCw, Search, Settings, ShieldAlert, Users, Wallet, Workflow, X, type LucideIcon } from "lucide-react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { api, clearSession, formatDate, getAccessToken, getStoredUser, type ApiUser } from "@/lib/api";
import { useApi, useOffline } from "@/lib/hooks";
import { CurrencyProvider, useCurrency } from "@/lib/currency";
import { logOut as firebaseLogOut } from "@/lib/firebase";
import { CollaboratorPresence } from "@/components/collaborator-presence";
import { isAccountBlocked } from "@/lib/admin-accounts";
import { hasAnyPermission, visibleNavGroups, type Permission } from "@/lib/permissions";
import { formatPhoneDisplay } from "@/lib/phone-utils";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Capabilities required to see this entry. `undefined` means every signed-in member of a tenant
   * may see it; an empty array means nobody except SUPER_ADMIN, who passes every check anyway.
   */
  permissions?: Permission[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Operations",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: Home },
      { label: "Bookings", href: "/bookings", icon: Plane, permissions: ["booking:view"] },
      { label: "Add Booking", href: "/bookings/add", icon: Plus, permissions: ["booking:create"] },
      { label: "Upcoming Journeys", href: "/upcoming-journeys", icon: CalendarCheck, permissions: ["booking:view"] },
    ],
  },
  {
    title: "Communications",
    items: [
      { label: "Customers", href: "/customers", icon: Users, permissions: ["customer:view"] },
      { label: "WhatsApp Messages", href: "/whatsapp-messages", icon: MessageCircle, permissions: ["whatsapp:view-messages"] },
      { label: "Automation", href: "/automation", icon: Settings, permissions: ["automation:view"] },
      { label: "Message Templates", href: "/message-templates", icon: FileText, permissions: ["template:view"] },
    ],
  },
  {
    title: "Financials",
    items: [
      { label: "Reports", href: "/reports", icon: BarChart3, permissions: ["report:view-operational"] },
      { label: "Invoices", href: "/invoices", icon: Receipt, permissions: ["invoice:view"] },
      { label: "Expenses", href: "/expenses", icon: Wallet, permissions: ["expense:view"] },
      { label: "Income", href: "/income", icon: Banknote, permissions: ["income:view"] },
      { label: "Currency", href: "/currency", icon: RefreshCw },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Settings", href: "/settings", icon: Workflow, permissions: ["settings:view"] },
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

  const [blockState, setBlockState] = useState<{ isBlocked: boolean; isSuspended: boolean; reason?: string }>(() => {
    if (typeof window === "undefined") return { isBlocked: false, isSuspended: false };
    const currentBiz = window.localStorage.getItem("fc_business_id") || "biz_demo";
    return isAccountBlocked(currentBiz);
  });

  useEffect(() => {
    const handleStatusSync = () => {
      const currentBiz = window.localStorage.getItem("fc_business_id") || user?.businessId || "biz_demo";
      setBlockState(isAccountBlocked(currentBiz));
    };

    handleStatusSync();
    window.addEventListener("fc:account-status-changed", handleStatusSync);
    window.addEventListener("fc:admin-accounts-updated", handleStatusSync);
    return () => {
      window.removeEventListener("fc:account-status-changed", handleStatusSync);
      window.removeEventListener("fc:admin-accounts-updated", handleStatusSync);
    };
  }, [user]);

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

  // Enforcement: If account has been blocked or suspended by Master Admin
  if (user.role !== "SUPER_ADMIN" && (blockState.isBlocked || blockState.isSuspended)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
        <div className="w-full max-w-lg rounded-3xl border-t-8 border-rose-500 bg-white p-8 text-center shadow-2xl">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 shadow-inner">
            <AlertTriangle className="h-10 w-10 stroke-[2.5]" />
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3.5 py-1 text-xs font-black tracking-wide text-rose-800 uppercase">
            Account Suspended by Master Admin
          </span>

          <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900">
            Agency Access Restricted
          </h2>

          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50/60 p-4 text-left">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
              <span>Tenant / Business</span>
              <span className="rounded bg-rose-200/80 px-2 py-0.5 text-rose-900">LOCKED</span>
            </div>
            <p className="mt-1 text-base font-extrabold text-slate-900">{businessName}</p>

            <div className="mt-3 pt-3 border-t border-rose-200/60">
              <span className="text-xs font-bold text-rose-800 uppercase tracking-wide">Reason for Suspension:</span>
              <p className="mt-1 text-sm font-semibold text-rose-950 leading-relaxed">
                {blockState.reason || "Administrative policy hold or billing violation."}
              </p>
            </div>
          </div>

          <p className="mt-5 text-sm text-slate-600 leading-relaxed">
            All booking operations, WhatsApp messaging, and invoice generation for this agency have been frozen by the Master Administrator.
          </p>

          <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-left text-xs font-medium text-slate-800 space-y-1.5">
            <div className="font-bold text-blue-900 flex items-center gap-2">
              <span>Master Administrator:</span>
              <span className="rounded bg-blue-200/70 px-2 py-0.5 text-blue-900 font-extrabold">Garv Kataria</span>
            </div>
            <p><b>Email:</b> admin@blueauratravel.com</p>
            <p><b>Direct Line:</b> +971 50 123 4567</p>
            <p className="text-[11px] text-blue-700 pt-1">
              Please contact the Master Admin to resolve issues and reactivate your portal access.
            </p>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => {
                clearSession();
                router.replace("/");
              }}
              className="w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white shadow-md hover:bg-slate-800 transition active:scale-[0.99]"
            >
              Sign Out to Login Screen
            </button>
          </div>
        </div>
      </div>
    );
  }

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
          {/* Super Admin Top Control Banner */}
          {user.role === "SUPER_ADMIN" ? (
            <div className="relative z-30 flex flex-wrap items-center justify-between gap-2 border-b border-amber-400 bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 px-4 py-2 text-xs font-bold text-white shadow-md">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[11px]">★</span>
                <span>MASTER ADMIN MODE ACTIVE — Full Platform Controls & Quota Overrides Enabled</span>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/admin"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1 font-extrabold text-amber-900 shadow-sm transition hover:bg-amber-100"
                >
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-700" />
                  Open Master Admin Panel →
                </Link>
              </div>
            </div>
          ) : null}

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
  // Only render what this role can reach. Groups that end up empty are dropped entirely, so a
  // STAFF account is not shown an empty "Financials" heading.
  const groups = visibleNavGroups(NAV_GROUPS, hasAnyPermission);
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
          {groups.map((group) => (
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
  const POPULAR_QUICK = ["AED", "USD", "EUR", "GBP", "INR", "SAR", "QAR", "KWD", "CAD", "AUD", "SGD"];
  const filtered = options.filter(
    (option) => !term || option.code.toLowerCase().includes(term) || option.name.toLowerCase().includes(term),
  );

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
        <div className="absolute right-0 top-[46px] z-40 w-[320px] overflow-hidden rounded-xl border border-[#dce7f4] bg-white shadow-xl">
          <div className="border-b border-[#eef3f9] p-2">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search code or name (e.g. USD, Rupee)…"
              className="w-full rounded-lg border border-[#e2eaf5] px-2.5 py-1.5 text-[13px] outline-none focus:border-[#1688f9]"
            />
          </div>
          {!term && (
            <div className="border-b border-[#eef3f9] bg-[#f8fbff] p-2">
              <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[#7c8aa3]">Popular</div>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_QUICK.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => {
                      setDisplay(code);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`rounded-md border px-2 py-0.5 text-[11px] font-extrabold transition ${
                      display === code
                        ? "border-[#1688f9] bg-[#1688f9] text-white"
                        : "border-[#dce7f4] bg-white text-[#3d4d6b] hover:border-[#1688f9]"
                    }`}
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>
          )}
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
          <div className="flex items-center justify-between border-t border-[#eef3f9] px-3 py-2 text-[11px] text-[#7c8aa3]">
            <span>{options.length} live currencies</span>
            <span>Saved in {base}</span>
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
  const requestIdRef = useRef(0);

  useEffect(() => {
    // clearTimeout only cancels a timer that has not fired yet. Once a request is in flight it
    // used to keep running, so a slower earlier response could overwrite a newer one, and a
    // request for a term the user had already cleared would repopulate stale results.
    // An AbortController plus a monotonic request id makes only the latest query authoritative.
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const term = query.trim();
      if (term.length < 2) {
        setResults(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      api<SearchResults>(`/search?q=${encodeURIComponent(term)}`, {
        auth: true,
        skipCache: true,
        signal: controller.signal,
      })
        .then((result) => {
          if (requestId !== requestIdRef.current) return;
          setResults(result);
        })
        .catch((err) => {
          if (controller.signal.aborted || requestId !== requestIdRef.current) return;
          setResults(null);
        })
        .finally(() => {
          if (requestId !== requestIdRef.current) return;
          setLoading(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
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
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{customer.name}</span><span className="block truncate text-[13px] text-[#596782]">{customer.phone ? formatPhoneDisplay(customer.phone) : customer.email ?? "—"}</span></span>
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [staffAccounts, setStaffAccounts] = useState<Array<{ id: string; name: string; email: string; password?: string; role: string; status: string }>>([]);

  useEffect(() => {
    if (open) {
      import("@/lib/staff-management")
        .then(({ getStoredStaff }) => {
          setStaffAccounts(getStoredStaff().filter((m) => m.status === "ACTIVE"));
        })
        .catch(() => {});
    }
  }, [open]);

  const initials = (user.name || user.email || "?")
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const roleBadgeClass =
    user.role === "SUPER_ADMIN"
      ? "bg-violet-100 text-violet-800 border-violet-200"
      : user.role === "ADMIN"
      ? "bg-blue-100 text-blue-800 border-blue-200"
      : user.role === "MANAGER"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : "bg-amber-100 text-amber-800 border-amber-200";

  return (
    <div className="relative">
      <button className="flex items-center gap-2.5" type="button" onClick={() => setOpen((value) => !value)}>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[#8b22b7] text-sm font-bold text-white">{initials}</span>
        <div className="hidden text-left sm:block">
          <div className="truncate text-[13px] font-bold text-slate-900 max-w-[110px] md:max-w-[150px] leading-tight">
            {user.name || businessName}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-600">
            <span>{user.role || "STAFF"}</span>
          </div>
        </div>
        <ChevronDown className="h-4 w-4 text-slate-500" />
      </button>
      {open ? <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} /> : null}
      {open ? (
        <div className="absolute right-0 top-[54px] z-30 w-[300px] overflow-hidden rounded-2xl border border-[#dce7f4] bg-white shadow-2xl">
          <div className="border-b border-[#e5edf6] bg-slate-50/70 px-4 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-sm font-extrabold text-slate-900">{user.name}</div>
              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-extrabold ${roleBadgeClass}`}>
                {user.role || "STAFF"}
              </span>
            </div>
            <div className="mt-1 truncate font-mono text-xs text-[#596782]">{user.email}</div>
          </div>

          {user.role === "SUPER_ADMIN" ? (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 border-b border-amber-200 bg-amber-50/80 px-4 py-2.5 text-xs font-extrabold text-amber-900 transition hover:bg-amber-100"
            >
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              Master Super Admin Panel
            </Link>
          ) : null}

          {(user.role === "SUPER_ADMIN" || user.role === "ADMIN") && (
            <Link
              href="/settings?tab=team"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-xs font-bold text-blue-700 transition hover:bg-blue-50"
            >
              <Users className="h-4 w-4 text-blue-600" />
              Manage Staff, Roles & Bookings
            </Link>
          )}

          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Settings className="h-4 w-4 text-slate-500" />
            Agency & Profile Settings
          </Link>

          {/* Quick Role / Staff Switcher for testing separate logins */}
          {staffAccounts.length > 1 && (
            <div className="border-b border-slate-100 px-3 py-2.5">
              <div className="mb-1.5 px-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Switch Role / Staff Login
              </div>
              <div className="max-h-36 space-y-1 overflow-y-auto">
                {staffAccounts
                  .filter((acc) => acc.email.toLowerCase() !== user.email?.toLowerCase())
                  .map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={async () => {
                        try {
                          const { authenticateStaffCredentials } = await import("@/lib/staff-management");
                          const { setSession } = await import("@/lib/api");
                          const sess = authenticateStaffCredentials(acc.email, acc.password || "Staff@123");
                          setSession(sess);
                          setOpen(false);
                          if (acc.role === "SUPER_ADMIN") {
                            router.push("/admin");
                          } else {
                            router.push("/dashboard");
                          }
                        } catch {
                          // ignore
                        }
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-blue-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold text-slate-800">{acc.name}</div>
                        <div className="truncate font-mono text-[10px] text-slate-400">{acc.email}</div>
                      </div>
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-extrabold text-slate-700">
                        {acc.role}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          <button
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="flex w-full items-center gap-2 px-4 py-3 text-xs font-extrabold text-rose-600 transition hover:bg-rose-50"
          >
            <LogOut className="h-4 w-4" />
            Log Out ({user.email})
          </button>
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