import React, { useEffect, useMemo, useRef, useState } from "react";
import { useToasts } from "../lib/toasts.jsx";
import { getApiBase } from "../lib/api";
import { safeReadJson, safeReadLocal, safeWriteJson, safeWriteLocal } from "../lib/storage";
import { parseJobFileToRows } from "../lib/parseJobFile";
import { inputStyle, primaryBtn } from "../ui/styles";
import { Th, Td } from "../components/TableParts";
import { storeShipMode, whInboundMode, parcelShipMode } from "../workflows/jobsExcel";

const DEFAULT_RETURN_LOCATION = "RET-01";

function getMode(pageKey) {
  if (pageKey === "whInbound") return whInboundMode;
  if (pageKey === "parcelShip") return parcelShipMode;
  return storeShipMode;
}

export default function JobsExcelWorkbench({ pageTitle, defaultStoreCode = "", pageKey }) {
  const apiBase = getApiBase();
  const mode = getMode(pageKey);

  const { push, ToastHost } = useToasts();
  const [loading, setLoading] = useState(false);

  const createdKey = `wms.jobs.created.${pageKey}`;
  const selectedKey = `wms.jobs.selected.${pageKey}`;

  const [created, setCreated] = useState(() => safeReadJson(createdKey, []));
  const [selectedJobId, setSelectedJobId] = useState(() => safeReadLocal(selectedKey, "") || "");
  const [preview, setPreview] = useState(null);

  const [scanValue, setScanValue] = useState("");
  const [scanQty, setScanQty] = useState(1);
  const [scanLoc, setScanLoc] = useState(() => mode.defaultLocationCode || "");
  const [lastScan, setLastScan] = useState(null);

  const scanRef = useRef(null);
  const fileRef = useRef(null);
  const pickingRef = useRef(false);

  const [approvingExtra, setApprovingExtra] = useState(false);
  const [extraApproveInput, setExtraApproveInput] = useState({});

  useEffect(() => safeWriteJson(createdKey, created), [createdKey, created]);
  useEffect(() => safeWriteLocal(selectedKey, selectedJobId || ""), [selectedKey, selectedJobId]);

  useEffect(() => {
    if (pageKey === "whInbound") setScanLoc((prev) => prev || DEFAULT_RETURN_LOCATION);
    else setScanLoc((prev) => prev || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey]);

  async function loadJobs() {
    try {
      const r = await fetch(`${apiBase}/jobs`);
      const list = await r.json();
      if (!Array.isArray(list)) return;
      setCreated((prev) => prev.map((x) => list.find((y) => y.id === x.id) || x));
    } catch {}
  }

  async function loadJob(jobId) {
    if (!jobId) return;
    const r = await fetch(`${apiBase}/jobs/${jobId}`);
    const job = await r.json();
    setCreated((prev) => prev.map((x) => (x.id === jobId ? job : x)));
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

  async function approveExtra(jobItemId, qty) {
    if (!selectedJobId) throw new Error("jobId is required");
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) throw new Error("qty must be > 0");

    setApprovingExtra(true);
    try {
      await postJson(`${apiBase}/jobs/${selectedJobId}/approve-extra`, { jobItemId, qty: n });
      push({ kind: "success", title: "추가피킹 승인", message: `+${n} 승인 완료` });
      setExtraApproveInput((prev) => ({ ...prev, [jobItemId]: "" }));
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

      const buf = await file.arrayBuffer();
      if (!buf || buf.byteLength === 0) throw new Error("파일을 읽지 못했어(0 bytes).");

      let parsed;
      try {
        parsed = parseJobFileToRows(buf, file.name);
      } catch {
        throw new Error("파일 파싱에 실패했어. 엑셀/CSV 형식을 확인해줘.");
      }

      const { jobKind, mixedKinds } = parsed || {};
      if (mixedKinds) throw new Error("출고/반품이 섞인 파일입니다. EPMS 파일을 확인해주세요.");

      if (!jobKind) {
        push({ kind: "warn", title: "구분(D열) 없음", message: "출고/반품 구분이 감지되지 않았어. (EPMS 파일 D열 확인 권장)" });
      }

      if (typeof mode?.validateUpload === "function") {
        const v = mode.validateUpload({ jobKind, pageKey, parsed });
        if (v?.ok === false) throw new Error(v.error);
      }

      setPreview({ ...parsed, fileName: file.name });
      push({ kind: "success", title: "파일 로드", message: `${file.name} (rows: ${parsed.rows.length})` });
    } catch (e) {
      push({ kind: "error", title: "파일 파싱 실패", message: e?.message || String(e) });
      setPreview(null);
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

      const createdJobs = await mode.createJobsFromPreview({
        apiBase,
        previewRows: preview.rows,
        defaultStoreCode,
        title: pageTitle || mode.title,
        postJson,
        fetchJson,
      });

      setCreated((prev) => {
        const merged = [...createdJobs, ...prev].reduce((acc, cur) => {
          if (!acc.find((x) => x.id === cur.id)) acc.push(cur);
          return acc;
        }, []);
        return merged;
      });

      push({ kind: "success", title: "작지 생성 완료", message: `${createdJobs.length}건 생성됨` });
      await loadJobs();
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
        throw new Error("mode.scan이 없습니다. workflows/jobsExcel/*.mode.js 확인해줘.");
      }

      const result = await mode.scan({
        apiBase,
        pageKey,
        jobId: selectedJobId,
        value: val,
        qty: safeQty,
        locationCode: loc,
        postJson,
        patchJson,
        confirm: (msg) => window.confirm(msg),
      });

      if (!result?.ok) {
        push({ kind: "error", title: "처리 실패", message: result?.error || "unknown error" });
        return;
      }

      if (result.lastScan !== undefined) setLastScan(result.lastScan);
      if (result.toast) push(result.toast);

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

  return (
    <div style={{ padding: 16 }}>
      <ToastHost />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>{pageTitle || mode.title}</h1>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" style={primaryBtn} onClick={() => fileRef.current?.click?.()} disabled={loading}>
            파일 선택
          </button>
          <button type="button" style={primaryBtn} onClick={createJobs} disabled={loading || !preview}>
            작지 생성
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
      </div>

      <div style={{ fontSize: 12, color: "#64748b" }}>
        업로드 파일: <b>{preview?.fileName || "-"}</b>
        {pageKey === "whInbound" ? (
          <>
            {" "}
            / 반품입고 기본 로케이션: <b>{(scanLoc || DEFAULT_RETURN_LOCATION).trim()}</b>
          </>
        ) : (
          <>
            {" "}
            / 매장출고: <b>locationCode 선택</b> (미입력 시 서버 우선순위 location 사용)
          </>
        )}
      </div>

      {preview ? (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
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

          <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
            ※ 미리보기는 최대 30행 표시(전체는 rows에 있음)
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 12, padding: 12, border: "1px dashed #cbd5e1", borderRadius: 12, color: "#64748b" }}>
          엑셀/CSV 파일을 업로드하면 미리보기가 나와.
        </div>
      )}

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>생성된 Job(이번 세션)</div>

          {created.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {created.map((j) => {
                const isSel = j.id === selectedJobId;
                return (
                  <div
                    key={j.id}
                    style={{
                      padding: "10px 10px",
                      borderRadius: 10,
                      border: isSel ? "2px solid #0ea5e9" : "1px solid #e5e7eb",
                      background: isSel ? "#f0f9ff" : "#fff",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedJobId(j.id);
                          loadJob(j.id);
                          setTimeout(() => scanRef.current?.focus?.(), 50);
                        }}
                        style={{ all: "unset", cursor: "pointer", flex: 1 }}
                      >
                        <div style={{ fontWeight: 800 }}>{j.title || "Job"}</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                          id: {j.id} / store: {j.storeCode} / status: <b>{j.status}</b>
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
                            setCreated((prev) => prev.filter((x) => x.id !== j.id));
                            if (selectedJobId === j.id) setSelectedJobId("");
                            push({ kind: "success", title: "삭제", message: "작지를 삭제했어" });
                          } catch (e) {
                            push({ kind: "error", title: "삭제 실패", message: e?.message || String(e) });
                          } finally {
                            setLoading(false);
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
                        삭제
                      </button>
                    </div>

                    {isSel && j?.items?.length ? (
                      <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
                        <div style={{ fontWeight: 800, marginBottom: 4 }}>Job Detail</div>
                        <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 10 }}>
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
                              {j.items.map((it) => {
                                const remaining = Math.max(0, (it.qtyPlanned || 0) - (it.qtyPicked || 0));
                                const canExtra = remaining === 0;
                                return (
                                  <tr key={it.id}>
                                    <Td>{it?.sku?.sku || it.skuCode || it.makerCodeSnapshot || it.id}</Td>
                                    <Td align="right">{it.qtyPlanned}</Td>
                                    <Td align="right">{it.qtyPicked}</Td>
                                    <Td align="right">
                                      {canExtra ? (
                                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                          <input
                                            value={extraApproveInput[it.id] || ""}
                                            onChange={(e) =>
                                              setExtraApproveInput((prev) => ({ ...prev, [it.id]: e.target.value }))
                                            }
                                            placeholder="qty"
                                            style={{ ...inputStyle, width: 70, padding: "6px 8px" }}
                                            inputMode="numeric"
                                          />
                                          <button
                                            type="button"
                                            disabled={approvingExtra}
                                            onClick={async () => {
                                              try {
                                                await approveExtra(it.id, extraApproveInput[it.id] || 1);
                                              } catch (e) {
                                                push({
                                                  kind: "error",
                                                  title: "추가피킹 승인 실패",
                                                  message: e?.message || String(e),
                                                });
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
                                            승인
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
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#64748b" }}>아직 생성된 Job이 없어</div>
          )}
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>스캔</div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              ref={scanRef}
              value={scanValue}
              onChange={(e) => setScanValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") doScan();
              }}
              placeholder="barcode/skuCode"
              style={{ ...inputStyle, width: 260 }}
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
              placeholder={pageKey === "whInbound" ? "locationCode (필수)" : "locationCode (선택)"}
              style={{ ...inputStyle, width: 160 }}
            />

            <button type="button" style={primaryBtn} onClick={doScan} disabled={loading || !selectedJobId}>
              스캔 처리
            </button>
          </div>

          {lastScan ? (
            <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>
              lastScan: <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(lastScan, null, 2)}</pre>
            </div>
          ) : (
            <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>스캔 결과가 여기에 표시돼.</div>
          )}
        </div>
      </div>
    </div>
  );
}
