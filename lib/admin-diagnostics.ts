"use client";

export type DiagnosticSeverity = "CRITICAL" | "ERROR" | "WARNING" | "INFO";
export type DiagnosticCategory = "WHATSAPP" | "AUTH" | "DATABASE" | "NETWORK" | "BILLING" | "SYSTEM";

export interface SystemDiagnosticError {
  id: string;
  timestamp: string;
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  errorCode: string;
  title: string;
  message: string;
  subsystem: string;
  accountId?: string;
  accountName?: string;
  details?: string;
  stackTrace?: string;
  recommendedFix?: string;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  retryCount?: number;
  canRetry?: boolean;
}

const STORAGE_KEY = "fc_admin_diagnostics_v1";

export const INITIAL_DIAGNOSTICS: SystemDiagnosticError[] = [
  {
    id: "err_diag_01",
    timestamp: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    category: "WHATSAPP",
    severity: "CRITICAL",
    errorCode: "WA_QUOTA_LIMIT_REACHED",
    title: "Outbound WhatsApp Quota Block Triggered",
    message: "Agency TravelHub Express reached maximum 1,000 message quota cap. 3 outbound messages rejected.",
    subsystem: "WhatsApp Dispatcher / Cloud Engine",
    accountId: "biz_demo",
    accountName: "TravelHub Express (Standard Demo)",
    details: '{"attemptedMessages": 3, "currentUsage": 1000, "limit": 1000, "recipients": ["+971509988771", "+919876543210"]}',
    stackTrace: "Error: QuotaBlockedException at dispatchWhatsAppQueue (whatsapp-service.ts:184)\n    at processMessageBatch (queue-worker.ts:92)",
    recommendedFix: "Upgrade agency limit in WhatsApp Limits Master or add +500 emergency credits.",
    resolved: false,
    retryCount: 0,
    canRetry: true,
  },
  {
    id: "err_diag_02",
    timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    category: "WHATSAPP",
    severity: "ERROR",
    errorCode: "META_GRAPH_RATE_LIMIT",
    title: "Meta Graph API 429 Too Many Requests",
    message: "Meta Graph API rate threshold reached: 80 calls/sec during bulk marketing campaign broadcast.",
    subsystem: "Meta Cloud API Gateway",
    accountId: "biz_skyhigh",
    accountName: "SkyHigh Luxury Holidays",
    details: '{"endpoint": "https://graph.facebook.com/v19.0/messages", "httpStatus": 429, "retryAfterSeconds": 45}',
    stackTrace: "AxiosError: Request failed with status code 429 (Rate Limit Exceeded)\n    at MetaGateway.sendTemplateMessage (meta-provider.ts:241)",
    recommendedFix: "Apply exponential backoff rate limiter and enable batch throttling.",
    resolved: false,
    retryCount: 1,
    canRetry: true,
  },
  {
    id: "err_diag_03",
    timestamp: new Date(Date.now() - 1000 * 60 * 48).toISOString(),
    category: "DATABASE",
    severity: "WARNING",
    errorCode: "FIRESTORE_INDEX_MISSING",
    title: "Firestore Composite Index Missing for Corporate Queries",
    message: "Filtered bookings query by companyId + departureDate requested index building in Google Cloud Console.",
    subsystem: "Cloud Firestore / Index Engine",
    accountId: "biz_blueaura",
    accountName: "Blue Aura Tours & Travels",
    details: '{"collection": "bookings", "fields": ["companyId", "departureDate", "createdAt"], "suggestedIndexUrl": "https://console.firebase.google.com/indexes"}',
    stackTrace: "FirebaseError: The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/traveltourism-32d7d/firestore/indexes",
    recommendedFix: "Deploy firestore.indexes.json with composite index for companyId ASC, departureDate DESC.",
    resolved: false,
    retryCount: 0,
    canRetry: false,
  },
  {
    id: "err_diag_04",
    timestamp: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
    category: "AUTH",
    severity: "WARNING",
    errorCode: "SUSPICIOUS_LOGIN_ATTEMPTS",
    title: "Repeated Failed Login Attempts Detected",
    message: "6 consecutive failed attempts with incorrect password for user account rahul@skyhighholidays.com.",
    subsystem: "Firebase Authentication Guard",
    accountId: "biz_skyhigh",
    accountName: "SkyHigh Luxury Holidays",
    details: '{"originIp": "194.26.29.112", "failedAttempts": 6, "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}',
    stackTrace: "SecurityAlert: BruteForceThrottle triggered after 5 failures\n    at authRateLimiter (auth-guard.ts:88)",
    recommendedFix: "Review origin IP; temporary 15-minute IP cooldown has been applied.",
    resolved: true,
    resolvedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    resolvedBy: "System Auto-Throttle",
    retryCount: 0,
    canRetry: false,
  },
  {
    id: "err_diag_05",
    timestamp: new Date(Date.now() - 1000 * 60 * 140).toISOString(),
    category: "BILLING",
    severity: "ERROR",
    errorCode: "INVOICE_PDF_GENERATION_TIMEOUT",
    title: "High-Resolution PDF Generation Delayed",
    message: "PDF renderer exceeded 8,000ms deadline while generating multi-passenger itinerary with 12 flight legs.",
    subsystem: "Document Generation Worker",
    accountId: "biz_apex",
    accountName: "Apex Corporate Travel Partners",
    details: '{"invoiceId": "INV-2026-1049", "bookingId": "bk_9981", "renderTimeMs": 9140}',
    stackTrace: "TimeoutError: Page.pdf() timed out after 8000ms\n    at generateInvoicePdf (pdf-generator.ts:140)",
    recommendedFix: "Optimize embedded images and increase worker rendering timeout to 15,000ms.",
    resolved: true,
    resolvedAt: new Date(Date.now() - 1000 * 60 * 110).toISOString(),
    resolvedBy: "Garv Kataria (Master Admin)",
    retryCount: 2,
    canRetry: true,
  },
  {
    id: "err_diag_06",
    timestamp: new Date(Date.now() - 1000 * 60 * 210).toISOString(),
    category: "WHATSAPP",
    severity: "ERROR",
    errorCode: "INVALID_PHONE_DESTINATION",
    title: "E.164 Phone Format Error",
    message: "Customer mobile number '09823411' rejected by WhatsApp gateway. Missing country prefix.",
    subsystem: "WhatsApp Normalizer",
    accountId: "biz_demo",
    accountName: "TravelHub Express (Standard Demo)",
    details: '{"providedNumber": "09823411", "expectedFormat": "+[CountryCode][Number] (e.g. +919823411000)"}',
    stackTrace: "ValidationError: InvalidPhoneNumberException at validateRecipient (phone-utils.ts:45)",
    recommendedFix: "Update customer phone number in Customer CRM with valid international dialing prefix.",
    resolved: false,
    retryCount: 0,
    canRetry: true,
  },
];

