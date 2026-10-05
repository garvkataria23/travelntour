import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from './public.decorator';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { ROLES_KEY } from './roles.decorator';
import { Permission } from './permissions';

/**
 * The guard is the authoritative security boundary. Every permission test in `permissions.spec.ts`
 * checks the *matrix*; this file checks that the matrix is actually consulted, for every role, and
 * that denials are reported with the right HTTP status.
 *
 * The status distinction is not cosmetic. 401 means "your session is bad, log in again"; 403 means
 * "your session is fine, you just may not do this". Conflating them made the frontend log users out
 * for an ordinary permission problem.
 */

type Handler = (...args: never[]) => unknown;

function contextWith(options: {
  handler?: Handler;
  controller?: Handler;
  request?: Record<string, unknown>;
}) {
  const request = options.request ?? {};
  const handler = options.handler ?? (() => undefined);
  const controller = options.controller ?? (() => undefined);
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function guardFor(metadata: Record<string | symbol, unknown>, account: unknown = null) {
  const reflector = new Reflector();
  const getAllAndOverride = jest.fn((key: string | symbol) => metadata[key]);
  // A real account is the normal case; individual tests override it.
  reflector.getAllAndOverride = getAllAndOverride as unknown as Reflector['getAllAndOverride'];

  const prisma = {
    user: {
      findUnique: jest.fn(async () => account),
    },
  };
  const jwt = {
    verifyAsync: jest.fn(async (): Promise<Record<string, unknown>> => ({
      sub: 'user-1',
      type: 'access',
    })),
  };

  return {
    guard: new JwtAuthGuard(jwt as unknown as JwtService, reflector, prisma as never),
    jwt,
    prisma,
  };
}

function accountFor(role: string, status: UserStatus = UserStatus.ACTIVE) {
  return { id: 'user-1', businessId: 'biz-1', email: 'a@b.com', name: 'A', role, status };
}

const authed = (role: string, extra: Record<string, unknown> = {}) => ({
  request: { headers: { authorization: 'Bearer token' }, ...extra },
});

describe('JwtAuthGuard', () => {
  describe('401 vs 403', () => {
    it('answers a missing token with 401, not 403', async () => {
      const { guard } = guardFor({});
      await expect(
        guard.canActivate(contextWith({ request: { headers: {} } })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('answers a malformed Authorization header with 401', async () => {
      const { guard } = guardFor({});
      // No "Bearer " prefix. Previously treated as "no credentials", which was right by luck; this
      // pins it down so the two cannot drift apart.
      await expect(
        guard.canActivate(contextWith({ request: { headers: { authorization: 'token' } } })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('answers an invalid token with 401', async () => {
      const { guard, jwt } = guardFor({}, accountFor('SUPER_ADMIN'));
      jwt.verifyAsync.mockRejectedValueOnce(new Error('bad signature'));
      await expect(guard.canActivate(contextWith(authed('SUPER_ADMIN')))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('answers a valid token for a deleted account with 401', async () => {
      const { guard } = guardFor({}, null);
      await expect(guard.canActivate(contextWith(authed('SUPER_ADMIN')))).rejects.toThrow(
        /no longer exists/,
      );
    });

    it('answers an inactive account with 401, because the session must not survive deactivation', async () => {
      // 401 rather than 403 on purpose: an inactive account is not a permission problem, it is an
      // unusable session, and the correct client response is to log out.
      const { guard } = guardFor({}, accountFor('ADMIN', UserStatus.INACTIVE));
      await expect(guard.canActivate(contextWith(authed('ADMIN')))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('answers a real permission failure with 403, so the session is kept', async () => {
      const { guard } = guardFor(
        { [PERMISSIONS_KEY]: { mode: 'all', permissions: [Permission.BACKUP_VIEW] } },
        accountFor('ADMIN'),
      );
      const err = await guard
        .canActivate(contextWith(authed('ADMIN')))
        .then(() => null)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getStatus()).toBe(403);
    });
  });

  describe('Backup Console authorization', () => {
    const backupView: Record<string | symbol, unknown> = {
      [PERMISSIONS_KEY]: { mode: 'all', permissions: [Permission.BACKUP_VIEW] },
    };
    const backupRestore: Record<string | symbol, unknown> = {
      [PERMISSIONS_KEY]: { mode: 'all', permissions: [Permission.BACKUP_RESTORE] },
    };

    const cases: Array<[string, boolean]> = [
      ['SUPER_ADMIN', true],
      ['ADMIN', false],
      ['MANAGER', false],
      ['STAFF', false],
    ];

    it.each(cases)('BACKUP_VIEW for %s -> allowed=%s', async (role, allowed) => {
      const { guard } = guardFor(backupView, accountFor(role));
      const result = await guard
        .canActivate(contextWith(authed(role)))
        .then(() => true)
        .catch(() => false);
      expect(result).toBe(allowed);
    });

    it.each(cases)('BACKUP_RESTORE for %s -> allowed=%s', async (role, allowed) => {
      const { guard } = guardFor(backupRestore, accountFor(role));
      const result = await guard
        .canActivate(contextWith(authed(role)))
        .then(() => true)
        .catch(() => false);
      expect(result).toBe(allowed);
    });

    it('does not trust the role carried on the token', async () => {
      // A token minted while the user was SUPER_ADMIN, after the row was demoted to STAFF, must not
      // keep backup access for the remaining lifetime of that token. The role is re-read from the
      // database, not taken from the signed payload.
      const { guard, jwt } = guardFor(backupRestore, accountFor('STAFF'));
      jwt.verifyAsync.mockResolvedValueOnce({
        sub: 'user-1',
        type: 'access',
        role: 'SUPER_ADMIN',
        businessId: 'biz-1',
      });

      await expect(guard.canActivate(contextWith(authed('STAFF')))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('ignores a businessId in the token and uses the database value', async () => {
      // Cross-tenant escalation attempt: sign a token carrying another tenant's id.
      const { guard, jwt, prisma } = guardFor({}, accountFor('SUPER_ADMIN'));
      jwt.verifyAsync.mockResolvedValueOnce({
        sub: 'user-1',
        type: 'access',
        businessId: 'biz-VICTIM',
        role: 'ADMIN',
      });

      const request: Record<string, unknown> = { headers: { authorization: 'Bearer t' } };
      await guard.canActivate(contextWith({ request }));

      expect((request['user'] as { businessId: string }).businessId).toBe('biz-1');
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
    });
  });

  describe('token handling', () => {
    it('rejects a refresh token used as an access token', async () => {
      // A stolen refresh token must not authenticate API calls. `type` is the guard against it.
      const { guard, jwt } = guardFor({}, accountFor('ADMIN'));
      jwt.verifyAsync.mockResolvedValueOnce({ sub: 'user-1', type: 'refresh' });

      await expect(guard.canActivate(contextWith(authed('ADMIN')))).rejects.toThrow(
        /Invalid token type/,
      );
    });

    it('lets a public route through with no token at all', async () => {
      const { guard } = guardFor({ [IS_PUBLIC_KEY]: true });
      await expect(
        guard.canActivate(contextWith({ request: { headers: {} } })),
      ).resolves.toBe(true);
    });

    it('returns the account from the database, not the token payload', async () => {
      const { guard, jwt } = guardFor({}, accountFor('MANAGER'));
      jwt.verifyAsync.mockResolvedValueOnce({
        sub: 'user-1',
        type: 'access',
        name: 'Stale Name',
        businessId: 'biz-OLD',
      });

      const request: Record<string, unknown> = { headers: { authorization: 'Bearer t' } };
      await guard.canActivate(contextWith({ request }));

      const user = request['user'] as { name: string; role: string };
      expect(user.name).toBe('A');
      expect(user.role).toBe('MANAGER');
    });
  });

  describe('legacy @Roles()', () => {
    it('still honours @Roles and returns 403', async () => {
      const { guard } = guardFor({ [ROLES_KEY]: ['SUPER_ADMIN'] }, accountFor('MANAGER'));
      await expect(guard.canActivate(contextWith(authed('MANAGER')))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('Non-backup protected endpoints across all 4 roles', () => {
    const checkRole = async (permission: string, role: string): Promise<boolean> => {
      const { guard } = guardFor(
        { [PERMISSIONS_KEY]: { mode: 'all', permissions: [permission] } },
        accountFor(role),
      );
      return guard
        .canActivate(contextWith(authed(role)))
        .then(() => true)
        .catch((err: unknown) => {
          expect(err).toBeInstanceOf(ForbiddenException);
          expect((err as ForbiddenException).getStatus()).toBe(403);
          return false;
        });
    };

    describe('Platform-only endpoints (SUPER_ADMIN only)', () => {
      const platformPermissions = [
        Permission.PLATFORM_TENANTS,
        Permission.STORAGE_VIEW_USAGE,
        Permission.WHATSAPP_QUOTA_MANAGE,
      ];

      it.each(platformPermissions)('%s is allowed only for SUPER_ADMIN', async (perm) => {
        expect(await checkRole(perm, 'SUPER_ADMIN')).toBe(true);
        expect(await checkRole(perm, 'ADMIN')).toBe(false);
        expect(await checkRole(perm, 'MANAGER')).toBe(false);
        expect(await checkRole(perm, 'STAFF')).toBe(false);
      });
    });

    describe('Tenant-admin endpoints (SUPER_ADMIN and ADMIN only)', () => {
      const adminPermissions = [
        Permission.INVOICE_RECORD_PAYMENT,
        Permission.INVOICE_ISSUE,
        Permission.INVOICE_EDIT_ITEMS,
        Permission.SETTINGS_VIEW_SENSITIVE,
        Permission.SETTINGS_MANAGE,
        Permission.USER_CREATE,
        Permission.USER_DELETE,
        Permission.STORAGE_SWEEP,
      ];

      it.each(adminPermissions)('%s is allowed for SUPER_ADMIN/ADMIN and 403 for MANAGER/STAFF', async (perm) => {
        expect(await checkRole(perm, 'SUPER_ADMIN')).toBe(true);
        expect(await checkRole(perm, 'ADMIN')).toBe(true);
        expect(await checkRole(perm, 'MANAGER')).toBe(false);
        expect(await checkRole(perm, 'STAFF')).toBe(false);
      });
    });

    describe('Manager endpoints (SUPER_ADMIN, ADMIN, and MANAGER; 403 for STAFF)', () => {
      const managerPermissions = [
        Permission.REPORT_VIEW_FINANCIAL,
        Permission.CUSTOMER_DELETE,
        Permission.BOOKING_DELETE,
        Permission.EXPENSE_EDIT,
        Permission.EXPENSE_DELETE,
        Permission.INCOME_EDIT,
        Permission.INCOME_DELETE,
        Permission.AUDIT_VIEW,
      ];

      it.each(managerPermissions)('%s is allowed for SUPER_ADMIN/ADMIN/MANAGER and 403 for STAFF', async (perm) => {
        expect(await checkRole(perm, 'SUPER_ADMIN')).toBe(true);
        expect(await checkRole(perm, 'ADMIN')).toBe(true);
        expect(await checkRole(perm, 'MANAGER')).toBe(true);
        expect(await checkRole(perm, 'STAFF')).toBe(false);
      });
    });

    describe('Operational endpoints (all 4 authenticated roles)', () => {
      const operationalPermissions = [
        Permission.CUSTOMER_VIEW,
        Permission.CUSTOMER_CREATE,
        Permission.BOOKING_VIEW,
        Permission.BOOKING_CREATE,
        Permission.EXPENSE_CREATE,
        Permission.INCOME_CREATE,
        Permission.INVOICE_VIEW,
        Permission.REPORT_VIEW_OPERATIONAL,
        Permission.WHATSAPP_SEND,
        Permission.SETTINGS_VIEW,
      ];

      it.each(operationalPermissions)('%s is allowed for all four active roles', async (perm) => {
        expect(await checkRole(perm, 'SUPER_ADMIN')).toBe(true);
        expect(await checkRole(perm, 'ADMIN')).toBe(true);
        expect(await checkRole(perm, 'MANAGER')).toBe(true);
        expect(await checkRole(perm, 'STAFF')).toBe(true);
      });
    });
  });
});