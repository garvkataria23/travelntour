import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE } from "@/lib/session-cookie";

/**
 * Security headers plus real server-side route protection.
 *
 * The previous /admin guard checked a `fc_sa` cookie that was written from client JavaScript with
 * the literal value "1". It was unsigned, not httpOnly, and never validated against any token, so
 * `document.cookie = "fc_sa=1"` granted access. That is now replaced by verification of the
 * httpOnly `fc_session` cookie, which the API signs and no script can forge.
 */

/** Routes reachable without a session. */
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/privacy",
  "/terms",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Never gate the session and version endpoints: they are what the browser needs in order to
  // establish or discard a session, and the version endpoint is a public heartbeat.
  if (pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  return false;
}

async function verifySession(request: NextRequest): Promise<{ role: string } | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET;
  // No fallback secret: a missing secret must fail closed, not silently allow every request.
  if (!secret || secret.length < 32) {
    console.error(
      "[middleware] SESSION_SECRET/JWT_SECRET is missing or too short; refusing to trust session cookies.",
    );
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
    // Guard against a refresh/access token being replayed as a session assertion.
    if (payload.type !== "session") return null;
    return { role: String(payload.role ?? "") };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Route protection ──────────────────────────────────────────────────────
  if (!isPublicPath(pathname)) {
    const session = await verifySession(request);

    if (!session) {
      if (pathname.startsWith("/admin")) {
        // Preserve where the user was trying to go, but only inside the app.
        const redirectUrl = new URL("/", request.url);
        redirectUrl.searchParams.set("next", pathname);
        return NextResponse.redirect(redirectUrl);
      }
      const loginUrl = new URL("/", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (pathname.startsWith("/admin") && session.role !== "SUPER_ADMIN") {
      // Authenticated but not a platform owner. Redirect to the app rather than the login page,
      // which is what the previous 401-from-the-guard path caused (the client treated it as a
      // session expiry and bounced to login).
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // ── CSP / security headers ───────────────────────────────────────────────
  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV === "development";

  const apiOrigin = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api").origin;
    } catch {
      return "http://localhost:4000";
    }
  })();

  const fallbackApiOrigin = (() => {
    try {
      return new URL(
        process.env.NEXT_PUBLIC_FALLBACK_API_URL || "https://flyconnect-backend-fallback.onrender.com/api"
      ).origin;
    } catch {
      return "https://flyconnect-backend-fallback.onrender.com";
    }
  })();

  const csp = [
    "default-src 'self'",
    // Next.js injects inline bootstrap scripts; the nonce is what makes them acceptable.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Tailwind injects a <style> tag at runtime in dev.
    `style-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "img-src 'self' data: blob: https://lh3.googleusercontent.com",
    "font-src 'self' data:",
    // Every API call, including primary backend, fallback backend, Firebase Auth, and Firestore
    `connect-src 'self' ${apiOrigin} ${fallbackApiOrigin} https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com`,
    "frame-src 'self' https://traveltourism-32d7d.firebaseapp.com https://accounts.google.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);

  return response;
}

export const config = {
  matcher: [
    // Everything except Next.js build output and image optimisation. The previous matcher excluded
    // any path ending in a static-asset extension, which meant a future route such as
    // /admin/logo.svg would have been served with no CSP and, crucially, no /admin guard.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};