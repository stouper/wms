// apps/wms-desktop/renderer/src/pages/ParcelShipmentPage.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useToasts } from "../lib/toasts.jsx";
import { runParcelRequest, parcelShipMode } from "../workflows/parcelRequest/parcelRequest.workflow";
import { jobsFlow } from "../workflows/jobs/jobs.workflow";
import { safeReadJson, safeReadLocal, safeWriteJson, safeWriteLocal } from "../lib/storage";
import { inputStyle, primaryBtn } from "../ui/styles";
import { Th, Td } from "../components/TableParts";
import { exportsApi } from "../workflows/_common/exports.api";
import { getOperatorId } from "../workflows/_common/operator";

const PAGE_KEY = "parcelShip";

export default function ParcelShipmentPage({ pageTitle = "택배 작업" }) {
  const mode = parcelShipMode;
  const { push, ToastHost } = useToasts();

  const createdKey = `wms.jobs.created.${PAGE_KEY}`;
  const selectedKey = `wms.jobs.selected.${PAGE_KEY}`;

  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(() => safeReadJson(createdKey, []));
  const [selectedJobId, setSelectedJobId] = useState(() => safeReadLocal(selectedKey, "") || "");

  const [scanValue, setScanValue] = useState("");
  const [scanQty, setScanQty] = useState(1);
  const [lastScan, setLastScan] = useState(null);
  const scanRef = useRef(null);

  // ========== 엑셀 업로드 ==========
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [previewRows, setPreviewRows] = useState([]);
  const [uploadError, setUploadError] = useState("");
  const [creating, setCreating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // ========== CJ 관련 ==========
  const [cjLoading, setCjLoading] = useState(false);
  const [cjStatus, setCjStatus] = useState(null);

  useEffect(() => safeWriteJson(createdKey, created), [createdKey, created]);
  useEffect(() => safeWriteLocal(selectedKey, selectedJobId || ""), [selectedKey, selectedJobId]);

  const selectedJob = useMemo(() => {
    return created.find((j) => j.id === selectedJobId) || null;
  }, [created, selectedJobId]);

  const totalPlanned = useMemo(() => {
    return (selectedJob?.items || []).reduce((sum, it) => sum + (it.qtyPlanned || 0), 0);
  }, [selectedJob]);

  const totalPicked = useMemo(() => {
    return (selectedJob?.items || []).reduce((sum, it) => sum + (it.qtyPicked || 0), 0);
  }, [selectedJob]);

  const isDone = selectedJob?.status === "done";
  const progress = totalPlanned > 0 ? Math.floor((totalPicked / totalPlanned) * 100) : 0;

  // ========================================
  // Job 목록 로드
  // ========================================
  async function loadJobsFromServer() {
    setLoading(true);
    try {
      const allJobs = await jobsFlow.listJobs();
      const parcelJobs = (Array.isArray(allJobs) ? allJobs : []).filter((j) => j.parcel);
      setCreated(parcelJobs);

      if (selectedJobId) {
        const updated = parcelJobs.find((j) => j.id === selectedJobId);
        if (updated) {
          setCreated((prev) => prev.map((j) => (j.id === selectedJobId ? updated : j)));
        }
      }

      if (!selectedJobId && parcelJobs.length > 0) {
        setSelectedJobId(parcelJobs[0].id);
      }
    } catch (e) {
      push({ kind: "error", title: "작지 목록 조회 실패", message: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadJobsFromServer();
  }, []);

  // ========================================
  // 엑셀 업로드
  // ========================================
  async function onPickFile(e) {
    setUploadError("");
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);

    const res = await runParcelRequest({ file: f });

    if (!res.ok) {
      setPreviewRows([]);
      setUploadError(res.error);
      setShowPreview(false);
      return;
    }

    setPreviewRows(res.data.rows || []);
    setShowPreview(true);
  }

  async function onCreateJobs() {
    if (!previewRows || previewRows.length === 0) {
      push({ kind: "warn", title: "데이터 없음", message: "먼저 엑셀 파일을 업로드해주세요" });
      return;
    }

    setCreating(true);
    try {
      const result = await parcelShipMode.createJobsFromPreview({
        rows: previewRows,
        fileName,
      });

      if (!result?.ok) {
        throw new Error(result?.error || "작지 생성 실패");
      }

      if (result.failedOrders && result.failedOrders.length > 0) {
        const failedMsg = result.failedOrders
          .map((f) => `${f.orderNo}: ${f.error}`)
          .join("\n");

        push({
          kind: "warn",
          title: "일부 작지 생성 실패",
          message: `성공: ${result.createdCount}개\n실패: ${result.failedOrders.length}개\n\n${failedMsg}`,
        });
      } else {
        push({
          kind: "success",
          title: "작지 생성 완료",
          message: `${result.createdCount}개의 택배 작지가 생성되었습니다`,
        });
      }

      setPreviewRows([]);
      setFileName("");
      setUploadError("");
      setShowPreview(false);
      if (fileRef.current) fileRef.current.value = "";

      await loadJobsFromServer();
    } catch (e) {
      push({ kind: "error", title: "작지 생성 실패", message: e?.message || String(e) });
    } finally {
      setCreating(false);
    }
  }

  // ========================================
  // CJ 예약/운송장
  // ========================================
  async function loadCjStatus(jobId) {
    if (!jobId) return;
    setCjLoading(true);
    try {
      const status = await exportsApi.getCjReservationStatus(jobId);
      setCjStatus(status);
    } catch (e) {
      console.error("CJ 상태 조회 실패:", e);
      setCjStatus(null);
    } finally {
      setCjLoading(false);
    }
  }

  useEffect(() => {
    if (selectedJobId && selectedJob?.parcel) {
      loadCjStatus(selectedJobId);
    } else {
      setCjStatus(null);
    }
  }, [selectedJobId]);

  // ========================================
  // 스캔
  // ========================================
  async function doScan() {
    if (!selectedJobId) {
      push({ kind: "warn", title: "작지 선택", message: "먼저 작지를 선택해주세요" });
      return;
    }

    if (!scanValue || !scanValue.trim()) {
      push({ kind: "warn", title: "바코드 입력", message: "바코드를 입력해주세요" });
      return;
    }

    const barcode = scanValue.trim();
    const qty = Number(scanQty) || 1;
    const operatorId = getOperatorId() || "";

    setLoading(true);
    try {
      const res = await jobsFlow.scan({
        jobId: selectedJobId,
        barcode,
        qty,
        operatorId,
      });

      if (!res?.ok) throw new Error(res?.error || "스캔 실패");

      setLastScan({ barcode, qty, success: true, message: res.message || "스캔 성공" });
      setScanValue("");
      setScanQty(1);

      await loadJobsFromServer();

      push({ kind: "success", title: "스캔 성공", message: res.message || `${barcode} (${qty}개)` });

      setTimeout(() => checkAndIssueWaybill(), 300);
    } catch (e) {
      setLastScan({ barcode, qty, success: false, message: e?.message || String(e) });
      push({ kind: "error", title: "스캔 실패", message: e?.message || String(e) });
    } finally {
      setLoading(false);
      if (scanRef.current) scanRef.current.focus();
    }
  }

  async function checkAndIssueWaybill() {
    if (!selectedJobId) return;

    // 서버에서 최신 Job 데이터를 직접 조회 (state는 비동기라 stale할 수 있음)
    let freshJob = null;
    try {
      freshJob = await jobsFlow.getJob(selectedJobId);
    } catch (e) {
      console.error("Job 조회 실패:", e);
      return;
    }

    if (!freshJob) return;

    const items = freshJob.items || [];
    const totalPlanned = items.reduce((sum, it) => sum + (it.qtyPlanned || 0), 0);
    const totalPicked = items.reduce((sum, it) => sum + (it.qtyPicked || 0), 0);

    const isPickingDone = totalPlanned > 0 && totalPicked >= totalPlanned;

    console.log(`[checkAndIssueWaybill] Job ${selectedJobId}: ${totalPicked}/${totalPlanned}, done=${isPickingDone}`);

    if (!isPickingDone) return;

    // 이미 운송장 발급된 경우 (parcel.waybillNo 체크)
    if (freshJob.parcel?.waybillNo) {
      push({ kind: "info", title: "예약 완료", message: `운송장번호: ${freshJob.parcel.waybillNo}` });
      return;
    }

    push({ kind: "info", title: "피킹 완료", message: "자동으로 CJ 예약을 진행합니다..." });

    setCjLoading(true);
    try {
      const result = await exportsApi.createCjReservation(selectedJobId);
      push({ kind: "success", title: "CJ 예약 완료", message: `운송장번호: ${result?.invcNo || "발급됨"}` });

      // Job 목록 새로고침 (운송장 번호 표시 업데이트)
      await loadJobsFromServer();
      await loadCjStatus(selectedJobId);

      // TODO: 프린터 준비되면 여기서 자동 출력
      // await printWaybill(result?.invcNo);
    } catch (e) {
      push({ kind: "error", title: "CJ 예약 실패", message: e?.message || String(e) });
    } finally {
      setCjLoading(false);
    }
  }

  // ========================================
  // 작지 삭제
  // ========================================
  async function deleteJob(jobId, jobTitle) {
    const ok = window.confirm(`${jobTitle}\n\n이 작지를 삭제할까요?\n삭제하면 복구할 수 없습니다.`);
    if (!ok) return;

    setLoading(true);
    try {
      await jobsFlow.deleteJob(jobId);
      push({ kind: "success", title: "작지 삭제 완료", message: `${jobTitle} 삭제됨` });

      if (selectedJobId === jobId) {
        setSelectedJobId("");
      }

      await loadJobsFromServer();
    } catch (e) {
      push({ kind: "error", title: "작지 삭제 실패", message: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  }

  // ========================================
  // 작지 목록 (JobsRow)
  // ========================================
  function JobsRow() {
    if (!created || created.length === 0) {
      return (
        <div style={{ marginTop: 12, padding: 16, background: "#f9fafb", borderRadius: 8, fontSize: 13, color: "#64748b" }}>
          택배 작지가 없습니다. 위에서 엑셀 업로드로 작지를 생성하세요.
        </div>
      );
    }

    return (
      <div style={{ marginTop: 12, overflowX: "auto", background: "#f9fafb", borderRadius: 8, padding: 12 }}>
        <div style={{ display: "flex", gap: 12, minWidth: "max-content" }}>
          {created.map((job) => {
            const isSelected = job.id === selectedJobId;
            const items = Array.isArray(job.items) ? job.items : [];
            const totalPlanned = items.reduce((sum, it) => sum + (it.qtyPlanned || 0), 0);
            const totalPicked = items.reduce((sum, it) => sum + (it.qtyPicked || 0), 0);
            const progress = totalPlanned > 0 ? Math.floor((totalPicked / totalPlanned) * 100) : 0;
            const isDone = job.status === "done";

            return (
              <div
                key={job.id}
                style={{
                  minWidth: 280,
                  maxWidth: 320,
                  padding: 12,
                  background: isSelected ? "#fef3c7" : "#fff",
                  border: isSelected ? "2px solid #f59e0b" : "1px solid #e5e7eb",
                  borderRadius: 8,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onClick={() => setSelectedJobId(job.id)}
              >
                <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 6 }}>{job.title}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                  {job.parcel?.recipientName || "수취인 정보 없음"}
                  <br />
                  {job.parcel?.addr1 || ""}
                </div>
                <div style={{ fontSize: 12, marginBottom: 6 }}>
                  진행률: <b>{progress}%</b> ({totalPicked}/{totalPlanned})
                </div>
                {isDone && <div style={{ fontSize: 11, color: "#059669", fontWeight: 700 }}>✓ 완료</div>}
                {job.parcel?.waybillNo && (
                  <div style={{ fontSize: 11, color: "#3b82f6", marginTop: 4 }}>운송장: {job.parcel.waybillNo}</div>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteJob(job.id, job.title);
                  }}
                  style={{
                    marginTop: 8,
                    padding: "4px 8px",
                    fontSize: 11,
                    background: "#fee2e2",
                    color: "#dc2626",
                    border: "1px solid #fecaca",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                  disabled={loading}
                >
                  🗑️ 삭제
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ========================================
  // 선택된 작지 상세 (JobDetail)
  // ========================================
  function JobDetail() {
    if (!selectedJob) return null;
    const items = Array.isArray(selectedJob.items) ? selectedJob.items : [];

    return (
      <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>선택된 작지 상세</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            수취인: <b>{selectedJob.parcel?.recipientName || "-"}</b> · status: <b>{selectedJob.status}</b> · id: {selectedJob.id}
          </div>
        </div>

        {items.length > 0 ? (
          <div style={{ marginTop: 10, maxHeight: 420, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <Th>sku</Th>
                  <Th>상품명</Th>
                  <Th align="right">계획</Th>
                  <Th align="right">피킹</Th>
                  <Th align="right">남은수량</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const remaining = Math.max(0, (it.qtyPlanned || 0) - (it.qtyPicked || 0));
                  return (
                    <tr key={it.id}>
                      <Td>{it?.sku?.sku || it.skuCode || it.makerCodeSnapshot || it.id}</Td>
                      <Td>{it?.sku?.name || it.nameSnapshot || "-"}</Td>
                      <Td align="right">{it.qtyPlanned}</Td>
                      <Td align="right">{it.qtyPicked}</Td>
                      <Td align="right" style={{ color: remaining > 0 ? "#dc2626" : "#059669", fontWeight: 700 }}>
                        {remaining}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ marginTop: 10, padding: 12, fontSize: 13, color: "#64748b", background: "#f9fafb", borderRadius: 8 }}>
            아이템이 없습니다
          </div>
        )}
      </div>
    );
  }

  // ========================================
  // 렌더링
  // ========================================
  return (
    <div style={{ padding: 16 }}>
      <ToastHost />

      {/* ========== 헤더 ========== */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>{pageTitle}</h1>

        <button type="button" style={{ ...primaryBtn, padding: "8px 10px" }} onClick={loadJobsFromServer} disabled={loading}>
          Job 새로고침
        </button>

        {/* 엑셀 업로드 토글 */}
        <button
          type="button"
          style={{ ...primaryBtn, padding: "8px 10px", background: "#dbeafe" }}
          onClick={() => setShowPreview(!showPreview)}
        >
          {showPreview ? "📦 업로드 닫기" : "📦 엑셀 업로드"}
        </button>
      </div>

      <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
        택배 작업: <b>엑셀 업로드</b> → 작지 생성 → 작지 선택 → 스캔 → 자동 CJ 예약
      </div>

      {/* ========== 엑셀 업로드 섹션 ========== */}
      {showPreview && (
        <div style={{ marginTop: 12, padding: 12, background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8 }}>
          <h3 style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 900 }}>📦 택배 요청 업로드</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onPickFile} />
            <div style={{ fontSize: 12, color: "#78716c" }}>{fileName ? `선택: ${fileName}` : ""}</div>

            {previewRows.length > 0 && (
              <button type="button" style={{ ...primaryBtn, marginLeft: "auto" }} onClick={onCreateJobs} disabled={creating}>
                {creating ? "작지 생성 중..." : `작지 생성 (${previewRows.length}건)`}
              </button>
            )}
          </div>

          {uploadError && <div style={{ marginTop: 12, color: "crimson", fontSize: 13 }}>{uploadError}</div>}

          {previewRows.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12 }}>
              미리보기: {previewRows.length}건 (주문번호: {previewRows[0]?.orderNo || "없음"}, 수취인: {previewRows[0]?.receiverName || "없음"})
            </div>
          )}
        </div>
      )}

      {/* ========== 작지 목록 ========== */}
      <JobsRow />

      {/* ========== 선택된 작지 상세 (작업할 내용) ========== */}
      <JobDetail />

      {/* ========== 스캔 섹션 ========== */}
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

            <button type="button" style={primaryBtn} onClick={doScan} disabled={loading || !selectedJobId}>
              스캔 처리
            </button>
          </div>

          {selectedJob && (
            <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              <div style={{ fontWeight: 700 }}>선택된 작지: {selectedJob.title}</div>
              <div>
                진행률: <b>{progress}%</b> ({totalPicked}/{totalPlanned})
              </div>
              {isDone && <div style={{ color: "#059669", fontWeight: 700 }}>✓ 완료</div>}
            </div>
          )}
        </div>

        {lastScan && (
          <div
            style={{
              marginTop: 12,
              padding: 8,
              background: lastScan.success ? "#dcfce7" : "#fee2e2",
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            {lastScan.success ? "✓" : "✗"} {lastScan.message}
          </div>
        )}
      </div>

      {/* TODO: 프린터 준비되면 자동 출력 기능 추가 */}
    </div>
  );
}
