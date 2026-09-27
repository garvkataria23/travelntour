import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatMoney, minorUnitDigits } from './decimals';

export interface RateTable {
  base: string;
  rates: Record<string, number>;
  /** Timestamp the upstream rates are dated at - shown in the UI. */
  asOf: string;
  /** Timestamp we last fetched - the cache TTL is measured from here, not from asOf. */
  fetchedAt: string;
  source: string;
  stale: boolean;
}

export interface CurrencyMeta {
  code: string;
  name: string;
  fiat: boolean;
  digits: 0 | 2 | 3;
}

const REQUEST_TIMEOUT_MS = 8000;
const MIN_NAME_TTL_MS = 12 * 60 * 60 * 1000; // currency names change rarely; refresh once a day
const NAME_SOURCE = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies.json';

interface NormalisedRates {
  rates: Record<string, number>;
  asOf: string;
}

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);
  private readonly base: string;
  private readonly ttlMs: number;
  private readonly primaryUrl: string;

  private table: RateTable | null = null;
  private inflight: Promise<RateTable> | null = null;

  private names: { at: number; map: Record<string, string> } | null = null;
  private inflightNames: Promise<Record<string, string>> | null = null;
  private fiatCodes: Set<string> | null = null;

  constructor(config: ConfigService) {
    this.base = (config.get<string>('CURRENCY_BASE') || 'AED').toUpperCase();
    const ttl = Number(config.get<string>('CURRENCY_TTL_SECONDS'));
    this.ttlMs = Number.isFinite(ttl) && ttl > 0 ? ttl * 1000 : 55 * 60 * 1000;
    this.primaryUrl = config.get<string>('CURRENCY_PRIMARY_URL') || 'https://api.exchangerate.fun/latest?base=';
  }

  getBase(): string {
    return this.base;
  }

  /**
   * Returns the AED-based rate table. Refreshes on read once the cache is older than the TTL;
   * concurrent callers share a single in-flight request.
   *
   * The TTL is measured from `fetchedAt`, never from the upstream `asOf`: free sources date
   * their table once a day or hour, so keying freshness off `asOf` would re-download the
   * whole table on every single request. If every source fails the last known good table is
   * returned flagged as `stale` so the UI can say so.
   */
  async getRates(force = false): Promise<RateTable> {
    if (!force && this.table && !this.table.stale && Date.now() - Date.parse(this.table.fetchedAt) < this.ttlMs) {
      return this.table;
    }
    if (this.inflight) return this.inflight;

    this.inflight = this.refresh()
      .catch((err) => {
        if (this.table) {
          this.logger.warn(`All rate sources failed, serving stale table from ${this.table.source}: ${err?.message ?? err}`);
          return { ...this.table, stale: true };
        }
        throw new ServiceUnavailableException({
          message: 'Exchange rates are temporarily unavailable. Please retry shortly.',
          code: 'RATES_UNAVAILABLE',
        });
      })
      .finally(() => {
        this.inflight = null;
      });

    return this.inflight;
  }

  private async refresh(): Promise<RateTable> {
    const base = this.base;
    const sources: Array<{ name: string; url: string; parse: (json: unknown) => NormalisedRates }> = [
      {
        name: 'exchangerate.fun',
        url: `${this.primaryUrl}${encodeURIComponent(base)}`,
        parse: parseFun,
      },
      {
        name: 'currency-api (jsdelivr)',
        url: `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${base.toLowerCase()}.json`,
        parse: (json) => parseFawaz(json as Record<string, unknown>, base),
      },
      {
        name: 'open.er-api.com',
        url: `https://open.er-api.com/v6/latest/${base}`,
        parse: parseErApi,
      },
    ];

    const errors: string[] = [];
    for (const source of sources) {
      try {
        const json = await fetchJson(source.url);
        const { rates, asOf } = source.parse(json);
        if (Object.keys(rates).length < 10) throw new Error(`only ${Object.keys(rates).length} rates returned`);
        this.table = {
          base,
          rates: { [base]: 1, ...rates },
          asOf,
          fetchedAt: new Date().toISOString(),
          source: source.name,
          stale: false,
        };
        this.logger.log(`Refreshed ${Object.keys(rates).length} rates from ${source.name} (as of ${asOf})`);
        return this.table;
      } catch (err) {
        errors.push(`${source.name}: ${(err as Error).message}`);
        this.logger.warn(`Rate source ${source.name} failed - ${(err as Error).message}`);
      }
    }

    throw new Error(`all sources failed - ${errors.join(' | ')}`);
  }

  /**
   * Re-expresses a cached table under a different base currency, e.g. the AED table
   * turned into an INR table by dividing every rate by the AED→INR rate.
   */
  rebase(table: RateTable, to: string): RateTable {
    const divisor = to === table.base ? 1 : table.rates[to];
    if (!divisor) {
      throw new ServiceUnavailableException({
        message: `No rate available to rebase onto ${to}`,
        code: 'RATE_NOT_FOUND',
      });
    }
    const rates: Record<string, number> = { [to]: 1 };
    for (const [code, value] of Object.entries(table.rates)) {
      if (code !== to) rates[code] = value / divisor;
    }
    return { ...table, rates };
  }

  /** Cross-rate conversion through the base currency. */  async convert(amount: number, to: string, from?: string): Promise<{ amount: number; from: string; to: string; rate: number; result: number }> {
    const fromCode = (from || this.base).toUpperCase();
    const toCode = to.toUpperCase();
    const value = Number(amount);
    if (!Number.isFinite(value)) {
      throw new ServiceUnavailableException({ message: 'Invalid amount', code: 'INVALID_AMOUNT' });
    }
    if (fromCode === toCode) {
      return { amount: value, from: fromCode, to: toCode, rate: 1, result: value };
    }

    const table = await this.getRates();
    const fromRate = fromCode === table.base ? 1 : table.rates[fromCode];
    const toRate = toCode === table.base ? 1 : table.rates[toCode];
    if (!fromRate || !toRate) {
      throw new ServiceUnavailableException({
        message: `No rate available for ${fromCode} → ${toCode}`,
        code: 'RATE_NOT_FOUND',
      });
    }

    const rate = toRate / fromRate;
    return { amount: value, from: fromCode, to: toCode, rate, result: value * rate };
  }

  /** Supported currencies with display metadata, ordered fiat-first then alphabetically. */
  async list(): Promise<{ base: string; currencies: CurrencyMeta[] }> {
    const table = await this.getRates();
    const names = await this.getNames();
    if (!this.fiatCodes) {
      const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
      this.fiatCodes = new Set(typeof supported === 'function' ? supported('currency') : []);
    }

    const currencies = Object.keys(table.rates)
      .map((code) => ({
        code,
        name: names[code.toLowerCase()] || code,
        fiat: this.fiatCodes!.has(code),
        digits: minorUnitDigits(code),
      }))
      .sort((a, b) => Number(b.fiat) - Number(a.fiat) || a.code.localeCompare(b.code));

    return { base: table.base, currencies };
  }

  format(value: number | null | undefined, currency: string, digits?: number): string {
    return formatMoney(value, currency, digits === undefined ? undefined : { digits });
  }

  private async getNames(): Promise<Record<string, string>> {
    if (this.names && Date.now() - this.names.at < MIN_NAME_TTL_MS) return this.names.map;
    if (this.inflightNames) return this.inflightNames;
    this.inflightNames = fetchJson(NAME_SOURCE)
      .then((json) => {
        const map = json as Record<string, string>;
        this.names = { at: Date.now(), map };
        return map;
      })
      .catch((err) => {
        this.logger.warn(`Currency name lookup failed, falling back to codes: ${(err as Error).message}`);
        return this.names?.map ?? {};
      })
      .finally(() => {
        this.inflightNames = null;
      });
    return this.inflightNames;
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** https://api.exchangerate.fun/latest?base=AED → { timestamp, base, rates: { INR: 26.09 } } */
function parseFun(json: unknown): NormalisedRates {
  const body = json as { timestamp?: number; rates?: Record<string, number> };
  if (!body?.rates) throw new Error('missing rates field');
  return {
    rates: normaliseRates(body.rates),
    asOf: body.timestamp ? new Date(body.timestamp * 1000).toISOString() : new Date().toISOString(),
  };
}

/** https://open.er-api.com/v6/latest/AED → { base_code, time_last_update_unix, rates: { INR: 26.09 } } */
function parseErApi(json: unknown): NormalisedRates {
  const body = json as { result?: string; rates?: Record<string, number>; time_last_update_unix?: number };
  if (body?.result && body.result !== 'success') throw new Error(`result=${body.result}`);
  if (!body?.rates) throw new Error('missing rates field');
  return {
    rates: normaliseRates(body.rates),
    asOf: body.time_last_update_unix
      ? new Date(body.time_last_update_unix * 1000).toISOString()
      : new Date().toISOString(),
  };
}

/** jsdelivr currency-api → { date: "2026-09-26", aed: { inr: 26.06, usd: 0.272 } } (lowercase, nested) */
function parseFawaz(json: Record<string, unknown>, base: string): NormalisedRates {
  const nested = json?.[base.toLowerCase()];
  if (!nested || typeof nested !== 'object') throw new Error(`missing "${base.toLowerCase()}" block`);
  return {
    rates: normaliseRates(nested as Record<string, number>),
    asOf: typeof json.date === 'string' ? `${json.date}T00:00:00.000Z` : new Date().toISOString(),
  };
}

function normaliseRates(input: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(input)) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) out[key.toUpperCase()] = num;
  }
  return out;
}
