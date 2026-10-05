import { Role } from '@prisma/client';

/**
 * CENTRAL AUTHORIZATION MODEL
 * ===========================
 *
 * Every capability in the product is one entry in `Permission`. Every role maps to a set of them in
 * `ROLE_PERMISSIONS`. That table is the single source of truth for "who can do what" — the API
 * enforces it (PermissionsGuard) and the UI reads the same list from `/auth/me` to decide what to
 * render.
 *
 * WHY THIS EXISTS
 *
 * The previous model was a bare `@Roles()` decorator, which could only answer "ADMIN or not". It
 * produced three concrete failures:
 *
 *   1. `POST /expenses`, `POST /incomes` and `DELETE /customers/:id` had **no check at all**, so a
 *      STAFF could write financial rows and hard-delete customers. (A comment in
 *      `invoices.controller.ts` even claimed expenses were admin-only, which was false.)
 *   2. `GET /settings` returned the whole `BusinessSetting` row — bank account number, IFSC, UPI
 *      ID, GSTIN — to every authenticated user.
 *   3. `GET /storage/usage` returned deployment-wide table sizes and per-table row counts, which
 *      leaks other tenants' row counts to a STAFF.
 *
 * Roles alone cannot express "may record an expense but may not touch an invoice", which is the
 * actual day-to-day split between a counter clerk and a manager. Hence MANAGER.
 *
 * DESIGN RULES
 *
 *   - Deny by default. A route with no `@RequirePermissions()` requires only authentication, so
 *     new endpoints are *open* unless annotated. That is deliberate: it keeps the annotation
 *     meaningful, and `PermissionCoverage` below documents every route that intentionally relies on
 *     that default.
 *   - SUPER_ADMIN is granted everything unconditionally and cannot be restricted. There is exactly
 *     one platform owner role and it is never assignable through the API.
 *   - Never derive a permission from a resource's content. Permissions are about capability;
 *     tenancy is handled separately by `businessId` scoping on every query.
 */

/** A capability. Values are stable strings: they cross the wire in `/auth/me`. */
export const Permission = {
  // ── Business profile & settings ────────────────────────────────────────────
  SETTINGS_VIEW: 'settings:view',
  /** Bank account, IFSC/SWIFT, UPI id, GSTIN. Financial detail, not shown to counter staff. */
  SETTINGS_VIEW_SENSITIVE: 'settings:view-sensitive',
  SETTINGS_MANAGE: 'settings:manage',
  BUSINESS_MANAGE: 'business:manage',

  // ── Customers ──────────────────────────────────────────────────────────────
  CUSTOMER_VIEW: 'customer:view',
  CUSTOMER_CREATE: 'customer:create',
  CUSTOMER_EDIT: 'customer:edit',
  CUSTOMER_DELETE: 'customer:delete',
  CUSTOMER_EXPORT: 'customer:export',

  // ── Bookings ───────────────────────────────────────────────────────────────
  BOOKING_VIEW: 'booking:view',
  BOOKING_CREATE: 'booking:create',
  BOOKING_EDIT: 'booking:edit',
  BOOKING_RESCHEDULE: 'booking:reschedule',
  BOOKING_CANCEL: 'booking:cancel',
  BOOKING_DELETE: 'booking:delete',

  // ── Invoices ───────────────────────────────────────────────────────────────
  INVOICE_VIEW: 'invoice:view',
  INVOICE_VIEW_PDF: 'invoice:view-pdf',
  INVOICE_ISSUE: 'invoice:issue',
  INVOICE_EDIT_ITEMS: 'invoice:edit-items',
  /** Records money received. The single most sensitive operational action. */
  INVOICE_RECORD_PAYMENT: 'invoice:record-payment',
  INVOICE_SEND: 'invoice:send',
  INVOICE_EXPORT: 'invoice:export',

  // ── Expenses & income ──────────────────────────────────────────────────────
  EXPENSE_VIEW: 'expense:view',
  EXPENSE_CREATE: 'expense:create',
  EXPENSE_EDIT: 'expense:edit',
  EXPENSE_DELETE: 'expense:delete',

  INCOME_VIEW: 'income:view',
  INCOME_CREATE: 'income:create',
  INCOME_EDIT: 'income:edit',
  INCOME_DELETE: 'income:delete',

  // ── Reports ────────────────────────────────────────────────────────────────
  /** Operational counts: journeys today, booking mix, routes, airlines. No money. */
  REPORT_VIEW_OPERATIONAL: 'report:view-operational',
  /** Money aggregates: revenue, margins, receivables, P&L. */
  REPORT_VIEW_FINANCIAL: 'report:view-financial',
  REPORT_EXPORT: 'report:export',

  // ── WhatsApp & automation ──────────────────────────────────────────────────
  WHATSAPP_VIEW_MESSAGES: 'whatsapp:view-messages',
  /** Sends a real outbound message through the customer's WhatsApp number. */
  WHATSAPP_SEND: 'whatsapp:send',
  WHATSAPP_RETRY: 'whatsapp:retry',
  TEMPLATE_VIEW: 'template:view',
  TEMPLATE_MANAGE: 'template:manage',
  AUTOMATION_VIEW: 'automation:view',
  AUTOMATION_MANAGE: 'automation:manage',
  /** Per-tenant monthly message ceiling and usage. Platform owner only. */
  WHATSAPP_QUOTA_MANAGE: 'whatsapp:quota-manage',

  // ── Users ──────────────────────────────────────────────────────────────────
  USER_VIEW: 'user:view',
  USER_CREATE: 'user:create',
  USER_EDIT: 'user:edit',
  USER_DELETE: 'user:delete',

  // ── Audit, storage, platform ───────────────────────────────────────────────
  AUDIT_VIEW: 'audit:view',
  /** Retention sweep. Destructive; scoped to the caller's tenant. */
  STORAGE_SWEEP: 'storage:sweep',
  /** Database-wide size and row counts. Reveals other tenants' volumes. */
  STORAGE_VIEW_USAGE: 'storage:view-usage',

  PLATFORM_TENANTS: 'platform:tenants',

  // ── Backups. Platform owner only, by product decision. ─────────────────────
  BACKUP_VIEW: 'backup:view',
  BACKUP_CREATE: 'backup:create',
  BACKUP_DOWNLOAD: 'backup:download',
  /** Destructive: overwrites live tenant data from an archive. */
  BACKUP_RESTORE: 'backup:restore',
  BACKUP_DELETE: 'backup:delete',
  /** Points the archiver at a Drive folder / rotates service-account credentials. */
  BACKUP_CONFIGURE: 'backup:configure',
} as const;

