// apps/wms-desktop/renderer/src/pages/WarehouseInboundPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useToasts } from "../lib/toasts.jsx";
import { jobsFlow } from "../workflows/jobs/jobs.workflow";
import { safeReadJson, safeReadLocal, safeWriteJson, safeWriteLocal } from "../lib/storage";
import { inputStyle, primaryBtn } from "../ui/styles";
import { Th, Td } from "../components/TableParts";
import { whInboundMode } from "../workflows/warehouseInbound/warehouseInbound.workflow";
import { storeLabel } from "../workflows/_common/storeMap";

const PAGE_KEY = "whInbound";

export default function WarehouseInboundPage({ pageTitle = "창고 입고(반품)", defaultStoreCode = "" }) {
  const mode = whInboundMode;

  const { push, ToastHost } = useToasts();

  const createdKey = `wms.jobs.created.${PAGE_KEY}`;
  const selectedKey = `wms.jobs.selected.${PAGE_KEY}`;

  const [loading, setLoading] = useState(false);

  const [created, setCreated] = useState(() => safeReadJson(createdKey, []));
  const [selectedJobId, setSelectedJobId] = useState(() => safeReadLocal(selectedKey, "") || "");

  const [scanValue, setScanValue] = useState("");
  const [scanQty, setScanQty] = useState(1);
  const [scanLoc, setScanLoc] = useState(() => mode.defaultLocationCode || "RET-01");

  const [lastScan, setLastScan] = useState(null);
  const [showScanDebug, setShowScanDebug] = useState(false);

  const [approvingExtra, setApprovingExtra] = useState(false);

  // ✅ UX: totals flash
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

  /**
   * ✅ 비프 안정화 핵심
   * - AudioContext를 매번 만들지 말고 1개를 재사용
   * - suspended 상태면 resume
   * - 처음 1회 워밍업(무음 ping)으로 첫 삑 실패 방지
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
    if (audioReadyRef.current) return;
    const ok = await ensureAudioReady();
    if (!ok) return;

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
  }

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
    safeBeep({ startHz: 900, endHz: 1300, ms: 120, gain: 0.10, type: "square" });
  }

  // ❌ 실패음
  function playScanErrorBeep() {
    safeBeep({ startHz: 500, endHz: null, ms: 160, gain: 0.12, type: "square" });
  }

  // ⚠️ 경고음
  function playScanWarnBeep() {
    safeBeep({ startHz: 800, endHz: null, ms: 140, gain: 0.10, type: "square" });
  }

  function unwrapJob(resp) {
    if (!resp) return null;
    if (resp?.job && typeof resp.job === "object") return resp.job;
    if (resp?.id) return resp;
    return null;
  }

  async function loadJobsFromServer() {
    try {
      const listAll = await jobsFlow.listJobs();
      const normalized = (Array.isArray(listAll) ? listAll : []).map((x) => unwrapJob(x) || x).filter(Boolean);

      // ✅ 창고입고(반품): "입고" 또는 "반품"만
      const list = normalized.filter((j) => {
        const t = j.title || "";
        return t.includes("입고") || t.includes("반품");
      });

      setCreated(list);

      if (list.length) {
        const keep = selectedJobId && list.some((j) => j.id === selectedJobId);
        const nextId = keep ? selectedJobId : list[0].id;
        setSelectedJobId(nextId);
        await loadJob(nextId);
        setTimeout(() => scanRef.current?.focus?.(), 80);
      }
    } catch (e) {
      push({ kind: "error", title: "Job 목록 로드 실패", message: e?.message || String(e) });
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
      push({ kind: "error", title: "Job 상세 로드 실패", message: e?.message || String(e) });
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
      push({ kind: "success", title: "추가 입고 승인", message: `+${n} 승인 완료` });
      await loadJob(selectedJobId);
    } finally {
      setApprovingExtra(false);
    }
  }

  async function doScan() {
    // ✅ 사용자 제스처 시점: 오디오 워밍업(처음 1번만)
    warmUpAudioOnce();

    if (!selectedJobId) {
      playScanWarnBeep();
      push({ kind: "warn", title: "Job 선택", message: "먼저 Job을 선택해줘" });
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
        throw new Error("mode.scan이 없습니다. workflows/warehouseInbound/warehouseInbound.workflow.js 확인해줘.");
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
        push({ kind: "error", title: "처리 실패", message: result?.error || "unknown error" });
        return;
      }

      playScanSuccessBeep();
      triggerTotalsFlash();

      if (result.lastScan !== undefined) setLastScan(result.lastScan);
      if (result.toast) push(result.toast);

      if (result.resetScan) {
        setScanValue("");
        scanRef.current?.focus?.();
      }
      if (result.reloadJob) await loadJob(selectedJobId);
    } catch (e) {
      // ✅ 예외도 실패음
      playScanErrorBeep();
      push({ kind: "error", title: "처리 실패", message: e?.message || String(e) });
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
          <div style={label}>총 Received</div>
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
                    warmUpAudioOnce();
                    setSelectedJobId(j.id);
                    await loadJob(j.id);
                    setTimeout(() => scanRef.current?.focus?.(), 50);
                  }}
                  style={{ all: "unset", cursor: "pointer", flex: 1, minWidth: 0 }}
                  title={j.id}
                >
                  <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {j.title || "Job"}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                    store <b>{storeLabel(j.storeCode)}</b> · <b>{j.status}</b>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    warmUpAudioOnce();
                    playScanWarnBeep();

                    const ok = confirm("이 작지를 삭제할까?");
                    if (!ok) return;
                    try {
                      setLoading(true);
                      await deleteJob(j.id);
                      await loadJobsFromServer();
                      push({ kind: "success", title: "삭제", message: "작지를 삭제했어" });
                    } catch (err) {
                      playScanErrorBeep();
                      push({ kind: "error", title: "삭제 실패", message: err?.message || String(err) });
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
                  <Th align="right">received</Th>
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
                                warmUpAudioOnce();
                                playScanWarnBeep();
                                try {
                                  await approveExtra(it.id, 1);
                                } catch (err) {
                                  playScanErrorBeep();
                                  push({ kind: "error", title: "추가 입고 승인 실패", message: err?.message || String(err) });
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

  return (
    <div style={{ padding: 16 }}>
      <ToastHost />

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>{pageTitle || mode.title}</h1>

        <button
          type="button"
          style={{ ...primaryBtn, padding: "8px 10px" }}
          onClick={() => {
            warmUpAudioOnce();
            loadJobsFromServer();
          }}
          disabled={loading}
        >
          Job 새로고침
        </button>
      </div>

      <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
        입고(반품): 기본 locationCode는 <b>{mode.defaultLocationCode || "RET-01"}</b>
      </div>

      <JobsRow />

      {/* Scan */}
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
              placeholder="locationCode (필수)"
              style={{ ...inputStyle, width: 180 }}
              onFocus={() => warmUpAudioOnce()}
            />

            <button
              type="button"
              style={primaryBtn}
              onClick={doScan}
              disabled={loading || !selectedJobId}
            >
              입고 처리
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

                <span style={{ color: "#64748b" }}>loc:</span> <b>{lastScan.usedLocationCode || scanLoc || "-"}</b>
                <span style={{ color: "#64748b" }}>sku:</span> <b>{lastScan.sku?.sku || lastScan.sku?.makerCode || "-"}</b>

                {Number.isFinite(lastScan.picked?.qtyPicked) && Number.isFinite(lastScan.picked?.qtyPlanned) ? (
                  <>
                    <span style={{ color: "#64748b" }}>received:</span>{" "}
                    <b>
                      {lastScan.picked.qtyPicked}/{lastScan.picked.qtyPlanned}
                    </b>
                  </>
                ) : null}

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
    </div>
  );
}
