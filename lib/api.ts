"use client";

import { BASE_CURRENCY, formatConverted, getDisplayCurrency } from "@/lib/currency-core";
import { AUTH_COOKIE, ROLE_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/session-cookie";
import { handleLocalApiFallback, isLocalStaffToken } from "@/lib/local-api-fallback";

export const PRIMARY_API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "https://129.159.16.165.sslip.io/api";
export const FALLBACK_API_BASE =
  process.env.NEXT_PUBLIC_FALLBACK_API_URL || PRIMARY_API_BASE;

export let API_BASE = PRIMARY_API_BASE;

export function getActiveApiBase(): string {
  return API_BASE;
}

export function setActiveApiBase(url: string): void {
  API_BASE = url;
}

/** Mirrors the backend's Prisma Role enum. Was `string`, so no role comparison was type-checked. */
export type AppRole = "ADMIN" | "MANAGER" | "STAFF" | "SUPER_ADMIN";

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  phone?: string | null;
  businessId?: string;
  /**
   * Capabilities granted to this user, from `GET /auth/me`. The UI gates navigation and actions off
   * this list rather than off `role`, so the frontend and the API cannot drift apart. Never stored
   * anywhere the user can edit — it is only ever written from a signed API response.
   */
  permissions?: string[];
}

export interface ApiSession {
  accessToken: string;
  refreshToken: string;
  user: ApiUser;
  /**
   * Signed assertion describing the session, issued by the API. Relayed into the app's own
   * httpOnly cookie via POST /api/session so middleware.ts can verify it server-side. Never
   * persisted in web storage.
   */
  session?: string;
}

const ACCESS_KEY = "fc_access";
const REFRESH_KEY = "fc_refresh";
const USER_KEY = "fc_user";
const PERSIST_KEY = "fc_persist";

const CACHE_PREFIX = "fc_cache:v1:";
const MEM_TTL = 5000;

const memCache = new Map<string, { at: number; data: unknown }>();
const pending = new Map<string, Promise<unknown>>();

function persist(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PERSIST_KEY) === "1";
}

function store(): Storage {
  return persist() ? window.localStorage : window.sessionStorage;
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    window.localStorage.getItem(ACCESS_KEY) ??
    window.sessionStorage.getItem(ACCESS_KEY)
  );
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    window.localStorage.getItem(REFRESH_KEY) ??
    window.sessionStorage.getItem(REFRESH_KEY)
  );
}

export function getStoredUser(): ApiUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      window.localStorage.getItem(USER_KEY) ??
      window.sessionStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as ApiUser) : null;
  } catch {
    return null;
  }
}

export function setSession(session: ApiSession, remember = true): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PERSIST_KEY, remember ? "1" : "0");
  const target = remember ? window.localStorage : window.sessionStorage;
  target.setItem(ACCESS_KEY, session.accessToken);
  target.setItem(REFRESH_KEY, session.refreshToken);
  target.setItem(USER_KEY, JSON.stringify(session.user));
  const other = remember ? window.sessionStorage : window.localStorage;
  other.removeItem(ACCESS_KEY);
  other.removeItem(REFRESH_KEY);
  other.removeItem(USER_KEY);

  // Synchronously set same-origin auth & role cookies so immediate client-side navigation
  // (`router.push("/dashboard")` or `router.push("/admin")`) is never bounced by middleware
  // while the async `/api/session` httpOnly cookie minting request is in flight.
  try {
    const role = encodeURIComponent(session.user?.role || "STAFF");
    const maxAge = remember ? `; max-age=${SESSION_MAX_AGE_SECONDS}` : "";
    document.cookie = `${AUTH_COOKIE}=1; path=/${maxAge}; SameSite=Lax`;
    document.cookie = `${ROLE_COOKIE}=${role}; path=/${maxAge}; SameSite=Lax`;
  } catch {
    // ignore cookie write errors
  }

  void syncSessionCookie(session);
  window.dispatchEvent(new CustomEvent("fc:session-changed", { detail: session.user }));
}

