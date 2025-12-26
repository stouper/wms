import React, { useEffect, useMemo, useState } from "react";
import { getApiBase } from "../workflows/_common/api";
import { useToasts } from "../lib/toasts.jsx";
import { inputStyle, primaryBtn } from "../ui/styles";
import { Th, Td } from "../components/TableParts";

export default function InventoryPage() {
  const apiBase = getApiBase();
  const { push, ToastHost } = useToasts();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");

  // ✅ HQ 업로드 상태
  const [hqFile, setHqFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase}/inventory/summary`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();

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

  async function uploadHqInventory() {
    if (!hqFile) {
      push({ kind: "error", title: "파일 없음", message: "업로드할 HQ 재고 엑셀을 선택해줘." });
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", hqFile); // ✅ 백엔드 FileInterceptor('file') 기준

      const r = await fetch(`${apiBase}/imports/hq-inventory`, {
        method: "POST",
        body: form,
      });

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(`HTTP ${r.status} ${t}`);
      }

      await r.json().catch(() => null);

      push({ kind: "success", title: "업로드 완료", message: "HQ 재고 업로드가 완료됐어. 재고 새로고침할게." });

      // 파일 초기화 + 재고 리로드
      setHqFile(null);
      await load();
    } catch (e) {
      push({ kind: "error", title: "업로드 실패", message: e?.message || String(e) });
    } finally {
      setUploading(false);
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
      const hay = [r.skuCode, r.skuName, r.makerCode, r.locationCode, r.storeId]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [rows, q]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <ToastHost />

      {/* Header */}
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

      {/* API info */}
      <div style={{ fontSize: 12, color: "#94a3b8" }}>
        API: <b>{apiBase}</b> / rows: <b>{filtered.length}</b>
      </div>

      {/* ✅ HQ 업로드 (창고재고 화면 안) */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 12,
          background: "#fff",
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontWeight: 800 }}>HQ 재고 업로드</div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            엑셀 선택 → 업로드 → 자동 새로고침 (POST /imports/hq-inventory)
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setHqFile(e.target.files?.[0] || null)}
            disabled={uploading}
            style={{ ...inputStyle, padding: 8 }}
          />

          <button
            type="button"
            style={primaryBtn}
            onClick={uploadHqInventory}
            disabled={uploading || !hqFile}
            title={!hqFile ? "먼저 엑셀 파일을 선택해줘" : ""}
          >
            {uploading ? "업로드중..." : "업로드"}
          </button>
        </div>
      </div>

      {/* Table */}
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
