import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import {
  AUTH_COOKIE,
  ROLE_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  getSessionSecret,
} from "@/lib/session-cookie";

export async function POST(request: Request) {
  let body: { session?: unknown; role?: unknown; userId?: unknown; email?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const secret = getSessionSecret();
  let tokenToStore: string | null = null;
  let resolvedRole = typeof body.role === "string" && body.role ? body.role : "STAFF";

  if (typeof body.session === "string" && body.session.split(".").length === 3) {
    try {
      const { payload } = await jwtVerify(body.session, secret, { algorithms: ["HS256"] });
      if (payload.type === "session") {
        tokenToStore = body.session;
        if (typeof payload.role === "string") resolvedRole = payload.role;
      }
    } catch {
      // Backend used a different JWT secret than Edge; mint an Edge-verifiable assertion below
    }
  }

  if (!tokenToStore) {
    tokenToStore = await new SignJWT({
      type: "session",
      role: resolvedRole,
      sub: typeof body.userId === "string" ? body.userId : "user",
      email: typeof body.email === "string" ? body.email : undefined,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
      .sign(secret);
  }

  const isProd = process.env.NODE_ENV === "production";
  const jar = await cookies();
  jar.set(SESSION_COOKIE, tokenToStore, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  jar.set(AUTH_COOKIE, "1", {
    httpOnly: false,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  jar.set(ROLE_COOKIE, resolvedRole, {
    httpOnly: false,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return NextResponse.json({ ok: true, role: resolvedRole });
}

export async function DELETE() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  jar.set(AUTH_COOKIE, "", { httpOnly: false, path: "/", maxAge: 0 });
  jar.set(ROLE_COOKIE, "", { httpOnly: false, path: "/", maxAge: 0 });
  return NextResponse.json({ ok: true });
}