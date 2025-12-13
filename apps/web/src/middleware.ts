import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// /mall/admin/** 는 admin만 접근 가능
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/mall/admin')) {
    const raw = req.cookies.get('session')?.value ?? null;
    try {
      const json = raw ? JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) : null;
      if (!json || json.role !== 'admin') {
        const url = new URL('/mall/login', req.url);
        url.searchParams.set('from', pathname);
        return NextResponse.redirect(url);
      }
    } catch {
      const url = new URL('/mall/login', req.url);
      url.searchParams.set('from', pathname);
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/mall/admin/:path*'],
};
