"use client";

import { api, ApiError } from "@/lib/api";

/**
 * Platform-owner tenant administration.
 *
 * SECURITY HISTORY — read before changing anything here.
 *
 * This module used to be the single source of truth for tenant blocking, WhatsApp ceilings,
 * account CRUD and the master-admin roster, all persisted in localStorage under
 * "fc_master_admin_accounts_v1". That was not an access control:
 *
 *   - Blocking a tenant only locked the browser that did it. Every other session, and the API
 *     itself, carried on serving the tenant normally.
 *   - Any user could open DevTools and run `localStorage.removeItem("fc_master_admin_accounts_v1")`
 *     to clear their own block, or edit the stored role to reach /admin.
 *   - A tenant-level ADMIN (not just the platform owner) was shown the quota "upgrade" controls,
 *     so any tenant admin could grant themselves unlimited WhatsApp quota.
 *   - Five fabricated tenants with realistic-looking names, emails and phone numbers were seeded
 *     into every visitor's browser on first read.
 *
 * All of it now lives server-side behind SUPER_ADMIN (see backend/src/platform). This module is a
 * thin API client plus a read-through cache so that synchronous UI code keeps working; the cache
 * is a cache only and is never the thing that enforces a decision.
 *
 * The blocking check a tenant's own browser performs (`isAccountBlocked`) is therefore cosmetic and
 * is only used to render a notice. Real enforcement is Business.status, which
 * AuthService.issueSession checks before minting a session and PlatformService revokes existing
 * refresh tokens when a tenant is blocked.
 */

export const MASTER_ADMIN_ID = "TRAVELNTOUR";

/** Ceiling applied when a tenant has no explicit limit set. Mirrors PlatformService. */
export const DEFAULT_WHATSAPP_LIMIT = 1000;

export interface AdminAccount {
  id: string;
  name: string;
  /** Null until the tenant has an admin user provisioned. */
  ownerName: string | null;
  email: string | null;
  phone: string | null;
  plan: string;
  status: "ACTIVE" | "BLOCKED" | "SUSPENDED" | "INACTIVE" | "PENDING";
  blockReason?: string | null;
  blockedAt?: string | null;
  whatsappLimit: number;
  whatsappLimitIsDefault?: boolean;
  whatsappUsed: number;
  createdAt: string;
  lastActiveAt: string;
  totalBookings?: number;
  timezone?: string;
  currency?: string;
  notes?: string | null;
  /**
   * Branch labels come from the browser-local CRM in lib/travel-crm.ts, not from the API. Kept on
   * the type because the admin table renders it, but it is display-only.
   */
  branchName?: string;
}

// ── Read-through cache ────────────────────────────────────────────────────────
// Held in a module variable rather than localStorage: it must never survive a logout, and it must
// never be the source of truth for an authorization decision.

let cache: AdminAccount[] | null = null;
const listeners = new Set<(accounts: AdminAccount[]) => void>();

function emit(): void {
  for (const listener of listeners) listener(cache ?? []);
}

export function subscribeToAdminAccounts(listener: (accounts: AdminAccount[]) => void): () => void {
  listeners.add(listener);
  listener(cache ?? []);
  return () => {
    listeners.delete(listener);
  };
}

function assertSuperAdmin(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem("fc_user");
    const user = raw ? (JSON.parse(raw) as { role?: string }) : null;
    if (user?.role !== "SUPER_ADMIN") {
      throw new ApiError(403, "SUPER_ADMIN_REQUIRED", "This action requires the master admin role");
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(403, "SUPER_ADMIN_REQUIRED", "This action requires the master admin role");
  }
}

/** Last known roster, without a network call. Empty until `fetchAdminAccounts` resolves. */
export function getAdminAccounts(): AdminAccount[] {
  return cache ?? [];
}

/** Drops the cache. Call on logout so one super admin cannot see another's roster. */
export function invalidateAdminAccounts(): void {
  cache = null;
  emit();
}

/** Fetches the tenant roster from the API and refreshes the cache. */
export async function fetchAdminAccounts(opts: { search?: string; status?: string } = {}): Promise<AdminAccount[]> {
  assertSuperAdmin();
  const params = new URLSearchParams();
  if (opts.search?.trim()) params.set("search", opts.search.trim());
  if (opts.status && opts.status !== "ALL") params.set("status", opts.status);

  const result = await api<{ items: AdminAccount[] }>(`/platform/tenants?${params.toString()}`, {
    skipCache: true,
  });
  cache = result.items ?? [];
  emit();
  return cache;
}

