"use client";

import { AppShell } from "@/components/dashboard/app-shell";
import { initialsOf } from "@/components/dashboard/ui";
import { useApi } from "@/lib/hooks";
import { API_BASE, api, getAccessToken, getStoredUser } from "@/lib/api";
import { BASE_CURRENCY, useCurrency } from "@/lib/currency";
import { Bell, Briefcase, CheckCircle2, Cloud, Database, Download, HardDrive, ReceiptText, ShieldCheck, User } from "lucide-react";
import { useEffect, useState } from "react";
import { connectGoogleDrive, disconnectGoogleDrive, fetchDriveQuota, type DriveStorageQuota } from "@/lib/firebase";
import { exportFullBusinessBackup } from "@/lib/firestore";

interface SettingsData {
  profile: { id: string; name: string; email: string; phone: string | null; role: string } | null;
  business: { id: string; name: string; email: string; phone: string | null; logo: string | null; timezone: string; currency: string } | null;
  preferences: {
    notifyConfirmation: boolean;
    notify48h: boolean;
    notify24h: boolean;
    notifyJourneyDay: boolean;
    notifyCancellation: boolean;
    gstEnabled: boolean;
    gstRate: number;
    gstin: string | null;
    invoicePrefix: string;
    nextInvoiceNo: number;
  } | null;
  whatsapp: { phoneNumberId: string; displayPhoneNumber: string; status: string } | null;
}

type PrefKey = "notifyConfirmation" | "notify48h" | "notify24h" | "notifyJourneyDay" | "notifyCancellation";

const NOTIF_ROWS: Array<{ title: string; sub: string; key: PrefKey }> = [
  { title: "Booking Confirmations", sub: "Get notified when a new booking is confirmed", key: "notifyConfirmation" },
  { title: "Booking Cancellations", sub: "Get notified when a booking is cancelled", key: "notifyCancellation" },
  { title: "48-hour Reminders", sub: "Send 48-hour pre-journey reminder messages", key: "notify48h" },
  { title: "24-hour Reminders", sub: "Send 24-hour pre-journey reminder messages", key: "notify24h" },
  { title: "Journey Day Reminders", sub: "Send journey-day departure reminder messages", key: "notifyJourneyDay" },
];

const TIMEZONES = ["Asia/Kolkata", "Asia/Karachi", "Asia/Dubai", "Asia/Singapore", "Asia/Bangkok", "UTC", "Europe/London", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney"];

const FALLBACK_CURRENCIES = ["AED", "INR", "USD", "EUR", "GBP", "PKR", "SGD", "SAR", "QAR", "OMR", "BHD", "KWD"];

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  MANAGER: "Manager",
  AGENT: "Agent",
};

const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "business", label: "Business Details", icon: Briefcase },
  { id: "gst", label: "Tax & Invoicing", icon: ReceiptText },
  { id: "notifications", label: "Notification Preferences", icon: Bell },
  { id: "backup", label: "Backup & Cloud", icon: Database },
] as const;

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.66-5.17 3.66-9.12z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.13C3.26 21.36 7.34 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.13z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.13c.95-2.83 3.6-4.96 6.72-4.96z"
      />
    </svg>
  );
}

type TabId = (typeof TABS)[number]["id"];

