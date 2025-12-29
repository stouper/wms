import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  /** ✅ 1. API는 무조건 통과 */
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  /** ✅ 2. Next 내부 리소스 통과 */
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  /** ✅ 3. 공개 페이지 */
  if (
    pathname === "/" ||
    pathname.startsWith("/mall/login")
  ) {
    return NextResponse.next();
  }

  const role = req.cookies.get("wms_role")?.value || "";

  /** ✅ 4. admin 보호 */
  if (pathname.startsWith("/mall/admin")) {
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/mall/login", req.url));
    }
  }

  /** ✅ 5. mall(customer) 보호 */
  if (pathname.startsWith("/mall")) {
    if (!role) {
      return NextResponse.redirect(new URL("/mall/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
