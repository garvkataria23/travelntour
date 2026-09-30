"use client";

import { upgradeWhatsAppLimit } from "./whatsapp-quota";

export const MASTER_ADMIN_ID = "TRAVELNTOUR";
export const MASTER_ADMIN_PASS = "GARV2331##";

export function isMasterAdminCredentials(id: string, pass: string): boolean {
  return id.trim().toUpperCase() === MASTER_ADMIN_ID && pass === MASTER_ADMIN_PASS;
}

export interface AdminAccount {
  id: string;
  name: string;
  ownerName: string;
  email: string;
  phone: string;
  plan: "ENTERPRISE" | "PROFESSIONAL" | "STARTER";
  status: "ACTIVE" | "BLOCKED" | "SUSPENDED";
  blockReason?: string;
  blockedAt?: string;
  blockedBy?: string;
  whatsappLimit: number;
  whatsappUsed: number;
  createdAt: string;
  lastActiveAt: string;
  branchId?: string;
  branchName?: string;
  currency?: string;
  totalBookings?: number;
  notes?: string;
}

const STORAGE_KEY = "fc_master_admin_accounts_v1";

export const INITIAL_ACCOUNTS: AdminAccount[] = [
  {
    id: "biz_blueaura",
    name: "Blue Aura Tours & Travels",
    ownerName: "Garv Kataria",
    email: "admin@blueauratravel.com",
    phone: "+971 50 123 4567",
    plan: "ENTERPRISE",
    status: "ACTIVE",
    whatsappLimit: 1000,
    whatsappUsed: 142,
    createdAt: "2026-01-15T08:00:00Z",
    lastActiveAt: new Date().toISOString(),
    totalBookings: 1240,
    notes: "Primary flagship tenant for corporate & luxury B2B operations.",
  },
  {
    id: "biz_demo",
    name: "TravelHub Express (Standard Demo)",
    ownerName: "Demo Agent",
    email: "demo@flyconnect.app",
    phone: "+91 98765 43210",
    plan: "PROFESSIONAL",
    status: "ACTIVE",
    whatsappLimit: 1000,
    whatsappUsed: 620,
    createdAt: "2026-03-01T10:00:00Z",
    lastActiveAt: new Date().toISOString(),
    totalBookings: 310,
    notes: "Default test environment for staff and trial evaluations.",
  },
  {
    id: "biz_skyhigh",
    name: "SkyHigh Luxury Holidays",
    ownerName: "Rahul Mehra",
    email: "rahul@skyhighholidays.com",
    phone: "+91 98234 56789",
    plan: "ENTERPRISE",
    status: "ACTIVE",
    whatsappLimit: 2500,
    whatsappUsed: 1890,
    createdAt: "2026-04-12T11:20:00Z",
    lastActiveAt: new Date(Date.now() - 3600000).toISOString(),
    totalBookings: 890,
    notes: "High volume luxury holiday operator across Dubai, Bali & Europe.",
  },
  {
    id: "biz_apex",
    name: "Apex Corporate Travel Partners",
    ownerName: "Priya Sharma",
    email: "ops@apextravel.in",
    phone: "+91 98111 22334",
    plan: "ENTERPRISE",
    status: "ACTIVE",
    whatsappLimit: 5000,
    whatsappUsed: 3200,
    createdAt: "2026-05-19T09:15:00Z",
    lastActiveAt: new Date(Date.now() - 7200000).toISOString(),
    totalBookings: 1650,
    notes: "Corporate accounts manager for 18 MNC clients in India & UAE.",
  },
  {
    id: "biz_wanderlust",
    name: "Wanderlust Expeditions",
    ownerName: "Aman Verma",
    email: "aman@wanderlust.co",
    phone: "+91 97777 88899",
    plan: "STARTER",
    status: "BLOCKED",
    blockReason: "Repeated non-payment & sending unauthorized unsolicited WhatsApp messages",
    blockedAt: "2026-09-28T14:30:00Z",
    blockedBy: "Garv Kataria (Master Admin)",
    whatsappLimit: 500,
    whatsappUsed: 500,
    createdAt: "2026-07-01T15:00:00Z",
    lastActiveAt: "2026-09-28T14:28:00Z",
    totalBookings: 45,
    notes: "Blocked due to policy violations and overdue invoice #INV-2026-099.",
  },
];

export function getAdminAccounts(): AdminAccount[] {
  if (typeof window === "undefined") return INITIAL_ACCOUNTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_ACCOUNTS));
      return INITIAL_ACCOUNTS;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return INITIAL_ACCOUNTS;
    }
    return parsed;
  } catch {
    return INITIAL_ACCOUNTS;
  }
}

