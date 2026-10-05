"use client";

import { AdminAccount, toggleAccountStatus } from "./admin-accounts";
import {
  StaffMember,
  removeStaffFromActiveRegistry,
  restoreStaffToActiveRegistry,
} from "./staff-management";
import { Branch, Company, deleteBranch, deleteCompany, saveBranch, saveCompany } from "./travel-crm";

export type RecycleBinItemType = "ACCOUNT" | "COMPANY" | "BRANCH" | "STAFF";

export interface RecycleBinItem<T = any> {
  id: string;
  originalId: string;
  itemType: RecycleBinItemType;
  name: string;
  summary: string;
  itemData: T;
  deletedAt: string;
  purgeAt: string;
  deletedBy: string;
  reason?: string;
}

const RECYCLE_BIN_STORAGE_KEY = "fc_master_admin_recycle_bin_v1";
const RETENTION_DAYS = 30;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Calculates days remaining out of 30 days before purge
 */
export function getDaysRemaining(purgeAt: string): number {
  const diff = new Date(purgeAt).getTime() - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

/**
 * Get all recycle bin items, auto-purging items older than 30 days
 */
export function getRecycleBinItems(): RecycleBinItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECYCLE_BIN_STORAGE_KEY);
    if (!raw) return [];
    const list: RecycleBinItem[] = JSON.parse(raw);
    if (!Array.isArray(list)) return [];

    const now = Date.now();
    // Auto purge expired items (> 30 days)
    const valid = list.filter((item) => {
      const purgeTime = new Date(item.purgeAt).getTime();
      return purgeTime > now;
    });

    if (valid.length !== list.length) {
      window.localStorage.setItem(RECYCLE_BIN_STORAGE_KEY, JSON.stringify(valid));
    }

    return valid.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
  } catch (err) {
    console.error("Failed to read recycle bin:", err);
    return [];
  }
}

/**
 * Save recycle bin items to localStorage and trigger custom event
 */
function saveRecycleBinItems(items: RecycleBinItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECYCLE_BIN_STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("fc:recycle-bin-updated", { detail: items }));
  } catch (err) {
    console.error("Failed to save recycle bin:", err);
  }
}

/**
 * Move an entity (Agency Account, Corporate Company, Regional Branch, or Staff Member) to Recycle Bin for 30 days
 */
export function moveToRecycleBin<T>(
  itemType: RecycleBinItemType,
  originalId: string,
  name: string,
  summary: string,
  itemData: T,
  deletedBy = "Garv Kataria (Super Admin)",
  reason = "Moved to Recycle Bin"
): RecycleBinItem<T> {
  const items = getRecycleBinItems();
  const now = new Date();
  const purgeDate = new Date(now.getTime() + RETENTION_MS);

  if (itemType === "ACCOUNT") {
    throw new Error(
      "Moving a tenant to the recycle bin must go through the platform API. Use blockTenantAndBin().",
    );
  }

  const binItem: RecycleBinItem<T> = {
    id: `trash_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
    originalId,
    itemType,
    name,
    summary,
    itemData,
    deletedAt: now.toISOString(),
    purgeAt: purgeDate.toISOString(),
    deletedBy,
    reason,
  };

  // Add to recycle bin
  items.unshift(binItem);
  saveRecycleBinItems(items);

  // Remove from source collection based on type
  if (itemType === "COMPANY") {
    deleteCompany(originalId);
  } else if (itemType === "BRANCH") {
    deleteBranch(originalId);
  } else if (itemType === "STAFF") {
    removeStaffFromActiveRegistry(originalId);
  }

  return binItem;
}

/**
 * Restore an entity from Recycle Bin back to its active collection
 */
export function restoreFromRecycleBin(recycleId: string): RecycleBinItem | null {
  const items = getRecycleBinItems();
  const target = items.find((i) => i.id === recycleId);
  if (!target) return null;

  // Restore into active collection
  if (target.itemType === "ACCOUNT") {
    throw new Error(
      "Restoring a tenant must go through the platform API. Use restoreTenantFromRecycleBin().",
    );
  } else if (target.itemType === "COMPANY") {
    saveCompany(target.itemData as Company);
  } else if (target.itemType === "BRANCH") {
    saveBranch(target.itemData as Branch);
  } else if (target.itemType === "STAFF") {
    restoreStaffToActiveRegistry(target.itemData as StaffMember);
  }

  // Remove from recycle bin
  const remaining = items.filter((i) => i.id !== recycleId);
  saveRecycleBinItems(remaining);

  return target;
}

/**
 * Blocks a tenant through the platform API and only then records it in the bin.
 *
 * Order matters: the server call is awaited first so a failed block never produces a bin entry
 * claiming the tenant was removed while it is still fully active.
 */
export async function blockTenantAndBin(
  originalId: string,
  name: string,
  summary: string,
  reason: string,
  deletedBy = "Master Admin",
): Promise<void> {
  await toggleAccountStatus(originalId, "BLOCKED", reason);

  const items = getRecycleBinItems();
  const now = new Date();
  items.unshift({
    id: `trash_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
    originalId,
    itemType: "ACCOUNT",
    name,
    summary,
    itemData: { id: originalId, name } as unknown as AdminAccount,
    deletedAt: now.toISOString(),
    purgeAt: new Date(now.getTime() + RETENTION_MS).toISOString(),
    deletedBy,
    reason,
  });
  saveRecycleBinItems(items);
}

/**
 * Restores a tenant by unblocking it through the platform API, then drops it from the bin.
 */
export async function restoreTenantFromRecycleBin(recycleId: string): Promise<void> {
  const items = getRecycleBinItems();
  const target = items.find((i) => i.id === recycleId);
  if (!target) throw new Error("Recycle bin entry not found");
  if (target.itemType !== "ACCOUNT") {
    throw new Error("This entry is not a tenant; use restoreFromRecycleBin instead");
  }

  await toggleAccountStatus(target.originalId, "ACTIVE");
  saveRecycleBinItems(items.filter((i) => i.id !== recycleId));
}

/**
 * Permanently delete an item from the Recycle Bin (irrevocable)
 */
export function permanentlyDeleteFromRecycleBin(recycleId: string): void {
  const items = getRecycleBinItems();
  const remaining = items.filter((i) => i.id !== recycleId);
  saveRecycleBinItems(remaining);
}

/**
 * Empty the entire Recycle Bin
 */
export function emptyRecycleBin(): void {
  saveRecycleBinItems([]);
}
