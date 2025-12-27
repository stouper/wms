// apps/wms-desktop/renderer/src/workflows/_common/print/jobSheet.a4.js
// ✅ A4 작업지시서(HTML) 출력용: window.open → window.print
// - 라벨(ZPL/TSPL)과 별개로 "일반 프린터 A4" 출력용

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function fmtDate(d) {
  if (!d) return "";
  try {
    const x = new Date(d);
    if (!Number.isFinite(x.getTime())) return String(d);
    // 로컬 표시(서울 기준은 OS 설정 따라감)
    return x.toLocaleString();
  } catch {
    return String(d);
  }
}

/**
 * items: Array<{
 *   skuCode?: string; makerCode?: string; name?: string;
 *   qtyPlanned?: number; qtyPicked?: number; qty?: number;
 *   locationCode?: string;
 * }>
 */
export function renderJobSheetA4Html({
  jobTitle = "작업지시서",
  jobId = "",
  storeCode = "",
  storeName = "",
  memo = "",
  createdAt = "",
  doneAt = "",
  items = [],
}) {
  const safeTitle = esc(jobTitle);
  const safeJobId = esc(jobId);
  const safeStoreLine = esc(storeName ? `${storeName}` : `STORE ${storeCode}`);
  const safeMemo = esc(memo);

  const rows = Array.isArray(items) ? items : [];
  const totalPlanned = rows.reduce((a, it) => a + Number(it?.qtyPlanned ?? it?.qty ?? 0), 0);
  const totalPicked = rows.reduce((a, it) => a + Number(it?.qtyPicked ?? 0), 0);

  const trHtml = rows
    .map((it, idx) => {
      const sku = esc(it?.skuCode || "");
      const maker = esc(it?.makerCode || "");
      const name = esc(it?.name || "");
      const loc = esc(it?.locationCode || "");
      const planned = Number(it?.qtyPlanned ?? it?.qty ?? 0) || 0;
      const picked = Number(it?.qtyPicked ?? 0) || 0;

      return `
        <tr>
          <td class="c">${idx + 1}</td>
          <td class="mono">${sku}</td>
          <td class="mono">${maker}</td>
          <td>${name}</td>
          <td class="c">${loc}</td>
          <td class="r">${planned}</td>
          <td class="r">${picked}</td>
          <td class="c"><div class="check"></div></td>
        </tr>
      `;
    })
    .join("");

  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    /* ---- A4 Print ---- */
    @page { size: A4; margin: 10mm; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }

    body {
      font-family: Arial, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
      font-size: 12pt;  /* ✅ 글씨 크게 */
      line-height: 1.25;
      color: #111;
      margin: 0;
      padding: 0;
    }

    .sheet {
      width: 100%;
    }

    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 2px solid #111;
    }

    .title {
      font-size: 22pt;
      font-weight: 800;
      letter-spacing: -0.2px;
      margin: 0;
    }

    .meta {
      font-size: 11pt;
      text-align: right;
      white-space: nowrap;
    }

    .meta div { margin: 2px 0; }

    .store {
      font-size: 14pt;
      font-weight: 700;
      margin-top: 4px;
    }

    .sub {
      margin: 6px 0 10px 0;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      font-size: 11pt;
    }

    .pill {
      border: 1px solid #111;
      border-radius: 999px;
      padding: 4px 10px;
      display: inline-flex;
      gap: 8px;
      align-items: center;
    }
    .pill b { font-weight: 800; }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 11pt;
    }
    thead th {
      border-bottom: 2px solid #111;
      padding: 6px 6px;
      text-align: left;
    }
    tbody td {
      border-bottom: 1px solid #bbb;
      padding: 6px 6px;
      vertical-align: top;
    }

    .c { text-align: center; }
    .r { text-align: right; }
    .mono { font-family: Consolas, Menlo, monospace; font-size: 10.5pt; }
    .check {
      width: 18px;
      height: 18px;
      border: 2px solid #111;
      margin: 0 auto;
    }

    .footer {
      margin-top: 10px;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 10.5pt;
    }

    .memo {
      flex: 1;
      border: 1px dashed #777;
      padding: 8px;
      min-height: 34px;
      white-space: pre-wrap;
    }

    .sign {
      width: 240px;
      border: 1px solid #111;
      padding: 8px;
      min-height: 70px;
    }
    .sign .label {
      font-weight: 700;
      margin-bottom: 6px;
    }

    /* 컬럼 폭 */
    col.no { width: 34px; }
    col.sku { width: 165px; }
    col.maker { width: 150px; }
    col.name { width: auto; }
    col.loc { width: 70px; }
    col.plan { width: 70px; }
    col.pick { width: 70px; }
    col.chk { width: 54px; }

    .btn {
      border: 1px solid #111;
      background: #fff;
      padding: 8px 12px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 11pt;
    }
  </style>
