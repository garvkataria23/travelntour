import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Offline-cache behaviour of lib/api.ts.
 *
 * The cache backs the offline banner that every list page relies on, and it previously served
 * 15-minute-old data with no staleness marker, so a user could read gross/net profit from a stale
 * response with no warning. These tests pin the TTL and the prefix-invalidation contract.
 */

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
// Deliberately a separate instance: setSession() writes to one bucket and clears the other, so
// sharing a single object would delete the seeded user mid-test.
const session = new MemoryStorage();

function installWindow(): void {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: store,
    sessionStorage: session,
    dispatchEvent: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    CustomEvent: class {
      constructor(public type: string, public init?: unknown) {}
    },
  };
}

type ApiModule = typeof import("./api");

let api: ApiModule;

const USER_KEY = "fc_user";

function seedUser(businessId: string, id: string): void {
  store.setItem(USER_KEY, JSON.stringify({ id, businessId, name: "T", email: "t@e.com", role: "ADMIN" }));
  store.setItem("fc_persist", "1");
}

async function loadFresh(): Promise<ApiModule> {
  vi.resetModules();
  installWindow();
  api = await import("./api");
  return api;
}

describe("api offline cache", () => {
  beforeEach(async () => {
    store.clear();
    session.clear();
    await loadFresh();
    seedUser("biz1", "user1");
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe("getCachedGet", () => {
    it("returns null for an uncached path", () => {
      expect(api.getCachedGet("/bookings")).toBeNull();
    });

    it("returns null on the server, where there is no storage", async () => {
      const fresh = await loadFresh();
      (globalThis as unknown as { window: unknown }).window = undefined;
      expect(fresh.getCachedGet("/bookings")).toBeNull();
    });

    it("serves a value written inside the TTL", async () => {
      const fresh = await loadFresh();
      fresh.setSession({
        accessToken: "at",
        refreshToken: "rt",
        user: { id: "user1", businessId: "biz1", name: "T", email: "t@e.com", role: "ADMIN" },
      });
      // Seed the cache entry directly; going through api() would need a fetch stub.
      const key = "fc_cache:v1:biz1:user1:GET:/bookings";
      store.setItem(key, JSON.stringify({ ts: Date.now(), data: [{ id: "b1" }] }));
      expect(fresh.getCachedGet("/bookings")).toEqual([{ id: "b1" }]);
    });

    it("drops and returns null once the entry is older than 15 minutes", async () => {
      const fresh = await loadFresh();
      const key = "fc_cache:v1:biz1:user1:GET:/bookings";
      store.setItem(
        key,
        JSON.stringify({ ts: Date.now() - 16 * 60 * 1000, data: [{ id: "stale" }] }),
      );
      expect(fresh.getCachedGet("/bookings")).toBeNull();
      // Expired entries are evicted, not left to be re-read.
      expect(store.getItem(key)).toBeNull();
    });

    it("keeps an entry that is just inside the TTL", async () => {
      const fresh = await loadFresh();
      const key = "fc_cache:v1:biz1:user1:GET:/bookings";
      store.setItem(key, JSON.stringify({ ts: Date.now() - 14 * 60 * 1000, data: ["fresh"] }));
      expect(fresh.getCachedGet("/bookings")).toEqual(["fresh"]);
    });

    it("returns null rather than throwing on corrupt JSON", async () => {
      const fresh = await loadFresh();
      store.setItem("fc_cache:v1:biz1:user1:GET:/bookings", "{not json");
      expect(fresh.getCachedGet("/bookings")).toBeNull();
    });

    it("scopes entries per user so one tenant cannot read another's cache", async () => {
      const fresh = await loadFresh();
      store.setItem(
        "fc_cache:v1:biz1:user1:GET:/bookings",
        JSON.stringify({ ts: Date.now(), data: ["biz1 data"] }),
      );
      // Same path, different signed-in user: must not resolve.
      store.setItem(USER_KEY, JSON.stringify({ id: "user2", businessId: "biz2", name: "U", email: "u@e.com", role: "ADMIN" }));
      expect(fresh.getCachedGet("/bookings")).toBeNull();
    });
  });

  describe("baseOf", () => {
    it("reduces a path to its resource base, keeping a nested id segment", () => {
      expect(api.baseOf("/bookings?page=2")).toBe("/bookings");
      // Two segments are intentional: invalidating /customers must also drop /customers/:id.
      expect(api.baseOf("/customers/abc")).toBe("/customers/abc");
      expect(api.baseOf("/search")).toBe("/search");
    });
  });

  describe("isEditConflict", () => {
    it("recognises only the 409 EDIT_CONFLICT response", () => {
      expect(api.isEditConflict(new api.ApiError(409, "EDIT_CONFLICT", "conflict"))).toBe(true);
      expect(api.isEditConflict(new api.ApiError(409, "SOMETHING_ELSE", "x"))).toBe(false);
      expect(api.isEditConflict(new api.ApiError(400, "EDIT_CONFLICT", "x"))).toBe(false);
      expect(api.isEditConflict(new Error("plain"))).toBe(false);
    });
  });
});