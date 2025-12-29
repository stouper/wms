"use client";

import { useEffect, useMemo, useState } from "react";

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
};

function pickName(p: Product) {
  return p.name || p.title || "";
}

export default function MallAdminProductsPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Product[]>([]);

  // edit drawer
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Product | null>(null);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/products", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);

      const rows: Product[] = Array.isArray(data) ? data : data?.items ?? data?.products ?? [];
      setItems(rows);
    } catch (e: any) {
      setErr(e?.message || "상품 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return items;
    return items.filter((p) => {
      const name = pickName(p).toLowerCase();
      const sku = (p.sku || "").toLowerCase();
      const bar = (p.makerCode || "").toLowerCase();
      return name.includes(kw) || sku.includes(kw) || bar.includes(kw);
    });
  }, [items, q]);

  const openNew = () => {
    setDraft({
      id: "",
      name: "",
      sku: "",
      makerCode: "",
      price: 0,
      onHand: 0,
      thumbnail: "",
      description: "",
    });
    setOpen(true);
    setMsg("");
  };

  const openEdit = (p: Product) => {
    setDraft({
      ...p,
      name: p.name ?? p.title ?? "",
      description: p.description ?? p.desc ?? "",
    });
    setOpen(true);
    setMsg("");
  };

  const close = () => {
    setOpen(false);
    setDraft(null);
  };

  const toast = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(""), 2200);
  };

  const save = async () => {
    if (!draft) return;

    setBusy(true);
    try {
      const isNew = !draft.id;

      const payload: any = {
        name: (draft.name || "").trim(),
        sku: (draft.sku || "").trim(),
        makerCode: (draft.makerCode || "").trim(),
        price: Number(draft.price ?? 0),
        onHand: Number(draft.onHand ?? 0),
        thumbnail: (draft.thumbnail || "").trim(),
        description: (draft.description || "").trim(),
      };

      const url = isNew ? "/api/products" : `/api/products/${encodeURIComponent(draft.id)}`;
      const method = isNew ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {}

      if (!res.ok) {
        throw new Error(data?.message || `${method} 실패`);
      }

      toast("저장 완료");
      close();
      await load();
    } catch (e: any) {
      toast(e?.message || "저장 실패");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: Product) => {
    if (!p?.id) return;

    const name = pickName(p) || "(이름없음)";
    const ok = confirm(`정말 삭제할까?\n\n- ${name}\n- SKU: ${p.sku || "-"}\n- BAR: ${p.makerCode || "-"}`);
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(p.id)}`, {
        method: "DELETE",
        credentials: "include",
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {}

      if (!res.ok) {
        throw new Error(data?.message || `DELETE 실패 (HTTP ${res.status})`);
      }

      toast("삭제 완료");
      // UX: 즉시 반영
      setItems((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e: any) {
      toast(e?.message || "삭제 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={wrap}>
      <section style={top}>
        <div style={headRow}>
          <div>
            <h1 style={h1}>상품관리</h1>
            <p style={sub}>검색/추가/수정/삭제 MVP.</p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={load} style={btnGhost} disabled={loading || busy}>
              새로고침
            </button>
            <button type="button" onClick={openNew} style={btnPrimary} disabled={loading || busy}>
              + 상품 추가
            </button>
          </div>
        </div>

        <div style={searchRow}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="상품명 / SKU / 바코드(makerCode) 검색"
            style={search}
          />
          <div style={pill}>총 {items.length}개</div>
          <div style={pillSoft}>표시 {filtered.length}개</div>
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

      {!loading && !err && (
        <section style={panel}>
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>이름</th>
                  <th style={th}>SKU</th>
                  <th style={th}>BAR</th>
                  <th style={{ ...th, textAlign: "right" }}>재고</th>
                  <th style={{ ...th, textAlign: "right" }}>가격</th>
                  <th style={{ ...th, width: 160, textAlign: "right" }}>액션</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td style={tdStrong}>{pickName(p) || "-"}</td>
                    <td style={tdMono}>{p.sku || "-"}</td>
                    <td style={tdMono}>{p.makerCode || "-"}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {typeof p.onHand === "number" ? p.onHand.toLocaleString() : "-"}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {typeof p.price === "number" ? `${p.price.toLocaleString()}원` : "-"}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 8 }}>
                        <button type="button" onClick={() => openEdit(p)} style={btnSmall} disabled={busy}>
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(p)}
                          style={btnDangerSmall}
                          disabled={busy}
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Drawer */}
      {open && (
        <div style={overlay} onMouseDown={close}>
          <div style={drawer} onMouseDown={(e) => e.stopPropagation()}>
            <div style={drawerHead}>
              <div style={{ fontWeight: 950 }}>{draft?.id ? "상품 수정" : "상품 추가"}</div>
              <button type="button" onClick={close} style={btnGhost}>
                닫기
              </button>
            </div>

            <div style={form}>
              <label style={label}>
                상품명
                <input
                  value={draft?.name || ""}
                  onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                  style={input}
                />
              </label>

              <div style={row2}>
                <label style={label}>
                  SKU
                  <input
                    value={draft?.sku || ""}
                    onChange={(e) => setDraft((d) => (d ? { ...d, sku: e.target.value } : d))}
                    style={input}
                  />
                </label>
                <label style={label}>
                  BAR(makerCode)
                  <input
                    value={draft?.makerCode || ""}
                    onChange={(e) => setDraft((d) => (d ? { ...d, makerCode: e.target.value } : d))}
                    style={input}
                  />
                </label>
              </div>

              <div style={row2}>
                <label style={label}>
                  가격
                  <input
                    type="number"
                    value={Number(draft?.price || 0)}
                    onChange={(e) => setDraft((d) => (d ? { ...d, price: Number(e.target.value) } : d))}
                    style={input}
                  />
                </label>
                <label style={label}>
                  재고(onHand)
                  <input
                    type="number"
                    value={Number(draft?.onHand || 0)}
                    onChange={(e) => setDraft((d) => (d ? { ...d, onHand: Number(e.target.value) } : d))}
                    style={input}
                  />
                </label>
              </div>

              <label style={label}>
                썸네일 URL
                <input
                  value={draft?.thumbnail || ""}
                  onChange={(e) => setDraft((d) => (d ? { ...d, thumbnail: e.target.value } : d))}
                  style={input}
                />
              </label>

              <label style={label}>
                설명
                <textarea
                  value={draft?.description || ""}
                  onChange={(e) => setDraft((d) => (d ? { ...d, description: e.target.value } : d))}
                  style={textarea}
                />
              </label>
            </div>

            <div style={drawerFoot}>
              <button type="button" onClick={save} style={btnPrimary} disabled={busy}>
                {busy ? "저장 중…" : "저장"}
              </button>
              <button type="button" onClick={close} style={btnGhost} disabled={busy}>
                취소
              </button>
            </div>

            <div style={hint}>
              * 삭제는 테이블의 “삭제” 버튼을 사용해줘. (PUT/POST/DELETE는 admin만 가능)
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ---------- styles ---------- */

const wrap: React.CSSProperties = { maxWidth: 1120, margin: "0 auto", padding: "18px 14px 40px" };

const top: React.CSSProperties = { padding: "10px 4px 16px" };

const headRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: 12,
  flexWrap: "wrap",
};

const h1: React.CSSProperties = { margin: 0, fontSize: 26, fontWeight: 950, letterSpacing: -0.7 };

const sub: React.CSSProperties = { margin: "8px 0 0", fontSize: 13, opacity: 0.68, lineHeight: 1.6 };

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

const panel: React.CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.90)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  overflow: "hidden",
};

const tableWrap: React.CSSProperties = { overflowX: "auto" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const th: React.CSSProperties = { textAlign: "left", fontSize: 12, fontWeight: 950, padding: "10px 12px", opacity: 0.7 };
const td: React.CSSProperties = { padding: "10px 12px", borderTop: "1px solid rgba(0,0,0,0.06)", fontSize: 13 };
const tdStrong: React.CSSProperties = { ...td, fontWeight: 950 };
const tdMono: React.CSSProperties = {
  ...td,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  fontSize: 12,
  opacity: 0.85,
};

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

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  border: "none",
  color: "white",
  background: "linear-gradient(90deg, #6366f1, #10b981)",
};

const btnSmall: React.CSSProperties = {
  height: 34,
  padding: "0 10px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(2,6,23,0.04)",
  fontWeight: 950,
  cursor: "pointer",
};

const btnDangerSmall: React.CSSProperties = {
  height: 34,
  padding: "0 10px",
  borderRadius: 10,
  border: "1px solid rgba(239,68,68,0.35)",
  background: "rgba(239,68,68,0.10)",
  fontWeight: 950,
  cursor: "pointer",
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

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2,6,23,0.45)",
  zIndex: 999,
  display: "flex",
  justifyContent: "flex-end",
};

const drawer: React.CSSProperties = {
  width: "min(560px, 92vw)",
  height: "100%",
  background: "rgba(255,255,255,0.98)",
  borderLeft: "1px solid rgba(0,0,0,0.10)",
  padding: 14,
  display: "flex",
  flexDirection: "column",
};

const drawerHead: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 };

const form: React.CSSProperties = { marginTop: 12, display: "grid", gap: 10, overflow: "auto", paddingBottom: 10 };

const row2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };

const label: React.CSSProperties = { display: "grid", gap: 6, fontSize: 12, fontWeight: 950, opacity: 0.75 };

const input: React.CSSProperties = {
  height: 40,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  padding: "0 10px",
  fontSize: 13,
};

const textarea: React.CSSProperties = {
  minHeight: 120,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  padding: "10px 10px",
  fontSize: 13,
  resize: "vertical",
};

const drawerFoot: React.CSSProperties = { display: "flex", gap: 10, paddingTop: 10 };

const hint: React.CSSProperties = { marginTop: 10, fontSize: 12, opacity: 0.6, lineHeight: 1.5 };
