/** The business base currency. Amounts are always stored in this; the UI converts for display. */
export const BASE_CURRENCY = 'AED';

/**
 * Currencies that ISO 4217 gives minor digits for (AED fils, INR paise, ...) but that this
 * business quotes as whole numbers, matching the pre-existing `maximumFractionDigits: 0`
 * behaviour of the app. The Gulf dirhams and South Asian rupees are never invoiced with
 * fractions in travel, so they are added to the runtime-derived ISO answer.
 */
const WHOLE_NUMBER_ONLY = new Set<string>([
  'AED', 'SAR', 'QAR', // Gulf dirhams / riyal - fils and halalas are not used
  'INR', 'PKR', 'NPR', 'BDT', 'LKR', 'AFN', 'MMK', 'KHR', 'LAK', // South Asian rupees
]);

/** Currencies ISO 4217 declares with three minor digits; hardcoded because Intl reports 2. */
const THREE_DECIMAL_OVERRIDES = new Set<string>(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

const digitCache = new Map<string, 0 | 2 | 3>();

/**
 * Number of fraction digits a currency should be rendered with.
 *
 * The ISO 4217 answer is read from `Intl` at runtime rather than hardcoded, so new
 * currencies are handled automatically; the two sets above cover the deliberate
 * deviations (whole-number business convention, and the three-digit dinars).
 */
export function minorUnitDigits(currency: string): 0 | 2 | 3 {
  const code = (currency || '').toUpperCase();
  const cached = digitCache.get(code);
  if (cached !== undefined) return cached;

  let digits: 0 | 2 | 3;
  if (WHOLE_NUMBER_ONLY.has(code)) {
    digits = 0;
  } else if (THREE_DECIMAL_OVERRIDES.has(code)) {
    digits = 3;
  } else {
    try {
      const resolved = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions()
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
  AED: 'en-AE',
  INR: 'en-IN',
  BDT: 'en-BD',
  LKR: 'en-LK',
  NPR: 'en-NP',
  PKR: 'en-PK',
};

export function localeFor(currency: string): string {
  const code = (currency || '').toUpperCase();
  return CURRENCY_LOCALES[code] ?? 'en-US';
}

export interface MoneyFormatOptions {
  /** Override the fraction digits that would normally be derived from the currency. */
  digits?: number;
  /** Return an em-dash instead of a formatted zero when the value is null/undefined/NaN. */
  dashWhenEmpty?: boolean;
}

/** Single source of truth for money formatting on the backend. Mirrors lib/currency.tsx on the frontend. */
export function formatMoney(
  value: number | null | undefined,
  currency = 'AED',
  options: MoneyFormatOptions = {},
): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return options.dashWhenEmpty ? '—' : formatMoney(0, currency, { ...options, dashWhenEmpty: false });
  }
  const code = (currency || 'AED').toUpperCase();
  const digits = options.digits ?? minorUnitDigits(code);
  return new Intl.NumberFormat(localeFor(code), {
    style: 'currency',
    currency: code,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value));
}
