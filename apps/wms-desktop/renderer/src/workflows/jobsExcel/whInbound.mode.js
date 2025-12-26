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

  // ✅ Job 생성: 입고 전용
  async createJobsFromPreview({
    apiBase,
    previewRows,
    defaultStoreCode,
    title,
    postJson,
    fetchJson,
  }) {
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

      await postJson(`${apiBase}/jobs/${jobId}/items`, {
        items: rows.map((r) => ({
          skuCode: r.skuCode,
          qty: Number(r.qty),
        })),
      });

      const full = await fetchJson(`${apiBase}/jobs/${jobId}`);
      createdJobs.push(full);
    }

    return createdJobs;

  },

  async scan({
    apiBase,
    jobId,
    value,
    qty = 1,
    locationCode,
    postJson,
    fetchJson,
    confirm,
  }) {
    // ✅ 반품입고: locationCode는 필수(대부분 RET-01 고정)
    const loc = String(locationCode || "").trim();
    if (!loc) {
      return { ok: false, error: `반품입고는 locationCode가 필수야. (예: ${DEFAULT_RETURN_LOCATION})` };
    }

    const nQty = Number(qty ?? 1);
    const safeQty = Number.isFinite(nQty) && nQty > 0 ? nQty : 1;

    // ✅ planned 초과 입고(프런트 가드): 초과하면 confirm 받고 진행
    // - payload/endpoint는 그대로, "진행 전 확인"만 추가
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

      const job = await _fetchJson(`${apiBase}/jobs/${jobId}`);
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
            // ✅ 취소 시: 백엔드 호출 안 함 (프런트에서만 종료)
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
      // 조회/가드에서 실패해도 입고 자체를 막지는 않음(현장 업무 중단 방지)
      // 필요하면 여기서 warn toast로 바꿔도 됨.
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
