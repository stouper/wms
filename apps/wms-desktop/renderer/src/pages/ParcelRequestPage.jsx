// apps/wms-desktop/renderer/src/pages/ParcelRequestPage.jsx

import React, { useMemo, useRef, useState } from "react";
import { runParcelRequest, parcelShipMode } from "../workflows/parcelRequest/parcelRequest.workflow";
import { getApiBase } from "../workflows/_common/api";
import { primaryBtn } from "../ui/styles";
import { useToasts } from "../lib/toasts.jsx";

export default function ParcelRequestPage() {
  const apiBase = getApiBase();
  const fileRef = useRef(null);
  const { push, ToastHost } = useToasts();

  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const sample = useMemo(() => rows.slice(0, 50), [rows]);

  async function onPickFile(e) {
    setError("");
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);

    const res = await runParcelRequest({ file: f });

    if (!res.ok) {
      setRows([]);
      setError(res.error);
      return;
    }

    setRows(res.data.rows || []);
  }

  async function onCreateJobs() {
    if (!rows || rows.length === 0) {
      push({ kind: "warn", title: "데이터 없음", message: "먼저 엑셀 파일을 업로드해주세요" });
      return;
    }

    setCreating(true);
    try {
      const result = await parcelShipMode.createJobsFromPreview({
        rows,
        fileName,
      });

      if (!result?.ok) {
        throw new Error(result?.error || "작지 생성 실패");
      }

      push({
        kind: "success",
        title: "작지 생성 완료",
        message: `${result.createdCount}개의 택배 작지가 생성되었습니다`,
      });

      // 파일 입력 초기화
      setRows([]);
      setFileName("");
      setError("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      push({ kind: "error", title: "작지 생성 실패", message: e?.message || String(e) });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <ToastHost />

      <h1 style={{ margin: 0 }}>택배 요청</h1>
      <div style={{ marginTop: 8, opacity: 0.8, fontSize: 13 }}>
        온라인 주문서(택배요청) 엑셀을 업로드해서 내용을 미리보기하고 작지를 생성합니다.
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onPickFile} />
        <div style={{ fontSize: 12, opacity: 0.8 }}>{fileName ? `선택: ${fileName}` : ""}</div>

        {rows.length > 0 && (
          <button
            type="button"
            style={{ ...primaryBtn, marginLeft: "auto" }}
            onClick={onCreateJobs}
            disabled={creating}
          >
            {creating ? "작지 생성 중..." : `작지 생성 (${rows.length}건)`}
          </button>
        )}
      </div>

      {error ? (
        <div style={{ marginTop: 12, color: "crimson", whiteSpace: "pre-wrap" }}>{error}</div>
      ) : null}

      <div style={{ marginTop: 12, fontSize: 13 }}>
        총 {rows.length.toLocaleString()} 행
      </div>

      <div style={{ marginTop: 12, overflow: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#f7f7f7" }}>
              {[
                "주문번호",
                "수취인",
                "우편번호",
                "주소",
                "전화",
                "옵션(원문)",
                "수량",
                "매장코드",
                "배송메세지",
              ].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sample.map((r, idx) => (
              <tr key={idx}>
                <td style={td}>{r.orderNo}</td>
                <td style={td}>{r.receiverName}</td>
                <td style={td}>{r.zipcode}</td>
                <td style={td}>{r.address}</td>
                <td style={td}>{r.phone}</td>
                <td style={td}>{r.optionRaw}</td>
                <td style={td}>{r.qty}</td>
                <td style={td}>{r.storeCode}</td>
                <td style={td}>{r.message}</td>
              </tr>
            ))}
            {sample.length === 0 ? (
              <tr>
                <td style={{ ...td, padding: 12, opacity: 0.7 }} colSpan={9}>
                  업로드된 데이터가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
        "작지 생성" 버튼을 누르면 주문번호별로 출고 Job과 택배 정보(JobParcel)가 생성됩니다.
        생성된 작지는 "매장 출고" 페이지에서 확인하고 스캔할 수 있습니다.
      </div>
    </div>
  );
}

const td = {
  padding: 8,
  borderBottom: "1px solid #eee",
  verticalAlign: "top",
};
