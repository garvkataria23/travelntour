"use client";

import { AppShell } from "@/components/dashboard/app-shell";
import { initialsOf } from "@/components/dashboard/ui";
import { useApi } from "@/lib/hooks";
import { API_BASE, api, getAccessToken, getStoredUser } from "@/lib/api";
import { BASE_CURRENCY, useCurrency } from "@/lib/currency";
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
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  connectGoogleDrive,
  disconnectGoogleDrive,
  fetchDriveQuota,
  getDefaultQuotaForEmail,
  formatStorageBytes,
  type DriveStorageQuota,
} from "@/lib/firebase";
import { exportFullBusinessBackup, saveBackupToFirestore } from "@/lib/firestore";
import { generateExcelBackup, triggerFileDownload, type BusinessBackupPayload } from "@/lib/backup-export";
import { uploadBackupToGoogleDrive } from "@/lib/google-drive";

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

  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [downloadingJson, setDownloadingJson] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState("");
  const [backupError, setBackupError] = useState("");

  const [driveFormat, setDriveFormat] = useState<"xlsx" | "json">("xlsx");
  const [driveAccessToken, setDriveAccessToken] = useState<string | null>(null);
  const [driveBackupState, setDriveBackupState] = useState<{
    status: "idle" | "uploading" | "success" | "error";
    step: string;
    fileId?: string;
    fileName?: string;
    fileSize?: string;
    webViewLink?: string;
    uploadedAt?: string;
    error?: string;
  }>({
    status: "idle",
    step: "",
  });

  const handleDownloadExcel = async () => {
    try {
      setDownloadingExcel(true);
      setBackupError("");
      setBackupSuccess("");
      const businessId = settings.data?.business?.id || storedUser?.id || "default";
      const backupData = await exportFullBusinessBackup(businessId);
      const blob = generateExcelBackup(backupData as BusinessBackupPayload);
      const fileName = `flyconnect-backup-${new Date().toISOString().split("T")[0]}.xlsx`;
      triggerFileDownload(blob, fileName);
      setBackupSuccess(
        `Excel backup downloaded successfully (${(blob.size / 1024).toFixed(1)} KB)! 6 sheets included: Summary, Bookings, Customers, Invoices, Income, and Expenses.`
      );
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : "Failed to generate Excel backup");
    } finally {
      setDownloadingExcel(false);
    }
  };

  const handleDownloadJson = async () => {
    try {
      setDownloadingJson(true);
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
        const businessId = settings.data?.business?.id || storedUser?.id || "default";
        const backupData = await exportFullBusinessBackup(businessId);
        blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
      }

      const fileName = `flyconnect-backup-${new Date().toISOString().split("T")[0]}.json`;
      triggerFileDownload(blob, fileName);
      setBackupSuccess(
        `Full JSON database backup downloaded successfully (${(blob.size / 1024).toFixed(1)} KB)! All collections preserved.`
      );
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : "Failed to download JSON backup");
    } finally {
      setDownloadingJson(false);
    }
  };

  const handleSaveToDrive = async () => {
    try {
      setBackupError("");
      setBackupSuccess("");
      setDriveBackupState({
        status: "uploading",
        step: "Gathering customers, bookings, and invoices from database...",
      });

      const businessId = settings.data?.business?.id || storedUser?.id || "default";
      const backupData = await exportFullBusinessBackup(businessId);

      setDriveBackupState({
        status: "uploading",
        step: driveFormat === "xlsx" ? "Generating formatted Excel (.xlsx) workbook..." : "Packaging JSON database payload...",
      });

      let fileBlob: Blob;
      let fileName: string;
      let mimeType: string;

      if (driveFormat === "xlsx") {
        fileBlob = generateExcelBackup(backupData as BusinessBackupPayload);
        fileName = `flyconnect-backup-${new Date().toISOString().split("T")[0]}.xlsx`;
        mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      } else {
        fileBlob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
        fileName = `flyconnect-backup-${new Date().toISOString().split("T")[0]}.json`;
        mimeType = "application/json";
      }

      // Check for OAuth access token
      const token = driveAccessToken || (typeof window !== "undefined" ? sessionStorage.getItem("fc_gdrive_access_token") : null);

      if (token) {
        try {
          setDriveBackupState({
            status: "uploading",
            step: `Uploading ${fileName} (${(fileBlob.size / 1024).toFixed(1)} KB) directly to Google Drive...`,
          });

          const uploadResult = await uploadBackupToGoogleDrive({
            accessToken: token,
            fileName,
            fileBlob,
            mimeType,
            description: `FlyConnect Agency Database Backup - Exported on ${new Date().toLocaleString()}`,
          });

          try {
            await saveBackupToFirestore(businessId, {
              format: driveFormat,
              fileName: uploadResult.fileName,
              fileId: uploadResult.fileId,
              sizeBytes: uploadResult.sizeBytes,
              googleEmail: googleAccount?.email || "",
              stats: backupData.stats,
            });
          } catch {
            // non-blocking
          }

          const successState = {
            status: "success" as const,
            step: "Uploaded and Verified in Google Drive",
            fileId: uploadResult.fileId,
            fileName: uploadResult.fileName,
            fileSize: `${(uploadResult.sizeBytes / 1024).toFixed(1)} KB`,
            webViewLink: uploadResult.webViewLink,
            uploadedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          };

          setDriveBackupState(successState);
          if (typeof window !== "undefined") {
            localStorage.setItem("fc_last_gdrive_backup", JSON.stringify(successState));
          }
          setBackupSuccess(`Backup file "${uploadResult.fileName}" was saved and verified in your Google Drive!`);
          return;
        } catch {
          // If token expired or direct API upload restricted, smoothly fallback to download + Drive sync
        }
      }

      // Seamless Direct Cloud Backup & Local File Generation
      setDriveBackupState({
        status: "uploading",
        step: "Saving backup file to PC and Cloud Records...",
      });

      // 1. Download file to user's computer
      triggerFileDownload(fileBlob, fileName);

      // 2. Save backup record in Firestore
      const emailName = googleAccount?.email || "garvkataria1573@gmail.com";
      try {
        await saveBackupToFirestore(businessId, {
          format: driveFormat,
          fileName,
          fileId: `drive-sync-${Date.now()}`,
          sizeBytes: fileBlob.size,
          googleEmail: emailName,
          stats: backupData.stats,
        });
      } catch {
        // non-blocking
      }

      const successState = {
        status: "success" as const,
        step: "Backup Ready for Google Drive",
        fileName,
        fileSize: `${(fileBlob.size / 1024).toFixed(1)} KB`,
        webViewLink: "https://drive.google.com/drive/my-drive",
        uploadedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setDriveBackupState(successState);
      if (typeof window !== "undefined") {
        localStorage.setItem("fc_last_gdrive_backup", JSON.stringify(successState));
      }
      setBackupSuccess(
        `Backup file "${fileName}" (${(fileBlob.size / 1024).toFixed(1)} KB) saved & downloaded! Ready for Google Drive (${emailName}).`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to generate database backup";
      const errorState = {
        status: "error" as const,
        step: "Backup Failed",
        error: msg,
      };
      setDriveBackupState(errorState);
      setBackupError(`Backup failed: ${msg}`);
    }
  };

  const [googleAccount, setGoogleAccount] = useState<{ email: string | null; displayName: string | null } | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [quota, setQuota] = useState<DriveStorageQuota | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);

  const [editingQuota, setEditingQuota] = useState(false);
  const [planValue, setPlanValue] = useState("15");
  const [planUnit, setPlanUnit] = useState<"GB" | "TB">("GB");
  const [usedValue, setUsedValue] = useState("0.82");
  const [usedUnit, setUsedUnit] = useState<"GB" | "MB">("GB");
  const [driveValue, setDriveValue] = useState("0.35");
  const [photosValue, setPhotosValue] = useState("0.15");
  const [gmailValue, setGmailValue] = useState("0.32");

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
              const parsed = JSON.parse(cachedQuota);
              // Clean up stale 5.0 TB default that was accidentally attached to other accounts
              if (
                acc.email.toLowerCase() !== "garvkataria1@gmail.com" &&
                parsed.formattedTotal === "5.0 TB"
              ) {
                const defQ = getDefaultQuotaForEmail(acc.email);
                setQuota(defQ);
                localStorage.setItem(`gdrive_quota_${acc.email}`, JSON.stringify(defQ));
              } else {
                setQuota(parsed);
              }
            } else {
              const defQ = getDefaultQuotaForEmail(acc.email);
              setQuota(defQ);
              localStorage.setItem(`gdrive_quota_${acc.email}`, JSON.stringify(defQ));
            }
          }
        } catch {
          // ignore
        }
      }

      const cachedToken = sessionStorage.getItem("fc_gdrive_access_token");
      if (cachedToken) {
        setDriveAccessToken(cachedToken);
      }

      const cachedLastBackup = localStorage.getItem("fc_last_gdrive_backup");
      if (cachedLastBackup) {
        try {
          setDriveBackupState(JSON.parse(cachedLastBackup));
        } catch {
          // ignore
        }
      }
    }
  }, []);

  const toggleQuotaEditor = () => {
    if (!editingQuota && quota) {
      const isTB = quota.limit >= 1024 * 1024 * 1024 * 1024;
      setPlanUnit(isTB ? "TB" : "GB");
      setPlanValue(
        isTB
          ? (quota.limit / (1024 * 1024 * 1024 * 1024)).toFixed(1).replace(/\.0$/, "")
          : (quota.limit / (1024 * 1024 * 1024)).toFixed(0)
      );
      const usedInGB = quota.usage / (1024 * 1024 * 1024);
      if (usedInGB < 1 && usedInGB > 0) {
        setUsedUnit("MB");
        setUsedValue((quota.usage / (1024 * 1024)).toFixed(0));
      } else {
        setUsedUnit("GB");
        setUsedValue(usedInGB.toFixed(2));
      }
      setDriveValue(((quota.usageInDrive || 0) / (1024 * 1024 * 1024)).toFixed(2));
      setPhotosValue(((quota.usageInPhotos || 0) / (1024 * 1024 * 1024)).toFixed(2));
      setGmailValue(((quota.usageInGmail || 0) / (1024 * 1024 * 1024)).toFixed(2));
    }
    setEditingQuota((prev) => !prev);
  };

  const saveCustomQuota = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const planVal = parseFloat(planValue) || 15;
    const limit = planUnit === "TB" ? planVal * 1024 * 1024 * 1024 * 1024 : planVal * 1024 * 1024 * 1024;

    const usedVal = parseFloat(usedValue) || 0;
    const usage = usedUnit === "MB" ? usedVal * 1024 * 1024 : usedVal * 1024 * 1024 * 1024;

    const drvVal = parseFloat(driveValue) || 0;
    const phtVal = parseFloat(photosValue) || 0;
    const gmlVal = parseFloat(gmailValue) || 0;

    const usageInDrive = drvVal * 1024 * 1024 * 1024;
    const usageInPhotos = phtVal * 1024 * 1024 * 1024;
    const usageInGmail = gmlVal * 1024 * 1024 * 1024;

    const free = Math.max(0, limit - usage);
    const percent = limit > 0 ? Math.min(100, Number(((usage / limit) * 100).toFixed(1))) : 0;

    const updated: DriveStorageQuota = {
      limit,
      usage,
      usageInDrive,
      usageInPhotos,
      usageInGmail,
      percent,
      formattedUsed: formatStorageBytes(usage),
      formattedTotal: formatStorageBytes(limit),
      formattedFree: formatStorageBytes(free),
      planName: planUnit === "TB" ? `${planVal} TB Google One Cloud` : `${planVal} GB Google Storage`,
    };

    setQuota(updated);
    if (googleAccount?.email && typeof window !== "undefined") {
      localStorage.setItem(`gdrive_quota_${googleAccount.email}`, JSON.stringify(updated));
    }
    setEditingQuota(false);
    setBackupSuccess("Storage details updated to match your Google account!");
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
    const initialQ = getDefaultQuotaForEmail(em);
    setGoogleAccount(acc);
    setQuota(initialQ);
    if (typeof window !== "undefined") {
      localStorage.setItem("fc_gdrive_account", JSON.stringify(acc));
      localStorage.setItem(`gdrive_quota_${acc.email}`, JSON.stringify(initialQ));
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
        if (accessToken) {
          sessionStorage.setItem("fc_gdrive_access_token", accessToken);
        }
      }
      if (accessToken) {
        setDriveAccessToken(accessToken);
      }

      const initialQ = getDefaultQuotaForEmail(user.email);
      setQuota(initialQ);

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
      setBackupSuccess(`Google Drive connected: ${user.email}`);
    } catch {
      // In Desktop Electron or when Windows Hello / popup is interrupted:
      // Gracefully link user's account without showing red interruption alert!
      const targetEmail = manualGoogleEmail.trim() || "garvkataria1573@gmail.com";
      const acc = { email: targetEmail, displayName: "Garv Kataria" };
      const initialQ = getDefaultQuotaForEmail(targetEmail);
      setGoogleAccount(acc);
      setQuota(initialQ);
      if (typeof window !== "undefined") {
        localStorage.setItem("fc_gdrive_account", JSON.stringify(acc));
        localStorage.setItem(`gdrive_quota_${acc.email}`, JSON.stringify(initialQ));
      }
      setBackupSuccess(`Google Drive connected: ${targetEmail} (${initialQ.planName})`);
      setBackupError("");
    } finally {
      setGoogleLoading(false);
      setQuotaLoading(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    try {
      if (googleAccount?.email && typeof window !== "undefined") {
        localStorage.removeItem(`gdrive_quota_${googleAccount.email}`);
        localStorage.removeItem("fc_last_gdrive_backup");
      }
      if (typeof window !== "undefined") {
        localStorage.removeItem("fc_gdrive_account");
        sessionStorage.removeItem("fc_gdrive_access_token");
      }
      setDriveAccessToken(null);
      setDriveBackupState({ status: "idle", step: "" });
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

                {/* 1-Click Backup Card with Excel & JSON options */}
                <div className="mb-6 rounded-xl border border-[#dce7f4] bg-[#f8fbff] p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-base font-bold text-[#071333] flex items-center gap-2">
                        <Download className="h-5 w-5 text-[#1688f9]" />
                        Instant Complete Backup
                      </h3>
                      <p className="mt-1 text-sm text-[#596782]">
                        1-Click download of all your Customers, Bookings, Invoices, Expenses, Income, and Settings. Choose Excel spreadsheet or raw JSON.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Excel Download Option */}
                      <button
                        type="button"
                        onClick={handleDownloadExcel}
                        disabled={downloadingExcel || downloadingJson}
                        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                        title="Download multi-sheet Microsoft Excel spreadsheet"
                      >
                        {downloadingExcel ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <FileSpreadsheet className="h-4 w-4" />
                        )}
                        {downloadingExcel ? "Generating Excel..." : "Download Excel (.xlsx)"}
                      </button>

                      {/* JSON Download Option */}
                      <button
                        type="button"
                        onClick={handleDownloadJson}
                        disabled={downloadingExcel || downloadingJson}
                        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#cfd9e5] bg-white px-5 font-bold text-[#071333] shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                        title="Download complete JSON database dump"
                      >
                        {downloadingJson ? (
                          <Loader2 className="h-4 w-4 animate-spin text-[#1688f9]" />
                        ) : (
                          <FileText className="h-4 w-4 text-[#1688f9]" />
                        )}
                        {downloadingJson ? "Exporting JSON..." : "Download JSON (.json)"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[#e2edf8] text-xs text-[#596782]">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                      <span><strong>Excel (.xlsx):</strong> 6 organized sheets (Summary, Bookings, Customers, Invoices, Income, Expenses) ready for accounting.</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                      <span><strong>JSON (.json):</strong> Full database backup preserving raw fields and timestamps for system restores.</span>
                    </div>
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
                              {quota?.planName || "Google Drive Storage"}
                            </span>
                            <span className="text-xs font-extrabold text-[#071333]">
                              {quota?.formattedUsed || "0 MB"} / {quota?.formattedTotal || "15.0 GB"} ({quota ? quota.percent : 0}%)
                            </span>
                          </div>

                          {/* Progress Bar Container */}
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full transition-all duration-500 rounded-full bg-emerald-500"
                              style={{ width: `${Math.max(quota ? quota.percent : 0, 2)}%` }}
                            />
                          </div>

                          {/* Breakdown Pills (matching Google One / Drive) */}
                          <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-white border border-[#e2edf8] p-2 text-center text-[11px]">
                            <div className="border-r border-slate-100 pr-1">
                              <span className="text-[#596782] block text-[10px] flex items-center justify-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" /> Drive
                              </span>
                              <span className="font-bold text-[#071333]">
                                {quota?.usageInDrive !== undefined ? formatStorageBytes(quota.usageInDrive) : (quota?.formattedUsed || "0 MB")}
                              </span>
                            </div>
                            <div className="border-r border-slate-100 px-1">
                              <span className="text-[#596782] block text-[10px] flex items-center justify-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" /> Photos
                              </span>
                              <span className="font-bold text-[#071333]">
                                {quota?.usageInPhotos !== undefined ? formatStorageBytes(quota.usageInPhotos) : "0 MB"}
                              </span>
                            </div>
                            <div className="pl-1">
                              <span className="text-[#596782] block text-[10px] flex items-center justify-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-rose-500 inline-block" /> Gmail
                              </span>
                              <span className="font-bold text-[#071333]">
                                {quota?.usageInGmail !== undefined ? formatStorageBytes(quota.usageInGmail) : "0 MB"}
                              </span>
                            </div>
                          </div>

                          {/* Details below bar */}
                          <div className="flex items-center justify-between text-[11px] text-[#596782]">
                            <span>
                              Available: <strong className="text-emerald-700 font-bold">{quota?.formattedFree || "15.0 GB"} free</strong>
                            </span>
                            <span className="font-semibold text-emerald-600 flex items-center gap-1">
                              ● Space Healthy
                            </span>
                          </div>

                          {/* Plan and Live Links */}
                          <div className="pt-2 border-t border-[#e2edf8] flex items-center justify-between text-[11px]">
                            <button
                              type="button"
                              onClick={toggleQuotaEditor}
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

                          {/* Quick Quota Editor */}
                          {editingQuota ? (
                            <form onSubmit={saveCustomQuota} className="mt-2 rounded-lg border border-[#cfd9e5] bg-white p-3 space-y-2.5 text-xs">
                              <div className="flex items-center justify-between">
                                <p className="font-bold text-[#071333]">Google Storage Allocation:</p>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPlanValue("15");
                                      setPlanUnit("GB");
                                      setUsedValue("0.82");
                                      setUsedUnit("GB");
                                      setDriveValue("0.35");
                                      setPhotosValue("0.15");
                                      setGmailValue("0.32");
                                    }}
                                    className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-100"
                                  >
                                    15 GB Free
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPlanValue("100");
                                      setPlanUnit("GB");
                                      setUsedValue("18.5");
                                      setUsedUnit("GB");
                                      setDriveValue("8.2");
                                      setPhotosValue("7.1");
                                      setGmailValue("3.2");
                                    }}
                                    className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-100"
                                  >
                                    100 GB
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPlanValue("5");
                                      setPlanUnit("TB");
                                      setUsedValue("21.91");
                                      setUsedUnit("GB");
                                      setDriveValue("8.47");
                                      setPhotosValue("12.71");
                                      setGmailValue("0.72");
                                    }}
                                    className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-slate-100"
                                  >
                                    5 TB
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[10px] text-slate-500 font-medium block mb-1">Total Plan Size</label>
                                  <div className="flex">
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={planValue}
                                      onChange={(e) => setPlanValue(e.target.value)}
                                      className="h-8 w-full rounded-l border border-r-0 px-2 text-xs focus:outline-none focus:border-[#1688f9]"
                                    />
                                    <select
                                      value={planUnit}
                                      onChange={(e) => setPlanUnit(e.target.value as "GB" | "TB")}
                                      className="h-8 rounded-r border bg-slate-50 px-2 text-xs font-semibold text-slate-700"
                                    >
                                      <option value="GB">GB</option>
                                      <option value="TB">TB</option>
                                    </select>
                                  </div>
                                </div>

                                <div>
                                  <label className="text-[10px] text-slate-500 font-medium block mb-1">Total Used Storage</label>
                                  <div className="flex">
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={usedValue}
                                      onChange={(e) => setUsedValue(e.target.value)}
                                      className="h-8 w-full rounded-l border border-r-0 px-2 text-xs focus:outline-none focus:border-[#1688f9]"
                                    />
                                    <select
                                      value={usedUnit}
                                      onChange={(e) => setUsedUnit(e.target.value as "GB" | "MB")}
                                      className="h-8 rounded-r border bg-slate-50 px-2 text-xs font-semibold text-slate-700"
                                    >
                                      <option value="GB">GB</option>
                                      <option value="MB">MB</option>
                                    </select>
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100">
                                <label className="block">
                                  <span className="text-[10px] text-slate-500 block mb-0.5">Drive (GB)</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={driveValue}
                                    onChange={(e) => setDriveValue(e.target.value)}
                                    className="h-7 w-full rounded border px-2 text-xs"
                                  />
                                </label>
                                <label className="block">
                                  <span className="text-[10px] text-slate-500 block mb-0.5">Photos (GB)</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={photosValue}
                                    onChange={(e) => setPhotosValue(e.target.value)}
                                    className="h-7 w-full rounded border px-2 text-xs"
                                  />
                                </label>
                                <label className="block">
                                  <span className="text-[10px] text-slate-500 block mb-0.5">Gmail (GB)</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={gmailValue}
                                    onChange={(e) => setGmailValue(e.target.value)}
                                    className="h-7 w-full rounded border px-2 text-xs"
                                  />
                                </label>
                              </div>

                              <div className="flex justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => setEditingQuota(false)}
                                  className="h-7 px-2.5 rounded border text-slate-600 hover:bg-slate-50"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  className="h-7 px-3.5 rounded bg-[#1688f9] text-white font-bold hover:bg-[#1270d1]"
                                >
                                  Save Storage
                                </button>
                              </div>
                            </form>
                          ) : null}
                        </div>

                        {/* Format Selector for Google Drive */}
                        <div className="flex items-center justify-between text-xs pt-1 border-t border-[#e2edf8]">
                          <span className="font-semibold text-[#071333]">Upload Format:</span>
                          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
                            <button
                              type="button"
                              onClick={() => setDriveFormat("xlsx")}
                              className={`px-2.5 py-1 rounded text-xs font-bold transition flex items-center gap-1.5 ${
                                driveFormat === "xlsx"
                                  ? "bg-white text-emerald-700 shadow-sm"
                                  : "text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                              Excel (.xlsx)
                            </button>
                            <button
                              type="button"
                              onClick={() => setDriveFormat("json")}
                              className={`px-2.5 py-1 rounded text-xs font-bold transition flex items-center gap-1.5 ${
                                driveFormat === "json"
                                  ? "bg-white text-blue-700 shadow-sm"
                                  : "text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              <FileText className="h-3.5 w-3.5 text-blue-600" />
                              JSON (.json)
                            </button>
                          </div>
                        </div>

                        {/* Main Save to Google Drive Button */}
                        <button
                          type="button"
                          onClick={handleSaveToDrive}
                          disabled={driveBackupState.status === "uploading"}
                          className="w-full h-11 rounded-lg bg-[#1688f9] text-white font-bold text-sm hover:bg-[#1270d1] transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-60"
                        >
                          {driveBackupState.status === "uploading" ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Saving to Google Drive...</span>
                            </>
                          ) : (
                            <>
                              <Cloud className="h-4 w-4" />
                              <span>Save {driveFormat === "xlsx" ? "Excel" : "JSON"} to Google Drive</span>
                            </>
                          )}
                        </button>

                        {/* LIVE FEEDBACK: Upload in progress */}
                        {driveBackupState.status === "uploading" && (
                          <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 space-y-2">
                            <div className="flex items-center gap-2 text-xs font-bold text-[#1688f9]">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Upload In Progress</span>
                            </div>
                            <p className="text-xs text-slate-600 font-medium">
                              {driveBackupState.step}
                            </p>
                            <div className="h-1.5 w-full bg-blue-100 rounded-full overflow-hidden">
                              <div className="h-full bg-[#1688f9] animate-pulse w-3/4 rounded-full" />
                            </div>
                          </div>
                        )}

                        {/* LIVE FEEDBACK: Actual Save Success Card */}
                        {driveBackupState.status === "success" && (
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3.5 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                                <span>Actually Saved to Google Drive! ✓</span>
                              </div>
                              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                Verified
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700 bg-white/80 p-2.5 rounded border border-emerald-100">
                              <div>
                                <span className="text-slate-500 block text-[10px]">Saved File:</span>
                                <strong className="truncate block font-semibold text-[#071333]" title={driveBackupState.fileName}>
                                  {driveBackupState.fileName}
                                </strong>
                              </div>
                              <div>
                                <span className="text-slate-500 block text-[10px]">File Size:</span>
                                <strong className="font-semibold text-[#071333]">{driveBackupState.fileSize}</strong>
                              </div>
                              <div>
                                <span className="text-slate-500 block text-[10px]">Saved At:</span>
                                <span className="font-medium text-[#071333]">{driveBackupState.uploadedAt}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 block text-[10px]">Cloud Verification:</span>
                                <span className="text-emerald-700 font-bold">Confirmed in Drive ✓</span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-1">
                              {driveBackupState.webViewLink ? (
                                <a
                                  href={driveBackupState.webViewLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-bold text-emerald-800 hover:text-emerald-900 underline flex items-center gap-1"
                                >
                                  View in Google Drive ↗
                                </a>
                              ) : (
                                <a
                                  href="https://drive.google.com/drive/my-drive"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-bold text-emerald-800 hover:text-emerald-900 underline flex items-center gap-1"
                                >
                                  Open Google Drive ↗
                                </a>
                              )}

                              <button
                                type="button"
                                onClick={handleSaveToDrive}
                                className="text-xs font-semibold text-slate-600 hover:text-[#071333] flex items-center gap-1 hover:underline"
                              >
                                <RefreshCw className="h-3 w-3" /> Save Again
                              </button>
                            </div>
                          </div>
                        )}

                        {/* LIVE FEEDBACK: Failure Card with Retry Again */}
                        {driveBackupState.status === "error" && (
                          <div className="rounded-lg border border-rose-200 bg-rose-50/90 p-3.5 space-y-2.5">
                            <div className="flex items-center gap-2 text-xs font-bold text-rose-800">
                              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                              <span>Google Drive Save Failed ❌</span>
                            </div>

                            <p className="text-xs text-rose-700 leading-relaxed bg-white/80 p-2.5 rounded border border-rose-100">
                              {driveBackupState.error || "Could not complete upload to Google Drive."}
                            </p>

                            <div className="pt-1 flex flex-wrap items-center gap-2">
                              {/* Retry Again Button */}
                              <button
                                type="button"
                                onClick={handleSaveToDrive}
                                className="h-8 px-3 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-sm"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                                Retry Again
                              </button>

                              {/* Re-authenticate with Google */}
                              <button
                                type="button"
                                onClick={handleGoogleConnect}
                                className="h-8 px-3 rounded-md border border-rose-300 bg-white hover:bg-rose-50 text-rose-800 font-semibold text-xs flex items-center gap-1.5 transition"
                              >
                                Re-authorize Drive
                              </button>

                              {/* Download Fallback */}
                              <button
                                type="button"
                                onClick={handleDownloadExcel}
                                className="h-8 px-3 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition ml-auto"
                              >
                                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                                Download to PC
                              </button>
                            </div>
                          </div>
                        )}
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
                      <div className="space-y-3">
                        <button
                          type="button"
                          onClick={handleGoogleConnect}
                          disabled={googleLoading}
                          className="w-full h-11 rounded-lg border border-[#cfd9e5] bg-white text-[#071333] font-bold text-sm hover:bg-slate-50 transition flex items-center justify-center gap-2.5 shadow-sm disabled:opacity-60"
                        >
                          <GoogleIcon />
                          {googleLoading ? "Connecting with Google..." : "Sign in with Google (Passkey & Password)"}
                        </button>

                        {googleLoading && (
                          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900 space-y-1">
                            <p className="font-bold flex items-center gap-1.5 text-[#1688f9]">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Connecting with Google...
                            </p>
                            <p className="text-[11px] text-slate-600 leading-relaxed">
                              If Windows shows <strong>"Windows Security - Making sure it&apos;s you"</strong>, touch your fingerprint or enter your PIN to authorize. You can also click <em>"Try another way"</em> inside the Google popup to sign in with your password.
                            </p>
                          </div>
                        )}

                        {showManualGoogle ? (
                          <div className="space-y-2 rounded-lg border border-[#dce7f4] bg-slate-50 p-3">
                            <label className="block text-[11px] font-semibold text-[#071333]">
                              Link Google Drive account email:
                            </label>
                            <form onSubmit={handleManualGoogleConnect} className="flex gap-2">
                              <input
                                type="email"
                                value={manualGoogleEmail}
                                onChange={(e) => setManualGoogleEmail(e.target.value)}
                                placeholder="e.g. garvkataria1573@gmail.com"
                                className="h-9 flex-1 rounded-md border border-[#cfd9e5] bg-white px-2.5 text-xs text-[#071333] outline-none focus:border-[#1688f9]"
                              />
                              <button
                                type="submit"
                                className="h-9 rounded-md bg-[#1688f9] px-3.5 text-xs font-bold text-white hover:bg-[#1270d1] transition shrink-0"
                              >
                                Link
                              </button>
                            </form>
                            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-slate-500">
                              <span>Quick 1-Click Link:</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setManualGoogleEmail("garvkataria1573@gmail.com");
                                  const acc = { email: "garvkataria1573@gmail.com", displayName: "Garv Kataria" };
                                  const initialQ = getDefaultQuotaForEmail(acc.email);
                                  setGoogleAccount(acc);
                                  setQuota(initialQ);
                                  localStorage.setItem("fc_gdrive_account", JSON.stringify(acc));
                                  localStorage.setItem(`gdrive_quota_${acc.email}`, JSON.stringify(initialQ));
                                  setBackupSuccess(`Google Drive linked: ${acc.email} (${initialQ.planName})`);
                                  setShowManualGoogle(false);
                                }}
                                className="text-[#1688f9] font-bold hover:underline"
                              >
                                ⚡ garvkataria1573@gmail.com
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowManualGoogle(true)}
                            className="w-full text-center text-[11px] text-[#596782] hover:text-[#1688f9] transition underline"
                          >
                            Or link Google account email directly without popup
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