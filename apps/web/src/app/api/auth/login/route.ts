import { NextRequest, NextResponse } from "next/server";
import { encodeSession, ROLE_COOKIE, SESSION_COOKIE, UserRole } from "@/lib/auth";

function norm(v: any) {
  return String(v ?? "").trim();
}

function isProd() {
  return process.env.NODE_ENV === "production";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));

  const role = norm(body?.role) as UserRole;
  if (role !== "admin" && role !== "customer") {
    return NextResponse.json({ ok: false, message: 'role must be "admin" or "customer"' }, { status: 400 });
  }

  // ✅ 선택 보안: env 있으면 secret 필수
  const requiredSecret = norm(process.env.WMS_LOGIN_SECRET);
  if (requiredSecret) {
    const got = norm(body?.secret);
    if (!got || got !== requiredSecret) {
      return NextResponse.json({ ok: false, message: "invalid secret" }, { status: 401 });
    }
  }

  const session = encodeSession({ role });
  const res = NextResponse.json({
    ok: true,
    role,
    redirectTo: role === "admin" ? "/mall/admin" : "/mall",
  });

  // 7일
  const maxAge = 60 * 60 * 24 * 7;

  res.cookies.set(SESSION_COOKIE, session, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd(),
    path: "/",
    maxAge,
  });

  // middleware 빠른 체크용(선택) — 값은 role 문자열 그대로
  res.cookies.set(ROLE_COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd(),
    path: "/",
    maxAge,
  });

  return res;
}
