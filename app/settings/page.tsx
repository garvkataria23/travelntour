"use client";

import { AppShell } from "@/components/dashboard/app-shell";
import { initialsOf } from "@/components/dashboard/ui";
import { useApi } from "@/lib/hooks";
import { API_BASE, api, getAccessToken, getStoredUser } from "@/lib/api";
import { BASE_CURRENCY, useCurrency } from "@/lib/currency";
import { PhoneInput } from "@/components/ui/phone-input";
import { formatPhoneDisplay, parsePhoneNumber, validatePhoneNumber } from "@/lib/phone-utils";
import {
  AlertCircle,
  Bell,
  Briefcase,
  Check,
  CheckCircle2,
  Cloud,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  HardDrive,
  Loader2,
  MessageCircle,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { WhatsAppQuotaBanner } from "@/components/whatsapp/whatsapp-quota-banner";
import { PermissionGate } from "@/components/dashboard/can";
import { BackupConsole } from "@/components/backup/backup-console";
import { BackupStoragePanel } from "@/components/backup/backup-storage-panel";
import { RestorePanel } from "@/components/backup/restore-panel";
import { StaffRoleManager } from "@/components/admin/staff-role-manager";
import { hasAnyPermission, type Permission } from "@/lib/permissions";
import { formatStorageBytes } from "@/lib/firebase";
import { generateExcelBackup, triggerFileDownload, type BusinessBackupPayload } from "@/lib/backup-export";
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
    taxLabel?: string | null;
    invoicePrefix: string;
    nextInvoiceNo: number;
    bankName?: string | null;
    bankAccountName?: string | null;
    bankAccountNumber?: string | null;
    bankIfscSwift?: string | null;
    bankUpiId?: string | null;
    invoiceTerms?: string | null;
    invoiceNotes?: string | null;
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
  STAFF: "Staff",
};

const TABS: ReadonlyArray<{
  id: string;
  label: string;
  icon: typeof User;
  permissions?: Permission[];
}> = [
  { id: "profile", label: "Profile", icon: User },
  { id: "team", label: "Staff, Roles & Bookings", icon: Users, permissions: ["user:view", "user:create", "user:edit"] },
  { id: "business", label: "Business Details", icon: Briefcase, permissions: ["settings:manage"] },
  { id: "gst", label: "Tax & Invoicing", icon: ReceiptText, permissions: ["settings:manage"] },
  { id: "notifications", label: "Notification Preferences", icon: Bell },
  { id: "whatsapp", label: "WhatsApp & Limits", icon: MessageCircle },
  { id: "backup", label: "Backup & Cloud", icon: Database, permissions: ["backup:view"] },
];

function visibleTabs() {
  return TABS.filter((tab) => tab.permissions === undefined || hasAnyPermission(tab.permissions));
}


type TabId = (typeof TABS)[number]["id"];

export default function SettingsPage() {
  const [active, setActive] = useState<TabId>("profile");
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam && TABS.some((t) => t.id === tabParam)) {
        setActive(tabParam as TabId);
      }
    }
  }, []);
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
  const [taxLabel, setTaxLabel] = useState("GST");
  const [invoicePrefix, setInvoicePrefix] = useState("INV");
  const [nextInvoiceNo, setNextInvoiceNo] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankIfscSwift, setBankIfscSwift] = useState("");
  const [bankUpiId, setBankUpiId] = useState("");
  const [invoiceTerms, setInvoiceTerms] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [gstSaving, setGstSaving] = useState(false);

  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [downloadingJson, setDownloadingJson] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState("");
  const [backupError, setBackupError] = useState("");

  const [driveFormat, setDriveFormat] = useState<"xlsx" | "json">("xlsx");
