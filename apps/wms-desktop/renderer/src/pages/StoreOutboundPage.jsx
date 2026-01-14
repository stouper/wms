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
  const [loading, setLoading] = useState(false);

  const createdKey = `wms.jobs.created.${PAGE_KEY}`;
  const selectedKey = `wms.jobs.selected.${PAGE_KEY}`;

  // ✅ UX: 스캔 피드백 (소리/번쩍)
  const [flashTotals, setFlashTotals] = useState(false);
  const flashTimerRef = useRef(null);

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
   * - user gesture 이후에는 정상적으로 재생됨(스캔 입력/버튼 클릭)
   * - oscillator는 매번 새로 만들어 아주 짧게 재생
   */
  const audioCtxRef = useRef(null);
  const audioReadyRef = useRef(false);

  function getAudioCtx() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new Ctx();
    }
    return audioCtxRef.current;
  }

  async function ensureAudioReady() {
    const ctx = getAudioCtx();
    if (!ctx) return false;

    // suspended면 resume 필요 (특히 Electron/Chrome에서 간헐적으로 suspended로 돌아갈 때 있음)
    try {
      if (ctx.state === "suspended") await ctx.resume();
      audioReadyRef.current = ctx.state === "running";
      return audioReadyRef.current;
    } catch {
      return false;
    }
  }

  // 아주 짧은 “무음 ping”으로 오디오 워밍업 (처음만)
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

    // state가 suspended면 재생 시도 전에 resume
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
          // 약간의 글라이드(삑↗)
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

  // ✅ 성공음: "띠↗삑" (900→1300)
  function playScanSuccessBeep() {
    safeBeep({ startHz: 900, endHz: 1300, ms: 120, gain: 0.10, type: "square" });
  }

  // ❌ 실패음: 저음 단발
  function playScanErrorBeep() {
    safeBeep({ startHz: 500, endHz: null, ms: 160, gain: 0.12, type: "square" });
  }

  // ⚠️ 경고음: 승인/오버픽/컨펌 뜰 때
  function playScanWarnBeep() {
    safeBeep({ startHz: 800, endHz: null, ms: 140, gain: 0.10, type: "square" });
  }

  // ✅ 박스(팩킹리스트) 출력 관련
  const [boxNo, setBoxNo] = useState(1);
  const [boxItems, setBoxItems] = useState(() => new Map());

  // ✅ created = "서버(Job DB)에 존재하는 목록"을 담는 state로 사용
  const [created, setCreated] = useState(() => safeReadJson(createdKey, []));
  const [selectedJobId, setSelectedJobId] = useState(() => safeReadLocal(selectedKey, "") || "");

  const [scanValue, setScanValue] = useState("");
  const [scanQty, setScanQty] = useState(1);
  const [scanLoc, setScanLoc] = useState(() => mode.defaultLocationCode || "");
  const [lastScan, setLastScan] = useState(null);

  const [showScanDebug, setShowScanDebug] = useState(false);

  const scanRef = useRef(null);
  const pickingRef = useRef(false); // (남겨둠) 혹시 추후 확장 대비

  const [approvingExtra, setApprovingExtra] = useState(false);

  useEffect(() => safeWriteJson(createdKey, created), [createdKey, created]);
  useEffect(() => safeWriteLocal(selectedKey, selectedJobId || ""), [selectedKey, selectedJobId]);

  useEffect(() => {
    setScanLoc((prev) => prev || "");
  }, []);

  // ✅ (보수) created에 혹시 이상한 게 들어가도 job 객체만 남기기
  function unwrapJob(resp) {
    if (!resp) return null;
    if (resp?.job && typeof resp.job === "object") return resp.job;
    if (resp?.id) return resp;
    return null;
  }

  // ✅ 페이지 진입 시: DB jobs 불러와서 "출고"만 표시
  async function loadJobsFromServer() {
    try {
      const listAll = await jobsFlow.listJobs(); // 백엔드가 필터 파라미터 지원하면 여기서 넘겨도 됨
      const normalized = (Array.isArray(listAll) ? listAll : [])
        .map((x) => unwrapJob(x) || x)
        .filter(Boolean);

      // 기존 로직 유지: title에 "출고" 포함, "입고" 제외
      const list = normalized.filter((j) => {
        const t = j.title || "";
        return t.includes("출고") && !t.includes("입고");
      });

      setCreated(list);

      // 선택된 Job이 없거나, 선택된 Job이 목록에서 사라졌으면 첫번째로 자동 선택
      if (list.length) {
        const keep = selectedJobId && list.some((j) => j.id === selectedJobId);
        const nextId = keep ? selectedJobId : list[0].id;
        setSelectedJobId(nextId);

        // ✅ 아이템 포함 상세로 갱신
        await loadJob(nextId);
        setTimeout(() => scanRef.current?.focus?.(), 80);
      }
    } catch (e) {
      push({ kind: "error", title: "Job 목록 로드 실패", message: e?.message || String(e) });
    }
  }

  // ✅ 마운트 시 항상 서버 목록을 불러온다
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

  // ✅ created 안에 혹시 응답 통째로 들어가 있어도 job 객체로 정규화
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
      push({ kind: "success", title: "추가피킹 승인", message: `+${n} 승인 완료` });
      await loadJob(selectedJobId);
    } finally {
      setApprovingExtra(false);
    }
  }

  async function doScan() {
    // ✅ 사용자 제스처 시점에 오디오 워밍업(처음 1번만)
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
        throw new Error("mode.scan이 없습니다. workflows/storeOutbound/storeOutbound.workflow.js 확인해줘.");
      }

      // ✅ 정석: Page는 confirm(UX)만 넘기고, API/HTTP는 workflow/jobsFlow가 책임
      const result = await mode.scan({
        jobId: selectedJobId,
        value: val,
        qty: safeQty,
        locationCode: loc,
        confirm: (msg) => {
          // confirm 뜨기 직전에 경고음
          playScanWarnBeep();
          return window.confirm(msg);
        },
      });

      if (!result?.ok) {
        // ❌ 실패: 저음 1회
        playScanErrorBeep();
        push({ kind: "error", title: "처리 실패", message: result?.error || "unknown error" });
        return;
      }

      // ✅ 성공: 소리 1회 + 번쩍 1회
      playScanSuccessBeep();
      triggerTotalsFlash();

      if (result.lastScan !== undefined) setLastScan(result.lastScan);
      if (result.toast) push(result.toast);

      const sku = pickSkuFromScan(result.lastScan);
      if (sku) {
        setBoxItems((prev) => addSku(prev, sku, safeQty));
      }

      if (result.resetScan) {
        setScanValue("");
        scanRef.current?.focus?.();
      }
      if (result.reloadJob) await loadJob(selectedJobId);
    } catch (e) {
      // ✅ 예외(네트워크/throw)도 실패음 울리기
      playScanErrorBeep();
      push({ kind: "error", title: "처리 실패", message: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
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
                    // user gesture → 오디오 워밍업
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

    const bigNum = {
      fontSize: 28,
      fontWeight: 900,
      lineHeight: 1.1,
      letterSpacing: -0.5,
    };

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

  function JobDetail() {
    if (!selectedJob) return null;
    const items = Array.isArray(selectedJob.items) ? selectedJob.items : [];

    return (
      <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>선택된 Job 상세</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            store: <b>{storeLabel(selectedJob.storeCode)}</b> · status: <b>{selectedJob.status}</b> · id: {selectedJob.id}
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
                                warmUpAudioOnce();
                                playScanWarnBeep();
                                try {
                                  await approveExtra(it.id, 1);
                                } catch (err) {
                                  playScanErrorBeep();
                                  push({ kind: "error", title: "추가피킹 승인 실패", message: err?.message || String(err) });
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
          <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>
            items가 없어. (job 상세 조회 응답을 job 객체로 저장 못했을 때 주로 이렇게 떠)
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <ToastHost />

      {/* ✅ 상단: 업로드/작지생성은 대시보드에서 진행 + 박스마감 유지 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>{pageTitle || mode.title}</h1>

        {/* ✅ A4 작업지시서 출력 */}
        <button
          type="button"
          style={{
            ...primaryBtn,
            background: "#fbfcf8ff",
          }}
          disabled={loading || !selectedJob || !(Array.isArray(selectedJob?.items) && selectedJob.items.length)}
          onClick={() => {
            warmUpAudioOnce();

            const job = selectedJob;
            const items = Array.isArray(job?.items) ? job.items : [];

            const payload = {
              jobTitle: job?.title || "HQ 출고 작업지시서",
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

        {/* ✅ 박스 마감 */}
        <button
          type="button"
          style={{ ...primaryBtn, background: "#fbfcf8ff" }}
          disabled={loading || !selectedJob || boxItems.size === 0}
          onClick={async () => {
            warmUpAudioOnce();

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

      <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>스캔</div>
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

            <button
              type="button"
              style={primaryBtn}
              onClick={doScan}
              disabled={loading || !selectedJobId}
            >
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