export function getDiagnosticErrors(): SystemDiagnosticError[] {
  if (typeof window === "undefined") return INITIAL_DIAGNOSTICS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DIAGNOSTICS));
      return INITIAL_DIAGNOSTICS;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return INITIAL_DIAGNOSTICS;
    }
    return parsed;
  } catch {
    return INITIAL_DIAGNOSTICS;
  }
}

export function saveDiagnosticErrors(errors: SystemDiagnosticError[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(errors));
    window.dispatchEvent(new CustomEvent("fc:diagnostics-updated", { detail: errors }));
  } catch (err) {
    console.error("Failed to save diagnostics:", err);
  }
}

export function logDiagnosticError(
  item: Omit<SystemDiagnosticError, "id" | "timestamp" | "resolved" | "retryCount">
): SystemDiagnosticError {
  const errors = getDiagnosticErrors();
  const created: SystemDiagnosticError = {
    ...item,
    id: `err_diag_${Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
    resolved: false,
    retryCount: 0,
  };

  errors.unshift(created);
  saveDiagnosticErrors(errors);
  return created;
}

export function resolveDiagnosticError(
  id: string,
  resolvedBy = "Garv Kataria (Master Admin)"
): SystemDiagnosticError {
  const errors = getDiagnosticErrors();
  const index = errors.findIndex((e) => e.id === id);
  if (index === -1) {
    throw new Error(`Diagnostic item with ID "${id}" not found.`);
  }

  const updated: SystemDiagnosticError = {
    ...errors[index],
    resolved: true,
    resolvedAt: new Date().toISOString(),
    resolvedBy,
  };

  errors[index] = updated;
  saveDiagnosticErrors(errors);
  return updated;
}

export function unresolveDiagnosticError(id: string): SystemDiagnosticError {
  const errors = getDiagnosticErrors();
  const index = errors.findIndex((e) => e.id === id);
  if (index === -1) {
    throw new Error(`Diagnostic item with ID "${id}" not found.`);
  }

  const updated: SystemDiagnosticError = {
    ...errors[index],
    resolved: false,
    resolvedAt: undefined,
    resolvedBy: undefined,
  };

  errors[index] = updated;
  saveDiagnosticErrors(errors);
  return updated;
}

export async function retryDiagnosticAction(id: string): Promise<{ success: boolean; message: string }> {
  const errors = getDiagnosticErrors();
  const index = errors.findIndex((e) => e.id === id);
  if (index === -1) {
    return { success: false, message: "Item not found" };
  }

  const target = errors[index];
  target.retryCount = (target.retryCount || 0) + 1;

  // Simulate self-healing resolution based on error category
  await new Promise((res) => setTimeout(res, 800));

  let success = true;
  let message = `Retry action dispatched for ${target.errorCode}. Issue self-healed and queued for re-verification.`;

  if (target.errorCode === "WA_QUOTA_LIMIT_REACHED") {
    message = "Quota limit check re-evaluated. If limit was updated, pending messages will now dispatch.";
  } else if (target.errorCode === "META_GRAPH_RATE_LIMIT") {
    message = "Rate limit cleared. Meta API gateway connection re-established with 200 OK.";
    target.resolved = true;
    target.resolvedAt = new Date().toISOString();
    target.resolvedBy = "Automated Retry Engine";
  } else if (target.errorCode === "INVALID_PHONE_DESTINATION") {
    message = "Phone number normalization re-run. Awaiting customer contact update in CRM.";
  }

  errors[index] = target;
  saveDiagnosticErrors(errors);
  return { success, message };
}

export function clearResolvedDiagnostics(): void {
  const errors = getDiagnosticErrors();
  const activeOnly = errors.filter((e) => !e.resolved);
  saveDiagnosticErrors(activeOnly);
}

export function clearAllDiagnostics(): void {
  saveDiagnosticErrors([]);
}

/**
 * Generate a simulated realistic error to test real-time monitoring
 */
export function simulateDiagnosticError(category: DiagnosticCategory = "WHATSAPP"): SystemDiagnosticError {
  const templates: Record<DiagnosticCategory, Partial<SystemDiagnosticError>> = {
    WHATSAPP: {
      category: "WHATSAPP",
      severity: "ERROR",
      errorCode: "WA_DISPATCH_TIMEOUT",
      title: "WhatsApp Dispatch Worker Gateway Timeout",
      message: "Worker failed to connect to WhatsApp Cloud webhook after 10,000ms. Message queued in dead-letter backlog.",
      subsystem: "WhatsApp Message Queue",
      accountName: "Blue Aura Tours & Travels",
      accountId: "biz_blueaura",
      details: '{"queueDepth": 12, "timeoutMs": 10000, "gateway": "api.whatsapp.com"}',
      stackTrace: "GatewayTimeout: Webhook ACK timed out\n    at dispatchQueue (wa-dispatcher.ts:114)",
      recommendedFix: "Check WhatsApp Cloud API status or restart message queue worker.",
      canRetry: true,
    },
    AUTH: {
      category: "AUTH",
      severity: "CRITICAL",
      errorCode: "UNAUTHORIZED_ADMIN_BYPASS_ATTEMPT",
      title: "Unauthorized Admin Route Access Attempt",
      message: "Non-privileged session attempted direct navigation to /admin control center without SUPER_ADMIN claims.",
      subsystem: "Route Guard / Access Control",
      accountName: "TravelHub Express (Standard Demo)",
      accountId: "biz_demo",
      details: '{"attemptedRoute": "/admin", "userRole": "STAFF", "clientIp": "49.36.128.45"}',
      stackTrace: "SecurityException: InsufficientPrivileges\n    at verifyAdminAccess (auth-guard.ts:42)",
      recommendedFix: "Account permissions verified. Route access was safely blocked by AppShell security guard.",
      canRetry: false,
    },
    DATABASE: {
      category: "DATABASE",
      severity: "WARNING",
      errorCode: "FIRESTORE_WRITE_THROTTLE",
      title: "Firestore Concurrent Document Writes Spiked",
      message: "Exceeded 500 document writes/sec on single collection /bookings during mass import.",
      subsystem: "Cloud Firestore Engine",
      accountName: "Apex Corporate Travel Partners",
      accountId: "biz_apex",
      details: '{"writesPerSecond": 612, "limit": 500}',
      stackTrace: "ResourceExhausted: Quota exceeded for quota group 'WriteRequestsPerMinutePerProject'",
      recommendedFix: "Chunk bulk imports into 250-record batches with 200ms delays.",
      canRetry: true,
    },
    NETWORK: {
      category: "NETWORK",
      severity: "WARNING",
      errorCode: "EXTERNAL_API_LATENCY_SPIKE",
      title: "IATA Airport Search API Latency Spike (>3,200ms)",
      message: "Live autocomplete for IATA airport codes experiencing high upstream latency from OpenFlights CDN.",
      subsystem: "External Airport Service",
      accountName: "Blue Aura Tours & Travels",
      accountId: "biz_blueaura",
      details: '{"latencyMs": 3410, "endpoint": "https://api.aviationstack.com/v1/airports"}',
      recommendedFix: "Switched to local indexed airport dataset (airports.json cache).",
      canRetry: true,
    },
    BILLING: {
      category: "BILLING",
      severity: "ERROR",
      errorCode: "CURRENCY_RATE_STALE",
      title: "Real-Time FX Rates Sync Warning",
      message: "Daily exchange rate sync from Open Exchange Rates failed due to invalid API token.",
      subsystem: "Currency Engine",
      accountName: "Global",
      accountId: "global",
      details: '{"lastSynced": "24h ago", "fallbackUsed": "STATIC_FALLBACK_RATES"}',
      stackTrace: "ApiError: 401 Unauthorized at fetchExchangeRates (currency-core.ts:77)",
      recommendedFix: "Verify NEXT_PUBLIC_OPEN_EXCHANGE_KEY or rely on local fallback matrix.",
      canRetry: true,
    },
    SYSTEM: {
      category: "SYSTEM",
      severity: "INFO",
      errorCode: "SYSTEM_MEMORY_HEALTHY",
      title: "Master Admin Routine Health Ping",
      message: "Background workers and session services operating nominally. Zero zombie processes.",
      subsystem: "Health Monitor",
      accountName: "Platform Global",
      accountId: "platform",
      details: '{"memoryRssMb": 112, "uptimeSeconds": 86420}',
      recommendedFix: "No action needed. All services operational.",
      canRetry: false,
    },
  };

  const chosen = templates[category] || templates.WHATSAPP;
  return logDiagnosticError({
    category: chosen.category || "WHATSAPP",
    severity: chosen.severity || "ERROR",
    errorCode: chosen.errorCode || "GENERIC_ERROR",
    title: chosen.title || "Diagnostic Event",
    message: chosen.message || "An unexpected system anomaly was observed.",
    subsystem: chosen.subsystem || "System Core",
    accountName: chosen.accountName,
    accountId: chosen.accountId,
    details: chosen.details,
    stackTrace: chosen.stackTrace,
    recommendedFix: chosen.recommendedFix,
    canRetry: chosen.canRetry ?? true,
  });
}
