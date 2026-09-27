"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { useApi } from "@/lib/hooks";
import {
  BASE_CURRENCY,
  RateTable,
  convertAmount,
  formatMoney,
  getDisplayCurrency,
  getDisplayCurrencySnapshot,
  getRateTableSnapshot,
  initDisplayCurrency,
  rateBetween,
  setDisplayCurrency,
  setRateTable,
  subscribeToCurrency,
} from "@/lib/currency-core";

export interface CurrencyOption {
  code: string;
  name: string;
  fiat: boolean;
  digits: 0 | 2 | 3;
}

export interface CurrencyContextValue {
  /** Currency every amount in the UI is displayed in. */
  display: string;
  /** Currency amounts are stored in. */
  base: string;
  setDisplay: (code: string) => void;
  rates: RateTable | null;
  loading: boolean;
  error: string | null;
  offline: boolean;
  refresh: () => void;
  /** Live rate table plus the currency catalogue, both for the /currency page. */
  options: CurrencyOption[];
  convert: (value: number, to?: string, from?: string) => number;
  rate: (from: string, to: string) => number | null;
  money: (value: number | null | undefined, currency?: string) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const RATES_PATH = "/currency/rates";
const LIST_PATH = "/currency/list";

export function CurrencyProvider({ children, businessCurrency }: { children: ReactNode; businessCurrency?: string | null }) {
  const display = useSyncExternalStore(subscribeToCurrency, getDisplayCurrencySnapshot, getDisplayCurrencySnapshot);
  const rates = useSyncExternalStore(subscribeToCurrency, getRateTableSnapshot, getRateTableSnapshot);

  const ratesQuery = useApi<RateTable>(RATES_PATH);
  const listQuery = useApi<{ base: string; currencies: CurrencyOption[] }>(LIST_PATH);

  useEffect(() => {
    initDisplayCurrency(businessCurrency);
  }, [businessCurrency]);

  useEffect(() => {
    if (ratesQuery.data) setRateTable(ratesQuery.data);
  }, [ratesQuery.data]);

  const value = useMemo<CurrencyContextValue>(
    () => ({
      display,
      base: rates?.base ?? BASE_CURRENCY,
      setDisplay: setDisplayCurrency,
      rates,
      loading: ratesQuery.loading && !rates,
      error: ratesQuery.error,
      offline: ratesQuery.offline,
      refresh: ratesQuery.refetch,
      options: listQuery.data?.currencies ?? [],
      convert: (amount, to, from) => convertAmount(amount, to ?? display, from ?? BASE_CURRENCY),
      rate: (from, to) => rateBetween(from, to),
      money: (value_, currency) => formatMoney(value_, currency ?? display),
    }),
    [display, rates, ratesQuery.loading, ratesQuery.error, ratesQuery.offline, ratesQuery.refetch, listQuery.data],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

/**
 * Reads the currency context. Any component that renders money through `formatCurrency`
 * must call this (or be rendered by a component that does) so it re-renders when the
 * display currency or the rate table changes.
 */
export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (ctx) return ctx;
  // Rendered outside the provider (login page, tests): behave as a plain AED formatter.
  return {
    display: BASE_CURRENCY,
    base: BASE_CURRENCY,
    setDisplay: setDisplayCurrency,
    rates: null,
    loading: false,
    error: null,
    offline: false,
    refresh: () => {},
    options: [],
    convert: (amount) => amount,
    rate: (from, to) => (from === to ? 1 : null),
    money: (value, currency) => formatMoney(value, currency ?? BASE_CURRENCY),
  };
}

/** Convenience hook for components that only need to re-render on currency changes. */
export function useDisplayCurrency(): [string, (code: string) => void] {
  const { display, setDisplay } = useCurrency();
  return [display, setDisplay];
}

export { BASE_CURRENCY, convertAmount, formatMoney, rateBetween };
export type { CurrencyOption as CurrencyMeta, RateTable };
