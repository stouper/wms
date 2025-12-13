import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { parseSessionCookie } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const raw = cookieStore.get('session')?.value ?? null;
  const session = parseSessionCookie(raw);

  if (!session || session.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ ok: false, error: 'no file' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const uploadDir = path.join(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const filename = `${Date.now()}-${file.name}`;
  const filepath = path.join(uploadDir, filename);
  fs.writeFileSync(filepath, buffer);

  return NextResponse.json({
    ok: true,
    url: `/uploads/${filename}`,
  });
}
