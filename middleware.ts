import { NextResponse, type NextRequest } from "next/server";

/**
 * Security headers for the document responses.
 *
 * The API already runs Helmet (backend/src/main.ts), but it only ever returns JSON, so its
 * Content-Security-Policy does nothing. This app serves the HTML, so the policy that matters
 * lives here.
 *
 * A per-request nonce is used for scripts instead of 'unsafe-inline' so an injected <script>
 * tag cannot execute. Next.js picks the nonce up from the CSP header on the request.
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
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
    // Everything except static assets and image optimisation output.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