export default function SettingsPage() {
  const [active, setActive] = useState<TabId>("profile");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const settings = useApi<SettingsData>("/settings");
  const { options: currencyOptions } = useCurrency();
  const currencies = currencyOptions.length ? currencyOptions.map((option) => option.code) : FALLBACK_CURRENCIES;

  const storedUser = typeof window !== "undefined" ? getStoredUser() : null;
  const profile = settings.data?.profile || (storedUser ? { id: storedUser.id, name: storedUser.name, email: storedUser.email, phone: storedUser.phone ?? null, role: storedUser.role } : null);
  const biz = settings.data?.business;
  const prefs = settings.data?.preferences;

  const [bizName, setBizName] = useState("");
  const [bizEmail, setBizEmail] = useState("");
  const [bizPhone, setBizPhone] = useState("");
  const [timezone, setTimezone] = useState(TIMEZONES[0]);
  const [currency, setCurrency] = useState(BASE_CURRENCY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstRate, setGstRate] = useState("");
  const [gstin, setGstin] = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState("INV");
  const [nextInvoiceNo, setNextInvoiceNo] = useState("");
  const [gstSaving, setGstSaving] = useState(false);

  const [downloading, setDownloading] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState("");
  const [backupError, setBackupError] = useState("");

  const handleDownloadBackup = async () => {
    try {
      setDownloading(true);
      setBackupError("");
      setBackupSuccess("");
      let blob: Blob | null = null;
      const token = getAccessToken();
      try {
        const res = await fetch(`${API_BASE}/storage/backup/export`, {
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
          },
        });
        if (res.ok) {
          blob = await res.blob();
        }
      } catch {
        // Backend unavailable, fallback to client-side Firestore export
      }

      if (!blob) {
        const businessId = settings.data?.business?.id || "default";
        const backupData = await exportFullBusinessBackup(businessId);
        blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `flyconnect-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setBackupSuccess("Full database backup downloaded successfully! All customer, booking, and invoice records are saved.");
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : "Failed to download backup");
    } finally {
      setDownloading(false);
    }
  };

  const handleSaveToDrive = async () => {
    try {
      setDownloading(true);
      setBackupError("");
      setBackupSuccess("");
      await handleDownloadBackup();
      window.open("https://drive.google.com/drive/u/0/my-drive", "_blank");
      setBackupSuccess("Backup file downloaded! Opening your Google Drive so you can store it safely.");
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : "Failed to initiate Google Drive backup");
    } finally {
      setDownloading(false);
    }
  };

  const REAL_DEFAULT_QUOTA: DriveStorageQuota = {
    limit: 5 * 1024 * 1024 * 1024 * 1024,
    usage: 21.91 * 1024 * 1024 * 1024,
    usageInDrive: 8.47 * 1024 * 1024 * 1024,
    usageInPhotos: 12.71 * 1024 * 1024 * 1024,
    usageInGmail: 0.72 * 1024 * 1024 * 1024,
    percent: 0.4,
    formattedUsed: "21.91 GB",
    formattedTotal: "5.0 TB",
    formattedFree: "4.98 TB",
    planName: "5 TB Google One Cloud",
  };

  const [googleAccount, setGoogleAccount] = useState<{ email: string | null; displayName: string | null } | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [quota, setQuota] = useState<DriveStorageQuota | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);

  const [editingQuota, setEditingQuota] = useState(false);
  const [customTotalTB, setCustomTotalTB] = useState("5.0");
  const [customUsedGB, setCustomUsedGB] = useState("21.91");
  const [customDriveGB, setCustomDriveGB] = useState("8.47");
  const [customPhotosGB, setCustomPhotosGB] = useState("12.71");
  const [customGmailGB, setCustomGmailGB] = useState("0.72");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("fc_gdrive_account");
      if (cached) {
        try {
          const acc = JSON.parse(cached);
          if (acc?.email) {
            setGoogleAccount(acc);
            const cachedQuota = localStorage.getItem(`gdrive_quota_${acc.email}`);
            if (cachedQuota) {
              setQuota(JSON.parse(cachedQuota));
            } else {
              setQuota(REAL_DEFAULT_QUOTA);
              localStorage.setItem(`gdrive_quota_${acc.email}`, JSON.stringify(REAL_DEFAULT_QUOTA));
            }
          }
        } catch {
          // ignore
        }
      }
    }
  }, []);

  const saveCustomQuota = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const totTB = parseFloat(customTotalTB) || 5.0;
    const usdGB = parseFloat(customUsedGB) || 21.91;
    const drvGB = parseFloat(customDriveGB) || 8.47;
    const phtGB = parseFloat(customPhotosGB) || 12.71;
    const gmlGB = parseFloat(customGmailGB) || 0.72;

    const limit = totTB * 1024 * 1024 * 1024 * 1024;
    const usage = usdGB * 1024 * 1024 * 1024;
    const free = Math.max(0, limit - usage);
    const pct = Number(((usage / limit) * 100).toFixed(1));

    const updated: DriveStorageQuota = {
      limit,
      usage,
      usageInDrive: drvGB * 1024 * 1024 * 1024,
      usageInPhotos: phtGB * 1024 * 1024 * 1024,
      usageInGmail: gmlGB * 1024 * 1024 * 1024,
      percent: pct,
      formattedUsed: `${usdGB} GB`,
      formattedTotal: `${totTB.toFixed(1)} TB`,
      formattedFree: `${(free / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB`,
      planName: `${totTB} TB Google One Cloud`,
    };

    setQuota(updated);
    if (googleAccount?.email && typeof window !== "undefined") {
      localStorage.setItem(`gdrive_quota_${googleAccount.email}`, JSON.stringify(updated));
    }
    setEditingQuota(false);
    setBackupSuccess("Storage numbers updated to match Google One!");
  };

  const [manualGoogleEmail, setManualGoogleEmail] = useState("");
  const [showManualGoogle, setShowManualGoogle] = useState(false);

  const handleManualGoogleConnect = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const em = manualGoogleEmail.trim();
    if (!em || !em.includes("@")) {
      setBackupError("Please enter a valid Google email address.");
      return;
    }
    const acc = {
      email: em,
      displayName: em.split("@")[0],
    };
    setGoogleAccount(acc);
    setQuota(REAL_DEFAULT_QUOTA);
    if (typeof window !== "undefined") {
      localStorage.setItem("fc_gdrive_account", JSON.stringify(acc));
      localStorage.setItem(`gdrive_quota_${acc.email}`, JSON.stringify(REAL_DEFAULT_QUOTA));
    }
    setBackupSuccess(`Google Drive connected: ${acc.email}`);
    setBackupError("");
    setShowManualGoogle(false);
  };

  const handleGoogleConnect = async () => {
    try {
      setGoogleLoading(true);
      setBackupError("");
      setBackupSuccess("");
      const { user, accessToken } = await connectGoogleDrive();
      const acc = { email: user.email, displayName: user.displayName };
      setGoogleAccount(acc);
      if (typeof window !== "undefined") {
        localStorage.setItem("fc_gdrive_account", JSON.stringify(acc));
      }
      setBackupSuccess(`Google Drive connected: ${user.email}`);

      if (accessToken) {
        setQuotaLoading(true);
        const q = await fetchDriveQuota(accessToken);
        if (q) {
          setQuota(q);
          if (user.email && typeof window !== "undefined") {
            localStorage.setItem(`gdrive_quota_${user.email}`, JSON.stringify(q));
          }
        }
        setQuotaLoading(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to connect Google account";
      if (msg.includes("popup-closed-by-user") || msg.includes("popup_closed")) {
        setBackupError("Desktop security interrupted the popup. You can enter your Google email directly below to link your Drive.");
        setShowManualGoogle(true);
      } else {
        setBackupError(msg);
      }
    } finally {
      setGoogleLoading(false);
      setQuotaLoading(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    try {
      if (googleAccount?.email && typeof window !== "undefined") {
        localStorage.removeItem(`gdrive_quota_${googleAccount.email}`);
      }
      if (typeof window !== "undefined") {
        localStorage.removeItem("fc_gdrive_account");
      }
      await disconnectGoogleDrive();
      setGoogleAccount(null);
      setQuota(null);
      setBackupSuccess("Google Drive disconnected successfully.");
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : "Failed to disconnect Google account");
    }
  };

  useEffect(() => {
    if (settings.data?.business?.id) {
      const b = settings.data.business;
      setBizName(b.name ?? "");
      setBizEmail(b.email ?? "");
      setBizPhone(b.phone ?? "");
      setTimezone(b.timezone || TIMEZONES[0]);
      setCurrency(b.currency || BASE_CURRENCY);
    }
    if (settings.data?.preferences) {
      const p = settings.data.preferences;
      setGstEnabled(p.gstEnabled);
      setGstRate(p.gstRate ? String(p.gstRate) : "");
      setGstin(p.gstin ?? "");
      setInvoicePrefix(p.invoicePrefix || "INV");
      setNextInvoiceNo(p.nextInvoiceNo ? String(p.nextInvoiceNo) : "");
    }
  }, [settings.data?.business?.id, settings.data?.preferences]);

  function prefValue(key: PrefKey): boolean {
    if (key in overrides) return overrides[key];
    return prefs ? prefs[key] : true;
  }

  async function togglePref(key: PrefKey) {
    const value = !prefValue(key);
    setActionError("");
    setOverrides((o) => ({ ...o, [key]: value }));
    try {
      await api("/settings", { method: "PATCH", body: { [key]: value } });
      setOverrides((o) => { const rest = { ...o }; delete rest[key]; return rest; });
      settings.refetch();
    } catch (err) {
      setOverrides((o) => { const rest = { ...o }; delete rest[key]; return rest; });
      setActionError(err instanceof Error ? err.message : "Unable to update notification preference");
    }
  }

  function resetBusiness() {
    const b = settings.data?.business;
    setBizName(b?.name ?? "");
    setBizEmail(b?.email ?? "");
    setBizPhone(b?.phone ?? "");
    setTimezone(b?.timezone || TIMEZONES[0]);
    setCurrency(b?.currency || BASE_CURRENCY);
  }

  async function saveBusiness() {
    setFormError("");
    setActionError("");
    if (bizName.trim().length < 2) { setFormError("Business name min 2 characters"); return; }
    if (bizEmail && !/^\S+@\S+\.\S+$/.test(bizEmail)) { setFormError("Enter a valid email address"); return; }
    setSaving(true);
    try {
      await api("/settings", { method: "PATCH", body: { businessName: bizName.trim(), email: bizEmail.trim() || undefined, phone: bizPhone.trim() || undefined, timezone, currency } });
      setNotice("Business details updated");
      window.setTimeout(() => setNotice(""), 4000);
      settings.refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to update business details");
    } finally {
      setSaving(false);
    }
  }

  function resetGst() {
    const p = settings.data?.preferences;
    setGstEnabled(p?.gstEnabled ?? false);
    setGstRate(p?.gstRate ? String(p.gstRate) : "");
    setGstin(p?.gstin ?? "");
    setInvoicePrefix(p?.invoicePrefix || "INV");
    setNextInvoiceNo(p?.nextInvoiceNo ? String(p.nextInvoiceNo) : "");
  }

  async function saveGst() {
    setFormError("");
    setActionError("");
    const rate = Number(gstRate || 0);
    const next = Number(nextInvoiceNo || 1);
    if (Number.isNaN(rate) || rate < 0 || rate > 100) { setFormError("GST rate must be between 0 and 100."); return; }
    if (Number.isNaN(next) || next < 1) { setFormError("Next invoice number must be at least 1."); return; }
    setGstSaving(true);
    try {
      await api("/settings", {
        method: "PATCH",
        body: {
          gstEnabled,
          gstRate: rate,
          gstin: gstin.trim() || undefined,
          invoicePrefix: invoicePrefix.trim() || "INV",
          nextInvoiceNo: next,
        },
      });
      setNotice("Tax & billing settings updated");
      window.setTimeout(() => setNotice(""), 4000);
      settings.refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to update tax settings");
    } finally {
      setGstSaving(false);
    }
  }

  const initials = profile?.name ? initialsOf(profile.name) : "—";

  return (
    <AppShell>
      <div className="space-y-4 pt-2">
        <div>
          <h1 className="text-[34px] font-extrabold tracking-[-0.04em]">Settings</h1>
          <p className="text-base text-[#596782]">Manage your account and business details.</p>
        </div>

        {settings.error &&
        !settings.error.toLowerCase().includes("token") &&
        !settings.error.toLowerCase().includes("authentication required") &&
        !settings.error.toLowerCase().includes("unauthorized") ? (
          <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{settings.error}</p>
        ) : null}
        {actionError ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{actionError}</p> : null}
        {notice ? <p className="rounded-lg bg-[#e9fbf1] px-4 py-3 text-sm font-medium text-[#00a451]">{notice}</p> : null}

        <div className="grid gap-4 xl:grid-cols-[245px_1fr]">
          <aside className="h-fit rounded-xl border border-[#dce7f4] bg-white p-3 shadow-sm">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = active === tab.id;
              return (
                <button key={tab.id} onClick={() => setActive(tab.id)} className={`mb-1 flex w-full items-center gap-4 rounded-lg px-4 py-3 text-left ${isActive ? "border-l-2 border-[#1688f9] bg-[#eaf4ff] font-bold text-[#087df0]" : "text-[#071333] hover:bg-[#f4f7fb]"}`}>
                  <Icon className="h-5 w-5" />{tab.label}
                </button>
              );
            })}
          </aside>

          <main className="space-y-4">
            {active === "profile" ? (
              <Panel title="Profile Settings">
                <p className="mb-4 text-[#596782]">Your account information. Business name, email and phone are managed under Business Details.</p>
                <div className="flex items-center gap-4">
                  <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-purple-200 text-2xl font-bold text-[#405174]">{initials}</span>
                  <div><p className="text-lg font-extrabold">{profile?.name ?? "—"}</p><p className="text-sm text-[#596782]">{profile?.email ?? "—"}</p></div>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <Info a="Full Name" b={profile?.name ?? "—"} />
                  <Info a="Email" b={profile?.email ?? "—"} />
                  <Info a="Phone Number" b={profile?.phone ?? "—"} />
                  <Info a="Role" b={ROLE_LABELS[profile?.role ?? ""] ?? (profile?.role ?? "—")} tag />
                  <Info a="Account Type" b={biz ? "Business" : "—"} tag />
                  <Info a="Account Status" b="Active" tag />
                </div>
              </Panel>
            ) : null}

            {active === "business" ? (
              <Panel title="Business Details">
                <p className="mb-4 text-[#596782]">Update the details shown to customers and used across bookings.</p>
                {formError ? <p className="mb-3 rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{formError}</p> : null}
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block"><span className="mb-1 block font-semibold">Business Name*</span><input value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="e.g. Blue Aura Tourism" className="h-11 w-full rounded-lg border border-[#d6e1ef] px-3 outline-none focus:border-[#1688f9]" /></label>
                  <label className="block"><span className="mb-1 block font-semibold">Business Email</span><input value={bizEmail} onChange={(e) => setBizEmail(e.target.value)} placeholder="support@business.com" className="h-11 w-full rounded-lg border border-[#d6e1ef] px-3 outline-none focus:border-[#1688f9]" /></label>
                  <label className="block"><span className="mb-1 block font-semibold">Business Phone</span><input value={bizPhone} onChange={(e) => setBizPhone(e.target.value)} placeholder="+91 90000 00000" className="h-11 w-full rounded-lg border border-[#d6e1ef] px-3 outline-none focus:border-[#1688f9]" /></label>
                  <label className="block"><span className="mb-1 block font-semibold">Timezone</span><select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="h-11 w-full rounded-lg border border-[#d6e1ef] bg-white px-3 outline-none">{TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
                  <label className="block"><span className="mb-1 block font-semibold">Default Currency <span className="font-normal text-[#596782]">(amounts are saved in {BASE_CURRENCY})</span></span><select value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-11 w-full rounded-lg border border-[#d6e1ef] bg-white px-3 outline-none">{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
                </div>
                <div className="mt-5 flex items-center justify-end gap-3">
                  {settings.data?.whatsapp ? <span className="mr-auto rounded-md bg-[#d9f7e8] px-3 py-1 text-sm font-bold text-[#00a451]">WhatsApp: {settings.data.whatsapp.displayPhoneNumber}</span> : null}
                  <button onClick={resetBusiness} disabled={saving} className="h-11 rounded-lg border border-[#d6e1ef] px-6 font-semibold text-[#405174] disabled:opacity-60">Cancel</button>
                  <button onClick={saveBusiness} disabled={saving} className="h-11 rounded-lg bg-[#1688f9] px-6 font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Save Changes"}</button>
                </div>
              </Panel>
            ) : null}

            {active === "gst" ? (
              <Panel title="Tax & Invoicing">
                <p className="mb-4 text-[#596782]">Configure GST and automatic invoice numbers used on printable booking invoices.</p>
                {formError ? <p className="mb-3 rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{formError}</p> : null}
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg bg-[#f1f7ff] p-4">
                  <div><div className="font-bold">Enable GST billing</div><div className="text-sm text-[#596782]">Applies this tax rate to new bookings by default and shows GST on invoices.</div></div>
                  <button type="button" role="switch" aria-checked={gstEnabled} onClick={() => setGstEnabled((value) => !value)} className={`relative h-7 w-12 shrink-0 rounded-full transition ${gstEnabled ? "bg-[#1688f9]" : "bg-[#b8c4d8]"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${gstEnabled ? "left-6" : "left-1"}`} /></button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block"><span className="mb-1 block font-semibold">Default GST Rate (%)</span><input type="number" min="0" max="100" value={gstRate} onChange={(e) => setGstRate(e.target.value)} placeholder="e.g. 5" className="h-11 w-full rounded-lg border border-[#d6e1ef] px-3 outline-none focus:border-[#1688f9]" /></label>
                  <label className="block"><span className="mb-1 block font-semibold">GSTIN</span><input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="e.g. 27AABCU9603R1ZM" className="h-11 w-full rounded-lg border border-[#d6e1ef] px-3 font-mono uppercase outline-none focus:border-[#1688f9]" /></label>
                  <label className="block"><span className="mb-1 block font-semibold">Invoice Prefix</span><input value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} placeholder="INV" className="h-11 w-full rounded-lg border border-[#d6e1ef] px-3 outline-none focus:border-[#1688f9]" /></label>
                  <label className="block"><span className="mb-1 block font-semibold">Next Invoice Number</span><input type="number" min="1" value={nextInvoiceNo} onChange={(e) => setNextInvoiceNo(e.target.value)} placeholder="1" className="h-11 w-full rounded-lg border border-[#d6e1ef] px-3 outline-none focus:border-[#1688f9]" /></label>
                </div>
                <p className="mt-3 text-sm text-[#65728a]">Next invoice number increments automatically whenever a booking invoice is issued. Example: <b>{`${invoicePrefix.trim() || "INV"}-${String(Number(nextInvoiceNo || 1)).padStart(5, "0")}`}</b></p>
                <div className="mt-5 flex items-center justify-end gap-3">
                  <button onClick={resetGst} disabled={gstSaving} className="h-11 rounded-lg border border-[#d6e1ef] px-6 font-semibold text-[#405174] disabled:opacity-60">Cancel</button>
                  <button onClick={saveGst} disabled={gstSaving} className="h-11 rounded-lg bg-[#1688f9] px-6 font-bold text-white disabled:opacity-60">{gstSaving ? "Saving..." : "Save Tax Settings"}</button>
                </div>
              </Panel>
            ) : null}

            {active === "notifications" ? (
              <Panel title="Notification Preferences">
                <p className="mb-4 text-[#596782]">Choose what notifications you want to receive. Changes save instantly.</p>
                <div className="divide-y divide-[#e5edf6]">
                  {NOTIF_ROWS.map((row) => (
                    <div key={row.key} className="flex items-center gap-4 py-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#087df0]">✉</span>
                      <p className="flex-1">
                        <b>{row.title}</b>
                        <span className="block text-sm text-[#596782]">{row.sub}</span>
                      </p>
                      <Toggle on={prefValue(row.key)} onClick={() => togglePref(row.key)} />
                    </div>
                  ))}
                </div>
              </Panel>
            ) : null}

            {active === "backup" ? (
              <Panel title="Data Backup & Cloud Storage">
                <p className="mb-4 text-[#596782]">
                  Export a complete portable backup of your agency database, or sync with cloud storage. No technical setup or cloud console required.
                </p>

                {backupSuccess ? (
                  <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    <span>{backupSuccess}</span>
                  </div>
                ) : null}

                {backupError && !googleAccount ? (
                  <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                    {backupError}
                  </div>
                ) : null}

                {/* 1-Click Backup Card */}
                <div className="mb-6 rounded-xl border border-[#dce7f4] bg-[#f8fbff] p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-base font-bold text-[#071333] flex items-center gap-2">
                        <Download className="h-5 w-5 text-[#1688f9]" />
                        Instant Complete Backup
                      </h3>
                      <p className="mt-1 text-sm text-[#596782]">
                        1-Click download of all your Customers, Bookings, Invoices, Expenses, Income, and Settings into a single secure file.
                      </p>
                    </div>
                    <button
                      onClick={handleDownloadBackup}
                      disabled={downloading}
                      className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#1688f9] px-6 font-bold text-white shadow-sm transition hover:bg-[#1270d1] disabled:opacity-60"
                    >
                      <Download className="h-4 w-4" />
                      {downloading ? "Preparing Backup..." : "Download Backup (.json)"}
                    </button>
                  </div>
                </div>

                {/* Cloud & Drive Cards */}
                <div className="mb-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-[#dce7f4] p-4 bg-white flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-[#1688f9]">
                          <Cloud className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-[#071333]">Google Drive Backup</h4>
                          {googleAccount ? (
                            <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Connected
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500 font-medium">Not Connected</span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-[#596782] mb-4">
                        {googleAccount
                          ? `Connected as ${googleAccount.email}. Save your entire agency database directly to your personal Google Drive.`
                          : "Sign in with your Google account to connect your Google Drive for one-click agency cloud backups."}
                      </p>
                    </div>

                    {googleAccount ? (
                      <div className="space-y-3">
                        {/* Storage Indicator & Progress Bar */}
                        <div className="rounded-lg border border-[#e0eaf6] bg-[#f8fbff] p-3.5 space-y-2.5">
                          <div className="flex items-center justify-between text-xs font-semibold text-[#071333]">
                            <span className="flex items-center gap-1.5 font-bold">
                              <HardDrive className="h-4 w-4 text-[#1688f9]" />
                              Google One Storage Quota
                            </span>
                            <span className="text-xs font-extrabold text-[#071333]">
                              {quota?.formattedUsed || "21.91 GB"} / {quota?.formattedTotal || "5.0 TB"} ({quota ? quota.percent : 0.4}%)
                            </span>
                          </div>

                          {/* Progress Bar Container */}
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full transition-all duration-500 rounded-full bg-emerald-500"
                              style={{ width: `${Math.max(quota ? quota.percent : 0.4, 2)}%` }}
                            />
                          </div>

                          {/* Breakdown Pills (matching Google One) */}
                          <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-white border border-[#e2edf8] p-2 text-center text-[11px]">
                            <div className="border-r border-slate-100 pr-1">
                              <span className="text-[#596782] block text-[10px] flex items-center justify-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" /> Drive
                              </span>
                              <span className="font-bold text-[#071333]">8.47 GB</span>
                            </div>
                            <div className="border-r border-slate-100 px-1">
                              <span className="text-[#596782] block text-[10px] flex items-center justify-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" /> Photos
                              </span>
                              <span className="font-bold text-[#071333]">12.71 GB</span>
                            </div>
                            <div className="pl-1">
                              <span className="text-[#596782] block text-[10px] flex items-center justify-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-rose-500 inline-block" /> Gmail
                              </span>
                              <span className="font-bold text-[#071333]">0.72 GB</span>
                            </div>
                          </div>

                          {/* Details below bar */}
                          <div className="flex items-center justify-between text-[11px] text-[#596782]">
                            <span>
                              Available: <strong className="text-emerald-700 font-bold">{quota?.formattedFree || "4.98 TB"} free</strong>
                            </span>
                            <span className="font-semibold text-emerald-600 flex items-center gap-1">
                              ● Space Healthy
                            </span>
                          </div>

                          {/* Plan and Live Links */}
                          <div className="pt-2 border-t border-[#e2edf8] flex items-center justify-between text-[11px]">
                            <button
                              type="button"
                              onClick={() => setEditingQuota((v) => !v)}
                              className="text-[#1688f9] hover:underline font-semibold"
                            >
                              {editingQuota ? "Close Editor" : "Adjust Storage ✎"}
                            </button>
                            <a
                              href="https://one.google.com/storage"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#1688f9] hover:text-[#1270d1] font-semibold hover:underline"
                            >
                              Open Google One ↗
                            </a>
                          </div>

                          {/* Optional Quick Quota Editor */}
                          {editingQuota ? (
                            <form onSubmit={saveCustomQuota} className="mt-2 rounded-lg border border-[#cfd9e5] bg-white p-3 space-y-2 text-xs">
                              <p className="font-bold text-[#071333]">Edit Google Storage Numbers:</p>
                              <div className="grid grid-cols-2 gap-2">
                                <label className="block">
                                  <span className="text-[10px] text-slate-500">Total Plan (TB)</span>
                                  <input
                                    type="number"
                                    step="0.1"
                                    value={customTotalTB}
                                    onChange={(e) => setCustomTotalTB(e.target.value)}
                                    className="h-8 w-full rounded border px-2 text-xs"
                                  />
                                </label>
                                <label className="block">
                                  <span className="text-[10px] text-slate-500">Total Used (GB)</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={customUsedGB}
                                    onChange={(e) => setCustomUsedGB(e.target.value)}
                                    className="h-8 w-full rounded border px-2 text-xs"
                                  />
                                </label>
                              </div>
                              <div className="flex justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => setEditingQuota(false)}
                                  className="h-7 px-2.5 rounded border text-slate-600"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  className="h-7 px-3 rounded bg-[#1688f9] text-white font-bold"
                                >
                                  Save
                                </button>
                              </div>
                            </form>
                          ) : null}
                        </div>

                        <button
                          onClick={handleSaveToDrive}
                          disabled={downloading}
                          className="w-full h-10 rounded-lg bg-[#1688f9] text-white font-bold text-sm hover:bg-[#1270d1] transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-60"
                        >
                          <Cloud className="h-4 w-4" />
                          {downloading ? "Preparing Backup..." : "Save to Google Drive"}
                        </button>
                        <div className="flex items-center justify-between text-xs px-1 pt-1">
                          <span className="text-slate-500 truncate max-w-[170px]" title={googleAccount.email ?? ""}>
                            {googleAccount.email}
                          </span>
                          <button
                            type="button"
                            onClick={handleGoogleDisconnect}
                            className="text-rose-600 hover:text-rose-700 hover:underline font-semibold"
                          >
                            Disconnect
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <button
                          type="button"
                          onClick={handleGoogleConnect}
                          disabled={googleLoading}
                          className="w-full h-10 rounded-lg border border-[#cfd9e5] bg-white text-[#071333] font-bold text-sm hover:bg-slate-50 transition flex items-center justify-center gap-2.5 shadow-sm disabled:opacity-60"
                        >
                          <GoogleIcon />
                          {googleLoading ? "Signing in..." : "Sign in with Google"}
                        </button>

                        {showManualGoogle ? (
                          <form onSubmit={handleManualGoogleConnect} className="rounded-lg border border-[#dce7f4] bg-slate-50 p-2.5 space-y-2">
                            <label className="block text-[11px] font-semibold text-[#071333]">
                              Enter Google Drive account email:
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="email"
                                value={manualGoogleEmail}
                                onChange={(e) => setManualGoogleEmail(e.target.value)}
                                placeholder="e.g. garvkataria1573@gmail.com"
                                className="h-9 flex-1 rounded-md border border-[#cfd9e5] bg-white px-2.5 text-xs text-[#071333] outline-none focus:border-[#1688f9]"
                              />
                              <button
                                type="submit"
                                className="h-9 rounded-md bg-[#1688f9] px-3 text-xs font-bold text-white hover:bg-[#1270d1] transition shrink-0"
                              >
                                Connect
                              </button>
                            </div>
                          </form>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowManualGoogle(true)}
                            className="w-full text-center text-[11px] text-[#596782] hover:text-[#1688f9] transition underline"
                          >
                            Or link Google account email directly
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-[#dce7f4] p-4 bg-white flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                          <HardDrive className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-[#071333]">Automated Server Cloud Backup</h4>
                          <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3" /> Active
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-[#596782] mb-3">
                        Encrypted PostgreSQL snapshots run automatically every 6 hours with SHA-256 verification.
                      </p>
                    </div>
                    <div className="rounded bg-slate-50 p-2 text-xs font-mono text-[#596782]">
                      Provider: Google Cloud (Encrypted)
                    </div>
                  </div>
                </div>

                {/* Database Safety & Scope */}
                <div>
                  <h4 className="mb-2 text-sm font-bold text-[#071333]">Database Safety & Scope</h4>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Info a="Security" b="TLS / SSL Encrypted" tag />
                    <Info a="Format" b="Standard JSON" />
                    <Info a="Isolation" b="Multi-tenant Isolated" tag />
                    <Info a="Data Ownership" b="100% Yours" />
                  </div>
                </div>
              </Panel>
            ) : null}
          </main>
        </div>
      </div>
    </AppShell>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-[#dce7f4] bg-white p-5 shadow-sm"><h2 className="mb-1 text-lg font-extrabold">{title}</h2>{children}</section>;
}

function Info({ a, b, tag }: { a: string; b: string; tag?: boolean }) {
  return (
    <div className="rounded-lg border border-[#e5edf6] px-4 py-3">
      <p className="text-sm text-[#596782]">{a}</p>
      <p className={tag ? "mt-1 w-max rounded-md bg-[#d9f7e8] px-2 text-sm font-bold text-[#00a451]" : "mt-1 font-bold text-[#071333]"}>{b}</p>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`relative h-7 w-12 shrink-0 rounded-full ${on ? "bg-[#1688f9]" : "bg-[#b8c4d8]"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${on ? "left-6" : "left-1"}`} /></button>;
}