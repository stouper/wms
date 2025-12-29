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
  const raw = await fs.readFile(DB_FILE, "utf8").catch(() => "[]");
  const rows = JSON.parse(raw || "[]");
  return Array.isArray(rows) ? rows : [];
}

async function writeAll(rows: Product[]) {
  await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(rows, null, 2), "utf8");
}

function norm(v: any) {
  return String(v ?? "").trim();
}
function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rows = await readAll();
  const found = rows.find((p) => p.id === id);
  if (!found) return NextResponse.json({ ok: false, message: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, product: found });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "admin only", role: getRole(req) }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const rows = await readAll();

  const idx = rows.findIndex((p) => p.id === id);
  if (idx < 0) return NextResponse.json({ ok: false, message: "not found" }, { status: 404 });

  const now = new Date().toISOString();
  const cur = rows[idx];

  const next: Product = {
    ...cur,
    name: norm(body.name || cur.name),
    price: body.price != null && Number.isFinite(num(body.price)) ? num(body.price) : cur.price,
    imageUrl: body.imageUrl != null ? norm(body.imageUrl) : cur.imageUrl,
    updatedAt: now,
  };

  rows[idx] = next;
  await writeAll(rows);

  return NextResponse.json({ ok: true, product: next });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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
