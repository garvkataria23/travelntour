"use client";

import { getStoredUser, type ApiUser } from "@/lib/api";

/**
 * Frontend permission helpers.
 *
 * THE CONTRACT
 * ============
 *
 * The authoritative permission set comes from the API: `GET /auth/me` returns `permissions[]`
 * derived from the same matrix the backend guard enforces (backend/src/common/permissions.ts). The
 * UI reads that list. It does NOT re-derive permissions from the role.
 *
 * That matters because the previous approach — checking `user.role === "ADMIN"` scattered across
 * pages — produced three problems:
 *
 *   - 13 sidebar items rendered unconditionally, so a counter clerk saw Automation, Templates and
 *     Settings in the nav and only discovered on save that a 403 was coming.
 *   - The only role checks in the whole frontend were SUPER_ADMIN checks for /admin.
 *   - `ApiUser.role` was typed as `string`, so no comparison was compile-time checked.
 *
 * WHAT THIS IS NOT
 * ================
 *
 * Hiding a button is a usability feature, not a security control. Every capability is enforced
 * server-side by the same matrix. A user who edits localStorage can make a button appear; the
 * request will still be refused. Conversely, `permissions` is only as fresh as the last `/auth/me`,
 * so it is refreshed on session changes rather than trusted as an authority.
 */

export type Permission =
  | "settings:view"
  | "settings:view-sensitive"
  | "settings:manage"
  | "business:manage"
  | "customer:view"
  | "customer:create"
  | "customer:edit"
  | "customer:delete"
  | "customer:export"
  | "booking:view"
  | "booking:create"
  | "booking:edit"
  | "booking:reschedule"
  | "booking:cancel"
  | "booking:delete"
  | "invoice:view"
  | "invoice:view-pdf"
  | "invoice:issue"
  | "invoice:edit-items"
  | "invoice:record-payment"
  | "invoice:send"
  | "invoice:export"
  | "expense:view"
  | "expense:create"
  | "expense:edit"
  | "expense:delete"
  | "income:view"
  | "income:create"
  | "income:edit"
  | "income:delete"
  | "report:view-operational"
  | "report:view-financial"
  | "report:export"
  | "whatsapp:view-messages"
  | "whatsapp:send"
  | "whatsapp:retry"
  | "template:view"
  | "template:manage"
  | "automation:view"
  | "automation:manage"
  | "whatsapp:quota-manage"
  | "user:view"
  | "user:create"
  | "user:edit"
  | "user:delete"
  | "audit:view"
  | "storage:sweep"
  | "storage:view-usage"
  | "platform:tenants"
  | "backup:view"
  | "backup:create"
  | "backup:download"
  | "backup:restore"
  | "backup:delete"
  | "backup:configure";

export type AppRole = "ADMIN" | "MANAGER" | "STAFF" | "SUPER_ADMIN";

export interface PermissionGroupDefinition {
  group: string;
  description: string;
  items: Array<{
    key: Permission;
    label: string;
    desc: string;
  }>;
}

