import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String((body as any)?.id ?? "").trim();
    const password = String((body as any)?.password ?? "").trim();

    // ✅ 임시 테스트 계정 (나중에 DB로 교체)
    let role: "admin" | "customer" | null = null;

    if (id === "admin" && password === "admin") role = "admin";
    if (id === "customer" && password === "customer") role = "customer";

    if (!role) {
      return NextResponse.json({ ok: false, message: "invalid credentials" }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true, role });

    // ✅ middleware가 읽을 로그인 쿠키
    res.cookies.set("wms_session", "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });

    res.cookies.set("wms_role", role, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });

    return res;
  } catch {
    return NextResponse.json({ ok: false, message: "server error" }, { status: 500 });
  }
}
