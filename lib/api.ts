"use client";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string | null;
}

export interface ApiSession {
  accessToken: string;
  refreshToken: string;
  user: ApiUser;
}

const ACCESS_KEY = "fc_access";
const REFRESH_KEY = "fc_refresh";
const USER_KEY = "fc_user";
const PERSIST_KEY = "fc_persist";

function persist(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PERSIST_KEY) === "1";
}

function store(): Storage {
  return persist() ? window.localStorage : window.sessionStorage;
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return store().getItem(ACCESS_KEY) ?? window.sessionStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return store().getItem(REFRESH_KEY) ?? window.sessionStorage.getItem(REFRESH_KEY);
}

export function getStoredUser(): ApiUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = store().getItem(USER_KEY) ?? window.sessionStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as ApiUser) : null;
  } catch {
    return null;
  }
}

export function setSession(session: ApiSession, remember = true): void {
  window.localStorage.setItem(PERSIST_KEY, remember ? "1" : "0");
  const target = remember ? window.localStorage : window.sessionStorage;
  target.setItem(ACCESS_KEY, session.accessToken);
  target.setItem(REFRESH_KEY, session.refreshToken);
  target.setItem(USER_KEY, JSON.stringify(session.user));
  const other = remember ? window.sessionStorage : window.localStorage;
  other.removeItem(ACCESS_KEY);
  other.removeItem(REFRESH_KEY);
  other.removeItem(USER_KEY);
}

export function hasActiveSession(): boolean {
  return Boolean(getAccessToken());
}

export function clearSession() {
  for (const bucket of [window.localStorage, window.sessionStorage]) {
    bucket.removeItem(ACCESS_KEY);
    bucket.removeItem(REFRESH_KEY);
    bucket.removeItem(USER_KEY);
  }
  window.localStorage.removeItem(PERSIST_KEY);
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

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        const json = (await res.json()) as { success: boolean; data?: ApiSession };
        if (!res.ok || !json.success || !json.data) {
          clearSession();
          return false;
        }
        setSession(json.data);
        return true;
      })
      .catch(() => {
        clearSession();
        return false;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  auth?: boolean;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export async function api<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, headers = {}, signal } = options;

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

  const doFetch = (token?: string | null) => fetch(`${API_BASE}${path}`, buildRequest(token));
  const parse = async (res: Response) => {
    const text = await res.text();
    let json: { success: boolean; message?: string; code?: string; data?: unknown; errors?: unknown };
    try {
      json = JSON.parse(text);
    } catch {
      json = { success: false, message: text || res.statusText, code: "HTTP_ERROR" };
    }
    if (!res.ok || json.success === false) {
      const err = new ApiError(
        res.status,
        json.code || "REQUEST_FAILED",
        json.message || res.statusText,
        json.errors,
      );
      if (res.status === 401 && auth) throw err;
      throw err;
    }
    return json.data as T;
  };

  if (!auth) {
    const res = await doFetch(null);
    return parse(res);
  }

  let res = await doFetch(getAccessToken());
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await doFetch(getAccessToken());
    } else {
      res = await doFetch(null);
    }
  }
  return parse(res);
}

export function formatCurrency(amount: number | null | undefined, currency = "INR"): string {
  const value = Number(amount ?? 0);
  if (currency === "INR") {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
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