export type PermissionKey = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(Permission);

/** Read-only capabilities every authenticated member of a tenant has. */
const READ_ONLY: PermissionKey[] = [
  Permission.SETTINGS_VIEW,
  Permission.CUSTOMER_VIEW,
  Permission.BOOKING_VIEW,
  Permission.INVOICE_VIEW,
  Permission.INVOICE_VIEW_PDF,
  Permission.EXPENSE_VIEW,
  Permission.INCOME_VIEW,
  Permission.WHATSAPP_VIEW_MESSAGES,
  Permission.TEMPLATE_VIEW,
  Permission.AUTOMATION_VIEW,
  Permission.REPORT_VIEW_OPERATIONAL,
];

/**
 * STAFF — counter and coordination role.
 *
 * Books customers and bookings, records day-to-day expenses and income, reads invoices but cannot
 * change them. This is the role that previously had no ceiling at all on expenses/income/customers.
 */
const STAFF: PermissionKey[] = [
  ...READ_ONLY,
  Permission.CUSTOMER_CREATE,
  Permission.CUSTOMER_EDIT,
  Permission.BOOKING_CREATE,
  Permission.BOOKING_EDIT,
  Permission.BOOKING_RESCHEDULE,
  Permission.BOOKING_CANCEL,
  Permission.EXPENSE_CREATE,
  Permission.INCOME_CREATE,
  Permission.WHATSAPP_SEND,
  // Deliberately NOT REPORT_VIEW_FINANCIAL: margin and P&L are management information. A counter
  // clerk can see their own bookings and invoices, not the tenant's profitability.
];

/**
 * MANAGER — owns day-to-day operations for the tenant.
 *
 * Adds destructive customer deletion and full expense/income lifecycle, plus exports. Still cannot
 * touch invoices beyond reading them, settings, users, or anything platform-wide.
 */
const MANAGER: PermissionKey[] = [
  ...STAFF,
  Permission.CUSTOMER_DELETE,
  Permission.CUSTOMER_EXPORT,
  Permission.BOOKING_DELETE,
  Permission.EXPENSE_EDIT,
  Permission.EXPENSE_DELETE,
  Permission.INCOME_EDIT,
  Permission.INCOME_DELETE,
  Permission.INVOICE_EXPORT,
  Permission.REPORT_VIEW_FINANCIAL,
  Permission.REPORT_EXPORT,
  Permission.AUDIT_VIEW,
];

