"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Product = {
  id: string;
  name?: string;
  title?: string;
  price?: number;
  imageUrl?: string;
  thumbnail?: string;
  sku?: string;
  makerCode?: string;
  onHand?: number;
  desc?: string;
  description?: string;
};

export default function MallStoreHomePage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Product[]>([]);

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
        if (mounted) setItems(rows);
      } catch (e: any) {
        if (mounted) setErr(e?.message || "상품 목록을 불러오지 못했습니다.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    if (!keyword) return items;

    return items.filter((p) => {
      const name = (p.name || p.title || "").toLowerCase();
      const sku = (p.sku || "").toLowerCase();
      const maker = (p.makerCode || "").toLowerCase();
      return name.includes(keyword) || sku.includes(keyword) || maker.includes(keyword);
    });
  }, [items, q]);

  return (
    <main style={wrap}>
      <section style={top}>
        <div style={headlineRow}>
          <div>
            <h1 style={h1}>폐쇄몰 상품</h1>
            <p style={sub}>원하는 상품을 검색하고 상세 페이지에서 주문할 수 있어.</p>
          </div>

          <div style={stats}>
            <span style={pill}>총 {items.length}개</span>
            <span style={pillSoft}>표시 {filtered.length}개</span>
          </div>
        </div>

        <div style={searchRow}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="상품명 / SKU / 바코드(makerCode) 검색"
            style={search}
          />
          <button type="button" onClick={() => setQ("")} style={btnGhost}>
            초기화
          </button>
        </div>
      </section>

      {loading && (
        <section style={centerBox}>
          <div style={loadingCard}>불러오는 중…</div>
        </section>
      )}

      {!loading && err && (
        <section style={centerBox}>
          <div style={errorCard}>
            <div style={{ fontWeight: 950 }}>에러</div>
            <div style={{ marginTop: 6, opacity: 0.85 }}>{err}</div>
          </div>
        </section>
      )}

      {!loading && !err && (
        <section style={grid}>
          {filtered.map((p) => {
            const name = p.name || p.title || "상품";
            const price = typeof p.price === "number" ? p.price : undefined;
            const img = p.thumbnail || p.imageUrl;
            const onHand = typeof p.onHand === "number" ? p.onHand : undefined;

            return (
              <Link key={String(p.id)} href={`/mall/product/${p.id}`} style={cardLink}>
                <article style={card}>
                  <div style={thumb}>
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={name} style={imgStyle} />
                    ) : (
                      <div style={thumbFallback}>
                        <span style={{ fontWeight: 900, opacity: 0.6 }}>No Image</span>
                      </div>
                    )}
                  </div>

                  <div style={cardBody}>
                    <div style={nameRow}>
                      <div style={nameText}>{name}</div>
                    </div>

                    <div style={metaRow}>
                      {p.sku ? <span style={chip}>SKU {p.sku}</span> : <span style={chipSoft}>SKU -</span>}
                      {p.makerCode ? (
                        <span style={chip}>BAR {p.makerCode}</span>
                      ) : (
                        <span style={chipSoft}>BAR -</span>
                      )}
                    </div>

                    <div style={bottomRow}>
                      <div style={priceText}>
                        {price != null ? `${price.toLocaleString()}원` : "가격 협의"}
                      </div>
                      <div style={stockText}>
                        {onHand != null ? `재고 ${onHand.toLocaleString()}` : "재고 -"}
                      </div>
                    </div>
                  </div>
                </article>
              </Link>
            );
          })}
        </section>
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
  padding: "14px 4px 18px",
};

const headlineRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
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

const stats: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const pill: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.80)",
  color: "rgba(2,6,23,0.78)",
};

const pillSoft: React.CSSProperties = {
  ...pill,
  background: "rgba(2,6,23,0.04)",
};

const searchRow: React.CSSProperties = {
  marginTop: 14,
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
};

const search: React.CSSProperties = {
  flex: "1 1 360px",
  minWidth: 280,
  height: 42,
  padding: "0 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  fontSize: 14,
  outline: "none",
};

const btnGhost: React.CSSProperties = {
  height: 42,
  padding: "0 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(2,6,23,0.04)",
  fontWeight: 900,
  cursor: "pointer",
};

const centerBox: React.CSSProperties = {
  padding: "20px 0",
  display: "flex",
  justifyContent: "center",
};

const loadingCard: React.CSSProperties = {
  width: "100%",
  maxWidth: 520,
  padding: "16px 14px",
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.85)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  fontWeight: 900,
  opacity: 0.8,
};

const errorCard: React.CSSProperties = {
  width: "100%",
  maxWidth: 520,
  padding: "16px 14px",
  borderRadius: 16,
  border: "1px solid rgba(239,68,68,0.25)",
  background: "rgba(239,68,68,0.06)",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
  gap: 12,
};

const cardLink: React.CSSProperties = {
  textDecoration: "none",
  color: "inherit",
};

const card: React.CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.90)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  overflow: "hidden",
  transition: "transform 120ms ease",
};

const thumb: React.CSSProperties = {
  width: "100%",
  height: 170,
  background: "rgba(2,6,23,0.04)",
};

const imgStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const thumbFallback: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const cardBody: React.CSSProperties = {
  padding: "12px 12px 12px",
};

const nameRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
};

const nameText: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  letterSpacing: -0.2,
  lineHeight: 1.25,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const metaRow: React.CSSProperties = {
  marginTop: 10,
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const chip: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  padding: "5px 8px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.8)",
  color: "rgba(2,6,23,0.75)",
};

const chipSoft: React.CSSProperties = {
  ...chip,
  background: "rgba(2,6,23,0.04)",
};

const bottomRow: React.CSSProperties = {
  marginTop: 12,
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 10,
};

const priceText: React.CSSProperties = {
  fontWeight: 950,
  letterSpacing: -0.2,
};

const stockText: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  fontWeight: 850,
};
