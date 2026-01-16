import React, { useMemo, useState } from "react";
import { runSalesImport } from "../workflows/sales/sales.workflow";

export default function SalesPage({ title = "매출 업로드" }) {
  const [file, setFile] = useState(null);
  const [sourceKey, setSourceKey] = useState("");
  const [status, setStatus] = useState({ stage: "idle" });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const fileName = useMemo(() => file?.name || "", [file]);

  function guessSourceKey(name) {
    if (!name) return "";
    // 파일명 기반 기본값 (원하면 규칙 바꿔도 됨)
    // 예: "ESKA sales_2025-12.xlsx" -> "ESKA sales_2025-12"
    return name.replace(/\.(xlsx|xls|csv)$/i, "");
  }

  const busy = status.stage === "uploading" || status.stage === "validating";

  const box = {
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: 16,
    background: "#fff",
    maxWidth: 760,
  };

  const label = { fontSize: 12, color: "#64748b", marginBottom: 6 };
  const row = { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" };
  const input = {
    padding: "10px 12px",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    minWidth: 320,
  };
  const btn = (variant) => ({
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    background: variant === "primary" ? "#111827" : "#fff",
    color: variant === "primary" ? "#fff" : "#111827",
    cursor: busy ? "not-allowed" : "pointer",
    opacity: busy ? 0.6 : 1,
  });

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

  return (
    <div>
      <h1 style={{ margin: 0 }}>{title}</h1>
      <p style={{ color: "#64748b" }}>
        엑셀 파일을 선택해서 업로드하면 <b>/sales/import-excel</b>로 전송돼. (server가 켜져 있어야 함)
      </p>

      <div style={box}>
        <div style={{ ...row, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={label}>엑셀 파일</div>
            <input
              type="file"
              accept=".xlsx,.xls"
              disabled={busy}
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
              disabled={busy}
              value={sourceKey}
              onChange={(e) => setSourceKey(e.target.value)}
              placeholder="예: ESKA-2025-12"
            />
            <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8" }}>
              중복 업로드 추적용(권장)
            </div>
          </div>
        </div>

        <div style={{ ...row, marginTop: 8 }}>
          <button style={btn("primary")} onClick={doUpload} disabled={busy || !file}>
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
            }}
            disabled={busy}
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
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>결과</div>
            <pre
              style={{
                margin: 0,
                padding: 12,
                borderRadius: 10,
                background: "#0b1020",
                color: "#e5e7eb",
                overflow: "auto",
                maxHeight: 260,
              }}
            >
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
