import { parseJobFileToRows } from "../_common/excel/parseStoreOutbound";

export async function runStoreOutbound({ file }) {
  try {
    if (!file) return { ok: false, error: "파일이 필요합니다", level: "warn" };
    const parsed = await parseStoreOutboundFromFile(file);
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, error: e?.message || "처리 실패", level: "error" };
  }
}

export async function parseStoreOutboundFromFile(file) {
  if (!file) throw new Error("file is required");
  const buf = await file.arrayBuffer();
  return parseJobFileToRows(buf, file.name || "");
}

function getApprovedQty(it) {
  const v =
    it?.extraApproved ??
    it?.approvedQty ??
    it?.qtyApproved ??
    it?.extraApprovedQty ??
    it?.extra?.approved ??
    it?.approved ??
    0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export const storeShipMode = {
  key: "storeShip",
  title: "매장 출고",
  sheetName: "WORK",

  validateUpload({ jobKind }) {
    const raw = String(jobKind ?? "").trim();
    const norm = raw.replace(/<</g, "").trim();
    if (norm === "반품") {
      return { ok: false, error: "반품작지는 [창고 입고] 메뉴에서 업로드하세요." };
    }
    return { ok: true };
  },

  
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
      console.log("DEBUG rows[0] =", rows?.[0]); // 
      const job = await postJson(`${apiBase}/jobs`, { storeCode, title: title || this.title });
      const jobId = job?.id;
      if (!jobId) throw new Error("jobId가 없어. /jobs 응답을 확인해줘.");

      // ✅ makerCode/name을 반드시 같이 보낸다 (undefined 방지로 문자열 강제)
      
      await postJson(`${apiBase}/jobs/${jobId}/items`, {
        items: rows.map((r) => ({
          skuCode: String(r?.skuCode ?? "").trim(),
          qty: Number(r?.qty ?? 0),

          makerCode: String(r?.makerCode ?? r?.maker ?? "").trim(),
          name: String(r?.name ?? r?.itemName ?? "").trim(),
        })),
      });

      const full = await fetchJson(`${apiBase}/jobs/${jobId}`);
      createdJobs.push(full);
    }

    return createdJobs;
  },

  // ===== helpers =====
  _norm(v) {
    return String(v ?? "").trim();
  },

  _parseNeedFromMsg(msg) {
    const m = String(msg || "").match(/need\s+(\d+)/i);
    if (m?.[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 1;
  },

  _matchJobItem(job, value) {
    const v = this._norm(value);
    if (!job?.items?.length) return null;

    const up = v.toUpperCase();
    return (
      job.items.find((it) => this._norm(it?.sku?.sku).toUpperCase() === up) ||
      job.items.find((it) => this._norm(it?.skuCode).toUpperCase() === up) ||
      job.items.find((it) => this._norm(it?.makerCodeSnapshot) === v) ||
      job.items.find((it) => this._norm(it?.sku?.makerCode) === v) ||
      null
    );
  },

  async _ensureAllowOverpick({ apiBase, jobId, patchJson }) {
    await patchJson(`${apiBase}/jobs/${jobId}/allow-overpick`, { allowOverpick: true });
  },

  async _approveExtraByValue({ apiBase, jobId, value, qtyNeed, postJson, fetchJson }) {
    const full = await fetchJson(`${apiBase}/jobs/${jobId}`);
    const job = full?.job || full;
    const item = this._matchJobItem(job, value);

    if (!item?.id) {
      throw new Error("extra 승인 실패: jobItemId를 찾지 못했어. (job.items에서 해당 SKU 라인 없음)");
    }

    await postJson(`${apiBase}/jobs/${jobId}/approve-extra`, { jobItemId: item.id, qty: qtyNeed });
    return item.id;
  },

  async scan({ apiBase, jobId, value, qty = 1, locationCode = "", postJson, patchJson, confirm, fetchJson }) {
  const body = {
    value,
    qty,
    ...(locationCode ? { locationCode } : {}),
  };

  const is409 = (msg) => /\b409\b/.test(String(msg)) || /Conflict/i.test(String(msg));

  const unwrapJob = (full) => (full?.job && typeof full.job === "object" ? full.job : full);

  try {
    const res = await postJson(`${apiBase}/jobs/${jobId}/items/scan`, body);

    // ✅ 기존: NO_LOCATION이면 UNASSIGNED로 강제 출고
    if (res?.status === "NEED_FORCE_OUT") {
      const ok = confirm(
        res?.message ||
          "해당 SKU는 어느 로케이션에도 재고가 없습니다.\nUNASSIGNED로 강제 출고할까요?"
      );
      if (!ok) {
        return { ok: true, toast: { kind: "warn", title: "중단", message: "강제 출고 안 함" } };
      }

      const res2 = await postJson(`${apiBase}/jobs/${jobId}/items/scan`, {
        ...body,
        force: true,
        forceReason: "NO_LOCATION",
      });

      return {
        ok: true,
        lastScan: res2,
        toast: { kind: "warn", title: "강제 출고(UNASSIGNED)", message: `${value} -${qty} @UNASSIGNED` },
        resetScan: true,
        reloadJob: true,
      };
    }

    return {
      ok: true,
      lastScan: res,
      toast: {
        kind: "success",
        title: "피킹 처리",
        message: `${value} -${qty} @${res?.usedLocationCode || locationCode || "-"}`,
      },
      resetScan: true,
      reloadJob: true,
    };
  } catch (e) {
    const msg = e?.message || String(e);

    // ✅ 핵심: 409(Conflict)이면 extra/없는 SKU 처리 루트로 연결
    if (!is409(msg)) throw new Error(msg);

    // 1) 최신 job 다시 읽어서 "작지에 있는지"부터 판단
    const full = await fetchJson(`${apiBase}/jobs/${jobId}`);
    const job = unwrapJob(full);
    const hit = this._matchJobItem(job, value);

    // -------------------------
    // A) 작지에 있는 SKU인데 409: 보통 planned 초과(=extra 필요) 케이스
    // -------------------------
    if (hit) {
      const planned = Number(hit.qtyPlanned || 0);
      const picked = Number(hit.qtyPicked || 0);
      const approved = getApprovedQty(hit);
      const q = Number(qty || 1);
      const nextPicked = picked + q;

      // (A-1) 승인분 내에서 초과면 => force:true 로 재시도
      if (nextPicked > planned && nextPicked <= planned + approved) {
        const res2 = await postJson(`${apiBase}/jobs/${jobId}/items/scan`, {
          ...body,
          force: true,
          forceReason: "approved-extra",
        });

        return {
          ok: true,
          lastScan: res2,
          toast: { kind: "success", title: "승인분으로 추가 피킹", message: `${value} -${qty}` },
          resetScan: true,
          reloadJob: true,
        };
      }

      // (A-2) 승인분도 부족하면 => 추가 승인(+need) 후 force 재시도
      if (nextPicked > planned + approved) {
        const need = nextPicked - (planned + approved);
        const ok = confirm(
          `⚠️ 계획 초과 피킹이야.\n\n` +
            `planned: ${planned}\n` +
            `picked: ${picked}\n` +
            `approved(extra): ${approved}\n` +
            `이번: +${q}\n` +
            `추가 승인 필요: +${need}\n\n` +
            `추가 승인하고 계속할까?`
        );
        if (!ok) {
          return { ok: true, toast: { kind: "warn", title: "중단", message: "추가 승인 안 함" }, resetScan: true };
        }

        await this._ensureAllowOverpick({ apiBase, jobId, patchJson });
        await postJson(`${apiBase}/jobs/${jobId}/approve-extra`, { jobItemId: hit.id, qty: need });

        const res3 = await postJson(`${apiBase}/jobs/${jobId}/items/scan`, {
          ...body,
          force: true,
          forceReason: "approved-extra",
        });

        return {
          ok: true,
          lastScan: res3,
          toast: { kind: "success", title: "추가 승인 후 피킹", message: `${value} -${qty}` },
          resetScan: true,
          reloadJob: true,
        };
      }

      // 여기까지 왔는데도 409면: 그냥 force로 한 번 더 시도(보수적)
      const okForce = confirm(`⚠️ 처리 충돌(409)이야.\nforce로 다시 시도할까?\n\n${msg}`);
      if (!okForce) return { ok: true, toast: { kind: "warn", title: "중단", message: "재시도 안 함" }, resetScan: true };

      const res4 = await postJson(`${apiBase}/jobs/${jobId}/items/scan`, {
        ...body,
        force: true,
        forceReason: "retry-409",
      });

      return {
        ok: true,
        lastScan: res4,
        toast: { kind: "warn", title: "재시도(force)", message: `${value} -${qty}` },
        resetScan: true,
        reloadJob: true,
      };
    }

    // -------------------------
    // B) 작지에 없는 SKU인데 409: UNASSIGNED 생성/승인 후 force 재시도
    // -------------------------
    const ok2 = confirm(
      `⚠️ 작지에 없는 항목이야.\n\nvalue: ${value}\nqty: ${qty}\n\nUNASSIGNED로 추가 승인 후 처리할까?`
    );
    if (!ok2) {
      return { ok: true, toast: { kind: "warn", title: "중단", message: "작지 외 처리 안 함" }, resetScan: true };
    }

    await this._ensureAllowOverpick({ apiBase, jobId, patchJson });

    // ✅ 여기서 qtyNeed 키로 넘겨야 함 (너 함수 시그니처가 qtyNeed)
    await this._approveExtraByValue({
      apiBase,
      jobId,
      value,
      qtyNeed: Number(qty || 1),
      postJson,
      fetchJson,
    });

    const res5 = await postJson(`${apiBase}/jobs/${jobId}/items/scan`, {
      ...body,
      force: true,
      forceReason: "unassigned",
    });

    return {
      ok: true,
      lastScan: res5,
      toast: { kind: "success", title: "UNASSIGNED 처리", message: `${value} -${qty} @UNASSIGNED` },
      resetScan: true,
      reloadJob: true,
    };
  }
}
};
