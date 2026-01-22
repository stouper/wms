import React, { useState, useEffect } from "react";
import { inputStyle, primaryBtn } from "../ui/styles";
import { http } from "../workflows/_common/http";
import { parseInventoryResetFile } from "../workflows/_common/excel/parseInventoryReset";
import { parseStoreBulkUpsertFile } from "../workflows/_common/excel/parseStoreBulkUpsert";

export default function SettingsPage() {
  // 매장 관리
  const [stores, setStores] = useState([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [storesVisible, setStoresVisible] = useState(false);
  const [newStoreCode, setNewStoreCode] = useState("");
  const [newStoreName, setNewStoreName] = useState("");
  const [storeError, setStoreError] = useState("");
  const [editingStore, setEditingStore] = useState(null);

  // 매장 Excel 업로드
  const [storeFile, setStoreFile] = useState(null);
  const [storeUploading, setStoreUploading] = useState(false);
  const [storeUploadResult, setStoreUploadResult] = useState(null);
  const [storePreview, setStorePreview] = useState(null);
  const [storeUploadError, setStoreUploadError] = useState("");

  // Location 관리
  const [locations, setLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsVisible, setLocationsVisible] = useState(false);
  const [newLocCode, setNewLocCode] = useState("");
  const [newLocName, setNewLocName] = useState("");
  const [locError, setLocError] = useState("");
  const [editingLoc, setEditingLoc] = useState(null);

  // 재고 초기화 (전체 교체)
  const [resetStoreCode, setResetStoreCode] = useState("");
  const [resetFile, setResetFile] = useState(null);
  const [resetUploading, setResetUploading] = useState(false);
  const [resetResult, setResetResult] = useState(null);
  const [resetPreview, setResetPreview] = useState(null);
  const [resetError, setResetError] = useState("");

  // 재고 조정 (단건)
  const [invStoreCode, setInvStoreCode] = useState("");
  const [invError, setInvError] = useState("");

  // 단건 재고 조정
  const [quickQuery, setQuickQuery] = useState(""); // SKU 또는 MakerCode 입력
  const [quickSearching, setQuickSearching] = useState(false);
  const [quickStock, setQuickStock] = useState(null); // 조회된 현재 재고 정보
  const [quickNewQty, setQuickNewQty] = useState("");
  const [quickAdjusting, setQuickAdjusting] = useState(false);

  // 재고관리용 매장 목록
  const [invStores, setInvStores] = useState([]);

  // 매장 목록 로드
  async function loadStores() {
    setStoresLoading(true);
    try {
      const res = await http.get("/stores");
      setStores(res?.rows || []);
      setStoresVisible(true);
    } catch (e) {
      console.error("매장 목록 로드 실패:", e);
    } finally {
      setStoresLoading(false);
    }
  }

  // Location 목록 로드 (본사 기준)
  async function loadLocations() {
    setLocationsLoading(true);
    try {
      const res = await http.get("/locations");
      setLocations(res?.rows || []);
      setLocationsVisible(true);
    } catch (e) {
      console.error("Location 목록 로드 실패:", e);
    } finally {
      setLocationsLoading(false);
    }
  }

  // 매장 추가
  async function handleAddStore() {
    const code = (newStoreCode || "").trim();
    const name = (newStoreName || "").trim();

    if (!code) {
      setStoreError("매장코드를 입력해주세요");
      return;
    }

    setStoreError("");
    try {
      await http.post("/stores", { code, name: name || null });
      setNewStoreCode("");
      setNewStoreName("");
      await loadStores();
    } catch (e) {
      setStoreError(e?.message || "매장 추가 실패");
    }
  }

  // 매장 수정
  async function handleUpdateStore() {
    if (!editingStore) return;

    const code = (editingStore.code || "").trim();
    const name = (editingStore.name || "").trim();

    if (!code) {
      setStoreError("매장코드를 입력해주세요");
      return;
    }

    setStoreError("");
    try {
      await http.patch(`/stores/${editingStore.id}`, { code, name: name || null });
      setEditingStore(null);
      await loadStores();
    } catch (e) {
      setStoreError(e?.message || "매장 수정 실패");
    }
  }

  // 매장 삭제
  async function handleDeleteStore(id, code, isHq) {
    if (isHq) {
      alert("본사 창고는 삭제할 수 없습니다.");
      return;
    }

    if (!confirm(`매장 "${code}"을(를) 삭제하시겠습니까?`)) return;

    try {
      await http.delete(`/stores/${id}`);
      await loadStores();
    } catch (e) {
      alert(e?.message || "매장 삭제 실패");
    }
  }

  // 매장 엑셀 파일 선택
  async function handleStoreFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStoreFile(file);
    setStoreUploadResult(null);
    setStorePreview(null);
    setStoreUploadError("");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const parsed = await parseStoreBulkUpsertFile(arrayBuffer, file.name);

      if (parsed.errors?.length > 0) {
        setStoreUploadError(`파싱 오류 ${parsed.errors.length}건: ${parsed.errors.slice(0, 3).join(", ")}`);
      }

      setStorePreview(parsed);
    } catch (err) {
      setStoreUploadError(err?.message || "엑셀 파싱 실패");
      setStorePreview(null);
    }
  }

  // 매장 업로드 실행
  async function handleStoreUpload() {
    if (!storePreview?.items?.length) {
      setStoreUploadError("업로드할 데이터가 없습니다.");
      return;
    }

    setStoreUploading(true);
    setStoreUploadResult(null);
    setStoreUploadError("");

    try {
      const res = await http.post("/stores/bulk-upsert", {
        items: storePreview.items,
      });

      setStoreUploadResult(res);
      await loadStores(); // 목록 갱신

      if (res?.created > 0 || res?.updated > 0) {
        alert(`매장 등록 완료: 생성 ${res.created}건, 수정 ${res.updated}건, 스킵 ${res.skipped}건`);
      } else {
        alert(`업로드 결과: 변경 없음 (스킵: ${res?.skipped || 0}건)`);
      }
    } catch (err) {
      setStoreUploadError(err?.message || "업로드 실패");
    } finally {
      setStoreUploading(false);
    }
  }

  // Location 추가
  async function handleAddLoc() {
    const code = (newLocCode || "").trim();
    const name = (newLocName || "").trim();

    if (!code) {
      setLocError("Location 코드를 입력해주세요");
      return;
    }

    setLocError("");
    try {
      await http.post("/locations", { code, name: name || null });
      setNewLocCode("");
      setNewLocName("");
      await loadLocations();
    } catch (e) {
      setLocError(e?.message || "Location 추가 실패");
    }
  }

  // Location 수정
  async function handleUpdateLoc() {
    if (!editingLoc) return;

    const code = (editingLoc.code || "").trim();
    const name = (editingLoc.name || "").trim();

    if (!code) {
      setLocError("Location 코드를 입력해주세요");
      return;
    }

    setLocError("");
    try {
      await http.patch(`/locations/${editingLoc.id}`, { code, name: name || null });
      setEditingLoc(null);
      await loadLocations();
    } catch (e) {
      setLocError(e?.message || "Location 수정 실패");
    }
  }

  // Location 삭제
  async function handleDeleteLoc(id, code, isSystem) {
    if (isSystem) {
      alert(`시스템 Location(${code})은 삭제할 수 없습니다.`);
      return;
    }

    if (!confirm(`Location "${code}"을(를) 삭제하시겠습니까?`)) return;

    try {
      await http.delete(`/locations/${id}`);
      await loadLocations();
    } catch (e) {
      alert(e?.message || "Location 삭제 실패");
    }
  }

  // 재고관리용 매장 목록 로드
  async function loadInvStores() {
    try {
      const res = await http.get("/stores");
      setInvStores(res?.rows || []);
    } catch (e) {
      console.error("매장 목록 로드 실패:", e);
    }
  }

  // 컴포넌트 마운트 시 매장 목록 로드
  useEffect(() => {
    loadInvStores();
  }, []);

  // 재고 초기화 파일 선택
  async function handleResetFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setResetFile(file);
    setResetResult(null);
    setResetPreview(null);
    setResetError("");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const parsed = await parseInventoryResetFile(arrayBuffer, file.name);

      if (parsed.errors?.length > 0) {
        setResetError(`파싱 오류 ${parsed.errors.length}건: ${parsed.errors.slice(0, 3).join(", ")}`);
      }

      setResetPreview(parsed);
    } catch (err) {
      setResetError(err?.message || "엑셀 파싱 실패");
      setResetPreview(null);
    }
  }

  // 재고 초기화 실행
  async function handleResetUpload() {
    if (!resetStoreCode) {
      setResetError("매장을 선택해주세요.");
      return;
    }
    if (!resetPreview?.rows?.length) {
      setResetError("업로드할 데이터가 없습니다.");
      return;
    }

    const storeName = invStores.find(s => s.code === resetStoreCode)?.name || resetStoreCode;
    if (!confirm(`[${storeName}] 매장의 재고를 엑셀 기준으로 전체 교체합니다.\n\n⚠️ 주의: 엑셀에 없는 재고는 삭제됩니다.\n\n계속하시겠습니까?`)) {
      return;
    }

    setResetUploading(true);
    setResetResult(null);
    setResetError("");

    try {
      const res = await http.post("/inventory/reset", {
        storeCode: resetStoreCode,
        rows: resetPreview.rows,
      });

      setResetResult(res);

      if (res?.ok) {
        alert(`재고 초기화 완료!\n\n매장: ${res.storeCode}\nLocation: ${res.locations}개\nSKU: ${res.skus}개\n적용: ${res.applied}건`);
      }
    } catch (err) {
      setResetError(err?.message || "업로드 실패");
    } finally {
      setResetUploading(false);
    }
  }

  // 단건 재고 조회 (SKU 또는 MakerCode로 검색)
  async function handleQuickSearch() {
    const query = (quickQuery || "").trim();
    if (!invStoreCode) {
      setInvError("매장을 먼저 선택해주세요.");
      return;
    }
    if (!query) {
      setInvError("SKU 또는 MakerCode를 입력해주세요.");
      return;
    }

    setQuickSearching(true);
    setQuickStock(null);
    setQuickNewQty("");
    setInvError("");

    try {
      // 재고 조회 API 호출 (SKU 또는 MakerCode로 검색)
      const res = await http.get(`/inventory/search?storeCode=${encodeURIComponent(invStoreCode)}&q=${encodeURIComponent(query)}`);

      if (res?.items?.length > 0) {
        // 첫 번째 결과 사용
        const item = res.items[0];
        setQuickStock(item);
        setQuickNewQty(String(item.onHand ?? 0));
      } else {
        setInvError(`"${query}" 검색 결과가 없습니다.`);
      }
    } catch (err) {
      setInvError(err?.message || "재고 조회 실패");
    } finally {
      setQuickSearching(false);
    }
  }

  // 단건 재고 조정 실행
  async function handleQuickAdjust() {
    if (!invStoreCode) {
      setInvError("매장을 선택해주세요.");
      return;
    }
    if (!quickStock) {
      setInvError("먼저 재고를 검색해주세요.");
      return;
    }

    const newQty = parseInt(quickNewQty, 10);
    if (!Number.isFinite(newQty) || newQty < 0) {
      setInvError("유효한 수량을 입력해주세요. (0 이상)");
      return;
    }

    setQuickAdjusting(true);
    setInvError("");

    try {
      const res = await http.post("/inventory/bulk-set", {
        items: [{
          storeCode: invStoreCode,
          skuCode: quickStock.skuCode,
          locationCode: quickStock.locationCode,
          qty: newQty,
          memo: "단건 조정",
        }],
        sourceKey: "quick-adjust",
      });

      if (res?.success > 0) {
        alert(`재고 조정 완료: ${quickStock.skuCode} @ ${quickStock.locationCode} → ${newQty}개`);
        // 조회 결과 업데이트
        setQuickStock({ ...quickStock, onHand: newQty });
      } else {
        setInvError(`조정 실패: ${res?.results?.[0]?.message || "알 수 없는 오류"}`);
      }
    } catch (err) {
      setInvError(err?.message || "재고 조정 실패");
    } finally {
      setQuickAdjusting(false);
    }
  }

  const cardStyle = {
    background: "#fff",
    borderRadius: 8,
    padding: 14,
    border: "1px solid #e5e7eb",
  };

  const thStyle = {
    textAlign: "left",
    padding: "8px 10px",
    fontSize: 12,
    color: "#64748b",
    fontWeight: 600,
    borderBottom: "1px solid #e5e7eb",
  };

  const tdStyle = {
    padding: "8px 10px",
    fontSize: 13,
    borderBottom: "1px solid #f1f5f9",
  };

  const smallBtnStyle = {
    padding: "5px 8px",
    borderRadius: 5,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
  };

  const inputSmall = {
    ...inputStyle,
    padding: "6px 10px",
    fontSize: 12,
  };

  return (
    <div style={{ display: "grid", gap: 12, width: "100%" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800 }}>설정</h1>

      {/* 매장 관리 */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>매장 관리</span>
          <span style={{ fontSize: 11, color: "#64748b" }}>
            Excel 일괄 등록 - 필수: <b>매장코드</b> | 선택: 매장명
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between", marginBottom: storeError ? 8 : 0 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="text"
              value={newStoreCode}
              onChange={(e) => setNewStoreCode(e.target.value)}
              placeholder="매장코드"
              style={{ ...inputSmall, width: 100 }}
            />
            <input
              type="text"
              value={newStoreName}
              onChange={(e) => setNewStoreName(e.target.value)}
              placeholder="매장명"
              style={{ ...inputSmall, width: 120 }}
              onKeyDown={(e) => e.key === "Enter" && handleAddStore()}
            />
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleStoreFileSelect}
              disabled={storeUploading}
              style={{ fontSize: 12 }}
            />
            <button
              type="button"
              onClick={handleStoreUpload}
              disabled={storeUploading || !storePreview?.items?.length}
              style={{ ...primaryBtn, padding: "6px 12px", fontSize: 12 }}
            >
              {storeUploading ? "..." : "업로드"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              onClick={handleAddStore}
              style={{ ...primaryBtn, padding: "6px 12px", fontSize: 12 }}
            >
              추가
            </button>
            <button
              type="button"
              onClick={loadStores}
              disabled={storesLoading}
              style={{ ...smallBtnStyle, background: "#3b82f6", color: "#fff", border: "none" }}
            >
              {storesLoading ? "..." : "조회"}
            </button>
          </div>
        </div>

        {storeError && (
          <div style={{ marginBottom: 8, fontSize: 11, color: "#ef4444" }}>
            {storeError}
          </div>
        )}

        {/* 매장 목록 */}
        {storesVisible && (
          <>
            {storesLoading ? (
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>로딩 중...</div>
            ) : stores.length === 0 ? (
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>등록된 매장이 없습니다.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={thStyle}>코드</th>
                    <th style={thStyle}>매장명</th>
                    <th style={thStyle}>구분</th>
                    <th style={{ ...thStyle, width: 100 }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map((s) => (
                    <tr key={s.id}>
                      <td style={tdStyle}>
                        {editingStore?.id === s.id ? (
                          <input
                            type="text"
                            value={editingStore.code}
                            onChange={(e) => setEditingStore({ ...editingStore, code: e.target.value })}
                            style={{ ...inputSmall, width: 80 }}
                          />
                        ) : (
                          <b>{s.code}</b>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {editingStore?.id === s.id ? (
                          <input
                            type="text"
                            value={editingStore.name || ""}
                            onChange={(e) => setEditingStore({ ...editingStore, name: e.target.value })}
                            style={{ ...inputSmall, width: "100%" }}
                          />
                        ) : (
                          s.name || "-"
                        )}
                      </td>
                      <td style={tdStyle}>
                        {s.isHq ? (
                          <span style={{ color: "#0ea5e9", fontWeight: 700, fontSize: 11 }}>본사</span>
                        ) : (
                          <span style={{ color: "#64748b", fontSize: 11 }}>매장</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {editingStore?.id === s.id ? (
                          <div style={{ display: "flex", gap: 4 }}>
                            <button
                              type="button"
                              onClick={handleUpdateStore}
                              style={{ ...smallBtnStyle, background: "#3b82f6", color: "#fff", border: "none", padding: "4px 8px" }}
                            >
                              저장
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingStore(null)}
                              style={{ ...smallBtnStyle, padding: "4px 8px" }}
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 4 }}>
                            <button
                              type="button"
                              onClick={() => setEditingStore({ id: s.id, code: s.code, name: s.name || "" })}
                              style={{ ...smallBtnStyle, padding: "4px 8px" }}
                            >
                              수정
                            </button>
                            {!s.isHq && (
                              <button
                                type="button"
                                onClick={() => handleDeleteStore(s.id, s.code, s.isHq)}
                                style={{ ...smallBtnStyle, color: "#ef4444", padding: "4px 8px" }}
                              >
                                삭제
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {/* Excel 업로드 에러/미리보기/결과 */}
        {storeUploadError && (
          <div style={{ marginTop: 8, fontSize: 11, color: "#ef4444" }}>
            {storeUploadError}
          </div>
        )}

        {storePreview && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>
              파싱 결과: <b>{storePreview.items?.length || 0}</b>건
              {storePreview.errors?.length > 0 && (
                <span style={{ color: "#ef4444", marginLeft: 8 }}>
                  (오류: {storePreview.errors.length}건)
                </span>
              )}
            </div>

            {storePreview.sample?.length > 0 && (
              <div style={{ maxHeight: 120, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 6 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={thStyle}>매장코드</th>
                      <th style={thStyle}>매장명</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storePreview.sample.map((item, idx) => (
                      <tr key={idx}>
                        <td style={tdStyle}><b>{item.code}</b></td>
                        <td style={tdStyle}>{item.name || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {storeUploadResult && (
          <div style={{ marginTop: 10, padding: 10, background: "#f0fdf4", borderRadius: 8, fontSize: 12 }}>
            <div>
              총: <b>{storeUploadResult.total}</b>건 |
              생성: <b style={{ color: "#16a34a" }}>{storeUploadResult.created}</b>건 |
              수정: <b style={{ color: "#0ea5e9" }}>{storeUploadResult.updated}</b>건 |
              스킵: <b>{storeUploadResult.skipped}</b>건 |
              오류: <b style={{ color: "#dc2626" }}>{storeUploadResult.error}</b>건
            </div>
            {storeUploadResult.results?.filter(r => r.status === "error").slice(0, 5).map((r, i) => (
              <div key={i} style={{ marginTop: 4, color: "#dc2626", fontSize: 11 }}>
                [{r.code}] {r.name || "(이름없음)"}: {r.message}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Location 관리 */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>창고/Location 관리</span>
            <input
              type="text"
              value={newLocCode}
              onChange={(e) => setNewLocCode(e.target.value)}
              placeholder="Location 코드"
              style={{ ...inputSmall, width: 130 }}
            />
            <input
              type="text"
              value={newLocName}
              onChange={(e) => setNewLocName(e.target.value)}
              placeholder="명칭"
              style={{ ...inputSmall, width: 120 }}
              onKeyDown={(e) => e.key === "Enter" && handleAddLoc()}
            />
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              onClick={handleAddLoc}
              style={{ ...primaryBtn, padding: "6px 12px", fontSize: 12 }}
            >
              추가
            </button>
            <button
              type="button"
              onClick={loadLocations}
              disabled={locationsLoading}
              style={{ ...smallBtnStyle, background: "#3b82f6", color: "#fff", border: "none" }}
            >
              {locationsLoading ? "..." : "조회"}
            </button>
          </div>
        </div>

        {locError && (
          <div style={{ marginBottom: 8, fontSize: 11, color: "#ef4444" }}>
            {locError}
          </div>
        )}

        {/* Location 목록 (시스템만 표시) */}
        {locationsVisible && (
          <>
            {locationsLoading ? (
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>로딩 중...</div>
            ) : locations.filter((l) => l.isSystem).length === 0 ? (
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>등록된 시스템 Location이 없습니다.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={thStyle}>코드</th>
                    <th style={thStyle}>명칭</th>
                    <th style={{ ...thStyle, width: 100 }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.filter((l) => l.isSystem).map((loc) => (
                    <tr key={loc.id}>
                      <td style={tdStyle}>
                        {editingLoc?.id === loc.id ? (
                          <input
                            type="text"
                            value={editingLoc.code}
                            onChange={(e) => setEditingLoc({ ...editingLoc, code: e.target.value })}
                            style={{ ...inputSmall, width: 110 }}
                            disabled={loc.isSystem}
                          />
                        ) : (
                          <b>{loc.code}</b>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {editingLoc?.id === loc.id ? (
                          <input
                            type="text"
                            value={editingLoc.name || ""}
                            onChange={(e) => setEditingLoc({ ...editingLoc, name: e.target.value })}
                            style={{ ...inputSmall, width: "100%" }}
                          />
                        ) : (
                          loc.name || "-"
                        )}
                      </td>
                      <td style={tdStyle}>
                        {editingLoc?.id === loc.id ? (
                          <div style={{ display: "flex", gap: 4 }}>
                            <button
                              type="button"
                              onClick={handleUpdateLoc}
                              style={{ ...smallBtnStyle, background: "#3b82f6", color: "#fff", border: "none", padding: "4px 8px" }}
                            >
                              저장
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingLoc(null)}
                              style={{ ...smallBtnStyle, padding: "4px 8px" }}
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 4 }}>
                            <button
                              type="button"
                              onClick={() => setEditingLoc({ id: loc.id, code: loc.code, name: loc.name || "" })}
                              style={{ ...smallBtnStyle, padding: "4px 8px" }}
                            >
                              수정
                            </button>
                            {!loc.isSystem && (
                              <button
                                type="button"
                                onClick={() => handleDeleteLoc(loc.id, loc.code, loc.isSystem)}
                                style={{ ...smallBtnStyle, color: "#ef4444", padding: "4px 8px" }}
                              >
                                삭제
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      {/* 재고 초기화 (전체 교체) */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>재고 초기화</span>
            <span style={{ fontSize: 11, color: "#dc2626" }}>전체 교체 (엑셀에 없는 재고 삭제)</span>
          </div>
          <span style={{ fontSize: 11, color: "#64748b" }}>
            필수: <b>SKU</b>, <b>수량</b>, <b>Location</b>, <b>MakerCode</b>, <b>상품명</b> | 선택: 상품구분
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select
              value={resetStoreCode}
              onChange={(e) => setResetStoreCode(e.target.value)}
              style={{ ...inputSmall, minWidth: 180 }}
            >
              <option value="">-- 매장 선택 --</option>
              {invStores.map((s) => (
                <option key={s.id} value={s.code}>
                  {s.name} ({s.code}) {s.isHq ? "[본사]" : ""}
                </option>
              ))}
            </select>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleResetFileSelect}
              disabled={resetUploading}
              style={{ fontSize: 12 }}
            />
          </div>
          <button
            type="button"
            onClick={handleResetUpload}
            disabled={resetUploading || !resetStoreCode || !resetPreview?.rows?.length}
            style={{ ...primaryBtn, padding: "6px 12px", fontSize: 12, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626" }}
          >
            {resetUploading ? "..." : "초기화 실행"}
          </button>
        </div>

        {resetError && (
          <div style={{ marginTop: 8, fontSize: 11, color: "#ef4444" }}>
            {resetError}
          </div>
        )}

        {/* 미리보기 */}
        {resetPreview && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>
              파싱 결과: <b>{resetPreview.rows?.length || 0}</b>건
              {resetPreview.errors?.length > 0 && (
                <span style={{ color: "#ef4444", marginLeft: 8 }}>
                  (오류: {resetPreview.errors.length}건)
                </span>
              )}
            </div>

            {resetPreview.sample?.length > 0 && (
              <div style={{ maxHeight: 180, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 6 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={thStyle}>SKU</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>수량</th>
                      <th style={thStyle}>Location</th>
                      <th style={thStyle}>MakerCode</th>
                      <th style={thStyle}>상품명</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resetPreview.sample.map((item, idx) => (
                      <tr key={idx}>
                        <td style={tdStyle}><b>{item.sku}</b></td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>{item.qty?.toLocaleString()}</td>
                        <td style={tdStyle}>{item.location || "-"}</td>
                        <td style={tdStyle}>{item.makerCode || "-"}</td>
                        <td style={tdStyle}>{item.name || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 업로드 결과 */}
        {resetResult && (
          <div style={{ marginTop: 10, padding: 10, background: "#f0fdf4", borderRadius: 8, fontSize: 12 }}>
            <div>
              매장: <b>{resetResult.storeCode}</b> |
              Location: <b>{resetResult.locations}</b>개 |
              SKU: <b>{resetResult.skus}</b>개 |
              적용: <b style={{ color: "#16a34a" }}>{resetResult.applied}</b>건
            </div>
          </div>
        )}
      </div>

      {/* 재고 조정 */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>재고 조정</span>
            <span style={{ fontSize: 11, color: "#16a34a" }}>기존 재고 유지, 단건 수정</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={invStoreCode}
              onChange={(e) => {
                setInvStoreCode(e.target.value);
                setQuickStock(null);
                setQuickQuery("");
                setQuickNewQty("");
              }}
              style={{ ...inputSmall, minWidth: 180 }}
            >
              <option value="">-- 매장 선택 --</option>
              {invStores.map((s) => (
                <option key={s.id} value={s.code}>
                  {s.name} ({s.code}) {s.isHq ? "[본사]" : ""}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={quickQuery}
              onChange={(e) => setQuickQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleQuickSearch()}
              placeholder="SKU 또는 MakerCode"
              style={{ ...inputSmall, width: 140 }}
              disabled={!invStoreCode || quickSearching}
            />
            <button
              type="button"
              onClick={handleQuickSearch}
              disabled={!invStoreCode || !quickQuery.trim() || quickSearching}
              style={{ ...smallBtnStyle, background: "#3b82f6", color: "#fff", border: "none" }}
            >
              {quickSearching ? "..." : "검색"}
            </button>
            {quickStock && (
              <>
                <span style={{ fontSize: 12, color: "#64748b", borderLeft: "1px solid #e5e7eb", paddingLeft: 8 }}>
                  <b>{quickStock.skuCode}</b> @ {quickStock.locationCode} | 현재: <b style={{ color: "#0ea5e9" }}>{quickStock.onHand ?? 0}</b>
                </span>
                <input
                  type="number"
                  value={quickNewQty}
                  onChange={(e) => setQuickNewQty(e.target.value)}
                  placeholder="새 수량"
                  style={{ ...inputSmall, width: 70, textAlign: "right" }}
                  min="0"
                  disabled={quickAdjusting}
                />
              </>
            )}
          </div>
          {quickStock && (
            <button
              type="button"
              onClick={handleQuickAdjust}
              disabled={quickAdjusting || quickNewQty === ""}
              style={{ ...primaryBtn, padding: "6px 12px", fontSize: 12 }}
            >
              {quickAdjusting ? "..." : "조정"}
            </button>
          )}
        </div>

        {invError && (
          <div style={{ marginTop: 8, fontSize: 11, color: "#ef4444" }}>
            {invError}
          </div>
        )}
      </div>
    </div>
  );
}
