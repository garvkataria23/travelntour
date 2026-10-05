import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The frontend permission gate.
 *
 * These tests pin the UI-side behaviour only: hiding a control is a usability feature, and the real
 * enforcement is the backend matrix. What matters here is that the UI reads the permission list the
 * API issued instead of re-deriving capability from the role — which is the mistake that let STAFF
 * see every nav item and every settings tab and only discover the 403 on save.
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
const session = new MemoryStorage();

function installWindow(): void {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: store,
    sessionStorage: session,
    dispatchEvent: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    CustomEvent: class {
      constructor(public type: string) {}
    },
  };
}

type PermsModule = typeof import("./permissions");

let perms: PermsModule;

async function loadWithUser(user: unknown): Promise<PermsModule> {
  vi.resetModules();
  store.clear();
  session.clear();
  installWindow();
  if (user) {
    store.setItem("fc_persist", "1");
    store.setItem("fc_user", JSON.stringify(user));
  }
  perms = await import("./permissions");
  return perms;
}

const STAFF_PERMISSIONS = [
  "customer:view",
  "customer:create",
  "customer:edit",
  "booking:view",
  "booking:create",
  "expense:view",
  "expense:create",
  "invoice:view",
  "report:view-operational",
  "whatsapp:view-messages",
  "settings:view",
];

describe("permissions", () => {
  afterEach(() => {
    vi.resetModules();
  });

  describe("with no session", () => {
    beforeEach(async () => {
      await loadWithUser(null);
    });

    it("grants nothing", () => {
      expect(perms.getPermissions()).toEqual([]);
      expect(perms.hasPermission("customer:view")).toBe(false);
      expect(perms.isSuperAdmin()).toBe(false);
    });

    it("hides every gated nav entry", () => {
      const groups = perms.visibleNavGroups(
        [
          {
            title: "Operations",
            items: [
              { label: "Dashboard", href: "/dashboard" },
              { label: "Bookings", href: "/bookings", permissions: ["booking:view"] },
            ],
          },
        ],
        perms.hasAnyPermission,
      );
      // Dashboard has no requirement and stays; Bookings requires a permission nobody holds.
      expect(groups[0].items.map((i) => i.href)).toEqual(["/dashboard"]);
    });
  });

  describe("STAFF", () => {
    beforeEach(async () => {
      await loadWithUser({ id: "u1", businessId: "b1", name: "S", email: "s@e.com", role: "STAFF", permissions: STAFF_PERMISSIONS });
    });

    it("grants exactly what the API granted", () => {
      expect(perms.hasPermission("customer:create")).toBe(true);
      expect(perms.hasPermission("invoice:view")).toBe(true);
      expect(perms.hasPermission("settings:view")).toBe(true);
    });

    it("withholds everything the matrix denies", () => {
      // The three gaps this replaced: expenses/income writes and customer deletion used to be
      // reachable by any authenticated user.
      expect(perms.hasPermission("expense:delete")).toBe(false);
      expect(perms.hasPermission("customer:delete")).toBe(false);
      expect(perms.hasPermission("income:edit")).toBe(false);
      // And the financial ones.
      expect(perms.hasPermission("invoice:record-payment")).toBe(false);
      expect(perms.hasPermission("report:view-financial")).toBe(false);
      expect(perms.hasPermission("settings:view-sensitive")).toBe(false);
      // And the platform ones.
      expect(perms.hasPermission("platform:tenants")).toBe(false);
      expect(perms.hasPermission("backup:view")).toBe(false);
      expect(perms.hasPermission("storage:view-usage")).toBe(false);
    });

    it("passes an AND check only when every permission is held", () => {
      expect(perms.hasEveryPermission(["customer:view", "booking:create"])).toBe(true);
      expect(perms.hasEveryPermission(["customer:view", "customer:delete"])).toBe(false);
    });

    it("passes an OR check when any is held", () => {
      expect(perms.hasAnyPermission(["customer:delete", "customer:view"])).toBe(true);
      expect(perms.hasAnyPermission(["customer:delete", "booking:delete"])).toBe(false);
    });

    it("drops nav entries for capabilities it lacks", () => {
      const nav = [
        { label: "Customers", href: "/customers", permissions: ["customer:view"] },
        { label: "Automation", href: "/automation", permissions: ["automation:view"] },
        { label: "Settings", href: "/settings", permissions: ["settings:manage"] },
      ] as never;
      const visible = perms.visibleNavGroups([{ title: "T", items: nav }], perms.hasAnyPermission);
      expect(visible[0].items.map((i: { href: string }) => i.href)).toEqual(["/customers"]);
    });

    it("drops a whole group when every item is filtered out", () => {
      const groups = perms.visibleNavGroups(
        [
          { title: "Financials", items: [{ label: "Invoices", href: "/invoices", permissions: ["invoice:edit-items"] }] },
          { title: "Operations", items: [{ label: "Customers", href: "/customers", permissions: ["customer:view"] }] },
        ],
        perms.hasAnyPermission,
      );
      expect(groups.map((g) => g.title)).toEqual(["Operations"]);
    });
  });

  describe("SUPER_ADMIN", () => {
    beforeEach(async () => {
      await loadWithUser({ id: "u0", businessId: "b0", name: "Owner", email: "o@e.com", role: "SUPER_ADMIN" });
    });

    it("passes every check even with no permission list", () => {
      // The API always sends the full list, but a stale/absent one must not lock the owner out of
      // their own console.
      expect(perms.getPermissions()).toEqual([]);
      expect(perms.hasPermission("backup:restore")).toBe(true);
      expect(perms.hasPermission("platform:tenants")).toBe(true);
      expect(perms.hasEveryPermission(["backup:view", "backup:delete"])).toBe(true);
      expect(perms.hasAnyPermission(["platform:tenants"])).toBe(true);
      expect(perms.isSuperAdmin()).toBe(true);
    });
  });

  describe("malformed input", () => {
    it("ignores a non-array permission field rather than trusting it", async () => {
      await loadWithUser({ id: "u1", businessId: "b1", name: "X", email: "x@e.com", role: "STAFF", permissions: "customer:delete" });
      expect(perms.getPermissions()).toEqual([]);
      expect(perms.hasPermission("customer:delete")).toBe(false);
    });

    it("ignores non-string entries", async () => {
      await loadWithUser({
        id: "u1",
        businessId: "b1",
        name: "X",
        email: "x@e.com",
        role: "STAFF",
        permissions: ["customer:view", 42, null, "invoice:delete"],
      });
      expect(perms.getPermissions()).toEqual(["customer:view", "invoice:delete"]);
    });
  });
});