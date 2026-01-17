import React, { useMemo, useState } from "react";
import { runSalesImport, runSalesByStore } from "../workflows/sales/sales.workflow";

export default function SalesPage({ title = "매출 업로드" }) {
  const [file, setFile] = useState(null);
  const [sourceKey, setSourceKey] = useState("");
  const [status, setStatus] = useState({ stage: "idle" });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // ✅ 합산 조회 결과(매장별)
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState("");

  // ✅ 매장 필터(드롭다운 + 검색)
  const [storeFilter, setStoreFilter] = useState("ALL"); // "ALL" | storeCode
  const [storeQuery, setStoreQuery] = useState("");

  const fileName = useMemo(() => file?.name || "", [file]);

  function guessSourceKey(name) {
    if (!name) return "";
    return name.replace(/\.(xlsx|xls|csv)$/i, "");
  }

  const busy = status.stage === "uploading" || status.stage === "validating";
  const busySummary = status.stage === "loading-summary";

  const box = {
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: 16,
    background: "#fff",
    maxWidth: 980,
  };

  const label = { fontSize: 12, color: "#64748b", marginBottom: 6 };
  const row = { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" };
  const input = {
    padding: "10px 12px",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    minWidth: 220,
  };
  const btn = (variant) => ({
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    background: variant === "primary" ? "#111827" : "#fff",
    color: variant === "primary" ? "#fff" : "#111827",
    cursor: busy || busySummary ? "not-allowed" : "pointer",
    opacity: busy || busySummary ? 0.6 : 1,
  });

  const summaryItems = useMemo(() => {
    const arr = summary?.items || summary || [];
    return Array.isArray(arr) ? arr : [];
  }, [summary]);

  // ✅ 매장 목록(필터 옵션)
  const storeOptions = useMemo(() => {
    const map = new Map(); // storeCode -> storeName
    for (const it of summaryItems) {
      const code = String(it?.storeCode || "");
      const name = String(it?.storeName || "");
      if (!code && !name) continue;
      // code가 없으면 name을 code로 대체(최후)
      const key = code || name;
      if (!map.has(key)) map.set(key, name || code || key);
    }
    return Array.from(map.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code, "ko"));
  }, [summaryItems]);

  // ✅ 필터 적용된 아이템
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

  // ✅ 총합도 필터 기준으로 계산
  const summaryTotals = useMemo(() => {
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

  // ✅ 오늘 버튼(편의)
  function setTodayRange() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const s = `${yyyy}-${mm}-${dd}`;
    setFrom(s);
    setTo(s);
  }

  async function doUpload() {
    setError("");
    setResult(null);

    try {
      const res = await runSalesImport({
        file,
        sourceKey: sourceKey?.trim() || null,
        onProgress: (s) => setStatus(s),
      });
      setResult(res);
    } catch (e) {
      setError(e?.message || String(e));
      setStatus({ stage: "idle" });
    }
  }

  async function doFetchSummary() {
    setSummaryError("");
    setSummary(null);

    try {
      const res = await runSalesByStore({
        from: from?.trim(),
        to: to?.trim(),
        onProgress: (s) => setStatus(s),
      });
      setSummary(res);
      // 조회 성공하면 필터 초기화(원하면 유지로 바꿔도 됨)
      setStoreFilter("ALL");
      setStoreQuery("");
    } catch (e) {
      setSummaryError(e?.message || String(e));
      setStatus({ stage: "idle" });
    }
  }

  return (
    <div>
      <h1 style={{ margin: 0 }}>{title}</h1>
      <p style={{ color: "#64748b" }}>
        엑셀 파일을 선택해서 업로드하면 <b>/sales/import-excel</b>로 전송돼. (server가 켜져 있어야 함)
      </p>

      <div style={box}>
        {/* 업로드 영역 */}
        <div style={{ ...row, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={label}>엑셀 파일</div>
            <input
              type="file"
              accept=".xlsx,.xls"
              disabled={busy || busySummary}
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setFile(f);
                if (f) setSourceKey((prev) => prev || guessSourceKey(f.name));
              }}
            />
            {fileName ? (
              <div style={{ marginTop: 6, fontSize: 12, color: "#334155" }}>
                선택됨: <b>{fileName}</b>
              </div>
            ) : (
              <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8" }}>아직 파일 선택 안됨</div>
            )}
          </div>

          <div style={{ flex: 1 }}>
            <div style={label}>sourceKey (선택)</div>
            <input
              style={input}
              disabled={busy || busySummary}
              value={sourceKey}
              onChange={(e) => setSourceKey(e.target.value)}
              placeholder="예: ESKA-2025-12"
            />
            <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8" }}>중복 업로드 추적용(권장)</div>
          </div>
        </div>

        <div style={{ ...row, marginTop: 8 }}>
          <button style={btn("primary")} onClick={doUpload} disabled={busy || busySummary || !file}>
            {busy ? "업로드 중..." : "매출 업로드"}
          </button>

          <button
            style={btn("ghost")}
            onClick={() => {
              setFile(null);
              setSourceKey("");
              setStatus({ stage: "idle" });
              setResult(null);
              setError("");
              setSummary(null);
              setSummaryError("");
              setFrom("");
              setTo("");
              setStoreFilter("ALL");
              setStoreQuery("");
            }}
            disabled={busy || busySummary}
          >
            초기화
          </button>

          <div style={{ fontSize: 12, color: "#64748b" }}>
            상태:{" "}
            <b>
              {status.stage === "idle"
                ? "대기"
                : status.stage === "validating"
                ? "검증"
                : status.stage === "uploading"
                ? "업로드"
                : status.stage === "done"
                ? "완료"
                : status.stage === "loading-summary"
                ? "합산 조회"
                : status.stage === "done-summary"
                ? "합산 완료"
                : status.stage}
            </b>
          </div>
        </div>

        {error ? (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "#FEF2F2", color: "#991B1B" }}>
            에러: {error}
          </div>
        ) : null}

        {result ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>업로드 결과</div>
            <pre
              style={{
                margin: 0,
                padding: 12,
                borderRadius: 10,
                background: "#0b1020",
                color: "#e5e7eb",
                overflow: "auto",
                maxHeight: 220,
              }}
            >
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        ) : null}

        {/* ✅ 합산 조회 영역 */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 900 }}>EPMS Export</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                기간 선택 → 조회 → 매장별 totalAmount/totalQty 표시
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#64748b" }}>
              (필터 기준) 총수량: <b>{fmtNum(summaryTotals.totalQty)}</b> / 총금액: <b>{fmtNum(summaryTotals.totalAmount)}</b>원
            </div>
          </div>

          {/* ✅ 기간: 달력 입력 */}
          <div style={{ ...row, marginTop: 10 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={label}>기간 (from)</div>
              <input
                type="date"
                style={{ ...input, minWidth: 170 }}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                disabled={busy || busySummary}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={label}>기간 (to)</div>
              <input
                type="date"
                style={{ ...input, minWidth: 170 }}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                disabled={busy || busySummary}
              />
            </div>

            <button style={btn("ghost")} onClick={setTodayRange} disabled={busy || busySummary}>
              오늘
            </button>

            <button style={btn("primary")} onClick={doFetchSummary} disabled={busy || busySummary || !from || !to}>
              {busySummary ? "조회 중..." : "조회"}
            </button>
          </div>

          {/* ✅ 매장 필터 */}
          <div style={{ ...row, marginTop: 10 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={label}>매장 필터</div>
              <select
                style={{ ...input, minWidth: 260 }}
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                disabled={busy || busySummary || !storeOptions.length}
              >
                <option value="ALL">전체 매장</option>
                {storeOptions.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name ? `${s.name} (${s.code})` : s.code}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={label}>매장 검색</div>
              <input
                style={{ ...input, minWidth: 260 }}
                value={storeQuery}
                onChange={(e) => setStoreQuery(e.target.value)}
                placeholder="매장명/코드 검색"
                disabled={busy || busySummary || !summaryItems.length}
              />
            </div>

            <button
              style={btn("ghost")}
              onClick={() => {
                setStoreFilter("ALL");
                setStoreQuery("");
              }}
              disabled={busy || busySummary || (!storeQuery && storeFilter === "ALL")}
            >
              필터 초기화
            </button>

            <div style={{ fontSize: 12, color: "#64748b" }}>
              표시: <b>{filteredItems.length.toLocaleString()}</b>건
            </div>
          </div>

          {summaryError ? (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "#FEF2F2", color: "#991B1B" }}>
              합산 조회 에러: {summaryError}
              <div style={{ marginTop: 6, fontSize: 12, color: "#7f1d1d" }}>
                (라우트가 다르면 <b>workflows/sales/sales.api.js</b>의 <b>fetchSalesByStore()</b> 경로만 맞춰주면 됨)
              </div>
            </div>
          ) : null}

          {filteredItems?.length ? (
            <div style={{ marginTop: 12, border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ maxHeight: 360, overflow: "auto", background: "#fff" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={{ textAlign: "left", padding: 10, fontSize: 12, color: "#334155" }}>storeCode</th>
                      <th style={{ textAlign: "left", padding: 10, fontSize: 12, color: "#334155" }}>storeName</th>
                      <th style={{ textAlign: "right", padding: 10, fontSize: 12, color: "#334155" }}>totalQty</th>
                      <th style={{ textAlign: "right", padding: 10, fontSize: 12, color: "#334155" }}>totalAmount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((it, idx) => (
                      <tr key={`${it.storeCode || "store"}-${idx}`} style={{ borderTop: "1px solid #e2e8f0" }}>
                        <td style={{ padding: 10, fontSize: 12 }}>{it.storeCode || "-"}</td>
                        <td style={{ padding: 10, fontSize: 12 }}>{it.storeName || "-"}</td>
                        <td style={{ padding: 10, fontSize: 12, textAlign: "right" }}>{fmtNum(it.totalQty)}</td>
                        <td style={{ padding: 10, fontSize: 12, textAlign: "right" }}>{fmtNum(it.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ padding: 12, background: "#f8fafc", fontSize: 12, color: "#334155", display: "flex", gap: 12 }}>
                <div>
                  (필터 기준) 총수량: <b>{fmtNum(summaryTotals.totalQty)}</b>
                </div>
                <div>
                  (필터 기준) 총금액: <b>{fmtNum(summaryTotals.totalAmount)}</b>원
                </div>
              </div>
            </div>
          ) : summary ? (
            <div style={{ marginTop: 12, fontSize: 12, color: "#64748b" }}>결과는 왔는데(또는 필터 적용으로) 표시할 항목이 없어.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
