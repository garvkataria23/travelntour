import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/session-cookie";

/**
 * Stores the signed session assertion issued by the API in an httpOnly cookie on the app's own
 * origin, so the Next.js middleware can verify it server-side.
 *
 * Why this indirection is needed: the API is on a different host than the app, so a cookie set by
 * the API is not attached to app requests by the browser (and would need SameSite=None + Secure
 * plus CORS credentials to work at all). The assertion is therefore relayed through the app.
 *
 * The cookie is httpOnly, so page scripts cannot read or forge it — which is exactly what the
 * previous `fc_sa` check allowed, since that cookie was set from client JS and held the literal
 * value "1".
 */

export async function POST(request: Request) {
  let token: unknown;
  try {
    const body = await request.json();
    token = body?.session;
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  if (typeof token !== "string" || token.length < 20 || token.split(".").length !== 3) {
    return NextResponse.json({ ok: false, error: "INVALID_SESSION" }, { status: 400 });
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return NextResponse.json({ ok: true });
}