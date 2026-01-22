// renderer/src/pages/StoreInventoryPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useToasts } from "../lib/toasts.jsx";
import { inputStyle, primaryBtn } from "../ui/styles";

import { inventoryFlow } from "../workflows/inventory/inventory.workflow";
import { loadStores, getStoresCache } from "../workflows/_common/storeMap";

export default function StoreInventoryPage() {
  const { push, ToastHost } = useToasts();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);

  // 매장 목록
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");

  // 상단 검색(전체 검색)
  const [q, setQ] = useState("");

  // 빠른 필터(토글)
  const [hideZero, setHideZero] = useState(false);

  // 정렬
  const [sortKey, setSortKey] = useState("LOC");
  const [sortDir, setSortDir] = useState("ASC");

  // Location 자연정렬
  function parseLocKey(code) {
    const s = String(code || "").trim();
    const m = s.match(/^([A-Za-z]+)[-_ ]?(\d+)$/);
    if (!m) {
      return {
        kind: 1,
        prefix: s.toUpperCase(),
        num: Number.POSITIVE_INFINITY,
        raw: s.toUpperCase(),
      };
    }
    return {
      kind: 0,
      prefix: m[1].toUpperCase(),
      num: Number(m[2]),
      raw: s.toUpperCase(),
    };
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

  // 매장 목록 로드
  async function loadStoreList() {
    try {
      await loadStores();
      const list = getStoresCache();
      // HQ 제외한 매장만
      const storeList = list.filter((s) => !s.isHq);
      setStores(storeList);
    } catch (e) {
      console.error("매장 목록 로드 실패:", e);
    }
  }

  // 재고 로드
  async function load() {
    if (!selectedStoreId) {
      setRows([]);
      return;
    }

    setLoading(true);
    try {
      const list = await inventoryFlow.loadSummary({ limit: 50000, storeId: selectedStoreId });
      setRows(list);
    } catch (e) {
      push({ kind: "error", title: "재고 로드 실패", message: e?.message || String(e) });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStoreList();
  }, []);

  useEffect(() => {
    if (selectedStoreId) {
      load();
    } else {
      setRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId]);

  const filtered = useMemo(() => {
    let out = rows;

    // 0 숨김
    if (hideZero) {
      out = out.filter((r) => Number(r.onHand ?? 0) !== 0);
    }

    // 전체 검색
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

    // 정렬
    const dir = sortDir === "DESC" ? -1 : 1;

    out = [...out].sort((a, b) => {
      if (sortKey === "QTY") {
        const av = Number(a.onHand ?? 0);
        const bv = Number(b.onHand ?? 0);
        return (av - bv) * dir;
      }
      if (sortKey === "SKU") {
        return String(a.skuCode || "").localeCompare(String(b.skuCode || "")) * dir;
      }
      // LOC: 자연정렬
      const c = compareLocation(a.locationCode, b.locationCode);
      if (c !== 0) return c * dir;
      return String(a.skuCode || "").localeCompare(String(b.skuCode || "")) * dir;
    });

    return out;
  }, [rows, hideZero, q, sortKey, sortDir]);

  // 현재 화면 OnHand 합계
  const sumOnHand = useMemo(() => {
    return filtered.reduce((acc, r) => acc + Number(r.onHand ?? 0), 0);
  }, [filtered]);

  const pillBtn = (active) => ({
    padding: "7px 10px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: active ? "#0ea5e9" : "#fff",
    color: active ? "#fff" : "#0f172a",
    fontWeight: 800,
    cursor: "pointer",
    userSelect: "none",
  });

  function resetFilters() {
    setQ("");
    setHideZero(false);
    setSortKey("LOC");
    setSortDir("ASC");
  }

  function toggleSort(key) {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === "ASC" ? "DESC" : "ASC"));
        return prevKey;
      }
      setSortDir("ASC");
      return key;
    });
  }

  function sortIcon(key) {
    if (sortKey !== key) return <span style={{ color: "#cbd5e1" }}>↕</span>;
    return sortDir === "ASC" ? <span>▲</span> : <span>▼</span>;
  }

  const thBase = {
    padding: "10px 12px",
    fontWeight: 800,
    fontSize: 12,
    color: "#64748b",
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  const thClickable = {
    cursor: "pointer",
  };

  // 선택된 매장 이름
  const selectedStoreName = stores.find((s) => s.id === selectedStoreId)?.name || "";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <ToastHost />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 900 }}>매장 재고</div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            style={{ ...inputStyle, minWidth: 200, padding: "10px 12px", fontWeight: 700 }}
          >
            <option value="">-- 매장 선택 --</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="전체 검색 (Location / SKU / MakerCode / 상품명)"
            style={{ ...inputStyle, minWidth: 340 }}
            disabled={!selectedStoreId}
          />

          <button type="button" style={primaryBtn} onClick={load} disabled={loading || !selectedStoreId}>
            새로고침
          </button>
        </div>
      </div>

      {/* 매장 미선택 안내 */}
      {!selectedStoreId && (
        <div
          style={{
            border: "1px solid #fbbf24",
            borderRadius: 12,
            padding: 16,
            background: "#fefce8",
            color: "#92400e",
            fontWeight: 600,
          }}
        >
          상단에서 매장을 선택하면 해당 매장의 재고를 조회할 수 있습니다.
        </div>
      )}

      {/* Controls */}
      {selectedStoreId && (
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
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div
              style={{
                padding: "7px 12px",
                borderRadius: 8,
                background: "#dbeafe",
                color: "#1e40af",
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              {selectedStoreName}
            </div>

            <button type="button" style={pillBtn(hideZero)} onClick={() => setHideZero((v) => !v)} title="OnHand=0 숨김">
              0 숨김
            </button>

            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              style={{ ...inputStyle, padding: "8px 10px", minWidth: 160 }}
              title="정렬 기준"
            >
              <option value="LOC">정렬: Location</option>
              <option value="SKU">정렬: SKU</option>
              <option value="QTY">정렬: OnHand</option>
            </select>

            <select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value)}
              style={{ ...inputStyle, padding: "8px 10px", minWidth: 120 }}
              title="정렬 방향"
            >
              <option value="ASC">오름차순</option>
              <option value="DESC">내림차순</option>
            </select>

            <button
              type="button"
              style={{ ...primaryBtn, background: "#fff", color: "#0f172a", border: "1px solid #e5e7eb" }}
              onClick={resetFilters}
            >
              필터 초기화
            </button>
          </div>

          <div style={{ fontSize: 12, color: "#64748b" }}>
            rows: <b>{filtered.length.toLocaleString()}</b>
          </div>
        </div>
      )}

      {/* Table */}
      {selectedStoreId && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "auto", background: "#fff" }}>
          <table
            style={{
              width: "fit-content",
              borderCollapse: "collapse",
              tableLayout: "fixed",
              minWidth: 0,
            }}
          >
            <thead style={{ background: "#f8fafc" }}>
              <tr>
                <th
                  style={{ ...thBase, ...thClickable, textAlign: "left", width: 120 }}
                  onClick={() => toggleSort("LOC")}
                  title="정렬: Location (자연정렬)"
                >
                  <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <span>Location</span>
                    {sortIcon("LOC")}
                  </span>
                </th>

                <th
                  style={{ ...thBase, ...thClickable, textAlign: "left", width: 210 }}
                  onClick={() => toggleSort("SKU")}
                  title="정렬: SKU"
                >
                  <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <span>SKU</span>
                    {sortIcon("SKU")}
                  </span>
                </th>

                <th style={{ ...thBase, textAlign: "left", width: 160 }}>MakerCode</th>

                <th style={{ ...thBase, textAlign: "left", width: 380 }}>상품명</th>

                <th
                  style={{ ...thBase, ...thClickable, textAlign: "right", width: 160 }}
                  onClick={() => toggleSort("QTY")}
                  title="정렬: OnHand"
                >
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "baseline" }}>
                    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                      <span>OnHand</span>
                      {sortIcon("QTY")}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}>
                      Σ {sumOnHand.toLocaleString()}
                    </span>
                  </div>
                </th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((r) => (
                <tr key={`${r.skuId ?? ""}-${r.locationId ?? ""}-${r.skuCode ?? ""}`} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "10px 12px", width: 120, fontFamily: "Consolas, monospace", whiteSpace: "nowrap" }}>
                    {r.locationCode || "-"}
                  </td>
                  <td style={{ padding: "10px 12px", width: 210, fontFamily: "Consolas, monospace", whiteSpace: "nowrap" }}>
                    {r.skuCode || "-"}
                  </td>
                  <td style={{ padding: "10px 12px", width: 160, fontFamily: "Consolas, monospace", whiteSpace: "nowrap" }}>
                    {r.makerCode || "-"}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      width: 380,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={r.skuName || ""}
                  >
                    {r.skuName || "-"}
                  </td>
                  <td style={{ padding: "10px 12px", width: 160, textAlign: "right", fontWeight: 900 }}>
                    {Number(r.onHand ?? 0)}
                  </td>
                </tr>
              ))}

              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 14, textAlign: "center", color: "#94a3b8" }}>
                    {loading ? "로딩 중..." : "재고 데이터가 없습니다."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
