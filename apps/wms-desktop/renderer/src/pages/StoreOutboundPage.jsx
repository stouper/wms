// apps/wms-desktop/renderer/src/pages/StoreOutboundPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useToasts } from "../lib/toasts.jsx";
import { jobsFlow } from "../workflows/jobs/jobs.workflow";
import { safeReadJson, safeReadLocal, safeWriteJson, safeWriteLocal } from "../lib/storage";
import { inputStyle, primaryBtn } from "../ui/styles";
import { Th, Td } from "../components/TableParts";
import { storeShipMode } from "../workflows/storeOutbound/storeOutbound.workflow";
import { addSku, pickSkuFromScan, printBoxLabel } from "../workflows/_common/print/packingBox";
import { openJobSheetA4PrintWindow } from "../workflows/_common/print";
import { storeLabel } from "../workflows/_common/storeMap";

const PAGE_KEY = "storeShip";

export default function StoreOutboundPage({ pageTitle = "매장 출고", defaultStoreCode = "" }) {
  const mode = storeShipMode;

  const { push, ToastHost } = useToasts();

  /**
   * ✅ 공통: 토스트 뜰 때 경고/에러 비프 (Inbound와 동일한 커버 범위)
   */
  const pushToast = (toast) => {
    if (!toast) return;
    try {
      const k = String(toast.kind || "").toLowerCase();
      if (k === "error" || k === "danger" || k === "fail" || k === "failed") playScanErrorBeep();
      else if (k === "warn" || k === "warning") playScanWarnBeep();
    } catch {
      // ignore
    }
    push(toast);
  };

  const createdKey = `wms.jobs.created.${PAGE_KEY}`;
  const selectedKey = `wms.jobs.selected.${PAGE_KEY}`;

  const [loading, setLoading] = useState(false);

  // ✅ UX: 스캔 피드백 (번쩍)
  const [flashTotals, setFlashTotals] = useState(false);
  const flashTimerRef = useRef(null);

  // ✅ undo 처리중
  const [undoing, setUndoing] = useState(false);

  // ✅ 스캔 로그(TX)
  const [scanTxLogs, setScanTxLogs] = useState([]);
  const [txLoading, setTxLoading] = useState(false);

  // ✅ 박스(팩킹리스트) 출력 관련
  const [boxNo, setBoxNo] = useState(1);
  const [boxItems, setBoxItems] = useState(() => new Map());

  // ✅ created = 서버(Job DB)에 존재하는 목록
  const [created, setCreated] = useState(() => safeReadJson(createdKey, []));
  const [selectedJobId, setSelectedJobId] = useState(() => safeReadLocal(selectedKey, "") || "");

  const [scanValue, setScanValue] = useState("");
  const [scanQty, setScanQty] = useState(1);
  const [scanLoc, setScanLoc] = useState(() => mode.defaultLocationCode || "");
  const [lastScan, setLastScan] = useState(null);

  const [showScanDebug, setShowScanDebug] = useState(false);
  const scanRef = useRef(null);

  const [approvingExtra, setApprovingExtra] = useState(false);

  useEffect(() => safeWriteJson(createdKey, created), [createdKey, created]);
  useEffect(() => safeWriteLocal(selectedKey, selectedJobId || ""), [selectedKey, selectedJobId]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  function triggerTotalsFlash() {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashTotals(true);
    flashTimerRef.current = setTimeout(() => setFlashTotals(false), 120);
  }

  /**
   * ✅ 비프 안정화 핵심 (Inbound와 동일)
   * - AudioContext 1개 재사용
   * - suspended면 resume
   * - 첫 1회 워밍업(무음 ping)으로 “최초 삑 씹힘” 방지
   */
  const audioCtxRef = useRef(null);
  const audioReadyRef = useRef(false);

  function getAudioCtx() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
    return audioCtxRef.current;
  }

  async function ensureAudioReady() {
    const ctx = getAudioCtx();
    if (!ctx) return false;

    try {
      if (ctx.state === "suspended") await ctx.resume();
      audioReadyRef.current = ctx.state === "running";
      return audioReadyRef.current;
    } catch {
      return false;
    }
  }

  async function warmUpAudioOnce() {
    if (audioReadyRef.current) return true;
    const ok = await ensureAudioReady();
    if (!ok) return false;

    const ctx = audioCtxRef.current;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.0001; // 거의 무음
      o.type = "sine";
      o.frequency.value = 440;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      setTimeout(() => {
        try {
          o.stop();
        } catch {}
      }, 30);
    } catch {
      // ignore
    }
    return true;
  }

  // ✅ 첫 사용자 입력에서 오디오 선워밍업 (Inbound와 동일)
  useEffect(() => {
    const kick = async () => {
      try {
        await warmUpAudioOnce();
      } catch {}
    };
    window.addEventListener("pointerdown", kick, { once: true, capture: true });
    window.addEventListener("keydown", kick, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", kick, { capture: true });
      window.removeEventListener("keydown", kick, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function safeBeep({ startHz, endHz, ms = 120, gain = 0.12, type = "square" }) {
    const ctx = getAudioCtx();
    if (!ctx) return;

    ensureAudioReady().then((ok) => {
      if (!ok) return;

      try {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        g.gain.value = gain;

        o.connect(g);
        g.connect(ctx.destination);

        const t0 = ctx.currentTime;
        o.frequency.setValueAtTime(startHz, t0);
        if (typeof endHz === "number") {
          o.frequency.setValueAtTime(endHz, t0 + 0.05);
        }

        o.start();
        setTimeout(() => {
          try {
            o.stop();
          } catch {}
          try {
            o.disconnect();
            g.disconnect();
          } catch {}
        }, ms);
      } catch {
        // ignore
      }
    });
  }

  // ✅ 성공음
  function playScanSuccessBeep() {
    safeBeep({ startHz: 900, endHz: 1300, ms: 120, gain: 0.1, type: "square" });
  }

  // ❌ 실패음
  function playScanErrorBeep() {
    safeBeep({ startHz: 500, endHz: null, ms: 160, gain: 0.12, type: "square" });
  }

  // ⚠️ 경고음
  function playScanWarnBeep() {
    safeBeep({ startHz: 800, endHz: null, ms: 140, gain: 0.1, type: "square" });
  }

  function unwrapJob(resp) {
    if (!resp) return null;
    if (resp?.job && typeof resp.job === "object") return resp.job;
    if (resp?.id) return resp;
    return null;
  }

  async function loadTx(jobId) {
    if (!jobId) return;
    setTxLoading(true);
    try {
      const txs = await jobsFlow.fetchTx({ jobId });
      setScanTxLogs(Array.isArray(txs) ? txs : []);
    } catch {
      setScanTxLogs([]);
    } finally {
      setTxLoading(false);
    }
  }

  async function loadJobsFromServer() {
    try {
      const listAll = await jobsFlow.listJobs();
      const normalized = (Array.isArray(listAll) ? listAll : []).map((x) => unwrapJob(x) || x).filter(Boolean);

      // ✅ Job.type 기준 필터링: OUTBOUND만
      const list = normalized.filter((j) => {
        return j.type === 'OUTBOUND';
      });

      setCreated(list);

      if (list.length) {
        const keep = selectedJobId && list.some((j) => j.id === selectedJobId);
        const nextId = keep ? selectedJobId : list[0].id;
        setSelectedJobId(nextId);

        await loadJob(nextId);
        await loadTx(nextId);
        setTimeout(() => scanRef.current?.focus?.(), 80);
      }
    } catch (e) {
      pushToast({ kind: "error", title: "Job 목록 로드 실패", message: e?.message || String(e) });
    }
  }

  useEffect(() => {
    loadJobsFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadJob(jobId) {
    if (!jobId) return;
    try {
      const jobObj = await jobsFlow.getJob(jobId);
      if (!jobObj) return;

      setCreated((prev) =>
        (Array.isArray(prev) ? prev : []).map((x) => {
          const cur = unwrapJob(x) || x;
          return cur?.id === jobId ? jobObj : cur;
        }),
      );
    } catch (e) {
      pushToast({ kind: "error", title: "Job 상세 로드 실패", message: e?.message || String(e) });
    }
  }

  async function deleteJob(jobId) {
    await jobsFlow.deleteJob(jobId);
    return true;
  }

  const normalizedCreated = useMemo(() => {
    const arr = Array.isArray(created) ? created : [];
    return arr.map((x) => unwrapJob(x) || x).filter(Boolean);
  }, [created]);

  const selectedJob = useMemo(
    () => normalizedCreated.find((x) => x.id === selectedJobId) || null,
    [normalizedCreated, selectedJobId],
  );

  const totals = useMemo(() => {
    const items = Array.isArray(selectedJob?.items) ? selectedJob.items : [];
    let planned = 0;
    let picked = 0;
    for (const it of items) {
      planned += Number(it?.qtyPlanned || 0);
      picked += Number(it?.qtyPicked || 0);
    }
    const remaining = Math.max(0, planned - picked);
    const pct = planned > 0 ? Math.min(100, Math.round((picked / planned) * 100)) : 0;
    return { planned, picked, remaining, pct };
  }, [selectedJob]);

  async function approveExtra(jobItemId, qty = 1) {
    if (!selectedJobId) throw new Error("jobId is required");

    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) throw new Error("qty must be > 0");

    setApprovingExtra(true);
    try {
      await jobsFlow.approveExtra({ jobId: selectedJobId, jobItemId, qty: n });
      pushToast({ kind: "success", title: "추가피킹 승인", message: `+${n} 승인 완료` });
      await loadJob(selectedJobId);
      await loadTx(selectedJobId);
    } finally {
      setApprovingExtra(false);
    }
  }

  // ✅ 직전취소(UNDO)
  async function doUndoLast() {
    await warmUpAudioOnce();

    if (!selectedJobId) {
      playScanWarnBeep();
      pushToast({ kind: "warn", title: "Job 선택", message: "먼저 Job을 선택해줘" });
      return;
    }

    playScanWarnBeep();
    const ok = window.confirm("직전 스캔(출고)을 취소할까?");
    if (!ok) return;

    setUndoing(true);
    try {
      const result = await jobsFlow.undoLast({ jobId: selectedJobId });

      if (result?.toast) pushToast(result.toast);
      else pushToast({ kind: "info", title: "UNDO", message: "마지막 스캔을 취소했어" });

      triggerTotalsFlash();
      await loadJob(selectedJobId);
      await loadTx(selectedJobId);

      setLastScan(null);
      setTimeout(() => scanRef.current?.focus?.(), 50);

      playScanSuccessBeep();
    } catch (e) {
      playScanErrorBeep();
      pushToast({ kind: "error", title: "UNDO 실패", message: e?.message || String(e) });
    } finally {
      setUndoing(false);
    }
  }

  async function doScan() {
    // ✅ Outbound도 Inbound처럼: 워밍업 완료까지 대기(첫 삑 씹힘 방지)
    await warmUpAudioOnce();

    if (!selectedJobId) {
      playScanWarnBeep();
      pushToast({ kind: "warn", title: "Job 선택", message: "먼저 Job을 선택해줘" });
      return;
    }

    const val = scanValue.trim();
    if (!val) return;

    const qty = Number(scanQty || 1);
    const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
    const loc = (scanLoc || "").trim();

    setLoading(true);
    try {
      if (typeof mode?.scan !== "function") {
        throw new Error("mode.scan이 없습니다. workflows/storeOutbound/storeOutbound.workflow.js 확인해줘.");
      }

      const result = await mode.scan({
        jobId: selectedJobId,
        value: val,
        qty: safeQty,
        locationCode: loc,
        confirm: (msg) => {
          playScanWarnBeep();
          return window.confirm(msg);
        },
      });

      if (!result?.ok) {
        playScanErrorBeep();
        pushToast({ kind: "error", title: "처리 실패", message: result?.error || "unknown error" });
        return;
      }

      playScanSuccessBeep();
      triggerTotalsFlash();

      if (result.lastScan !== undefined) setLastScan(result.lastScan);
      if (result.toast) pushToast(result.toast);

      // ✅ 박스 아이템 누적(기존 기능 유지)
      const sku = pickSkuFromScan(result.lastScan);
      if (sku) {
        setBoxItems((prev) => addSku(prev, sku, safeQty));
      }

      if (result.resetScan) {
        setScanValue("");
        scanRef.current?.focus?.();
      }

      if (result.reloadJob) await loadJob(selectedJobId);
      await loadTx(selectedJobId);
    } catch (e) {
      playScanErrorBeep();
      pushToast({ kind: "error", title: "처리 실패", message: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  }

  function TotalsCards() {
    const boxBase = {
      border: "1px solid #e5e7eb",
      borderRadius: 14,
      background: flashTotals ? "#eff6ff" : "#fff",
      padding: 14,
      minWidth: 200,
      flex: 1,
      boxShadow: flashTotals ? "0 0 14px rgba(59,130,246,0.9)" : "none",
      transform: flashTotals ? "translateY(-1px)" : "translateY(0px)",
      transition: "all 120ms ease",
    };

    const bigNum = { fontSize: 28, fontWeight: 900, lineHeight: 1.1, letterSpacing: -0.5 };
    const label = { fontSize: 12, color: "#64748b", fontWeight: 800 };

    return (
      <div style={{ display: "flex", gap: 10, flex: 1, justifyContent: "flex-end" }}>
        <div style={boxBase}>
          <div style={label}>총 Planned</div>
          <div style={bigNum}>{totals.planned}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>
            남은 수량: <b>{totals.remaining}</b>
          </div>
        </div>

        <div style={boxBase}>
          <div style={label}>총 Picked</div>
          <div style={bigNum}>{totals.picked}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>
            진행률: <b>{totals.pct}%</b>
          </div>
        </div>
      </div>
    );
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

  // ✅ Inbound 스타일: Job 목록만 (TX는 아래 TxLogs로 분리)
  function JobsRow() {
    if (!normalizedCreated.length) return null;

    return (
      <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>Job 목록(DB)</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            count: <b>{normalizedCreated.length}</b>
          </div>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 6 }}>
          {normalizedCreated.map((j) => {
            const isSel = j.id === selectedJobId;

            return (
              <div
                key={j.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  borderRadius: 999,
                  border: isSel ? "2px solid #0ea5e9" : "1px solid #e5e7eb",
                  background: isSel ? "#f0f9ff" : "#fff",
                  padding: "8px 10px",
                  minWidth: 240,
                  flex: "0 0 auto",
                }}
              >
                <button
                  type="button"
                  onClick={async () => {
                    await warmUpAudioOnce();
                    setSelectedJobId(j.id);
                    await loadJob(j.id);
                    await loadTx(j.id);
                    setTimeout(() => scanRef.current?.focus?.(), 50);
                  }}
                  style={{ all: "unset", cursor: "pointer", flex: 1, minWidth: 0 }}
                  title={j.id}
                >
                  <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {j.title || "Job"}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                    store <b>{storeLabel(j.storeCode || defaultStoreCode)}</b> · <b>{j.status}</b>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    await warmUpAudioOnce();
                    playScanWarnBeep();

                    const ok = confirm("이 작지를 삭제할까?");
                    if (!ok) return;
                    try {
                      setLoading(true);
                      await deleteJob(j.id);
                      await loadJobsFromServer();
                      pushToast({ kind: "success", title: "삭제", message: "작지를 삭제했어" });
                    } catch (err) {
                      playScanErrorBeep();
                      pushToast({ kind: "error", title: "삭제 실패", message: err?.message || String(err) });
                    } finally {
                      setLoading(false);
                    }
                  }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: 12,
                    whiteSpace: "nowrap",
                  }}
                >
                  삭제
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function JobDetail() {
    if (!selectedJob) return null;
    const items = Array.isArray(selectedJob.items) ? selectedJob.items : [];

    return (
      <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>선택된 Job 상세</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            store: <b>{storeLabel(selectedJob.storeCode || defaultStoreCode)}</b> · status: <b>{selectedJob.status}</b> · id:{" "}
            {selectedJob.id}
          </div>
        </div>

        {items.length ? (
          <div style={{ marginTop: 10, maxHeight: 420, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <Th>sku</Th>
                  <Th align="right">planned</Th>
                  <Th align="right">picked</Th>
                  <Th align="right">extra</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const remaining = Math.max(0, (it.qtyPlanned || 0) - (it.qtyPicked || 0));
                  const canExtra = remaining === 0;
                  const approved = getApprovedQty(it);

                  return (
                    <tr key={it.id}>
                      <Td>{it?.sku?.sku || it.skuCode || it.makerCodeSnapshot || it.id}</Td>
                      <Td align="right">{it.qtyPlanned}</Td>
                      <Td align="right">{it.qtyPicked}</Td>

                      <Td align="right">
                        {canExtra ? (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minWidth: 160 }}>
                            <div style={{ fontSize: 12, color: "#64748b", textAlign: "left" }}>
                              승인됨: <b>{approved}</b>
                            </div>

                            <button
                              type="button"
                              disabled={approvingExtra}
                              onClick={async () => {
                                await warmUpAudioOnce();
                                playScanWarnBeep();
                                try {
                                  await approveExtra(it.id, 1);
                                } catch (err) {
                                  playScanErrorBeep();
                                  pushToast({ kind: "error", title: "추가피킹 승인 실패", message: err?.message || String(err) });
                                }
                              }}
                              style={{
                                padding: "6px 10px",
                                borderRadius: 10,
                                border: "1px solid #e5e7eb",
                                background: "#fff",
                                cursor: "pointer",
                                fontSize: 12,
                                whiteSpace: "nowrap",
                              }}
                            >
                              +1
                            </button>
                          </div>
                        ) : (
                          <span style={{ opacity: 0.5 }}>-</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>items가 없어. (job 상세 조회 응답 확인 필요)</div>
        )}
      </div>
    );
  }

  // ✅ Inbound처럼: 스캔 로그를 별도 섹션으로 분리
  function TxLogs() {
    if (!selectedJobId) return null;

    return (
      <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>스캔 로그</div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              disabled={txLoading || undoing || loading || !selectedJobId}
              onClick={async () => {
                await warmUpAudioOnce();
                await loadTx(selectedJobId);
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                fontSize: 12,
                whiteSpace: "nowrap",
              }}
            >
              새로고침
            </button>

            <button
              type="button"
              disabled={txLoading || undoing || loading || !selectedJobId || !scanTxLogs.length}
              onClick={async () => {
                await warmUpAudioOnce();
                playScanWarnBeep();
                const ok = window.confirm("이 Job의 스캔 로그를 전부 취소(UNDO ALL)할까?");
                if (!ok) return;

                setUndoing(true);
                try {
                  await jobsFlow.undoAll({ jobId: selectedJobId });
                  pushToast({ kind: "info", title: "UNDO ALL", message: "전체 취소 완료" });
                  triggerTotalsFlash();
                  await loadJob(selectedJobId);
                  await loadTx(selectedJobId);
                  playScanSuccessBeep();
                } catch (e) {
                  playScanErrorBeep();
                  pushToast({ kind: "error", title: "UNDO ALL 실패", message: e?.message || String(e) });
                } finally {
                  setUndoing(false);
                }
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                fontSize: 12,
                whiteSpace: "nowrap",
              }}
            >
              (전체취소)
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ maxHeight: 260, overflow: "auto" }}>
            {!scanTxLogs.length ? (
              <div style={{ padding: 12, fontSize: 12, color: "#64748b" }}>{txLoading ? "불러오는 중..." : "아직 스캔 로그가 없어."}</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <Th>time</Th>
                    <Th>type</Th>
                    <Th align="right">qty</Th>
                    <Th>location</Th>
                    <Th>sku</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {scanTxLogs.map((tx, idx) => {
                    const t = tx?.createdAt ? new Date(tx.createdAt) : null;
                    const time = t ? t.toLocaleTimeString() : "-";
                    const type = tx?.type || tx?.kind || "-";
                    const qty = tx?.qty ?? tx?.deltaQty ?? "-";
                    const loc = tx?.locationCode || tx?.location?.code || tx?.locationId || "-";
                    const sku = tx?.skuCode || tx?.sku?.sku || tx?.sku?.makerCode || tx?.makerCode || tx?.jobItemId || "-";
                    const undoCount = idx + 1;

                    return (
                      <tr key={tx.id || idx}>
                        <Td style={{ fontSize: 12, color: "#64748b" }}>{time}</Td>
                        <Td style={{ fontSize: 12 }}>{type}</Td>
                        <Td align="right" style={{ fontSize: 12 }}>
                          {qty}
                        </Td>
                        <Td style={{ fontSize: 12 }}>{loc}</Td>
                        <Td style={{ fontSize: 12 }}>{sku}</Td>
                        <Td align="right">
                          <button
                            type="button"
                            disabled={undoing || loading || !selectedJobId}
                            onClick={async () => {
                              await warmUpAudioOnce();
                              playScanWarnBeep();

                              const msg =
                                undoCount === 1
                                  ? "직전 스캔 1건을 취소할까?"
                                  : `최근 스캔 ${undoCount}건을 취소(여기까지 연속)할까?`;

                              const ok = window.confirm(msg);
                              if (!ok) return;

                              setUndoing(true);
                              try {
                                if (undoCount === 1) {
                                  await jobsFlow.undoLast({ jobId: selectedJobId });
                                } else {
                                  await jobsFlow.undoUntil({ jobId: selectedJobId, txId: tx.id });
                                }

                                pushToast({ kind: "info", title: "UNDO", message: `취소 완료 (${undoCount}건)` });
                                triggerTotalsFlash();
                                await loadJob(selectedJobId);
                                await loadTx(selectedJobId);
                                setLastScan(null);
                                playScanSuccessBeep();
                              } catch (e) {
                                playScanErrorBeep();
                                pushToast({ kind: "error", title: "UNDO 실패", message: e?.message || String(e) });
                              } finally {
                                setUndoing(false);
                              }
                            }}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 10,
                              border: "1px solid #e5e7eb",
                              background: "#fff",
                              cursor: "pointer",
                              fontSize: 12,
                              whiteSpace: "nowrap",
                            }}
                            title={undoCount === 1 ? "직전취소" : "여기까지 연속취소"}
                          >
                            취소
                          </button>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <ToastHost />

      {/* ✅ 헤더: Inbound처럼 "타이틀 + 새로고침" */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>{pageTitle || mode.title}</h1>

        <button
          type="button"
          style={{ ...primaryBtn, padding: "8px 10px" }}
          onClick={async () => {
            await warmUpAudioOnce();
            loadJobsFromServer();
          }}
          disabled={loading}
        >
          Job 새로고침
        </button>

        {/* ✅ A4 작업지시서 출력 (기능 유지) */}
        <button
          type="button"
          style={{ ...primaryBtn, padding: "8px 10px", background: "#fbfcf8ff" }}
          disabled={loading || !selectedJob || !(Array.isArray(selectedJob?.items) && selectedJob.items.length)}
          onClick={async () => {
            await warmUpAudioOnce();

            const job = selectedJob;
            const items = Array.isArray(job?.items) ? job.items : [];

            const payload = {
              jobTitle: job?.title || "매장 출고 작업지시서",
              jobId: job?.id || "",
              storeCode: job?.storeCode || "",
              storeName: "",
              memo: job?.memo || "",
              createdAt: job?.createdAt || new Date().toISOString(),
              doneAt: job?.doneAt || "",
              items: items.map((it) => ({
                skuCode: it?.sku?.sku || it?.skuCode || "",
                makerCode: it?.sku?.makerCode || it?.makerCodeSnapshot || "",
                name: it?.sku?.name || it?.nameSnapshot || "",
                qtyPlanned: Number(it?.qtyPlanned ?? 0),
                qtyPicked: Number(it?.qtyPicked ?? 0),
                locationCode: "",
              })),
            };

            openJobSheetA4PrintWindow(payload);
          }}
        >
          A4 작업지시서
        </button>

        {/* ✅ 박스 마감 (기능 유지) */}
        <button
          type="button"
          style={{ ...primaryBtn, padding: "8px 10px", background: "#fbfcf8ff" }}
          disabled={loading || !selectedJob || boxItems.size === 0}
          onClick={async () => {
            await warmUpAudioOnce();

            const ok = await printBoxLabel({
              job: selectedJob,
              boxNo,
              boxItems,
              push,
              sendRaw: window.wms.sendRaw,
            });
            if (ok) {
              setBoxNo((n) => n + 1);
              setBoxItems(new Map());
            }
          }}
        >
          박스 마감
        </button>
      </div>

      <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
        매장출고: <b>locationCode 선택</b> / 업로드·작지생성은 대시보드에서 진행
      </div>

      <JobsRow />

      {/* ✅ Scan (Inbound와 동일 위치/형태) */}
      <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>스캔</div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", minWidth: 520 }}>
            <input
              ref={scanRef}
              value={scanValue}
              onChange={(e) => setScanValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                e.stopPropagation();
                doScan();
              }}
              onFocus={() => warmUpAudioOnce()}
              placeholder="barcode/skuCode"
              style={{ ...inputStyle, width: 320 }}
            />

            <input
              value={scanQty}
              onChange={(e) => setScanQty(e.target.value)}
              placeholder="qty"
              style={{ ...inputStyle, width: 90 }}
              inputMode="numeric"
              onFocus={() => warmUpAudioOnce()}
            />

            <input
              value={scanLoc}
              onChange={(e) => setScanLoc(e.target.value)}
              placeholder="locationCode (선택)"
              style={{ ...inputStyle, width: 180 }}
              onFocus={() => warmUpAudioOnce()}
            />

            <button type="button" style={primaryBtn} onClick={doScan} disabled={loading || !selectedJobId}>
              스캔 처리
            </button>
          </div>

          <div style={{ flex: 1, opacity: selectedJob ? 1 : 0.55 }}>
            <TotalsCards />
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 13 }}>
          {!lastScan ? (
            <div style={{ fontSize: 12, color: "#64748b" }}>스캔 결과가 여기에 표시돼.</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 900 }}>결과:</span>
                <span style={{ padding: "2px 8px", border: "1px solid #e5e7eb", borderRadius: 999 }}>
                  {lastScan.status || (lastScan.ok ? "OK" : "ERROR")}
                </span>

                <span style={{ color: "#64748b" }}>loc:</span> <b>{lastScan.usedLocationCode || "-"}</b>
                <span style={{ color: "#64748b" }}>sku:</span> <b>{lastScan.sku?.sku || lastScan.sku?.makerCode || "-"}</b>

                {Number.isFinite(lastScan.picked?.qtyPicked) && Number.isFinite(lastScan.picked?.qtyPlanned) ? (
                  <>
                    <span style={{ color: "#64748b" }}>picked:</span>{" "}
                    <b>
                      {lastScan.picked.qtyPicked}/{lastScan.picked.qtyPlanned}
                    </b>
                  </>
                ) : null}

                <button
                  type="button"
                  onClick={doUndoLast}
                  disabled={undoing || loading || !selectedJobId}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: undoing ? "#f1f5f9" : "#fff",
                    cursor: undoing ? "not-allowed" : "pointer",
                    fontSize: 12,
                    whiteSpace: "nowrap",
                  }}
                  title="마지막 스캔을 취소(UNDO)"
                >
                  (직전취소)
                </button>

                <button
                  type="button"
                  onClick={() => setShowScanDebug((v) => !v)}
                  style={{
                    marginLeft: "auto",
                    padding: "6px 10px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: 12,
                    whiteSpace: "nowrap",
                  }}
                >
                  {showScanDebug ? "디버그 숨김" : "디버그 보기"}
                </button>
              </div>

              {showScanDebug ? (
                <pre style={{ marginTop: 8, marginBottom: 0, whiteSpace: "pre-wrap", fontSize: 12, color: "#64748b" }}>
                  {JSON.stringify(lastScan, null, 2)}
                </pre>
              ) : null}
            </>
          )}
        </div>
      </div>

      <JobDetail />
      <TxLogs />
    </div>
  );
}
