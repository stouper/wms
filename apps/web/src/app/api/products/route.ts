import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { products, Product } from '@/data/products';
import { parseSessionCookie } from '@/lib/auth';

export async function GET() {
  return NextResponse.json({ ok: true, items: products });
}

export async function POST(req: Request) {
  // 🔧 Next 15: cookies()는 async → 반드시 await
  const cookieStore = await cookies();
  const raw = cookieStore.get('session')?.value ?? null;
  const session = parseSessionCookie(raw);

  if (!session || session.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Partial<Product> | null;
  if (!body?.name || typeof body.price !== 'number') {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 });
  }

  const id = `p-${Date.now()}`;
  const item: Product = {
    id,
    name: body.name,
    price: body.price,
    desc: body.desc ?? '',
  };
  products.unshift(item);

  return NextResponse.json({ ok: true, item }, { status: 201 });
}
