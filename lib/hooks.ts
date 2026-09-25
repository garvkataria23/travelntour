"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, getCachedGet } from "@/lib/api";

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  offline: boolean;
  refetch: () => void;
}

export function useApi<T>(path: string | null, options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = {}) {
  const { method = "GET", body } = options;
  const isQuery = method === "GET";
  const bodyKey = JSON.stringify(body ?? null);

  const [data, setData] = useState<T | null>(() => (path && isQuery ? getCachedGet<T>(path) : null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const runId = useRef(0);

  const refetch = useCallback(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      setError(null);
      setOffline(false);
      return;
    }
    const id = ++runId.current;
    setLoading(true);
    setError(null);

    const precached = isQuery ? getCachedGet<T>(path) : null;
    if (precached !== null && precached !== undefined) {
      setData(precached);
    }

    api<T>(path, { method, body, auth: true })
      .then((result) => {
        if (runId.current !== id) return;
        setData(result);
        setLoading(false);
        setOffline(false);
      })
      .catch((err: unknown) => {
        if (runId.current !== id) return;
        const cached = isQuery ? getCachedGet<T>(path) : null;
        if (cached !== null && cached !== undefined) {
          setData(cached);
          setOffline(true);
          setLoading(false);
        } else {
          setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Something went wrong");
          setOffline(false);
          setLoading(false);
        }
      });
  }, [path, method, isQuery, bodyKey]);

  useEffect(() => {
    refetch();
  }, [refetch]);

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