import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Next.js 15 타입 생성(.next/types)에서 dynamic segment params를 Promise로 취급하는 케이스가 있어
// 빌드 타입 에러를 피하기 위해 params를 Promise<{id:string}>로 선언한다.
type RouteCtx = { params: Promise<{ id: string }> };

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

// --- helpers ---
function norm(v: any) {
  return String(v ?? "").trim();
}

function asStatus(v: any): OrderStatus | null {
  const s = norm(v) as any;
  if (s === "requested" || s === "confirmed" || s === "shipped" || s === "done") return s;
  return null;
}

function getRole(req: NextRequest): "admin" | "customer" | "guest" {
  const role = norm(req.headers.get("x-role"));
  if (role === "admin") return "admin";
  if (role === "customer") return "customer";
  return "guest";
}

function isAdmin(req: NextRequest) {
  // 기존 로직 유지: header 기반 admin 판단
  return getRole(req) === "admin";
}

async function ensureDb() {
  try {
    await fs.access(DB_FILE);
  } catch {
    await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
    await fs.writeFile(DB_FILE, "[]", "utf-8");
  }
}

async function readAll(): Promise<Order[]> {
  await ensureDb();
  const raw = await fs.readFile(DB_FILE, "utf-8");
  const rows = JSON.parse(raw || "[]");
  return Array.isArray(rows) ? rows : [];
}

async function writeAll(rows: Order[]) {
  await ensureDb();
  await fs.writeFile(DB_FILE, JSON.stringify(rows, null, 2), "utf-8");
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

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const orderId = norm(id);
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
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json({ ok: false, message: "admin only", role: getRole(req) }, { status: 403 });
    }

    const { id } = await ctx.params;
    const orderId = norm(id);
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
export async function PUT(req: NextRequest, ctx: RouteCtx) {
  return PATCH(req, ctx);
}

/**
 * ✅ 관리자 주문 삭제
 */
export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json({ ok: false, message: "admin only", role: getRole(req) }, { status: 403 });
    }

    const { id } = await ctx.params;
    const orderId = norm(id);
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
