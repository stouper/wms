export const storeShipMode = {
  key: "storeShip",
  title: "매장 출고",
  sheetName: "WORK",

  // ❗️반품 업로드 차단 (출고 전용)
  validateUpload({ jobKind }) {
    const raw = String(jobKind ?? "").trim();
    const norm = raw.replace(/<</g, "").trim(); // "반품<<", "출고<<" 정리

    if (norm === "반품") {
      return { ok: false, error: "반품작지는 [창고 입고] 메뉴에서 업로드하세요." };
    }
    return { ok: true };
  },

  // ✅ Job 생성: 출고 전용
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
    // value는 barcode/makerCode일 수도, skuCode일 수도 있음
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
    const job = full?.job || full; // {ok:true, job:{...}} or {...}
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

    try {
      const res = await postJson(`${apiBase}/jobs/${jobId}/items/scan`, body);

      // NEED_FORCE_OUT → 강제 출고(UNASSIGNED)
      if (res?.status === "NEED_FORCE_OUT") {
        const ok = confirm(
          res?.message ||
            "해당 SKU는 어느 로케이션에도 재고가 없습니다.\nUNASSIGNED로 강제 출고할까요?"
        );
        if (!ok) {
          return { ok: true, toast: { kind: "warn", title: "중단", message: "강제 출고 안 함" } };
        }

        // NOTE: 백엔드 DTO는 forceReason을 받음(InventoryTx 컬럼은 forcedReason으로 저장)
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
        toast: { kind: "success", title: "피킹 처리", message: `${value} -${qty} @${res?.usedLocationCode || locationCode || "-"}` },
        resetScan: true,
        reloadJob: true,
      };
    } catch (e1) {
      const msg = e1?.message || String(e1);

      const is409 = msg.includes("[409]") || msg.includes(" 409") || msg.includes("409");
      const isOverpick = msg.includes("OVERPICK");
      const isExtraNotApproved = msg.includes("EXTRA_NOT_APPROVED") || msg.includes("extra not approved");

      // 1) ✅ EXTRA_NOT_APPROVED: OK 누르면 자동 승인(+need) → scan 재시도
      if (is409 && isExtraNotApproved) {
        const need = this._parseNeedFromMsg(msg);

        const ok = confirm(
          `추가피킹 승인 필요.\n지금 +${need} 자동 승인하고 진행할까?\n\n${msg}`
        );
        if (!ok) return { ok: true, toast: { kind: "warn", title: "중단", message: "추가승인 안 함" } };

        // allowOverpick이 꺼져있을 수도 있으니 먼저 켜두는 게 안전
        await this._ensureAllowOverpick({ apiBase, jobId, patchJson });

        await this._approveExtraByValue({
          apiBase,
          jobId,
          value,
          qtyNeed: need,
          postJson,
          fetchJson,
        });

        const res2 = await postJson(`${apiBase}/jobs/${jobId}/items/scan`, body);

        return {
          ok: true,
          lastScan: res2,
          toast: { kind: "warn", title: "추가승인 후 출고", message: `${value} -${qty} @${res2?.usedLocationCode || locationCode || "-"}` },
          resetScan: true,
          reloadJob: true,
        };
      }

      // 2) ✅ OVERPICK/재고부족(409): OK 누르면 allowOverpick 켜고 재시도
      // (EXTRA_NOT_APPROVED는 위에서 먼저 처리)
      if (is409 || isOverpick || msg.includes("Insufficient stock")) {
        const ok = confirm(`전산재고 부족/오버픽 상황.\n이 Job에 오버픽(allowOverpick)을 허용하고 진행할까?\n\n${msg}`);
        if (!ok) return { ok: true, toast: { kind: "warn", title: "중단", message: "오버픽 허용 안 함" } };

        await this._ensureAllowOverpick({ apiBase, jobId, patchJson });

        // 여기서 바로 재시도하면, planned 초과면 EXTRA_NOT_APPROVED가 또 뜰 수 있음
        // 그건 위 로직(자동 승인)으로 다시 처리될 거야.
        const res2 = await postJson(`${apiBase}/jobs/${jobId}/items/scan`, body);

        return {
          ok: true,
          lastScan: res2,
          toast: { kind: "warn", title: "오버픽 출고", message: `${value} -${qty} @${res2?.usedLocationCode || locationCode || "-"}` },
          resetScan: true,
          reloadJob: true,
        };
      }

      return { ok: false, error: msg };
    }
  },
};
