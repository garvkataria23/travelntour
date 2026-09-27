import { ConfigService } from '@nestjs/config';
import { CurrencyService } from './currency.service';
import { formatMoney, minorUnitDigits } from './decimals';

/** Realistic fixture: the service rejects any table with fewer than 10 rates. */
const FUNCTABLE: Record<string, number> = {
  AED: 1, AFN: 17.6, ALL: 21.9, ARS: 415, AUD: 0.387, BHD: 0.102, CAD: 0.385,
  CHF: 0.2255, EUR: 0.2389, GBP: 0.2057, IDR: 4873, ILS: 0.8288, INR: 26.1,
  JPY: 42.9, KRW: 369, LKR: 89.8, NPR: 41.8, NTD: 8.65, PKR: 75.4, RUB: 22.9,
  SAR: 1.021, SGD: 0.3479, THB: 9.09, TRY: 13.3, USD: 0.2723, ZAR: 4.44,
};

const CONFIG: Record<string, string> = {
  CURRENCY_BASE: 'AED',
  CURRENCY_PRIMARY_URL: 'https://api.exchangerate.fun/latest?base=',
};

function makeService(overrides: Record<string, string> = {}) {
  const merged = { ...CONFIG, ...overrides };
  const config = { get: (key: string) => merged[key] } as unknown as ConfigService;
  return new CurrencyService(config);
}

const realFetch = global.fetch;

/** Replaces global.fetch with a queue of scripted responses so no test can reach the network. */
function scriptFetch(responses: Array<{ ok?: boolean; status?: number; json?: unknown } | Error>) {
  const fn = jest.fn(async () => {
    const next = responses.length > 1 ? responses.shift()! : responses[0];
    if (next instanceof Error) throw next;
    return {
      ok: next.ok ?? true,
      status: next.status ?? 200,
      json: async () => next.json ?? {},
    } as unknown as Response;
  });
  (global as { fetch: unknown }).fetch = fn;
  return fn;
}

describe('minorUnitDigits', () => {
  it('returns 0 for zero-decimal currencies', () => {
    expect(minorUnitDigits('AED')).toBe(0);
    expect(minorUnitDigits('JPY')).toBe(0);
    expect(minorUnitDigits('KRW')).toBe(0);
  });

  it('returns 0 for rupee/dirham currencies shown whole by business convention', () => {
    expect(minorUnitDigits('INR')).toBe(0);
    expect(minorUnitDigits('PKR')).toBe(0);
    expect(minorUnitDigits('NPR')).toBe(0);
  });

  it('returns 2 for standard currencies', () => {
    expect(minorUnitDigits('USD')).toBe(2);
    expect(minorUnitDigits('EUR')).toBe(2);
  });

  it('returns 3 for three-decimal currencies', () => {
    expect(minorUnitDigits('KWD')).toBe(3);
  });

  it('is case insensitive', () => {
    expect(minorUnitDigits('aed')).toBe(0);
  });
});

describe('formatMoney', () => {
  it('renders zero-decimal currencies without a fraction', () => {
    expect(formatMoney(130450.4, 'INR')).toBe('₹1,30,450');
    expect(formatMoney(1000, 'AED')).toMatch(/1,000/);
  });

  it('keeps two decimals for USD', () => {
    expect(formatMoney(12.5, 'USD')).toBe('$12.50');
  });

  it('renders an em-dash only when asked and value is empty', () => {
    expect(formatMoney(null, 'AED', { dashWhenEmpty: true })).toBe('—');
    // Intl separates the AED symbol with a non-breaking space; compare on normalised spaces.
    expect(formatMoney(null, 'AED').replace(/[\s\u00a0\u202f]/g, ' ')).toBe('AED 0');
    expect(formatMoney(null, 'USD')).toBe('$0.00');
  });
});

