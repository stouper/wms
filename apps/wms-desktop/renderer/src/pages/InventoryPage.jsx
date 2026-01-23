// renderer/src/pages/InventoryPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useToasts } from "../lib/toasts.jsx";
import { inputStyle, primaryBtn } from "../ui/styles";

import { inventoryFlow } from "../workflows/inventory/inventory.workflow";
import { loadStores, getStoresCache } from "../workflows/_common/storeMap";
import { http } from "../workflows/_common/http";

// 시스템 Location (상단 고정)
const SYSTEM_LOCATIONS = ["RET-01", "UNASSIGNED", "DEFECT", "HOLD"];

export default function InventoryPage() {
  const { push, ToastHost } = useToasts();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [hqStoreId, setHqStoreId] = useState(null);
  const [systemLocations, setSystemLocations] = useState([]); // 설정에서 만든 Location 목록

  // Location 필터
  const [selectedLocation, setSelectedLocation] = useState("");

  // 상단 검색
  const [q, setQ] = useState("");

  // 빠른 필터
  const [hideZero, setHideZero] = useState(false);

  // 정렬
  const [sortKey, setSortKey] = useState("LOC");
  const [sortDir, setSortDir] = useState("ASC");

  // Location 자연정렬
  function parseLocKey(code) {
    const s = String(code || "").trim();
    const m = s.match(/^([A-Za-z]+)[-_ ]?(\d+)$/);
    if (!m) {
      return { kind: 1, prefix: s.toUpperCase(), num: Number.POSITIVE_INFINITY, raw: s.toUpperCase() };
    }
    return { kind: 0, prefix: m[1].toUpperCase(), num: Number(m[2]), raw: s.toUpperCase() };
  }

  function compareLocation(aCode, bCode) {
    const a = parseLocKey(aCode);
    const b = parseLocKey(bCode);
    if (a.kind !== b.kind) return a.kind - b.kind;
    const p = a.prefix.localeCompare(b.prefix);
    if (p !== 0) return p;
    if (a.num !== b.num) return a.num - b.num;
    return a.raw.localeCompare(b.raw);
  }

  // HQ 매장 ID 조회
  async function loadHqStore() {
    try {
      await loadStores();
      const stores = getStoresCache();
      const hq = stores.find((s) => s.isHq);
      if (hq) {
        setHqStoreId(hq.id);
        return hq.id;
      }
    } catch (e) {
      console.error("HQ 매장 조회 실패:", e);
    }
    return null;
  }

  // 시스템 Location 목록 조회
  async function loadSystemLocations() {
    try {
      const res = await http.get("/locations");
      const locs = res?.rows || [];
      // isSystem=true인 Location 코드 목록
      const systemLocs = locs.filter((l) => l.isSystem).map((l) => l.code);
      setSystemLocations(systemLocs);
    } catch (e) {
      console.error("Location 목록 조회 실패:", e);
      setSystemLocations(SYSTEM_LOCATIONS);
    }
  }

  async function load(storeId) {
    setLoading(true);
    try {
      const list = await inventoryFlow.loadSummary({ limit: 50000, storeId });
      setRows(list);
    } catch (e) {
      push({ kind: "error", title: "재고 로드 실패", message: e?.message || String(e) });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSystemLocations();
    loadHqStore().then((id) => {
      if (id) load(id);
    });
  }, []);

  const filtered = useMemo(() => {
    let out = rows;

    if (selectedLocation) {
      out = out.filter((r) => String(r.locationCode || "").toUpperCase() === selectedLocation.toUpperCase());
    }

    if (hideZero) {
      out = out.filter((r) => Number(r.onHand ?? 0) !== 0);
    }

    const s = (q || "").trim().toLowerCase();
    if (s) {
      out = out.filter((r) => {
        const hay = [r.locationCode, r.skuCode, r.makerCode, r.skuName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(s);
      });
    }

    const dir = sortDir === "DESC" ? -1 : 1;

    out = [...out].sort((a, b) => {
      if (sortKey === "QTY") {
        return (Number(a.onHand ?? 0) - Number(b.onHand ?? 0)) * dir;
      }
      if (sortKey === "SKU") {
        return String(a.skuCode || "").localeCompare(String(b.skuCode || "")) * dir;
      }
      // LOC
      const c = compareLocation(a.locationCode, b.locationCode);
      if (c !== 0) return c * dir;
      return String(a.skuCode || "").localeCompare(String(b.skuCode || "")) * dir;
    });

    return out;
  }, [rows, selectedLocation, hideZero, q, sortKey, sortDir]);

  const sumOnHand = useMemo(() => {
    return filtered.reduce((acc, r) => acc + Number(r.onHand ?? 0), 0);
  }, [filtered]);

  // Location별 재고 요약
  const locationSummary = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const code = String(r.locationCode || "UNKNOWN").toUpperCase();
      if (!map.has(code)) {
        map.set(code, { code, qty: 0, skuCount: 0 });
      }
      const entry = map.get(code);
      entry.qty += Number(r.onHand ?? 0);
      entry.skuCount += 1;
    }

    const all = Array.from(map.values());

    // 시스템 Location을 상단에 고정
    const systemSet = new Set([...systemLocations, ...SYSTEM_LOCATIONS].map((c) => c.toUpperCase()));
    const systemLocs = all.filter((l) => systemSet.has(l.code));
    const normalLocs = all.filter((l) => !systemSet.has(l.code));

    // 시스템 Location은 정의된 순서대로, 나머지는 자연정렬
    const systemOrder = [...systemLocations, ...SYSTEM_LOCATIONS].map((c) => c.toUpperCase());
    systemLocs.sort((a, b) => {
      const ai = systemOrder.indexOf(a.code);
      const bi = systemOrder.indexOf(b.code);
      return ai - bi;
    });
    normalLocs.sort((a, b) => compareLocation(a.code, b.code));

    return [...systemLocs, ...normalLocs];
  }, [rows, systemLocations]);

  // 전체 합계
  const totalSummary = useMemo(() => {
    return locationSummary.reduce((acc, l) => ({ qty: acc.qty + l.qty, skuCount: acc.skuCount + l.skuCount }), { qty: 0, skuCount: 0 });
  }, [locationSummary]);

  function toggleSort(key) {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "ASC" ? "DESC" : "ASC"));
        return prev;
      }
      setSortDir("ASC");
      return key;
    });
  }

  function sortIcon(key) {
    if (sortKey !== key) return <span style={{ color: "#cbd5e1" }}>↕</span>;
    return sortDir === "ASC" ? <span>▲</span> : <span>▼</span>;
  }

  const thBase = { padding: "10px 12px", fontWeight: 800, fontSize: 12, color: "#64748b", whiteSpace: "nowrap" };
  const thClickable = { cursor: "pointer" };

  const isSystemLoc = (code) => {
    const upper = String(code).toUpperCase();
    return [...systemLocations, ...SYSTEM_LOCATIONS].map((c) => c.toUpperCase()).includes(upper);
  };

  const cardStyle = (active, isSystem) => ({
    padding: "10px 14px",
    borderRadius: 8,
    border: active ? "2px solid #3b82f6" : isSystem ? "1px solid #fbbf24" : "1px solid #e5e7eb",
    background: active ? "#dbeafe" : isSystem ? "#fffbeb" : "#fff",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  });

  return (
    <div style={{ display: "flex", gap: 16, height: "100%" }}>
      <ToastHost />

      {/* 왼쪽: Location 카드 목록 */}
      <div
        style={{
          width: 200,
          minWidth: 200,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          background: "#f8fafc",
          borderRadius: 12,
          padding: 12,
          border: "1px solid #e5e7eb",
          overflowY: "auto",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 13, color: "#64748b", marginBottom: 4 }}>Location</div>

        {/* 전체 버튼 */}
        <button
          type="button"
          onClick={() => setSelectedLocation("")}
          style={cardStyle(!selectedLocation, false)}
        >
          <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>전체</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>
            {totalSummary.skuCount.toLocaleString()}건 | <b style={{ color: "#0ea5e9" }}>{totalSummary.qty.toLocaleString()}</b>개
          </div>
        </button>

        {/* Location별 카드 */}
        {locationSummary.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => setSelectedLocation(selectedLocation === l.code ? "" : l.code)}
            style={cardStyle(selectedLocation === l.code, isSystemLoc(l.code))}
          >
            <div style={{ fontWeight: 700, fontSize: 13, color: isSystemLoc(l.code) ? "#92400e" : "#0f172a" }}>
              {l.code}
              {isSystemLoc(l.code) && <span style={{ fontSize: 10, marginLeft: 4, color: "#d97706" }}>시스템</span>}
            </div>
            <div style={{ fontSize: 11, color: "#64748b" }}>
              {l.skuCount.toLocaleString()}건 | <b style={{ color: "#0ea5e9" }}>{l.qty.toLocaleString()}</b>개
            </div>
          </button>
        ))}

        {locationSummary.length === 0 && !loading && (
          <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: 10 }}>
            Location이 없습니다
          </div>
        )}
      </div>

      {/* 오른쪽: 테이블 */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>창고 재고</div>
            <div style={{ padding: "5px 10px", borderRadius: 6, background: "#dbeafe", color: "#1e40af", fontWeight: 700, fontSize: 12 }}>
              본사 창고
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="검색 (SKU / MakerCode / 상품명)"
              style={{ ...inputStyle, minWidth: 280 }}
            />
            <button type="button" style={primaryBtn} onClick={() => load(hqStoreId)} disabled={loading || !hqStoreId}>
              {loading ? "로딩..." : "새로고침"}
            </button>
          </div>
        </div>

        {/* Controls */}
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: 10,
            background: "#fff",
            display: "flex",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {selectedLocation && (
              <div
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  background: isSystemLoc(selectedLocation) ? "#fef3c7" : "#dbeafe",
                  color: isSystemLoc(selectedLocation) ? "#92400e" : "#1e40af",
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                {selectedLocation}
              </div>
            )}
            <button
              type="button"
              onClick={() => setHideZero((v) => !v)}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: hideZero ? "#0ea5e9" : "#fff",
                color: hideZero ? "#fff" : "#0f172a",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              0 숨김
            </button>
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            rows: <b>{filtered.length.toLocaleString()}</b> | 합계: <b style={{ color: "#0ea5e9" }}>{sumOnHand.toLocaleString()}</b>
          </div>
        </div>

        {/* Table */}
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "auto", background: "#fff", flex: 1 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
              <tr>
                {!selectedLocation && (
                  <th style={{ ...thBase, ...thClickable, textAlign: "left", width: 120 }} onClick={() => toggleSort("LOC")}>
                    Location {sortIcon("LOC")}
                  </th>
                )}
                <th style={{ ...thBase, ...thClickable, textAlign: "left", width: 180 }} onClick={() => toggleSort("SKU")}>
                  SKU {sortIcon("SKU")}
                </th>
                <th style={{ ...thBase, textAlign: "left", width: 140 }}>MakerCode</th>
                <th style={{ ...thBase, textAlign: "left" }}>상품명</th>
                <th style={{ ...thBase, ...thClickable, textAlign: "right", width: 100 }} onClick={() => toggleSort("QTY")}>
                  OnHand {sortIcon("QTY")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, idx) => (
                <tr key={`${r.skuId}-${r.locationId}-${idx}`} style={{ borderTop: "1px solid #f1f5f9" }}>
                  {!selectedLocation && (
                    <td
                      style={{
                        padding: "8px 12px",
                        fontFamily: "Consolas, monospace",
                        fontWeight: 600,
                        color: isSystemLoc(r.locationCode) ? "#92400e" : "#0f172a",
                      }}
                    >
                      {r.locationCode || "-"}
                    </td>
                  )}
                  <td style={{ padding: "8px 12px", fontFamily: "Consolas, monospace" }}>{r.skuCode || "-"}</td>
                  <td style={{ padding: "8px 12px", fontFamily: "Consolas, monospace" }}>{r.makerCode || "-"}</td>
                  <td style={{ padding: "8px 12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.skuName}>
                    {r.skuName || "-"}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700 }}>{Number(r.onHand ?? 0).toLocaleString()}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={selectedLocation ? 4 : 5} style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>
                    {loading ? "로딩 중..." : "재고 데이터가 없습니다."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