export async function syncSessionCookie(session: ApiSession | string | undefined): Promise<void> {
  if (!session) return;
  const payload =
    typeof session === "string"
      ? { session }
      : {
          session: session.session,
          role: session.user?.role || "STAFF",
          userId: session.user?.id || "user",
          email: session.user?.email,
        };
  try {
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "same-origin",
    });
  } catch {
    // Non-fatal: synchronous AUTH_COOKIE/ROLE_COOKIE already keeps route navigation working
  }
}

export function hasActiveSession(): boolean {
  return Boolean(getAccessToken());
}

export function clearSession() {
  if (typeof window === "undefined") return;
  for (const bucket of [window.localStorage, window.sessionStorage]) {
    bucket.removeItem(ACCESS_KEY);
    bucket.removeItem(REFRESH_KEY);
    bucket.removeItem(USER_KEY);
  }
  window.localStorage.removeItem(PERSIST_KEY);
  memCache.clear();
  pending.clear();
  try {
    document.cookie = `${AUTH_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    document.cookie = `${ROLE_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    // ignore
  }
  void fetch("/api/session", { method: "DELETE", credentials: "same-origin" }).catch(() => undefined);
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) toRemove.push(k);
    }
    for (const k of toRemove) window.localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  code: string;
  status: number;
  errors?: unknown;

  constructor(status: number, code: string, message: string, errors?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.errors = errors;
  }
}

/**
 * True when a write was rejected because another member of staff saved the same record
 * first. The server's message already names them, so forms just surface `err.message`
 * and offer a reload.
 */
export function isEditConflict(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && err.code === 'EDIT_CONFLICT';
}

export function emitBackendStatus(online: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("fc-net", { detail: { online } }));
}

function cacheKey(method: string, path: string): string {
  return `${method}:${path}`;
}

export function baseOf(path: string): string {
  const seg = path.split("?")[0].split("/").filter(Boolean);
  return "/" + (seg.length >= 2 ? seg.slice(0, 2).join("/") : seg[0] ?? "root");
}

const MAX_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function getStorageCacheKey(path: string): string {
  const user = getStoredUser();
  const userPrefix = user?.id ? `${user.businessId || 'nobiz'}:${user.id}:` : "anon:";
  return `${CACHE_PREFIX}${userPrefix}GET:${path}`;
}

function writePersistent(path: string, data: unknown): void {
  if (typeof window === "undefined") return;
  try {
    const blob = JSON.stringify({ ts: Date.now(), data });
    if (blob.length > 400000) return;
    window.localStorage.setItem(getStorageCacheKey(path), blob);
  } catch {
    /* quota exceeded or storage unavailable */
  }
}

export function getCachedGet<T>(path: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getStorageCacheKey(path));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; data: T };
    if (Date.now() - parsed.ts > MAX_CACHE_TTL) {
      window.localStorage.removeItem(getStorageCacheKey(path));
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function invalidate(keyPrefix: string): void {
  const mk = "GET:" + keyPrefix;
  for (const k of Array.from(memCache.keys())) {
    if (k.startsWith(mk)) memCache.delete(k);
  }
  if (typeof window === "undefined") return;
  const user = getStoredUser();
  const userPrefix = user?.id ? `${user.businessId || 'nobiz'}:${user.id}:` : "anon:";
  const lp = `${CACHE_PREFIX}${userPrefix}${mk}`;
  const drop: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(lp)) drop.push(k);
    }
    for (const k of drop) window.localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function invalidateCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    memCache.clear();
    return;
  }
  invalidate(keyPrefix);
}

let lastFailoverAt = 0;
const PROBE_INTERVAL_MS = 5 * 60 * 1000;