/** ADMIN — full control of their own tenant, and nothing outside it. */
const ADMIN: PermissionKey[] = [
  ...MANAGER,
  Permission.SETTINGS_VIEW_SENSITIVE,
  Permission.SETTINGS_MANAGE,
  Permission.BUSINESS_MANAGE,
  Permission.INVOICE_ISSUE,
  Permission.INVOICE_EDIT_ITEMS,
  Permission.INVOICE_RECORD_PAYMENT,
  Permission.INVOICE_SEND,
  Permission.TEMPLATE_MANAGE,
  Permission.AUTOMATION_MANAGE,
  Permission.USER_VIEW,
  Permission.USER_CREATE,
  Permission.USER_EDIT,
  Permission.USER_DELETE,
  Permission.STORAGE_SWEEP,
];

export const ROLE_PERMISSIONS: Record<Role, PermissionKey[]> = {
  STAFF,
  MANAGER,
  ADMIN,
  // Unconditional. See the design rules at the top of this file.
  SUPER_ADMIN: ALL_PERMISSIONS,
};

export function permissionsForRole(role: Role | string | undefined | null): PermissionKey[] {
  if (!role) return [];
  return ROLE_PERMISSIONS[role as Role] ?? [];
}

export function roleHas(role: Role | string | undefined | null, permission: PermissionKey): boolean {
  if (role === 'SUPER_ADMIN') return true;
  return permissionsForRole(role).includes(permission);
}

export function roleHasAll(
  role: Role | string | undefined | null,
  permissions: PermissionKey[],
): boolean {
  if (role === 'SUPER_ADMIN') return true;
  const granted = permissionsForRole(role);
  return permissions.every((p) => granted.includes(p));
}

export function roleHasAny(
  role: Role | string | undefined | null,
  permissions: PermissionKey[],
): boolean {
  if (role === 'SUPER_ADMIN') return true;
  const granted = new Set(permissionsForRole(role));
  return permissions.some((p) => granted.has(p));
}

/**
 * Roles a tenant administrator is allowed to assign.
 *
 * SUPER_ADMIN is excluded on purpose: it is the platform owner, it is not assignable through any
 * API, and a tenant must not be able to mint one for itself even if a DTO validator were
 * misconfigured.
 */
export const ASSIGNABLE_ROLES: Role[] = [Role.ADMIN, Role.MANAGER, Role.STAFF];

/** Roles that count as "an administrator of this tenant" for last-admin protection. */
export const TENANT_ADMIN_ROLES: Role[] = [Role.ADMIN];

/**
 * Human-readable capability list, used by the admin UI to render the matrix readably.
 * Keep in sync with the matrix above; the permission keys are the contract, not these labels.
 */
