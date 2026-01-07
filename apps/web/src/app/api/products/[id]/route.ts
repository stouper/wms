import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Product = {
  id: string;
  name: string;
  price?: number;
  imageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
};

const DB_FILE = path.join(process.cwd(), "src", "data", "products.db.json");

function getRole(req: NextRequest) {
  return req.cookies.get("wms_role")?.value || "";
}
function isAdmin(req: NextRequest) {
  return getRole(req) === "admin";
}

async function ensureDbFile() {
  try {
    await fs.access(DB_FILE);
  } catch {
    await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
    await fs.writeFile(DB_FILE, "[]", "utf8");
  }
}

async function readAll(): Promise<Product[]> {
  await ensureDbFile();
  const raw = await fs.readFile(DB_FILE, "utf8");
  const rows = JSON.parse(raw || "[]") as Product[];
  return Array.isArray(rows) ? rows : [];
}

async function writeAll(rows: Product[]) {
  await ensureDbFile();
  await fs.writeFile(DB_FILE, JSON.stringify(rows, null, 2), "utf8");
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rows = await readAll();
  const item = rows.find((p) => p.id === id);
  if (!item) return NextResponse.json({ ok: false, message: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, item });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // ✅ 수정은 admin only
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "admin only", role: getRole(req) }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Partial<Product> | null;
  if (!body) return NextResponse.json({ ok: false, message: "invalid body" }, { status: 400 });

  const rows = await readAll();
  const idx = rows.findIndex((p) => p.id === id);
  if (idx < 0) return NextResponse.json({ ok: false, message: "not found" }, { status: 404 });

  const now = new Date().toISOString();
  const nextItem: Product = {
    ...rows[idx],
    ...body,
    id,
    updatedAt: now,
  };

  const next = [...rows];
  next[idx] = nextItem;
  await writeAll(next);

  return NextResponse.json({ ok: true, item: nextItem });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // ✅ 삭제는 admin only
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "admin only", role: getRole(req) }, { status: 403 });
  }

  const { id } = await ctx.params;
  const rows = await readAll();

  const idx = rows.findIndex((p) => p.id === id);
  if (idx < 0) return NextResponse.json({ ok: false, message: "not found" }, { status: 404 });

  const removed = rows[idx];
  const next = rows.filter((p) => p.id !== id);
  await writeAll(next);

  return NextResponse.json({ ok: true, removed });
}
