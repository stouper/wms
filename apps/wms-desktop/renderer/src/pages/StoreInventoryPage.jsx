// renderer/src/pages/StoreInventoryPage.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useToasts } from "../lib/toasts.jsx";
import { inputStyle, primaryBtn } from "../ui/styles";

import { inventoryFlow } from "../workflows/inventory/inventory.workflow";

export default function StoreInventoryPage() {
  const { push, ToastHost } = useToasts();

  // ========================================
  // 상태
  // ========================================
  const [loading, setLoading] = useState(false);
  const [storeSummary, setStoreSummary] = useState([]); // 매장 요약 목록
  const [selectedStore, setSelectedStore] = useState(null); // 선택된 매장
  const [detailItems, setDetailItems] = useState([]); // 상세 재고 목록
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailOffset, setDetailOffset] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);

  // 검색
  const [q, setQ] = useState("");

  // 정렬
  const [sortKey, setSortKey] = useState("SKU");
  const [sortDir, setSortDir] = useState("ASC");

  // ========================================
  // 초기 로드: 매장 요약
  // ========================================
  useEffect(() => {
    loadStoresSummary();
  }, []);

  async function loadStoresSummary() {
    setLoading(true);
    try {
      const res = await inventoryFlow.loadStoresSummary();
      setStoreSummary(res?.items || []);
    } catch (e) {
      push({ kind: "error", title: "로드 실패", message: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  }

  // ========================================
  // 매장 선택 시 상세 로드
  // ========================================
  async function selectStore(store) {
    if (selectedStore?.storeCode === store?.storeCode) {
      // 이미 선택된 매장 클릭 → 해제
      setSelectedStore(null);
      setDetailItems([]);
      setDetailTotal(0);
      setDetailOffset(0);
      return;
    }

    setSelectedStore(store);
    setDetailItems([]);
    setDetailTotal(0);
    setDetailOffset(0);
    setQ("");

    if (!store?.storeCode) return;

    setDetailLoading(true);
    try {
      const res = await inventoryFlow.loadStoreDetail({
        storeCode: store.storeCode,
        offset: 0,
        limit: 500,
      });
      setDetailItems(res?.items || []);
      setDetailTotal(res?.total || 0);
      setDetailOffset(res?.offset || 0);
    } catch (e) {
      push({ kind: "error", title: "상세 로드 실패", message: e?.message || String(e) });
    } finally {
      setDetailLoading(false);
    }
  }

  // ========================================
  // 더 불러오기
  // ========================================
  async function loadMore() {
    if (!selectedStore?.storeCode || detailLoading) return;
    if (detailItems.length >= detailTotal) return;

    setDetailLoading(true);
    try {
      const nextOffset = detailItems.length;
      const res = await inventoryFlow.loadStoreDetail({
        storeCode: selectedStore.storeCode,
        offset: nextOffset,
        limit: 500,
      });
      setDetailItems((prev) => [...prev, ...(res?.items || [])]);
      setDetailOffset(res?.offset || nextOffset);
    } catch (e) {
      push({ kind: "error", title: "추가 로드 실패", message: e?.message || String(e) });
    } finally {
      setDetailLoading(false);
    }
  }

  // ========================================
  // 전체 합계 (요약)
  // ========================================
  const totalSummary = useMemo(() => {
    return storeSummary.reduce(
      (acc, s) => ({
        skuCount: acc.skuCount + Number(s?.skuCount || 0),
        totalQty: acc.totalQty + Number(s?.totalQty || 0),
      }),
      { skuCount: 0, totalQty: 0 }
    );
  }, [storeSummary]);

  // ========================================
  // 필터 & 정렬된 상세 아이템
  // ========================================
  const filteredItems = useMemo(() => {
    let items = detailItems;

    // 검색어 필터
    const search = (q || "").trim().toLowerCase();
    if (search) {
      items = items.filter((it) => {
        const hay = [it?.skuCode, it?.makerCode, it?.skuName].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(search);
      });
    }

    // 정렬
    const dir = sortDir === "DESC" ? -1 : 1;
    items = [...items].sort((a, b) => {
      if (sortKey === "QTY") {
        return (Number(a.onHand ?? 0) - Number(b.onHand ?? 0)) * dir;
      }
      // SKU
      return String(a.skuCode || "").localeCompare(String(b.skuCode || ""), "ko") * dir;
    });

    return items;
  }, [detailItems, q, sortKey, sortDir]);

  const detailTotals = useMemo(() => {
    return filteredItems.reduce((acc, it) => acc + Number(it?.onHand || 0), 0);
  }, [filteredItems]);

  // ========================================
  // 헬퍼
  // ========================================
  const fmtNum = (n) => {
    const v = Number(n || 0);
    if (!Number.isFinite(v)) return String(n ?? "");
    return v.toLocaleString();
  };

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

  // ========================================
  // 스타일
  // ========================================
  const thBase = { padding: "10px 12px", fontWeight: 800, fontSize: 12, color: "#64748b", whiteSpace: "nowrap" };
  const thClickable = { cursor: "pointer" };

  const cardStyle = (active) => ({
    padding: "10px 14px",
    borderRadius: 8,
    border: active ? "2px solid #3b82f6" : "1px solid #e5e7eb",
    background: active ? "#dbeafe" : "#fff",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  });

  // ========================================
  // 렌더링
  // ========================================
  return (
    <div style={{ display: "flex", gap: 16, height: "100%" }}>
      <ToastHost />

      {/* 왼쪽: 매장 카드 목록 */}
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
        <div style={{ fontWeight: 800, fontSize: 13, color: "#64748b", marginBottom: 4 }}>매장 목록</div>

        {/* 전체 버튼 */}
        <button
          type="button"
          onClick={() => {
            setSelectedStore(null);
            setDetailItems([]);
          }}
          style={cardStyle(!selectedStore)}
        >
          <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>전체</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>
            {storeSummary.length}개 매장 | <b style={{ color: "#10b981" }}>{fmtNum(totalSummary.totalQty)}</b>개
          </div>
        </button>

        {/* 매장별 카드 */}
        {storeSummary.map((s) => (
          <button
            key={s.storeCode}
            type="button"
            onClick={() => selectStore(s)}
            style={cardStyle(selectedStore?.storeCode === s.storeCode)}
          >
            <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{s.storeName || s.storeCode}</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>
              {fmtNum(s.skuCount)} SKU | <b style={{ color: "#10b981" }}>{fmtNum(s.totalQty)}</b>개
            </div>
          </button>
        ))}

        {loading && (
          <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: 10 }}>로딩 중...</div>
        )}

        {!loading && storeSummary.length === 0 && (
          <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: 10 }}>
            매장 데이터가 없습니다
          </div>
        )}
      </div>

      {/* 오른쪽: 테이블 */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>
            {selectedStore ? `${selectedStore.storeName || selectedStore.storeCode} 재고` : "매장 재고 현황"}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="검색 (SKU/메이커코드)"
              style={{ ...inputStyle, minWidth: 180 }}
              disabled={!selectedStore}
            />
            <button
              type="button"
              style={{ ...primaryBtn, padding: "8px 14px" }}
              onClick={loadStoresSummary}
              disabled={loading}
            >
              새로고침
            </button>
          </div>
        </div>

        {/* 정보 바 */}
        {selectedStore && (
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
              fontSize: 12,
              color: "#64748b",
            }}
          >
            <div>
              <b>{selectedStore.storeName}</b> ({selectedStore.storeCode})
            </div>
            <div>
              로드: <b>{detailItems.length.toLocaleString()}</b> / 전체: <b>{detailTotal.toLocaleString()}</b> |
              필터: <b>{filteredItems.length.toLocaleString()}</b> |
              수량합: <b style={{ color: "#10b981" }}>{fmtNum(detailTotals)}</b>
            </div>
          </div>
        )}

        {/* Table */}
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "auto", background: "#fff", flex: 1 }}>
          {selectedStore ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                <tr>
                  <th style={{ ...thBase, textAlign: "left", width: 50 }}>#</th>
                  <th style={{ ...thBase, ...thClickable, textAlign: "left" }} onClick={() => toggleSort("SKU")}>
                    SKU {sortIcon("SKU")}
                  </th>
                  <th style={{ ...thBase, textAlign: "left" }}>메이커코드</th>
                  <th style={{ ...thBase, textAlign: "left" }}>상품명</th>
                  <th style={{ ...thBase, ...thClickable, textAlign: "right", width: 100 }} onClick={() => toggleSort("QTY")}>
                    수량 {sortIcon("QTY")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((it, idx) => (
                  <tr key={`${it.skuCode}-${idx}`} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px 12px" }}>{idx + 1}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "Consolas, monospace" }}>{it.skuCode || "-"}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "Consolas, monospace" }}>{it.makerCode || "-"}</td>
                    <td style={{ padding: "8px 12px" }}>{it.skuName || "-"}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "#10b981" }}>
                      {fmtNum(it.onHand)}
                    </td>
                  </tr>
                ))}
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>
                      {detailLoading ? "로딩 중..." : "재고 데이터가 없습니다."}
                    </td>
                  </tr>
                )}
              </tbody>
              {filteredItems.length > 0 && (
                <tfoot>
                  <tr style={{ background: "#ecfdf5", fontWeight: 700 }}>
                    <td style={{ padding: "10px 12px" }} colSpan={4}>합계</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "#10b981" }}>{fmtNum(detailTotals)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          ) : (
            // 매장 미선택 시: 요약 테이블
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                <tr>
                  <th style={{ ...thBase, textAlign: "left", width: 50 }}>#</th>
                  <th style={{ ...thBase, textAlign: "left" }}>매장명</th>
                  <th style={{ ...thBase, textAlign: "left" }}>매장코드</th>
                  <th style={{ ...thBase, textAlign: "right" }}>SKU 수</th>
                  <th style={{ ...thBase, textAlign: "right" }}>총 수량</th>
                </tr>
              </thead>
              <tbody>
                {storeSummary.map((s, idx) => (
                  <tr
                    key={s.storeCode}
                    style={{ borderTop: "1px solid #f1f5f9", cursor: "pointer" }}
                    onClick={() => selectStore(s)}
                  >
                    <td style={{ padding: "8px 12px" }}>{idx + 1}</td>
                    <td style={{ padding: "8px 12px", fontWeight: 600 }}>{s.storeName || "-"}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "Consolas, monospace" }}>{s.storeCode || "-"}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtNum(s.skuCount)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "#10b981" }}>
                      {fmtNum(s.totalQty)}
                    </td>
                  </tr>
                ))}
                {storeSummary.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>
                      {loading ? "로딩 중..." : "매장 데이터가 없습니다."}
                    </td>
                  </tr>
                )}
              </tbody>
              {storeSummary.length > 0 && (
                <tfoot>
                  <tr style={{ background: "#ecfdf5", fontWeight: 700 }}>
                    <td style={{ padding: "10px 12px" }} colSpan={3}>합계</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmtNum(totalSummary.skuCount)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "#10b981" }}>{fmtNum(totalSummary.totalQty)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>

        {/* 더 불러오기 버튼 */}
        {selectedStore && detailItems.length < detailTotal && (
          <div style={{ textAlign: "center" }}>
            <button
              type="button"
              style={{ ...primaryBtn, padding: "8px 20px" }}
              onClick={loadMore}
              disabled={detailLoading}
            >
              {detailLoading ? "로딩 중..." : `더 불러오기 (${detailItems.length} / ${detailTotal})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
