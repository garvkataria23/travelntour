"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowUpRight,
  Ban,
  Bell,
  Building,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  Database,
  DollarSign,
  ExternalLink,
  Eye,
  EyeOff,
  FileCode,
  Flame,
  Globe,
  HelpCircle,
  History,
  Info,
  KeyRound,
  Layers,
  Lock,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Pencil,
  Phone,
  PlayCircle,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  Trash2,
  TrendingUp,
  Undo2,
  Unlock,
  UploadCloud,
  UserCheck,
  Users,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { formatPhoneDisplay } from "@/lib/phone-utils";
import {
  AdminAccount,
  fetchAdminAccounts,
  invalidateAdminAccounts,
  MASTER_ADMIN_ID,
  toggleAccountStatus,
  updateAccountWhatsAppLimit,
  updateAdminAccount,
  addNewAccount,
} from "@/lib/admin-accounts";
import {
  clearAllDiagnostics,
  clearResolvedDiagnostics,
  DiagnosticCategory,
  DiagnosticSeverity,
  getDiagnosticErrors,
  logDiagnosticError,
  resolveDiagnosticError,
  retryDiagnosticAction,
  simulateDiagnosticError,
  SystemDiagnosticError,
  unresolveDiagnosticError,
} from "@/lib/admin-diagnostics";
import {
  addWhatsAppQuotaCredits,
  evaluateQuotaStatus,
  getStoredQuota,
  resetWhatsAppUsage,
  setSimulationUsage,
  setWhatsAppCustomLimits,
  setWhatsAppUsageCount,
  toggleWhatsAppGlobalPause,
  WhatsAppQuotaConfig,
} from "@/lib/whatsapp-quota";
import {
  Branch,
  Company,
  deleteBranch,
  deleteCompany,
  getStoredBranches,
  getStoredCompanies,
  INITIAL_BRANCHES,
  INITIAL_COMPANIES,
  saveBranch,
  saveCompany,
} from "@/lib/travel-crm";
import {
  RecycleBinItem,
  RecycleBinItemType,
  getRecycleBinItems,
  moveToRecycleBin,
  restoreFromRecycleBin,
  permanentlyDeleteFromRecycleBin,
  emptyRecycleBin,
  getDaysRemaining,
} from "@/lib/admin-recycle-bin";
import { api, clearSession, getStoredUser, hasActiveSession, setSession, ApiUser, ApiSession } from "@/lib/api";
import { StaffRoleManager } from "@/components/admin/staff-role-manager";
import { authenticateStaffCredentials, getStoredStaff, hydrateSessionWithStaffPermissions } from "@/lib/staff-management";
import {
  DRIVE_OAUTH_CHANNEL,
  DRIVE_OAUTH_STORAGE_KEY,
  GoogleDriveConnectModal,
  GoogleGLogo,
  type DriveOAuthPopupMessage,
  type StorageResponse,
} from "@/components/backup/google-drive-connect-modal";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type AdminTab = "accounts" | "staff" | "branches" | "whatsapp" | "diagnostics" | "system" | "recycle";

// ─────────────────────────────────────────────────────────────────────────────
// Security constants
// ─────────────────────────────────────────────────────────────────────────────
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_KEY = "fc_admin_attempts";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function getStoredAttempts(): { count: number; until: number | null } {
  if (typeof window === "undefined") return { count: 0, until: null };
  try {
    const raw = window.localStorage.getItem(LOCKOUT_KEY);
    if (!raw) return { count: 0, until: null };
    const parsed = JSON.parse(raw);
    if (parsed.until && Date.now() >= parsed.until) {
      window.localStorage.removeItem(LOCKOUT_KEY);
      return { count: 0, until: null };
    }
    return parsed;
  } catch {
    return { count: 0, until: null };
  }
}

function saveAttempts(count: number, until: number | null) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCKOUT_KEY, JSON.stringify({ count, until }));
}

function clearAttempts() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LOCKOUT_KEY);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Animated status dot */
function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ACTIVE: "bg-emerald-500",
    BLOCKED: "bg-rose-500",
    SUSPENDED: "bg-amber-500",
    // INACTIVE/PENDING are reachable from the API's BusinessStatus enum and must not render blank.
    INACTIVE: "bg-slate-400",
    PENDING: "bg-sky-400",
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[status] ?? "bg-slate-400"}`} />;
}

/** Badge for plan type */
function PlanBadge({ plan }: { plan: string }) {
  const styles: Record<string, string> = {
    ENTERPRISE: "bg-violet-100 text-violet-700 ring-violet-200",
    PROFESSIONAL: "bg-blue-100 text-blue-700 ring-blue-200",
    STARTER: "bg-slate-100 text-slate-600 ring-slate-200",
  };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ring-1 ${styles[plan] ?? styles.PROFESSIONAL}`}>
      {plan}
    </span>
  );
}

