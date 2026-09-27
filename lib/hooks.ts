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
      const result = await api<T>(path, { method, body, auth: true });
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
  }, [path, method, isQuery, bodyKey]);

  refetchRef.current = refetch;

  useEffect(() => {
    hasData.current = false;
    refetch();
  }, [refetch]);

  // Poll on an interval. Requests are deduped and the 5s memory cache in lib/api absorbs
  // overlapping ticks, so a slow response can never stack up.
  useEffect(() => {
    if (!refetchInterval || !path || !isQuery) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      refetchRef.current();
    }, refetchInterval);
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