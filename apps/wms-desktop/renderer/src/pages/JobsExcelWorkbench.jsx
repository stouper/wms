import React, { useEffect, useMemo, useRef, useState } from "react";
import { useToasts } from "../lib/toasts.jsx";
import { getApiBase } from "../lib/api";
import { safeReadJson, safeReadLocal, safeWriteJson, safeWriteLocal } from "../lib/storage";
import { parseJobFileToRows } from "../lib/parseJobFile";
import { inputStyle, primaryBtn } from "../ui/styles";
import { Th, Td } from "../components/TableParts";

const DEFAULT_RETURN_LOCATION = "RET-01";

export default function JobsExcelWorkbench({ pageTitle, defaultStoreCode = "", pageKey }) {
  const { push, ToastHost } = useToasts();
  const apiBase = getApiBase();

  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null); // {fileType, jobKind, mixedKinds, rows, sample, fileName}

  const createdKey = `wms.jobs.created.${pageKey}`;
  const selectedKey = `wms.jobs.selected.${pageKey}`;

  const [created, setCreated] = useState(() => safeReadJson(createdKey, []));
  const [selectedJobId, setSelectedJobId] = useState(() => safeReadLocal(selectedKey) || "");
  const [job, setJob] = useState(null);

  const [jobMeta, setJobMeta] = useState({}); // jobMeta[jobId] = { done, planned, picked }

  const [scanValue, setScanValue] = useState("");
  const [scanQty, setScanQty] = useState(1);
  const [lastScan, setLastScan] = useState(null); // { status, pickResult, usedLocationCode, sku, picked }

  const [extraApproveInput, setExtraApproveInput] = useState({}); // { [jobItemId]: string }
  const [approvingExtra, setApprovingExtra] = useState(false);



  // ✅ 반품입고(whInbound)는 기본 로케이션 RET-01 자동 세팅
  const [scanLoc, setScanLoc] = useState(() => (pageKey === "whInbound" ? DEFAULT_RETURN_LOCATION : ""));

  const scanRef = useRef(null);
  const fileRef = useRef(null);
  const pickingRef = useRef(false);

  useEffect(() => safeWriteJson(createdKey, created), [createdKey, created]);
  useEffect(() => safeWriteLocal(selectedKey, selectedJobId || ""), [selectedKey, selectedJobId]);

  // pageKey가 바뀌면 loc 기본값도 같이 반영
  useEffect(() => {
    if (pageKey === "whInbound") setScanLoc((prev) => prev || DEFAULT_RETURN_LOCATION);
    else setScanLoc("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey]);

  // ---------- file upload ----------
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
        await wait(80);
        parsed = parseJobFileToRows(buf, file.name);
      }

      const jobKind = parsed?.jobKind || null; // '출고' | '반품' | null
      const mixedKinds = Boolean(parsed?.mixedKinds);

      if (mixedKinds) {
        throw new Error("출고/반품이 섞인 파일입니다. EPMS 파일을 확인해주세요.");
      }

      // 안전 모드: 구분이 없으면 경고(원하면 여기서 throw로 바꿔도 됨)
      if (!jobKind) {
        push({
          kind: "warn",
          title: "구분(D열) 없음",
          message: "출고/반품 구분이 감지되지 않았어. (EPMS 파일 D열 확인 권장)",
        });
      }

      // ✅ 화면별 업로드 제한
      if (pageKey === "storeShip" && jobKind === "반품") {
        throw new Error("반품작지는 [창고 입고] 메뉴에서 업로드하세요.");
      }
      if (pageKey === "whInbound" && jobKind === "출고") {
        throw new Error("출고작지는 [매장 출고] 메뉴에서 업로드하세요.");
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

  // ---------- grouping ----------
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

  // ---------- create jobs ----------
  async function createJobs() {
    if (!preview?.rows?.length) {
      push({ kind: "warn", title: "업로드 필요", message: "먼저 엑셀/CSV 파일을 업로드해줘" });
      return;
    }
    if (grouped.length === 0) {
      push({ kind: "error", title: "storeCode 없음", message: "storeCode(매장코드) 컬럼이 필요해" });
      return;
    }

    setLoading(true);
    try {
      const newCreated = [];
      for (const g of grouped) {
        const jobId = await createOneJob(apiBase, g.storeCode, pageTitle);
        await addJobItems(apiBase, jobId, g.lines);

        newCreated.push({ storeCode: g.storeCode, jobId, lines: g.lines.length });
        push({ kind: "success", title: "작지 생성", message: `${g.storeCode} → ${jobId} (${g.lines.length}줄)` });

        loadJobMeta(jobId).catch(() => {});
      }

      setCreated((prev) => [...newCreated, ...prev]);

      const first = newCreated?.[0]?.jobId;
      if (first) selectJob(first);
    } catch (e) {
      push({ kind: "error", title: "작지 생성 실패", message: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  }

  // ---------- delete job ----------
  async function deleteJob(jobId) {
    if (!jobId) return;
    const ok = confirm(`Job ${jobId} 삭제할까?\n(서버에서도 삭제됨)`);
    if (!ok) return;

    setLoading(true);
    try {
      await tryDeleteJob(apiBase, jobId);

      setCreated((prev) => prev.filter((x) => x.jobId !== jobId));
      setJobMeta((prev) => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });

      if (selectedJobId === jobId) {
        setSelectedJobId("");
        setJob(null);
      }

      push({ kind: "success", title: "삭제 완료", message: `Job ${jobId} 삭제됨` });
    } catch (e) {
      push({ kind: "error", title: "삭제 실패", message: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  }

  function clearCreatedLocalOnly() {
    const ok = confirm("이 PC에 저장된 Job 목록만 초기화할까?\n(서버 Job은 삭제되지 않음)");
    if (!ok) return;
    setCreated([]);
    setSelectedJobId("");
    setJob(null);
    setJobMeta({});
    push({ kind: "success", title: "초기화", message: "이 PC 기억 목록을 비웠어" });
  }

  // ---------- select & load job ----------
  function selectJob(jobId) {
    setSelectedJobId(jobId);
    loadJob(jobId);
  }

  async function loadJob(jobId) {
    if (!jobId) return;
    try {
      const data = await tryJsonFetch(`${apiBase}/jobs/${jobId}`);
      setJob(data);
      setJobMeta((prev) => ({ ...prev, [jobId]: calcJobMeta(data) }));
    } catch (e) {
      push({ kind: "error", title: "Job 조회 실패", message: e?.message || String(e) });
      setJob(null);
    }
  }

  useEffect(() => {
    if (!selectedJobId) {
      setJob(null);
      return;
    }
    loadJob(selectedJobId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId, apiBase]);

  async function loadJobMeta(jobId) {
    try {
      const data = await tryJsonFetch(`${apiBase}/jobs/${jobId}`);
      setJobMeta((prev) => ({ ...prev, [jobId]: calcJobMeta(data) }));
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const ids = created.map((c) => c.jobId).filter(Boolean);
    ids.slice(0, 12).forEach((id) => {
      if (!jobMeta[id]) loadJobMeta(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [created]);

  
  // ---------- extra picking approve ----------
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

// ---------- scan ----------
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

    // ✅ 반품입고는 locationCode 필수
    if (pageKey === "whInbound" && !loc) {
      push({ kind: "error", title: "로케이션 필요", message: `반품입고는 locationCode가 필수야. (예: ${DEFAULT_RETURN_LOCATION})` });
      return;
    }

    try {
      setLoading(true);

      // ---------- whInbound (반품 입고) ----------
      
if (pageKey === "whInbound") {
  // ✅ 반품입고
  // - "잡 선택"이 되어있으면: /jobs/:jobId/receive 로 처리 (JobItem 카운팅 반영)
  // - 잡 선택이 없으면: /inventory/in 으로만 처리 (재고만 반영, 카운팅은 안 올라감)
  const locationCode = loc || DEFAULT_RETURN_LOCATION;

  if (!selectedJobId) {
    // fallback: 재고만 올리고, 잡 카운팅은 불가
    const bodyIn = {
      skuCode: val, // inventory/in 은 skuCode 기준 (바코드/sku가 skuCode로 들어온다는 전제)
      qty: safeQty,
      locationCode,
    };
    const res = await postJson(`${apiBase}/inventory/in`, bodyIn);

    setLastScan(res);
    push({
      kind: "warning",
      title: "반품 처리(재고만)",
      message: `작지 선택이 없어서 재고만 +${safeQty} 처리했어. 카운팅 필요하면 먼저 작지를 선택해줘.`,
    });

    setScanValue("");
    scanRef.current?.focus?.();
    return;
  }

  // 잡 귀속 반품(카운팅 반영)
  const bodyReceive = {
    value: val,
    qty: safeQty,
    locationCode,
  };

  const res = await postJson(`${apiBase}/jobs/${selectedJobId}/receive`, bodyReceive);

  setLastScan(res);
  push({
    kind: "success",
    title: "반품 처리",
    message: `${val} +${safeQty} @${locationCode}`,
  });

  setScanValue("");
  scanRef.current?.focus?.();
  await loadJob(selectedJobId);
  return;
}

      // ---------- storeShip (매장 출고) ----------
      // ✅ items/scan 하나로 통일
      try {
        const res = await postJson(`${apiBase}/jobs/${selectedJobId}/items/scan`, {
          value: val,
          qty: safeQty,
          ...(loc ? { locationCode: loc } : {}),
        });

        setLastScan(res);

        const isShortage = res?.pickResult === "SHORTAGE_TO_RET01" || res?.status === "SHORTAGE" || res?.usedLocationCode === DEFAULT_RETURN_LOCATION;

        push({
          kind: isShortage ? "warn" : "success",
          title: isShortage ? "부족분 처리(RET-01)" : "피킹 처리",
          message: isShortage
            ? `${val} ${safeQty}족 → RET-01(부족풀) 적재`
            : `${val} -${safeQty} @${res?.usedLocationCode || loc || "-"}`,
        });

        push({
          kind: "success",
          title: "피킹 처리",
          message: `${val} -${safeQty} @${loc}`,
        });

        setScanValue("");
        scanRef.current?.focus?.();
        await loadJob(selectedJobId);
        return;
      } catch (e1) {
        const msg = e1?.message || String(e1);

        // ✅ RET-01 자동 오버픽:
        // - 특정 로케이션 재고가 부족하면 → allowOverpick 켜고 → RET-01로 재시도
        if (msg.includes("Insufficient stock") || msg.includes("Overpick enabled. locationCode is required")) {
          try {
            const retLoc = DEFAULT_RETURN_LOCATION;

            await patchJson(`${apiBase}/jobs/${selectedJobId}/allow-overpick`, { allowOverpick: true });

            const res2 = await postJson(`${apiBase}/jobs/${selectedJobId}/items/scan`, {
              value: val,
              qty: safeQty,
              locationCode: retLoc,
            });

            setLastScan(res2);

            push({
              kind: "warn",
              title: "부족분 처리(RET-01)",
              message: "전산재고 부족 → RET-01(부족풀)로 적재했어.",
            });

            setScanValue("");
            scanRef.current?.focus?.();
            await loadJob(selectedJobId);
            return;
          } catch (e2) {
            push({ kind: "error", title: "RET-01 자동 처리 실패", message: e2?.message || String(e2) });
            return;
          }
        }

        push({ kind: "error", title: "처리 실패", message: msg });
        return;
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <ToastHost />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>{pageTitle}</h1>

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
            / 매장출고: <b>locationCode 선택</b> (미입력 시 작지 기본 로케이션 사용)
          </>
        )}
      </div>

      {preview ? (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 900 }}>미리보기</div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              rows: <b>{preview.rows.length}</b> / storeCode groups: <b>{grouped.length}</b>
              {preview.jobKind ? (
                <>
                  {" "}
                  / 구분: <b>{preview.jobKind}</b>
                </>
              ) : null}
            </div>
          </div>

          <div style={{ marginTop: 10, border: "1px solid #e5e7eb", borderRadius: 10, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead style={{ background: "#f8fafc" }}>
                <tr>
                  <Th>storeCode</Th>
                  <Th>skuCode</Th>
                  <Th>makerCode</Th>
                  <Th>qty</Th>
                </tr>
              </thead>
              <tbody>
                {(preview.sample || []).map((r, idx) => (
                  <tr key={idx}>
                    <Td style={{ fontFamily: "Consolas, monospace" }}>{r.storeCode || defaultStoreCode || "-"}</Td>
                    <Td style={{ fontFamily: "Consolas, monospace" }}>
                      {(r.skuCode || "").toUpperCase?.() || r.skuCode || "-"}
                    </Td>
                    <Td style={{ fontFamily: "Consolas, monospace" }}>{r.makerCode || "-"}</Td>
                    <Td>{r.qty}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ padding: 12, border: "1px dashed #cbd5e1", borderRadius: 12, color: "#64748b" }}>
          엑셀/CSV 파일을 업로드하면 여기서 미리보기가 보여.
        </div>
      )}

      {/* created jobs */}
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>이번 PC에서 생성/기억된 Job</div>
          <button type="button" style={{ ...primaryBtn, padding: "8px 10px" }} onClick={clearCreatedLocalOnly} disabled={loading}>
            목록 초기화(로컬)
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {created.map((c) => {
            const meta = jobMeta[c.jobId];
            const isSelected = selectedJobId === c.jobId;
            const badge = meta?.done ? "완료" : "진행중";
            const badgeBg = meta?.done ? "#dcfce7" : "#e0e7ff";
            const badgeColor = meta?.done ? "#166534" : "#1e40af";

            return (
              <div
                key={c.jobId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 10,
                  alignItems: "center",
                  borderRadius: 14,
                  border: isSelected ? "2px solid #6366f1" : "1px solid #e5e7eb",
                  background: "#fff",
                  padding: 12,
                  minWidth: 320,
                }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => selectJob(c.jobId)}
                  onKeyDown={(e) => e.key === "Enter" && selectJob(c.jobId)}
                  style={{ cursor: "pointer", display: "grid", gap: 4 }}
                  title="Job 선택"
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{c.storeCode}</div>

                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: badgeBg,
                        color: badgeColor,
                        fontSize: 12,
                        fontWeight: 900,
                      }}
                      title={meta ? `${meta.picked}/${meta.planned}` : "상태 로딩중"}
                    >
                      {badge}
                      {meta ? ` (${meta.picked}/${meta.planned})` : ""}
                    </span>
                  </div>

                  <div style={{ color: "#94a3b8", fontSize: 12 }}>Job: {c.jobId}</div>
                  <div style={{ color: "#94a3b8", fontSize: 12 }}>lines: {c.lines}</div>
                </div>

                <button
                  type="button"
                  onClick={() => deleteJob(c.jobId)}
                  disabled={loading}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #fecaca",
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: 12,
                    color: "#ef4444",
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                  }}
                  title="Job 삭제"
                >
                  삭제
                </button>
              </div>
            );
          })}

          {created.length === 0 ? <div style={{ color: "#94a3b8", fontSize: 12 }}>아직 없음</div> : null}
        </div>
      </div>

      {/* scan */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>스캔</div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>선택 Job: {selectedJobId || "-"}</div>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            ref={scanRef}
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doScan()}
            placeholder={pageKey === "whInbound" ? "바코드(makerCode) 스캔 후 Enter" : "바코드/단품코드 스캔 후 Enter"}
            style={{ ...inputStyle, minWidth: 320, fontFamily: "Consolas, monospace" }}
          />
          <input value={scanQty} onChange={(e) => setScanQty(e.target.value)} style={{ ...inputStyle, width: 80 }} placeholder="qty" />
          <input
            value={scanLoc}
            onChange={(e) => setScanLoc(e.target.value)}
            style={{ ...inputStyle, width: 140 }}
            placeholder={pageKey === "whInbound" ? `loc(필수) 예:${DEFAULT_RETURN_LOCATION}` : "loc(선택) 예:A-11"}
          />
          <button type="button" style={primaryBtn} onClick={doScan} disabled={loading}>
            적용
          </button>
        {lastScan ? (
          <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span
              style={{
                padding: "3px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 900,
                background: lastScan?.status === "SHORTAGE" ? "#fff7ed" : "#ecfeff",
                color: lastScan?.status === "SHORTAGE" ? "#9a3412" : "#155e75",
                border: "1px solid #e5e7eb",
              }}
              title={lastScan?.pickResult || lastScan?.status || ""}
            >
              {lastScan?.status === "SHORTAGE" ? "⚠️ 부족처리" : "✅ 정상"}
            </span>

            <span style={{ fontSize: 12, color: "#64748b" }}>
              loc: <b>{lastScan?.usedLocationCode || "-"}</b>
            </span>

            <span style={{ fontSize: 12, color: "#64748b" }}>
              sku: <b style={{ fontFamily: "Consolas, monospace" }}>{lastScan?.sku?.sku || lastScan?.sku?.code || "-"}</b>
            </span>

            <span style={{ fontSize: 12, color: "#64748b" }}>
              picked: <b>{lastScan?.picked?.qtyPicked ?? "-"}</b>/<b>{lastScan?.picked?.qtyPlanned ?? "-"}</b>
            </span>
          </div>
        ) : null}

        </div>
      </div>

      {/* job detail */}
      {job ? (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 900 }}>Job Detail</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>{job.id}</div>
            </div>
            <button type="button" style={primaryBtn} onClick={() => setSelectedJobId("")}>
              선택 해제
            </button>
          </div>

          <div style={{ marginTop: 10, border: "1px solid #e5e7eb", borderRadius: 10, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead style={{ background: "#f8fafc" }}>
                <tr>
                  <Th>SKU</Th>
                  <Th>Maker</Th>
                  <Th>이름</Th>
                  <Th>Planned</Th>
                  <Th>Picked</Th>
                  <Th>Extra(사용/승인)</Th>
                  <Th>추가 승인</Th>
                </tr>
              </thead>
              <tbody>
                {(job.items || []).map((it) => {
                  const planned = Number(it.qtyPlanned || 0);
                  const picked = Number(it.qtyPicked || 0);
                  const done = picked >= planned && planned > 0;
                  return (
                    <tr key={it.id} style={{ background: done ? "#f0fdf4" : "transparent" }}>
                      {/* ✅ prisma field가 sku(문자열)인 케이스 대응 */}
                      <Td style={{ fontFamily: "Consolas, monospace" }}>{it.sku?.sku || it.sku?.code || "-"}</Td>
                      <Td style={{ fontFamily: "Consolas, monospace" }}>{it.makerCodeSnapshot || it.sku?.makerCode || "-"}</Td>
                      <Td>{it.nameSnapshot || it.sku?.name || "-"}</Td>
                      <Td>{planned}</Td>
                      <Td style={{ fontWeight: 900, color: done ? "#16a34a" : "#0f172a" }}>{picked}</Td>
                      <Td style={{ fontFamily: "Consolas, monospace" }}>
                        {Number(it.extraPickedQty || 0)}/{Number(it.extraApprovedQty || 0)}
                      </Td>
                      <Td>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input
                            value={extraApproveInput[it.id] ?? ""}
                            onChange={(e) =>
                              setExtraApproveInput((p) => ({ ...p, [it.id]: e.target.value }))
                            }
                            placeholder="수량"
                            style={{ ...inputStyle, width: 70, padding: "4px 6px" }}
                            inputMode="numeric"
                          />
                          <button
                            type="button"
                            style={{ ...primaryBtn, padding: "4px 10px" }}
                            disabled={approvingExtra}
                            onClick={() => {
                              const v = extraApproveInput[it.id];
                              approveExtra(it.id, v).catch((e) =>
                                push({ kind: "error", title: "승인 실패", message: e?.message || String(e) })
                              );
                            }}
                          >
                            승인
                          </button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
                {(job.items || []).length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 12, color: "#94a3b8", textAlign: "center" }}>
                      아이템이 아직 없음
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------- helpers ----------------

function calcJobMeta(job) {
  const items = job?.items || [];
  let planned = 0;
  let picked = 0;

  for (const it of items) {
    planned += Number(it.qtyPlanned || 0);
    picked += Number(it.qtyPicked || 0);
  }

  const done =
    items.length > 0 &&
    items.every((it) => {
      const p = Number(it.qtyPlanned || 0);
      const k = Number(it.qtyPicked || 0);
      if (p <= 0) return true;
      return k >= p;
    });

  return { done, planned, picked };
}

async function createOneJob(apiBase, storeCode, title) {
  const candidates = [
    { url: `${apiBase}/jobs`, body: { storeCode, title } },
    { url: `${apiBase}/jobs/create`, body: { storeCode, title } },
  ];

  let lastErr = null;
  for (const c of candidates) {
    try {
      const data = await postJson(c.url, c.body);
      const id = data?.id || data?.jobId || data?.job?.id;
      if (!id) throw new Error(`서버 응답에 job id 없음`);
      return id;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Job 생성 실패");
}

async function addJobItems(apiBase, jobId, lines) {
  const items = (lines || [])
    .map((r) => {
      const qty = Number(r.qty || 0);
      const skuCode = (r.skuCode || "").trim();
      const makerCode = (r.makerCode || "").trim();
      return {
        skuCode: skuCode ? skuCode.toUpperCase() : undefined,
        makerCode: makerCode || undefined,
        qtyPlanned: qty,
        qty,
      };
    })
    .filter((x) => (x.skuCode || x.makerCode) && Number(x.qtyPlanned || x.qty) > 0);

  if (items.length === 0) return;
  await postJson(`${apiBase}/jobs/${jobId}/items`, { items });
}

async function tryDeleteJob(apiBase, jobId) {
  const candidates = [`${apiBase}/jobs/${jobId}`, `${apiBase}/jobs/${jobId}/delete`];

  let lastErr = null;
  for (const url of candidates) {
    try {
      const r = await fetch(url, { method: "DELETE" });
      const t = await r.text();
      let data = null;
      try {
        data = t ? JSON.parse(t) : null;
      } catch {
        data = t;
      }
      if (!r.ok) {
        const msg = data?.message || data?.error || (typeof data === "string" ? data : r.statusText);
        throw new Error(`[${r.status}] ${msg}`);
      }
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("삭제 요청 실패");
}

async function tryJsonFetch(url) {
  const r = await fetch(url);
  const t = await r.text();
  let data = null;
  try {
    data = t ? JSON.parse(t) : null;
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
  let data = null;
  try {
    data = t ? JSON.parse(t) : null;
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
  let data = null;
  try {
    data = t ? JSON.parse(t) : null;
  } catch {
    data = t;
  }

  if (!r.ok) {
    const msg = data?.message || data?.error || (typeof data === "string" ? data : r.statusText);
    throw new Error(`[${r.status}] ${msg}`);
  }
  return data;
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
