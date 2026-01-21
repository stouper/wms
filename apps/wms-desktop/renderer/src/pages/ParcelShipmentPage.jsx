// apps/wms-desktop/renderer/src/pages/ParcelShipmentPage.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useToasts } from "../lib/toasts.jsx";
import { runParcelRequest, parcelShipMode } from "../workflows/parcelRequest/parcelRequest.workflow";
import { jobsApi } from "../workflows/jobs/jobs.api";
import { safeReadJson, safeReadLocal, safeWriteJson, safeWriteLocal } from "../lib/storage";
import { inputStyle, primaryBtn } from "../ui/styles";
import { exportsApi } from "../workflows/_common/exports.api";
import { getOperatorId } from "../workflows/_common/operator";

const PAGE_KEY = "parcelShip";

export default function ParcelShipmentPage({ pageTitle = "택배 작업" }) {
  const { push, ToastHost } = useToasts();

  const createdKey = `wms.jobs.created.${PAGE_KEY}`;
  const selectedKey = `wms.jobs.selected.${PAGE_KEY}`;

  const [loading, setLoading] = useState(false);
  const [batchJobs, setBatchJobs] = useState([]); // 배치 Job 목록
  const [selectedBatchId, setSelectedBatchId] = useState(() => safeReadLocal(selectedKey, "") || "");
  const [batchDetail, setBatchDetail] = useState(null); // 선택된 배치의 상세 (children 포함)

  const [scanValue, setScanValue] = useState("");
  const [scanQty, setScanQty] = useState(1);
  const [lastScan, setLastScan] = useState(null);
  const scanRef = useRef(null);

  // 엑셀 업로드
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [previewRows, setPreviewRows] = useState([]);
  const [uploadError, setUploadError] = useState("");
  const [creating, setCreating] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  // 필터
  const [filter, setFilter] = useState("all"); // all, pending, done

  useEffect(() => safeWriteLocal(selectedKey, selectedBatchId || ""), [selectedKey, selectedBatchId]);

  // ========================================
  // 배치 Job 목록 로드
  // ========================================
  async function loadBatchJobs() {
    setLoading(true);
    try {
      // parentId가 null인 Job만 조회 (배치 Job)
      const res = await jobsApi.list({ parentId: null });
      const rows = res?.rows || [];

      // 택배 배치만 필터 (children이 있는 것)
      const batches = rows.filter((j) =>
        j.type === "OUTBOUND" &&
        j.title?.includes("[택배]") &&
        (j.children?.length > 0 || j.parentId === null)
      );

      setBatchJobs(batches);

      // 선택된 배치 갱신
      if (selectedBatchId) {
        await loadBatchDetail(selectedBatchId);
      }
    } catch (e) {
      push({ kind: "error", title: "배치 목록 조회 실패", message: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  }

  // 배치 상세 로드
  async function loadBatchDetail(batchId) {
    if (!batchId) {
      setBatchDetail(null);
      return;
    }
    try {
      const res = await jobsApi.getBatch(batchId);
      setBatchDetail(res);
    } catch (e) {
      console.error("배치 상세 로드 실패:", e);
      setBatchDetail(null);
    }
  }

  useEffect(() => {
    loadBatchJobs();
  }, []);

  useEffect(() => {
    if (selectedBatchId) {
      loadBatchDetail(selectedBatchId);
    } else {
      setBatchDetail(null);
    }
  }, [selectedBatchId]);

  // ========================================
  // 배치 통계 계산
  // ========================================
  function getBatchStats(batch) {
    const children = batch?.children || [];
    const totalJobs = children.length;
    const completedJobs = children.filter((c) => c.status === "done").length;
    const progress = totalJobs > 0 ? Math.floor((completedJobs / totalJobs) * 100) : 0;
    const isDone = totalJobs > 0 && completedJobs >= totalJobs;

    const singlePack = children.filter((c) => c.packType === "single");
    const multiPack = children.filter((c) => c.packType === "multi");

    return {
      totalJobs,
      completedJobs,
      progress,
      isDone,
      singlePack: {
        total: singlePack.length,
        completed: singlePack.filter((c) => c.status === "done").length,
      },
      multiPack: {
        total: multiPack.length,
        completed: multiPack.filter((c) => c.status === "done").length,
      },
    };
  }

  // 필터된 배치 목록
  const filteredBatches = useMemo(() => {
    return batchJobs.filter((batch) => {
      const stats = getBatchStats(batch);
      if (filter === "pending") return !stats.isDone;
      if (filter === "done") return stats.isDone;
      return true;
    });
  }, [batchJobs, filter]);

  // 선택된 배치
  const selectedBatch = useMemo(() => {
    return batchJobs.find((b) => b.id === selectedBatchId) || null;
  }, [batchJobs, selectedBatchId]);

  const selectedStats = useMemo(() => getBatchStats(selectedBatch), [selectedBatch]);

  // 하위 Job 목록 (정렬: 단포 우선, 미완료 우선)
  const childJobs = useMemo(() => {
    const children = batchDetail?.job?.children || [];
    return [...children].sort((a, b) => {
      // 1. 미완료 우선
      if (a.status === "done" && b.status !== "done") return 1;
      if (a.status !== "done" && b.status === "done") return -1;
      // 2. sortOrder (단포=1 우선)
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });
  }, [batchDetail]);

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
      return;
    }

    setPreviewRows(res.data.rows || []);
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
        push({
          kind: "warn",
          title: "일부 작지 생성 실패",
          message: `성공: ${result.createdCount}개, 실패: ${result.failedOrders.length}개`,
        });
      } else {
        push({
          kind: "success",
          title: "배치 생성 완료",
          message: `${result.createdCount}건의 택배 주문이 포함된 배치가 생성되었습니다`,
        });
      }

      setPreviewRows([]);
      setFileName("");
      setUploadError("");
      setShowUpload(false);
      if (fileRef.current) fileRef.current.value = "";

      await loadBatchJobs();

      // 새로 생성된 배치 선택
      if (result.batchJobId) {
        setSelectedBatchId(result.batchJobId);
      }
    } catch (e) {
      push({ kind: "error", title: "작지 생성 실패", message: e?.message || String(e) });
    } finally {
      setCreating(false);
    }
  }

  // ========================================
  // 배치 스캔
  // ========================================
  async function doScan() {
    if (!selectedBatchId) {
      push({ kind: "warn", title: "배치 선택", message: "먼저 배치를 선택해주세요" });
      return;
    }

    if (!scanValue || !scanValue.trim()) {
      push({ kind: "warn", title: "바코드 입력", message: "바코드를 입력해주세요" });
      return;
    }

    const barcode = scanValue.trim();
    const qty = Number(scanQty) || 1;

    setLoading(true);
    try {
      const res = await jobsApi.scanBatch(selectedBatchId, {
        value: barcode,
        qty,
      });

      if (!res?.ok) throw new Error(res?.error || "스캔 실패");

      const matchedTitle = res.matchedJobTitle || "주문";
      const jobCompleted = res.jobCompleted;
      const batchCompleted = res.batchCompleted;

      setLastScan({
        barcode,
        qty,
        success: true,
        message: `${matchedTitle} - ${jobCompleted ? "주문 완료!" : "스캔 성공"}`,
        matchedJobId: res.matchedJobId,
        matchedParcel: res.matchedParcel,
      });

      setScanValue("");
      setScanQty(1);

      // 토스트 표시
      if (jobCompleted) {
        // CJ 예약 결과 확인
        const cjRes = res.cjReservation;
        if (cjRes && cjRes.invcNo) {
          push({
            kind: "success",
            title: "송장 발급 완료",
            message: `${matchedTitle} - 운송장: ${cjRes.invcNo}`,
          });
        } else if (cjRes && cjRes.error) {
          push({
            kind: "warn",
            title: "주문 완료 (송장 실패)",
            message: `${matchedTitle} - ${cjRes.error}`,
          });
        } else {
          push({
            kind: "success",
            title: "주문 완료",
            message: `${matchedTitle}`,
          });
        }
      } else {
        push({
          kind: "success",
          title: "스캔 성공",
          message: `${matchedTitle} (${barcode})`,
        });
      }

      if (batchCompleted) {
        push({
          kind: "success",
          title: "배치 완료!",
          message: "모든 주문이 완료되었습니다",
        });
      }

      // 배치 갱신
      await loadBatchJobs();
      await loadBatchDetail(selectedBatchId);

    } catch (e) {
      setLastScan({ barcode, qty, success: false, message: e?.message || String(e) });
      push({ kind: "error", title: "스캔 실패", message: e?.message || String(e) });
    } finally {
      setLoading(false);
      if (scanRef.current) scanRef.current.focus();
    }
  }

  // ========================================
  // 배치 삭제
  // ========================================
  async function deleteBatch(batchId, batchTitle) {
    const ok = window.confirm(`${batchTitle}\n\n이 배치와 모든 하위 주문을 삭제할까요?`);
    if (!ok) return;

    setLoading(true);
    try {
      await jobsApi.delete(batchId);
      push({ kind: "success", title: "삭제 완료", message: batchTitle });

      if (selectedBatchId === batchId) {
        setSelectedBatchId("");
        setBatchDetail(null);
      }

      await loadBatchJobs();
    } catch (e) {
      push({ kind: "error", title: "삭제 실패", message: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  }

  // ========================================
  // 스타일
  // ========================================
  const cardStyle = {
    background: "#fff",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    padding: 12,
  };

  const smallBtn = {
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 5,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
  };

  const filterBtn = (active) => ({
    ...smallBtn,
    background: active ? "#3b82f6" : "#fff",
    color: active ? "#fff" : "#374151",
    border: active ? "1px solid #3b82f6" : "1px solid #e5e7eb",
  });

  // ========================================
  // 렌더링
  // ========================================
  return (
    <div style={{ padding: 16 }}>
      <ToastHost />

      {/* ========== 헤더 ========== */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{pageTitle}</h1>
        <button type="button" style={smallBtn} onClick={loadBatchJobs} disabled={loading}>
          {loading ? "..." : "새로고침"}
        </button>
        <button
          type="button"
          style={{ ...smallBtn, background: showUpload ? "#fef3c7" : "#dbeafe" }}
          onClick={() => setShowUpload(!showUpload)}
        >
          {showUpload ? "업로드 닫기" : "엑셀 업로드"}
        </button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <button type="button" style={filterBtn(filter === "all")} onClick={() => setFilter("all")}>
            전체
          </button>
          <button type="button" style={filterBtn(filter === "pending")} onClick={() => setFilter("pending")}>
            진행중
          </button>
          <button type="button" style={filterBtn(filter === "done")} onClick={() => setFilter("done")}>
            완료
          </button>
        </div>
      </div>

      {/* ========== 엑셀 업로드 (접이식) ========== */}
      {showUpload && (
        <div style={{ ...cardStyle, marginTop: 12, background: "#fffbeb" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onPickFile} style={{ fontSize: 12 }} />
            {fileName && <span style={{ fontSize: 12, color: "#78716c" }}>{fileName}</span>}
            {previewRows.length > 0 && (
              <>
                <span style={{ fontSize: 12, color: "#059669", fontWeight: 600 }}>{previewRows.length}건 파싱됨</span>
                <button type="button" style={{ ...primaryBtn, padding: "6px 12px", fontSize: 12 }} onClick={onCreateJobs} disabled={creating}>
                  {creating ? "생성중..." : "배치 생성"}
                </button>
              </>
            )}
          </div>
          {uploadError && <div style={{ marginTop: 8, fontSize: 12, color: "#dc2626" }}>{uploadError}</div>}
        </div>
      )}

      {/* ========== 배치 목록 (상단 가로 카드형) ========== */}
      <div style={{ marginTop: 12, ...cardStyle }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>배치 목록</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            count: <b>{filteredBatches.length}</b>
          </div>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 6 }}>
          {filteredBatches.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: "#64748b" }}>
              배치가 없습니다. 엑셀 업로드로 새 배치를 생성하세요.
            </div>
          ) : (
            filteredBatches.map((batch) => {
              const stats = getBatchStats(batch);
              const isSelected = batch.id === selectedBatchId;

              return (
                <div
                  key={batch.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    borderRadius: 999,
                    border: isSelected ? "2px solid #f59e0b" : "1px solid #e5e7eb",
                    background: isSelected ? "#fef3c7" : "#fff",
                    padding: "8px 12px",
                    minWidth: 280,
                    flex: "0 0 auto",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setSelectedBatchId(batch.id);
                    setTimeout(() => scanRef.current?.focus?.(), 50);
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {batch.title || "Job"}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap", display: "flex", gap: 6, alignItems: "center" }}>
                      <span>단포 {stats.singlePack.completed}/{stats.singlePack.total}</span>
                      <span>·</span>
                      <span>합포 {stats.multiPack.completed}/{stats.multiPack.total}</span>
                      <span>·</span>
                      <span style={{ fontWeight: 700, color: stats.isDone ? "#059669" : "#f59e0b" }}>
                        {stats.isDone ? "완료" : `${stats.progress}%`}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteBatch(batch.id, batch.title);
                    }}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      cursor: "pointer",
                      fontSize: 11,
                      whiteSpace: "nowrap",
                      color: "#dc2626",
                    }}
                    disabled={loading}
                  >
                    삭제
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ========== 스캔 영역 ========== */}
      <div style={{ marginTop: 12, ...cardStyle, background: selectedBatch ? "#fff" : "#f3f4f6" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>스캔</div>
          {selectedBatch && (
            <span style={{ fontSize: 12, color: "#64748b" }}>{selectedBatch.title}</span>
          )}
        </div>

        {!selectedBatch ? (
          <div style={{ padding: 20, textAlign: "center", color: "#64748b", fontSize: 13 }}>
            상단에서 배치를 선택하세요
          </div>
        ) : (
          <>
            <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                ref={scanRef}
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  doScan();
                }}
                placeholder="바코드 스캔 (단포 우선 자동 매칭)"
                style={{ ...inputStyle, flex: 1, minWidth: 200, padding: "10px 12px", fontSize: 14 }}
                autoFocus
              />
              <input
                value={scanQty}
                onChange={(e) => setScanQty(e.target.value)}
                placeholder="수량"
                style={{ ...inputStyle, width: 60, padding: "10px 12px", fontSize: 14, textAlign: "center" }}
                inputMode="numeric"
              />
              <button
                type="button"
                style={{ ...primaryBtn, padding: "10px 16px", fontSize: 14 }}
                onClick={doScan}
                disabled={loading || !selectedBatchId}
              >
                스캔
              </button>

              {/* 진행률 카드 */}
              <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                <div style={{
                  padding: "8px 14px",
                  background: "#f0f9ff",
                  borderRadius: 10,
                  border: "1px solid #e0f2fe",
                  minWidth: 100,
                  textAlign: "center"
                }}>
                  <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>진행률</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: selectedStats.isDone ? "#059669" : "#3b82f6" }}>
                    {selectedStats.progress}%
                  </div>
                </div>
                <div style={{
                  padding: "8px 14px",
                  background: "#f0fdf4",
                  borderRadius: 10,
                  border: "1px solid #dcfce7",
                  minWidth: 100,
                  textAlign: "center"
                }}>
                  <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>완료</div>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>
                    {selectedStats.completedJobs}/{selectedStats.totalJobs}
                  </div>
                </div>
              </div>
            </div>

            {/* 마지막 스캔 결과 */}
            {lastScan && (
              <div
                style={{
                  marginTop: 10,
                  padding: 10,
                  background: lastScan.success ? "#dcfce7" : "#fee2e2",
                  borderRadius: 8,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ fontWeight: 700 }}>{lastScan.success ? "✓" : "✗"}</span>
                <span style={{ fontWeight: 600 }}>{lastScan.barcode}</span>
                <span style={{ color: "#64748b" }}>-</span>
                <span>{lastScan.message}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* ========== 주문 목록 ========== */}
      {selectedBatch && (
        <div style={{ marginTop: 12, ...cardStyle }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <span style={{ fontWeight: 900 }}>주문 목록</span>
              <span style={{ fontSize: 12, color: "#64748b", marginLeft: 8 }}>
                단포 {selectedStats.singlePack.completed}/{selectedStats.singlePack.total} ·
                합포 {selectedStats.multiPack.completed}/{selectedStats.multiPack.total}
              </span>
            </div>
          </div>

          {/* 주문 리스트 */}
          <div style={{ maxHeight: 400, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                  <th style={thStyle}>상태</th>
                  <th style={thStyle}>수취인</th>
                  <th style={thStyle}>지역</th>
                  <th style={thStyle}>타입</th>
                  <th style={thStyle}>상품</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>진행</th>
                </tr>
              </thead>
              <tbody>
                {childJobs.map((child) => {
                  const items = child.items || [];
                  const totalPlanned = items.reduce((sum, it) => sum + (it.qtyPlanned || 0), 0);
                  const totalPicked = items.reduce((sum, it) => sum + (it.qtyPicked || 0), 0);
                  const isDone = child.status === "done";
                  const parcel = child.parcel;

                  return (
                    <tr key={child.id} style={{ background: isDone ? "#f0fdf4" : "transparent" }}>
                      <td style={tdStyle}>
                        {isDone ? (
                          <span style={{ color: "#059669", fontWeight: 700 }}>완료</span>
                        ) : (
                          <span style={{ color: "#f59e0b" }}>대기</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{parcel?.recipientName || "-"}</div>
                        <div style={{ fontSize: 10, color: "#64748b" }}>{parcel?.phone || ""}</div>
                      </td>
                      <td style={tdStyle}>{child.title?.match(/\(([^)]+)\)/)?.[1] || "-"}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: child.packType === "single" ? "#dbeafe" : "#fce7f3",
                            color: child.packType === "single" ? "#1d4ed8" : "#be185d",
                          }}
                        >
                          {child.packType === "single" ? "단포" : "합포"}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {items.slice(0, 2).map((it, idx) => (
                          <div key={idx} style={{ fontSize: 10, color: "#64748b" }}>
                            {it.sku?.makerCode || it.makerCodeSnapshot || "-"} x{it.qtyPlanned}
                          </div>
                        ))}
                        {items.length > 2 && (
                          <div style={{ fontSize: 10, color: "#9ca3af" }}>+{items.length - 2}개 더</div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <span style={{ fontWeight: 600, color: isDone ? "#059669" : "#374151" }}>
                          {totalPicked}/{totalPlanned}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {childJobs.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "#64748b", padding: 20 }}>
                      주문 없음
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle = {
  padding: "8px 10px",
  textAlign: "left",
  fontWeight: 600,
  color: "#64748b",
  borderBottom: "1px solid #e5e7eb",
};

const tdStyle = {
  padding: "8px 10px",
  borderBottom: "1px solid #f1f5f9",
};