/**
 * 1-Click Block / Unblock / Suspend Toggle. Server-enforced.
 */
export async function toggleAccountStatus(
  accountId: string,
  newStatus: "ACTIVE" | "BLOCKED" | "SUSPENDED",
  reason = "",
  adminName = "Master Admin"
): Promise<AdminAccount> {
  assertSuperAdmin();
  const blocked = newStatus !== "ACTIVE";

  await api<{ id: string; status: string }>(`/platform/tenants/${accountId}/status`, {
    method: "PATCH",
    body: { blocked, ...(reason ? { reason } : {}) },
  });

  const accounts = await fetchAdminAccounts();

  // Broadcast so an open AppShell can react immediately. The server response remains the
  // authority; this only saves a poll.
  if (typeof window !== "undefined") {
    const account = accounts.find((a) => a.id === accountId) ?? null;
    window.dispatchEvent(
      new CustomEvent("fc:account-status-changed", {
        detail: { accountId, status: newStatus, reason: account?.blockReason ?? reason, account },
      }),
    );
  }
  void adminName;
  return accounts.find((a) => a.id === accountId) as AdminAccount;
}

/**
 * Checks whether a tenant is blocked.
 *
 * This is a UI convenience only — it reflects what the API last reported. It cannot and does not
 * grant access: an unblocked local cache has no effect on what the API will accept.
 */
export function isAccountBlocked(businessId?: string | null): {
  isBlocked: boolean;
  isSuspended: boolean;
  reason?: string;
  account?: AdminAccount;
} {
  if (!businessId) {
    return { isBlocked: false, isSuspended: false };
  }
  const found = cache?.find((a) => a.id === businessId);
  if (!found) {
    return { isBlocked: false, isSuspended: false };
  }
  return {
    isBlocked: found.status === "BLOCKED",
    isSuspended: found.status === "SUSPENDED",
    reason: found.blockReason ?? undefined,
    account: found,
  };
}

/** Master Admin: set a tenant's monthly WhatsApp message ceiling. Server-enforced. */
export async function updateAccountWhatsAppLimit(
  accountId: string,
  newLimit: number
): Promise<AdminAccount> {
  assertSuperAdmin();
  await api<{ id: string; whatsappMonthlyLimit: number }>(`/platform/tenants/${accountId}/whatsapp-limit`, {
    method: "PATCH",
    body: { limit: Math.max(0, Math.round(newLimit)) },
  });
  const accounts = await fetchAdminAccounts();
  return accounts.find((a) => a.id === accountId) as AdminAccount;
}

/** Master Admin: edit a tenant's profile. Server-enforced. */
export async function updateAdminAccount(
  accountId: string,
  updates: Partial<Pick<AdminAccount, "name" | "ownerName" | "email" | "phone" | "notes" | "plan">>
): Promise<AdminAccount> {
  assertSuperAdmin();
  await api(`/platform/tenants/${accountId}`, { method: "PATCH", body: updates });
  const accounts = await fetchAdminAccounts();
  return accounts.find((a) => a.id === accountId) as AdminAccount;
}

export interface CreatedTenant {
  id: string;
  name: string;
  admin: { id: string; email: string; role: string } | null;
  /** Shown once, only when the password was generated server-side. Never recoverable. */
  initialPassword?: string;
}

/** Provision a new tenant together with its first admin user. */
export async function addNewAccount(data: {
  name: string;
  ownerName: string;
  email: string;
  phone?: string;
  whatsappMonthlyLimit?: number;
}): Promise<CreatedTenant> {
  assertSuperAdmin();
  const created = await api<CreatedTenant>("/platform/tenants", { method: "POST", body: data });
  await fetchAdminAccounts();
  return created;
}

/**
 * Deactivate a tenant.
 *
 * Soft, not destructive: the tenant is blocked and its sessions revoked, but bookings, invoices
 * and audit records are preserved. A hard delete would cascade away the financial history.
 */
export async function deleteAccount(accountId: string): Promise<void> {
  assertSuperAdmin();
  await api(`/platform/tenants/${accountId}/deactivate`, { method: "POST" });
  invalidateAdminAccounts();
}