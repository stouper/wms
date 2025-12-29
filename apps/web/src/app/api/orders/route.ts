import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderStatus = "requested" | "confirmed" | "shipped" | "done";

type OrderItem = {
  productId: string;
  name: string;
  qty: number;
  price?: number;
};

type Order = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;

  sessionKey: string;
  role: "admin" | "customer";

  memo?: string;
  items: OrderItem[];
};

const DB_FILE = path.join(process.cwd(), "src", "data", "orders.db.json");

function norm(v: any) {
  return String(v ?? "").trim();
}
function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function getRole(req: NextRequest) {
  const r = norm(req.cookies.get("wms_role")?.value);
  return (r === "admin" ? "admin" : "customer") as "admin" | "customer";
}

// MVP: 고객 세션키(없으면 공통 GUEST)
function getSessionKey(req: NextRequest) {
  const k = norm(req.cookies.get("wms_session")?.value);
  return k || "GUEST";
}

async function ensureDbFile() {
  try {
    await fs.access(DB_FILE);
  } catch {
    await fs.writeFile(DB_FILE, "[]", "utf8");
  }
}

async function readAll(): Promise<Order[]> {
  await ensureDbFile();
  const raw = await fs.readFile(DB_FILE, "utf8").catch(() => "[]");
  const rows = JSON.parse(raw || "[]");
  return Array.isArray(rows) ? rows : [];
}

async function writeAll(rows: Order[]) {
  await fs.writeFile(DB_FILE, JSON.stringify(rows, null, 2), "utf8");
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = norm(url.searchParams.get("q"));
    const status = norm(url.searchParams.get("status"));

    const role = getRole(req);
    const sessionKey = getSessionKey(req);

    const rows = await readAll();

    // ✅ 역할별 필터 (MVP)
    // admin: 전체
    // customer: sessionKey 같은 것만
    let filtered = rows;
    if (role !== "admin") {
      filtered = rows.filter((o) => o.role === "customer" && o.sessionKey === sessionKey);
    }

    if (status) {
      filtered = filtered.filter((o) => o.status === status);
    }

    if (q) {
      const kw = q.toLowerCase();
      filtered = filtered.filter((o) => {
        const hay = [
          o.id,
          o.memo || "",
          ...o.items.map((it) => `${it.productId} ${it.name}`),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(kw);
      });
    }

    return NextResponse.json(filtered);
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message || "failed to list orders" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const role = getRole(req);
    const sessionKey = getSessionKey(req);

    const body = await req.json().catch(() => ({}));

    const memo = norm(body?.memo) || undefined;
    const rawItems = Array.isArray(body?.items) ? body.items : [];

    if (!rawItems.length) {
      return NextResponse.json({ ok: false, message: "items is required (productId/name/qty)" }, { status: 400 });
    }

    const items: OrderItem[] = [];
    for (const it of rawItems) {
      const productId = norm(it?.productId);
      const name = norm(it?.name);
      const qty = num(it?.qty);
      const price = it?.price != null ? num(it.price) : NaN;

      if (!productId || !name || !Number.isFinite(qty) || qty <= 0) {
        return NextResponse.json(
          { ok: false, message: "items is required (productId/name/qty)" },
          { status: 400 }
        );
      }

      items.push({
        productId,
        name,
        qty,
        price: Number.isFinite(price) ? price : undefined,
      });
    }

    const now = new Date().toISOString();
    const order: Order = {
      id: `O-${crypto.randomUUID()}`,
      createdAt: now,
      updatedAt: now,
      status: "requested",
      role,
      sessionKey,
      memo,
      items,
    };

    const db = await readAll();
    const next = [order, ...db];
    await writeAll(next);

    return NextResponse.json({ ok: true, item: order });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message || "failed to create order" }, { status: 500 });
  }
}