</head>

<body>
  <div class="sheet">
    <div class="header">
      <div>
        <h1 class="title">${safeTitle}</h1>
        <div class="store">${safeStoreLine}</div>
      </div>
      <div class="meta">
        <div><b>JOB</b> ${safeJobId}</div>
        <div><b>생성</b> ${esc(fmtDate(createdAt))}</div>
        ${doneAt ? `<div><b>완료</b> ${esc(fmtDate(doneAt))}</div>` : ""}
      </div>
    </div>

    <div class="sub">
      <span class="pill">총 지시 <b>${totalPlanned}</b></span>
      <span class="pill">피킹 <b>${totalPicked}</b></span>
      <span class="pill">라인 <b>${rows.length}</b></span>
      <button class="btn no-print" onclick="window.print()">인쇄</button>
      <button class="btn no-print" onclick="window.close()">닫기</button>
    </div>

    <table>
      <colgroup>
        <col class="no" />
        <col class="sku" />
        <col class="maker" />
        <col class="name" />
        <col class="loc" />
        <col class="plan" />
        <col class="pick" />
        <col class="chk" />
      </colgroup>
      <thead>
        <tr>
          <th class="c">#</th>
          <th>SKU</th>
          <th>바코드</th>
          <th>상품명</th>
          <th class="c">로케</th>
          <th class="r">지시</th>
          <th class="r">피킹</th>
          <th class="c">체크</th>
        </tr>
      </thead>
      <tbody>
        ${trHtml || `<tr><td colspan="8" class="c">아이템 없음</td></tr>`}
      </tbody>
    </table>

    <div class="footer">
      <div class="memo"><b>비고</b><br/>${safeMemo || ""}</div>
      <div class="sign">
        <div class="label">확인 / 서명</div>
        <div>피커: ____________________</div>
        <div style="margin-top:10px;">검수: ____________________</div>
      </div>
    </div>
  </div>

  <script>
    // 자동 출력 옵션: 필요하면 true로 바꿔서 사용
    const AUTO_PRINT = false;
    if (AUTO_PRINT) {
      window.onload = () => {
        setTimeout(() => window.print(), 150);
      };
    }
  </script>
</body>
</html>`;

  return html;
}

export function openJobSheetA4PrintWindow(payload) {
  const html = renderJobSheetA4Html(payload);

  // 1) 먼저 새 창 시도
  const w = window.open("", "_blank"); // 기존처럼
  if (w) {
    try {
      w.document.open();
      w.document.write(html);
      w.document.close();
      // 새 창 로드 후 프린트
      w.onload = () => {
        try {
          w.focus();
          w.print();
        } catch (e) {
          // ignore
        }
      };
      return;
    } catch (e) {
      // 새 창이 열렸는데 접근 실패하면 아래 iframe 폴백으로
      try {
        w.close();
      } catch {}
    }
  }

  // 2) ✅ 폴백: 현재 창에 숨김 iframe 만들어서 그 안에서 프린트
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    alert("프린트 환경을 만들 수 없습니다. (iframe 접근 실패)");
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      // 프린트 다이얼로그 뜬 다음 정리
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch {}
      }, 1000);
    }
  };
}
