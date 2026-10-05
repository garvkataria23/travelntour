/**
 * Session cookie name, shared by the /api/session route and middleware.ts.
 *
 * It lives here rather than in the route file because Next.js route modules may only export HTTP
 * method handlers — a named export from app/api/session/route.ts fails the production build.
 */
export const SESSION_COOKIE = "fc_session";

/** Matches the API's refresh-token lifetime (JWT_REFRESH_EXPIRES_IN). */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;