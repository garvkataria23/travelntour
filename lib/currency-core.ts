"use client";

/**
 * Currency core: pure formatting helpers plus a tiny synchronous store holding the
 * user's chosen display currency and the latest rate table.
 *
 * Deliberately free of React and of any import from `lib/api` or `lib/hooks` so that
 * `lib/api.ts` can depend on it without creating an import cycle
 * (api -> currency -> hooks -> api).
 *
 * `convertAmount` is synchronous on purpose: money is formatted during render in ~60 call
 * sites, so conversion has to work off an already-fetched rate table rather than a promise.
 */

/** The business base currency. Every stored amount is in this currency. */
export const BASE_CURRENCY = "AED";

/**
 * Currencies ISO 4217 gives minor digits for (AED fils, INR paise, ...) but that this
 * business quotes as whole numbers, matching the app's previous `maximumFractionDigits: 0`
 * behaviour. Mirrors backend/src/currency/decimals.ts.
 */
const WHOLE_NUMBER_ONLY = new Set<string>([
  "AED", "SAR", "QAR",
  "INR", "PKR", "NPR", "BDT", "LKR", "AFN", "MMK", "KHR", "LAK",
]);

/** ISO 4217 three-digit currencies; hardcoded because Intl reports 2 for these. */
const THREE_DECIMAL_OVERRIDES = new Set<string>(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

const digitCache = new Map<string, 0 | 2 | 3>();

/** Fraction digits a currency should be rendered with. */
export function minorUnitDigits(currency: string): 0 | 2 | 3 {
  const code = (currency || "").toUpperCase();
  const cached = digitCache.get(code);
  if (cached !== undefined) return cached;

  let digits: 0 | 2 | 3;
  if (WHOLE_NUMBER_ONLY.has(code)) {
    digits = 0;
  } else if (THREE_DECIMAL_OVERRIDES.has(code)) {
    digits = 3;
  } else {
    try {
      const resolved = new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions()
        .maximumFractionDigits;
      digits = resolved === 0 ? 0 : resolved === 3 ? 3 : 2;
    } catch {
      digits = 2;
    }
  }

  digitCache.set(code, digits);
  return digits;
}

const CURRENCY_LOCALES: Record<string, string> = {
  AED: "en-AE",
  INR: "en-IN",
  BDT: "en-BD",
  LKR: "en-LK",
  NPR: "en-NP",
  PKR: "en-PK",
};

export function localeFor(currency: string): string {
  const code = (currency || "").toUpperCase();
  return CURRENCY_LOCALES[code] ?? "en-US";
}

export function formatMoney(
  value: number | null | undefined,
  currency = BASE_CURRENCY,
): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return formatMoney(0, currency);
  }
  const code = (currency || BASE_CURRENCY).toUpperCase();
  const digits = minorUnitDigits(code);
  return new Intl.NumberFormat(localeFor(code), {
    style: "currency",
    currency: code,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value));
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface RateTable {
  base: string;
  rates: Record<string, number>;
  asOf: string;
  fetchedAt: string;
  source: string;
  stale: boolean;
}

let displayCurrency: string = BASE_CURRENCY;
let rateTable: RateTable | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeToCurrency(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDisplayCurrency(): string {
  return displayCurrency;
}

export function getRateTable(): RateTable | null {
  return rateTable;
}

/** `useSyncExternalStore` needs referentially stable snapshots; these return primitives. */
export function getDisplayCurrencySnapshot(): string {
  return displayCurrency;
}

export function getRateTableSnapshot(): RateTable | null {
  return rateTable;
}

export function setDisplayCurrency(next: string): void {
  const code = (next || BASE_CURRENCY).toUpperCase();
  if (code === displayCurrency) return;
  displayCurrency = code;
  if (typeof window !== "undefined") window.localStorage.setItem(DISPLAY_KEY, code);
  emit();
}

export function setRateTable(table: RateTable | null): void {
  rateTable = table;
  emit();
}

export const DISPLAY_KEY = "fc_display_currency";

function readStoredDisplay(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(DISPLAY_KEY);
  } catch {
    return null;
  }
}

/** Seeds the display currency from storage or the business default. Called once on mount. */
export function initDisplayCurrency(businessCurrency?: string | null): void {
  if (displayCurrency !== BASE_CURRENCY) return;
  const stored = readStoredDisplay();
  const next = stored || businessCurrency || BASE_CURRENCY;
  if (next !== displayCurrency) {
    displayCurrency = next.toUpperCase();
    emit();
  }
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/** Rate for 1 unit of `from` expressed in `to`, via the base currency. */
export function rateBetween(from: string, to: string): number | null {
  const fromCode = (from || BASE_CURRENCY).toUpperCase();
  const toCode = (to || BASE_CURRENCY).toUpperCase();
  if (fromCode === toCode) return 1;
  if (!rateTable) return null;

  const fromRate = fromCode === rateTable.base ? 1 : rateTable.rates[fromCode];
  const toRate = toCode === rateTable.base ? 1 : rateTable.rates[toCode];
  if (!fromRate || !toRate) return null;
  return toRate / fromRate;
}

/**
 * Converts an amount between currencies synchronously.
 *
 * Falls back to the unconverted value when rates are not loaded yet or the pair is
 * unavailable, so a number is always shown - just possibly not yet in the chosen currency.
 */
export function convertAmount(value: number, to: string, from: string = BASE_CURRENCY): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const rate = rateBetween(from, to);
  return rate === null ? num : num * rate;
}