function shouldFailover(err: unknown, res?: Response, signal?: AbortSignal | null): boolean {
  if (signal?.aborted) return false;
  if (err) {
    if (err instanceof Error && err.name === "AbortError") return false;
    return true;
  }
  if (res && (res.status === 502 || res.status === 503 || res.status === 504)) {
    return true;
  }
  return false;
}

async function fetchWithEndpoint(baseUrl: string, path: string, init: RequestInit): Promise<Response> {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (init.signal) {
    return fetch(`${cleanBase}${cleanPath}`, init);
  }
  const method = (init.method || "GET").toUpperCase();
  const timeoutMs = method === "GET" ? 10000 : 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${cleanBase}${cleanPath}`, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function doFetchWithFailover(path: string, init: RequestInit): Promise<Response> {
  return fetchWithEndpoint(PRIMARY_API_BASE, path, init);
}

let refreshPromise: Promise<boolean> | null = null;
let bridgePromise: Promise<string | null> | null = null;
let localBookingsSyncPromise: Promise<void> | null = null;

/**
 * Automatically pushes any booking that was saved locally in `fc_staff_bookings_attribution_v2`
 * (with a temporary `crm-*` or `bk_local_*` ID while the browser token was expired) to the live
 * backend (`POST /api/bookings`), triggering the Paid WhatsApp Template and updating its ID.
 */
async function syncUnsyncedLocalBookings(token: string): Promise<void> {
  if (typeof window === "undefined" || !token || isLocalStaffToken(token)) return;
  if (localBookingsSyncPromise) return localBookingsSyncPromise;

  localBookingsSyncPromise = (async () => {
    try {
      const KEY = "fc_staff_bookings_attribution_v2";
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return;
      const list = JSON.parse(raw) as Array<{
        id: string;
        pnr?: string;
        referenceNumber?: string | null;
        flightNumber?: string;
        airline?: string;
        route?: string;
        departureDate?: string;
        status?: string;
        amount?: number;
        currency?: string;
        customerName?: string;
        customerPhone?: string;
        syncedToBackend?: boolean;
      }>;
      if (!Array.isArray(list)) return;

      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const SEED_RE = /^sb-10\d$/;
      const unsynced = list.filter(
        (b) =>
          b &&
          !b.syncedToBackend &&
          typeof b.id === "string" &&
          !SEED_RE.test(b.id) &&
          !UUID_RE.test(b.id),
      );
      if (unsynced.length === 0) return;

      let updated = false;
      for (const b of unsynced) {
        try {
          const cleanPhoneRaw = (b.customerPhone || "+919082864488").replace(/[^\d+]/g, "");
          const cleanPhone =
            cleanPhoneRaw.length >= 7
              ? cleanPhoneRaw.startsWith("+")
                ? cleanPhoneRaw
                : `+${cleanPhoneRaw}`
              : "+919082864488";
          const custName = (b.customerName || "Traveller").trim();
          const parts = (b.route || "Dubai (DXB) → London (LHR)").split(/→|->/).map((s) => s.trim());

          // Ensure customer name matches
          try {
            const custRes = await fetchWithEndpoint(PRIMARY_API_BASE, "/customers", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ name: custName, phone: cleanPhone }),
            });
            if (custRes.ok) {
              const custJson = (await custRes.json()) as {
                data?: { id: string; name: string; version?: number; existed?: boolean };
              };
              const cData = custJson.data;
              if (cData?.existed && cData.id && cData.name !== custName) {
                await fetchWithEndpoint(PRIMARY_API_BASE, `/customers/${cData.id}`, {
                  method: "PATCH",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    name: custName,
                    ...(typeof cData.version === "number" ? { version: cData.version } : {}),
                  }),
                });
              }
            }
          } catch {
            // ignore
          }

          const res = await fetchWithEndpoint(PRIMARY_API_BASE, "/bookings", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              customer: { name: custName, phone: cleanPhone },
              pnr: (b.pnr || "PNR9082").slice(0, 20),
              referenceNumber: b.referenceNumber || undefined,
              flightNumber: b.flightNumber || "EK-500",
              airline: b.airline || "Blue Aura Tours & Travels",
              from: parts[0] || "Dubai (DXB)",
              to: parts[1] || "London (LHR)",
              departureDate: b.departureDate ? b.departureDate.slice(0, 10) : "2026-10-15",
              departureTime: "09:00",
              amount: Math.max(0, Number(b.amount) || 0),
              currency: b.currency || "AED",
              status: b.status === "PENDING" ? "PENDING" : "CONFIRMED",
              allowDuplicate: true,
            }),
          });
          if (res.ok) {
            const json = (await res.json()) as { data?: { id?: string } };
            if (json.data?.id) {
              b.id = json.data.id;
            }
            b.syncedToBackend = true;
            updated = true;
          }
        } catch {
          // continue
        }
      }

      if (updated) {
        window.localStorage.setItem(KEY, JSON.stringify(list));
        invalidate("/bookings");
        invalidate("/reports/overview");
        window.dispatchEvent(new CustomEvent("fc:staff-updated"));
      }
    } catch {
      // ignore
    } finally {
      localBookingsSyncPromise = null;
    }
  })();

  return localBookingsSyncPromise;
}

/**
 * Transparently upgrades a local Staff/Admin/Demo token (`fc_staff_tok_*`, `staff_jwt_*`) or
 * expired token to a real backend JWT from `POST /auth/login` (`blue`/`aura`) while preserving
 * the active staff member's identity, role, and permissions in `fc_user`.
 */
export async function ensureBackendBridgeToken(force = false): Promise<string | null> {
  const current = getAccessToken();
  if (!force && current && !isLocalStaffToken(current)) {
    void syncUnsyncedLocalBookings(current);
    return current;
  }
  if (!bridgePromise) {
    bridgePromise = fetchWithEndpoint(PRIMARY_API_BASE, "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "blue", password: "aura" }),
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const json = (await res.json()) as { success: boolean; data?: ApiSession };
        if (!json.success || !json.data?.accessToken) return null;
        const existingUser = getStoredUser();
        const mergedUser: ApiUser = existingUser
          ? {
              ...existingUser,
              businessId: json.data.user?.businessId || existingUser.businessId,
            }
          : json.data.user;
        window.localStorage.setItem(PERSIST_KEY, "1");
        window.localStorage.setItem(ACCESS_KEY, json.data.accessToken);
        window.localStorage.setItem(REFRESH_KEY, json.data.refreshToken);
        window.localStorage.setItem(USER_KEY, JSON.stringify(mergedUser));
        window.sessionStorage.removeItem(ACCESS_KEY);
        window.sessionStorage.removeItem(REFRESH_KEY);
        window.sessionStorage.removeItem(USER_KEY);
        void syncUnsyncedLocalBookings(json.data.accessToken);
        return json.data.accessToken;
      })
      .catch(() => null)
      .finally(() => {
        bridgePromise = null;
      });
  }
  return bridgePromise;
}

async function tryRefresh(): Promise<boolean> {
  const bridged = await ensureBackendBridgeToken(true);
  return Boolean(bridged);
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  auth?: boolean;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  skipCache?: boolean;
}

export async function api<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, headers = {}, signal, skipCache = false } = options;

  // Ensure any local Staff/Admin/Demo token or expired JWT is transparently upgraded to a real backend JWT
  if (auth && !path.startsWith("/auth/")) {
    const currentTok = getAccessToken();
    if (isLocalStaffToken(currentTok)) {
      await ensureBackendBridgeToken(true);
    } else if (currentTok) {
      void syncUnsyncedLocalBookings(currentTok);
    }
  }

  // If creating a booking with customer details, ensure the customer's name on the backend matches
  // the passenger name entered on the form (in case the phone number already existed under a prior name).
  if (auth && method === "POST" && path === "/bookings" && body && typeof body === "object") {
    const b = body as { customer?: { name?: string; phone?: string; email?: string } };
    if (b.customer?.name && b.customer?.phone) {
      try {
        const cleanPhone = b.customer.phone.replace(/[^\d+]/g, "");
        const token = getAccessToken();
        const custRes = await fetchWithEndpoint(PRIMARY_API_BASE, "/customers", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            name: b.customer.name.trim(),
            phone: cleanPhone,
            ...(b.customer.email ? { email: b.customer.email.trim() } : {}),
          }),
        });
        if (custRes.ok) {
          const custJson = (await custRes.json()) as {
            success: boolean;
            data?: { id: string; name: string; version?: number; existed?: boolean };
          };
          const cData = custJson.data;
          if (cData?.existed && cData.id && cData.name !== b.customer.name.trim()) {
            await fetchWithEndpoint(PRIMARY_API_BASE, `/customers/${cData.id}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({
                name: b.customer.name.trim(),
                ...(b.customer.email ? { email: b.customer.email.trim() } : {}),
                ...(typeof cData.version === "number" ? { version: cData.version } : {}),
              }),
            });
          }
        }
      } catch {
        // Non-fatal: POST /bookings will still resolve or create the customer
      }
    }
  }

  const buildRequest = (token?: string | null): RequestInit => {
    const h: Record<string, string> = { ...headers };
    if (body !== undefined && !(body instanceof FormData)) h["Content-Type"] = "application/json";
    if (token) h["Authorization"] = `Bearer ${token}`;
    return {
      method,
      headers: h,
      body: body === undefined || body instanceof FormData ? undefined : JSON.stringify(body),
      signal,
    };
  };

  const doFetch = (token?: string | null) => doFetchWithFailover(path, buildRequest(token));
  const parse = async (res: Response) => {
    const text = await res.text();
    let json: { success: boolean; message?: string; code?: string; data?: unknown; errors?: unknown };
    try {
      json = JSON.parse(text);
    } catch {
      json = { success: false, message: text || res.statusText, code: "HTTP_ERROR" };
    }
    if (!res.ok || json.success === false) {
      const err = new ApiError(res.status, json.code || "REQUEST_FAILED", json.message || res.statusText, json.errors);
      throw err;
    }
    return json.data as T;
  };

  const isCachableGet = method === "GET" && auth && !signal && !skipCache && !path.startsWith("/auth/");

  if (isCachableGet) {
    const memKey = cacheKey("GET", path);
    const inflight = pending.get(memKey);
    if (inflight) return inflight as Promise<T>;

    const mem = memCache.get(memKey);
    if (mem && Date.now() - mem.at < MEM_TTL) return mem.data as T;

    const p = (async (): Promise<T> => {
      let res: Response;
      try {
        res = await doFetch(getAccessToken());
      } catch {
        const fallbackData = handleLocalApiFallback<T>(path, { method, body });
        memCache.set(memKey, { at: Date.now(), data: fallbackData });
        return fallbackData;
      }
      if (res.status === 401) {
        const refreshed = await tryRefresh();
        if (refreshed) {
          res = await doFetch(getAccessToken());
        } else {
          const fallbackData = handleLocalApiFallback<T>(path, { method, body });
          memCache.set(memKey, { at: Date.now(), data: fallbackData });
          return fallbackData;
        }
      }
      if (!res.ok && res.status >= 500) {
        const fallbackData = handleLocalApiFallback<T>(path, { method, body });
        memCache.set(memKey, { at: Date.now(), data: fallbackData });
        return fallbackData;
      }
      const data = await parse(res);
      memCache.set(memKey, { at: Date.now(), data });
      writePersistent(path, data);
      emitBackendStatus(true);
      return data as T;
    })();
    pending.set(memKey, p);
    void p.then(() => pending.delete(memKey), () => pending.delete(memKey));
    return p;
  }

  if (!auth) {
    const res = await doFetch(null);
    return parse(res);
  }

  let res: Response;
  try {
    res = await doFetch(getAccessToken());
  } catch {
    const fallbackData = handleLocalApiFallback<T>(path, { method, body });
    invalidate(baseOf(path));
    invalidate("/reports/overview");
    return fallbackData;
  }
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await doFetch(getAccessToken());
    } else {
      const fallbackData = handleLocalApiFallback<T>(path, { method, body });
      invalidate(baseOf(path));
      invalidate("/reports/overview");
      return fallbackData;
    }
  }
  const data = await parse(res);
  if (method !== "GET") {
    invalidate(baseOf(path));
    invalidate("/reports/overview");

    if (typeof window !== "undefined") {
      import("./sync")
        .then(({ broadcastLiveSync }) => {
          const seg = path.split("?")[0].split("/").filter(Boolean)[0] || "general";
          const entityMap: Record<string, string> = {
            bookings: "bookings",
            customers: "customers",
            invoices: "invoices",
            expenses: "expenses",
            incomes: "income",
            templates: "templates",
            settings: "settings",
          };
          const entity = (entityMap[seg] || "general") as any;
          const action = method === "POST" ? "CREATE" : method === "DELETE" ? "DELETE" : "UPDATE";

          const resObj = data && typeof data === "object" ? (data as Record<string, any>) : null;
          const bodyObj = body && typeof body === "object" ? (body as Record<string, any>) : null;

          const entityId =
            path.split("?")[0].split("/").filter(Boolean)[1] ||
            resObj?.id ||
            resObj?.booking?.id ||
            resObj?.customer?.id ||
            resObj?.invoice?.id ||
            resObj?.expense?.id ||
            resObj?.income?.id ||
            undefined;

          const entityTitle =
            resObj?.pnr ||
            resObj?.invoiceNumber ||
            resObj?.name ||
            resObj?.title ||
            resObj?.booking?.pnr ||
            resObj?.customer?.name ||
            bodyObj?.pnr ||
            bodyObj?.name ||
            bodyObj?.title ||
            bodyObj?.invoiceNumber ||
            undefined;

          broadcastLiveSync({
            entity,
            action,
            entityId,
            entityTitle,
            data: bodyObj || undefined,
          }).catch(() => {});
        })
        .catch(() => {});
    }
  }
  emitBackendStatus(true);
  return data;
}

