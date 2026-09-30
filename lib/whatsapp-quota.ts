/**
 * Blue Aura Tours & Travels - WhatsApp Messaging Quota & Limiting Engine
 *
 * Enforces strict 1,000 messages cap with multi-stage warnings:
 *  - 800 messages (80%): Warning notification
 *  - 950 messages (95%): Critical alert notification ("To upgrade your limits, contact Admin")
 *  - 1,000 messages (100%): HARD STOP - Not a single message above 1,000 can be sent
 *    until upgraded by Admin.
 */

export interface WhatsAppQuotaConfig {
  limit: number; // default 1000
  used: number; // sent messages count
  warningThreshold: number; // 800
  criticalThreshold: number; // 950
  adminEmail: string;
  adminPhone: string;
  adminName: string;
  lastUpgradedAt?: string;
  upgradedBy?: string;
  history: Array<{
    date: string;
    oldLimit: number;
    newLimit: number;
    upgradedBy: string;
    notes?: string;
  }>;
}

export interface QuotaStatus {
  limit: number;
  used: number;
  remaining: number;
  percent: number;
  isWarning: boolean; // >= 800 && < 950
  isCritical: boolean; // >= 950 && < 1000
  isBlocked: boolean; // >= 1000
  canSend: boolean;
  status: "NORMAL" | "WARNING" | "CRITICAL" | "BLOCKED";
  message: string;
}

const STORAGE_KEY = "fc_whatsapp_quota_v1";

export const DEFAULT_QUOTA: WhatsAppQuotaConfig = {
  limit: 1000,
  used: 0,
  warningThreshold: 800,
  criticalThreshold: 950,
  adminEmail: "admin@blueauratravel.com",
  adminPhone: "+971501234567",
  adminName: "Garv Kataria (Admin)",
  history: [],
};

export function getStoredQuota(currentApiCount?: number): WhatsAppQuotaConfig {
  if (typeof window === "undefined") return { ...DEFAULT_QUOTA };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    let parsed: WhatsAppQuotaConfig = raw ? JSON.parse(raw) : { ...DEFAULT_QUOTA };

    // Merge defaults in case fields were added
    parsed = {
      ...DEFAULT_QUOTA,
      ...parsed,
      limit: Number(parsed.limit) || 1000,
      used: Number(parsed.used) || 0,
      warningThreshold: Number(parsed.warningThreshold) || 800,
      criticalThreshold: Number(parsed.criticalThreshold) || 950,
    };

    // If API reports higher count, sync upward
    if (typeof currentApiCount === "number" && currentApiCount > parsed.used) {
      parsed.used = currentApiCount;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    }

    return parsed;
  } catch {
    return { ...DEFAULT_QUOTA };
  }
}

export function saveQuota(config: WhatsAppQuotaConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    // Dispatch custom event for real-time reactive UI update
    window.dispatchEvent(new CustomEvent("fc:whatsapp-quota-updated", { detail: config }));
  } catch (err) {
    console.error("Failed to save WhatsApp quota config:", err);
  }
}

export function evaluateQuotaStatus(quota: WhatsAppQuotaConfig): QuotaStatus {
  const limit = Math.max(1, quota.limit);
  const used = Math.max(0, quota.used);
  const remaining = Math.max(0, limit - used);
  const percent = Math.min(100, Math.round((used / limit) * 100));

  // Thresholds scale with quota (80% warning = 800 for 1000; 95% critical = 950 for 1000)
  const warningThreshold = quota.warningThreshold && quota.limit === 1000
    ? quota.warningThreshold
    : Math.round(limit * 0.8);
  const criticalThreshold = quota.criticalThreshold && quota.limit === 1000
    ? quota.criticalThreshold
    : Math.round(limit * 0.95);

  const isBlocked = used >= limit;
  const isCritical = !isBlocked && used >= criticalThreshold;
  const isWarning = !isBlocked && !isCritical && used >= warningThreshold;

  let status: QuotaStatus["status"] = "NORMAL";
  let message = `You have used ${used.toLocaleString()} of ${limit.toLocaleString()} messages (${remaining.toLocaleString()} remaining).`;

  if (isBlocked) {
    status = "BLOCKED";
    message = `WhatsApp message limit reached (${used.toLocaleString()} / ${limit.toLocaleString()}). Not a single message can be sent until upgraded. To upgrade your limits, contact Admin.`;
  } else if (isCritical) {
    status = "CRITICAL";
    message = `Critical WhatsApp Limit Alert: You have used ${used.toLocaleString()} of ${limit.toLocaleString()} messages (${percent}%). Only ${remaining.toLocaleString()} messages left! To upgrade your limits, contact Admin.`;
  } else if (isWarning) {
    status = "WARNING";
    message = `WhatsApp Quota Warning: You have reached ${used.toLocaleString()} messages (${percent}% of your ${limit.toLocaleString()} limit). Only ${remaining.toLocaleString()} messages left. To upgrade your limits, contact Admin.`;
  }

  return {
    limit,
    used,
    remaining,
    percent,
    isWarning,
    isCritical,
    isBlocked,
    canSend: !isBlocked,
    status,
    message,
  };
}

