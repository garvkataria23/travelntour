import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Role } from '@prisma/client';

/**
 * The authenticated caller, attached by JwtAuthGuard.
 *
 * `role` is Prisma's own `Role` enum rather than a hand-written string union. The union was
 * missing MANAGER, which is why callers had to cast with `as Role` and why a role change required
 * hunting down every literal. Deriving it from the schema means adding a role is a one-line change
 * and TypeScript points at every place that needs updating.
 */
export interface AuthUser {
  id: string;
  /** Re-derived from the database on every request; never trusted from the token. */
  businessId: string;
  email: string;
  name: string;
  role: Role;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthUser;
  },
);