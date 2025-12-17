import React, { useEffect, useMemo, useState } from "react";
import { getApiBase } from "../lib/api";
import { useToasts } from "../lib/toasts.jsx";
import { inputStyle, primaryBtn } from "../ui/styles";
import { Th, Td } from "../components/TableParts";

export default function InventoryPage() {
  const apiBase = getApiBase();
  const { push, ToastHost } = useToasts();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase}/inventory`);
      const data = await r.json();

      // ✅ 서버가 배열로 내려줌. 혹시 다른 형태도 대비.
      const list =
        Array.isArray(data) ? data :
        Array.isArray(data?.items) ? data.items :
        Array.isArray(data?.rows) ? data.rows :
        [];

      setRows(list);
    } catch (e) {
      push({ kind: "error", title: "재고 로드 실패", message: e?.message || String(e) });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  const filtered = useMemo(() => {
    const s = (q || "").trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const hay = [
        r.skuCode,
        r.skuName,
        r.makerCode,
        r.locationCode,
        r.storeId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [rows, q]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <ToastHost />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 900 }}>창고 재고</div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="검색: skuCode / 상품명 / 바코드 / 로케이션"
            style={{ ...inputStyle, minWidth: 320 }}
          />
          <button type="button" style={primaryBtn} onClick={load} disabled={loading}>
            새로고침
          </button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#94a3b8" }}>
        API: <b>{apiBase}</b> / rows: <b>{filtered.length}</b>
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "auto", background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
          <thead style={{ background: "#f8fafc" }}>
            <tr>
              <Th>Location</Th>
              <Th>SKU</Th>
              <Th>MakerCode</Th>
              <Th>상품명</Th>
              <Th style={{ textAlign: "right" }}>OnHand</Th>
              <Th>LastTx</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={`${r.skuId}-${r.locationId}-${r.storeId}`}>
                <Td style={{ fontFamily: "Consolas, monospace" }}>{r.locationCode || "-"}</Td>
                <Td style={{ fontFamily: "Consolas, monospace" }}>{r.skuCode || "-"}</Td>
                <Td style={{ fontFamily: "Consolas, monospace" }}>{r.makerCode || "-"}</Td>
                <Td>{r.skuName || "-"}</Td>
                <Td style={{ textAlign: "right", fontWeight: 900 }}>{Number(r.onHand ?? 0)}</Td>
                <Td style={{ fontFamily: "Consolas, monospace", fontSize: 12, color: "#64748b" }}>
                  {r.lastTxAt ? new Date(r.lastTxAt).toLocaleString() : "-"}
                </Td>
              </tr>
            ))}

            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 14, textAlign: "center", color: "#94a3b8" }}>
                  재고 데이터가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