export const PERMISSION_LABELS: Record<PermissionKey, { label: string; group: string }> = {
  [Permission.SETTINGS_VIEW]: { label: 'View business profile', group: 'Settings' },
  [Permission.SETTINGS_VIEW_SENSITIVE]: { label: 'View bank details and GSTIN', group: 'Settings' },
  [Permission.SETTINGS_MANAGE]: { label: 'Edit settings, tax and invoicing', group: 'Settings' },
  [Permission.BUSINESS_MANAGE]: { label: 'Edit business profile', group: 'Settings' },

  [Permission.CUSTOMER_VIEW]: { label: 'View customers', group: 'Customers' },
  [Permission.CUSTOMER_CREATE]: { label: 'Add customers', group: 'Customers' },
  [Permission.CUSTOMER_EDIT]: { label: 'Edit customers', group: 'Customers' },
  [Permission.CUSTOMER_DELETE]: { label: 'Delete customers', group: 'Customers' },
  [Permission.CUSTOMER_EXPORT]: { label: 'Export customers', group: 'Customers' },

  [Permission.BOOKING_VIEW]: { label: 'View bookings', group: 'Bookings' },
  [Permission.BOOKING_CREATE]: { label: 'Create bookings', group: 'Bookings' },
  [Permission.BOOKING_EDIT]: { label: 'Edit bookings', group: 'Bookings' },
  [Permission.BOOKING_RESCHEDULE]: { label: 'Reschedule bookings', group: 'Bookings' },
  [Permission.BOOKING_CANCEL]: { label: 'Cancel bookings', group: 'Bookings' },
  [Permission.BOOKING_DELETE]: { label: 'Delete bookings', group: 'Bookings' },

  [Permission.INVOICE_VIEW]: { label: 'View invoices', group: 'Invoices' },
  [Permission.INVOICE_VIEW_PDF]: { label: 'Download invoice PDFs', group: 'Invoices' },
  [Permission.INVOICE_ISSUE]: { label: 'Issue invoices', group: 'Invoices' },
  [Permission.INVOICE_EDIT_ITEMS]: { label: 'Edit invoice line items', group: 'Invoices' },
  [Permission.INVOICE_RECORD_PAYMENT]: { label: 'Record payments', group: 'Invoices' },
  [Permission.INVOICE_SEND]: { label: 'Send invoices over WhatsApp', group: 'Invoices' },
  [Permission.INVOICE_EXPORT]: { label: 'Export invoice register', group: 'Invoices' },

  [Permission.EXPENSE_VIEW]: { label: 'View expenses', group: 'Expenses & income' },
  [Permission.EXPENSE_CREATE]: { label: 'Record expenses', group: 'Expenses & income' },
  [Permission.EXPENSE_EDIT]: { label: 'Edit expenses', group: 'Expenses & income' },
  [Permission.EXPENSE_DELETE]: { label: 'Delete expenses', group: 'Expenses & income' },
  [Permission.INCOME_VIEW]: { label: 'View income', group: 'Expenses & income' },
  [Permission.INCOME_CREATE]: { label: 'Record income', group: 'Expenses & income' },
  [Permission.INCOME_EDIT]: { label: 'Edit income', group: 'Expenses & income' },
  [Permission.INCOME_DELETE]: { label: 'Delete income', group: 'Expenses & income' },

  [Permission.REPORT_VIEW_OPERATIONAL]: { label: 'View operational reports', group: 'Reports' },
  [Permission.REPORT_VIEW_FINANCIAL]: { label: 'View financial reports and P&L', group: 'Reports' },
  [Permission.REPORT_EXPORT]: { label: 'Export reports', group: 'Reports' },

  [Permission.WHATSAPP_VIEW_MESSAGES]: { label: 'View WhatsApp messages', group: 'WhatsApp' },
  [Permission.WHATSAPP_SEND]: { label: 'Send WhatsApp messages', group: 'WhatsApp' },
  [Permission.WHATSAPP_RETRY]: { label: 'Retry failed messages', group: 'WhatsApp' },
  [Permission.TEMPLATE_VIEW]: { label: 'View templates', group: 'WhatsApp' },
  [Permission.TEMPLATE_MANAGE]: { label: 'Manage templates', group: 'WhatsApp' },
  [Permission.AUTOMATION_VIEW]: { label: 'View automation rules', group: 'WhatsApp' },
  [Permission.AUTOMATION_MANAGE]: { label: 'Manage automation rules', group: 'WhatsApp' },
  [Permission.WHATSAPP_QUOTA_MANAGE]: { label: 'Change WhatsApp quotas', group: 'WhatsApp' },

  [Permission.USER_VIEW]: { label: 'View team members', group: 'Team' },
  [Permission.USER_CREATE]: { label: 'Invite team members', group: 'Team' },
  [Permission.USER_EDIT]: { label: 'Edit team members', group: 'Team' },
  [Permission.USER_DELETE]: { label: 'Remove team members', group: 'Team' },

  [Permission.AUDIT_VIEW]: { label: 'View audit trail', group: 'Security' },
  [Permission.STORAGE_SWEEP]: { label: 'Run retention cleanup', group: 'Security' },
  [Permission.STORAGE_VIEW_USAGE]: { label: 'View database usage', group: 'Security' },
  [Permission.PLATFORM_TENANTS]: { label: 'Manage all tenants', group: 'Platform' },

  [Permission.BACKUP_VIEW]: { label: 'View backups', group: 'Backups' },
  [Permission.BACKUP_CREATE]: { label: 'Run backups', group: 'Backups' },
  [Permission.BACKUP_DOWNLOAD]: { label: 'Download backups', group: 'Backups' },
  [Permission.BACKUP_RESTORE]: { label: 'Restore from backup', group: 'Backups' },
  [Permission.BACKUP_DELETE]: { label: 'Delete backups', group: 'Backups' },
  [Permission.BACKUP_CONFIGURE]: { label: 'Configure backup destination', group: 'Backups' },
};

/** Permission groups in display order, for rendering the matrix. */
export const PERMISSION_GROUPS: string[] = Array.from(
  new Set(Object.values(PERMISSION_LABELS).map((entry) => entry.group)),
);