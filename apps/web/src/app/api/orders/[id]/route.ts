import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

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

async function readAll(): Promise<Order[]> {
  await ensureDbFile();
  const raw = await fs.readFile(DB_FILE, "utf8").catch(() => "[]");
  const rows = JSON.parse(raw || "[]");
  return Array.isArray(rows) ? rows : [];
}

async function writeAll(rows: Order[]) {
  await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(rows, null, 2), "utf8");
}

function asStatus(v: any): OrderStatus | null {
  const s = norm(v);
  if (s === "requested" || s === "confirmed" || s === "shipped" || s === "done") return s;
  return null;
}

async function updateStatus(orderId: string, nextStatus: OrderStatus) {
  const rows = await readAll();
  const idx = rows.findIndex((o) => String(o.id) === orderId);
  if (idx < 0) return null;

  const now = new Date().toISOString();
  const updated: Order = { ...rows[idx], status: nextStatus, updatedAt: now };
  rows[idx] = updated;
  await writeAll(rows);
  return updated;
}

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const orderId = norm(ctx?.params?.id);
    if (!orderId) return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 });

    const rows = await readAll();
    const item = rows.find((o) => String(o.id) === orderId);
    if (!item) return NextResponse.json({ ok: false, message: "not found" }, { status: 404 });

    return NextResponse.json({ ok: true, item });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message || "failed to get order" }, { status: 500 });
  }
}

/**
 * ✅ 관리자 주문 상태 변경 (프론트가 PATCH를 쓰고 있으니 PATCH를 "정답"으로 둠)
 */
export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json({ ok: false, message: "admin only", role: getRole(req) }, { status: 403 });
    }

    const orderId = norm(ctx?.params?.id);
    if (!orderId) return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const nextStatus = asStatus(body?.status);
    if (!nextStatus) {
      return NextResponse.json(
        { ok: false, message: 'status is required ("requested"|"confirmed"|"shipped"|"done")' },
        { status: 400 }
      );
    }

    const updated = await updateStatus(orderId, nextStatus);
    if (!updated) return NextResponse.json({ ok: false, message: "not found" }, { status: 404 });

    return NextResponse.json({ ok: true, item: updated });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message || "failed to update order" }, { status: 500 });
  }
}

/**
 * ✅ PUT도 같이 지원 (혹시 다른 화면/코드가 PUT을 쏠 수 있어서 안전망)
 */
export async function PUT(req: NextRequest, ctx: { params: { id: string } }) {
  return PATCH(req, ctx);
}

/**
 * ✅ 관리자 주문 삭제
 */
export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json({ ok: false, message: "admin only", role: getRole(req) }, { status: 403 });
    }

    const orderId = norm(ctx?.params?.id);
    if (!orderId) return NextResponse.json({ ok: false, message: "id is required" }, { status: 400 });

    const rows = await readAll();
    const before = rows.length;
    const next = rows.filter((o) => String(o.id) !== orderId);

    if (next.length === before) return NextResponse.json({ ok: false, message: "not found" }, { status: 404 });

    await writeAll(next);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message || "failed to delete order" }, { status: 500 });
  }
}
