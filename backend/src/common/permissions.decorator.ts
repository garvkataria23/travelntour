import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from './permissions';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Declares the capabilities a route requires.
 *
 * ALL listed permissions are required (AND semantics) unless the route uses
 * `@RequireAnyPermission`. Deny-by-default: a route with no permission metadata requires only
 * authentication, so annotate deliberately.
 */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, { mode: 'all', permissions });

/** Passes when the caller holds at least one of the listed permissions. */
export const RequireAnyPermission = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, { mode: 'any', permissions });