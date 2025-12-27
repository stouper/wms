// apps/wms-desktop/renderer/src/pages/StoreOutboundPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useToasts } from "../lib/toasts.jsx";
import { getApiBase } from "../workflows/_common/api";
import { safeReadJson, safeReadLocal, safeWriteJson, safeWriteLocal } from "../lib/storage";
import { runStoreOutbound } from "../workflows/storeOutbound/storeOutbound.workflow";
import { inputStyle, primaryBtn } from "../ui/styles";
import { Th, Td } from "../components/TableParts";
import { storeShipMode } from "../workflows/storeOutbound/storeOutbound.workflow";
import { addSku, pickSkuFromScan, printBoxLabel } from "../workflows/_common/print/packingBox";

const PAGE_KEY = "storeShip";

export default function StoreOutboundPage({ pageTitle = "매장 출고", defaultStoreCode = "" }) {
  const apiBase = getApiBase();
  const mode = storeShipMode;

  const { push, ToastHost } = useToasts();
  const [loading, setLoading] = useState(false);

  const createdKey = `wms.jobs.created.${PAGE_KEY}`;
  const selectedKey = `wms.jobs.selected.${PAGE_KEY}`;

  // 프린터 만들기//
  const [boxNo, setBoxNo] = useState(1);
  const [boxItems, setBoxItems] = useState(() => new Map());

  // ✅ created = "서버(Job DB)에 존재하는 목록"을 담는 state로 사용
  const [created, setCreated] = useState(() => safeReadJson(createdKey, []));
  const [selectedJobId, setSelectedJobId] = useState(() => safeReadLocal(selectedKey, "") || "");
  const [preview, setPreview] = useState(null);

  const [stage, setStage] = useState("jobs"); // ✅ 기본은 jobs 화면 (DB 목록 먼저 보여주자)

  const [scanValue, setScanValue] = useState("");
  const [scanQty, setScanQty] = useState(1);
  const [scanLoc, setScanLoc] = useState(() => mode.defaultLocationCode || "");
  const [lastScan, setLastScan] = useState(null);

  const [showScanDebug, setShowScanDebug] = useState(false);

  const scanRef = useRef(null);
  const fileRef = useRef(null);
  const pickingRef = useRef(false);

  const [approvingExtra, setApprovingExtra] = useState(false);

  useEffect(() => safeWriteJson(createdKey, created), [createdKey, created]);
  useEffect(() => safeWriteLocal(selectedKey, selectedJobId || ""), [selectedKey, selectedJobId]);

  useEffect(() => {
    setScanLoc((prev) => prev || "");
  }, []);

  // ✅ 백엔드 응답 형태를 통일해서 "job 객체"만 뽑아내기
  function unwrapJob(resp) {
    if (!resp) return null;
    if (resp?.job && typeof resp.job === "object") return resp.job; // { ok:true, job:{...} }
    if (resp?.id) return resp; // already job
    return null;
  }

  // ✅ /jobs 응답 형태: 배열 or {ok:true, rows:[...]} 모두 지원
  function unwrapJobsList(resp) {
    if (Array.isArray(resp)) return resp;
    if (Array.isArray(resp?.rows)) return resp.rows;
    if (Array.isArray(resp?.jobs)) return resp.jobs;
    return [];
  }

  async function fetchJson(url) {
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
  }

  async function postJson(url, body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
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
  }

  async function patchJson(url, body) {
    const r = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
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
  }

  async function deleteJob(jobId) {
    const r = await fetch(`${apiBase}/jobs/${jobId}`, { method: "DELETE" });
    const t = await r.text();
    if (!r.ok) throw new Error(`[${r.status}] ${t || "delete failed"}`);
    return true;
  }

  async function loadJob(jobId) {
    if (!jobId) return;
    const r = await fetch(`${apiBase}/jobs/${jobId}`);
    const data = await r.json();
    const jobObj = unwrapJob(data);
    if (!jobObj) return;

    setCreated((prev) =>
      (Array.isArray(prev) ? prev : []).map((x) => {
        const cur = unwrapJob(x) || x;
        return cur?.id === jobId ? jobObj : cur;
      }),
    );
  }

      // ✅ [중요] 페이지 진입 시: DB에 있는 jobs를 불러와서 "출고"만 표시
   async function loadJobsFromServer() {
    try {
    const r = await fetch(`${apiBase}/jobs`);
    const data = await r.json();

    const listAll = unwrapJobsList(data)
      .map((x) => unwrapJob(x) || x)
      .filter(Boolean);

    const list = listAll.filter((j) => {
      const t = j.title || "";
      return t.includes("출고") && !t.includes("입고");
    });

    setCreated(list);
    setStage("jobs");
 
      // ✅ 선택된 Job이 없거나, 선택된 Job이 목록에서 사라졌으면 첫번째로 자동 선택
      if (list.length) {
        const keep = selectedJobId && list.some((j) => j.id === selectedJobId);
        const nextId = keep ? selectedJobId : list[0].id;
        setSelectedJobId(nextId);
        // ✅ 아이템 포함 상세로 갱신
        await loadJob(nextId);
        setTimeout(() => scanRef.current?.focus?.(), 80);
      }
    } catch (e) {
      // 실패해도 화면은 살아있게
      push({ kind: "error", title: "Job 목록 로드 실패", message: e?.message || String(e) });
    }
  }

  // ✅ 마운트 시 항상 서버 목록을 불러온다 (탭 갔다오면 다시 보이게)
  useEffect(() => {
    loadJobsFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      await postJson(`${apiBase}/jobs/${selectedJobId}/approve-extra`, { jobItemId, qty: n });
      push({ kind: "success", title: "추가피킹 승인", message: `+${n} 승인 완료` });
      await loadJob(selectedJobId);
    } finally {
      setApprovingExtra(false);
    }
  }

  async function onPickFile(file) {
    if (!file) return;
    if (pickingRef.current) return;

    pickingRef.current = true;
    try {
      setLoading(true);
      const res = await runStoreOutbound({ file });
      if (!res.ok) throw new Error(res.error);
      const parsed = res.data;

      const { mixedKinds } = parsed || {};
      if (mixedKinds) throw new Error("출고/반품이 섞인 파일입니다. EPMS 파일을 확인해주세요.");

      if (typeof mode?.validateUpload === "function") {
        // ✅ jobKind(D열): "출고<<" / "반품<<" 같은 표기를 정규화해서 넘겨준다
        const rawKind =
          parsed?.jobKind ??
          parsed?.kind ??
          parsed?.jobType ??
          parsed?.meta?.jobKind ??
          parsed?.meta?.kind ??
          "";
        const jobKind = String(rawKind ?? "").trim().replace(/<</g, "").trim();

        const v = mode.validateUpload({ pageKey: PAGE_KEY, parsed, jobKind });
        if (v?.ok === false) throw new Error(v.error);
      }

      setPreview({ ...parsed, fileName: file.name });
      setStage("preview");
      push({ kind: "success", title: "파일 로드", message: `${file.name} (rows: ${parsed.rows.length})` });
    } catch (e) {
      push({ kind: "error", title: "파일 파싱 실패", message: e?.message || String(e) });
      setPreview(null);
      setStage("jobs");
    } finally {
      setLoading(false);
      pickingRef.current = false;
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const grouped = useMemo(() => {
    const rows = preview?.rows || [];
    const map = new Map();
    for (const r of rows) {
      const storeCode = (r.storeCode || defaultStoreCode || "").trim();
      if (!storeCode) continue;
      if (!map.has(storeCode)) map.set(storeCode, []);
      map.get(storeCode).push(r);
    }
    return Array.from(map.entries()).map(([storeCode, lines]) => ({ storeCode, lines }));
  }, [preview, defaultStoreCode]);

  async function createJobs() {
    try {
      if (!preview?.rows?.length) {
        push({ kind: "warn", title: "업로드 필요", message: "먼저 파일 업로드해줘" });
        return;
      }
      if (typeof mode?.createJobsFromPreview !== "function") {
        push({ kind: "error", title: "생성 불가", message: "mode.createJobsFromPreview가 없어" });
        return;
      }

      setLoading(true);

      const createdJobsRaw = await mode.createJobsFromPreview({
        apiBase,
        previewRows: preview.rows,
        defaultStoreCode,
        title: pageTitle || mode.title,
        postJson,
        fetchJson,
      });

      const createdJobs = (Array.isArray(createdJobsRaw) ? createdJobsRaw : [])
        .map((x) => unwrapJob(x) || x)
        .filter(Boolean);

      setPreview(null);
      setStage("jobs");

      // ✅ 생성 직후엔 서버 기준으로 다시 목록 로드해서 "사라짐" 방지
      push({ kind: "success", title: "작지 생성 완료", message: `${createdJobs.length}건 생성됨` });
      await loadJobsFromServer();
    } catch (e) {
      push({ kind: "error", title: "작지 생성 실패", message: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  }

  async function doScan() {
    if (!selectedJobId) {
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

      const result = await mode.scan({
        apiBase,
        pageKey: PAGE_KEY,
        jobId: selectedJobId,
        value: val,
        qty: safeQty,
        locationCode: loc,
        postJson,
        patchJson,
        fetchJson,
        confirm: (msg) => window.confirm(msg),
      });

      if (!result?.ok) {
        push({ kind: "error", title: "처리 실패", message: result?.error || "unknown error" });
        return;
      }

      if (result.lastScan !== undefined) setLastScan(result.lastScan);
      if (result.toast) push(result.toast);
      const sku = pickSkuFromScan(result.lastScan);
      if (sku) {
      setBoxItems(prev => addSku(prev, sku, safeQty));
     }

      if (result.resetScan) {
        setScanValue("");
        scanRef.current?.focus?.();
      }
      if (result.reloadJob) await loadJob(selectedJobId);
    } catch (e) {
      push({ kind: "error", title: "처리 실패", message: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  }
  
  function PreviewBlock() {
    if (stage !== "preview" || !preview) return null;

    return (
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff", marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>미리보기</div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            rows: <b>{preview.rows.length}</b> / storeCode groups: <b>{grouped.length}</b>
          </div>
        </div>

        <div style={{ marginTop: 10, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>storeCode</Th>
                <Th>skuCode</Th>
                <Th align="right">qty</Th>
              </tr>
            </thead>
            <tbody>
              {(preview.sample || preview.rows.slice(0, 30)).map((r, idx) => (
                <tr key={idx}>
                  <Td>{idx + 1}</Td>
                  <Td>{r.storeCode}</Td>
                  <Td>{r.skuCode}</Td>
                  <Td align="right">{r.qty}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>※ 미리보기는 최대 30행 표시</div>
      </div>
    );
  }

  function JobsRow() {
    if (stage !== "jobs") return null;
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
                    store <b>{j.storeCode}</b> · <b>{j.status}</b>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    const ok = confirm("이 작지를 삭제할까?");
                    if (!ok) return;
                    try {
                      setLoading(true);
                      await deleteJob(j.id);
                      // ✅ 삭제 후 서버 다시 로드
                      await loadJobsFromServer();
                      push({ kind: "success", title: "삭제", message: "작지를 삭제했어" });
                    } catch (err) {
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
      background: "#fff",
      padding: 14,
      minWidth: 200,
      flex: 1,
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
    const v = it?.extraApproved ?? it?.approvedQty ?? it?.qtyApproved ?? it?.extraApprovedQty ?? it?.extra?.approved ?? it?.approved ?? 0;
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
            store: <b>{selectedJob.storeCode}</b> · status: <b>{selectedJob.status}</b> · id: {selectedJob.id}
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
                                try {
                                  await approveExtra(it.id, 1);
                                } catch (err) {
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
          <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>items가 없어. (job 상세 조회 응답을 job 객체로 저장 못했을 때 주로 이렇게 떠)</div>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <ToastHost />

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>{pageTitle || mode.title}</h1>

        <button type="button" style={primaryBtn} onClick={() => fileRef.current?.click?.()} disabled={loading}>
          파일 선택
        </button>
        <button type="button" style={primaryBtn} onClick={createJobs} disabled={loading || !preview}>
          작지 생성
        </button>
        <button
        type="button"
        style={{ ...primaryBtn, background: "#22c55e" }}
        disabled={loading || !selectedJob || boxItems.size === 0}
       onClick={async () => {
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


        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setTimeout(() => onPickFile(f), 0);
          }}
        />
      </div>

      <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
        업로드 파일: <b>{preview?.fileName || "-"}</b> / 매장출고: <b>locationCode 선택</b>
      </div>

      <PreviewBlock />
      <JobsRow />

      <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>스캔</div>
          <button type="button" style={{ ...primaryBtn, padding: "8px 10px" }} onClick={loadJobsFromServer} disabled={loading}>
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
                if (e.key === "Enter") doScan();
              }}
              placeholder="barcode/skuCode"
              style={{ ...inputStyle, width: 320 }}
            />

            <input
              value={scanQty}
              onChange={(e) => setScanQty(e.target.value)}
              placeholder="qty"
              style={{ ...inputStyle, width: 90 }}
              inputMode="numeric"
            />

            <input
              value={scanLoc}
              onChange={(e) => setScanLoc(e.target.value)}
              placeholder="locationCode (선택)"
              style={{ ...inputStyle, width: 180 }}
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
