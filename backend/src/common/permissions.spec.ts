import { Role } from '@prisma/client';
import {
  ALL_PERMISSIONS,
  ASSIGNABLE_ROLES,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  Permission,
  ROLE_PERMISSIONS,
  permissionsForRole,
  roleHas,
  roleHasAll,
  roleHasAny,
} from './permissions';

describe('permission matrix', () => {
  describe('completeness', () => {
    it('grants SUPER_ADMIN every permission', () => {
      expect(ROLE_PERMISSIONS[Role.SUPER_ADMIN]).toEqual(ALL_PERMISSIONS);
    });

    it('has a label for every permission, so the admin matrix can render completely', () => {
      for (const p of ALL_PERMISSIONS) {
        expect(PERMISSION_LABELS[p]).toBeDefined();
        expect(PERMISSION_LABELS[p].label.length).toBeGreaterThan(0);
      }
    });

    it('lists no label for a permission that does not exist', () => {
      const labels = Object.keys(PERMISSION_LABELS);
      for (const p of ALL_PERMISSIONS) expect(labels).toContain(p);
      expect(labels.length).toBe(ALL_PERMISSIONS.length);
    });

    it('exposes every declared group', () => {
      const groups = new Set(ALL_PERMISSIONS.map((p) => PERMISSION_LABELS[p].group));
      expect([...PERMISSION_GROUPS].sort()).toEqual([...groups].sort());
    });
  });

  describe('roleHas', () => {
    it('grants everything to SUPER_ADMIN unconditionally', () => {
      for (const p of ALL_PERMISSIONS) {
        expect(roleHas(Role.SUPER_ADMIN, p)).toBe(true);
      }
    });

    it('returns false for an unknown or missing role rather than throwing', () => {
      expect(roleHas('NONSENSE', Permission.CUSTOMER_VIEW)).toBe(false);
      expect(roleHas(null, Permission.CUSTOMER_VIEW)).toBe(false);
      expect(roleHas(undefined, Permission.CUSTOMER_VIEW)).toBe(false);
      expect(permissionsForRole('NONSENSE')).toEqual([]);
    });
  });

  describe('STAFF is read-mostly and cannot touch money', () => {
    it('can do the day-to-day counter work', () => {
      expect(roleHas(Role.STAFF, Permission.CUSTOMER_VIEW)).toBe(true);
      expect(roleHas(Role.STAFF, Permission.CUSTOMER_CREATE)).toBe(true);
      expect(roleHas(Role.STAFF, Permission.BOOKING_CREATE)).toBe(true);
      expect(roleHas(Role.STAFF, Permission.EXPENSE_CREATE)).toBe(true);
      expect(roleHas(Role.STAFF, Permission.WHATSAPP_SEND)).toBe(true);
    });

    it('cannot change an invoice in any way', () => {
      // The three financial invoice capabilities. Recording a payment is the one that decides
      // whether revenue is recognised, so it is checked explicitly.
      expect(roleHas(Role.STAFF, Permission.INVOICE_ISSUE)).toBe(false);
      expect(roleHas(Role.STAFF, Permission.INVOICE_EDIT_ITEMS)).toBe(false);
      expect(roleHas(Role.STAFF, Permission.INVOICE_RECORD_PAYMENT)).toBe(false);
      expect(roleHas(Role.STAFF, Permission.INVOICE_SEND)).toBe(false);
      // But may read them, because issuing an invoice needs the history.
      expect(roleHas(Role.STAFF, Permission.INVOICE_VIEW)).toBe(true);
    });

    it('cannot delete customers or bookings', () => {
      // Both were effectively ungated before this matrix existed.
      expect(roleHas(Role.STAFF, Permission.CUSTOMER_DELETE)).toBe(false);
      expect(roleHas(Role.STAFF, Permission.BOOKING_DELETE)).toBe(false);
    });

    it('cannot read the tenant P&L', () => {
      expect(roleHas(Role.STAFF, Permission.REPORT_VIEW_FINANCIAL)).toBe(false);
      expect(roleHas(Role.STAFF, Permission.REPORT_VIEW_OPERATIONAL)).toBe(true);
    });

    it('cannot see bank details, manage settings, users, or platform state', () => {
      expect(roleHas(Role.STAFF, Permission.SETTINGS_VIEW_SENSITIVE)).toBe(false);
      expect(roleHas(Role.STAFF, Permission.SETTINGS_MANAGE)).toBe(false);
      expect(roleHas(Role.STAFF, Permission.USER_VIEW)).toBe(false);
      expect(roleHas(Role.STAFF, Permission.PLATFORM_TENANTS)).toBe(false);
      expect(roleHas(Role.STAFF, Permission.STORAGE_VIEW_USAGE)).toBe(false);
    });

    it('cannot touch backups at all', () => {
      for (const p of [
        Permission.BACKUP_VIEW,
        Permission.BACKUP_CREATE,
        Permission.BACKUP_DOWNLOAD,
        Permission.BACKUP_RESTORE,
        Permission.BACKUP_DELETE,
        Permission.BACKUP_CONFIGURE,
      ]) {
        expect(roleHas(Role.STAFF, p)).toBe(false);
      }
    });
  });

  describe('MANAGER', () => {
    it('gains destructive customer and expense operations over STAFF', () => {
      expect(roleHas(Role.MANAGER, Permission.CUSTOMER_DELETE)).toBe(true);
      expect(roleHas(Role.MANAGER, Permission.EXPENSE_DELETE)).toBe(true);
      expect(roleHas(Role.MANAGER, Permission.INCOME_DELETE)).toBe(true);
    });

    it('gains financial reports and exports', () => {
      expect(roleHas(Role.MANAGER, Permission.REPORT_VIEW_FINANCIAL)).toBe(true);
      expect(roleHas(Role.MANAGER, Permission.REPORT_EXPORT)).toBe(true);
    });

    it('still cannot move money on an invoice or change settings', () => {
      expect(roleHas(Role.MANAGER, Permission.INVOICE_RECORD_PAYMENT)).toBe(false);
      expect(roleHas(Role.MANAGER, Permission.INVOICE_ISSUE)).toBe(false);
      expect(roleHas(Role.MANAGER, Permission.SETTINGS_MANAGE)).toBe(false);
      expect(roleHas(Role.MANAGER, Permission.SETTINGS_VIEW_SENSITIVE)).toBe(false);
      expect(roleHas(Role.MANAGER, Permission.USER_CREATE)).toBe(false);
    });
  });

  describe('ADMIN', () => {
    it('controls the full tenant but nothing outside it', () => {
      expect(roleHas(Role.ADMIN, Permission.INVOICE_RECORD_PAYMENT)).toBe(true);
      expect(roleHas(Role.ADMIN, Permission.SETTINGS_MANAGE)).toBe(true);
      expect(roleHas(Role.ADMIN, Permission.SETTINGS_VIEW_SENSITIVE)).toBe(true);
      expect(roleHas(Role.ADMIN, Permission.USER_CREATE)).toBe(true);
      expect(roleHas(Role.ADMIN, Permission.STORAGE_SWEEP)).toBe(true);
    });

    it('cannot reach platform or backup authority', () => {
      expect(roleHas(Role.ADMIN, Permission.PLATFORM_TENANTS)).toBe(false);
      expect(roleHas(Role.ADMIN, Permission.BACKUP_VIEW)).toBe(false);
      expect(roleHas(Role.ADMIN, Permission.BACKUP_CREATE)).toBe(false);
      expect(roleHas(Role.ADMIN, Permission.BACKUP_RESTORE)).toBe(false);
      expect(roleHas(Role.ADMIN, Permission.STORAGE_VIEW_USAGE)).toBe(false);
      expect(roleHas(Role.ADMIN, Permission.WHATSAPP_QUOTA_MANAGE)).toBe(false);
    });
  });

  describe('roleHasAll / roleHasAny', () => {
    it('ANDs correctly', () => {
      expect(roleHasAll(Role.STAFF, [Permission.CUSTOMER_VIEW, Permission.BOOKING_VIEW])).toBe(true);
      expect(
        roleHasAll(Role.STAFF, [Permission.CUSTOMER_VIEW, Permission.INVOICE_ISSUE]),
      ).toBe(false);
    });

    it('ORs correctly', () => {
      expect(roleHasAny(Role.STAFF, [Permission.INVOICE_ISSUE, Permission.BOOKING_VIEW])).toBe(true);
      expect(roleHasAny(Role.STAFF, [Permission.INVOICE_ISSUE, Permission.INVOICE_SEND])).toBe(false);
    });

    it('short-circuits for SUPER_ADMIN in both modes', () => {
      expect(roleHasAll(Role.SUPER_ADMIN, ALL_PERMISSIONS)).toBe(true);
      expect(roleHasAny(Role.SUPER_ADMIN, [Permission.BACKUP_RESTORE])).toBe(true);
    });

    it('treats an empty requirement set as satisfied', () => {
      expect(roleHasAll(Role.STAFF, [])).toBe(true);
      expect(roleHasAny(Role.STAFF, [])).toBe(false);
    });
  });

  describe('ASSIGNABLE_ROLES', () => {
    it('excludes SUPER_ADMIN so a tenant can never mint a platform owner', () => {
      expect(ASSIGNABLE_ROLES).not.toContain(Role.SUPER_ADMIN);
      expect(ASSIGNABLE_ROLES).toEqual([Role.ADMIN, Role.MANAGER, Role.STAFF]);
    });

    it('covers every role that has a permission set', () => {
      for (const r of ASSIGNABLE_ROLES) {
        expect(ROLE_PERMISSIONS[r].length).toBeGreaterThan(0);
      }
    });
  });
});