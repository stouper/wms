"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Product = {
  id?: string;
  productId?: string;
  _id?: string;

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
};

function pickName(p: Product) {
  return p.name || p.title || "";
}

function pickProductId(p: Product, fallbackId: string) {
  const cand = String(p.id ?? p.productId ?? p._id ?? "").trim();
  return cand || fallbackId; // ✅ URL param id를 최종 fallback으로 사용
}

export default function MallStoreProductDetailPage() {
  const params = useParams();
  const router = useRouter();

  // ✅ URL의 [id]는 항상 존재하므로 주문 productId로도 사용
  const routeId = String((params as any)?.id || "").trim();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [p, setP] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [memo, setMemo] = useState("");

  const toast = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(""), 2200);
  };

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(routeId)}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.message || `HTTP ${res.status}`);

      // ✅ data가 { ok:true, product:{...} } 형태일 수도 있어서 안전하게
      const prod = (data as any)?.product ?? data;
      setP(prod as Product);
    } catch (e: any) {
      setErr(e?.message || "상품을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!routeId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  const name = useMemo(() => (p ? pickName(p) : ""), [p]);

  const priceText = useMemo(() => {
    if (!p) return "-";
    return typeof p.price === "number" ? `${p.price.toLocaleString()}원` : "-";
  }, [p]);

  const totalText = useMemo(() => {
    if (!p) return "-";
    if (typeof p.price !== "number") return "-";
    const n = Number(qty || 0);
    if (!Number.isFinite(n) || n <= 0) return "-";
    return `${(p.price * n).toLocaleString()}원`;
  }, [p, qty]);

  const placeOrder = async () => {
    if (!p) return;

    const n = Number(qty || 0);
    if (!Number.isFinite(n) || n <= 0) {
      toast("수량을 1 이상으로 입력해줘");
      return;
    }

    // ✅ productId를 URL param으로 강제 fallback
    const productId = pickProductId(p, routeId);
    if (!productId) {
      toast("상품 ID를 찾지 못했어. 새로고침 후 다시 시도해줘");
      return;
    }

    setBusy(true);
    setErr("");
    try {
      const body = {
        memo: memo.trim() || undefined,
        items: [
          {
            productId, // ✅ 절대 안 빠지게
            name: name || "(이름없음)",
            qty: n,
            price: typeof p.price === "number" ? p.price : undefined,
          },
        ],
      };

      // ✅ 디버그: 실제로 뭐 보내는지 확인 (Network Payload랑 동일)
      console.log("[ORDER DEBUG] payload =", body);

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.message || `주문 실패 (HTTP ${res.status})`);

      toast("주문 완료! 주문 목록으로 이동할게");
      router.push("/mall/orders");
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "주문을 생성하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={wrap}>
      <section style={top}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h1 style={h1}>상품 상세</h1>
            <p style={sub}>바로 주문(MVP). 주문은 서버에 저장돼.</p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/mall" style={btnGhostLink}>
              ← 목록
            </Link>
            <Link href="/mall/orders" style={btnGhostLink}>
              주문내역
            </Link>
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

      {!loading && !err && p && (
        <section style={grid}>
          <div style={card}>
            <div style={imgWrap}>
              {/* 이미지가 없어도 카드가 예쁘게 */}
              <div style={imgBg}>
                <div style={imgTitle}>{name || "상품"}</div>
                <div style={imgMeta}>
                  SKU: {p.sku || "-"} · BAR: {p.makerCode || "-"}
                </div>
              </div>
            </div>

            <div style={body}>
              <div style={titleRow}>
                <div style={title}>{name || "-"}</div>
                <div style={price}>{priceText}</div>
              </div>

              <div style={metaRow}>
                <span style={pill}>재고 {typeof p.onHand === "number" ? p.onHand.toLocaleString() : "-"}</span>
                <span style={pillSoft}>{p.sku || "SKU -"}</span>
                <span style={pillSoft}>{p.makerCode || "BAR -"}</span>
              </div>

              <div style={desc}>{(p.description || p.desc || "").trim() || "설명이 없습니다."}</div>
            </div>
          </div>

          <div style={cardSoft}>
            <div style={boxTitle}>주문하기</div>

            <label style={label}>
              수량
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                style={input}
                disabled={busy}
              />
            </label>

            <label style={label}>
              메모(선택)
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                style={input}
                placeholder="예: 빠른 출고 부탁"
                disabled={busy}
              />
            </label>

            <div style={sumRow}>
              <div style={{ fontWeight: 950, opacity: 0.75 }}>예상 합계</div>
              <div style={{ fontWeight: 950 }}>{totalText}</div>
            </div>

            <button type="button" onClick={placeOrder} style={btnPrimary} disabled={busy}>
              {busy ? "주문 생성 중…" : "주문하기"}
            </button>

            <div style={hint}>
              * 주문은 <b>/api/orders</b>로 생성되고, 주문내역에서 확인 가능해.
            </div>
          </div>
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

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.2fr 0.8fr",
  gap: 12,
  alignItems: "start",
};

const cardBase: React.CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.90)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  overflow: "hidden",
};

const card: React.CSSProperties = { ...cardBase };

const cardSoft: React.CSSProperties = {
  ...cardBase,
  padding: 14,
  background: "linear-gradient(180deg, rgba(99,102,241,0.10), rgba(16,185,129,0.08))",
};

const imgWrap: React.CSSProperties = { padding: 14 };
const imgBg: React.CSSProperties = {
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "linear-gradient(135deg, rgba(2,6,23,0.04), rgba(99,102,241,0.10), rgba(16,185,129,0.08))",
  height: 220,
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-end",
  padding: 14,
};
const imgTitle: React.CSSProperties = { fontWeight: 950, fontSize: 18, letterSpacing: -0.4 };
const imgMeta: React.CSSProperties = { marginTop: 6, fontSize: 12, opacity: 0.7 };
const body: React.CSSProperties = { padding: "0 14px 14px" };

const titleRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "baseline",
  flexWrap: "wrap",
};
const title: React.CSSProperties = { fontSize: 22, fontWeight: 950, letterSpacing: -0.6 };
const price: React.CSSProperties = { fontSize: 18, fontWeight: 950, opacity: 0.85 };

const metaRow: React.CSSProperties = { marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" };
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

const desc: React.CSSProperties = { marginTop: 12, fontSize: 13, opacity: 0.78, lineHeight: 1.7, whiteSpace: "pre-wrap" };

const boxTitle: React.CSSProperties = { fontWeight: 950, letterSpacing: -0.2, fontSize: 16 };
const label: React.CSSProperties = { marginTop: 12, display: "grid", gap: 6, fontSize: 12, fontWeight: 950, opacity: 0.75 };
const input: React.CSSProperties = { height: 40, borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)", padding: "0 10px", fontSize: 13 };

const sumRow: React.CSSProperties = { marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" };

const btnPrimary: React.CSSProperties = {
  marginTop: 12,
  height: 44,
  width: "100%",
  borderRadius: 12,
  border: "none",
  color: "white",
  fontWeight: 950,
  cursor: "pointer",
  background: "linear-gradient(90deg, #6366f1, #10b981)",
};

const hint: React.CSSProperties = { marginTop: 10, fontSize: 12, opacity: 0.62, lineHeight: 1.5 };

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
