"use client";

import { useEffect, useMemo, useState } from "react";

type OrderStatus = "requested" | "confirmed" | "shipped" | "done";

type Order = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  memo?: string;
  role: "admin" | "customer";
  sessionKey: string;
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

async function readJsonOrText(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const data = await res.json().catch(() => ({}));
    return { kind: "json" as const, data };
  }
  const text = await res.text().catch(() => "");
  return { kind: "text" as const, text };
}

export default function MallAdminOrdersPage() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // ✅ 에러 분리: 업로드용 / 목록용
  const [errUpload, setErrUpload] = useState("");
  const [errList, setErrList] = useState("");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [items, setItems] = useState<Order[]>([]);
  const [loaded, setLoaded] = useState(false);

  // ✅ 권한 표시
  const [roleInfo, setRoleInfo] = useState<{ role: string; isAdmin: boolean } | null>(null);

  const toast = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(""), 2200);
  };

  const loadRole = async () => {
    try {
      const res = await fetch("/api/imports/orders", { credentials: "include" });
      const parsed = await readJsonOrText(res);
      if (parsed.kind === "json") {
        setRoleInfo({ role: String(parsed.data?.role || ""), isAdmin: Boolean(parsed.data?.isAdmin) });
      } else {
        setRoleInfo({ role: "", isAdmin: false });
      }
    } catch {
      setRoleInfo({ role: "", isAdmin: false });
    }
  };

  const load = async () => {
    setErrList("");
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);

      const res = await fetch(`/api/orders?${params.toString()}`, { credentials: "include" });
      const parsed = await readJsonOrText(res);

      if (!res.ok) {
        if (parsed.kind === "json") throw new Error(parsed.data?.message || `HTTP ${res.status}`);
        throw new Error(`HTTP ${res.status} (JSON 아님)\n${(parsed.text || "").slice(0, 400)}`);
      }

      const data = parsed.kind === "json" ? parsed.data : {};
      const rows: Order[] = Array.isArray(data) ? data : data?.items ?? [];
      setItems(rows);
      setLoaded(true);
    } catch (e: any) {
      // ✅ 목록 에러는 목록에만 표시
      setErrList(e?.message || "주문 목록을 불러오지 못했습니다.");
      setLoaded(true);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadRole();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => items, [items]);

  const summary = useMemo(() => {
    const total = filtered.length;
    const by: Record<OrderStatus, number> = { requested: 0, confirmed: 0, shipped: 0, done: 0 };
    for (const o of filtered) by[o.status] += 1;
    return { total, by };
  }, [filtered]);

  const sumQty = (o: Order) => o.items.reduce((a, it) => a + (Number(it.qty) || 0), 0);
  const sumPrice = (o: Order) =>
    o.items.reduce((a, it) => a + (typeof it.price === "number" ? it.price * (Number(it.qty) || 0) : 0), 0);

  const onUpload = async (file: File | null) => {
    if (!file) return;

    setBusy(true);
    setErrUpload("");
    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/imports/orders", {
        method: "POST",
        body: fd,
        credentials: "include",
      });

      const parsed = await readJsonOrText(res);

      if (!res.ok) {
        if (parsed.kind === "json") {
          const role = String(parsed.data?.role || "");
          if (res.status === 403) {
            throw new Error(`403 admin only (현재 role="${role || "없음"}")\n→ /mall/login에서 admin으로 로그인해줘`);
          }
          throw new Error(parsed.data?.message || `업로드 실패 (HTTP ${res.status})`);
        }
        throw new Error(`업로드 실패 (HTTP ${res.status}, JSON 아님)\n${(parsed.text || "").slice(0, 400)}`);
      }

      toast("업로드 완료");
      await loadRole();
      await load();
    } catch (e: any) {
      // ✅ 업로드 에러는 업로드에만 표시
      setErrUpload(e?.message || "업로드 실패");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (id: string, next: OrderStatus) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
        credentials: "include",
      });

      const parsed = await readJsonOrText(res);

      if (!res.ok) {
        if (parsed.kind === "json") throw new Error(parsed.data?.message || `상태 변경 실패 (HTTP ${res.status})`);
        throw new Error(`상태 변경 실패 (HTTP ${res.status}, JSON 아님)\n${(parsed.text || "").slice(0, 400)}`);
      }

      const data = parsed.kind === "json" ? parsed.data : {};
      toast("상태 변경 완료");
      setItems((prev) => prev.map((o) => (o.id === id ? data?.item ?? o : o)));
    } catch (e: any) {
      toast(e?.message || "상태 변경 실패");
    } finally {
      setBusy(false);
    }
  };

  const removeOrder = async (o: Order) => {
    const ok = confirm(`정말 주문을 삭제할까?\n\n- ${o.id}\n- ${statusLabel[o.status]}\n- 품목 ${o.items.length}개`);
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(o.id)}`, {
        method: "DELETE",
        credentials: "include",
      });

      const parsed = await readJsonOrText(res);

      if (!res.ok) {
        if (parsed.kind === "json") throw new Error(parsed.data?.message || `삭제 실패 (HTTP ${res.status})`);
        throw new Error(`삭제 실패 (HTTP ${res.status}, JSON 아님)\n${(parsed.text || "").slice(0, 400)}`);
      }

      toast("삭제 완료");
      setItems((prev) => prev.filter((x) => x.id !== o.id));
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
            <h1 style={h1}>주문관리</h1>
            <p style={sub}>서버 주문 목록 / 상태 변경 / 삭제 (admin 운영판)</p>

            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={pillSoft}>권한: role="{roleInfo?.role || ""}"</span>
              <span style={roleInfo?.isAdmin ? pillOk : pillWarn}>{roleInfo?.isAdmin ? "admin ✅" : "admin 아님 ⚠️"}</span>
              <button type="button" onClick={loadRole} style={btnGhostSmall} disabled={busy}>
                권한 새로고침
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                loadRole();
                load();
              }}
              style={btnGhost}
              disabled={busy}
            >
              새로고침
            </button>
          </div>
        </div>

        <div style={filters}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="주문ID / 메모 / 상품명 검색"
            style={search}
            disabled={busy}
          />
          <select
            value={status}
            onChange={(e) => setStatus((e.target.value as any) || "")}
            style={select}
            disabled={busy}
          >
            <option value="">상태 전체</option>
            <option value="requested">요청</option>
            <option value="confirmed">확인</option>
            <option value="shipped">배송</option>
            <option value="done">완료</option>
          </select>
          <button type="button" onClick={load} style={btnPrimary} disabled={busy}>
            조회
          </button>

          <div style={pill}>총 {summary.total}건</div>
          <div style={pillSoft}>
            요청 {summary.by.requested} / 확인 {summary.by.confirmed} / 배송 {summary.by.shipped} / 완료 {summary.by.done}
          </div>
        </div>
      </section>

      {!!msg && <div style={toastBox}>{msg}</div>}

      <section style={panel}>
        <div style={panelHead}>
          <div style={panelTitle}>주문 업로드</div>
          <div style={panelHint}>/api/imports/orders</div>
        </div>
        <div style={panelBody}>
          <input type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={(e) => onUpload(e.target.files?.[0] ?? null)} />

          {!!errUpload && (
            <div style={errorCard}>
              <div style={{ fontWeight: 950 }}>업로드 에러</div>
              <pre style={pre}>{errUpload}</pre>
            </div>
          )}
        </div>
      </section>

      <section style={listPanel}>
        <div style={panelHead}>
          <div style={panelTitle}>주문 목록</div>
          <div style={panelHint}>/api/orders</div>
        </div>

        {!loaded && <div style={loadingCard}>불러오는 중…</div>}

        {loaded && !!errList && (
          <div style={errorCardInList}>
            <div style={{ fontWeight: 950 }}>목록 에러</div>
            <pre style={pre}>{errList}</pre>
          </div>
        )}

        {loaded && !errList && filtered.length === 0 && (
          <div style={emptyCard}>
            <div style={{ fontWeight: 950 }}>주문이 없어</div>
            <div style={{ marginTop: 8, opacity: 0.72, lineHeight: 1.6 }}>
              customer에서 주문을 만들거나 업로드로 적재하면 여기에 보여.
            </div>
          </div>
        )}

        {loaded && !errList && filtered.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>주문ID</th>
                  <th style={th}>상태</th>
                  <th style={th}>생성</th>
                  <th style={th}>품목</th>
                  <th style={{ ...th, textAlign: "right" }}>수량</th>
                  <th style={{ ...th, textAlign: "right" }}>금액</th>
                  <th style={th}>메모</th>
                  <th style={{ ...th, textAlign: "right", width: 220 }}>액션</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const dt = new Date(o.createdAt);
                  const created = isFinite(dt.getTime()) ? dt.toLocaleString() : o.createdAt;
                  const qty = sumQty(o);
                  const price = sumPrice(o);

                  return (
                    <tr key={o.id}>
                      <td style={tdStrong}>{o.id}</td>
                      <td style={td}>
                        <span style={statusPill(o.status)}>{statusLabel[o.status]}</span>
                      </td>
                      <td style={td}>{created}</td>
                      <td style={td}>{o.items.length}개</td>
                      <td style={{ ...td, textAlign: "right" }}>{qty.toLocaleString()}</td>
                      <td style={{ ...td, textAlign: "right" }}>{price ? `${price.toLocaleString()}원` : "-"}</td>
                      <td style={td}>{o.memo || "-"}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <select
                            value={o.status}
                            onChange={(e) => changeStatus(o.id, e.target.value as OrderStatus)}
                            style={selectSmall}
                            disabled={busy}
                          >
                            <option value="requested">요청</option>
                            <option value="confirmed">확인</option>
                            <option value="shipped">배송</option>
                            <option value="done">완료</option>
                          </select>

                          <button type="button" onClick={() => removeOrder(o)} style={btnDangerSmall} disabled={busy}>
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
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

const filters: React.CSSProperties = { marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" };

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

const select: React.CSSProperties = {
  height: 42,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  padding: "0 10px",
  background: "rgba(255,255,255,0.9)",
  fontWeight: 900,
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
const btnGhostSmall: React.CSSProperties = { ...btnBase, height: 34, borderRadius: 10, padding: "0 10px", fontSize: 12 };

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  border: "none",
  color: "white",
  background: "linear-gradient(90deg, #6366f1, #10b981)",
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

const pillOk: React.CSSProperties = {
  ...pill,
  background: "rgba(16,185,129,0.14)",
  border: "1px solid rgba(16,185,129,0.30)",
};

const pillWarn: React.CSSProperties = {
  ...pill,
  background: "rgba(245,158,11,0.16)",
  border: "1px solid rgba(245,158,11,0.32)",
};

const panel: React.CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.90)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  overflow: "hidden",
  marginTop: 12,
};

const listPanel: React.CSSProperties = { ...panel, marginTop: 12 };

const panelHead: React.CSSProperties = {
  padding: "12px 14px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderBottom: "1px solid rgba(0,0,0,0.06)",
};

const panelTitle: React.CSSProperties = { fontWeight: 950, letterSpacing: -0.2 };
const panelHint: React.CSSProperties = { fontSize: 12, opacity: 0.65, fontWeight: 900 };

const panelBody: React.CSSProperties = { padding: 14 };

const errorCard: React.CSSProperties = {
  marginTop: 10,
  padding: "12px 12px",
  borderRadius: 14,
  border: "1px solid rgba(239,68,68,0.25)",
  background: "rgba(239,68,68,0.06)",
};

const errorCardInList: React.CSSProperties = {
  margin: 14,
  padding: "12px 12px",
  borderRadius: 14,
  border: "1px solid rgba(239,68,68,0.25)",
  background: "rgba(239,68,68,0.06)",
};

const pre: React.CSSProperties = {
  marginTop: 8,
  whiteSpace: "pre-wrap",
  fontSize: 12,
  opacity: 0.85,
  lineHeight: 1.5,
};

const loadingCard: React.CSSProperties = {
  padding: "16px 14px",
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.85)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  fontWeight: 900,
  opacity: 0.8,
  margin: 14,
};

const emptyCard: React.CSSProperties = {
  padding: "18px 16px",
  borderRadius: 18,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.85)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  margin: 14,
};

const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const th: React.CSSProperties = { textAlign: "left", fontSize: 12, fontWeight: 950, padding: "10px 12px", opacity: 0.7 };
const td: React.CSSProperties = { padding: "10px 12px", borderTop: "1px solid rgba(0,0,0,0.06)", fontSize: 13, verticalAlign: "top" };
const tdStrong: React.CSSProperties = { ...td, fontWeight: 950 };

const selectSmall: React.CSSProperties = {
  height: 34,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  padding: "0 8px",
  background: "rgba(255,255,255,0.9)",
  fontWeight: 900,
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
