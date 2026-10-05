"use client";

import type { ReactNode } from "react";
import { hasAnyPermission, hasEveryPermission, hasPermission, isSuperAdmin, type Permission } from "@/lib/permissions";

/**
 * Renders children only when the signed-in user holds the required capability.
 *
 * <Can permission="invoice:record-payment"> ... </Can>
 * <Can any={["expense:delete", "income:delete"]}> ... </Can>
 * <Can all={["template:manage", "automation:manage"]}> ... </Can>
 *
 * A convenience for the UI, not a control. The API refuses the same operations regardless of what
 * the browser renders, so hiding a button never stands in for enforcement. Prefer it for hiding
 * affordances; where an action is destructive, also handle the 403 the API returns so a
 * permission that changed mid-session does not present as a mystery failure.
 */

interface CanProps {
  permission?: Permission;
  any?: Permission[];
  all?: Permission[];
  children: ReactNode;
  /** Rendered instead of `children` when the check fails. `null` hides the subtree entirely. */
  fallback?: ReactNode;
}

export function Can({ permission, any, all, children, fallback = null }: CanProps) {
  let allowed: boolean;

  if (permission) {
    allowed = hasPermission(permission);
  } else if (all && all.length > 0) {
    allowed = hasEveryPermission(all);
  } else if (any && any.length > 0) {
    allowed = hasAnyPermission(any);
  } else {
    // No requirement expressed, so nothing is being gated.
    allowed = true;
  }

  return <>{allowed ? children : fallback}</>;
}

/**
 * Blocks a whole page and explains why, rather than rendering a half-usable screen full of
 * controls that will 403.
 *
 * Used for pages whose entire content is behind a single capability (backups, platform tenants,
 * audit trail), so the user gets a real explanation instead of an empty table.
 */
export function PermissionGate({
  any,
  all,
  title,
  description,
  children,
}: {
  any?: Permission[];
  all?: Permission[];
  title: string;
  description?: string;
  /** Rendered when the check passes. Omit it to use the gate purely as a blocker. */
  children?: ReactNode;
}) {
  const allowed = all && all.length > 0 ? hasEveryPermission(all) : hasAnyPermission(any ?? []);
  if (allowed) return <>{children}</>;

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
        <LockGlyph />
      </div>
      <h2 className="text-base font-bold text-slate-800">{title}</h2>
      {description ? <p className="mt-2 text-sm text-slate-500">{description}</p> : null}
      <p className="mt-4 text-xs text-slate-400">
        Your role is {isSuperAdmin() ? "Super Admin" : "restricted"}. Ask an administrator if you need this access.
      </p>
    </div>
  );
}

function LockGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5 text-slate-500">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/**
 * Explains a 403 in terms the user can act on.
 *
 * The API returns 403 (not 401) for an insufficient permission, so a session-expiry handler will not
 * swallow it — which is what previously made a role failure look like being logged out.
 */
export function isPermissionDenied(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status?: unknown }).status === 403
  );
}

export function permissionDeniedMessage(err: unknown): string {
  if (isPermissionDenied(err)) {
    return "Your role does not allow this action. An administrator can grant it, or ask them to do it for you.";
  }
  return err instanceof Error ? err.message : "Something went wrong";
}