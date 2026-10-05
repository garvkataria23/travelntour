import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthUser } from '../common/current-user.decorator';
import { ROLES_KEY } from '../common/roles.decorator';
import { IS_PUBLIC_KEY } from '../common/public.decorator';
import { PERMISSIONS_KEY } from '../common/permissions.decorator';
import type { PermissionKey } from '../common/permissions';
import { roleHasAll, roleHasAny } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { Role, UserStatus } from '@prisma/client';

/**
 * Authentication + authorization, in one pass.
 *
 * ORDER MATTERS
 *
 *  1. Public routes short-circuit.
 *  2. The bearer token is verified.
 *  3. The account is re-read from the database. A signed token proves who signed in, not that the
 *     account is still usable — without this lookup a suspended user, or one whose role was
 *     downgraded, keeps full access for the remaining lifetime of their access token.
 *  4. Permissions are evaluated.
 *
 * DENIALS
 *
 *  - Missing/invalid credentials → 401 Unauthorized.
 *  - Valid credentials, insufficient permission → 403 Forbidden.
 *
 * These were previously conflated: `@Roles()` failures raised UnauthorizedException (401), so the
 * frontend treated a permission problem as a session expiry and bounced the user to the login
 * screen. A 403 keeps the session and lets the UI show "you do not have access to this".
 *
 * @Roles() is still honoured so the older decorator keeps working, but new code should use
 * @RequirePermissions(), which can express capability rather than just seniority.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      throw new UnauthorizedException({ message: 'Authentication required', code: 'UNAUTHORIZED' });
    }

    let user: AuthUser;
    try {
      const payload = await this.jwtService.verifyAsync(token);
      if (payload.type !== 'access') {
        throw new UnauthorizedException({ message: 'Invalid token type', code: 'INVALID_TOKEN' });
      }

      const account = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, businessId: true, email: true, name: true, role: true, status: true },
      });
      if (!account) {
        throw new UnauthorizedException({ message: 'Account no longer exists', code: 'ACCOUNT_NOT_FOUND' });
      }
      if (account.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException({ message: 'Your account is inactive', code: 'ACCOUNT_INACTIVE' });
      }

      user = {
        id: account.id,
        // Re-derived from the database rather than read off the token, so a validly signed token
        // can never be pointed at a different tenant.
        businessId: account.businessId,
        email: account.email,
        name: account.name,
        role: account.role,
      };
      request.user = user;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException({ message: 'Invalid or expired token', code: 'INVALID_TOKEN' });
    }

    const requirements = this.reflector.getAllAndOverride<{ mode: 'all' | 'any'; permissions: PermissionKey[] }>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requirements && requirements.permissions.length > 0) {
      const satisfied =
        requirements.mode === 'any'
          ? roleHasAny(user.role, requirements.permissions)
          : roleHasAll(user.role, requirements.permissions);
      if (!satisfied) {
        throw new ForbiddenException({
          message: `Your role (${user.role}) does not allow this action`,
          code: 'INSUFFICIENT_PERMISSION',
          required: requirements.permissions,
        });
      }
    }

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && roles.length > 0) {
      const allowed = roles.includes(user.role) || user.role === 'SUPER_ADMIN';
      if (!allowed) {
        throw new ForbiddenException({ message: 'Insufficient permissions', code: 'FORBIDDEN' });
      }
    }

    return true;
  }
}