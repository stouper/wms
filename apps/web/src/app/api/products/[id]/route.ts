import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { products, Product } from '@/data/products';
import { parseSessionCookie } from '@/lib/auth';

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: Context) {
  const { id } = await context.params;

  const item = products.find(p => p.id === id);
  if (!item) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, item });
}

export async function PATCH(req: Request, context: Context) {
  const { id } = await context.params;

  const cookieStore = await cookies();
  const raw = cookieStore.get('session')?.value ?? null;
  const session = parseSessionCookie(raw);

  if (!session || session.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const idx = products.findIndex(p => p.id === id);
  if (idx === -1) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as Partial<Product> | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 });
  }

  products[idx] = {
    ...products[idx],
    ...(typeof body.name === 'string' ? { name: body.name } : {}),
    ...(typeof body.price === 'number' ? { price: body.price } : {}),
    ...(typeof body.desc === 'string' ? { desc: body.desc } : {}),
  };

  return NextResponse.json({ ok: true, item: products[idx] });
}

export async function DELETE(_: Request, context: Context) {
  const { id } = await context.params;

  const cookieStore = await cookies();
  const raw = cookieStore.get('session')?.value ?? null;
  const session = parseSessionCookie(raw);

  if (!session || session.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const idx = products.findIndex(p => p.id === id);
  if (idx === -1) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  }

  const [removed] = products.splice(idx, 1);
  return NextResponse.json({ ok: true, item: removed });
}
