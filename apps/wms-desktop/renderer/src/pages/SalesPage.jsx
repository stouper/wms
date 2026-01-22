// apps/wms-desktop/renderer/src/pages/SalesPage.jsx

import React, { useMemo, useState } from "react";
import { useToasts } from "../lib/toasts.jsx";
import { runSalesImport, runSalesByStore } from "../workflows/sales/sales.workflow";
import { inputStyle, primaryBtn } from "../ui/styles";

export default function SalesPage({ pageTitle = "매출 관리" }) {
  const { push, ToastHost } = useToasts();

  // 업로드 상태
  const [file, setFile] = useState(null);
  const [sourceKey, setSourceKey] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [showUpload, setShowUpload] = useState(false);

  // 조회 상태
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);

  // 필터
  const [storeFilter, setStoreFilter] = useState("ALL");
  const [storeQuery, setStoreQuery] = useState("");

  const fileName = useMemo(() => file?.name || "", [file]);

  // ========================================
  // 스타일
  // ========================================
  const cardStyle = {
    background: "#fff",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    padding: 12,
  };

  const smallBtn = {
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 6,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
  };

  const filterBtn = (active) => ({
    ...smallBtn,
    background: active ? "#3b82f6" : "#fff",
    color: active ? "#fff" : "#374151",
    border: active ? "1px solid #3b82f6" : "1px solid #e5e7eb",
  });

  // ========================================
  // 데이터 계산
  // ========================================
  const summaryItems = useMemo(() => {
    const arr = summary?.items || summary || [];
    return Array.isArray(arr) ? arr : [];
  }, [summary]);

  const storeOptions = useMemo(() => {
    const map = new Map();
    for (const it of summaryItems) {
      const code = String(it?.storeCode || "");
      const name = String(it?.storeName || "");
      if (!code && !name) continue;
      const key = code || name;
      if (!map.has(key)) map.set(key, name || code || key);
    }
    return Array.from(map.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code, "ko"));
  }, [summaryItems]);

  const filteredItems = useMemo(() => {
    let items = summaryItems;

    const q = storeQuery.trim().toLowerCase();
    if (q) {
      items = items.filter((it) => {
        const code = String(it?.storeCode || "").toLowerCase();
        const name = String(it?.storeName || "").toLowerCase();
        return code.includes(q) || name.includes(q);
      });
    }

    if (storeFilter && storeFilter !== "ALL") {
      items = items.filter((it) => {
        const code = String(it?.storeCode || it?.storeName || "");
        return code === storeFilter;
      });
    }

    return items;
  }, [summaryItems, storeFilter, storeQuery]);

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
  // 업로드
  // ========================================
  async function doUpload() {
    if (!file) {
      push({ kind: "warn", title: "파일 선택", message: "엑셀 파일을 선택해주세요" });
      return;
    }

    setUploading(true);
    setUploadResult(null);

    try {
      const res = await runSalesImport({
        file,
        sourceKey: sourceKey?.trim() || null,
        onProgress: () => {},
      });

      setUploadResult(res);

      if (res?.inserted > 0) {
        push({
          kind: "success",
          title: "업로드 완료",
          message: `${res.inserted}건 저장 완료${res.skipped ? ` (${res.skipped}건 스킵)` : ""}`,
        });
      } else {
        push({
          kind: "warn",
          title: "업로드 결과",
          message: `저장된 데이터가 없습니다 (스킵: ${res?.skipped || 0}건)`,
        });
      }
    } catch (e) {
      push({ kind: "error", title: "업로드 실패", message: e?.message || String(e) });
    } finally {
      setUploading(false);
    }
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

    try {
      const res = await runSalesByStore({
        from: from?.trim(),
        to: to?.trim(),
        onProgress: () => {},
      });
      setSummary(res);
      setStoreFilter("ALL");
      setStoreQuery("");

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

  // ========================================
  // 렌더링
  // ========================================
  return (
    <div style={{ display: "grid", gap: 12, width: "100%" }}>
      <ToastHost />

      {/* ========== 헤더 ========== */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{pageTitle}</h1>
        <button
          type="button"
          style={{ ...smallBtn, background: showUpload ? "#fef3c7" : "#dbeafe" }}
          onClick={() => setShowUpload(!showUpload)}
        >
          {showUpload ? "업로드 닫기" : "엑셀 업로드"}
        </button>
      </div>

      <div style={{ fontSize: 12, color: "#64748b" }}>
        필수 헤더: <b>매장명</b>, <b>매출일</b>, <b>매출금액</b> | 선택: 수량, 구분, 단품코드, 코드명
      </div>

      {/* ========== 엑셀 업로드 (접이식) ========== */}
      {showUpload && (
        <div style={{ ...cardStyle, background: "#fffbeb" }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>매출 데이터 업로드</div>

          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>엑셀 파일</div>
              <input
                type="file"
                accept=".xlsx,.xls"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                  if (f && !sourceKey) {
                    setSourceKey(f.name.replace(/\.(xlsx|xls|csv)$/i, ""));
                  }
                }}
                style={{ fontSize: 12 }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>sourceKey (선택)</div>
              <input
                style={{ ...inputStyle, width: 180 }}
                disabled={uploading}
                value={sourceKey}
                onChange={(e) => setSourceKey(e.target.value)}
                placeholder="중복 추적용"
              />
            </div>

            <button
              type="button"
              style={{ ...primaryBtn, padding: "8px 16px" }}
              onClick={doUpload}
              disabled={uploading || !file}
            >
              {uploading ? "업로드 중..." : "업로드"}
            </button>
          </div>

          {fileName && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#78716c" }}>
              선택됨: <b>{fileName}</b>
            </div>
          )}

          {uploadResult && (
            <div style={{ marginTop: 10, padding: 10, background: "#f0fdf4", borderRadius: 8, fontSize: 12 }}>
              <div>저장: <b>{uploadResult.inserted}</b>건 | 스킵: <b>{uploadResult.skipped}</b>건</div>
              {uploadResult.errorsSample?.length > 0 && (
                <div style={{ marginTop: 6, color: "#dc2626" }}>
                  에러 샘플: {uploadResult.errorsSample.slice(0, 3).join(", ")}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========== 조회 영역 ========== */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>매장별 매출 조회</div>
          {summary && (
            <div style={{ fontSize: 12, color: "#64748b" }}>
              총 <b>{filteredItems.length}</b>개 매장 | 수량: <b>{fmtNum(totals.totalQty)}</b> | 금액: <b>{fmtNum(totals.totalAmount)}</b>원
            </div>
          )}
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>시작일</div>
            <input
              type="date"
              style={{ ...inputStyle, width: 150 }}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>종료일</div>
            <input
              type="date"
              style={{ ...inputStyle, width: 150 }}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={loading}
            />
          </div>

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

        {/* 필터 */}
        {summaryItems.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>매장 필터</div>
              <select
                style={{ ...inputStyle, width: 200 }}
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                disabled={loading}
              >
                <option value="ALL">전체 매장</option>
                {storeOptions.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name ? `${s.name} (${s.code})` : s.code}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>검색</div>
              <input
                style={{ ...inputStyle, width: 180 }}
                value={storeQuery}
                onChange={(e) => setStoreQuery(e.target.value)}
                placeholder="매장명/코드 검색"
                disabled={loading}
              />
            </div>

            <button
              type="button"
              style={smallBtn}
              onClick={() => {
                setStoreFilter("ALL");
                setStoreQuery("");
              }}
              disabled={loading || (!storeQuery && storeFilter === "ALL")}
            >
              필터 초기화
            </button>
          </div>
        )}
      </div>

      {/* ========== 결과 테이블 ========== */}
      {filteredItems.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 900 }}>조회 결과</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>
              {from} ~ {to}
            </div>
          </div>

          <div style={{ maxHeight: 400, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>매장코드</th>
                  <th style={thStyle}>매장명</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>수량</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>매출금액</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((it, idx) => (
                  <tr key={`${it.storeCode || "store"}-${idx}`}>
                    <td style={tdStyle}>{idx + 1}</td>
                    <td style={tdStyle}>{it.storeCode || "-"}</td>
                    <td style={tdStyle}>{it.storeName || "-"}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{fmtNum(it.totalQty)}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{fmtNum(it.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#f0f9ff", fontWeight: 700 }}>
                  <td style={tdStyle} colSpan={3}>합계</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmtNum(totals.totalQty)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmtNum(totals.totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 조회 결과 없음 */}
      {summary && filteredItems.length === 0 && (
        <div style={{ ...cardStyle, textAlign: "center", color: "#64748b", padding: 20 }}>
          조회 결과가 없습니다 (필터 조건 확인)
        </div>
      )}
    </div>
  );
}

const thStyle = {
  padding: "10px 12px",
  textAlign: "left",
  fontWeight: 600,
  color: "#64748b",
  borderBottom: "1px solid #e5e7eb",
};

const tdStyle = {
  padding: "10px 12px",
  borderBottom: "1px solid #f1f5f9",
};