export const PERMISSION_CATALOG: PermissionGroupDefinition[] = [
  {
    group: "Bookings & Ticketing",
    description: "Control access to flight, hotel, visa, and package bookings",
    items: [
      { key: "booking:view", label: "View Bookings", desc: "Browse and inspect booking records & PNRs" },
      { key: "booking:create", label: "Create Bookings", desc: "Issue new corporate & individual bookings" },
      { key: "booking:edit", label: "Edit Bookings", desc: "Modify passenger, itinerary, or pricing details" },
      { key: "booking:reschedule", label: "Reschedule Flights", desc: "Change departure dates and flight segments" },
      { key: "booking:cancel", label: "Cancel Bookings", desc: "Cancel active bookings and update status" },
      { key: "booking:delete", label: "Delete Bookings", desc: "Permanently remove booking records" },
    ],
  },
  {
    group: "Customers & CRM",
    description: "Manage B2B corporate accounts, employees, and B2C travellers",
    items: [
      { key: "customer:view", label: "View Customers", desc: "Access customer directory and travel history" },
      { key: "customer:create", label: "Add Customers", desc: "Create new corporate or individual profiles" },
      { key: "customer:edit", label: "Edit Customers", desc: "Update passport, phone, and loyalty info" },
      { key: "customer:delete", label: "Delete Customers", desc: "Remove customer records from CRM" },
      { key: "customer:export", label: "Export Customers", desc: "Download customer lists as CSV/Excel" },
    ],
  },
  {
    group: "Invoices & Billing",
    description: "Generate tax invoices, download PDFs, and record payments",
    items: [
      { key: "invoice:view", label: "View Invoices", desc: "View invoice list and billing ledger" },
      { key: "invoice:view-pdf", label: "Download PDF Invoices", desc: "Generate and print official PDF invoices" },
      { key: "invoice:issue", label: "Issue Invoices", desc: "Create official GST/VAT invoices for bookings" },
      { key: "invoice:edit-items", label: "Edit Invoice Line Items", desc: "Modify commercial rates and tax lines" },
      { key: "invoice:record-payment", label: "Record Payments", desc: "Mark invoices paid and settle balances" },
      { key: "invoice:send", label: "Send Invoices", desc: "Send invoices via WhatsApp or Email" },
      { key: "invoice:export", label: "Export Billing Ledger", desc: "Export invoice registers for accounting" },
    ],
  },
  {
    group: "Finance, Expenses & Income",
    description: "Track supplier payouts, agency overhead expenses, and commissions",
    items: [
      { key: "expense:view", label: "View Expenses", desc: "View agency operating and supplier expenses" },
      { key: "expense:create", label: "Record Expenses", desc: "Log new expense entries and receipts" },
      { key: "expense:edit", label: "Edit Expenses", desc: "Modify existing expense records" },
      { key: "expense:delete", label: "Delete Expenses", desc: "Remove expense entries" },
      { key: "income:view", label: "View Income Ledger", desc: "View agency revenue and commission ledger" },
      { key: "income:create", label: "Record Income", desc: "Add manual income or incentive entries" },
      { key: "income:edit", label: "Edit Income", desc: "Update income ledger records" },
      { key: "income:delete", label: "Delete Income", desc: "Remove income ledger entries" },
    ],
  },
  {
    group: "WhatsApp & Automation",
    description: "Send automated reminders, boarding passes, and WhatsApp alerts",
    items: [
      { key: "whatsapp:view-messages", label: "View WhatsApp Logs", desc: "Read outbound WhatsApp delivery status" },
      { key: "whatsapp:send", label: "Send WhatsApp Messages", desc: "Send direct WhatsApp messages & templates" },
      { key: "whatsapp:retry", label: "Retry Failed Messages", desc: "Re-send failed WhatsApp dispatches" },
      { key: "template:view", label: "View Message Templates", desc: "Browse approved WhatsApp templates" },
      { key: "template:manage", label: "Manage Templates", desc: "Create and edit WhatsApp message templates" },
      { key: "automation:view", label: "View Automation Queue", desc: "Monitor scheduled T-24h / T-3h reminders" },
      { key: "automation:manage", label: "Manage Automation Rules", desc: "Configure automated dispatch triggers" },
    ],
  },
  {
    group: "Reports, Team & Settings",
    description: "Executive P&L reports, staff role management, and agency settings",
    items: [
      { key: "report:view-operational", label: "Operational Reports", desc: "View booking volume and route analytics" },
      { key: "report:view-financial", label: "Financial P&L Reports", desc: "View net profit, margins, and tax reports" },
      { key: "report:export", label: "Export Reports", desc: "Download CSV/Excel financial statements" },
      { key: "user:view", label: "View Team & Staff", desc: "View staff roster and booking performance" },
      { key: "user:create", label: "Add Staff / Admins", desc: "Create new staff accounts and login credentials" },
      { key: "user:edit", label: "Edit Staff & Roles", desc: "Modify staff roles, permissions, and passwords" },
      { key: "user:delete", label: "Delete / Suspend Staff", desc: "Deactivate or move staff to Recycle Bin" },
      { key: "audit:view", label: "View Security Audit Logs", desc: "Inspect login and activity audit trail" },
      { key: "settings:view", label: "View Agency Settings", desc: "View business profile and tax configuration" },
      { key: "settings:view-sensitive", label: "View Bank & API Keys", desc: "View sensitive bank & integration secrets" },
      { key: "settings:manage", label: "Modify Settings", desc: "Update agency branding, GST/VAT, and integrations" },
      { key: "backup:view", label: "View Backups", desc: "Access system backup snapshots" },
      { key: "backup:create", label: "Create Backups", desc: "Trigger on-demand system backups" },
      { key: "backup:download", label: "Download Backups", desc: "Export backup archives" },
    ],
  },
];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_CATALOG.flatMap((g) =>
  g.items.map((i) => i.key)
).concat([
  "business:manage",
  "whatsapp:quota-manage",
  "storage:sweep",
  "storage:view-usage",
  "platform:tenants",
  "backup:restore",
  "backup:delete",
  "backup:configure",
]);

