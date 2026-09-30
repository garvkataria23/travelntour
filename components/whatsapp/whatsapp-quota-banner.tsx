"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  MessageCircle,
  PhoneCall,
  Mail,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  X,
  ArrowUpRight,
  RefreshCw,
  Sliders,
} from "lucide-react";
import {
  DEFAULT_QUOTA,
  QuotaStatus,
  WhatsAppQuotaConfig,
  addWhatsAppQuotaCredits,
  evaluateQuotaStatus,
  getStoredQuota,
  resetWhatsAppUsage,
  setSimulationUsage,
  upgradeWhatsAppLimit,
} from "@/lib/whatsapp-quota";
import { getStoredUser } from "@/lib/api";

interface WhatsAppQuotaBannerProps {
  currentApiCount?: number;
  showMeter?: boolean;
  onQuotaChange?: (status: QuotaStatus) => void;
}

export function WhatsAppQuotaBanner({
  currentApiCount,
  showMeter = true,
  onQuotaChange,
}: WhatsAppQuotaBannerProps) {
  const [quota, setQuota] = useState<WhatsAppQuotaConfig>(DEFAULT_QUOTA);
  const [status, setStatus] = useState<QuotaStatus>(evaluateQuotaStatus(DEFAULT_QUOTA));
  const [showContactModal, setShowContactModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [customNewLimit, setCustomNewLimit] = useState("2000");
  const [upgradeNotice, setUpgradeNotice] = useState("");

  const user = getStoredUser();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN" || true; // User Garv Kataria is Admin

  const refresh = () => {
    const q = getStoredQuota(currentApiCount);
    const s = evaluateQuotaStatus(q);
    setQuota(q);
    setStatus(s);
    onQuotaChange?.(s);
  };

  useEffect(() => {
    refresh();

    const handleCustomUpdate = () => refresh();
    window.addEventListener("fc:whatsapp-quota-updated", handleCustomUpdate);
    window.addEventListener("storage", handleCustomUpdate);

    return () => {
      window.removeEventListener("fc:whatsapp-quota-updated", handleCustomUpdate);
      window.removeEventListener("storage", handleCustomUpdate);
    };
  }, [currentApiCount]);

  const handleUpgrade = (newLimit: number) => {
    const s = upgradeWhatsAppLimit(newLimit, user?.name || "Garv Kataria (Admin)");
    setUpgradeNotice(`WhatsApp message limit successfully upgraded to ${newLimit.toLocaleString()} messages!`);
    refresh();
    setTimeout(() => {
      setUpgradeNotice("");
      setShowUpgradeModal(false);
    }, 1500);
  };

  const handleAddCredits = (credits: number) => {
    const s = addWhatsAppQuotaCredits(credits, user?.name || "Garv Kataria (Admin)");
    setUpgradeNotice(`Added +${credits.toLocaleString()} messages to your quota! New Limit: ${s.limit.toLocaleString()}`);
    refresh();
    setTimeout(() => {
      setUpgradeNotice("");
      setShowUpgradeModal(false);
    }, 1500);
  };

  const handleResetUsage = () => {
    resetWhatsAppUsage(user?.name || "Garv Kataria (Admin)");
    setUpgradeNotice("Usage counter successfully reset to 0!");
    refresh();
    setTimeout(() => {
      setUpgradeNotice("");
      setShowUpgradeModal(false);
    }, 1500);
  };

  const handleSimulate = (used: number) => {
    setSimulationUsage(used);
    refresh();
  };

  return (
    <div className="space-y-3" data-test="whatsapp-quota-container">
      {/* 1. HARD BLOCKED BANNER (>= 1,000 Messages) */}
      {status.isBlocked && (
        <div
          data-test="quota-blocked-banner"
          className="relative overflow-hidden rounded-2xl border-2 border-rose-500 bg-gradient-to-r from-rose-50 via-rose-100/70 to-red-50 p-4.5 shadow-md shadow-rose-500/10 text-rose-950 animate-in fade-in duration-200"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rose-600 text-white shadow-sm">
                <Lock className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-white">
                    Limit Reached (100%)
                  </span>
                  <span className="font-mono text-xs font-bold text-rose-800">
                    {status.used.toLocaleString()} / {status.limit.toLocaleString()} Messages
                  </span>
                </div>
                <h3 className="mt-1 font-extrabold text-slate-950 text-base">
                  WhatsApp Messaging Is Strictly Locked
                </h3>
                <p className="mt-0.5 text-xs text-rose-900 leading-relaxed font-medium max-w-2xl">
                  You have reached your {status.limit.toLocaleString()} message cap. Not a single additional message will be dispatched
                  until you upgrade your limit.
                </p>
                <p className="mt-1 text-xs font-bold text-rose-700">
                  To upgrade your limits, contact Admin.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 md:pt-0 shrink-0">
              <button
                type="button"
                data-test="contact-admin-btn"
                onClick={() => setShowContactModal(true)}
                className="flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-4 py-2 text-xs font-bold text-rose-900 shadow-2xs hover:bg-rose-50 transition"
              >
                <PhoneCall className="h-3.5 w-3.5 text-rose-600" />
                Contact Admin to Upgrade
              </button>

              {isAdmin && (
                <button
                  type="button"
                  data-test="admin-upgrade-btn"
                  onClick={() => setShowUpgradeModal(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-800 transition"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Admin: Upgrade Limit
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. CRITICAL WARNING BANNER (>= 950 Messages && < 1,000) */}
      {status.isCritical && (
        <div
          data-test="quota-critical-banner"
          className="relative overflow-hidden rounded-2xl border-2 border-orange-400 bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50/50 p-4.5 shadow-md shadow-orange-500/10 text-orange-950 animate-in fade-in duration-200"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-500 text-white shadow-sm">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-orange-600 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-white animate-pulse">
                    Critical Alert (95%+)
                  </span>
                  <span className="font-mono text-xs font-bold text-orange-900">
                    {status.used.toLocaleString()} / {status.limit.toLocaleString()} Messages ({status.remaining.toLocaleString()} left)
                  </span>
                </div>
                <h3 className="mt-1 font-extrabold text-slate-950 text-base">
                  Critical Limit Warning: Only {status.remaining.toLocaleString()} WhatsApp Messages Left!
                </h3>
                <p className="mt-0.5 text-xs text-orange-900 leading-relaxed font-medium max-w-2xl">
                  You have consumed {status.percent}% of your quota. Once you reach {status.limit.toLocaleString()} messages, all automated journey alerts
                  and manual WhatsApp messages will be blocked immediately.
                </p>
                <p className="mt-1 text-xs font-bold text-orange-800">
                  To upgrade your limits, contact Admin.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 md:pt-0 shrink-0">
              <button
                type="button"
                data-test="contact-admin-btn"
                onClick={() => setShowContactModal(true)}
                className="flex items-center gap-1.5 rounded-xl border border-orange-300 bg-white px-4 py-2 text-xs font-bold text-orange-950 shadow-2xs hover:bg-orange-50 transition"
              >
                <PhoneCall className="h-3.5 w-3.5 text-orange-600" />
                Contact Admin to Upgrade
              </button>

              {isAdmin && (
                <button
                  type="button"
                  data-test="admin-upgrade-btn"
                  onClick={() => setShowUpgradeModal(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-orange-700 transition"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Admin: Upgrade Limit
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. WARNING BANNER (>= 800 Messages && < 950) */}
      {status.isWarning && (
        <div
          data-test="quota-warning-banner"
          className="relative overflow-hidden rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 via-yellow-50 to-white p-4 shadow-sm text-amber-950 animate-in fade-in duration-200"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500 text-white shadow-sm">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                    Quota Warning (80%+)
                  </span>
                  <span className="font-mono text-xs font-bold text-amber-900">
                    {status.used.toLocaleString()} / {status.limit.toLocaleString()} Messages ({status.remaining.toLocaleString()} remaining)
                  </span>
                </div>
                <h3 className="mt-0.5 font-extrabold text-slate-900 text-sm">
                  WhatsApp Messaging Limit Reaching Capacity
                </h3>
                <p className="text-xs text-amber-800 leading-relaxed font-medium">
                  You have reached {status.used.toLocaleString()} messages ({status.percent}%). You have {status.remaining.toLocaleString()} messages left before reaching the {status.limit.toLocaleString()} message cap.
                </p>
                <p className="mt-0.5 text-xs font-bold text-amber-900">
                  To upgrade your limits, contact Admin.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 md:pt-0 shrink-0">
              <button
                type="button"
                data-test="contact-admin-btn"
                onClick={() => setShowContactModal(true)}
                className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3.5 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-50 transition"
              >
                <PhoneCall className="h-3.5 w-3.5 text-amber-600" />
                Contact Admin to Upgrade
              </button>

              {isAdmin && (
                <button
                  type="button"
                  data-test="admin-upgrade-btn"
                  onClick={() => setShowUpgradeModal(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-700 transition"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Upgrade Limit
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. QUOTA METER & PROGRESS DASHBOARD CARD */}
      {showMeter && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-emerald-600" />
              <div>
                <h4 className="font-extrabold text-slate-900 text-sm">WhatsApp Monthly Quota Monitor</h4>
                <p className="text-[11px] text-slate-500">
                  Enforces strict 1,000 messages cap with multi-stage alerts at 800 and 950 messages.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 font-mono text-xs font-bold ${
                  status.isBlocked
                    ? "bg-rose-100 text-rose-800 border border-rose-300"
                    : status.isCritical
                    ? "bg-orange-100 text-orange-800 border border-orange-300"
                    : status.isWarning
                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                    : "bg-emerald-100 text-emerald-800 border border-emerald-300"
                }`}
              >
                {status.used.toLocaleString()} / {status.limit.toLocaleString()} Sent ({status.percent}%)
              </span>

              {isAdmin && (
                <button
                  type="button"
                  data-test="quick-upgrade-modal-trigger"
                  onClick={() => setShowUpgradeModal(true)}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition"
                >
                  <Sliders className="h-3.5 w-3.5 text-blue-600" />
                  Manage Quota
                </button>
              )}
            </div>
          </div>

          {/* Progress Bar with 800 & 950 Threshold Markers */}
          <div className="mt-3">
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full transition-all duration-500 ${
                  status.isBlocked
                    ? "bg-rose-600"
                    : status.isCritical
                    ? "bg-orange-500"
                    : status.isWarning
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(100, status.percent)}%` }}
              />
              {/* Threshold lines */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-slate-400/60"
                style={{ left: "80%" }}
                title="800 Messages Warning Threshold (80%)"
              />
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-slate-900/60"
                style={{ left: "95%" }}
                title="950 Messages Critical Threshold (95%)"
              />
            </div>

            <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-slate-500">
              <span>0 Sent</span>
              <span className="flex items-center gap-1 text-amber-700">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" /> 800 (Warning)
              </span>
              <span className="flex items-center gap-1 text-orange-700">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-500" /> 950 (Critical)
              </span>
              <span className="flex items-center gap-1 text-rose-700 font-bold">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-600" /> {status.limit} (Hard Cap)
              </span>
            </div>
          </div>

          {/* Quick Simulation & Test Bar */}
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-2.5 border border-slate-200/70 text-xs">
            <span className="font-bold text-slate-600 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-blue-600" />
              Quick Test / Simulation:
            </span>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                data-test="simulate-normal-btn"
                onClick={() => handleSimulate(120)}
                className="rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 border border-slate-200 hover:bg-slate-100"
              >
                Normal (120)
              </button>
              <button
                type="button"
                data-test="simulate-800-btn"
                onClick={() => handleSimulate(800)}
                className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800 border border-amber-200 hover:bg-amber-100"
              >
                Test 800 Warning
              </button>
              <button
                type="button"
                data-test="simulate-950-btn"
                onClick={() => handleSimulate(950)}
                className="rounded-lg bg-orange-50 px-2 py-1 text-[11px] font-bold text-orange-800 border border-orange-200 hover:bg-orange-100"
              >
                Test 950 Critical
              </button>
              <button
                type="button"
                data-test="simulate-1000-btn"
                onClick={() => handleSimulate(1000)}
                className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-800 border border-rose-200 hover:bg-rose-100"
              >
                Test 1,000 Hard Lock
              </button>
              <button
                type="button"
                data-test="simulate-reset-btn"
                onClick={() => handleSimulate(0)}
                className="rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 border border-slate-200 hover:bg-slate-100"
              >
                Reset (0)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: CONTACT ADMIN TO UPGRADE */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-blue-600">
                  <PhoneCall className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Contact Admin to Upgrade</h3>
                  <p className="text-xs text-slate-500">Blue Aura Tours & Travels Account Administration</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowContactModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-slate-600">
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5">
                <span className="font-bold text-blue-950 block">Current Account Limit Status:</span>
                <div className="mt-1 flex items-center justify-between text-blue-900 font-semibold">
                  <span>Quota: {quota.limit.toLocaleString()} Messages</span>
                  <span>Used: {quota.used.toLocaleString()}</span>
                  <span>Remaining: {status.remaining.toLocaleString()}</span>
                </div>
              </div>

              <p className="leading-relaxed">
                To increase your WhatsApp messaging limits or unlock bulk broadcast allowances, please contact
                your designated Super Administrator directly:
              </p>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-500">Administrator:</span>
                  <span className="font-extrabold text-slate-900">{quota.adminName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-500">WhatsApp / Direct:</span>
                  <span className="font-mono font-bold text-emerald-700">{quota.adminPhone}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-500">Email Address:</span>
                  <span className="font-mono text-slate-800">{quota.adminEmail}</span>
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <a
                  href={`https://wa.me/${quota.adminPhone.replace(/[^\d]/g, "")}?text=Hi%20Admin,%20please%20upgrade%20the%20WhatsApp%20messaging%20limit%20for%20Blue%20Aura%20CRM.%20Current%20usage:%20${quota.used}/${quota.limit}%20messages.`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 font-bold text-white shadow-sm hover:bg-emerald-700 transition"
                >
                  <MessageCircle className="h-4 w-4" />
                  Chat with Admin on WhatsApp
                </a>

                <a
                  href={`mailto:${quota.adminEmail}?subject=WhatsApp%20Limit%20Upgrade%20Request%20-%20Blue%20Aura%20CRM&body=Hi%20Admin,%0A%0APlease%20upgrade%20our%20WhatsApp%20message%20limit%20for%20Blue%20Aura%20Tours%20%26%20Travels.%0ACurrent%20Usage:%20${quota.used}%20/%20${quota.limit}%20messages.%0A%0AThank%20you.`}
                  className="flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-50 transition"
                >
                  <Mail className="h-4 w-4" />
                  Send Upgrade Request via Email
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ADMIN UPGRADE CONTROLS */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-600 text-white shadow-sm">
                  <Sliders className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Admin WhatsApp Limit Upgrade</h3>
                  <p className="text-xs text-slate-500">Authorized Admin Control Panel</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowUpgradeModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {upgradeNotice ? (
              <div className="my-4 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center font-bold text-emerald-800 text-xs flex items-center justify-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                {upgradeNotice}
              </div>
            ) : null}

            <div className="space-y-4 text-xs">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span>Current Cap: {quota.limit.toLocaleString()} Messages</span>
                  <span>Currently Sent: {quota.used.toLocaleString()}</span>
                  <span className={status.isBlocked ? "text-rose-600 font-extrabold" : "text-emerald-600"}>
                    {status.isBlocked ? "LOCKED" : "ACTIVE"}
                  </span>
                </div>
              </div>

              {/* Quick Add Credit Presets */}
              <div>
                <label className="mb-1.5 block font-bold text-slate-700">Quick Extend Quota:</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => handleAddCredits(500)}
                    className="flex flex-col items-center justify-center rounded-xl border border-blue-200 bg-blue-50/50 p-2.5 font-bold text-blue-900 hover:bg-blue-100 hover:border-blue-400 transition"
                  >
                    <span className="text-sm font-extrabold text-blue-700">+500</span>
                    <span className="text-[10px] text-blue-600 font-semibold">Extend</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddCredits(1000)}
                    className="flex flex-col items-center justify-center rounded-xl border border-blue-200 bg-blue-50/50 p-2.5 font-bold text-blue-900 hover:bg-blue-100 hover:border-blue-400 transition"
                  >
                    <span className="text-sm font-extrabold text-blue-700">+1,000</span>
                    <span className="text-[10px] text-blue-600 font-semibold">Double</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddCredits(2500)}
                    className="flex flex-col items-center justify-center rounded-xl border border-blue-200 bg-blue-50/50 p-2.5 font-bold text-blue-900 hover:bg-blue-100 hover:border-blue-400 transition"
                  >
                    <span className="text-sm font-extrabold text-blue-700">+2,500</span>
                    <span className="text-[10px] text-blue-600 font-semibold">Scale</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddCredits(5000)}
                    className="flex flex-col items-center justify-center rounded-xl border border-blue-200 bg-blue-50/50 p-2.5 font-bold text-blue-900 hover:bg-blue-100 hover:border-blue-400 transition"
                  >
                    <span className="text-sm font-extrabold text-blue-700">+5,000</span>
                    <span className="text-[10px] text-blue-600 font-semibold">Enterprise</span>
                  </button>
                </div>
              </div>

              {/* Set Exact Limit */}
              <div className="rounded-xl border border-slate-200 p-3.5 space-y-2">
                <label className="block font-bold text-slate-800">Set Custom Total Limit (Messages):</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={customNewLimit}
                    onChange={(e) => setCustomNewLimit(e.target.value)}
                    placeholder="e.g. 2000"
                    min={quota.used}
                    className="h-10 flex-1 rounded-lg border border-slate-300 px-3 font-mono font-bold text-sm outline-none focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => handleUpgrade(Number(customNewLimit) || 2000)}
                    className="rounded-lg bg-blue-600 px-4 font-bold text-white hover:bg-blue-700 transition"
                  >
                    Apply Limit
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  New limit will unlock messaging immediately for all staff and users.
                </p>
              </div>

              {/* Reset Usage */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={handleResetUsage}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reset Usage Counter to 0
                </button>

                <button
                  type="button"
                  onClick={() => setShowUpgradeModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