/**
 * Pre-flight verification before attempting to send a message.
 * Throws or returns an error if limit is reached or will be exceeded.
 */
export function checkCanSendWhatsApp(additionalCount = 1): {
  allowed: boolean;
  error?: string;
  status: QuotaStatus;
} {
  const quota = getStoredQuota();
  const currentStatus = evaluateQuotaStatus(quota);

  if (currentStatus.isBlocked || quota.used + additionalCount > quota.limit) {
    return {
      allowed: false,
      error: `WhatsApp message limit reached (${quota.used} / ${quota.limit}). Not a single additional message can be sent. To upgrade your limits, contact Admin.`,
      status: currentStatus,
    };
  }

  return {
    allowed: true,
    status: currentStatus,
  };
}

/**
 * Increments the WhatsApp usage counter after a successful send.
 * Throws an error if attempted when blocked.
 */
export function recordMessageSent(count = 1): QuotaStatus {
  const quota = getStoredQuota();
  if (quota.used >= quota.limit) {
    throw new Error(`WhatsApp message limit reached (${quota.used} / ${quota.limit}). To upgrade your limits, contact Admin.`);
  }

  const updated: WhatsAppQuotaConfig = {
    ...quota,
    used: quota.used + count,
  };

  saveQuota(updated);
  return evaluateQuotaStatus(updated);
}

/**
 * Admin action: Upgrade the WhatsApp limit.
 */
export function upgradeWhatsAppLimit(
  newLimit: number,
  adminName = "Garv Kataria (Admin)",
  notes = "Limit upgraded by Admin"
): QuotaStatus {
  const quota = getStoredQuota();
  const safeLimit = Math.max(quota.used, Math.max(100, Math.round(newLimit)));

  const updated: WhatsAppQuotaConfig = {
    ...quota,
    limit: safeLimit,
    warningThreshold: Math.round(safeLimit * 0.8),
    criticalThreshold: Math.round(safeLimit * 0.95),
    lastUpgradedAt: new Date().toISOString(),
    upgradedBy: adminName,
    history: [
      {
        date: new Date().toISOString(),
        oldLimit: quota.limit,
        newLimit: safeLimit,
        upgradedBy: adminName,
        notes,
      },
      ...quota.history.slice(0, 19),
    ],
  };

  saveQuota(updated);
  return evaluateQuotaStatus(updated);
}

/**
 * Admin action: Add quota credits (e.g. +500, +1000 messages).
 */
export function addWhatsAppQuotaCredits(
  additionalCredits: number,
  adminName = "Garv Kataria (Admin)",
  notes = "Quota extension added by Admin"
): QuotaStatus {
  const quota = getStoredQuota();
  return upgradeWhatsAppLimit(quota.limit + Math.max(1, additionalCredits), adminName, notes);
}

/**
 * Admin action: Reset the usage counter.
 */
export function resetWhatsAppUsage(adminName = "Garv Kataria (Admin)"): QuotaStatus {
  const quota = getStoredQuota();
  const updated: WhatsAppQuotaConfig = {
    ...quota,
    used: 0,
    history: [
      {
        date: new Date().toISOString(),
        oldLimit: quota.limit,
        newLimit: quota.limit,
        upgradedBy: adminName,
        notes: "Monthly usage counter reset by Admin",
      },
      ...quota.history.slice(0, 19),
    ],
  };

  saveQuota(updated);
  return evaluateQuotaStatus(updated);
}

/**
 * Test / Simulation helper: Set custom used count for instant verification of alerts.
 */
export function setSimulationUsage(usedCount: number): QuotaStatus {
  const quota = getStoredQuota();
  const updated: WhatsAppQuotaConfig = {
    ...quota,
    used: Math.max(0, Math.round(usedCount)),
  };

  saveQuota(updated);
  return evaluateQuotaStatus(updated);
}