export const ROLE_DEFAULT_PERMISSIONS: Record<AppRole, Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ADMIN: [
    "settings:view",
    "settings:view-sensitive",
    "settings:manage",
    "business:manage",
    "customer:view",
    "customer:create",
    "customer:edit",
    "customer:delete",
    "customer:export",
    "booking:view",
    "booking:create",
    "booking:edit",
    "booking:reschedule",
    "booking:cancel",
    "booking:delete",
    "invoice:view",
    "invoice:view-pdf",
    "invoice:issue",
    "invoice:edit-items",
    "invoice:record-payment",
    "invoice:send",
    "invoice:export",
    "expense:view",
    "expense:create",
    "expense:edit",
    "expense:delete",
    "income:view",
    "income:create",
    "income:edit",
    "income:delete",
    "report:view-operational",
    "report:view-financial",
    "report:export",
    "whatsapp:view-messages",
    "whatsapp:send",
    "template:view",
    "template:manage",
    "automation:view",
    "automation:manage",
    "user:view",
    "user:create",
    "user:edit",
    "user:delete",
    "audit:view",
    "storage:sweep",
  ],
  MANAGER: [
    "settings:view",
    "customer:view",
    "customer:create",
    "customer:edit",
    "customer:delete",
    "customer:export",
    "booking:view",
    "booking:create",
    "booking:edit",
    "booking:reschedule",
    "booking:cancel",
    "booking:delete",
    "invoice:view",
    "invoice:view-pdf",
    "invoice:export",
    "expense:view",
    "expense:create",
    "expense:edit",
    "expense:delete",
    "income:view",
    "income:create",
    "income:edit",
    "income:delete",
    "report:view-operational",
    "report:view-financial",
    "report:export",
    "whatsapp:view-messages",
    "whatsapp:send",
    "template:view",
    "automation:view",
    "audit:view",
  ],
  STAFF: [
    "settings:view",
    "customer:view",
    "customer:create",
    "customer:edit",
    "booking:view",
    "booking:create",
    "booking:edit",
    "booking:reschedule",
    "booking:cancel",
    "invoice:view",
    "invoice:view-pdf",
    "expense:view",
    "expense:create",
    "income:view",
    "income:create",
    "report:view-operational",
    "whatsapp:view-messages",
    "whatsapp:send",
    "template:view",
    "automation:view",
  ],
};

export function getDefaultPermissionsForRole(role?: string | null): Permission[] {
  const normalized = (role || "STAFF").toUpperCase() as AppRole;
  return ROLE_DEFAULT_PERMISSIONS[normalized] ?? ROLE_DEFAULT_PERMISSIONS.STAFF;
}

