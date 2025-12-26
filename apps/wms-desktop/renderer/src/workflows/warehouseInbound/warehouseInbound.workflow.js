import { parseJobFileToRows } from "../_common/excel/parseStoreOutbound";

export async function runWarehouseInbound({ file }) {
  try {
    if (!file) return { ok: false, error: "파일이 필요합니다", level: "warn" };
    const parsed = await parseWarehouseInboundFromFile(file);
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, error: e?.message || "처리 실패", level: "error" };
  }
}

export async function parseWarehouseInboundFromFile(file) {
  if (!file) throw new Error("file is required");
  const buf = await file.arrayBuffer();
  return parseJobFileToRows(buf, file.name || "");
}

const DEFAULT_RETURN_LOCATION = "RET-01";

export const whInboundMode = {
  key: "whInbound",
  title: "창고 입고",
  sheetName: "WORK",
  defaultLocationCode: DEFAULT_RETURN_LOCATION,

  // ❗️출고 업로드 차단 (반품/입고 전용)
  validateUpload({ jobKind }) {
    const raw = String(jobKind ?? "").trim();
    const norm = raw.replace(/<</g, "").trim(); // "출고<<", "반품<<" 정리

    if (norm === "출고") {
      return { ok: false, error: "출고작지는 [매장 출고] 메뉴에서 업로드하세요." };
    }
    return { ok: true };
  },

  // ✅ Job 생성: 입고 전용 (출고와 동일하게 makerCode/name까지 같이 보낸다)
  async createJobsFromPreview({ apiBase, previewRows, defaultStoreCode, title, postJson, fetchJson }) {
    const groups = new Map();
    for (const row of previewRows || []) {
      const store = String(row.storeCode || defaultStoreCode || "").trim();
      if (!store) continue;
      if (!groups.has(store)) groups.set(store, []);
      groups.get(store).push(row);
    }

    const entries = [...groups.entries()];
    if (!entries.length) throw new Error("storeCode 그룹이 없어. 엑셀(storeCode) 확인해줘.");

    const createdJobs = [];
    for (const [storeCode, rows] of entries) {
      const job = await postJson(`${apiBase}/jobs`, { storeCode, title: title || this.title });
      const jobId = job?.id;
      if (!jobId) throw new Error("jobId가 없어. /jobs 응답을 확인해줘.");

      // ✅ 출고와 동일: makerCode/name 포함 + 문자열 강제
      await postJson(`${apiBase}/jobs/${jobId}/items`, {
        items: rows.map((r) => ({
          skuCode: String(r?.skuCode ?? "").trim(),
          qty: Number(r?.qty ?? 0),

          // 헤더 흔들림 대비 (parse가 maker / itemName으로 줄 수도 있음)
          makerCode: String(r?.makerCode ?? r?.maker ?? "").trim(),
          name: String(r?.name ?? r?.itemName ?? "").trim(),
        })),
      });

      const full = await fetchJson(`${apiBase}/jobs/${jobId}`);
      createdJobs.push(full);
    }

    return createdJobs;
  },

  async scan({ apiBase, jobId, value, qty = 1, locationCode, postJson, fetchJson, confirm }) {
    // ✅ 반품입고: locationCode는 필수(대부분 RET-01 고정)
    const loc = String(locationCode || "").trim();
    if (!loc) {
      return { ok: false, error: `반품입고는 locationCode가 필수야. (예: ${DEFAULT_RETURN_LOCATION})` };
    }

    const nQty = Number(qty ?? 1);
    const safeQty = Number.isFinite(nQty) && nQty > 0 ? nQty : 1;

    // ✅ 경고 가드: (1) 작지 없음 (2) planned 초과 — 둘 다 "경고만" 띄우고 OK면 진행
    try {
      const _fetchJson =
        fetchJson ||
        (async (url) => {
          const r = await fetch(url);
          const t = await r.text();
          let data;
          try {
            data = JSON.parse(t);
          } catch {
            data = t;
          }
          if (!r.ok) {
            const msg = data?.message || data?.error || (typeof data === "string" ? data : r.statusText);
            throw new Error(`[${r.status}] ${msg}`);
          }
          return data;
        });

      const full = await _fetchJson(`${apiBase}/jobs/${jobId}`);
      const job = full?.job || full;
      const items = Array.isArray(job?.items) ? job.items : [];

      const norm = (s) => String(s || "").trim().toLowerCase();
      const scanned = norm(value);

      // ✅ 스캔값이 skuCode / makerCode / sku.sku 중 무엇이든 최대한 매칭
      const hit =
        items.find((it) => norm(it?.sku?.sku) === scanned) ||
        items.find((it) => norm(it?.skuCode) === scanned) ||
        items.find((it) => norm(it?.makerCodeSnapshot) === scanned) ||
        items.find((it) => norm(it?.sku?.makerCode) === scanned) ||
        null;

      // (1) 작지에 없는 항목 경고 (한 번)
      if (!hit) {
        const ask = typeof confirm === "function" ? confirm : (m) => window.confirm(m);
        const ok = ask(
          `⚠️ 작지에 없는 항목입니다.\n\nvalue: ${value}\nqty: +${safeQty}\n\n그래도 입고 처리할까요?`
        );
        if (!ok) {
          return {
            ok: true,
            cancelled: true,
            toast: { kind: "warn", title: "취소됨", message: "작지 외 입고를 취소했어" },
            resetScan: true,
          };
        }
      }

      // (2) planned 초과 경고 (한 번)
      if (hit) {
        const planned = Number(hit.qtyPlanned || 0);
        const picked = Number(hit.qtyPicked || 0);
        const nextPicked = picked + safeQty;

        if (nextPicked > planned) {
          const over = nextPicked - planned;
          const skuLabel = hit?.sku?.sku || hit?.skuCode || hit?.makerCodeSnapshot || value;

          const ask = typeof confirm === "function" ? confirm : (msg) => window.confirm(msg);
          const ok = ask(
            `⚠️ 계획 수량 초과 입고입니다.\n\n` +
              `SKU: ${skuLabel}\n` +
              `planned: ${planned}\n` +
              `현재: ${picked}\n` +
              `이번: +${safeQty}\n` +
              `초과: +${over}\n\n` +
              `그래도 계속할까요?`
          );

          if (!ok) {
            return {
              ok: true,
              cancelled: true,
              toast: { kind: "warn", title: "취소됨", message: "계획 초과 입고를 취소했어" },
              resetScan: true,
            };
          }
        }
      }
    } catch (e) {
      // 조회/가드 실패해도 업무 중단 방지 (경고 못 띄워도 receive는 진행)
      // console.warn("Inbound guard failed:", e?.message || e);
    }

    // ✅ 기존 백엔드 호출은 그대로
    const res = await postJson(`${apiBase}/jobs/${jobId}/receive`, {
      value,
      qty: safeQty,
      locationCode: loc,
    });

    return {
      ok: true,
      lastScan: res,
      toast: { kind: "success", title: "반품 처리", message: `${value} +${safeQty} @${loc}` },
      resetScan: true,
      reloadJob: true,
    };
  },
};
