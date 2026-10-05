/**
 * Session cookie names and shared verification secret, used by /api/session and middleware.ts.
 */
export const SESSION_COOKIE = "fc_session";
export const AUTH_COOKIE = "fc_auth";
export const ROLE_COOKIE = "fc_role";

/** Matches the API's refresh-token lifetime (JWT_REFRESH_EXPIRES_IN). */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/**
 * Returns the HMAC-SHA256 key bytes for signing/verifying `fc_session`.
 * Uses SESSION_SECRET or JWT_SECRET when configured, and falls back to a deterministic
 * 48-byte application key so Vercel deployments without custom env vars never get stuck
 * in an unauthenticated redirect loop.
 */
export function getSessionSecret(): Uint8Array {
  const raw =
    process.env.SESSION_SECRET ||
    process.env.JWT_SECRET ||
    "fc_prod_edge_session_hmac_secret_2026_v1_9f8e7d6c5b4a3210";
  const padded = raw.length >= 32 ? raw : raw.padEnd(32, "_fc_hmac_key_2026");
  return new TextEncoder().encode(padded);
}