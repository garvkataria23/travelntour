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
  /**
   * False when the rates are the compiled-in BASELINE_RATES rather than a table fetched from an
   * exchange-rate source. The UI must not present those as current market rates.
   */
  live?: boolean;
}

export interface CurrencyOption {
  code: string;
  name: string;
  fiat: boolean;
  digits: 0 | 2 | 3;
}

export const DISPLAY_KEY = "fc_display_currency";
export const RATES_STORAGE_KEY = "fc_cached_rate_table";

/** Known standard currency names used as reliable fallback */
const COMMON_NAMES: Record<string, string> = {
  AED: "United Arab Emirates Dirham",
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  INR: "Indian Rupee",
  SAR: "Saudi Riyal",
  QAR: "Qatari Riyal",
  KWD: "Kuwaiti Dinar",
  OMR: "Omani Rial",
  BHD: "Bahraini Dinar",
  CAD: "Canadian Dollar",
  AUD: "Australian Dollar",
  SGD: "Singapore Dollar",
  JPY: "Japanese Yen",
  PKR: "Pakistani Rupee",
  BDT: "Bangladeshi Taka",
  LKR: "Sri Lankan Rupee",
  NPR: "Nepalese Rupee",
  THB: "Thai Baht",
  MYR: "Malaysian Ringgit",
  CNY: "Chinese Yuan",
  IDR: "Indonesian Rupiah",
  PHP: "Philippine Peso",
  VND: "Vietnamese Dong",
  ZAR: "South African Rand",
  BRL: "Brazilian Real",
  RUB: "Russian Ruble",
  TRY: "Turkish Lira",
  NZD: "New Zealand Dollar",
  CHF: "Swiss Franc",
  HKD: "Hong Kong Dollar",
  KRW: "South Korean Won",
  SEK: "Swedish Krona",
  NOK: "Norwegian Krone",
  DKK: "Danish Krone",
  PLN: "Polish Zloty",
  EGP: "Egyptian Pound",
  MXN: "Mexican Peso",
  ILS: "Israeli New Shekel",
};

/** Baseline exchange rates against AED to guarantee instantaneous conversions */
const BASELINE_RATES: Record<string, number> = {
  AED: 1, USD: 0.2723, EUR: 0.2405, GBP: 0.2053, INR: 26.17,
  SAR: 1.021, QAR: 0.991, KWD: 0.0837, OMR: 0.1048, BHD: 0.1026,
  CAD: 0.385, AUD: 0.412, SGD: 0.355, JPY: 42.9, PKR: 75.44,
  BDT: 32.4, LKR: 81.5, NPR: 41.8, THB: 9.09, MYR: 1.22,
  CNY: 1.98, IDR: 4380, PHP: 15.6, VND: 6850, ZAR: 4.75,
  BRL: 1.51, TRY: 9.35, NZD: 0.448, CHF: 0.233, HKD: 2.12,
  KRW: 369.2, SEK: 2.76, NOK: 2.85, DKK: 1.80, PLN: 1.04,
  EGP: 13.4, MXN: 5.25, ILS: 0.98,
};

let cachedDefaultCurrencies: CurrencyOption[] | null = null;

export function getDefaultWorldCurrencies(): CurrencyOption[] {
  if (cachedDefaultCurrencies) return cachedDefaultCurrencies;
  const codes: string[] = (() => {
    try {
      const sup = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
      if (typeof sup === "function") {
        return sup("currency");
      }
    } catch {}
    return Object.keys(COMMON_NAMES);
  })();

  const dn = (() => {
    try {
      return new Intl.DisplayNames(["en"], { type: "currency" });
    } catch {
      return null;
    }
  })();

  const out: CurrencyOption[] = codes.map((code) => {
    let name = COMMON_NAMES[code];
    if (!name && dn) {
      try {
        const resolved = dn.of(code);
        if (resolved && resolved !== code) name = resolved;
      } catch {}
    }
    return {
      code,
      name: name || code,
      fiat: true,
      digits: minorUnitDigits(code),
    };
  });

  cachedDefaultCurrencies = out.sort((a, b) => a.code.localeCompare(b.code));
  return cachedDefaultCurrencies;
}

function readStoredRates(): RateTable | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RATES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.rates === "object" && parsed.base) {
      return parsed as RateTable;
    }
    return null;
  } catch {
    return null;
  }
}

const initialStoredDisplay = readStoredDisplay();

