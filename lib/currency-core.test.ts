import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * currency-core keeps its display currency and rate table in module-level variables, so each test
 * needs a freshly evaluated module. That is done with vi.resetModules() + dynamic import rather
 * than a test-only reset export, so the tests exercise the same code path production uses.
 */

// Minimal in-memory Storage shim: currency-core reads localStorage at module scope, so the global
// has to exist before the module is imported.
class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return Array.from(this.map.keys())[i] ?? null;
  }
  getItem(k: string) {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

const store = new MemoryStorage();

function installWindow(): void {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: store,
    dispatchEvent: () => undefined,
    addEventListener: () => undefined,
  };
}

type CurrencyModule = typeof import("./currency-core");

let cc: CurrencyModule;

async function loadFreshModule(): Promise<CurrencyModule> {
  vi.resetModules();
  installWindow();
  cc = await import("./currency-core");
  return cc;
}

const LIVE_TABLE = {
  base: "AED",
  rates: { AED: 1, USD: 0.2723, INR: 26.17, EUR: 0.2405, KWD: 0.0837 },
  asOf: "2026-10-01T00:00:00.000Z",
  fetchedAt: "2026-10-01T00:00:00.000Z",
  source: "test",
  stale: false,
};

describe("currency-core", () => {
  beforeEach(async () => {
    store.clear();
    const mod = await loadFreshModule();
    mod.setRateTable(LIVE_TABLE);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe("minorUnitDigits", () => {
    it("returns the ISO answer for ordinary currencies", () => {
      expect(cc.minorUnitDigits("USD")).toBe(2);
      expect(cc.minorUnitDigits("EUR")).toBe(2);
    });

    it("honours the whole-number business convention", () => {
      // The backend keeps its own copy of this table (currency/decimals.ts). A duplicated set in
      // money.ts once omitted INR and a unit test caught it, so both sides are pinned here.
      for (const code of [
        "AED", "SAR", "QAR", "INR", "PKR", "NPR", "BDT", "LKR", "AFN", "MMK", "KHR", "LAK",
      ]) {
        expect(cc.minorUnitDigits(code)).toBe(0);
      }
    });

    it("returns 3 for the three-decimal dinars", () => {
      for (const code of ["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]) {
        expect(cc.minorUnitDigits(code)).toBe(3);
      }
    });
  });

  describe("rateBetween", () => {
    it("returns 1 for a same-currency pair", () => {
      expect(cc.rateBetween("AED", "AED")).toBe(1);
    });

    it("is quoted against the base currency", () => {
      // rates.USD = 0.2723 means 1 AED costs 0.2723 USD.
      expect(cc.rateBetween("AED", "USD")).toBeCloseTo(0.2723, 6);
      expect(cc.rateBetween("USD", "AED")).toBeCloseTo(1 / 0.2723, 6);
    });

    it("cross-rate is consistent with going through the base", () => {
      const direct = cc.rateBetween("INR", "EUR")!;
      const viaBase = cc.rateBetween("INR", "AED")! / cc.rateBetween("EUR", "AED")!;
      expect(direct).toBeCloseTo(viaBase, 8);
    });

    it("returns null for a currency missing from the table", () => {
      expect(cc.rateBetween("AED", "ZWL")).toBeNull();
      expect(cc.hasRate("AED", "ZWL")).toBe(false);
    });
  });

  describe("formatConverted", () => {
    it("converts when a rate exists", () => {
      const out = cc.formatConverted(1000, "USD", "AED");
      expect(out).toContain("272.30");
      expect(out).not.toContain("≈");
    });

    it("renders the SOURCE currency with an approximate marker when the rate is missing", () => {
      // This is the bug the test exists for: the old code returned the unconverted number and
      // formatted it with the TARGET currency's symbol, so a 1,000 AED invoice displayed as
      // "US$ 1,000" whenever the rate table failed to load — a silent financial misstatement.
      const out = cc.formatConverted(1000, "ZWL", "AED");
      expect(out).toContain("≈");
      expect(out).toContain("AED");
      expect(out).toContain("1,000");
      expect(out).not.toContain("ZWL");
    });

    it("does not add a marker for a same-currency request", () => {
      expect(cc.formatConverted(1000, "AED", "AED")).not.toContain("≈");
    });
  });

  describe("convertAmount", () => {
    it("multiplies by the rate when available", () => {
      expect(cc.convertAmount(100, "USD", "AED")).toBeCloseTo(27.23, 6);
    });

    it("returns the input unchanged when the rate is missing", () => {
      expect(cc.convertAmount(100, "ZWL", "AED")).toBe(100);
    });

    it("returns 0 for a non-numeric input rather than NaN", () => {
      expect(cc.convertAmount(Number.NaN, "USD", "AED")).toBe(0);
    });
  });

  describe("rate table provenance", () => {
    it("marks a table fetched from the API as live", () => {
      expect(cc.ratesAreLive()).toBe(true);
      expect(cc.getRateTable()?.live).toBe(true);
    });

    it("honours an explicitly non-live table", () => {
      cc.setRateTable({ ...LIVE_TABLE, stale: true, live: false });
      expect(cc.ratesAreLive()).toBe(false);
    });

    it("never presents the built-in baseline as live", async () => {
      // A cold start with no network must not show hardcoded rates as freshly fetched market data.
      // The store is cleared first: otherwise the live table written by beforeEach is still in
      // localStorage and the module legitimately restores it.
      store.clear();
      const fresh = await loadFreshModule();
      expect(fresh.ratesAreLive()).toBe(false);
      expect(fresh.getRateTable()?.stale).toBe(true);
    });
  });

  describe("display currency", () => {
    it("applies the business default when the user has not chosen one", async () => {
      const fresh = await loadFreshModule();
      fresh.setRateTable(LIVE_TABLE);
      fresh.initDisplayCurrency("INR");
      expect(fresh.getDisplayCurrencySnapshot()).toBe("INR");
    });

    it("picks up a later business-default change", async () => {
      // Regression guard: the applied default used to be indistinguishable from a user choice, so
      // once any display currency had been applied the business default could never change again.
      const fresh = await loadFreshModule();
      fresh.setRateTable(LIVE_TABLE);
      fresh.initDisplayCurrency("INR");
      fresh.initDisplayCurrency("EUR");
      expect(fresh.getDisplayCurrencySnapshot()).toBe("EUR");
    });

    it("lets an explicit choice survive a business-default change", async () => {
      const fresh = await loadFreshModule();
      fresh.setRateTable(LIVE_TABLE);
      fresh.setDisplayCurrency("USD");
      fresh.initDisplayCurrency("EUR");
      expect(fresh.getDisplayCurrencySnapshot()).toBe("USD");
    });

    it("restores a choice made in a previous session", async () => {
      store.setItem("fc_display_currency", "USD");
      const fresh = await loadFreshModule();
      fresh.setRateTable(LIVE_TABLE);
      fresh.initDisplayCurrency("EUR");
      expect(fresh.getDisplayCurrencySnapshot()).toBe("USD");
    });
  });

  describe("formatMoney", () => {
    it("renders zero for null rather than a dash", () => {
      expect(cc.formatMoney(null, "USD")).toContain("0.00");
    });

    it("formats a whole-number currency without decimals", () => {
      expect(cc.formatMoney(12450.75, "AED")).toMatch(/12,451/);
    });
  });
});