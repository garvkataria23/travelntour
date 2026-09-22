"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApi<T>(path: string | null, options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = {}) {
  const { method = "GET", body } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const runId = useRef(0);

  const refetch = useCallback(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    const id = ++runId.current;
    setLoading(true);
    setError(null);
    api<T>(path, { method, body, auth: true })
      .then((result) => {
        if (runId.current === id) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (runId.current === id) {
          setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Something went wrong");
          setLoading(false);
        }
      });
  }, [path, method, JSON.stringify(body)]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch } as ApiState<T>;
}