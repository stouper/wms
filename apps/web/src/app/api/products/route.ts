import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

type Product = {
  id: string;
  name?: string;
  title?: string;
  price?: number;
  sku?: string;
  makerCode?: string;
  onHand?: number;
  thumbnail?: string;
  imageUrl?: string;
  description?: string;
  desc?: string;
  createdAt?: string;
  updatedAt?: string;
};

const DB_FILE = path.join(process.cwd(), "src", "data", "products.db.json");

function isAdmin(req: NextRequest) {
  const role = req.cookies.get("wms_role")?.value;
  return role === "admin";
}

async function ensureDbFile() {
  try {
    await fs.access(DB_FILE);
    return;
  } catch {}

  // seed from src/data/products.ts if possible
  let seed: any = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(path.join(process.cwd(), "src", "data", "products.ts"));
    seed = mod?.products ?? mod?.default ?? mod ?? [];
  } catch {
    seed = [];
  }

  const now = new Date().toISOString();
  const seeded: Product[] = (Array.isArray(seed) ? seed : []).map((p: any) => {
    const id = String(p?.id ?? crypto.randomUUID());
    return {
      id,
      name: p?.name ?? p?.title ?? "",
      sku: p?.sku ?? "",
      makerCode: p?.makerCode ?? "",
      price: typeof p?.price === "number" ? p.price : 0,
      onHand: typeof p?.onHand === "number" ? p.onHand : 0,
      thumbnail: p?.thumbnail ?? p?.imageUrl ?? "",
      imageUrl: p?.imageUrl ?? p?.thumbnail ?? "",
      description: p?.description ?? p?.desc ?? "",
      createdAt: p?.createdAt ?? now,
      updatedAt: p?.updatedAt ?? now,
    };
  });

  await fs.writeFile(DB_FILE, JSON.stringify(seeded, null, 2), "utf8");
}

async function readAll(): Promise<Product[]> {
  await ensureDbFile();
  const raw = await fs.readFile(DB_FILE, "utf8");
  const rows = JSON.parse(raw || "[]");
  return Array.isArray(rows) ? rows : [];
}

async function writeAll(rows: Product[]) {
  await fs.writeFile(DB_FILE, JSON.stringify(rows, null, 2), "utf8");
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();

    const rows = await readAll();

    const filtered = !q
      ? rows
      : rows.filter((p) => {
          const name = String(p.name ?? p.title ?? "").toLowerCase();
          const sku = String(p.sku ?? "").toLowerCase();
          const maker = String(p.makerCode ?? "").toLowerCase();
          return name.includes(q) || sku.includes(q) || maker.includes(q);
        });

    return NextResponse.json(filtered);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, message: e?.message || "failed to load products" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json({ ok: false, message: "admin only" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const item: Product = {
      id,
      name: String(body?.name ?? body?.title ?? "").trim(),
      sku: String(body?.sku ?? "").trim(),
      makerCode: String(body?.makerCode ?? "").trim(),
      price: Number(body?.price ?? 0),
      onHand: Number(body?.onHand ?? 0),
      thumbnail: String(body?.thumbnail ?? body?.imageUrl ?? "").trim(),
      imageUrl: String(body?.imageUrl ?? body?.thumbnail ?? "").trim(),
      description: String(body?.description ?? body?.desc ?? "").trim(),
      createdAt: now,
      updatedAt: now,
    };

    if (!item.name) {
      return NextResponse.json({ ok: false, message: "name is required" }, { status: 400 });
    }

    const rows = await readAll();

    // SKU unique (optional but helpful)
    if (item.sku) {
      const dup = rows.find((p) => String(p.sku || "").trim() === item.sku);
      if (dup) {
        return NextResponse.json(
          { ok: false, message: `duplicate sku: ${item.sku}` },
          { status: 409 }
        );
      }
    }

    rows.unshift(item);
    await writeAll(rows);

    return NextResponse.json({ ok: true, item });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, message: e?.message || "failed to create product" },
      { status: 500 }
    );
  }
}