describe('CurrencyService', () => {
  const realFetchRef = realFetch;
  afterEach(() => {
    (global as { fetch: unknown }).fetch = realFetchRef;
    jest.restoreAllMocks();
  });

  it('normalises the exchangerate.fun payload and caches it', async () => {
    const fn = scriptFetch([{ json: { timestamp: 1790438400, base: 'AED', rates: FUNCTABLE } }]);
    const service = makeService();

    const table = await service.getRates();
    expect(table.base).toBe('AED');
    expect(table.rates.INR).toBe(26.1);
    expect(table.stale).toBe(false);
    expect(table.source).toBe('exchangerate.fun');
    expect(table.asOf).toBe(new Date(1790438400 * 1000).toISOString());

    await service.getRates();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('keeps serving the cache while the upstream rate date is old', async () => {
    // Upstream dates its table a day ago but only updates hourly; a fresh fetch of an old
    // table must not count as expired or we would re-download on every request.
    const yesterday = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
    const fn = scriptFetch([{ json: { timestamp: yesterday, base: 'AED', rates: FUNCTABLE } }]);
    const service = makeService();

    const table = await service.getRates();
    expect(Date.parse(table.asOf)).toBeLessThan(Date.now() - 60 * 60 * 1000);
    await service.getRates();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('refetches once the TTL has elapsed since the last fetch', async () => {
    const fn = scriptFetch([{ json: { timestamp: Math.floor(Date.now() / 1000), base: 'AED', rates: FUNCTABLE } }]);
    const service = makeService({ CURRENCY_TTL_SECONDS: '0.001' });
    await service.getRates();
    await new Promise((r) => setTimeout(r, 5));
    await service.getRates();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('normalises the jsdelivr nested lowercase payload', async () => {
    scriptFetch([
      { ok: false, status: 500 },
      { json: { date: '2026-09-26', aed: { inr: 26.06, usd: 0.272, eur: 0.239, pkr: 75.4, thb: 9.1, zar: 4.4, jpy: 42.9, aud: 0.387, cny: 1.83, gbp: 0.2057 } } },
    ]);
    const table = await makeService().getRates();
    expect(table.rates.INR).toBe(26.06);
    expect(table.rates.USD).toBe(0.272);
    expect(table.source).toContain('jsdelivr');
    expect(table.asOf).toBe('2026-09-26T00:00:00.000Z');
  });

  it('normalises the open.er-api.com payload', async () => {
    scriptFetch([
      { ok: false, status: 500 },
      { ok: false, status: 500 },
      { json: { result: 'success', base_code: 'AED', time_last_update_unix: 1790380952, rates: FUNCTABLE } },
    ]);
    const table = await makeService().getRates();
    expect(table.rates.EUR).toBe(0.2389);
    expect(table.source).toBe('open.er-api.com');
  });

  it('drops non-numeric and non-positive rates', async () => {
    scriptFetch([{ json: { base: 'AED', rates: { ...FUNCTABLE, BAD: 0, NAN: 'x', NEG: -1 } } }]);
    const table = await makeService().getRates();
    expect(table.rates.BAD).toBeUndefined();
    expect(table.rates.NAN).toBeUndefined();
    expect(table.rates.NEG).toBeUndefined();
  });

  it('falls through to the next source when the primary fails', async () => {
    const fn = scriptFetch([
      { ok: false, status: 503 },
      { json: { date: '2026-09-26', aed: { inr: 26.06, usd: 0.272, eur: 0.239, pkr: 75.4, thb: 9.1, zar: 4.4, jpy: 42.9, aud: 0.387, cny: 1.83, gbp: 0.2057 } } },
    ]);
    const table = await makeService().getRates();
    expect(table.source).toContain('jsdelivr');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('rejects a table that looks truncated', async () => {
    scriptFetch([{ json: { base: 'AED', rates: { AED: 1, INR: 26.1, USD: 0.27 } } }]);
    await expect(makeService().getRates()).rejects.toThrow(/temporarily unavailable/);
  });

  it('serves the last good table as stale when every source fails', async () => {
    scriptFetch([{ json: { base: 'AED', rates: FUNCTABLE } }]);
    const service = makeService();
    await service.getRates();

    scriptFetch([new Error('network down')]);
    const stale = await service.getRates(true);
    expect(stale.stale).toBe(true);
    expect(stale.rates.INR).toBe(26.1);
  });

  it('rejects when there is no cache and every source fails', async () => {
    scriptFetch([new Error('network down')]);
    await expect(makeService().getRates()).rejects.toThrow(/temporarily unavailable/);
  });

  it('converts across the base currency', async () => {
    scriptFetch([{ json: { base: 'AED', rates: FUNCTABLE } }]);
    const service = makeService();
    const result = await service.convert(1000, 'INR');
    expect(result.result).toBeCloseTo(26100, 4);
    expect(result.from).toBe('AED');
  });

  it('converts between two non-base currencies via a cross rate', async () => {
    scriptFetch([{ json: { base: 'AED', rates: FUNCTABLE } }]);
    const service = makeService();
    const result = await service.convert(100, 'EUR', 'INR');
    expect(result.rate).toBeCloseTo(0.2389 / 26.1, 8);
    expect(result.result).toBeCloseTo((100 / 26.1) * 0.2389, 8);
  });

  it('is a no-op when source and target match', async () => {
    const fn = scriptFetch([{ json: { base: 'AED', rates: FUNCTABLE } }]);
    const result = await makeService().convert(42, 'AED');
    expect(result.result).toBe(42);
    expect(fn).not.toHaveBeenCalled();
  });

  it('rejects an unknown target currency', async () => {
    scriptFetch([{ json: { base: 'AED', rates: FUNCTABLE } }]);
    await expect(makeService().convert(100, 'ZZZ')).rejects.toThrow(/No rate available/);
  });

  it('rebases the table onto another currency', async () => {
    scriptFetch([{ json: { base: 'AED', rates: FUNCTABLE } }]);
    const service = makeService();
    const table = await service.getRates();
    const inr = service.rebase(table, 'INR');
    expect(inr.rates.INR).toBe(1);
    expect(inr.rates.USD).toBeCloseTo(0.2723 / 26.1, 8);
  });
});