// Local file downloads only. These are a convenience for a human, not a backup: nothing is
  // retained server-side. Retained, scheduled, restorable archives live in the BackupConsole and
  // are platform-owner only.
  //
  // The block that used to live here uploaded from the browser to the *user's personal* Google
  // Drive using a localStorage-held OAuth token, and on any failure fell through to a local
  // download while rendering "Actually Saved to Google Drive! Verified / Cloud Verification:
  // Confirmed in Drive". It also had a "manual connect" that accepted any typed email address, and
  // an editable storage-quota form whose numbers were never sent to Google. All of that was
  // removed: the destination is a Google service account held by the server.

  const handleDownloadExcel = async () => {
    try {
      setDownloadingExcel(true);
      setBackupError("");
      setBackupSuccess("");
      // Guarded: the previous code fell back to the *user id* and then the literal string
      // "default", so a tenant with settings still loading exported an empty or wrong-tenant file.
      const businessId = settings.data?.business?.id;
      if (!businessId) {
        setBackupError("Business is still loading, so an export could target the wrong tenant. Try again in a moment.");
        return;
      }
      const backupData = await exportFullBusinessBackup(businessId);
      const blob = generateExcelBackup(backupData as BusinessBackupPayload);
      const fileName = `flyconnect-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      triggerFileDownload(blob, fileName);
      setBackupSuccess(`Exported ${(blob.size / 1024).toFixed(1)} KB. This is a download, not a stored backup.`);
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : "Failed to generate Excel export");
    } finally {
      setDownloadingExcel(false);
    }
  };

  const handleDownloadJson = async () => {
    try {
      setDownloadingJson(true);
      setBackupError("");
      setBackupSuccess("");
      const businessId = settings.data?.business?.id;
      if (!businessId) {
        setBackupError("Business is still loading, so an export could target the wrong tenant. Try again in a moment.");
        return;
      }
      const backupData = await exportFullBusinessBackup(businessId);
      // triggerFileDownload returns void, so size the payload directly rather than pretending to
      // measure a handle that does not exist.
      const text = JSON.stringify(backupData, null, 2);
      triggerFileDownload(
        new Blob([text], { type: "application/json" }),
        `flyconnect-export-${new Date().toISOString().slice(0, 10)}.json`,
      );
      setBackupSuccess(
        `Exported ${(new Blob([text]).size / 1024).toFixed(1)} KB. This is a download, not a stored backup.`,
      );
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : "Failed to generate JSON export");
    } finally {
      setDownloadingJson(false);
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
      setTaxLabel(p.taxLabel || "GST");
      setInvoicePrefix(p.invoicePrefix || "INV");
      setNextInvoiceNo(p.nextInvoiceNo ? String(p.nextInvoiceNo) : "");
      setBankName(p.bankName ?? "");
      setBankAccountName(p.bankAccountName ?? "");
      setBankAccountNumber(p.bankAccountNumber ?? "");
      setBankIfscSwift(p.bankIfscSwift ?? "");
      setBankUpiId(p.bankUpiId ?? "");
      setInvoiceTerms(p.invoiceTerms ?? "");
      setInvoiceNotes(p.invoiceNotes ?? "");
    }
  // Depends on the whole business object rather than just its id: the effect reads many fields
  // (logo, currency, timezone, bank details, invoice terms) and previously only re-ran when the
  // id changed, so a settings PATCH refreshed the id-stable fields on screen but not in state.
  }, [settings.data?.business, settings.data?.preferences]);

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
    if (bizPhone.trim()) {
      const parsed = parsePhoneNumber(bizPhone);
      const phoneVal = validatePhoneNumber(parsed.country.iso, parsed.nationalNumber);
      if (!phoneVal.isValid) {
        setFormError(phoneVal.error || "Please enter a valid business phone number.");
        return;
      }
    }
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
    setTaxLabel(p?.taxLabel || "GST");
    setInvoicePrefix(p?.invoicePrefix || "INV");
    setNextInvoiceNo(p?.nextInvoiceNo ? String(p.nextInvoiceNo) : "");
    setBankName(p?.bankName ?? "");
    setBankAccountName(p?.bankAccountName ?? "");
    setBankAccountNumber(p?.bankAccountNumber ?? "");
    setBankIfscSwift(p?.bankIfscSwift ?? "");
    setBankUpiId(p?.bankUpiId ?? "");
    setInvoiceTerms(p?.invoiceTerms ?? "");
    setInvoiceNotes(p?.invoiceNotes ?? "");
  }

  async function saveGst() {
    setFormError("");
    setActionError("");
    const rate = Number(gstRate || 0);
    const next = Number(nextInvoiceNo || 1);
    if (Number.isNaN(rate) || rate < 0 || rate > 100) { setFormError("Tax rate must be between 0 and 100."); return; }
    if (Number.isNaN(next) || next < 1) { setFormError("Next invoice number must be at least 1."); return; }
    setGstSaving(true);
    try {
      await api("/settings", {
        method: "PATCH",
        body: {
          gstEnabled,
          gstRate: rate,
          gstin: gstin.trim() || undefined,
          taxLabel: taxLabel.trim() || "GST",
          invoicePrefix: invoicePrefix.trim() || "INV",
          nextInvoiceNo: next,
          bankName: bankName.trim() || undefined,
          bankAccountName: bankAccountName.trim() || undefined,
          bankAccountNumber: bankAccountNumber.trim() || undefined,
          bankIfscSwift: bankIfscSwift.trim() || undefined,
          bankUpiId: bankUpiId.trim() || undefined,
          invoiceTerms: invoiceTerms.trim() || undefined,
          invoiceNotes: invoiceNotes.trim() || undefined,
        },
      });
      setNotice("Tax, invoicing and bank details saved");
      window.setTimeout(() => setNotice(""), 4000);
      settings.refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to update tax settings");
    } finally {
      setGstSaving(false);
    }
  }

  const initials = profile?.name ? initialsOf(profile.name) : "â€”";

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
            {visibleTabs().map((tab) => {
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
                  <div><p className="text-lg font-extrabold">{profile?.name ?? "â€”"}</p><p className="text-sm text-[#596782]">{profile?.email ?? "â€”"}</p></div>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <Info a="Full Name" b={profile?.name ?? "â€”"} />
                  <Info a="Email" b={profile?.email ?? "â€”"} />
                  <Info a="Phone Number" b={formatPhoneDisplay(profile?.phone)} />
                  <Info a="Role" b={ROLE_LABELS[profile?.role ?? ""] ?? (profile?.role ?? "â€”")} tag />
                  <Info a="Account Type" b={biz ? "Business" : "â€”"} tag />
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
                  <div>
                    <span className="mb-1 block font-semibold">Business Phone</span>
                    <PhoneInput
                      value={bizPhone}
                      onChange={(e164) => setBizPhone(e164)}
                    />
                  </div>
                  <label className="block"><span className="mb-1 block font-semibold">Timezone</span><select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="h-11 w-full rounded-lg border border-[#d6e1ef] bg-white px-3 outline-none">{TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
                  <label className="block"><span className="mb-1 block font-semibold">Default Currency <span className="font-normal text-[#596782]">(amounts are saved in {BASE_CURRENCY})</span></span><select value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-11 w-full rounded-lg border border-[#d6e1ef] bg-white px-3 outline-none">{currencyOptions.map((c) => <option key={c.code} value={c.code}>{c.code} - {c.name}</option>)}</select></label>
                </div>
                <div className="mt-5 flex items-center justify-end gap-3">
                  {settings.data?.whatsapp ? <span className="mr-auto rounded-md bg-[#d9f7e8] px-3 py-1 text-sm font-bold text-[#00a451]">WhatsApp: {settings.data.whatsapp.displayPhoneNumber}</span> : null}
                  <button onClick={resetBusiness} disabled={saving} className="h-11 rounded-lg border border-[#d6e1ef] px-6 font-semibold text-[#405174] disabled:opacity-60">Cancel</button>
                  <button onClick={saveBusiness} disabled={saving} className="h-11 rounded-lg bg-[#1688f9] px-6 font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Save Changes"}</button>
                </div>
              </Panel>
            ) : null}

            {active === "gst" ? (
              <Panel title="Tax, Invoicing & Banking Details">
                <p className="mb-4 text-[#596782]">Configure tax rates, invoice numbering, bank payment instructions, and custom terms printed on customer invoices.</p>
                {formError ? <p className="mb-3 rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{formError}</p> : null}

                {/* Section 1: Tax Settings */}
                <div className="mb-6 rounded-xl border border-[#dce7f4] bg-[#f8fbff] p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="font-bold text-[#071333]">Enable Tax / GST Billing</div>
                      <div className="text-sm text-[#596782]">Applies this tax rate to new bookings by default and calculates taxes on invoices.</div>
                    </div>
                    <button type="button" role="switch" aria-checked={gstEnabled} onClick={() => setGstEnabled((value) => !value)} className={`relative h-7 w-12 shrink-0 rounded-full transition ${gstEnabled ? "bg-[#1688f9]" : "bg-[#b8c4d8]"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${gstEnabled ? "left-6" : "left-1"}`} /></button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold">Tax Type / Label</span>
                      <input value={taxLabel} onChange={(e) => setTaxLabel(e.target.value)} placeholder="e.g. GST, VAT, TRN" className="h-11 w-full rounded-lg border border-[#d6e1ef] bg-white px-3 font-semibold uppercase outline-none focus:border-[#1688f9]" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold">Default Tax Rate (%)</span>
                      <input type="number" min="0" max="100" value={gstRate} onChange={(e) => setGstRate(e.target.value)} placeholder="e.g. 5" className="h-11 w-full rounded-lg border border-[#d6e1ef] bg-white px-3 outline-none focus:border-[#1688f9]" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold">Tax Registration ID ({taxLabel.toUpperCase() || "GSTIN"})</span>
                      <input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="e.g. 27AABCU9603R1ZM" className="h-11 w-full rounded-lg border border-[#d6e1ef] bg-white px-3 font-mono uppercase outline-none focus:border-[#1688f9]" />
                    </label>
                  </div>
                </div>

                {/* Section 2: Invoice Sequence */}
                <div className="mb-6 rounded-xl border border-[#dce7f4] p-4">
                  <h3 className="mb-3 font-bold text-[#071333]">Invoice Numbering Sequence</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold">Invoice Prefix</span>
                      <input value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} placeholder="INV" className="h-11 w-full rounded-lg border border-[#d6e1ef] px-3 font-semibold uppercase outline-none focus:border-[#1688f9]" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold">Next Invoice Number</span>
                      <input type="number" min="1" value={nextInvoiceNo} onChange={(e) => setNextInvoiceNo(e.target.value)} placeholder="1" className="h-11 w-full rounded-lg border border-[#d6e1ef] px-3 outline-none focus:border-[#1688f9]" />
                    </label>
                  </div>
                  <p className="mt-2.5 text-xs text-[#65728a]">Next invoice generated will be formatted as: <b className="font-mono text-[#0e2a5c]">{`${invoicePrefix.trim() || "INV"}-${String(Number(nextInvoiceNo || 1)).padStart(5, "0")}`}</b></p>
                </div>

                {/* Section 3: Agency Bank & Payment Details */}
                <div className="mb-6 rounded-xl border border-[#dce7f4] bg-[#fdfefe] p-4">
                  <h3 className="mb-1 font-bold text-[#071333]">Agency Bank &amp; Payment Instructions</h3>
                  <p className="mb-3 text-xs text-[#596782]">These details are automatically printed on invoices and PDF downloads so clients know where to send payment.</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold">Bank Name</span>
                      <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Emirates NBD / HDFC Bank" className="h-11 w-full rounded-lg border border-[#d6e1ef] px-3 outline-none focus:border-[#1688f9]" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold">Account / Beneficiary Name</span>
                      <input value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} placeholder="e.g. FlyConnect Travel Agency LLC" className="h-11 w-full rounded-lg border border-[#d6e1ef] px-3 outline-none focus:border-[#1688f9]" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold">Account Number / IBAN</span>
                      <input value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} placeholder="e.g. AE000000000000000000000" className="h-11 w-full rounded-lg border border-[#d6e1ef] px-3 font-mono outline-none focus:border-[#1688f9]" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold">SWIFT / BIC / IFSC Code</span>
                      <input value={bankIfscSwift} onChange={(e) => setBankIfscSwift(e.target.value)} placeholder="e.g. EBILAEADXXX" className="h-11 w-full rounded-lg border border-[#d6e1ef] px-3 font-mono uppercase outline-none focus:border-[#1688f9]" />
                    </label>
                    <label className="block md:col-span-2">
                      <span className="mb-1 block text-sm font-semibold">UPI ID / Quick Payment Note (Optional)</span>
                      <input value={bankUpiId} onChange={(e) => setBankUpiId(e.target.value)} placeholder="e.g. agency@okhdfcbank" className="h-11 w-full rounded-lg border border-[#d6e1ef] px-3 outline-none focus:border-[#1688f9]" />
                    </label>
                  </div>
                </div>

                {/* Section 4: Terms & Conditions and Footer Notes */}
                <div className="mb-6 rounded-xl border border-[#dce7f4] p-4">
                  <h3 className="mb-1 font-bold text-[#071333]">Invoice Terms &amp; Footer Notes</h3>
                  <p className="mb-3 text-xs text-[#596782]">Specify your cancellation/refund policies, payment terms, or custom greeting printed at the bottom of customer invoices.</p>
                  <div className="space-y-4">
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold">Terms &amp; Conditions</span>
                      <textarea rows={2} value={invoiceTerms} onChange={(e) => setInvoiceTerms(e.target.value)} placeholder="e.g. Flight tickets are subject to airline fare rules and cancellation fees. Date change penalties apply." className="w-full rounded-lg border border-[#d6e1ef] p-3 text-sm outline-none focus:border-[#1688f9]" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold">Footer Notes / Greeting</span>
                      <textarea rows={2} value={invoiceNotes} onChange={(e) => setInvoiceNotes(e.target.value)} placeholder="e.g. Thank you for travelling with us! For immediate assistance, contact our 24/7 hotline." className="w-full rounded-lg border border-[#d6e1ef] p-3 text-sm outline-none focus:border-[#1688f9]" />
                    </label>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-end gap-3">
                  <button onClick={resetGst} disabled={gstSaving} className="h-11 rounded-lg border border-[#d6e1ef] px-6 font-semibold text-[#405174] disabled:opacity-60">Cancel</button>
                  <button onClick={saveGst} disabled={gstSaving} className="h-11 rounded-lg bg-[#1688f9] px-6 font-bold text-white disabled:opacity-60">{gstSaving ? "Saving..." : "Save Settings"}</button>
                </div>
              </Panel>
            ) : null}

            {active === "notifications" ? (
              <Panel title="Notification Preferences">
                <p className="mb-4 text-[#596782]">Choose what notifications you want to receive. Changes save instantly.</p>
                <div className="divide-y divide-[#e5edf6]">
                  {NOTIF_ROWS.map((row) => (
                    <div key={row.key} className="flex items-center gap-4 py-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#087df0]">âœ‰</span>
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

            {active === "whatsapp" ? (
              <Panel title="WhatsApp Messaging & Monthly Quota Management">
                <p className="mb-4 text-sm text-[#596782]">
                  Monitor WhatsApp delivery limits, configure administrative alerts, and manage message capacity.
                  Standard limit is 1,000 messages with early warnings at 800 (80%) and 950 (95%).
                </p>

                <div className="space-y-6">
                  <WhatsAppQuotaBanner />

                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                    <h4 className="font-extrabold text-slate-900 text-sm">Strict Lockout Policy & Multi-Stage Alerts</h4>
                    <div className="grid gap-3 sm:grid-cols-3 text-xs">
                      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
                        <span className="font-extrabold text-amber-900 block mb-1">800 Messages (80%)</span>
                        <p className="text-amber-800 leading-relaxed font-medium">Early warning alert displayed across messaging pages. Prompts team to contact Admin before exhausting quota.</p>
                      </div>
                      <div className="rounded-xl border border-orange-200 bg-orange-50/70 p-3.5">
                        <span className="font-extrabold text-orange-950 block mb-1">950 Messages (95%)</span>
                        <p className="text-orange-900 leading-relaxed font-medium">Urgent critical alert banner displayed. Highlights &quot;To upgrade your limits, contact Admin&quot;.</p>
                      </div>
                      <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5">
                        <span className="font-extrabold text-rose-950 block mb-1">1,000 Messages (100%)</span>
                        <p className="text-rose-900 leading-relaxed font-medium">Strict hard cap. Not a single additional message can be sent until Admin upgrades limit from their end.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Panel>
            ) : null}

{active === "backup" ? (
              <Panel title="Data Backup & Cloud Storage">
                <p className="mb-4 text-[#596782]">
                  Download a portable export of your own agency data, or â€” if you are the platform
                  owner â€” manage the scheduled archives that are retained on Google Drive.
                </p>

                {backupSuccess ? (
                  <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    <span>{backupSuccess}</span>
                  </div>
                ) : null}

                {backupError ? (
                  <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                    {backupError}
                  </div>
                ) : null}

                {/* Local export. A download, not a backup â€” nothing is retained server-side. */}
                <div className="mb-6 rounded-xl border border-[#dce7f4] bg-[#f8fbff] p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-base font-bold text-[#071333] flex items-center gap-2">
                        <Download className="h-5 w-5 text-[#1688f9]" />
                        Export your data
                      </h3>
                      <p className="mt-1 text-sm text-[#596782]">
                        Customers, bookings, invoices, expenses and income as an Excel workbook or raw
                        JSON. Refuses to run until your business has loaded, so it cannot silently
                        export the wrong tenant.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={handleDownloadExcel}
                        disabled={downloadingExcel}
                        className="inline-flex items-center gap-2 rounded-lg bg-[#1688f9] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#0e74db] disabled:opacity-60"
                      >
                        {downloadingExcel ? "Preparingâ€¦" : "Download Excel"}
                      </button>
                      <button
                        onClick={handleDownloadJson}
                        disabled={downloadingJson}
                        className="inline-flex items-center gap-2 rounded-lg border border-[#dce7f4] bg-white px-4 py-2.5 text-sm font-bold text-[#071333] transition hover:bg-[#f4f8fd] disabled:opacity-60"
                      >
                        {downloadingJson ? "Preparingâ€¦" : "Download JSON"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Retained archives. Platform owner only, and the API enforces the same. */}
                <div className="mb-6">
                  <h3 className="mb-1 text-base font-bold text-[#071333]">Stored archives</h3>
                  <p className="mb-3 text-sm text-[#596782]">
                    Scheduled backups run on the server and are written to a Google Drive folder
                    owned by a service account â€” not from a browser, and not tied to any individual
                    Google account.
                  </p>
                  <BackupConsole />
                </div>

                {/* Live Drive storage and account management. Kept above restore because it is
                    everyday operations; restore is destructive and stays in its own block. */}
                <div className="mb-6">
                  <BackupStoragePanel />
                </div>

                {/* Restore. The most destructive operation in the product, so it lives in its own
                    visually distinct block and demands an explicit plan review plus a typed
                    confirmation. The server refuses without the phrase and takes a safety archive
                    before it writes anything. */}
                <div className="mb-6">
                  <h3 className="mb-1 text-base font-bold text-rose-800">Restore from an archive</h3>
                  <p className="mb-3 text-sm text-[#596782]">
                    Replaces a tenant&apos;s live data with the contents of a backup file. Review the
                    plan before confirming.
                  </p>
                  <RestorePanel />
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

            {active === "team" ? (
              <StaffRoleManager />
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