/** KPI card */
function KpiCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
          <p className="mt-1.5 text-2xl font-black text-slate-800">{value}</p>
          {sub && <p className="mt-0.5 text-xs font-medium text-slate-500">{sub}</p>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent}`}>{icon}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function MasterAdminPage() {
  const router = useRouter();

  // ── Auth state ──────────────────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState<ApiUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // ── Login form ──────────────────────────────────────────────────────────────
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loginErr, setLoginErr] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // ── Brute-force lockout (persisted in localStorage) ─────────────────────────
  const [loginAttempts, setLoginAttempts] = useState(() => getStoredAttempts().count);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(() => getStoredAttempts().until);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<AdminTab>("accounts");
  const [toastMsg, setToastMsg] = useState("");
  const [toastType, setToastType] = useState<"success" | "error">("success");
  const [lockoutCountdown, setLockoutCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data state ──────────────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [diagnostics, setDiagnostics] = useState<SystemDiagnosticError[]>([]);
  const [quota, setQuota] = useState<WhatsAppQuotaConfig>(getStoredQuota);
  const [recycleBin, setRecycleBin] = useState<RecycleBinItem[]>([]);

  // ── View Details Dossier State ──────────────────────────────────────────────
  const [viewAccount, setViewAccount] = useState<AdminAccount | null>(null);
  const [viewCompany, setViewCompany] = useState<Company | null>(null);
  const [viewBranch, setViewBranch] = useState<Branch | null>(null);

  // ── Account tab state ────────────────────────────────────────────────────────
  const [accountSearch, setAccountSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState<"ALL" | "ACTIVE" | "BLOCKED" | "SUSPENDED">("ALL");
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [targetAccount, setTargetAccount] = useState<AdminAccount | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [editAccModalOpen, setEditAccModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AdminAccount | null>(null);
  const [editAccName, setEditAccName] = useState("");
  const [editAccOwner, setEditAccOwner] = useState("");
  const [editAccEmail, setEditAccEmail] = useState("");
  const [editAccPhone, setEditAccPhone] = useState("");
  const [editAccPlan, setEditAccPlan] = useState<"ENTERPRISE" | "PROFESSIONAL" | "STARTER">("ENTERPRISE");
  const [editAccBranch, setEditAccBranch] = useState("Dubai Flagship Headquarters");
  const [editAccCurrency, setEditAccCurrency] = useState("AED");
  const [editAccStatus, setEditAccStatus] = useState<"ACTIVE" | "BLOCKED" | "SUSPENDED">("ACTIVE");
  const [editAccNotes, setEditAccNotes] = useState("");
  const [newAccModalOpen, setNewAccModalOpen] = useState(false);
  const [newAccName, setNewAccName] = useState("");
  const [newAccOwner, setNewAccOwner] = useState("");
  const [newAccEmail, setNewAccEmail] = useState("");
  const [newAccPhone, setNewAccPhone] = useState("");
  const [newAccPlan, setNewAccPlan] = useState<"ENTERPRISE" | "PROFESSIONAL" | "STARTER">("PROFESSIONAL");
  const [newAccLimit, setNewAccLimit] = useState(1000);
  const [newAccBranch, setNewAccBranch] = useState("Dubai Flagship Headquarters");
  const [newAccCurrency, setNewAccCurrency] = useState("AED");
  const [newAccNotes, setNewAccNotes] = useState("");

  // ── Quota modal ──────────────────────────────────────────────────────────────
  const [quotaModalOpen, setQuotaModalOpen] = useState(false);
  const [targetQuotaAccount, setTargetQuotaAccount] = useState<AdminAccount | null>(null);
  const [quotaModalLimitInput, setQuotaModalLimitInput] = useState("1000");
  const [quotaModalWarningInput, setQuotaModalWarningInput] = useState("800");
  const [quotaModalCriticalInput, setQuotaModalCriticalInput] = useState("950");
  const [quotaModalResetUsage, setQuotaModalResetUsage] = useState(false);

  // ── Branches tab state ───────────────────────────────────────────────────────
  const [selectedBranchFilter, setSelectedBranchFilter] = useState("ALL");
  const [companySearchQuery, setCompanySearchQuery] = useState("");
  const [editCompModalOpen, setEditCompModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editCompName, setEditCompName] = useState("");
  const [editCompCode, setEditCompCode] = useState("");
  const [editCompBranchId, setEditCompBranchId] = useState("");
  const [editCompIndustry, setEditCompIndustry] = useState("");
  const [editCompContact, setEditCompContact] = useState("");
  const [editCompEmail, setEditCompEmail] = useState("");
  const [editCompPhone, setEditCompPhone] = useState("");
  const [editCompAddress, setEditCompAddress] = useState("");
  const [editCompCreditLimit, setEditCompCreditLimit] = useState<number>(150000);
  const [editCompPaymentTerms, setEditCompPaymentTerms] = useState("Net 30 Days");
  const [editCompCostCenter, setEditCompCostCenter] = useState("");
  const [editCompStatus, setEditCompStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [newCompModalOpen, setNewCompModalOpen] = useState(false);
  const [newCompName, setNewCompName] = useState("");
  const [newCompCode, setNewCompCode] = useState("");
  const [newCompBranchId, setNewCompBranchId] = useState("branch-dxb");
  const [newCompIndustry, setNewCompIndustry] = useState("Corporate Services");
  const [newCompContact, setNewCompContact] = useState("");
  const [newCompEmail, setNewCompEmail] = useState("");
  const [newCompPhone, setNewCompPhone] = useState("");
  const [newCompAddress, setNewCompAddress] = useState("");
  const [newCompCreditLimit, setNewCompCreditLimit] = useState<number>(100000);

  // ── Branch Edit & Create state ──────────────────────────────────────────────
  const [newBranchModalOpen, setNewBranchModalOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchCode, setNewBranchCode] = useState("");
  const [newBranchCity, setNewBranchCity] = useState("");
  const [newBranchCountry, setNewBranchCountry] = useState("");
  const [newBranchAddress, setNewBranchAddress] = useState("");
  const [newBranchManager, setNewBranchManager] = useState("");
  const [newBranchPhone, setNewBranchPhone] = useState("");
  const [newBranchEmail, setNewBranchEmail] = useState("");
  const [newBranchNotes, setNewBranchNotes] = useState("");

  const [editBranchModalOpen, setEditBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [editBranchName, setEditBranchName] = useState("");
  const [editBranchCode, setEditBranchCode] = useState("");
  const [editBranchCity, setEditBranchCity] = useState("");
  const [editBranchCountry, setEditBranchCountry] = useState("");
  const [editBranchAddress, setEditBranchAddress] = useState("");
  const [editBranchManager, setEditBranchManager] = useState("");
  const [editBranchPhone, setEditBranchPhone] = useState("");
  const [editBranchEmail, setEditBranchEmail] = useState("");
  const [editBranchStatus, setEditBranchStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [editBranchNotes, setEditBranchNotes] = useState("");

  // ── Delete to 30-Day Recycle Bin Modal ──────────────────────────────────────
  const [deleteBinModalOpen, setDeleteBinModalOpen] = useState(false);
  const [deleteBinTarget, setDeleteBinTarget] = useState<{
    type: RecycleBinItemType;
    id: string;
    name: string;
    summary: string;
    data: any;
  } | null>(null);
  const [deleteBinReason, setDeleteBinReason] = useState("");

  // ── Permanent Delete Modal ──────────────────────────────────────────────────
  const [permDeleteModalOpen, setPermDeleteModalOpen] = useState(false);
  const [permDeleteTarget, setPermDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // ── Empty Recycle Bin Modal ─────────────────────────────────────────────────
  const [emptyBinModalOpen, setEmptyBinModalOpen] = useState(false);
  const [recycleTypeFilter, setRecycleTypeFilter] = useState<"ALL" | RecycleBinItemType>("ALL");

  // ── WhatsApp tab state ───────────────────────────────────────────────────────
  const [customLimitInput, setCustomLimitInput] = useState("1000");
  const [customWarningInput, setCustomWarningInput] = useState("800");
  const [customCriticalInput, setCustomCriticalInput] = useState("950");
  const [quotaFeedback, setQuotaFeedback] = useState("");
  const [killSwitchReason, setKillSwitchReason] = useState("");

  // ── Diagnostics tab state ────────────────────────────────────────────────────
  const [diagCategoryFilter, setDiagCategoryFilter] = useState("ALL");
  const [diagSeverityFilter, setDiagSeverityFilter] = useState("ALL");
  const [diagStatusFilter, setDiagStatusFilter] = useState<"ALL" | "UNRESOLVED" | "RESOLVED">("ALL");
  const [diagSearch, setDiagSearch] = useState("");
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [selectedError, setSelectedError] = useState<SystemDiagnosticError | null>(null);
  const [retryActionMsg, setRetryActionMsg] = useState<{ id: string; text: string } | null>(null);
  const [driveModalOpen, setDriveModalOpen] = useState(false);
  const [driveStatus, setDriveStatus] = useState<StorageResponse | null>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // Toast helper
  // ─────────────────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToastMsg(msg);
    setToastType(type);
    setTimeout(() => setToastMsg(""), 4500);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Lockout countdown
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!lockoutUntil || Date.now() >= lockoutUntil) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
      setLockoutCountdown(remaining);
      if (remaining <= 0) {
        clearAttempts();
        setLoginAttempts(0);
        setLockoutUntil(null);
        setLoginErr("");
        if (countdownRef.current) clearInterval(countdownRef.current);
      }
    };
    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [lockoutUntil]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Auth check on mount
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const user = getStoredUser();
    if (user && user.role === "SUPER_ADMIN" && hasActiveSession()) {
      setCurrentUser(user);
      setIsAuthenticated(true);
    }
    setCheckingAuth(false);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Refresh all data
  // ─────────────────────────────────────────────────────────────────────────────
  const refreshData = useCallback(() => {
    // The tenant roster is server-side now, so it is fetched rather than read from storage.
    // Failures leave the previous list in place and surface a toast rather than blanking the
    // table, which is what a bare setAccounts(getAdminAccounts()) did on any storage hiccup.
    void fetchAdminAccounts()
      .then(setAccounts)
      .catch((err) => showToast((err as Error).message, "error"));
    void api<StorageResponse>("/backups/storage", { skipCache: true })
      .then(setDriveStatus)
      .catch(() => undefined);
    setBranches(getStoredBranches());
    setCompanies(getStoredCompanies());
    setDiagnostics(getDiagnosticErrors());
    setRecycleBin(getRecycleBinItems());
    const q = getStoredQuota();
    setQuota(q);
    setCustomLimitInput(q.limit.toString());
    setCustomWarningInput(q.warningThreshold.toString());
    setCustomCriticalInput(q.criticalThreshold.toString());
  }, [showToast]);

  // Listen for Google OAuth popup or redirect outcome in SuperAdmin
  useEffect(() => {
    if (typeof window === "undefined") return;

    const applyDriveOutcome = (connected?: string | null, driveError?: string | null, code?: string | null) => {
      if (connected) {
        showToast(`Google Drive connected as ${connected}`);
        void api<StorageResponse>("/backups/storage", { skipCache: true })
          .then(setDriveStatus)
          .catch(() => undefined);
      } else if (driveError) {
        showToast(driveError, "error");
        setDriveModalOpen(true);
      } else if (code === "DENIED") {
        showToast("Google sign-in was declined.", "error");
      }
    };

    const params = new URLSearchParams(window.location.search);
    const connected = params.get("driveConnected");
    const driveError = params.get("driveError");
    const code = params.get("code");
    if (connected || driveError || code) {
      applyDriveOutcome(connected, driveError, code);
      window.history.replaceState({}, "", window.location.pathname);
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== DRIVE_OAUTH_STORAGE_KEY || !event.newValue) return;
      try {
        const msg = JSON.parse(event.newValue) as DriveOAuthPopupMessage;
        if (msg?.type === "FC_DRIVE_OAUTH_RESULT") {
          applyDriveOutcome(msg.connected, msg.driveError, msg.code);
        }
      } catch {
        // Ignore
      }
    };

    let bc: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      try {
        bc = new BroadcastChannel(DRIVE_OAUTH_CHANNEL);
        bc.onmessage = (event) => {
          const msg = event.data as DriveOAuthPopupMessage | undefined;
          if (msg?.type === "FC_DRIVE_OAUTH_RESULT") {
            applyDriveOutcome(msg.connected, msg.driveError, msg.code);
          }
        };
      } catch {
        bc = null;
      }
    }

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      bc?.close();
    };
  }, [showToast]);

  useEffect(() => {
    refreshData();
    const hq = () => setQuota(getStoredQuota());
    // The tenant roster now lives on the server, so both events trigger a refetch rather than a
    // re-read of browser storage (which no longer holds it).
    const ha = () => void fetchAdminAccounts().then(setAccounts).catch(() => undefined);
    const hd = () => setDiagnostics(getDiagnosticErrors());
    const hb = () => setBranches(getStoredBranches());
    const hc = () => setCompanies(getStoredCompanies());
    const hr = () => setRecycleBin(getRecycleBinItems());

    window.addEventListener("fc:whatsapp-quota-updated", hq);
    window.addEventListener("fc:admin-accounts-updated", ha);
    window.addEventListener("fc:account-status-changed", ha);
    window.addEventListener("fc:diagnostics-updated", hd);
    window.addEventListener("fc:branches-updated", hb);
    window.addEventListener("fc:companies-updated", hc);
    window.addEventListener("fc:recycle-bin-updated", hr);

    return () => {
      window.removeEventListener("fc:whatsapp-quota-updated", hq);
      window.removeEventListener("fc:admin-accounts-updated", ha);
      window.removeEventListener("fc:account-status-changed", ha);
      window.removeEventListener("fc:diagnostics-updated", hd);
      window.removeEventListener("fc:branches-updated", hb);
      window.removeEventListener("fc:companies-updated", hc);
      window.removeEventListener("fc:recycle-bin-updated", hr);
    };
  }, [refreshData]);

  // ─────────────────────────────────────────────────────────────────────────────
  // SECURITY: Handle login — SUPER_ADMIN only, brute-force protected
  // ─────────────────────────────────────────────────────────────────────────────
  const handleMasterLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginErr("");

    if (lockoutUntil && Date.now() < lockoutUntil) {
      const mins = Math.ceil((lockoutUntil - Date.now()) / 60000);
      setLoginErr(`Access locked. Try again in ${mins} minute${mins !== 1 ? "s" : ""}.`);
      return;
    }

    setLoginLoading(true);

    const recordFailure = (msg: string) => {
      const newCount = loginAttempts + 1;
      if (newCount >= MAX_LOGIN_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_DURATION_MS;
        saveAttempts(newCount, until);
        setLoginAttempts(newCount);
        setLockoutUntil(until);
        setLoginErr("Too many failed attempts. Access locked for 15 minutes.");
      } else {
        saveAttempts(newCount, null);
        setLoginAttempts(newCount);
        const rem = MAX_LOGIN_ATTEMPTS - newCount;
        setLoginErr(`${msg} (${rem} attempt${rem !== 1 ? "s" : ""} remaining)`);
      }
      setLoginLoading(false);
    };

    try {
      let sessionRes: ApiSession | null = null;
      const cleanEmail = loginEmail.trim().toLowerCase();
      try {
        sessionRes = authenticateStaffCredentials(cleanEmail, loginPass);
      } catch {
        const res = await api<ApiSession>("/auth/login", {
          method: "POST",
          auth: false,
          body: { email: cleanEmail, password: loginPass },
        });
        if (res?.accessToken && res?.user) {
          sessionRes = hydrateSessionWithStaffPermissions(res);
        }
      }

      if (sessionRes?.accessToken && sessionRes?.user) {
        if (sessionRes.user.role !== "SUPER_ADMIN") {
          recordFailure("Access denied — Super Admin credentials required.");
          return;
        }

        clearAttempts();
        setLoginAttempts(0);
        setLockoutUntil(null);
        setSession(sessionRes, true);

        if (typeof window !== "undefined") {
          if (sessionRes.user.businessId) {
            window.localStorage.setItem("fc_business_id", sessionRes.user.businessId);
          }
        }

        setCurrentUser(sessionRes.user);
        setIsAuthenticated(true);
        setLoginLoading(false);
        refreshData();
      } else {
        recordFailure("Invalid credentials.");
      }
    } catch (err: any) {
      recordFailure(err?.message || "Authentication failed.");
    }
  };

  const handleLogout = () => {
    clearSession();
    // The tenant roster lives in a module-level cache; drop it so the next master admin does not
    // see the previous one's list.
    invalidateAdminAccounts();
    // clearSession() also deletes the server-verified fc_session cookie via DELETE /api/session.
    setIsAuthenticated(false);
    setCurrentUser(null);
    router.replace("/");
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Derived / memoised values
  // ─────────────────────────────────────────────────────────────────────────────
  const quotaStatus = useMemo(() => evaluateQuotaStatus(quota), [quota]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      if (accountFilter !== "ALL" && acc.status !== accountFilter) return false;
      if (accountSearch.trim()) {
        const q = accountSearch.toLowerCase();
        return (
          acc.name.toLowerCase().includes(q) ||
          (acc.ownerName ?? "").toLowerCase().includes(q) ||
          (acc.email ?? "").toLowerCase().includes(q) ||
          acc.id.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [accounts, accountFilter, accountSearch]);

  const filteredDiagnostics = useMemo(() => {
    return diagnostics.filter((diag) => {
      if (diagCategoryFilter !== "ALL" && diag.category !== diagCategoryFilter) return false;
      if (diagSeverityFilter !== "ALL" && diag.severity !== diagSeverityFilter) return false;
      if (diagStatusFilter === "UNRESOLVED" && diag.resolved) return false;
      if (diagStatusFilter === "RESOLVED" && !diag.resolved) return false;
      if (diagSearch.trim()) {
        const q = diagSearch.toLowerCase();
        return (
          diag.title.toLowerCase().includes(q) ||
          diag.message.toLowerCase().includes(q) ||
          diag.errorCode.toLowerCase().includes(q) ||
          (diag.accountName?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [diagnostics, diagCategoryFilter, diagSeverityFilter, diagStatusFilter, diagSearch]);

  const branchCompanyCounts = useMemo(() => {
    const map: Record<string, number> = {};
    branches.forEach((b) => {
      map[b.id] = 0;
    });
    companies.forEach((c) => {
      if (c.branchId) map[c.branchId] = (map[c.branchId] || 0) + 1;
    });
    return map;
  }, [branches, companies]);

  const filteredCompanies = useMemo(() => {
    return companies.filter((comp) => {
      if (selectedBranchFilter !== "ALL" && comp.branchId !== selectedBranchFilter) return false;
      if (companySearchQuery.trim()) {
        const q = companySearchQuery.toLowerCase();
        return (
          comp.name.toLowerCase().includes(q) ||
          comp.code.toLowerCase().includes(q) ||
          comp.contactPerson.toLowerCase().includes(q) ||
          (comp.branchName?.toLowerCase().includes(q) ?? false) ||
          comp.industry.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [companies, selectedBranchFilter, companySearchQuery]);

  const filteredRecycleBin = useMemo(() => {
    return recycleBin.filter((item) => {
      if (recycleTypeFilter !== "ALL" && item.itemType !== recycleTypeFilter) return false;
      return true;
    });
  }, [recycleBin, recycleTypeFilter]);

  const unresolvedErrorsCount = useMemo(() => diagnostics.filter((d) => !d.resolved).length, [diagnostics]);
  const criticalErrorsCount = useMemo(() => diagnostics.filter((d) => !d.resolved && d.severity === "CRITICAL").length, [diagnostics]);
  const activeTenantsCount = useMemo(() => accounts.filter((a) => a.status === "ACTIVE").length, [accounts]);
  const blockedTenantsCount = useMemo(() => accounts.filter((a) => a.status !== "ACTIVE").length, [accounts]);
  const isLocked = !!(lockoutUntil && Date.now() < lockoutUntil);

  // ─────────────────────────────────────────────────────────────────────────────
  // Action Handlers: Move to 30-Day Recycle Bin
  // ─────────────────────────────────────────────────────────────────────────────
  const initiateDeleteToBin = (type: RecycleBinItemType, id: string, name: string, summary: string, data: any) => {
    setDeleteBinTarget({ type, id, name, summary, data });
    setDeleteBinReason("");
    setDeleteBinModalOpen(true);
  };

  const handleConfirmDeleteToBin = () => {
    if (!deleteBinTarget) return;
    const adminName = currentUser?.name ? `${currentUser.name} (Super Admin)` : "Garv Kataria (Super Admin)";
    moveToRecycleBin(
      deleteBinTarget.type,
      deleteBinTarget.id,
      deleteBinTarget.name,
      deleteBinTarget.summary,
      deleteBinTarget.data,
      adminName,
      deleteBinReason.trim() || "Moved to 30-day Recycle Bin by Super Admin"
    );
    setDeleteBinModalOpen(false);
    setDeleteBinTarget(null);
    refreshData();
    showToast(`Moved "${deleteBinTarget.name}" to 30-day Recycle Bin. Retained for 30 days.`);
  };

  const handleRestoreFromBin = (recycleId: string, name: string) => {
    const res = restoreFromRecycleBin(recycleId);
    if (res) {
      refreshData();
      showToast(`Restored "${name}" back to active database successfully!`);
    } else {
      showToast(`Could not restore "${name}". Item not found.`, "error");
    }
  };

  const initiatePermanentDelete = (id: string, name: string) => {
    setPermDeleteTarget({ id, name });
    setPermDeleteModalOpen(true);
  };

  const handleConfirmPermanentDelete = () => {
    if (!permDeleteTarget) return;
    permanentlyDeleteFromRecycleBin(permDeleteTarget.id);
    setPermDeleteModalOpen(false);
    setPermDeleteTarget(null);
    refreshData();
    showToast(`Permanently deleted from system. This action cannot be reversed.`);
  };

  const handleConfirmEmptyBin = () => {
    emptyRecycleBin();
    setEmptyBinModalOpen(false);
    refreshData();
    showToast(`Recycle bin emptied completely.`);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Account actions
  // ─────────────────────────────────────────────────────────────────────────────
  const openEditAgencyDialog = (acc: AdminAccount) => {
    setEditingAccount(acc);
    setEditAccName(acc.name);
    setEditAccOwner(acc.ownerName ?? "");
    setEditAccEmail(acc.email ?? "");
    setEditAccPhone(acc.phone ?? "");
    setEditAccPlan(acc.plan === "ENTERPRISE" || acc.plan === "STARTER" ? acc.plan : "PROFESSIONAL");
    setEditAccBranch(acc.branchName || "Dubai Flagship Headquarters");
    setEditAccCurrency(acc.currency || "AED");
    setEditAccStatus(acc.status === "ACTIVE" ? "ACTIVE" : "BLOCKED");
    setEditAccNotes(acc.notes || "");
    setEditAccModalOpen(true);
  };

  const handleSaveAgency = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    try {
      // Only the fields the platform API accepts are sent. branchName/currency/status are not
      // tenant-profile fields on the server — status changes go through the dedicated
      // block/unblock endpoint so a reason is always recorded.
      await updateAdminAccount(editingAccount.id, {
        name: editAccName.trim(),
        ownerName: editAccOwner.trim(),
        email: editAccEmail.trim(),
        phone: editAccPhone.trim(),
        plan: editAccPlan,
        notes: editAccNotes.trim(),
      });
      setEditAccModalOpen(false);
      setEditingAccount(null);
      setAccounts(await fetchAdminAccounts());
      showToast(`Agency "${editAccName}" updated successfully.`);
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  };

  const openQuotaBoxDialog = (acc: AdminAccount) => {
    setTargetQuotaAccount(acc);
    setQuotaModalLimitInput(acc.whatsappLimit.toString());
    setQuotaModalWarningInput(Math.round(acc.whatsappLimit * 0.8).toString());
    setQuotaModalCriticalInput(Math.round(acc.whatsappLimit * 0.95).toString());
    setQuotaModalResetUsage(false);
    setQuotaModalOpen(true);
  };

  const handleSaveAccountQuotaBox = async () => {
    if (!targetQuotaAccount) return;
    const limitNum = parseInt(quotaModalLimitInput, 10);
    if (isNaN(limitNum) || limitNum < 10) {
      showToast("Limit must be at least 10 messages.", "error");
      return;
    }
    try {
      await updateAccountWhatsAppLimit(targetQuotaAccount.id, limitNum);
      if (quotaModalResetUsage) resetWhatsAppUsage(currentUser?.name || "Master Admin");
      setQuotaModalOpen(false);
      setTargetQuotaAccount(null);
      setAccounts(await fetchAdminAccounts());
      setQuota(getStoredQuota());
      showToast(`WhatsApp limit for "${targetQuotaAccount.name}" set to ${limitNum.toLocaleString()}.`);
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  };

  const openBlockDialog = (acc: AdminAccount) => {
    setTargetAccount(acc);
    setBlockReason(acc.blockReason || "");
    setBlockModalOpen(true);
  };

  const handleConfirmAccountStatus = async (status: "ACTIVE" | "BLOCKED" | "SUSPENDED") => {
    if (!targetAccount) return;
    try {
      await toggleAccountStatus(targetAccount.id, status, blockReason);
      setBlockModalOpen(false);
      setTargetAccount(null);
      setAccounts(await fetchAdminAccounts());
      showToast(`Account status changed to ${status}.`);
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  };

  const handleCreateAccount = async (e: FormEvent) => {
    e.preventDefault();
    if (!newAccName.trim() || !newAccEmail.trim()) {
      showToast("Agency name and email are required.", "error");
      return;
    }
    try {
      const created = await addNewAccount({
        name: newAccName.trim(),
        ownerName: newAccOwner.trim() || "Agency Admin",
        email: newAccEmail.trim(),
        phone: newAccPhone.trim() || undefined,
        whatsappMonthlyLimit: newAccLimit,
      });
      setNewAccModalOpen(false);
      setNewAccName("");
      setNewAccOwner("");
      setNewAccEmail("");
      setNewAccPhone("");
      setAccounts(await fetchAdminAccounts());
      // The initial password is generated server-side and shown exactly once. Losing it means
      // resetting the account, so it is surfaced explicitly rather than silently discarded.
      if (created.initialPassword) {
        showToast(
          `Tenant created. One-time admin password for ${created.admin?.email ?? newAccEmail}: ${created.initialPassword}`,
          "success",
        );
      } else {
        showToast(`Tenant "${created.name}" created.`);
      }
    } catch (err) {
      showToast((err as Error).message, "error");
    }
};

  // ─────────────────────────────────────────────────────────────────────────────
  // Company actions
  // ─────────────────────────────────────────────────────────────────────────────
  const openEditCompanyDialog = (company: Company) => {
    setEditingCompany(company);
    setEditCompName(company.name);
    setEditCompCode(company.code);
    setEditCompBranchId(company.branchId || "branch-dxb");
    setEditCompIndustry(company.industry);
    setEditCompContact(company.contactPerson);
    setEditCompEmail(company.email);
    setEditCompPhone(company.phone);
    setEditCompAddress(company.address);
    setEditCompCreditLimit(company.creditLimit);
    setEditCompPaymentTerms(company.paymentTerms);
    setEditCompCostCenter(company.defaultCostCenter);
    setEditCompStatus(company.status || "ACTIVE");
    setEditCompModalOpen(true);
  };

  const handleSaveCompany = (e: FormEvent) => {
    e.preventDefault();
    if (!editingCompany) return;
    const matchedBranch = branches.find((b) => b.id === editCompBranchId);
    saveCompany({
      ...editingCompany,
      name: editCompName.trim(),
      code: editCompCode.trim().toUpperCase(),
      branchId: editCompBranchId,
      branchName: matchedBranch ? matchedBranch.name : editingCompany.branchName,
      industry: editCompIndustry.trim(),
      contactPerson: editCompContact.trim(),
      email: editCompEmail.trim(),
      phone: editCompPhone.trim(),
      address: editCompAddress.trim(),
      creditLimit: Number(editCompCreditLimit) || 100000,
      paymentTerms: editCompPaymentTerms,
      defaultCostCenter: editCompCostCenter.trim() || "CC-CORP",
      status: editCompStatus,
    });
    setEditCompModalOpen(false);
    setEditingCompany(null);
    setCompanies(getStoredCompanies());
    showToast(`Company "${editCompName}" updated and saved.`);
  };

  const handleCreateCompany = (e: FormEvent) => {
    e.preventDefault();
    if (!newCompName.trim()) {
      showToast("Company name is required.", "error");
      return;
    }
    const matchedBranch = branches.find((b) => b.id === newCompBranchId);
    const newId = `comp-${Date.now().toString(36)}`;
    saveCompany({
      id: newId,
      name: newCompName.trim(),
      code: newCompCode.trim().toUpperCase() || `CORP-${newId.slice(-4).toUpperCase()}`,
      branchId: newCompBranchId,
      branchName: matchedBranch?.name || "Dubai Flagship Headquarters",
      industry: newCompIndustry.trim() || "Corporate Services",
      contactPerson: newCompContact.trim() || "Corporate Travel Lead",
      email: newCompEmail.trim() || "traveldesk@client.com",
      phone: newCompPhone.trim() || "+971 4 000 0000",
      address: newCompAddress.trim() || "Corporate Office, UAE",
      creditLimit: Number(newCompCreditLimit) || 100000,
      outstandingBalance: 0,
      paymentTerms: "Net 30 Days",
      defaultCostCenter: "CC-CORP-01",
      totalBookings: 0,
      activeEmployees: 10,
      monthlySpend: 0,
      lastBookingDate: new Date().toISOString().split("T")[0],
      status: "ACTIVE",
    });
    setNewCompModalOpen(false);
    setNewCompName("");
    setNewCompCode("");
    setNewCompContact("");
    setNewCompEmail("");
    setNewCompPhone("");
    setNewCompAddress("");
    setCompanies(getStoredCompanies());
    showToast(`Company "${newCompName.trim()}" created successfully.`);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Branch actions: Add & Edit
  // ─────────────────────────────────────────────────────────────────────────────
  const openEditBranchDialog = (branch: Branch) => {
    setEditingBranch(branch);
    setEditBranchName(branch.name);
    setEditBranchCode(branch.code);
    setEditBranchCity(branch.city);
    setEditBranchCountry(branch.country);
    setEditBranchAddress(branch.address);
    setEditBranchManager(branch.managerName);
    setEditBranchEmail(branch.managerEmail);
    setEditBranchPhone(branch.phone);
    setEditBranchStatus(branch.status || "ACTIVE");
    setEditBranchNotes(branch.notes || "");
    setEditBranchModalOpen(true);
  };

  const handleSaveBranch = (e: FormEvent) => {
    e.preventDefault();
    if (!editingBranch) return;
    saveBranch({
      ...editingBranch,
      name: editBranchName.trim(),
      code: editBranchCode.trim().toUpperCase(),
      city: editBranchCity.trim(),
      country: editBranchCountry.trim(),
      address: editBranchAddress.trim(),
      managerName: editBranchManager.trim(),
      managerEmail: editBranchEmail.trim(),
      phone: editBranchPhone.trim(),
      status: editBranchStatus,
      notes: editBranchNotes.trim(),
    });
    setEditBranchModalOpen(false);
    setEditingBranch(null);
    setBranches(getStoredBranches());
    showToast(`Branch "${editBranchName}" updated and saved.`);
  };

  const handleCreateBranch = (e: FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim() || !newBranchCity.trim()) {
      showToast("Branch name and city are required.", "error");
      return;
    }
    const newId = `branch-${Date.now().toString(36)}`;
    saveBranch({
      id: newId,
      name: newBranchName.trim(),
      code: newBranchCode.trim().toUpperCase() || `BR-${newBranchCity.slice(0, 3).toUpperCase()}`,
      city: newBranchCity.trim(),
      country: newBranchCountry.trim() || "International",
      address: newBranchAddress.trim() || "Regional Business Center",
      managerName: newBranchManager.trim() || "Branch Manager",
      managerEmail: newBranchEmail.trim() || "branch@blueauratravel.com",
      phone: newBranchPhone.trim() || "+971 50 000 0000",
      status: "ACTIVE",
      notes: newBranchNotes.trim() || "Configured via Master Admin Control Center",
    });
    setNewBranchModalOpen(false);
    setNewBranchName("");
    setNewBranchCode("");
    setNewBranchCity("");
    setNewBranchCountry("");
    setNewBranchAddress("");
    setNewBranchManager("");
    setNewBranchPhone("");
    setNewBranchEmail("");
    setNewBranchNotes("");
    setBranches(getStoredBranches());
    showToast(`Branch "${newBranchName.trim()}" added successfully.`);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // WhatsApp actions
  // ─────────────────────────────────────────────────────────────────────────────
  const handleSaveCustomLimits = () => {
    const limitNum = parseInt(customLimitInput, 10);
    const warningNum = parseInt(customWarningInput, 10);
    const criticalNum = parseInt(customCriticalInput, 10);
    if (isNaN(limitNum) || limitNum < 10) {
      setQuotaFeedback("Limit must be at least 10.");
      return;
    }
    setWhatsAppCustomLimits(limitNum, warningNum, criticalNum);
    setQuota(getStoredQuota());
    setQuotaFeedback(`Quota updated to ${limitNum.toLocaleString()} messages.`);
    setTimeout(() => setQuotaFeedback(""), 4000);
  };

  const handleAddCredits = (credits: number) => {
    addWhatsAppQuotaCredits(credits);
    setQuota(getStoredQuota());
    setQuotaFeedback(`+${credits.toLocaleString()} credits added.`);
    setTimeout(() => setQuotaFeedback(""), 4000);
  };

  const handleResetUsage = () => {
    resetWhatsAppUsage();
    setQuota(getStoredQuota());
    setQuotaFeedback("Usage reset to 0.");
    setTimeout(() => setQuotaFeedback(""), 4000);
  };

  const handleToggleKillSwitch = () => {
    const newPaused = !Boolean(quota.isGloballyPaused);
    toggleWhatsAppGlobalPause(newPaused, killSwitchReason || "Master Admin Emergency Maintenance");
    setKillSwitchReason("");
    setQuota(getStoredQuota());
    setQuotaFeedback(newPaused ? "Kill switch ACTIVATED — all outbound WhatsApp paused." : "WhatsApp messaging resumed.");
    setTimeout(() => setQuotaFeedback(""), 4000);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Diagnostics actions
  // ─────────────────────────────────────────────────────────────────────────────
  const handleRetryDiagnostic = async (id: string) => {
    setRetryActionMsg({ id, text: "Dispatching self-healing retry..." });
    const res = await retryDiagnosticAction(id);
    setRetryActionMsg({ id, text: res.message });
    setDiagnostics(getDiagnosticErrors());
    setTimeout(() => setRetryActionMsg(null), 4000);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: Loading
  // ─────────────────────────────────────────────────────────────────────────────
  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-500">Verifying authorization…</p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: Login gate (light theme)
  // ─────────────────────────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    const attemptsLeft = MAX_LOGIN_ATTEMPTS - loginAttempts;
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 p-4">
        <div className="w-full max-w-md">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
            <div className="mb-8 flex flex-col items-center text-center">
              <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-lg shadow-blue-500/30">
                <Shield className="h-8 w-8 text-white stroke-[2]" />
                <span className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white border-2 border-blue-100 text-[11px] font-black text-blue-600 shadow">
                  ★
                </span>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-slate-800">Master Admin</h1>
              <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-blue-600">
                Blue Aura Control Center
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Restricted to platform owner · <span className="font-semibold text-slate-600">Garv Kataria</span>
              </p>
            </div>

            {isLocked && (
              <div className="mb-5 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <Lock className="h-5 w-5 text-rose-500 shrink-0" />
                <div>
                  <p className="text-xs font-black text-rose-700">Account Locked</p>
                  <p className="text-xs text-rose-500 mt-0.5">
                    Unlocks in{" "}
                    <span className="font-mono font-black">
                      {Math.floor(lockoutCountdown / 60)}:{String(lockoutCountdown % 60).padStart(2, "0")}
                    </span>
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleMasterLogin} className="space-y-4" autoComplete="off">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Email Address
                </label>
                <div
                  className={`flex h-12 items-center rounded-xl border bg-slate-50 px-3.5 transition-all ${
                    isLocked
                      ? "opacity-50"
                      : "focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 border-slate-200"
                  }`}
                >
                  <KeyRound className="h-4 w-4 text-slate-400 mr-2.5 shrink-0" />
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full bg-transparent text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
                    required
                    disabled={isLocked}
                    autoComplete="off"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Password
                </label>
                <div
                  className={`flex h-12 items-center rounded-xl border bg-slate-50 px-3.5 transition-all ${
                    isLocked
                      ? "opacity-50"
                      : "focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 border-slate-200"
                  }`}
                >
                  <Lock className="h-4 w-4 text-slate-400 mr-2.5 shrink-0" />
                  <input
                    type={showPass ? "text" : "password"}
                    value={loginPass}
                    onChange={(e) => setLoginPass(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-transparent text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed flex-1"
                    required
                    disabled={isLocked}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    disabled={isLocked}
                    className="text-slate-400 hover:text-slate-600 ml-1"
                  >
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {loginErr && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                  <p className="text-xs font-semibold text-rose-700">{loginErr}</p>
                </div>
              )}

              {loginAttempts > 0 && !isLocked && (
                <div className="flex items-center justify-center gap-1.5">
                  {Array.from({ length: MAX_LOGIN_ATTEMPTS }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 w-6 rounded-full transition-all ${
                        i < loginAttempts ? "bg-rose-400" : "bg-slate-200"
                      }`}
                    />
                  ))}
                  <span className="ml-1 text-[11px] font-bold text-slate-400">{attemptsLeft} left</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loginLoading || isLocked}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 text-sm font-extrabold text-white shadow-lg shadow-blue-500/25 transition hover:from-blue-500 hover:to-indigo-600 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShieldCheck className="h-4 w-4" />
                {loginLoading ? "Verifying…" : isLocked ? "Locked — Try Later" : "Access Control Center"}
              </button>
            </form>

            <div className="mt-6 border-t border-slate-100 pt-5 text-center">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600 transition"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Return to Agency CRM
              </Link>
            </div>
          </div>

          <p className="mt-4 text-center text-[11px] text-slate-400">
            Protected by SUPER_ADMIN role guard · Edge Middleware · Brute-force lockout
          </p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: Authenticated — Light Admin Control Center
  // ─────────────────────────────────────────────────────────────────────────────
  const TABS: { id: AdminTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "accounts", label: "Agencies & Accounts", icon: <Users className="h-4 w-4" />, badge: accounts.length },
    { id: "staff", label: "Staff, Roles & Bookings", icon: <UserCheck className="h-4 w-4" />, badge: getStoredStaff().length },
    { id: "branches", label: "Branches & Clients", icon: <Building2 className="h-4 w-4" />, badge: branches.length },
    { id: "whatsapp", label: "WhatsApp Quota", icon: <MessageSquare className="h-4 w-4" /> },
    {
      id: "diagnostics",
      label: "Live Error Hub",
      icon: <AlertTriangle className="h-4 w-4" />,
      badge: unresolvedErrorsCount > 0 ? unresolvedErrorsCount : undefined,
    },
    { id: "system", label: "System & Logs", icon: <Server className="h-4 w-4" /> },
    {
      id: "recycle",
      label: "Recycle Bin (30d)",
      icon: <Trash2 className="h-4 w-4" />,
      badge: recycleBin.length > 0 ? recycleBin.length : undefined,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 selection:bg-blue-100 selection:text-blue-700">
      {/* ── Toast ─────────────────────────────────────────────────────────────── */}
      {toastMsg && (
        <div
          className={`fixed bottom-6 right-6 z-[100] flex items-center gap-2.5 rounded-2xl border px-5 py-3 text-xs font-bold shadow-xl animate-in fade-in slide-in-from-bottom-4 ${
            toastType === "error"
              ? "border-rose-200 bg-white text-rose-700"
              : "border-emerald-200 bg-white text-emerald-700"
          }`}
        >
          {toastType === "error" ? (
            <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          )}
          <span>{toastMsg}</span>
        </div>
      )}

      {/* ── Emergency Kill Banner ─────────────────────────────────────────────── */}
      {quota.isGloballyPaused && (
        <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-center text-xs font-bold text-rose-700 flex items-center justify-center gap-2">
          <AlertOctagon className="h-4 w-4 text-rose-500 animate-pulse" />
          <span>KILL SWITCH ACTIVE: All WhatsApp dispatch paused across all agencies.</span>
          <button
            onClick={handleToggleKillSwitch}
            className="ml-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-3 py-0.5 text-[11px] font-extrabold transition"
          >
            Resume
          </button>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-md shadow-blue-500/30">
              <Shield className="h-5 w-5 text-white stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black tracking-tight text-slate-800">
                  Blue Aura <span className="text-blue-600">Master Admin</span>
                </span>
                <span className="hidden sm:inline rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-black uppercase text-blue-600">
                  Control Center
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Signed in as <span className="font-bold text-slate-700">{currentUser?.name || "Garv Kataria"}</span>
                <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[9px] font-black uppercase text-emerald-600">
                  <ShieldCheck className="h-2.5 w-2.5" /> SUPER_ADMIN
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDriveModalOpen(true)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-extrabold shadow-xs transition ${
                driveStatus?.destination && !driveStatus.destination.broken
                  ? "border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100/80"
                  : "border-blue-200 bg-white text-slate-800 hover:border-blue-400 hover:bg-blue-50/40"
              }`}
              title="Connect Google account via popup for Drive backups"
            >
              <GoogleGLogo className="h-3.5 w-3.5 shrink-0" />
              {driveStatus?.destination && !driveStatus.destination.broken ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="max-w-[160px] truncate">{driveStatus.destination.accountEmail}</span>
                </>
              ) : (
                <span>Sign in with Google</span>
              )}
            </button>

            <button
              onClick={refreshData}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition"
              title="Refresh all data"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <Link
              href="/dashboard"
              className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition"
            >
              <span>Agency CRM</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
            </Link>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg bg-rose-50 border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-100 transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* ── KPI Cards ─────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <KpiCard
            label="Total Agencies"
            value={accounts.length}
            sub={`${activeTenantsCount} active · ${blockedTenantsCount} blocked`}
            icon={<Users className="h-5 w-5 text-blue-600" />}
            accent="bg-blue-50"
          />
          <KpiCard
            label="Branches & Clients"
            value={branches.length}
            sub={`${companies.length} corporate clients`}
            icon={<Building2 className="h-5 w-5 text-violet-600" />}
            accent="bg-violet-50"
          />
          <KpiCard
            label="WhatsApp Quota"
            value={`${quota.used.toLocaleString()} / ${quota.limit.toLocaleString()}`}
            sub={`${quotaStatus.percent}% used · ${quotaStatus.status}`}
            icon={<MessageSquare className="h-5 w-5 text-emerald-600" />}
            accent="bg-emerald-50"
          />
          <KpiCard
            label="Active Alerts"
            value={unresolvedErrorsCount}
            sub={`${criticalErrorsCount} critical`}
            icon={<AlertTriangle className="h-5 w-5 text-rose-500" />}
            accent="bg-rose-50"
          />
          <KpiCard
            label="Recycle Bin (30d)"
            value={recycleBin.length}
            sub="Auto-purge after 30 days"
            icon={<Trash2 className="h-5 w-5 text-amber-600" />}
            accent="bg-amber-50"
          />
        </div>

        {/* ── Tabs Navigation ───────────────────────────────────────────────────── */}
        <div className="mt-8 border-b border-slate-200">
          <nav className="flex items-center gap-1 overflow-x-auto pb-px">
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-2 rounded-t-xl px-4 py-2.5 text-xs font-bold transition whitespace-nowrap ${
                    active
                      ? "bg-white border border-b-white border-slate-200 text-blue-600 -mb-px shadow-sm"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-100/60"
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                        active
                          ? tab.id === "recycle"
                            ? "bg-amber-100 text-amber-700"
                            : tab.id === "diagnostics" && tab.badge > 0
                            ? "bg-rose-100 text-rose-600"
                            : "bg-blue-100 text-blue-600"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: AGENCIES & ACCOUNTS                                             */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "accounts" && (
          <section className="mt-6 space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-blue-600" /> Tenant & Agency Management
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Full 360° inspection, live edit, WhatsApp limits, and 30-day protected soft delete.
                </p>
              </div>
              <button
                onClick={() => setNewAccModalOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-blue-700 transition"
              >
                <Plus className="h-4 w-4" /> Register New Agency
              </button>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 min-w-[220px]">
                <Search className="h-4 w-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  placeholder="Search agencies by name, email, owner, or ID…"
                  className="w-full bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
                />
                {accountSearch && (
                  <button onClick={() => setAccountSearch("")} className="text-slate-400 hover:text-slate-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
                {(["ALL", "ACTIVE", "BLOCKED", "SUSPENDED"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setAccountFilter(f)}
                    className={`rounded-lg px-3 py-1 text-xs font-bold transition ${
                      accountFilter === f ? "bg-white shadow text-slate-800" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <span className="text-xs text-slate-400 font-medium">
                {filteredAccounts.length} of {accounts.length} agencies
              </span>
            </div>

            {/* Accounts Table */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">Agency Details</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">Owner & Contact</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">Plan & Branch</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">WhatsApp Usage</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAccounts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                          <Users className="h-8 w-8 mx-auto mb-2 stroke-[1.5]" />
                          <p className="text-sm font-semibold">No agencies match your filter.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredAccounts.map((acc) => {
                        const isBlocked = acc.status !== "ACTIVE";
                        const usagePct =
                          acc.whatsappLimit > 0 ? Math.round((acc.whatsappUsed / acc.whatsappLimit) * 100) : 0;
                        return (
                          <tr key={acc.id} className={`transition hover:bg-slate-50/80 ${isBlocked ? "opacity-85" : ""}`}>
                            <td className="px-4 py-3.5">
                              <div className="font-bold text-slate-800 text-sm">{acc.name}</div>
                              <div className="text-[11px] text-slate-400 mt-0.5 font-mono">{acc.id}</div>
                              {acc.notes && (
                                <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1 italic">{acc.notes}</div>
                              )}
                            </td>

                            <td className="px-4 py-3.5">
                              <div className="font-semibold text-slate-700">{acc.ownerName}</div>
                              <div className="text-[11px] text-slate-500">{acc.email}</div>
                              <div className="text-[11px] text-slate-400">{formatPhoneDisplay(acc.phone)}</div>
                            </td>

                            <td className="px-4 py-3.5">
                              <PlanBadge plan={acc.plan} />
                              <div className="text-[11px] text-slate-500 mt-1">{acc.branchName || "Dubai HQ"}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5">{acc.totalBookings || 0} total bookings</div>
                            </td>

                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-1 font-bold text-slate-700">
                                <MessageSquare className="h-3.5 w-3.5 text-emerald-500" />
                                <span>{acc.whatsappUsed.toLocaleString()} / {acc.whatsappLimit.toLocaleString()}</span>
                              </div>
                              <div className="mt-1.5 h-1.5 w-full max-w-[100px] rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    usagePct >= 95 ? "bg-rose-500" : usagePct >= 80 ? "bg-amber-500" : "bg-emerald-500"
                                  }`}
                                  style={{ width: `${Math.min(100, usagePct)}%` }}
                                />
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">{usagePct}% consumed</div>
                            </td>

                            <td className="px-4 py-3.5">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold border ${
                                  acc.status === "ACTIVE"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : acc.status === "BLOCKED"
                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                    : "bg-amber-50 text-amber-700 border-amber-200"
                                }`}
                              >
                                <StatusDot status={acc.status} />
                                {acc.status}
                              </span>
                              {isBlocked && acc.blockReason && (
                                <div className="mt-1 text-[10px] text-slate-500 max-w-[150px] truncate" title={acc.blockReason}>
                                  {acc.blockReason}
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3.5">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* View Details */}
                                <button
                                  onClick={() => setViewAccount(acc)}
                                  className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition shadow-sm"
                                  title="360° Agency Dossier"
                                >
                                  <Eye className="h-3.5 w-3.5 text-slate-500" />
                                  <span>View</span>
                                </button>

                                {/* Edit */}
                                <button
                                  onClick={() => openEditAgencyDialog(acc)}
                                  className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition shadow-sm"
                                  title="Edit agency details"
                                >
                                  <Pencil className="h-3.5 w-3.5 text-blue-500" />
                                  <span>Edit</span>
                                </button>

                                {/* Quota */}
                                <button
                                  onClick={() => openQuotaBoxDialog(acc)}
                                  className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition shadow-sm"
                                  title="Adjust WhatsApp quota"
                                >
                                  <Sliders className="h-3.5 w-3.5 text-emerald-600" />
                                  <span>Quota</span>
                                </button>

                                {/* Block / Restore */}
                                {isBlocked ? (
                                  <button
                                    onClick={() => {
                                      setTargetAccount(acc);
                                      handleConfirmAccountStatus("ACTIVE");
                                    }}
                                    className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition shadow-sm"
                                    title="Restore access"
                                  >
                                    <Unlock className="h-3.5 w-3.5" />
                                    <span>Restore</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => openBlockDialog(acc)}
                                    className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition shadow-sm"
                                    title="Suspend or block agency"
                                  >
                                    <Ban className="h-3.5 w-3.5" />
                                    <span>Block</span>
                                  </button>
                                )}

                                {/* Delete to 30-Day Recycle Bin */}
                                <button
                                  onClick={() =>
                                    initiateDeleteToBin(
                                      "ACCOUNT",
                                      acc.id,
                                      acc.name,
                                      `${acc.plan} Plan · ${acc.ownerName} · ${acc.email}`,
                                      acc
                                    )
                                  }
                                  className="flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:text-rose-600 hover:border-rose-200 transition shadow-sm"
                                  title="Move to 30-day Recycle Bin"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* TAB 1B: STAFF, ROLES, SEPARATE LOGINS & BOOKING PERFORMANCE             */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "staff" && (
          <section className="mt-6">
            <StaffRoleManager onRecycleBinChange={() => setRecycleBin(getRecycleBinItems())} />
          </section>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: BRANCHES & CORPORATE CLIENTS                                    */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "branches" && (
          <section className="mt-6 space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-violet-600" /> Regional Branches & Corporate Network
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Manage geographical hubs, assigned corporate clients, credit limits, and branch managers.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setNewBranchModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition shadow-sm"
                >
                  <Plus className="h-4 w-4 text-violet-500" /> Add Regional Branch
                </button>
                <button
                  onClick={() => setNewCompModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-violet-700 transition"
                >
                  <Plus className="h-4 w-4" /> Add Corporate Client
                </button>
              </div>
            </div>

            {/* Branch Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {branches.map((b) => {
                const count = branchCompanyCounts[b.id] || 0;
                const isSelected = selectedBranchFilter === b.id;
                return (
                  <div
                    key={b.id}
                    className={`rounded-2xl border p-5 transition-all shadow-sm hover:shadow-md ${
                      isSelected
                        ? "border-violet-300 bg-violet-50/70 ring-2 ring-violet-200"
                        : "border-slate-200 bg-white hover:border-violet-200"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div
                        onClick={() => setSelectedBranchFilter(isSelected ? "ALL" : b.id)}
                        className="cursor-pointer flex items-center gap-3"
                      >
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                            isSelected ? "bg-violet-100" : "bg-slate-100"
                          }`}
                        >
                          <Building className={`h-5 w-5 ${isSelected ? "text-violet-600" : "text-slate-500"}`} />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-800 text-sm hover:text-violet-600 transition">{b.name}</h3>
                          <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                            <MapPin className="h-3 w-3" /> {b.city}, {b.country}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-black ${
                          isSelected ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {count} {count === 1 ? "Client" : "Clients"}
                      </span>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Lead: <b className="text-slate-700">{b.managerName}</b></span>
                      <span>{formatPhoneDisplay(b.phone)}</span>
                    </div>

                    {/* Branch Actions */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100/70 flex items-center justify-between">
                      <button
                        onClick={() => setViewBranch(b)}
                        className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700"
                      >
                        <Eye className="h-3 w-3" /> Inspect Hub
                      </button>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openEditBranchDialog(b)}
                          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 transition"
                        >
                          <Pencil className="h-3 w-3 text-violet-500" /> Edit
                        </button>
                        <button
                          onClick={() =>
                            initiateDeleteToBin(
                              "BRANCH",
                              b.id,
                              b.name,
                              `${b.city}, ${b.country} · Manager: ${b.managerName}`,
                              b
                            )
                          }
                          className="flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1 text-slate-400 hover:text-rose-600 hover:border-rose-200 transition"
                          title="Move branch to 30-day Recycle Bin"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Company Search & Filter */}
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 min-w-[200px]">
                <Search className="h-4 w-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={companySearchQuery}
                  onChange={(e) => setCompanySearchQuery(e.target.value)}
                  placeholder="Search corporate clients by name, code, contact or industry…"
                  className="w-full bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
                />
                {companySearchQuery && (
                  <button onClick={() => setCompanySearchQuery("")} className="text-slate-400 hover:text-slate-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setSelectedBranchFilter("ALL")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    selectedBranchFilter === "ALL"
                      ? "bg-violet-600 text-white"
                      : "border border-slate-200 bg-white text-slate-500 hover:text-slate-700"
                  }`}
                >
                  All Hubs ({companies.length})
                </button>
                {branches.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBranchFilter(b.id)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                      selectedBranchFilter === b.id
                        ? "bg-violet-600 text-white"
                        : "border border-slate-200 bg-white text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {b.city} ({branchCompanyCounts[b.id] || 0})
                  </button>
                ))}
              </div>
            </div>

            {/* Companies Table */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">Company</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">Assigned Hub</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">Industry & Cost Center</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">Contact Person</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">Credit Terms</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCompanies.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                          <Building2 className="h-8 w-8 mx-auto mb-2 stroke-[1.5]" />
                          <p className="text-sm font-semibold">No companies match your filter.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredCompanies.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/70 transition">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 text-sm">{c.name}</span>
                              <span className="rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 font-bold">
                                {c.code}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{c.address}</div>
                          </td>

                          <td className="px-4 py-3.5">
                            <span className="inline-flex items-center gap-1 rounded-lg bg-violet-50 border border-violet-200 px-2.5 py-1 text-xs font-bold text-violet-700">
                              <Building2 className="h-3.5 w-3.5" /> {c.branchName || "Dubai HQ"}
                            </span>
                          </td>

                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-slate-700">{c.industry}</div>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5">{c.defaultCostCenter}</div>
                          </td>

                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-slate-700">{c.contactPerson}</div>
                            <div className="text-[11px] text-slate-500">{c.email}</div>
                            <div className="text-[11px] text-slate-400">{formatPhoneDisplay(c.phone)}</div>
                          </td>

                          <td className="px-4 py-3.5">
                            <div className="font-bold text-slate-800">{c.creditLimit.toLocaleString()} AED</div>
                            <div className="text-[11px] text-amber-600 font-semibold mt-0.5">{c.paymentTerms}</div>
                          </td>

                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* View Details */}
                              <button
                                onClick={() => setViewCompany(c)}
                                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition shadow-sm"
                                title="View corporate client details"
                              >
                                <Eye className="h-3.5 w-3.5 text-slate-500" /> View
                              </button>

                              {/* Edit */}
                              <button
                                onClick={() => openEditCompanyDialog(c)}
                                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition shadow-sm"
                              >
                                <Pencil className="h-3.5 w-3.5 text-violet-500" /> Edit
                              </button>

                              {/* Delete to 30-Day Recycle Bin */}
                              <button
                                onClick={() =>
                                  initiateDeleteToBin(
                                    "COMPANY",
                                    c.id,
                                    c.name,
                                    `Code: ${c.code} · ${c.branchName || "Dubai HQ"} · ${c.contactPerson}`,
                                    c
                                  )
                                }
                                className="flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:text-rose-600 hover:border-rose-200 transition shadow-sm"
                                title="Move company to 30-day Recycle Bin"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* TAB 3: WHATSAPP QUOTA                                                  */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "whatsapp" && (
          <section className="mt-6 space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-emerald-600" /> WhatsApp Quota Master Controller
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Set limits, add instant credits, simulate states, and control global dispatch.
                </p>
              </div>
              {quotaFeedback && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700">
                  {quotaFeedback}
                </div>
              )}
            </div>

            {/* Quota Progress Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Current Quota State</p>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="text-3xl font-black text-slate-800">{quota.used.toLocaleString()}</span>
                    <span className="text-sm font-semibold text-slate-400">
                      / {quota.limit.toLocaleString()} messages used
                    </span>
                  </div>
                </div>
                <span
                  className={`rounded-full px-4 py-1.5 text-xs font-black uppercase tracking-wide ${
                    quotaStatus.isBlocked
                      ? "bg-rose-100 text-rose-700"
                      : quotaStatus.isCritical
                      ? "bg-amber-100 text-amber-700"
                      : quotaStatus.isWarning
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {quotaStatus.status} — {quotaStatus.percent}%
                </span>
              </div>

              <div className="mt-5 h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    quotaStatus.isBlocked ? "bg-rose-500" : quotaStatus.isCritical ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.min(100, quotaStatus.percent)}%` }}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                <span>Remaining: <b className="text-slate-700">{quotaStatus.remaining.toLocaleString()}</b></span>
                <span>Warning at: <b className="text-amber-600">{quota.warningThreshold.toLocaleString()}</b></span>
                <span>Critical at: <b className="text-rose-600">{quota.criticalThreshold.toLocaleString()}</b></span>
                <span>Hard stop: <b className="text-rose-700">{quota.limit.toLocaleString()}</b></span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Set Limits */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-emerald-600" /> Set Custom Quota Limits
                </h3>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Max Message Limit</label>
                  <input
                    type="number"
                    value={customLimitInput}
                    onChange={(e) => setCustomLimitInput(e.target.value)}
                    placeholder="e.g. 1000"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">Warning Threshold</label>
                    <input
                      type="number"
                      value={customWarningInput}
                      onChange={(e) => setCustomWarningInput(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">Critical Threshold</label>
                    <input
                      type="number"
                      value={customCriticalInput}
                      onChange={(e) => setCustomCriticalInput(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-rose-400"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="text-xs text-slate-400 self-center">Presets:</span>
                  {[1000, 2500, 5000, 10000, 25000].map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        setCustomLimitInput(p.toString());
                        setCustomWarningInput(Math.round(p * 0.8).toString());
                        setCustomCriticalInput(Math.round(p * 0.95).toString());
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 hover:border-emerald-300 hover:text-emerald-700 transition"
                    >
                      {p.toLocaleString()}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleSaveCustomLimits}
                  className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-extrabold text-white shadow hover:bg-emerald-700 transition"
                >
                  Apply New Quota Settings
                </button>
              </div>

              {/* Credits & Usage */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-blue-600" /> Instant Credits & Usage Control
                </h3>

                <div>
                  <p className="text-xs font-bold text-slate-500 mb-2">Add Instant Extension:</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[250, 500, 1000, 5000].map((c) => (
                      <button
                        key={c}
                        onClick={() => handleAddCredits(c)}
                        className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-center hover:bg-emerald-100 transition"
                      >
                        <div className="text-sm font-black text-emerald-700">+{c >= 1000 ? `${c / 1000}k` : c}</div>
                        <div className="text-[10px] text-slate-500">credits</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs font-bold text-slate-500 mb-2">Simulate State (Testing):</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Normal (250)", val: 250 },
                      { label: "Warning (800)", val: 800 },
                      { label: "Critical (950)", val: 950 },
                      { label: "Locked (1000)", val: 1000 },
                    ].map((sim) => (
                      <button
                        key={sim.label}
                        onClick={() => {
                          setSimulationUsage(sim.val);
                          setQuota(getStoredQuota());
                        }}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600 hover:border-slate-300 hover:text-slate-800 transition text-left"
                      >
                        {sim.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                  <button
                    onClick={handleResetUsage}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition shadow-sm"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Reset to Zero
                  </button>
                  <span className="text-[11px] text-slate-400">Monthly cycle resets</span>
                </div>
              </div>
            </div>

            {/* Kill Switch */}
            <div
              className={`rounded-2xl border p-6 ${
                quota.isGloballyPaused ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <AlertOctagon
                      className={`h-5 w-5 ${quota.isGloballyPaused ? "text-rose-600 animate-pulse" : "text-slate-400"}`}
                    />
                    <h3
                      className={`text-sm font-black uppercase tracking-wide ${
                        quota.isGloballyPaused ? "text-rose-700" : "text-slate-700"
                      }`}
                    >
                      Emergency Global Kill Switch
                    </h3>
                  </div>
                  <p className={`text-xs max-w-xl ${quota.isGloballyPaused ? "text-rose-600" : "text-slate-500"}`}>
                    {quota.isGloballyPaused
                      ? "ACTIVE: All outbound WhatsApp dispatch frozen across all agencies."
                      : "Freeze all outbound WhatsApp messages instantly across all tenant agencies in case of emergency."}
                  </p>
                </div>
                <button
                  onClick={handleToggleKillSwitch}
                  className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-wide shadow transition ${
                    quota.isGloballyPaused
                      ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200"
                      : "bg-rose-600 text-white hover:bg-rose-700 shadow-rose-200"
                  }`}
                >
                  <Power className="h-4 w-4" />
                  {quota.isGloballyPaused ? "Resume All Dispatch" : "Activate Kill Switch"}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* TAB 4: LIVE ERROR HUB & DIAGNOSTICS                                   */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "diagnostics" && (
          <section className="mt-6 space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-rose-500" /> Live Error Hub & Diagnostics
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Real-time monitor for WhatsApp, auth, database, and quota delivery issues.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    simulateDiagnosticError("WHATSAPP");
                    setDiagnostics(getDiagnosticErrors());
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100 transition"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Simulate Error
                </button>
                <button
                  onClick={() => {
                    clearResolvedDiagnostics();
                    setDiagnostics(getDiagnosticErrors());
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition shadow-sm"
                >
                  <Check className="h-3.5 w-3.5 text-emerald-500" /> Clear Resolved
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 min-w-[200px]">
                <Search className="h-4 w-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={diagSearch}
                  onChange={(e) => setDiagSearch(e.target.value)}
                  placeholder="Search errors…"
                  className="w-full bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
                />
              </div>
              <select
                value={diagCategoryFilter}
                onChange={(e) => setDiagCategoryFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 outline-none"
              >
                <option value="ALL">All Categories</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="AUTH">Auth</option>
                <option value="DATABASE">Database</option>
                <option value="BILLING">Billing</option>
                <option value="NETWORK">Network</option>
              </select>
              <select
                value={diagSeverityFilter}
                onChange={(e) => setDiagSeverityFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 outline-none"
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="ERROR">Error</option>
                <option value="WARNING">Warning</option>
              </select>
              <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5">
                {(["ALL", "UNRESOLVED", "RESOLVED"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setDiagStatusFilter(s)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                      diagStatusFilter === s ? "bg-white shadow text-slate-800" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Error Cards List */}
            <div className="space-y-3">
              {filteredDiagnostics.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400 mb-3 stroke-[1.5]" />
                  <h3 className="text-base font-bold text-slate-700">All Clear — No Matching Issues</h3>
                  <p className="mt-1 text-xs text-slate-400">All services executing normally.</p>
                </div>
              ) : (
                filteredDiagnostics.map((err) => {
                  const isCrit = err.severity === "CRITICAL";
                  const isErr = err.severity === "ERROR";
                  return (
                    <div
                      key={err.id}
                      className={`rounded-2xl border p-4 transition-all ${
                        err.resolved
                          ? "border-slate-100 bg-slate-50 opacity-60"
                          : isCrit
                          ? "border-rose-200 bg-rose-50 shadow-sm shadow-rose-100"
                          : isErr
                          ? "border-amber-200 bg-amber-50/50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span
                            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                              isCrit
                                ? "bg-rose-500 text-white"
                                : isErr
                                ? "bg-amber-500 text-white"
                                : "bg-yellow-400 text-slate-900"
                            }`}
                          >
                            <AlertTriangle className="h-4 w-4" />
                          </span>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-black text-slate-700">{err.errorCode}</span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${
                                  isCrit
                                    ? "bg-rose-100 text-rose-700"
                                    : isErr
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-yellow-100 text-yellow-700"
                                }`}
                              >
                                {err.severity}
                              </span>
                              <span className="rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                                {err.category}
                              </span>
                              {err.accountName && (
                                <span className="text-[11px] text-slate-400">· {err.accountName}</span>
                              )}
                            </div>
                            <h4 className="mt-1 text-sm font-bold text-slate-800">{err.title}</h4>
                            <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">{err.message}</p>
                            {err.recommendedFix && (
                              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
                                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                                <span>Fix: {err.recommendedFix}</span>
                              </div>
                            )}
                            {retryActionMsg?.id === err.id && (
                              <div className="mt-2 text-xs font-bold text-blue-600 animate-pulse">
                                {retryActionMsg.text}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-row sm:flex-col items-end gap-2 shrink-0">
                          <span className="text-[10px] text-slate-400">
                            {new Date(err.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {err.canRetry && !err.resolved && (
                              <button
                                onClick={() => handleRetryDiagnostic(err.id)}
                                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50 transition shadow-sm"
                              >
                                <RefreshCw className="h-3 w-3" /> Retry
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setSelectedError(err);
                                setInspectModalOpen(true);
                              }}
                              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50 transition shadow-sm"
                            >
                              <Eye className="h-3 w-3" /> Inspect
                            </button>
                            <button
                              onClick={() => {
                                err.resolved
                                  ? unresolveDiagnosticError(err.id)
                                  : resolveDiagnosticError(err.id);
                                setDiagnostics(getDiagnosticErrors());
                              }}
                              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                                err.resolved
                                  ? "border border-slate-200 bg-white text-slate-500 hover:text-slate-700"
                                  : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              }`}
                            >
                              {err.resolved ? "Unresolve" : "Resolve"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* TAB 5: SYSTEM & LOGS                                                   */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "system" && (
          <section className="mt-6 space-y-6">
            <div>
              <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                <Server className="h-5 w-5 text-slate-600" /> System Infrastructure & Security Logs
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Live gateway health, environment telemetry, and action audit trail.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Vercel Edge", value: "Production V2", sub: "Latency: 28ms · Zero cold-starts", status: "green" },
                { label: "Meta WhatsApp API", value: "v19.0 Cloud API", sub: "Webhook: Healthy (200 OK)", status: "green" },
                { label: "Cloud Firestore", value: "traveltourism-32d7d", sub: "Security Rules: Enforced", status: "green" },
                { label: "Auth Guard", value: MASTER_ADMIN_ID, sub: "Role: SUPER_ADMIN verified", status: "amber" },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{item.label}</span>
                    <span
                      className={`h-2 w-2 rounded-full ${item.status === "green" ? "bg-emerald-500" : "bg-amber-400"}`}
                    />
                  </div>
                  <div className="mt-2 text-sm font-extrabold text-slate-800 truncate">{item.value}</div>
                  <p className="mt-0.5 text-[11px] text-slate-400">{item.sub}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/60 via-white to-indigo-50/40 p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-xs">
                    <GoogleGLogo className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-extrabold text-slate-900">
                        Google Drive Backup Account (OAuth Popup)
                      </h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                          driveStatus?.destination && !driveStatus.destination.broken
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {driveStatus?.destination && !driveStatus.destination.broken
                          ? `Connected: ${driveStatus.destination.accountEmail}`
                          : "Not Connected"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Connect a Google account directly via popup to store encrypted FlyConnect backup archives in your Google Drive.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDriveModalOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-extrabold text-slate-800 shadow-xs transition hover:border-blue-400 hover:bg-blue-50/40"
                  >
                    <GoogleGLogo className="h-4 w-4" />
                    {driveStatus?.destination && !driveStatus.destination.broken
                      ? "Manage Google Account"
                      : "Sign in with Google (Popup)"}
                  </button>
                  <Link
                    href="/settings"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-blue-700"
                  >
                    <span>Backup Settings</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2 mb-4">
                <ShieldCheck className="h-4 w-4 text-emerald-600" /> Security Posture & Safeguards
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { label: "Role Guard", value: "SUPER_ADMIN Only" },
                  { label: "Edge Middleware", value: "Signed httpOnly session, server-verified" },
                  { label: "Brute-Force Lockout", value: "5 attempts → 15 min lock" },
                  { label: "JWT Access Tokens", value: "15-minute expiry" },
                  { label: "Refresh Tokens", value: "SHA-256 hashed in DB" },
                  { label: "API SUPER_ADMIN Lock", value: "Cannot be granted via API" },
                  { label: "30-Day Recycle Bin", value: "Zero accidental data loss" },
                  { label: "Multi-Tenant Isolation", value: "businessId scoped queries" },
                  { label: "CSP Headers", value: "Nonce-based strict policy" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-slate-700">{item.label}</p>
                      <p className="text-[11px] text-slate-400">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2 mb-4">
                <Terminal className="h-4 w-4 text-slate-500" /> Master Admin Audit Log
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 text-slate-400">
                    <tr>
                      <th className="py-2.5 font-bold uppercase pr-4">Timestamp</th>
                      <th className="py-2.5 font-bold uppercase pr-4">Action</th>
                      <th className="py-2.5 font-bold uppercase pr-4">User</th>
                      <th className="py-2.5 font-bold uppercase">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600">
                    <tr>
                      <td className="py-2.5 pr-4 text-[11px] text-slate-400">Just now</td>
                      <td className="py-2.5 pr-4 font-bold text-blue-600">CONTROL_CENTER_LOGIN</td>
                      <td className="py-2.5 pr-4 font-semibold text-slate-700">{currentUser?.name || "Garv Kataria"}</td>
                      <td className="py-2.5 text-slate-400">Authenticated via SUPER_ADMIN role</td>
                    </tr>
                    {quota.history.map((h, i) => (
                      <tr key={i}>
                        <td className="py-2.5 pr-4 text-[11px] text-slate-400">
                          {new Date(h.date).toLocaleDateString()}{" "}
                          {new Date(h.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="py-2.5 pr-4 font-bold text-emerald-600">QUOTA_LIMIT_UPDATE</td>
                        <td className="py-2.5 pr-4 font-semibold text-slate-700">{h.upgradedBy}</td>
                        <td className="py-2.5 text-slate-400">
                          {h.oldLimit.toLocaleString()} → {h.newLimit.toLocaleString()} ({h.notes || "Limit updated"})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/* TAB 6: RECYCLE BIN (30-DAY RETENTION ENGINE)                           */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "recycle" && (
          <section className="mt-6 space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <Archive className="h-5 w-5 text-amber-600" /> 30-Day Recycle Bin & Retention Engine
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Soft-deleted agencies, corporate clients, and branches are retained for 30 days before permanent auto-purge.
                </p>
              </div>

              {recycleBin.length > 0 && (
                <button
                  onClick={() => setEmptyBinModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100 transition shadow-sm"
                >
                  <Trash2 className="h-4 w-4" /> Empty Recycle Bin
                </button>
              )}
            </div>

            {/* Retention Notice Box */}
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
              <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 leading-relaxed">
                <span className="font-bold">Automated 30-Day Safety Policy:</span> When you delete any agency, corporate company, or regional hub, it is immediately moved here with its full original dossier intact. You can restore it anytime with a single click. Items reaching 0 days are permanently purged from the system.
              </div>
            </div>

            {/* Type Filters */}
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: "ALL", label: "All Items", count: recycleBin.length },
                  { id: "STAFF", label: "Deleted Staff & Admins", count: recycleBin.filter((i) => i.itemType === "STAFF").length },
                  { id: "ACCOUNT", label: "Agencies", count: recycleBin.filter((i) => i.itemType === "ACCOUNT").length },
                  { id: "COMPANY", label: "Companies", count: recycleBin.filter((i) => i.itemType === "COMPANY").length },
                  { id: "BRANCH", label: "Branches", count: recycleBin.filter((i) => i.itemType === "BRANCH").length },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setRecycleTypeFilter(tab.id as any)}
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                    recycleTypeFilter === tab.id
                      ? "bg-slate-800 text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                      recycleTypeFilter === tab.id ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Recycle Bin Table */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">Item & Type</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">Original Summary</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">Deleted Date & By</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider">Retention Status</th>
                      <th className="px-4 py-3 font-bold uppercase tracking-wider text-right">Recovery Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRecycleBin.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-16 text-center text-slate-400">
                          <Archive className="h-10 w-10 mx-auto mb-2 text-slate-300 stroke-[1.5]" />
                          <p className="text-sm font-bold text-slate-700">Recycle Bin is Empty</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            No deleted staff, agencies, corporate clients, or regional hubs in the bin.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredRecycleBin.map((item) => {
                        const daysLeft = getDaysRemaining(item.purgeAt);
                        const pctRemaining = Math.max(0, Math.min(100, Math.round((daysLeft / 30) * 100)));
                        const isUrgent = daysLeft <= 5;
                        return (
                          <tr key={item.id} className="hover:bg-slate-50/70 transition">
                            <td className="px-4 py-3.5">
                              <div className="font-bold text-slate-800 text-sm">{item.name}</div>
                              <span
                                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wide mt-1 ${
                                  item.itemType === "ACCOUNT"
                                    ? "bg-blue-100 text-blue-700"
                                    : item.itemType === "STAFF"
                                    ? "bg-amber-100 text-amber-800"
                                    : item.itemType === "COMPANY"
                                    ? "bg-violet-100 text-violet-700"
                                    : "bg-emerald-100 text-emerald-700"
                                }`}
                              >
                                {item.itemType === "ACCOUNT"
                                  ? "Agency Account"
                                  : item.itemType === "STAFF"
                                  ? "Staff / Admin Member"
                                  : item.itemType === "COMPANY"
                                  ? "Corporate Client"
                                  : "Regional Hub"}
                              </span>
                            </td>

                            <td className="px-4 py-3.5">
                              <div className="text-xs text-slate-600 font-medium">{item.summary}</div>
                              {item.reason && (
                                <div className="text-[11px] text-slate-400 italic mt-0.5">
                                  Reason: {item.reason}
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3.5">
                              <div className="text-xs text-slate-700 font-semibold">
                                {new Date(item.deletedAt).toLocaleDateString()}{" "}
                                {new Date(item.deletedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">By {item.deletedBy}</div>
                            </td>

                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${
                                    isUrgent
                                      ? "bg-rose-100 text-rose-700"
                                      : daysLeft <= 15
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-emerald-100 text-emerald-700"
                                  }`}
                                >
                                  {daysLeft} {daysLeft === 1 ? "day" : "days"} left
                                </span>
                              </div>
                              <div className="mt-1.5 h-1.5 w-full max-w-[100px] rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    isUrgent ? "bg-rose-500" : daysLeft <= 15 ? "bg-amber-500" : "bg-emerald-500"
                                  }`}
                                  style={{ width: `${pctRemaining}%` }}
                                />
                              </div>
                            </td>

                            <td className="px-4 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleRestoreFromBin(item.id, item.name)}
                                  className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition shadow-sm"
                                  title="Restore item immediately to active database"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  <span>Restore</span>
                                </button>
                                <button
                                  onClick={() => initiatePermanentDelete(item.id, item.name)}
                                  className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition shadow-sm"
                                  title="Permanently remove forever"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 1: VIEW DETAILS DOSSIER (360° AGENCY INSPECTION)                     */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {viewAccount && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setViewAccount(null);
          }}
        >
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 border border-blue-100">
                  <ShieldCheck className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-slate-800">{viewAccount.name}</h3>
                    <PlanBadge plan={viewAccount.plan} />
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">Agency ID: {viewAccount.id}</p>
                </div>
              </div>
              <button
                onClick={() => setViewAccount(null)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4 text-xs">
              {/* Status Header Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Status</span>
                  <span className="font-extrabold text-slate-800 flex items-center gap-1.5 mt-1">
                    <StatusDot status={viewAccount.status} /> {viewAccount.status}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Assigned Branch</span>
                  <span className="font-extrabold text-slate-800 block mt-1 truncate">
                    {viewAccount.branchName || "Dubai HQ"}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Currency</span>
                  <span className="font-extrabold text-slate-800 block mt-1">{viewAccount.currency || "AED"}</span>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Bookings</span>
                  <span className="font-extrabold text-blue-600 block mt-1">{viewAccount.totalBookings || 0}</span>
                </div>
              </div>

              {/* Contact Information */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-blue-600" /> Ownership & Contact Details
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Primary Admin / Owner</span>
                    <span className="font-semibold text-slate-700">{viewAccount.ownerName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Registered Email</span>
                    <span className="font-semibold text-slate-700">{viewAccount.email}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Phone Number</span>
                    <span className="font-semibold text-slate-700">{formatPhoneDisplay(viewAccount.phone)}</span>
                  </div>
                </div>
              </div>

              {/* WhatsApp Quota Health */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-emerald-600" /> WhatsApp Quota Allocation
                  </h4>
                  <span className="text-xs font-bold text-slate-600">
                    {viewAccount.whatsappUsed.toLocaleString()} / {viewAccount.whatsappLimit.toLocaleString()} msgs
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      viewAccount.whatsappUsed / viewAccount.whatsappLimit >= 0.95
                        ? "bg-rose-500"
                        : viewAccount.whatsappUsed / viewAccount.whatsappLimit >= 0.8
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    }`}
                    style={{
                      width: `${Math.min(100, Math.round((viewAccount.whatsappUsed / viewAccount.whatsappLimit) * 100))}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-slate-500 pt-1">
                  <span>
                    Remaining Buffer:{" "}
                    <b className="text-emerald-600">
                      {Math.max(0, viewAccount.whatsappLimit - viewAccount.whatsappUsed).toLocaleString()}
                    </b>
                  </span>
                  <span>
                    Consumed:{" "}
                    <b>{Math.round((viewAccount.whatsappUsed / viewAccount.whatsappLimit) * 100)}%</b>
                  </span>
                </div>
              </div>

              {/* Blocked info if any */}
              {viewAccount.status !== "ACTIVE" && viewAccount.blockReason && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <span className="font-bold text-rose-700 block uppercase text-[10px] mb-1">
                    Suspension Reason & Audit Notice
                  </span>
                  <p className="text-xs text-rose-800 leading-relaxed">{viewAccount.blockReason}</p>
                  <p className="text-[10px] text-rose-600 mt-2">
                    Blocked at: {viewAccount.blockedAt ? new Date(viewAccount.blockedAt).toLocaleString() : "N/A"}
                  </p>
                </div>
              )}

              {/* Internal Notes */}
              {viewAccount.notes && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                  <span className="font-bold text-slate-500 block uppercase text-[10px] mb-1">
                    Master Admin Internal Notes
                  </span>
                  <p className="text-xs text-slate-700 leading-relaxed">{viewAccount.notes}</p>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-slate-100">
              <button
                onClick={() => {
                  const target = viewAccount;
                  setViewAccount(null);
                  initiateDeleteToBin(
                    "ACCOUNT",
                    target.id,
                    target.name,
                    `${target.plan} Plan · ${target.ownerName}`,
                    target
                  );
                }}
                className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100 transition"
              >
                <Trash2 className="h-3.5 w-3.5" /> Move to Recycle Bin
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const target = viewAccount;
                    setViewAccount(null);
                    openQuotaBoxDialog(target);
                  }}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition"
                >
                  Adjust Quota
                </button>
                <button
                  onClick={() => {
                    const target = viewAccount;
                    setViewAccount(null);
                    openEditAgencyDialog(target);
                  }}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-blue-700 transition"
                >
                  Edit Agency
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 2: VIEW DETAILS (CORPORATE CLIENT DOSSIER)                           */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {viewCompany && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setViewCompany(null);
          }}
        >
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 border border-violet-100">
                  <Building2 className="h-6 w-6 text-violet-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-slate-800">{viewCompany.name}</h3>
                    <span className="rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 font-bold">
                      {viewCompany.code}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">Branch: {viewCompany.branchName || "Dubai HQ"}</p>
                </div>
              </div>
              <button
                onClick={() => setViewCompany(null)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Credit Limit</span>
                  <span className="font-extrabold text-slate-800 block mt-1">
                    {viewCompany.creditLimit.toLocaleString()} AED
                  </span>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Outstanding</span>
                  <span className="font-extrabold text-rose-600 block mt-1">
                    {(viewCompany.outstandingBalance || 0).toLocaleString()} AED
                  </span>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Payment Terms</span>
                  <span className="font-extrabold text-amber-600 block mt-1">{viewCompany.paymentTerms}</span>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Cost Center</span>
                  <span className="font-mono font-bold text-slate-700 block mt-1">
                    {viewCompany.defaultCostCenter}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                <h4 className="font-bold text-slate-800 text-xs">Corporate Contact & Location</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Contact Lead</span>
                    <span className="font-semibold text-slate-700">{viewCompany.contactPerson}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Email Address</span>
                    <span className="font-semibold text-slate-700">{viewCompany.email}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Phone</span>
                    <span className="font-semibold text-slate-700">{formatPhoneDisplay(viewCompany.phone)}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400 block">Office Address</span>
                  <span className="font-medium text-slate-700">{viewCompany.address}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                <h4 className="font-bold text-slate-800 text-xs">Activity & Engagement</h4>
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Total Corporate Bookings</span>
                    <span className="font-black text-slate-800 text-sm">{viewCompany.totalBookings || 0}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Active Employees</span>
                    <span className="font-black text-slate-800 text-sm">{viewCompany.activeEmployees || 0}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Monthly Spend</span>
                    <span className="font-black text-slate-800 text-sm">
                      {(viewCompany.monthlySpend || 0).toLocaleString()} AED
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                onClick={() => {
                  const target = viewCompany;
                  setViewCompany(null);
                  initiateDeleteToBin(
                    "COMPANY",
                    target.id,
                    target.name,
                    `Code: ${target.code} · ${target.branchName || "Dubai HQ"}`,
                    target
                  );
                }}
                className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100 transition"
              >
                <Trash2 className="h-3.5 w-3.5" /> Move to Recycle Bin
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const target = viewCompany;
                    setViewCompany(null);
                    openEditCompanyDialog(target);
                  }}
                  className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-violet-700 transition"
                >
                  Edit Company
                </button>
                <button
                  onClick={() => setViewCompany(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 3: VIEW DETAILS (REGIONAL BRANCH DOSSIER)                            */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {viewBranch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setViewBranch(null);
          }}
        >
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-100">
                  <Building className="h-6 w-6 text-emerald-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-slate-800">{viewBranch.name}</h3>
                    <span className="rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 font-bold">
                      {viewBranch.code}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {viewBranch.city}, {viewBranch.country}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewBranch(null)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Hub Manager</span>
                  <span className="font-extrabold text-slate-800 block mt-1">{viewBranch.managerName}</span>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Manager Email</span>
                  <span className="font-semibold text-slate-700 block mt-1 truncate">{viewBranch.managerEmail}</span>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Phone</span>
                  <span className="font-semibold text-slate-700 block mt-1">
                    {formatPhoneDisplay(viewBranch.phone)}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Office Address</span>
                <p className="font-medium text-slate-700">{viewBranch.address}</p>
                {viewBranch.notes && <p className="text-xs text-slate-400 mt-2 italic">{viewBranch.notes}</p>}
              </div>

              {/* Mapped Corporate Companies */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                <h4 className="font-bold text-slate-800 text-xs">
                  Mapped Corporate Clients ({companies.filter((c) => c.branchId === viewBranch.id).length})
                </h4>
                <div className="divide-y divide-slate-100 pt-1">
                  {companies.filter((c) => c.branchId === viewBranch.id).length === 0 ? (
                    <p className="text-slate-400 italic py-2">No companies mapped to this branch yet.</p>
                  ) : (
                    companies
                      .filter((c) => c.branchId === viewBranch.id)
                      .map((c) => (
                        <div key={c.id} className="py-2 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-slate-800">{c.name}</span>
                            <span className="ml-2 font-mono text-[10px] text-slate-400">{c.code}</span>
                          </div>
                          <span className="text-slate-500 font-semibold">{c.contactPerson}</span>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                onClick={() => {
                  const target = viewBranch;
                  setViewBranch(null);
                  initiateDeleteToBin(
                    "BRANCH",
                    target.id,
                    target.name,
                    `${target.city}, ${target.country} · Manager: ${target.managerName}`,
                    target
                  );
                }}
                className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100 transition"
              >
                <Trash2 className="h-3.5 w-3.5" /> Move to Recycle Bin
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const target = viewBranch;
                    setViewBranch(null);
                    openEditBranchDialog(target);
                  }}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-emerald-700 transition"
                >
                  Edit Branch
                </button>
                <button
                  onClick={() => setViewBranch(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 4: MOVE TO 30-DAY RECYCLE BIN CONFIRMATION                           */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {deleteBinModalOpen && deleteBinTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteBinModalOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-3xl border border-amber-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Archive className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Move to 30-Day Recycle Bin</h3>
                <p className="text-xs text-slate-400">Soft delete with instant recovery guarantee</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to remove <b className="text-slate-800">{deleteBinTarget.name}</b> from the active database?
            </p>

            <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs text-slate-600">
              <span className="font-bold text-slate-700 block">Item Summary:</span>
              <p className="mt-0.5 text-slate-500">{deleteBinTarget.summary}</p>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                Deletion Reason (Saved in Recycle Bin Audit Log)
              </label>
              <textarea
                value={deleteBinReason}
                onChange={(e) => setDeleteBinReason(e.target.value)}
                placeholder="e.g. Agency cancelled license or requested account decommissioning…"
                rows={2}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-amber-400 resize-none"
              />
            </div>

            <div className="mt-5 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setDeleteBinModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteToBin}
                className="rounded-xl bg-amber-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-amber-700 shadow transition"
              >
                Move to Recycle Bin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 5: PERMANENT DELETE FROM RECYCLE BIN CONFIRMATION                    */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {permDeleteModalOpen && permDeleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPermDeleteModalOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Permanently Delete Item</h3>
                <p className="text-xs text-rose-500 font-semibold">Irrevocable action</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This will destroy <b className="text-slate-800">{permDeleteTarget.name}</b> permanently from the system. It cannot be recovered from the Recycle Bin afterwards.
            </p>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPermDeleteModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPermanentDelete}
                className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-rose-700 shadow transition"
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 6: EMPTY ENTIRE RECYCLE BIN                                          */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {emptyBinModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEmptyBinModalOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Empty Recycle Bin</h3>
                <p className="text-xs text-rose-500 font-semibold">All {recycleBin.length} items will be permanently erased</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to clear all {recycleBin.length} items from the Recycle Bin? All deleted agencies, corporate clients, and branches will be permanently lost.
            </p>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setEmptyBinModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmEmptyBin}
                className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-rose-700 shadow transition"
              >
                Yes, Empty All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 7: EDIT AGENCY                                                       */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {editAccModalOpen && editingAccount && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditAccModalOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
                  <Pencil className="h-4.5 w-4.5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Edit Agency</h3>
                  <p className="text-xs text-slate-400">{editingAccount.name}</p>
                </div>
              </div>
              <button
                onClick={() => setEditAccModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAgency} className="mt-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block font-bold text-slate-600 mb-1">Agency Name</label>
                  <input
                    type="text"
                    required
                    value={editAccName}
                    onChange={(e) => setEditAccName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Owner Name</label>
                  <input
                    type="text"
                    value={editAccOwner}
                    onChange={(e) => setEditAccOwner(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={editAccEmail}
                    onChange={(e) => setEditAccEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-blue-400"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-bold text-slate-600 mb-1">Phone</label>
                  <PhoneInput value={editAccPhone} onChange={(v) => setEditAccPhone(v)} />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Plan</label>
                  <select
                    value={editAccPlan}
                    onChange={(e) => setEditAccPlan(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-400"
                  >
                    <option value="STARTER">STARTER</option>
                    <option value="PROFESSIONAL">PROFESSIONAL</option>
                    <option value="ENTERPRISE">ENTERPRISE</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Status</label>
                  <select
                    value={editAccStatus}
                    onChange={(e) => setEditAccStatus(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-400"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="BLOCKED">BLOCKED</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block font-bold text-slate-600 mb-1">Notes</label>
                  <textarea
                    rows={2}
                    value={editAccNotes}
                    onChange={(e) => setEditAccNotes(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-blue-400 resize-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditAccModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-blue-700 shadow transition"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 8: WHATSAPP QUOTA DIALOG                                             */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {quotaModalOpen && targetQuotaAccount && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setQuotaModalOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
                  <MessageSquare className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">WhatsApp Quota</h3>
                  <p className="text-xs text-slate-400">{targetQuotaAccount.name}</p>
                </div>
              </div>
              <button
                onClick={() => setQuotaModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Current Limit:</span>
                <span className="font-black text-slate-800">{targetQuotaAccount.whatsappLimit.toLocaleString()} msgs</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Used:</span>
                <span className="font-bold text-amber-600">{targetQuotaAccount.whatsappUsed.toLocaleString()} msgs</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Remaining:</span>
                <span className="font-bold text-emerald-600">
                  {Math.max(0, targetQuotaAccount.whatsappLimit - targetQuotaAccount.whatsappUsed).toLocaleString()} msgs
                </span>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">New Quota Limit</label>
                <input
                  type="number"
                  value={quotaModalLimitInput}
                  onChange={(e) => setQuotaModalLimitInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[500, 1000, 2500, 5000, 10000].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setQuotaModalLimitInput(p.toString());
                        setQuotaModalWarningInput(Math.round(p * 0.8).toString());
                        setQuotaModalCriticalInput(Math.round(p * 0.95).toString());
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500 hover:border-emerald-300 hover:text-emerald-600 transition"
                    >
                      {p >= 1000 ? `${p / 1000}k` : p}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={quotaModalResetUsage}
                  onChange={(e) => setQuotaModalResetUsage(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
                <span className="text-xs font-semibold text-slate-600">Reset usage counter to 0 simultaneously</span>
              </label>
            </div>

            <div className="flex justify-end gap-2.5 pt-5 border-t border-slate-100 mt-5">
              <button
                onClick={() => setQuotaModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAccountQuotaBox}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-emerald-700 shadow transition"
              >
                Apply Quota
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 9: BLOCK / SUSPEND AGENCY                                            */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {blockModalOpen && targetAccount && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setBlockModalOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100">
                <Ban className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Block Agency Access</h3>
                <p className="text-xs text-slate-400">Suspend portal access for {targetAccount.name}</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Users from <b className="text-slate-800">{targetAccount.name}</b> will be locked out immediately and shown your suspension notice.
            </p>
            <div className="mt-4">
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Reason (shown to tenant)</label>
              <textarea
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                rows={3}
                placeholder="e.g. Overdue payment or policy violation…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 resize-none"
              />
            </div>
            <div className="mt-5 flex items-center justify-between">
              <button
                onClick={() => {
                  handleConfirmAccountStatus("SUSPENDED");
                }}
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100 transition"
              >
                Suspend
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setBlockModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleConfirmAccountStatus("BLOCKED")}
                  className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-rose-700 shadow transition"
                >
                  Confirm Block
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 10: REGISTER NEW AGENCY                                              */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {newAccModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setNewAccModalOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
                  <Plus className="h-5 w-5 text-blue-600" />
                </div>
                <h3 className="text-base font-bold text-slate-800">Register New Agency</h3>
              </div>
              <button
                onClick={() => setNewAccModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateAccount} className="mt-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">Agency Name *</label>
                <input
                  type="text"
                  required
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  placeholder="e.g. Royal Mirage Travel"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Owner Name</label>
                  <input
                    type="text"
                    value={newAccOwner}
                    onChange={(e) => setNewAccOwner(e.target.value)}
                    placeholder="e.g. Rajesh Kumar"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Phone</label>
                  <PhoneInput value={newAccPhone} onChange={(v) => setNewAccPhone(v)} />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  value={newAccEmail}
                  onChange={(e) => setNewAccEmail(e.target.value)}
                  placeholder="admin@agency.com"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-blue-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Plan</label>
                  <select
                    value={newAccPlan}
                    onChange={(e) => setNewAccPlan(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-400"
                  >
                    <option value="STARTER">STARTER</option>
                    <option value="PROFESSIONAL">PROFESSIONAL</option>
                    <option value="ENTERPRISE">ENTERPRISE</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">WhatsApp Limit</label>
                  <input
                    type="number"
                    value={newAccLimit}
                    onChange={(e) => setNewAccLimit(parseInt(e.target.value, 10) || 1000)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-400"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Assigned Branch Hub</label>
                  <select
                    value={newAccBranch}
                    onChange={(e) => setNewAccBranch(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-400"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.name}>
                        {b.name} ({b.city})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Billing Currency</label>
                  <select
                    value={newAccCurrency}
                    onChange={(e) => setNewAccCurrency(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-400"
                  >
                    <option value="AED">AED (UAE Dirham)</option>
                    <option value="INR">INR (Indian Rupee)</option>
                    <option value="USD">USD (US Dollar)</option>
                    <option value="EUR">EUR (Euro)</option>
                    <option value="GBP">GBP (British Pound)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">Initial Notes</label>
                <textarea
                  rows={2}
                  value={newAccNotes}
                  onChange={(e) => setNewAccNotes(e.target.value)}
                  placeholder="e.g. VIP Enterprise Partner, key market: Dubai & Singapore…"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-blue-400 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setNewAccModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-blue-700 shadow transition"
                >
                  Register Agency
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 11: EDIT CORPORATE COMPANY                                           */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {editCompModalOpen && editingCompany && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditCompModalOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50">
                  <Pencil className="h-4.5 w-4.5 text-violet-600" />
                </div>
                <h3 className="text-base font-bold text-slate-800">Edit Company</h3>
              </div>
              <button
                onClick={() => setEditCompModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveCompany} className="mt-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">Company Name</label>
                <input
                  type="text"
                  required
                  value={editCompName}
                  onChange={(e) => setEditCompName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Company Code</label>
                  <input
                    type="text"
                    value={editCompCode}
                    onChange={(e) => setEditCompCode(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-mono text-slate-800 outline-none focus:border-violet-400"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Assigned Branch Hub</label>
                  <select
                    value={editCompBranchId}
                    onChange={(e) => setEditCompBranchId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-violet-400"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.city})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={editCompContact}
                    onChange={(e) => setEditCompContact(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-violet-400"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Phone</label>
                  <PhoneInput value={editCompPhone} onChange={(v) => setEditCompPhone(v)} />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">Email</label>
                <input
                  type="email"
                  value={editCompEmail}
                  onChange={(e) => setEditCompEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-violet-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Credit Limit</label>
                  <input
                    type="number"
                    value={editCompCreditLimit}
                    onChange={(e) => setEditCompCreditLimit(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-violet-400"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Payment Terms</label>
                  <select
                    value={editCompPaymentTerms}
                    onChange={(e) => setEditCompPaymentTerms(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-violet-400"
                  >
                    <option>Net 15 Days</option>
                    <option>Net 30 Days</option>
                    <option>Net 45 Days</option>
                    <option>Prepaid / Immediate</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">Office Address</label>
                <input
                  type="text"
                  value={editCompAddress}
                  onChange={(e) => setEditCompAddress(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-violet-400"
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditCompModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-violet-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-violet-700 shadow transition"
                >
                  Save & Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 12: ADD CORPORATE COMPANY                                            */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {newCompModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setNewCompModalOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50">
                  <Plus className="h-5 w-5 text-violet-600" />
                </div>
                <h3 className="text-base font-bold text-slate-800">Add Corporate Company</h3>
              </div>
              <button
                onClick={() => setNewCompModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateCompany} className="mt-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">Company Name *</label>
                <input
                  type="text"
                  required
                  value={newCompName}
                  onChange={(e) => setNewCompName(e.target.value)}
                  placeholder="e.g. Al Futtaim Group Travel"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Company Code</label>
                  <input
                    type="text"
                    value={newCompCode}
                    onChange={(e) => setNewCompCode(e.target.value)}
                    placeholder="AFG-DXB"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-mono text-slate-800 outline-none focus:border-violet-400"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Assign to Branch Hub</label>
                  <select
                    value={newCompBranchId}
                    onChange={(e) => setNewCompBranchId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-violet-400"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.city})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={newCompContact}
                    onChange={(e) => setNewCompContact(e.target.value)}
                    placeholder="Tariq Mansoor"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-violet-400"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Phone</label>
                  <PhoneInput value={newCompPhone} onChange={(v) => setNewCompPhone(v)} />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">Email</label>
                <input
                  type="email"
                  value={newCompEmail}
                  onChange={(e) => setNewCompEmail(e.target.value)}
                  placeholder="billing@company.com"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-violet-400"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">Credit Limit (AED)</label>
                <input
                  type="number"
                  value={newCompCreditLimit}
                  onChange={(e) => setNewCompCreditLimit(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-violet-400"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">Office Address</label>
                <input
                  type="text"
                  value={newCompAddress}
                  onChange={(e) => setNewCompAddress(e.target.value)}
                  placeholder="e.g. Al Barsha Heights, Dubai"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-violet-400"
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setNewCompModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-violet-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-violet-700 shadow transition"
                >
                  Create Company
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 13: ADD REGIONAL BRANCH                                              */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {newBranchModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setNewBranchModalOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50">
                  <Building className="h-5 w-5 text-violet-600" />
                </div>
                <h3 className="text-base font-bold text-slate-800">Add Regional Branch Hub</h3>
              </div>
              <button
                onClick={() => setNewBranchModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateBranch} className="mt-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">Branch Name *</label>
                <input
                  type="text"
                  required
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="e.g. Bangalore South Hub"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">City *</label>
                  <input
                    type="text"
                    required
                    value={newBranchCity}
                    onChange={(e) => setNewBranchCity(e.target.value)}
                    placeholder="Bengaluru"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-violet-400"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Country</label>
                  <input
                    type="text"
                    value={newBranchCountry}
                    onChange={(e) => setNewBranchCountry(e.target.value)}
                    placeholder="India"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-violet-400"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Branch Manager</label>
                  <input
                    type="text"
                    value={newBranchManager}
                    onChange={(e) => setNewBranchManager(e.target.value)}
                    placeholder="Rajesh Nair"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-violet-400"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Phone</label>
                  <PhoneInput value={newBranchPhone} onChange={(v) => setNewBranchPhone(v)} />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">Manager Email</label>
                <input
                  type="email"
                  value={newBranchEmail}
                  onChange={(e) => setNewBranchEmail(e.target.value)}
                  placeholder="manager@branch.com"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-violet-400"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">Address</label>
                <input
                  type="text"
                  value={newBranchAddress}
                  onChange={(e) => setNewBranchAddress(e.target.value)}
                  placeholder="UB City, Vittal Mallya Rd"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-violet-400"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">Operational Notes</label>
                <textarea
                  rows={2}
                  value={newBranchNotes}
                  onChange={(e) => setNewBranchNotes(e.target.value)}
                  placeholder="e.g. Flagship corporate servicing hub for South India operations…"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-violet-400 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setNewBranchModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-violet-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-violet-700 shadow transition"
                >
                  Add Branch Hub
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 14: EDIT REGIONAL BRANCH                                             */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {editBranchModalOpen && editingBranch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditBranchModalOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50">
                  <Pencil className="h-4.5 w-4.5 text-violet-600" />
                </div>
                <h3 className="text-base font-bold text-slate-800">Edit Regional Branch</h3>
              </div>
              <button
                onClick={() => setEditBranchModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveBranch} className="mt-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">Branch Name</label>
                <input
                  type="text"
                  required
                  value={editBranchName}
                  onChange={(e) => setEditBranchName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Branch Code</label>
                  <input
                    type="text"
                    value={editBranchCode}
                    onChange={(e) => setEditBranchCode(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-mono text-slate-800 outline-none focus:border-violet-400"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Status</label>
                  <select
                    value={editBranchStatus}
                    onChange={(e) => setEditBranchStatus(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-violet-400"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">City</label>
                  <input
                    type="text"
                    value={editBranchCity}
                    onChange={(e) => setEditBranchCity(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-violet-400"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Country</label>
                  <input
                    type="text"
                    value={editBranchCountry}
                    onChange={(e) => setEditBranchCountry(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-violet-400"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Branch Manager</label>
                  <input
                    type="text"
                    value={editBranchManager}
                    onChange={(e) => setEditBranchManager(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-violet-400"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Phone</label>
                  <PhoneInput value={editBranchPhone} onChange={(v) => setEditBranchPhone(v)} />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">Manager Email</label>
                <input
                  type="email"
                  value={editBranchEmail}
                  onChange={(e) => setEditBranchEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-violet-400"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">Address</label>
                <input
                  type="text"
                  value={editBranchAddress}
                  onChange={(e) => setEditBranchAddress(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-violet-400"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={editBranchNotes}
                  onChange={(e) => setEditBranchNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 outline-none focus:border-violet-400 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditBranchModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-violet-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-violet-700 shadow transition"
                >
                  Save & Update Hub
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 15: INSPECT ERROR & STACK TRACE                                      */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {inspectModalOpen && selectedError && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setInspectModalOpen(false);
          }}
        >
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[85vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50">
                  <FileCode className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">{selectedError.title}</h3>
                  <p className="text-xs font-mono text-rose-600">{selectedError.errorCode}</p>
                </div>
              </div>
              <button
                onClick={() => setInspectModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 border border-slate-100 p-3">
                {[
                  { k: "Subsystem", v: selectedError.subsystem },
                  { k: "Agency", v: selectedError.accountName || "System-wide" },
                  { k: "Severity", v: selectedError.severity },
                  { k: "Timestamp", v: new Date(selectedError.timestamp).toLocaleString() },
                ].map((item) => (
                  <div key={item.k}>
                    <span className="block text-[10px] font-bold uppercase text-slate-400">{item.k}</span>
                    <span className="font-semibold text-slate-700">{item.v}</span>
                  </div>
                ))}
              </div>
              <div>
                <span className="block font-bold text-slate-600 mb-1">Message</span>
                <p className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-slate-700 leading-relaxed">
                  {selectedError.message}
                </p>
              </div>
              {selectedError.details && (
                <div>
                  <span className="block font-bold text-slate-600 mb-1">Payload / Details</span>
                  <pre className="rounded-xl bg-slate-800 p-3 font-mono text-[11px] text-amber-300 overflow-x-auto">
                    {selectedError.details}
                  </pre>
                </div>
              )}
              {selectedError.stackTrace && (
                <div>
                  <span className="block font-bold text-slate-600 mb-1">Stack Trace</span>
                  <pre className="rounded-xl bg-slate-800 p-3 font-mono text-[11px] text-slate-300 overflow-x-auto">
                    {selectedError.stackTrace}
                  </pre>
                </div>
              )}
              {selectedError.recommendedFix && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <span className="block text-[10px] font-black uppercase text-emerald-600 mb-0.5">Recommended Fix</span>
                  <span className="text-emerald-700">{selectedError.recommendedFix}</span>
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setInspectModalOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <GoogleDriveConnectModal
        open={driveModalOpen}
        onClose={() => setDriveModalOpen(false)}
        onStatusChange={setDriveStatus}
      />
    </div>
  );
}
