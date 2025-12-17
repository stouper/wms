import React, { useState } from "react";
import { useToasts } from "../lib/toasts.jsx";
import { ymdKST } from "../lib/dates";
import { getApiBase } from "../lib/api";
import { primaryBtn, inputStyle } from "../ui/styles";

export default function DashboardPage() {
  const { push, ToastHost } = useToasts();
  const [dateYmd, setDateYmd] = useState(() => ymdKST(new Date())); // YYYY-MM-DD
  const [downloading, setDownloading] = useState(false);

  async function downloadExport() {
    const apiBase = getApiBase();
    const d = (dateYmd || "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      push({ kind: "error", title: "날짜 형식", message: "YYYY-MM-DD로 입력" });
      return;
    }

    try {
      setDownloading(true);

      // ✅ 서버에서 export-source JSON 가져오기
      const url = `${apiBase}/jobs/export-source?date=${encodeURIComponent(d)}`;
      const data = await tryJsonFetch(url);

      const jobs = Array.isArray(data) ? data : (data?.jobs || []);
      if (!Array.isArray(jobs) || jobs.length === 0) {
        push({ kind: "warn", title: "데이터 없음", message: `${d} 완료된 작지가 없어` });
        return;
      }

      // ✅ EPMS_OUT 포맷 CSV 만들기 (헤더 포함 / qtyPicked 기준)
      const csvText = buildEpmsOutCsvWithHeader({
        jobs,
        type: 1, // 출고=1 (반품이면 2로 바꾸면 됨)
        workDateYmd: d,
      });

      // ✅ 파일명: EPMS_OUT_YYYYMMDD.csv
      const filename = `EPMS_OUT_${d.replaceAll("-", "")}.csv`;
      downloadTextFile(filename, csvText, "text/csv;charset=utf-8");

      push({
        kind: "success",
        title: "EPMS Export",
        message: `${d} 완료작지 기준 CSV 다운로드 (qtyPicked 기준, 헤더 포함)`,
      });
    } catch (e) {
      push({
        kind: "error",
        title: "Export 실패",
        message: e?.message || String(e),
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <ToastHost />
      <h1 style={{ margin: 0 }}>데쉬보드</h1>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
        <h3 style={{ margin: "0 0 10px" }}>EPMS Export (완료된 작지 → EPMS_OUT CSV)</h3>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: "#64748b" }}>date</label>
          <input
            value={dateYmd}
            onChange={(e) => setDateYmd(e.target.value)}
            placeholder="YYYY-MM-DD"
            style={{ ...inputStyle, width: 140, fontFamily: "Consolas, monospace" }}
          />

          <button onClick={downloadExport} disabled={downloading} style={primaryBtn}>
            {downloading ? "다운로드 중..." : "EPMS_OUT CSV 다운로드"}
          </button>
        </div>

        <div style={{ marginTop: 8, fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
          - 기준: 특정 날짜의 <b>완료된 작지 전체</b>
          <br />
          - 수량: <b>qtyPicked(실제 출고)</b>
          <br />
          - 헤더: <b>설명형 헤더 포함</b>
          <br />
          - 포맷: A=1, B=YYYYMMDD, C=00, D=storeCode, E=00, F=makerCode, G=qty, H~J 빈칸
        </div>

        <div style={{ marginTop: 8, fontSize: 12, color: "#94a3b8" }}>
          ※ API는 코드/로컬스토리지(wms.apiBase)로만 관리되고 화면에는 표시되지 않습니다.
        </div>
      </div>
    </div>
  );
}

/**
 * ✅ 헤더 포함 EPMS_OUT CSV 생성
 * - 합산/그룹핑 금지: 아이템 1개 = CSV 1줄
 * - qtyPicked(실제 출고)만 사용 (0이면 제외)
 */
function buildEpmsOutCsvWithHeader({ jobs, type = 1, workDateYmd }) {
  const dateStr = String(workDateYmd || "").replaceAll("-", ""); // YYYYMMDD

  // ✅ 1번: 설명형 헤더 고정
  const header = [
    "출고구분(1:출고,2:반품)", // A
    "출고일자(YYYYMMDD)",     // B
    "창고코드(고정:00)",       // C
    "매장코드",               // D
    "행사코드(고정:00)",       // E
    "MAKER코드",              // F
    "수량(qtyPicked)",        // G
    "전표비고",                        // H
    "출고의뢰전표번호",                        // I
    "가격",                        // J
  ];

  const rows = [header];

  for (const job of jobs) {
    const storeCode = String(job.storeCode || job.store_code || "").trim();
    const items = job.items || job.jobItems || job.job_items || [];

    for (const it of items) {
      const maker = String(
        it.makerCodeSnapshot ||
          it.makerCode ||
          it.maker_code ||
          it.sku?.makerCode ||
          it.sku?.maker_code ||
          ""
      ).trim();

      const qtyPicked = Number(it.qtyPicked ?? it.qty_picked ?? 0);

      if (!storeCode || !maker || !Number.isFinite(qtyPicked) || qtyPicked <= 0) continue;

      rows.push([
        String(type),       // A
        dateStr,            // B
        "00",               // C
        storeCode,          // D
        "00",               // E
        maker,              // F
        String(qtyPicked),  // G
        "",                 // H
        "",                 // I
        "",                 // J
      ]);
    }
  }

  // BOM 포함 (엑셀/한글 호환)
  const csv = rows
    .map((cols) =>
      cols
        .map((v) => {
          const s = String(v ?? "");
          if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        })
        .join(",")
    )
    .join("\n");

  return "\uFEFF" + csv;
}

async function tryJsonFetch(url) {
  const r = await fetch(url);
  const t = await r.text().catch(() => "");
  let data = null;
  try {
    data = t ? JSON.parse(t) : null;
  } catch {
    data = t;
  }
  if (!r.ok) {
    const msg = data?.message || data?.error || (typeof data === "string" ? data : r.statusText);
    throw new Error(`[${r.status}] ${msg}`);
  }
  return data;
}

function downloadTextFile(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
