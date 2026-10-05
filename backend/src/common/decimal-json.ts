/**
 * Converts Prisma Decimal values to plain JSON numbers, recursively.
 *
 * Money columns are `Decimal(18,2)`. Prisma returns Decimal.js instances whose `toJSON()` yields a
 * **string**, so without this an amount reaches the browser as `"1234.50"`. The frontend sums and
 * charts these values, so a stringified money field silently breaks arithmetic client-side.
 *
 * Detection is by shape rather than by `instanceof`: the Decimal class is loaded from Prisma's
 * runtime bundle and there can be more than one copy in a dependency tree, which makes
 * `instanceof` unreliable. `Decimal` is distinguished from Date (which also carries
 * `toJSON`/`toString` and must survive as an ISO string) by its method set.
 */

interface DecimalLike {
  constructor: { name: string };
  s: number;
  e: number;
  d: number[];
  toFixed: (dp?: number) => string;
  toString: () => string;
}

function isDecimalLike(value: unknown): value is DecimalLike {
  if (value === null || typeof value !== 'object') return false;
  if (value instanceof Date) return false;
  const candidate = value as unknown as Record<string, unknown>;
  return (
    typeof candidate['toFixed'] === 'function' &&
    typeof candidate['toString'] === 'function' &&
    Array.isArray(candidate['d']) &&
    typeof candidate['e'] === 'number' &&
    typeof candidate['s'] === 'number'
  );
}

export function toPlainJson<T>(value: T): T {
  return convert(value) as T;
}

function convert(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'bigint') {
    // JSON.stringify throws on BigInt; Intl is what the rest of the codebase uses for amounts.
    return Number(value);
  }

  if (value instanceof Date) return value;

  if (Array.isArray(value)) return value.map(convert);

  if (typeof value === 'object') {
    if (isDecimalLike(value)) {
      const n = Number(value.toString());
      return Number.isFinite(n) ? n : 0;
    }
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = convert(item);
    }
    return out;
  }

  return value;
}