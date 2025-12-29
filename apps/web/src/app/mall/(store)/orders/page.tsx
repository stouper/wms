"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type OrderStatus = "requested" | "confirmed" | "shipped" | "done";

type Order = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  memo?: string;
  items: Array<{
    productId: string;
    name: string;
    qty: number;
    price?: number;
  }>;
};

const statusLabel: Record<OrderStatus, string> = {
  requested: "요청",
  confirmed: "확인",
  shipped: "배송",
  done: "완료",
};

export default function MallStoreOrdersPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [items, setItems] = useState<Order[]>([]);

  const toast = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(""), 2200);
  };

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/orders", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);

      const rows: Order[] = Array.isArray(data) ? data : data?.items ?? [];
      setItems(rows);
    } catch (e: any) {
      setErr(e?.message || "주문 내역을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const sumQty = (o: Order) => o.items.reduce((a, it) => a + (Number(it.qty) || 0), 0);
  const sumPrice = (o: Order) =>
    o.items.reduce((a, it) => a + (typeof it.price === "number" ? it.price * (Number(it.qty) || 0) : 0), 0);

  const stats = useMemo(() => {
    const by: Record<OrderStatus, number> = { requested: 0, confirmed: 0, shipped: 0, done: 0 };
    for (const o of items) by[o.status] += 1;
    return { total: items.length, by };
  }, [items]);

  return (
    <main style={wrap}>
      <section style={top}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h1 style={h1}>주문 내역</h1>
            <p style={sub}>내 세션 주문만 보여. (서버 저장)</p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={load} style={btnGhost} disabled={busy || loading}>
              새로고침
            </button>
            <Link href="/mall" style={btnGhostLink}>
              ← 쇼핑 계속
            </Link>
          </div>
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={pill}>총 {stats.total}건</div>
          <div style={pillSoft}>
            요청 {stats.by.requested} / 확인 {stats.by.confirmed} / 배송 {stats.by.shipped} / 완료 {stats.by.done}
          </div>
        </div>
      </section>

      {!!msg && <div style={toastBox}>{msg}</div>}

      {loading && <div style={loadingCard}>불러오는 중…</div>}

      {!loading && err && (
        <div style={errorCard}>
          <div style={{ fontWeight: 950 }}>에러</div>
          <div style={{ marginTop: 6, opacity: 0.85 }}>{err}</div>
        </div>
      )}

      {!loading && !err && items.length === 0 && (
        <div style={emptyCard}>
          <div style={{ fontWeight: 950 }}>주문이 없어</div>
          <div style={{ marginTop: 8, opacity: 0.72, lineHeight: 1.6 }}>
            상품 상세에서 “주문하기”를 눌러 주문을 생성해줘.
          </div>
          <Link href="/mall" style={btnPrimaryLink}>
            상품 보러가기
          </Link>
        </div>
      )}

      {!loading && !err && items.length > 0 && (
        <section style={list}>
          {items.map((o) => {
            const dt = new Date(o.createdAt);
            const created = isFinite(dt.getTime()) ? dt.toLocaleString() : o.createdAt;
            const qty = sumQty(o);
            const price = sumPrice(o);

            return (
              <article key={o.id} style={card}>
                <div style={row}>
                  <div>
                    <div style={idRow}>
                      <div style={id}>{o.id}</div>
                      <span style={statusPill(o.status)}>{statusLabel[o.status]}</span>
                    </div>
                    <div style={meta}>
                      {created} · 품목 {o.items.length}개 · 수량 {qty.toLocaleString()}
                      {price ? ` · 합계 ${price.toLocaleString()}원` : ""}
                    </div>
                  </div>
                </div>

                {!!o.memo && <div style={memo}>메모: {o.memo}</div>}

                <div style={itemsBox}>
                  {o.items.map((it, idx) => (
                    <div key={`${it.productId}-${idx}`} style={itemRow}>
                      <div style={{ fontWeight: 950 }}>{it.name}</div>
                      <div style={mono}>
                        {it.productId} · qty {it.qty}
                        {typeof it.price === "number" ? ` · ${it.price.toLocaleString()}원` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

/* ---------- styles ---------- */

const wrap: React.CSSProperties = { maxWidth: 1120, margin: "0 auto", padding: "18px 14px 40px" };
const top: React.CSSProperties = { padding: "10px 4px 16px" };

const h1: React.CSSProperties = { margin: 0, fontSize: 26, fontWeight: 950, letterSpacing: -0.7 };
const sub: React.CSSProperties = { margin: "8px 0 0", fontSize: 13, opacity: 0.68, lineHeight: 1.6 };

const pill: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.80)",
  color: "rgba(2,6,23,0.78)",
};
const pillSoft: React.CSSProperties = { ...pill, background: "rgba(2,6,23,0.04)" };

const btnBase: React.CSSProperties = {
  height: 42,
  padding: "0 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(2,6,23,0.04)",
  fontWeight: 950,
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = { ...btnBase };

const btnGhostLink: React.CSSProperties = {
  ...btnBase,
  display: "inline-flex",
  alignItems: "center",
  textDecoration: "none",
  color: "rgba(2,6,23,0.88)",
};

const btnPrimaryLink: React.CSSProperties = {
  marginTop: 12,
  height: 44,
  padding: "0 14px",
  borderRadius: 12,
  border: "none",
  color: "white",
  fontWeight: 950,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  background: "linear-gradient(90deg, #6366f1, #10b981)",
};

const loadingCard: React.CSSProperties = {
  padding: "16px 14px",
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.85)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  fontWeight: 900,
  opacity: 0.8,
};

const errorCard: React.CSSProperties = { padding: "16px 14px", borderRadius: 16, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.06)" };

const emptyCard: React.CSSProperties = {
  padding: "18px 16px",
  borderRadius: 18,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.85)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
};

const list: React.CSSProperties = { display: "grid", gap: 12 };

const card: React.CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.90)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  padding: 14,
};

const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 };
const idRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
const id: React.CSSProperties = { fontWeight: 950, letterSpacing: -0.2 };
const meta: React.CSSProperties = { marginTop: 6, fontSize: 12, opacity: 0.68, lineHeight: 1.6 };

const memo: React.CSSProperties = {
  marginTop: 10,
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(2,6,23,0.04)",
  fontSize: 13,
  opacity: 0.85,
};

const itemsBox: React.CSSProperties = { marginTop: 12, display: "grid", gap: 10 };
const itemRow: React.CSSProperties = { padding: "10px 12px", borderRadius: 14, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.9)" };

const mono: React.CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  opacity: 0.78,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
};

const toastBox: React.CSSProperties = {
  position: "fixed",
  right: 16,
  bottom: 16,
  zIndex: 1000,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.92)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.10)",
  fontWeight: 950,
};

const statusPill = (s: OrderStatus): React.CSSProperties => {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    height: 26,
    padding: "0 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 950,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(2,6,23,0.04)",
    opacity: 0.9,
  };
  if (s === "requested") return { ...base, background: "rgba(99,102,241,0.12)" };
  if (s === "confirmed") return { ...base, background: "rgba(16,185,129,0.12)" };
  if (s === "shipped") return { ...base, background: "rgba(245,158,11,0.14)" };
  return { ...base, background: "rgba(2,6,23,0.10)" };
};
