"use client";

import { AppShell } from "@/components/dashboard/app-shell";
import { initialsOf } from "@/components/dashboard/ui";
import { useApi } from "@/lib/hooks";
import { api } from "@/lib/api";
import { Bell, Briefcase, ReceiptText, User } from "lucide-react";
import { useEffect, useState } from "react";

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

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "PKR", "SGD"];

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
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SettingsPage() {
  const [active, setActive] = useState<TabId>("profile");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const settings = useApi<SettingsData>("/settings");

  const profile = settings.data?.profile;
  const biz = settings.data?.business;
  const prefs = settings.data?.preferences;

  const [bizName, setBizName] = useState("");
  const [bizEmail, setBizEmail] = useState("");
  const [bizPhone, setBizPhone] = useState("");
  const [timezone, setTimezone] = useState(TIMEZONES[0]);
  const [currency, setCurrency] = useState("INR");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstRate, setGstRate] = useState("");
  const [gstin, setGstin] = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState("INV");
  const [nextInvoiceNo, setNextInvoiceNo] = useState("");
  const [gstSaving, setGstSaving] = useState(false);

  useEffect(() => {
    if (settings.data?.business?.id) {
      const b = settings.data.business;
      setBizName(b.name ?? "");
      setBizEmail(b.email ?? "");
      setBizPhone(b.phone ?? "");
      setTimezone(b.timezone || TIMEZONES[0]);
      setCurrency(b.currency || "INR");
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
      await api("/settings", { method: "PATCH", body: JSON.stringify({ [key]: value }) });
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
    setCurrency(b?.currency || "INR");
  }

  async function saveBusiness() {
    setFormError("");
    setActionError("");
    if (bizName.trim().length < 2) { setFormError("Business name min 2 characters"); return; }
    if (bizEmail && !/^\S+@\S+\.\S+$/.test(bizEmail)) { setFormError("Enter a valid email address"); return; }
    setSaving(true);
    try {
      await api("/settings", { method: "PATCH", body: JSON.stringify({ businessName: bizName.trim(), email: bizEmail.trim() || undefined, phone: bizPhone.trim() || undefined, timezone, currency }) });
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
        body: JSON.stringify({
          gstEnabled,
          gstRate: rate,
          gstin: gstin.trim() || undefined,
          invoicePrefix: invoicePrefix.trim() || "INV",
          nextInvoiceNo: next,
        }),
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

        {settings.error ? <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{settings.error}</p> : null}
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
                  <label className="block"><span className="mb-1 block font-semibold">Default Currency</span><select value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-11 w-full rounded-lg border border-[#d6e1ef] bg-white px-3 outline-none">{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
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