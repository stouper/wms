// apps/wms-desktop/renderer/src/pages/SalesPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import { useToasts } from "../lib/toasts.jsx";
import { runSalesByStore } from "../workflows/sales/sales.workflow";
import { inputStyle, primaryBtn } from "../ui/styles";

export default function SalesPage({ pageTitle = "매출 관리" }) {
  const { push, ToastHost } = useToasts();

  // 조회 상태
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);

  // 매장 필터 (왼쪽 카드)
  const [selectedStoreCode, setSelectedStoreCode] = useState("");

  // 상단 검색
  const [q, setQ] = useState("");

  // 정렬
  const [sortKey, setSortKey] = useState("STORE");
  const [sortDir, setSortDir] = useState("ASC");

  // ========================================
  // 데이터 계산
  // ========================================
  const summaryItems = useMemo(() => {
    const arr = summary?.items || summary || [];
    return Array.isArray(arr) ? arr : [];
  }, [summary]);

  // 매장별 요약 (왼쪽 사이드바용)
  const storeSummary = useMemo(() => {
    const map = new Map();
    for (const it of summaryItems) {
      const code = String(it?.storeCode || "UNKNOWN");
      const name = String(it?.storeName || code);
      if (!map.has(code)) {
        map.set(code, { code, name, totalAmount: 0, totalQty: 0 });
      }
      const entry = map.get(code);
      entry.totalAmount += Number(it?.totalAmount || 0);
      entry.totalQty += Number(it?.totalQty || 0);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [summaryItems]);

  // 전체 합계
  const totalSummary = useMemo(() => {
    return storeSummary.reduce(
      (acc, s) => ({ totalAmount: acc.totalAmount + s.totalAmount, totalQty: acc.totalQty + s.totalQty }),
      { totalAmount: 0, totalQty: 0 }
    );
  }, [storeSummary]);

  // 필터링된 아이템
  const filteredItems = useMemo(() => {
    let items = summaryItems;

    // 매장 필터
    if (selectedStoreCode) {
      items = items.filter((it) => it?.storeCode === selectedStoreCode);
    }

    // 검색어 필터
    const search = (q || "").trim().toLowerCase();
    if (search) {
      items = items.filter((it) => {
        const hay = [it?.storeCode, it?.storeName].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(search);
      });
    }

    // 정렬
    const dir = sortDir === "DESC" ? -1 : 1;
    items = [...items].sort((a, b) => {
      if (sortKey === "QTY") {
        return (Number(a.totalQty ?? 0) - Number(b.totalQty ?? 0)) * dir;
      }
      if (sortKey === "AMOUNT") {
        return (Number(a.totalAmount ?? 0) - Number(b.totalAmount ?? 0)) * dir;
      }
      // STORE
      return String(a.storeName || "").localeCompare(String(b.storeName || ""), "ko") * dir;
    });

    return items;
  }, [summaryItems, selectedStoreCode, q, sortKey, sortDir]);

  const totals = useMemo(() => {
    let totalAmount = 0;
    let totalQty = 0;
    for (const it of filteredItems) {
      totalAmount += Number(it?.totalAmount || 0);
      totalQty += Number(it?.totalQty || 0);
    }
    return { totalAmount, totalQty };
  }, [filteredItems]);

  const fmtNum = (n) => {
    const v = Number(n || 0);
    if (!Number.isFinite(v)) return String(n ?? "");
    return v.toLocaleString();
  };

  // ========================================
  // 날짜 헬퍼
  // ========================================
  function setTodayRange() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const s = `${yyyy}-${mm}-${dd}`;
    setFrom(s);
    setTo(s);
  }

  function setThisMonthRange() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    setFrom(`${yyyy}-${mm}-01`);
    const lastDay = new Date(yyyy, now.getMonth() + 1, 0).getDate();
    setTo(`${yyyy}-${mm}-${String(lastDay).padStart(2, "0")}`);
  }

  // ========================================
  // 조회
  // ========================================
  async function doFetchSummary() {
    if (!from || !to) {
      push({ kind: "warn", title: "기간 선택", message: "조회 기간을 선택해주세요" });
      return;
    }

    setLoading(true);
    setSummary(null);
    setSelectedStoreCode("");
    setQ("");

    try {
      const res = await runSalesByStore({
        from: from?.trim(),
        to: to?.trim(),
        onProgress: () => {},
      });
      setSummary(res);

      const itemCount = res?.items?.length || 0;
      push({
        kind: "success",
        title: "조회 완료",
        message: `${itemCount}개 매장 데이터 조회됨`,
      });
    } catch (e) {
      push({ kind: "error", title: "조회 실패", message: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  }

  // 초기 로드: 이번 달로 설정
  useEffect(() => {
    setThisMonthRange();
  }, []);

  // ========================================
  // 정렬
  // ========================================
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

  const smallBtn = {
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 6,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
  };

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
          onClick={() => setSelectedStoreCode("")}
          style={cardStyle(!selectedStoreCode)}
        >
          <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>전체</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>
            {storeSummary.length}개 매장 | <b style={{ color: "#0ea5e9" }}>{fmtNum(totalSummary.totalAmount)}</b>원
          </div>
        </button>

        {/* 매장별 카드 */}
        {storeSummary.map((s) => (
          <button
            key={s.code}
            type="button"
            onClick={() => setSelectedStoreCode(selectedStoreCode === s.code ? "" : s.code)}
            style={cardStyle(selectedStoreCode === s.code)}
          >
            <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{s.name}</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>
              {fmtNum(s.totalQty)}개 | <b style={{ color: "#0ea5e9" }}>{fmtNum(s.totalAmount)}</b>원
            </div>
          </button>
        ))}

        {storeSummary.length === 0 && !loading && summary && (
          <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: 10 }}>
            매출 데이터가 없습니다
          </div>
        )}

        {!summary && !loading && (
          <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: 10 }}>
            기간을 선택 후 조회하세요
          </div>
        )}
      </div>

      {/* 오른쪽: 테이블 */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{pageTitle}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="검색 (매장명/코드)"
              style={{ ...inputStyle, minWidth: 180 }}
              disabled={!summary}
            />
          </div>
        </div>

        {/* 조회 영역 */}
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
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="date"
              style={{ ...inputStyle, width: 140 }}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              disabled={loading}
            />
            <span style={{ color: "#64748b" }}>~</span>
            <input
              type="date"
              style={{ ...inputStyle, width: 140 }}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={loading}
            />
            <button type="button" style={smallBtn} onClick={setTodayRange} disabled={loading}>
              오늘
            </button>
            <button type="button" style={smallBtn} onClick={setThisMonthRange} disabled={loading}>
              이번 달
            </button>
            <button
              type="button"
              style={{ ...primaryBtn, padding: "8px 16px" }}
              onClick={doFetchSummary}
              disabled={loading || !from || !to}
            >
              {loading ? "조회 중..." : "조회"}
            </button>
          </div>
          {summary && (
            <div style={{ fontSize: 12, color: "#64748b" }}>
              rows: <b>{filteredItems.length.toLocaleString()}</b> | 수량: <b>{fmtNum(totals.totalQty)}</b> | 금액: <b style={{ color: "#0ea5e9" }}>{fmtNum(totals.totalAmount)}</b>원
            </div>
          )}
        </div>

        {/* Table */}
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "auto", background: "#fff", flex: 1 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
              <tr>
                <th style={{ ...thBase, textAlign: "left", width: 50 }}>#</th>
                {!selectedStoreCode && (
                  <th style={{ ...thBase, ...thClickable, textAlign: "left", width: 120 }} onClick={() => toggleSort("STORE")}>
                    매장 {sortIcon("STORE")}
                  </th>
                )}
                <th style={{ ...thBase, textAlign: "left", width: 120 }}>매장코드</th>
                <th style={{ ...thBase, ...thClickable, textAlign: "right", width: 100 }} onClick={() => toggleSort("QTY")}>
                  수량 {sortIcon("QTY")}
                </th>
                <th style={{ ...thBase, ...thClickable, textAlign: "right", width: 140 }} onClick={() => toggleSort("AMOUNT")}>
                  매출금액 {sortIcon("AMOUNT")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((it, idx) => (
                <tr key={`${it.storeCode || "store"}-${idx}`} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px 12px" }}>{idx + 1}</td>
                  {!selectedStoreCode && (
                    <td style={{ padding: "8px 12px", fontWeight: 600 }}>{it.storeName || "-"}</td>
                  )}
                  <td style={{ padding: "8px 12px", fontFamily: "Consolas, monospace" }}>{it.storeCode || "-"}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtNum(it.totalQty)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "#0ea5e9" }}>{fmtNum(it.totalAmount)}</td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={selectedStoreCode ? 4 : 5} style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>
                    {loading ? "로딩 중..." : summary ? "조회 결과가 없습니다." : "기간을 선택 후 조회하세요."}
                  </td>
                </tr>
              )}
            </tbody>
            {filteredItems.length > 0 && (
              <tfoot>
                <tr style={{ background: "#f0f9ff", fontWeight: 700 }}>
                  <td style={{ padding: "10px 12px" }} colSpan={selectedStoreCode ? 2 : 3}>합계</td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmtNum(totals.totalQty)}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: "#0ea5e9" }}>{fmtNum(totals.totalAmount)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