export function saveAdminAccounts(accounts: AdminAccount[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
    window.dispatchEvent(new CustomEvent("fc:admin-accounts-updated", { detail: accounts }));
  } catch (err) {
    console.error("Failed to save admin accounts:", err);
  }
}

/**
 * 1-Click Block / Unblock / Suspend Toggle
 */
export function toggleAccountStatus(
  accountId: string,
  newStatus: "ACTIVE" | "BLOCKED" | "SUSPENDED",
  reason = "",
  adminName = "Garv Kataria (Master Admin)"
): AdminAccount {
  const accounts = getAdminAccounts();
  const index = accounts.findIndex((a) => a.id === accountId);
  if (index === -1) {
    throw new Error(`Account with ID "${accountId}" not found.`);
  }

  const existing = accounts[index];
  const updated: AdminAccount = {
    ...existing,
    status: newStatus,
    blockReason: newStatus !== "ACTIVE" ? (reason || "Account access restricted by Master Admin") : undefined,
    blockedAt: newStatus !== "ACTIVE" ? new Date().toISOString() : undefined,
    blockedBy: newStatus !== "ACTIVE" ? adminName : undefined,
  };

  accounts[index] = updated;
  saveAdminAccounts(accounts);

  // Dispatch real-time event for immediate lockout in AppShell
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("fc:account-status-changed", {
        detail: {
          accountId,
          status: newStatus,
          reason: updated.blockReason,
          account: updated,
        },
      })
    );
  }

  return updated;
}

/**
 * Checks if a specific businessId is blocked
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
  const accounts = getAdminAccounts();
  const found = accounts.find((a) => a.id === businessId || a.id.toLowerCase() === businessId.toLowerCase());
  if (!found) {
    return { isBlocked: false, isSuspended: false };
  }
  return {
    isBlocked: found.status === "BLOCKED",
    isSuspended: found.status === "SUSPENDED",
    reason: found.blockReason,
    account: found,
  };
}

/**
 * Master Admin: Set WhatsApp limit for a specific account
 */
export function updateAccountWhatsAppLimit(
  accountId: string,
  newLimit: number,
  adminName = "Garv Kataria (Master Admin)"
): AdminAccount {
  const accounts = getAdminAccounts();
  const index = accounts.findIndex((a) => a.id === accountId);
  if (index === -1) {
    throw new Error(`Account "${accountId}" not found.`);
  }

  const safeLimit = Math.max(10, Math.round(newLimit));
  const updated: AdminAccount = {
    ...accounts[index],
    whatsappLimit: safeLimit,
  };

  accounts[index] = updated;
  saveAdminAccounts(accounts);

  // If this account is the active demo or current business, also sync the global whatsapp quota
  if (typeof window !== "undefined") {
    const currentBiz = window.localStorage.getItem("fc_business_id") || "biz_demo";
    if (accountId === currentBiz || accountId === "biz_demo") {
      upgradeWhatsAppLimit(safeLimit, adminName, `Limit adjusted in Admin Panel for ${updated.name}`);
    }
  }

  return updated;
}

/**
 * Master Admin: Edit and customize any account's details (Name, Owner, Phone, Email, Branch, Plan, Notes)
 */
export function updateAdminAccount(
  accountId: string,
  updates: Partial<AdminAccount>
): AdminAccount {
  const accounts = getAdminAccounts();
  const index = accounts.findIndex((a) => a.id === accountId);
  if (index === -1) {
    throw new Error(`Account "${accountId}" not found.`);
  }

  const updated: AdminAccount = {
    ...accounts[index],
    ...updates,
    id: accounts[index].id, // preserve ID
  };

  accounts[index] = updated;
  saveAdminAccounts(accounts);
  return updated;
}

/**
 * Add a new agency / partner account
 */
export function addNewAccount(
  data: Omit<AdminAccount, "id" | "createdAt" | "lastActiveAt" | "totalBookings" | "whatsappUsed">
): AdminAccount {
  const accounts = getAdminAccounts();
  const newId = `biz_${Date.now().toString(36)}`;
  const created: AdminAccount = {
    ...data,
    id: newId,
    whatsappUsed: 0,
    totalBookings: 0,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };

  accounts.unshift(created);
  saveAdminAccounts(accounts);
  return created;
}

/**
 * Delete an account
 */
export function deleteAccount(accountId: string): void {
  const accounts = getAdminAccounts();
  const filtered = accounts.filter((a) => a.id !== accountId);
  saveAdminAccounts(filtered);
}