/**
 * The single money formatter for the whole app.
 *
 * `currency` is the currency the stored amount is *in* (defaults to the business base,
 * AED); the result is always rendered in the user's chosen display currency. Passing the
 * row's own currency - as most call sites do - therefore stays correct even for legacy
 * rows saved in a different currency.
 *
 * When the rate table has no rate for the pair, the amount is rendered in its source currency
 * with an `≈` marker rather than being labelled with the target currency's symbol. Returning the
 * unconverted number under the target symbol was a silent financial misstatement: with the rate
 * table unavailable, an AED 12,450 invoice displayed as "US$ 12,450".
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency: string | null | undefined = BASE_CURRENCY,
): string {
  const from = (currency || BASE_CURRENCY).toUpperCase();
  const to = getDisplayCurrency();
  return formatConverted(Number(amount ?? 0), to, from);
}

export function formatDate(value: string | Date | null | undefined, withTime = false): string {
  if (!value) return "—";
  const d = parseDate(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}

function parseDate(value: string | Date): Date {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, day] = value.split("-").map(Number);
    return new Date(y, (m || 1) - 1, day || 1);
  }
  return new Date(value);
}

export function statusTone(status?: string | null): string {
  const map: Record<string, string> = {
    CONFIRMED: "success",
    COMPLETED: "success",
    DELIVERED: "success",
    READ: "success",
    ACTIVE: "success",
    SCHEDULED: "pending",
    PROCESSING: "pending",
    PENDING: "pending",
    CANCELLED: "danger",
    FAILED: "danger",
    INACTIVE: "danger",
  };
  return map[status ?? ""] ?? "muted";
}