import { NextResponse } from 'next/server';
import { encodeSessionCookie } from '@/lib/auth';

export async function POST(req: Request) {
  // body: { role: 'admin' | 'guest' }
  const { role } = await req.json().catch(() => ({}));

  if (role !== 'admin' && role !== 'guest') {
    return NextResponse.json(
      { ok: false, error: 'invalid role' },
      { status: 400 }
    );
  }

  const res = NextResponse.json({ ok: true, role });

  res.cookies.set('session', encodeSessionCookie({ role }), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7 // 7일
  });

  return res;
}
