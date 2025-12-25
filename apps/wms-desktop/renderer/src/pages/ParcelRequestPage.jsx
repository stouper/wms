// apps/wms-desktop/renderer/src/pages/ParcelRequestPage.jsx

import React, { useMemo, useRef, useState } from "react";
import { parseParcelRequestFileToRows } from "../lib/parseParcelRequestFile";
import { getApiBase } from "../lib/api"; // 이미 쓰고 있으면 경로 맞춰줘

export default function ParcelRequestPage() {
  const apiBase = getApiBase();
  const fileRef = useRef(null);

  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const sample = useMemo(() => rows.slice(0, 50), [rows]);

  async function onPickFile(e) {
    setError("");
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);

    try {
      const buf = await f.arrayBuffer();
      const res = parseParcelRequestFileToRows(buf, f.name);
      setRows(res.rows || []);
    } catch (err) {
      setRows([]);
      setError(String(err?.message || err));
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ margin: 0 }}>택배 요청</h1>
      <div style={{ marginTop: 8, opacity: 0.8, fontSize: 13 }}>
        온라인 주문서(택배요청) 엑셀을 업로드해서 내용을 미리보기 합니다.
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onPickFile} />
        <div style={{ fontSize: 12, opacity: 0.8 }}>{fileName ? `선택: ${fileName}` : ""}</div>
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
        다음 단계: 이 택배요청 rows를 “출고 Job”으로 변환해서 백엔드로 생성(작지 생성) 연결.
      </div>
    </div>
  );
}

const td = {
  padding: 8,
  borderBottom: "1px solid #eee",
  verticalAlign: "top",
};