let displayCurrency: string = (initialStoredDisplay ?? BASE_CURRENCY).toUpperCase();
/**
 * Distinguishes "the user picked this" from "this is the business default we applied".
 *
 * Without this, `initDisplayCurrency` could not tell the two apart and used
 * `displayCurrency !== BASE_CURRENCY` as a proxy, which meant that once any display currency had
 * been applied the business default could never change again — a tenant switching its base
 * currency silently kept rendering in the old one.
 */
let displayCurrencyIsUserChoice: boolean = initialStoredDisplay !== null;
let rateTable: RateTable | null = readStoredRates() || {
  base: BASE_CURRENCY,
  rates: BASELINE_RATES,
  // Previously this was stamped with `new Date().toISOString()` and `stale: false`, which meant a
  // cold start with no network presented hardcoded, undated rates as freshly fetched, and every
  // money figure in the app was converted with them. It is now unambiguously flagged as a
  // non-live fallback.
  asOf: "1970-01-01T00:00:00.000Z",
  fetchedAt: "1970-01-01T00:00:00.000Z",
  source: "Built-in fallback (not a live rate)",
  stale: true,
  live: false,
};

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
  // Any call from the UI is an explicit user choice, and an explicit choice must keep winning over
  // the business default on every later load.
  displayCurrencyIsUserChoice = true;
  if (code === displayCurrency) return;
  displayCurrency = code;
  if (typeof window !== "undefined") window.localStorage.setItem(DISPLAY_KEY, code);
  emit();
}

export function setRateTable(table: RateTable | null): void {
  if (!table) return;
  // A table that arrives from the API is live by definition; only the compiled-in baseline is not.
  rateTable = { ...table, live: table.live ?? true };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(rateTable));
    } catch {}
  }
  emit();
}

function readStoredDisplay(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(DISPLAY_KEY);
  } catch {
    return null;
  }
}

/**
 * Seeds the display currency from storage or the business default. Called once on mount.
 *
 * Precedence: an explicit user choice > a stored value > the business default > the base.
 * The business default is deliberately NOT persisted — persisting it would make it
 * indistinguishable from a user choice on the next load, and it would be lost on reload anyway
 * because the value only ever lived in a module variable.
 */
export function initDisplayCurrency(businessCurrency?: string | null): void {
  if (displayCurrencyIsUserChoice) return;

  const stored = readStoredDisplay();
  if (stored && stored.toUpperCase() !== displayCurrency) {
    // A stored value means the user chose it in a previous session.
    displayCurrencyIsUserChoice = true;
    displayCurrency = stored.toUpperCase();
    emit();
    return;
  }

  const next = (businessCurrency || BASE_CURRENCY).toUpperCase();
  if (next !== displayCurrency) {
    displayCurrency = next;
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
 * True when a conversion between the two currencies is currently possible.
 *
 * Callers use this to avoid presenting an unconverted amount as if it were in the target
 * currency. See `formatConverted` for the user-visible behaviour.
 */
export function hasRate(from: string, to: string): boolean {
  return rateBetween(from, to) !== null;
}

/** True when the current rate table is the built-in fallback rather than fetched market rates. */
export function ratesAreLive(): boolean {
  return rateTable?.live !== false;
}

/**
 * Converts an amount between currencies synchronously.
 *
 * NOTE: when no rate is available this returns the input unchanged. That value is NOT in `to`.
 * Callers must not present it as though it were — use `formatConverted`, which marks the amount,
 * or check `hasRate` first.
 */
export function convertAmount(value: number, to: string, from: string = BASE_CURRENCY): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const rate = rateBetween(from, to);
  return rate === null ? num : num * rate;
}

/**
 * Formats an amount converted into `to`, making the fallback explicit.
 *
 * When the rate table has no rate for the pair, the amount is rendered in its SOURCE currency
 * with a `≈` marker instead of being labelled with the target currency's symbol. Previously the
 * unconverted number was rendered with the target currency's symbol and no marker, so an AED
 * 12,450 invoice displayed as "US$ 12,450" whenever the rate table failed to load — a silent
 * financial misstatement.
 */
export function formatConverted(
  value: number | null | undefined,
  to: string = BASE_CURRENCY,
  from: string = BASE_CURRENCY,
): string {
  const toCode = (to || BASE_CURRENCY).toUpperCase();
  const fromCode = (from || BASE_CURRENCY).toUpperCase();
  const rate = rateBetween(fromCode, toCode);

  if (rate === null) {
    if (fromCode === toCode) return formatMoney(value, toCode);
    const amount = formatMoney(value, fromCode);
    return `≈ ${amount} ${fromCode}`;
  }
  return formatMoney(convertAmount(value as number, toCode, fromCode), toCode);
}
