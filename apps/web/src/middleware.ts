import { NextRequest, NextResponse } from "next/server";
import { ROLE_COOKIE } from "@/lib/auth";

function getRole(req: NextRequest) {
  return req.cookies.get(ROLE_COOKIE)?.value || "";
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // API는 통과 (API 내부에서 권한 체크 가능)
  if (pathname.startsWith("/api")) return NextResponse.next();

  // next static 통과
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) return NextResponse.next();

  // 공개 페이지
  if (
    pathname === "/" ||
    pathname === "/mall" ||
    pathname.startsWith("/mall/product") ||
    pathname.startsWith("/mall/login")
  ) {
    return NextResponse.next();
  }

  const role = getRole(req);

  // admin only
  if (pathname.startsWith("/mall/admin")) {
    if (role !== "admin") return NextResponse.redirect(new URL("/mall/login", req.url));
    return NextResponse.next();
  }

  // customer/admin only
  if (pathname.startsWith("/mall/orders")) {
    if (role !== "customer" && role !== "admin") return NextResponse.redirect(new URL("/mall/login", req.url));
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