const NO_PERMISSIONS: Permission[] = [];

function normalise(list: unknown): Permission[] {
  if (!Array.isArray(list)) return NO_PERMISSIONS;
  return list.filter((p): p is Permission => typeof p === "string");
}

/**
 * The permission set the API attached to the signed-in user.
 *
 * Empty when signed out or when the stored user predates this change (in which case the next
 * `/auth/me` call will populate it). Never throws on malformed localStorage content.
 */
export function getPermissions(): Permission[] {
  const user = getStoredUser() as (ApiUser & { permissions?: unknown }) | null;
  if (!user) return NO_PERMISSIONS;
  return normalise(user.permissions);
}

export function hasPermission(permission: Permission): boolean {
  const user = getStoredUser();
  if (user?.role === "SUPER_ADMIN") return true;
  return getPermissions().includes(permission);
}

export function hasEveryPermission(permissions: Permission[]): boolean {
  const user = getStoredUser();
  if (user?.role === "SUPER_ADMIN") return true;
  const held = new Set(getPermissions());
  return permissions.every((p) => held.has(p));
}

export function hasAnyPermission(permissions: Permission[]): boolean {
  const user = getStoredUser();
  if (user?.role === "SUPER_ADMIN") return true;
  const held = new Set(getPermissions());
  return permissions.some((p) => held.has(p));
}

export function isSuperAdmin(): boolean {
  return getStoredUser()?.role === "SUPER_ADMIN";
}

export function isAdminOrAbove(): boolean {
  const role = getStoredUser()?.role;
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

/**
 * Which navigation items to show.
 *
 * A page with no entry here is visible to everyone — those are the pages every role of a tenant
 * legitimately needs. Anything with an empty `any` array is visible to nobody.
 */
export const NAV_PERMISSIONS: Record<string, Permission[]> = {
  "/bookings": ["booking:view"],
  "/bookings/add": ["booking:create"],
  "/upcoming-journeys": ["booking:view"],
  "/customers": ["customer:view"],
  "/whatsapp-messages": ["whatsapp:view-messages"],
  "/automation": ["automation:view"],
  "/message-templates": ["template:view"],
  "/reports": ["report:view-operational"],
  "/invoices": ["invoice:view"],
  "/expenses": ["expense:view"],
  "/income": ["income:view"],
  "/currency": [],
  "/settings": ["settings:view"],
  "/admin": ["platform:tenants"],
};

/**
 * Filters a navigation tree down to what this user may actually reach.
 *
 * Lives here rather than in the shell so the filtering rule is unit-testable without rendering, and
 * so both the sidebar and anything else that lists pages apply the same rule.
 */
export function visibleNavGroups<T extends { label: string; href: string; permissions?: Permission[] }>(
  groups: ReadonlyArray<{ title: string; items: readonly T[] }>,
  can: (permissions: Permission[]) => boolean = hasAnyPermission,
): Array<{ title: string; items: T[] }> {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.permissions === undefined || can(item.permissions)),
    }))
    .filter((group) => group.items.length > 0);
}

/** Convenience for pages that render a whole feature block. */
export const CAN = {
  viewFinancialReports: () => hasPermission("report:view-financial"),
  recordInvoicePayment: () => hasPermission("invoice:record-payment"),
  issueInvoice: () => hasPermission("invoice:issue"),
  editInvoiceItems: () => hasPermission("invoice:edit-items"),
  viewBankDetails: () => hasPermission("settings:view-sensitive"),
  manageSettings: () => hasPermission("settings:manage"),
  deleteCustomer: () => hasPermission("customer:delete"),
  deleteBooking: () => hasPermission("booking:delete"),
  exportAnything: () => hasPermission("report:export"),
  manageUsers: () => hasPermission("user:create"),
  viewAuditTrail: () => hasPermission("audit:view"),
  manageBackups: () => hasPermission("backup:view"),
} as const;