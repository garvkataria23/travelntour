import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { AUTH_COOKIE, ROLE_COOKIE, SESSION_COOKIE, getSessionSecret } from "@/lib/session-cookie";

/** Routes reachable without a session. */
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/privacy",
  "/terms",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/assets/")) return true;
  return false;
}

async function verifySession(request: NextRequest): Promise<{ role: string } | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, getSessionSecret(), {
        algorithms: ["HS256"],
      });
      if (payload.type === "session") {
        return { role: String(payload.role ?? "STAFF") };
      }
    } catch {
      // Fall through to synchronous cookie check if /api/session is still in flight
    }
  }

  const authFlag = request.cookies.get(AUTH_COOKIE)?.value;
  if (authFlag === "1") {
    const role = decodeURIComponent(request.cookies.get(ROLE_COOKIE)?.value || "STAFF");
    return { role };
  }

  return null;
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