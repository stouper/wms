// apps/wms-desktop/renderer/src/pages/StoreReturnPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useToasts } from "../lib/toasts.jsx";
import { jobsFlow } from "../workflows/jobs/jobs.workflow";
import { safeReadJson, safeReadLocal, safeWriteJson, safeWriteLocal } from "../lib/storage";
import { inputStyle, primaryBtn } from "../ui/styles";
import { Th, Td } from "../components/TableParts";
import { storeReturnMode } from "../workflows/storeReturn/storeReturn.workflow";
import { jobStoreLabel, loadStores } from "../workflows/_common/storeMap";

const PAGE_KEY = "storeReturn";

export default function StoreReturnPage({ pageTitle = "매장 반품", defaultStoreCode = "" }) {
  const mode = storeReturnMode;

  const { push, ToastHost } = useToasts();

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
  const [undoing, setUndoing] = useState(false);
  const [scanTxLogs, setScanTxLogs] = useState([]);
  const [txLoading, setTxLoading] = useState(false);

  const [created, setCreated] = useState(() => safeReadJson(createdKey, []));
  const [selectedJobId, setSelectedJobId] = useState(() => safeReadLocal(selectedKey, "") || "");

  const [scanValue, setScanValue] = useState("");
  const [scanQty, setScanQty] = useState(1);
  const [scanLoc, setScanLoc] = useState(() => mode.defaultLocationCode || "RET-01");

  const [approvingExtra, setApprovingExtra] = useState(false);
  const [flashTotals, setFlashTotals] = useState(false);
  const flashTimerRef = useRef(null);
  const scanRef = useRef(null);

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
      g.gain.value = 0.0001;
      o.type = "sine";
      o.frequency.value = 440;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      setTimeout(() => { try { o.stop(); } catch {} }, 30);
    } catch {}
    return true;
  }

  useEffect(() => {
    const kick = async () => { try { await warmUpAudioOnce(); } catch {} };
    window.addEventListener("pointerdown", kick, { once: true, capture: true });
    window.addEventListener("keydown", kick, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", kick, { capture: true });
      window.removeEventListener("keydown", kick, { capture: true });
    };
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
        if (typeof endHz === "number") o.frequency.setValueAtTime(endHz, t0 + 0.05);
        o.start();
        setTimeout(() => {
          try { o.stop(); } catch {}
          try { o.disconnect(); g.disconnect(); } catch {}
        }, ms);
      } catch {}
    });
  }

  function playScanSuccessBeep() { safeBeep({ startHz: 900, endHz: 1300, ms: 120, gain: 0.1, type: "square" }); }
  function playScanErrorBeep() { safeBeep({ startHz: 500, endHz: null, ms: 160, gain: 0.12, type: "square" }); }
  function playScanWarnBeep() { safeBeep({ startHz: 800, endHz: null, ms: 140, gain: 0.1, type: "square" }); }

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
      const list = normalized.filter((j) => j.type === 'RETURN');
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
    loadStores();
    loadJobsFromServer();
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
    let planned = 0, picked = 0;
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
      pushToast({ kind: "success", title: "추가 입고 승인", message: `+${n} 승인 완료` });
      await loadJob(selectedJobId);
      await loadTx(selectedJobId);
    } finally {
      setApprovingExtra(false);
    }
  }

  async function doUndoLast() {
    await warmUpAudioOnce();
    if (!selectedJobId) {
      playScanWarnBeep();
      pushToast({ kind: "warn", title: "Job 선택", message: "먼저 Job을 선택해줘" });
      return;
    }
    playScanWarnBeep();
    const ok = window.confirm("직전 스캔(입고)을 취소할까?");
    if (!ok) return;

    setUndoing(true);
    try {
      const result = await jobsFlow.undoLast({ jobId: selectedJobId });
      if (result?.toast) pushToast(result.toast);
      else pushToast({ kind: "info", title: "UNDO", message: "마지막 스캔을 취소했어" });
      triggerTotalsFlash();
      await loadJob(selectedJobId);
      await loadTx(selectedJobId);
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
        throw new Error("mode.scan이 없습니다.");
      }
      const result = await mode.scan({
        jobId: selectedJobId,
        value: val,
        qty: safeQty,
        locationCode: loc,
        confirm: (msg) => { playScanWarnBeep(); return window.confirm(msg); },
      });

      if (!result?.ok) {
        playScanErrorBeep();
        pushToast({ kind: "error", title: "처리 실패", message: result?.error || "unknown error" });
        return;
      }

      playScanSuccessBeep();
      triggerTotalsFlash();
      if (result.toast) pushToast(result.toast);
      if (result.resetScan) { setScanValue(""); scanRef.current?.focus?.(); }
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
      border: "1px solid #e5e7eb", borderRadius: 14,
      background: flashTotals ? "#eff6ff" : "#fff", padding: 14, minWidth: 200, flex: 1,
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
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>남은 수량: <b>{totals.remaining}</b></div>
        </div>
        <div style={boxBase}>
          <div style={label}>총 Received</div>
          <div style={bigNum}>{totals.picked}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>진행률: <b>{totals.pct}%</b></div>
        </div>
      </div>
    );
  }

  function getApprovedQty(it) {
    const v = it?.extraApproved ?? it?.approvedQty ?? it?.qtyApproved ?? it?.extraApprovedQty ?? it?.extra?.approved ?? it?.approved ?? 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function JobsRow() {
    if (!normalizedCreated.length) return null;
    return (
      <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>Job 목록(DB)</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>count: <b>{normalizedCreated.length}</b></div>
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 6 }}>
          {normalizedCreated.map((j) => {
            const isSel = j.id === selectedJobId;
            return (
              <div key={j.id} style={{
                display: "flex", alignItems: "center", gap: 8, borderRadius: 999,
                border: isSel ? "2px solid #0ea5e9" : "1px solid #e5e7eb",
                background: isSel ? "#f0f9ff" : "#fff", padding: "8px 10px", minWidth: 240, flex: "0 0 auto",
              }}>
                <button type="button" onClick={async () => {
                  await warmUpAudioOnce();
                  setSelectedJobId(j.id);
                  await loadJob(j.id);
                  await loadTx(j.id);
                  setTimeout(() => scanRef.current?.focus?.(), 50);
                }} style={{ all: "unset", cursor: "pointer", flex: 1, minWidth: 0 }} title={j.id}>
                  <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{j.title || "Job"}</div>
                  <div style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>store <b>{jobStoreLabel(j, defaultStoreCode)}</b> · <b>{j.status}</b> · 등록: <b>{j.operatorId || "-"}</b></div>
                </button>
                <button type="button" onClick={async () => {
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
                }} style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}>삭제</button>
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
    const totalPlanned = items.reduce((sum, it) => sum + (it.qtyPlanned || 0), 0);
    const totalPicked = items.reduce((sum, it) => sum + (it.qtyPicked || 0), 0);
    const overallProgress = totalPlanned > 0 ? Math.floor((totalPicked / totalPlanned) * 100) : 0;

    return (
      <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>선택된 Job 상세</div>
          <div style={{ fontSize: 13, color: "#64748b", display: "flex", gap: 12, alignItems: "center" }}>
            <span>store: <b>{jobStoreLabel(selectedJob, defaultStoreCode)}</b></span>
            <span style={{ padding: "2px 8px", borderRadius: 4, background: selectedJob.status === "done" ? "#dcfce7" : "#fef3c7", color: selectedJob.status === "done" ? "#059669" : "#d97706", fontWeight: 700 }}>{selectedJob.status === "done" ? "완료" : "진행중"}</span>
            <span style={{ fontWeight: 700, color: overallProgress >= 100 ? "#059669" : "#3b82f6" }}>{overallProgress}%</span>
          </div>
        </div>
        {items.length ? (
          <div style={{ marginTop: 10, maxHeight: 420, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <Th style={{ width: 55 }}>상태</Th>
                  <Th>상품</Th>
                  <Th style={{ width: 130 }}>makerCode</Th>
                  <Th align="center" style={{ width: 60 }}>목표</Th>
                  <Th align="center" style={{ width: 60 }}>입고</Th>
                  <Th align="center" style={{ width: 55 }}>진행</Th>
                  <Th align="right" style={{ width: 100 }}>추가</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const planned = it.qtyPlanned || 0;
                  const picked = it.qtyPicked || 0;
                  const isDone = picked >= planned;
                  const canExtra = isDone;
                  const approved = getApprovedQty(it);
                  return (
                    <tr key={it.id} style={{ background: isDone ? "#f0fdf4" : "transparent" }}>
                      <Td>{isDone ? <span style={{ color: "#059669", fontWeight: 700, fontSize: 15 }}>완료</span> : <span style={{ color: "#f59e0b", fontWeight: 700, fontSize: 15 }}>대기</span>}</Td>
                      <Td style={{ fontSize: 15, fontWeight: 700, color: isDone ? "#059669" : "#1e293b" }}>{it?.sku?.name || it?.sku?.sku || it.skuCode || it.id}</Td>
                      <Td style={{ fontSize: 14, fontWeight: 600, color: "#475569" }}>{it?.sku?.makerCode || it.makerCodeSnapshot || "-"}</Td>
                      <Td align="center" style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>{planned}</Td>
                      <Td align="center" style={{ fontSize: 15, fontWeight: 700, color: isDone ? "#059669" : "#1e293b" }}>{picked}</Td>
                      <Td align="center"><span style={{ fontWeight: 700, fontSize: 15, color: isDone ? "#059669" : "#374151" }}>{isDone ? "✓" : `${picked}/${planned}`}</span></Td>
                      <Td align="right">
                        {canExtra ? (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                            <span style={{ fontSize: 12, color: "#64748b" }}>+{approved}</span>
                            <button type="button" disabled={approvingExtra} onClick={async () => {
                              await warmUpAudioOnce();
                              playScanWarnBeep();
                              try { await approveExtra(it.id, 1); } catch (err) { playScanErrorBeep(); pushToast({ kind: "error", title: "추가 입고 승인 실패", message: err?.message || String(err) }); }
                            }} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>+1</button>
                          </div>
                        ) : <span style={{ color: "#cbd5e1" }}>-</span>}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>items가 없어.</div>
        )}
      </div>
    );
  }

  function TxLogs() {
    if (!selectedJobId) return null;
    return (
      <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>스캔 로그</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" disabled={txLoading || undoing || loading || !selectedJobId} onClick={async () => { await warmUpAudioOnce(); await loadTx(selectedJobId); }} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}>새로고침</button>
            <button type="button" disabled={txLoading || undoing || loading || !selectedJobId || !scanTxLogs.length} onClick={async () => {
              await warmUpAudioOnce();
              playScanWarnBeep();
              const ok = window.confirm("이 Job의 스캔 로그를 전부 취소(UNDO ALL)할까?\n\n⚠️ 주의: 재고 음수가 발생할 수 있습니다.");
              if (!ok) return;
              setUndoing(true);
              try {
                await jobsFlow.undoAll({ jobId: selectedJobId, force: true });
                pushToast({ kind: "warn", title: "UNDO ALL", message: "전체 취소 완료 (강제 실행)" });
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
            }} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}>(전체취소)</button>
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
                    <Th style={{ width: 70 }}>time</Th>
                    <Th style={{ width: 70 }}>매장</Th>
                    <Th style={{ width: 70 }}>작업자</Th>
                    <Th style={{ width: 80 }}>location</Th>
                    <Th>sku</Th>
                    <Th style={{ width: 110 }}>makerCode</Th>
                    <Th align="right" style={{ width: 50 }}>qty</Th>
                    <Th style={{ width: 50 }}></Th>
                  </tr>
                </thead>
                <tbody>
                  {scanTxLogs.map((tx, idx) => {
                    const t = tx?.createdAt ? new Date(tx.createdAt) : null;
                    const time = t ? t.toLocaleTimeString() : "-";
                    const qty = tx?.qty ?? tx?.deltaQty ?? "-";
                    const loc = tx?.locationCode || tx?.location?.code || tx?.locationId || "-";
                    const skuName = tx?.sku?.name || tx?.skuCode || tx?.sku?.sku || "-";
                    const makerCode = tx?.sku?.makerCode || tx?.makerCode || "-";
                    const scanOperator = tx?.operatorId || "-";
                    const storeName = selectedJob?.store?.name || jobStoreLabel(selectedJob, defaultStoreCode) || "-";
                    const isLatest = idx === 0;
                    return (
                      <tr key={tx.id || idx}>
                        <Td style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>{time}</Td>
                        <Td style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{storeName}</Td>
                        <Td style={{ fontSize: 13, fontWeight: 600, color: "#6366f1" }}>{scanOperator}</Td>
                        <Td style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{loc}</Td>
                        <Td style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{skuName}</Td>
                        <Td style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{makerCode}</Td>
                        <Td align="right" style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{qty}</Td>
                        <Td align="right">
                          {isLatest ? (
                            <button type="button" disabled={undoing || loading || !selectedJobId} onClick={async () => {
                              await warmUpAudioOnce();
                              playScanWarnBeep();
                              const ok = window.confirm("직전 스캔 1건을 취소할까?");
                              if (!ok) return;

                              // 음수 체크
                              let forceUndo = false;
                              try {
                                const check = await jobsFlow.checkUndo({ jobId: selectedJobId });
                                if (check?.willGoNegative) {
                                  playScanWarnBeep();
                                  const forceOk = window.confirm(
                                    `⚠️ 취소 시 재고가 음수가 됩니다!\n\n` +
                                    `위치: ${check.locationCode || "-"}\n` +
                                    `현재 재고: ${check.currentQty ?? "-"}\n` +
                                    `취소 수량: ${check.undoQty ?? "-"}\n` +
                                    `예상 결과: ${check.resultQty ?? "-"}\n\n` +
                                    `강제로 취소하시겠습니까? (재고 음수 발생)`
                                  );
                                  if (!forceOk) return;
                                  forceUndo = true;
                                }
                              } catch (checkErr) {
                                console.warn("checkUndo 실패, 계속 진행:", checkErr);
                              }

                              setUndoing(true);
                              try {
                                await jobsFlow.undoLast({ jobId: selectedJobId, force: forceUndo });
                                pushToast({ kind: forceUndo ? "warn" : "info", title: "UNDO", message: forceUndo ? "강제 취소 완료 (음수 재고 발생)" : "취소 완료" });
                                triggerTotalsFlash();
                                await loadJob(selectedJobId);
                                await loadTx(selectedJobId);
                                playScanSuccessBeep();
                              } catch (e) {
                                playScanErrorBeep();
                                pushToast({ kind: "error", title: "UNDO 실패", message: e?.message || String(e) });
                              } finally {
                                setUndoing(false);
                              }
                            }} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}>취소</button>
                          ) : null}
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
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>{pageTitle || mode.title}</h1>
        <button type="button" style={{ ...primaryBtn, padding: "8px 10px" }} onClick={async () => { await warmUpAudioOnce(); loadJobsFromServer(); }} disabled={loading}>Job 새로고침</button>
      </div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>매장 반품: 매장에서 창고로 입고. 기본 locationCode는 <b>{mode.defaultLocationCode || "RET-01"}</b></div>
      <JobsRow />
      <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>스캔</div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", minWidth: 520 }}>
            <input ref={scanRef} value={scanValue} onChange={(e) => setScanValue(e.target.value)} onKeyDown={(e) => { if (e.key !== "Enter") return; e.preventDefault(); e.stopPropagation(); doScan(); }} onFocus={() => warmUpAudioOnce()} placeholder="barcode/skuCode" style={{ ...inputStyle, width: 320 }} />
            <input value={scanQty} onChange={(e) => setScanQty(e.target.value)} placeholder="qty" style={{ ...inputStyle, width: 90 }} inputMode="numeric" onFocus={() => warmUpAudioOnce()} />
            <input value={scanLoc} onChange={(e) => setScanLoc(e.target.value)} placeholder="locationCode (필수)" style={{ ...inputStyle, width: 180 }} onFocus={() => warmUpAudioOnce()} />
            <button type="button" style={primaryBtn} onClick={doScan} disabled={loading || !selectedJobId}>입고 처리</button>
          </div>
          <div style={{ flex: 1, opacity: selectedJob ? 1 : 0.55 }}><TotalsCards /></div>
        </div>
      </div>
      <JobDetail />
      <TxLogs />
    </div>
  );
}
