"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Product = {
  id: string;
  name?: string;
  title?: string;
  price?: number;
  sku?: string;
  makerCode?: string;
  onHand?: number;
};

export default function MallAdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setErr("");
      try {
        const res = await fetch("/api/products", { credentials: "include" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);

        const rows: Product[] = Array.isArray(data) ? data : data?.items ?? data?.products ?? [];
        if (mounted) setProducts(rows);
      } catch (e: any) {
        if (mounted) setErr(e?.message || "데이터를 불러오지 못했습니다.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const totalProducts = products.length;
  const totalOnHand = useMemo(
    () => products.reduce((acc, p) => acc + (typeof p.onHand === "number" ? p.onHand : 0), 0),
    [products]
  );

  return (
    <main style={wrap}>
      <section style={top}>
        <h1 style={h1}>관리자 대시보드</h1>
        <p style={sub}>상품/주문 운영을 빠르게 확인하고 관리해.</p>
      </section>

      {loading && <div style={loadingCard}>불러오는 중…</div>}

      {!loading && err && (
        <div style={errorCard}>
          <div style={{ fontWeight: 950 }}>에러</div>
          <div style={{ marginTop: 6, opacity: 0.85 }}>{err}</div>
        </div>
      )}

      {!loading && !err && (
        <>
          <section style={cards}>
            <div style={card}>
              <div style={cardLabel}>총 상품</div>
              <div style={cardValue}>{totalProducts.toLocaleString()}</div>
              <div style={cardHint}>/api/products 기준</div>
            </div>

            <div style={card}>
              <div style={cardLabel}>총 재고(OnHand)</div>
              <div style={cardValue}>{totalOnHand.toLocaleString()}</div>
              <div style={cardHint}>onHand 합산</div>
            </div>

            <div style={cardSoft}>
              <div style={cardLabel}>빠른 이동</div>
              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link href="/mall/admin/products" style={btnPrimaryLink}>
                  상품관리
                </Link>
                <Link href="/mall/admin/orders" style={btnGhostLink}>
                  주문관리
                </Link>
                <Link href="/mall" style={btnGhostLink}>
                  고객화면
                </Link>
              </div>
              <div style={cardHint}>MVP 운영 메뉴</div>
            </div>
          </section>

          <section style={panel}>
            <div style={panelHead}>
              <div style={panelTitle}>최근 상품 미리보기</div>
              <Link href="/mall/admin/products" style={miniLink}>
                전체 보기 →
              </Link>
            </div>

            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>이름</th>
                    <th style={th}>SKU</th>
                    <th style={th}>BAR</th>
                    <th style={{ ...th, textAlign: "right" }}>재고</th>
                    <th style={{ ...th, textAlign: "right" }}>가격</th>
                  </tr>
                </thead>
                <tbody>
                  {products.slice(0, 8).map((p) => (
                    <tr key={p.id}>
                      <td style={td}>{p.name || p.title || "-"}</td>
                      <td style={tdMono}>{p.sku || "-"}</td>
                      <td style={tdMono}>{p.makerCode || "-"}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {typeof p.onHand === "number" ? p.onHand.toLocaleString() : "-"}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {typeof p.price === "number" ? `${p.price.toLocaleString()}원` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

/* ---------- styles ---------- */

const wrap: React.CSSProperties = {
  maxWidth: 1120,
  margin: "0 auto",
  padding: "18px 14px 40px",
};

const top: React.CSSProperties = {
  padding: "10px 4px 16px",
};

const h1: React.CSSProperties = {
  margin: 0,
  fontSize: 26,
  fontWeight: 950,
  letterSpacing: -0.7,
};

const sub: React.CSSProperties = {
  margin: "8px 0 0",
  fontSize: 13,
  opacity: 0.68,
  lineHeight: 1.6,
};

const cards: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
};

const cardBase: React.CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.90)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  padding: "14px 14px",
};

const card: React.CSSProperties = { ...cardBase };

const cardSoft: React.CSSProperties = {
  ...cardBase,
  background: "linear-gradient(180deg, rgba(99,102,241,0.10), rgba(16,185,129,0.08))",
};

const cardLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 950,
  opacity: 0.72,
};

const cardValue: React.CSSProperties = {
  marginTop: 8,
  fontSize: 28,
  fontWeight: 950,
  letterSpacing: -0.8,
};

const cardHint: React.CSSProperties = {
  marginTop: 10,
  fontSize: 12,
  opacity: 0.62,
};

const btnPrimaryLink: React.CSSProperties = {
  height: 40,
  padding: "0 14px",
  borderRadius: 12,
  border: "none",
  fontWeight: 950,
  color: "white",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  background: "linear-gradient(90deg, #6366f1, #10b981)",
};

const btnGhostLink: React.CSSProperties = {
  height: 40,
  padding: "0 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(2,6,23,0.04)",
  fontWeight: 950,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  color: "rgba(2,6,23,0.88)",
};

const panel: React.CSSProperties = {
  marginTop: 14,
  borderRadius: 18,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.90)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  overflow: "hidden",
};

const panelHead: React.CSSProperties = {
  padding: "12px 14px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderBottom: "1px solid rgba(0,0,0,0.06)",
};

const panelTitle: React.CSSProperties = {
  fontWeight: 950,
  letterSpacing: -0.2,
};

const miniLink: React.CSSProperties = {
  textDecoration: "none",
  fontWeight: 900,
  color: "rgba(2,6,23,0.78)",
};

const tableWrap: React.CSSProperties = { overflowX: "auto" };

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  fontWeight: 950,
  padding: "10px 12px",
  opacity: 0.7,
};

const td: React.CSSProperties = {
  padding: "10px 12px",
  borderTop: "1px solid rgba(0,0,0,0.06)",
  fontSize: 13,
};

const tdMono: React.CSSProperties = {
  ...td,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  fontSize: 12,
  opacity: 0.85,
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

const errorCard: React.CSSProperties = {
  padding: "16px 14px",
  borderRadius: 16,
  border: "1px solid rgba(239,68,68,0.25)",
  background: "rgba(239,68,68,0.06)",
};
