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

  sessionKey: string; // IMPORT
  role: "admin" | "customer";

  memo?: string;
  items: OrderItem[];
};

const DB_FILE = path.join(process.cwd(), "src", "data", "orders.db.json");

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

function norm(v: any) {
  return String(v ?? "").trim();
}
function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** CSV 파서(간이) */
function parseCsv(text: string): Array<Record<string, any>> {
  const lines: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      const next = text[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (cur.length) lines.push(cur);
      cur = "";
      if (ch === "\r" && text[i + 1] === "\n") i++;
      continue;
    }
    cur += ch;
  }
  if (cur.length) lines.push(cur);

  if (lines.length === 0) return [];

  const splitRow = (row: string) => {
    const out: string[] = [];
    let s = "";
    let q = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        const next = row[i + 1];
        if (q && next === '"') {
          s += '"';
          i++;
        } else {
          q = !q;
        }
        continue;
      }
      if (!q && ch === ",") {
        out.push(s);
        s = "";
        continue;
      }
      s += ch;
    }
    out.push(s);
    return out.map((v) => v.trim());
  };

  const header = splitRow(lines[0]).map((h) => h.replace(/^\uFEFF/, ""));
  const rows: Array<Record<string, any>> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    if (cols.every((c) => !c)) continue;
    const obj: Record<string, any> = {};
    header.forEach((h, idx) => (obj[h] = cols[idx] ?? ""));
    rows.push(obj);
  }
  return rows;
}

async function parseFileToRows(file: File): Promise<{ rows: Array<Record<string, any>>; format: string }> {
  const name = (file.name || "").toLowerCase();

  if (name.endsWith(".csv")) {
    const text = await file.text();
    return { rows: parseCsv(text), format: "csv" };
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    let XLSX: any = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      XLSX = require("xlsx");
    } catch {
      throw new Error("xlsx 패키지가 없습니다. CSV로 업로드하거나 `npm i xlsx` 후 다시 시도해줘.");
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) return { rows: [], format: "xlsx" };

    const ws = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
    return { rows: (Array.isArray(json) ? (json as any[]) : []) as any, format: "xlsx" };
  }

  throw new Error("지원하지 않는 파일 형식입니다. .csv 또는 .xlsx/.xls를 사용해줘.");
}

function groupRowsToOrders(rows: Array<Record<string, any>>) {
  const now = new Date().toISOString();
  const map = new Map<string, Order>();
  let createdOrders = 0;
  let skippedRows = 0;

  for (const r of rows) {
    const orderIdRaw = norm(r.orderId || r.order_id || r.order || r.id);
    const statusRaw = norm(r.status || r.orderStatus || r.order_status || "requested");
    const memo = norm(r.memo || r.note || r.remarks || "") || undefined;

    const productId = norm(r.productId || r.product_id || r.sku || r.skuCode || r.product || "");
    const name = norm(r.name || r.productName || r.product_name || r.title || "");
    const qty = num(r.qty ?? r.quantity ?? r.count ?? 0);
    const price = r.price != null ? num(r.price) : NaN;

    if (!productId || !name || !Number.isFinite(qty) || qty <= 0) {
      skippedRows += 1;
      continue;
    }

    const status: OrderStatus =
      statusRaw === "confirmed" || statusRaw === "shipped" || statusRaw === "done"
        ? (statusRaw as OrderStatus)
        : "requested";

    const key = orderIdRaw || `IMPORT-${crypto.randomUUID()}`;

    let o = map.get(key);
    if (!o) {
      o = {
        id: orderIdRaw ? orderIdRaw : `O-${crypto.randomUUID()}`,
        createdAt: norm(r.createdAt || r.created_at) || now,
        updatedAt: now,
        status,
        sessionKey: "IMPORT",
        role: "admin",
        memo,
        items: [],
      };
      map.set(key, o);
      createdOrders += 1;
    }

    if (memo && !o.memo) o.memo = memo;

    o.items.push({
      productId,
      name,
      qty,
      price: Number.isFinite(price) ? price : undefined,
    });
  }

  return {
    orders: Array.from(map.values()),
    stats: { totalRows: rows.length, createdOrders, skippedRows },
  };
}

export async function GET(req: NextRequest) {
  const role = getRole(req);
  return NextResponse.json({
    ok: true,
    route: "/api/imports/orders",
    methods: ["GET", "POST"],
    role,
    isAdmin: role === "admin",
  });
}

export async function POST(req: NextRequest) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json({ ok: false, message: "admin only", role: getRole(req) }, { status: 403 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "file is required (form-data key: file)" }, { status: 400 });
    }

    const { rows, format } = await parseFileToRows(file);
    if (!rows.length) {
      return NextResponse.json({ ok: false, message: "파일에서 유효한 행을 찾지 못했습니다.", format }, { status: 400 });
    }

    const { orders, stats } = groupRowsToOrders(rows);
    if (!orders.length) {
      return NextResponse.json(
        { ok: false, message: "유효한 주문/아이템이 없습니다. (productId/name/qty 확인)", stats, format },
        { status: 400 }
      );
    }

    const db = await readAll();

    const existing = new Set(db.map((o) => o.id));
    for (const o of orders) {
      if (existing.has(o.id)) o.id = `O-${crypto.randomUUID()}`;
      existing.add(o.id);
    }

    const next = [...orders, ...db];
    await writeAll(next);

    return NextResponse.json({ ok: true, format, imported: orders.length, stats, sample: orders.slice(0, 2) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message || "failed to import orders" }, { status: 500 });
  }
}
