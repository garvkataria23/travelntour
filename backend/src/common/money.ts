import { minorUnitDigits } from '../currency/decimals';

/**
 * Money arithmetic.
 *
 * All monetary values are stored as Postgres `double precision` (Prisma `Float`). Binary floats
 * cannot represent 0.1, so naive accumulation drifts: a P&L summed from 1,000 rows of 0.1 ends up
 * off by a visible amount, and that figure gets exported to the accountant.
 *
 * Every place that touches money must therefore go through these helpers rather than calling
 * Math.* directly, so that rounding is applied once, consistently, at a known boundary.
 *
 * The minor-unit table is NOT duplicated here — it is imported from currency/decimals.ts, which is
 * the single source of truth used for rendering too. An earlier copy of these sets in this file
 * silently omitted INR, which a unit test caught as a wrong rounding behaviour.
 *
 * NOTE: `Float` is a known compromise, not the ideal. The correct end state is `@db.Decimal(18, 2)`
 * with Decimal.js. That is a large migration (~200 arithmetic sites) and is deliberately deferred
 * to its own change; until then, centralising rounding here keeps the damage bounded and
 * predictable.
 */

function minorUnits(currency?: string | null): number {
  return minorUnitDigits((currency ?? 'AED').toUpperCase());
}

/** Coerces anything that can arrive from a DB row, a DTO or a JSON body into a finite number. */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Rounds to the currency's minor unit using half-up (what an accountant expects, not banker's rounding). */
export function money(value: unknown, currency?: string | null): number {
  const n = toNumber(value);
  const places = minorUnits(currency);
  const factor = 10 ** places;
  // Half-up on the absolute value, so -0.005 rounds to -0.01 rather than toward zero.
  return (n < 0 ? -1 : 1) * Math.round(Math.abs(n) * factor) / factor;
}

/** Rounds to a fixed number of places, for rates and percentages rather than money. */
export function round(value: unknown, places = 2): number {
  const n = toNumber(value);
  const factor = 10 ** places;
  return (n < 0 ? -1 : 1) * Math.round(Math.abs(n) * factor) / factor;
}

/** Adds a list of amounts without accumulating float drift. */
export function sum(values: Array<unknown>, currency?: string | null): number {
  // Sum in integer minor units, then convert once, so the rounding error cannot accumulate.
  const places = minorUnits(currency);
  const factor = 10 ** places;
  let total = 0;
  for (const value of values) {
    total += Math.round(toNumber(value) * factor);
  }
  return total / factor;
}

/** Applies a percentage (e.g. a tax rate) to an amount, rounded to the currency's minor unit. */
export function percentageOf(amount: unknown, percent: unknown, currency?: string | null): number {
  const rate = toNumber(percent);
  if (rate <= 0) return 0;
  return money(toNumber(amount) * (rate / 100), currency);
}

/** Clamps a value into [min, max] after rounding. Used for paid/due bounds. */
export function clampMoney(value: unknown, min: number, max: number, currency?: string | null): number {
  return Math.min(Math.max(money(value, currency), money(min, currency)), money(max, currency));
}