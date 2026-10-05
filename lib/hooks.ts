"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, getCachedGet } from "@/lib/api";

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  offline: boolean;
  refetch: () => Promise<void>;
}

export interface UseApiOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Poll interval in ms. Only set this on list pages. */
  refetchInterval?: number;
}

export function useApi<T>(path: string | null, options: UseApiOptions = {}) {
  const { method = "GET", body, refetchInterval } = options;
  const isQuery = method === "GET";
  const bodyKey = JSON.stringify(body ?? null);

  // The body is held in a ref so `refetch` depends on the serialized form (which is what actually
  // determines the request) rather than on an object identity that is new on every render.
  const bodyRef = useRef(body);
  bodyRef.current = body;

  const [data, setData] = useState<T | null>(() => (path && isQuery ? getCachedGet<T>(path) : null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const runId = useRef(0);
  // Once we hold data, background revalidations must not flip `loading` back on: a list
  // page would flash empty and an open edit modal would unmount and lose the user's typing.
  const hasData = useRef(data !== null);
  const refetchRef = useRef<() => Promise<void>>(async () => {});
  const refetch = useCallback(async (): Promise<void> => {
    if (!path) {
      setData(null);
      setLoading(false);
      setError(null);
      setOffline(false);
      hasData.current = false;
      return;
    }
    const id = ++runId.current;
    if (!hasData.current) setLoading(true);
    setError(null);

    const precached = isQuery ? getCachedGet<T>(path) : null;
    if (precached !== null && precached !== undefined) {
      setData(precached);
      hasData.current = true;
    }

    try {
      const result = await api<T>(path, { method, body: bodyRef.current, auth: true });
      if (runId.current !== id) return;
      setData(result);
      hasData.current = true;
      setLoading(false);
      setOffline(false);
    } catch (err: unknown) {
      if (runId.current !== id) return;
      const cached = isQuery ? getCachedGet<T>(path) : null;
      if (cached !== null && cached !== undefined) {
        setData(cached);
        hasData.current = true;
        setOffline(true);
        setLoading(false);
      } else {
        setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Something went wrong");
        setOffline(false);
        setLoading(false);
      }
    }
  // `bodyKey` is intentionally the dependency rather than the ref: a ref does not trigger
  // re-creation of the callback, so the effect below would never re-run when the request body
  // changes. The ref exists only to avoid re-subscribing on body *identity*.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, method, isQuery, bodyKey]);

  refetchRef.current = refetch;

  useEffect(() => {
    hasData.current = false;
    refetch();
  }, [refetch]);

  // Instant Live Sync: refetch immediately when a colleague or another tab mutates data
  useEffect(() => {
    if (!path || !isQuery) return;
    let unsubscribe: (() => void) | null = null;
    import("@/lib/sync").then(({ subscribeToLiveSync }) => {
      unsubscribe = subscribeToLiveSync((event) => {
        const seg = path.split("?")[0].split("/").filter(Boolean)[0] || "";
        const isMatch =
          event.entity === "general" ||
          path.includes(event.entity) ||
          (event.entity === "income" && seg === "incomes") ||
          (seg === "reports" && ["bookings", "customers", "invoices", "expenses", "income"].includes(event.entity));

        if (isMatch) {
          refetchRef.current();
        }
      });
    }).catch(() => {});

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [path, isQuery]);

  // Adaptive polling fallback: only poll when refetchInterval is not explicitly 0
  useEffect(() => {
    if (!path || !isQuery) return;
    if (refetchInterval === 0) return;
    const interval = typeof refetchInterval === "number" && refetchInterval > 0 ? refetchInterval : 5000;
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      refetchRef.current();
    }, interval);
    return () => window.clearInterval(id);
  }, [refetchInterval, path, isQuery]);

  // A tab left open in the background is usually stale the moment it comes back, and staff
  // switch between booking and WhatsApp constantly.
  useEffect(() => {
    if (!path || !isQuery) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") refetchRef.current();
    };
    const onFocus = () => refetchRef.current();
    const onOnline = () => refetchRef.current();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [path, isQuery]);

  return { data, loading, error, offline, refetch } as ApiState<T>;
}

export function useOffline(): boolean {
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onLine = () => setOffline(false);
    const offLine = () => setOffline(true);
    const onNet = (event: Event) => setOffline(!(event as CustomEvent).detail.online);
    setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    window.addEventListener("online", onLine);
    window.addEventListener("offline", offLine);
    window.addEventListener("fc-net", onNet as EventListener);
    return () => {
      window.removeEventListener("online", onLine);
      window.removeEventListener("offline", offLine);
      window.removeEventListener("fc-net", onNet as EventListener);
    };
  }, []);
  return offline;
}