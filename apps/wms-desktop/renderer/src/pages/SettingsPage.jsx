import React, { useState } from "react";
import { inputStyle, primaryBtn } from "../ui/styles";
import { http } from "../workflows/_common/http";
import { parseInventoryBulkSetFile } from "../workflows/_common/excel/parseInventoryBulkSet";

export default function SettingsPage() {
  // 매장 관리
  const [stores, setStores] = useState([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [storesVisible, setStoresVisible] = useState(false);
  const [newStoreCode, setNewStoreCode] = useState("");
  const [newStoreName, setNewStoreName] = useState("");
  const [storeError, setStoreError] = useState("");
  const [editingStore, setEditingStore] = useState(null);

  // Location 관리
  const [locations, setLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsVisible, setLocationsVisible] = useState(false);
  const [newLocCode, setNewLocCode] = useState("");
  const [newLocName, setNewLocName] = useState("");
  const [locError, setLocError] = useState("");
  const [editingLoc, setEditingLoc] = useState(null);

  // 재고관리 (Excel 업로드)
  const [invFile, setInvFile] = useState(null);
  const [invUploading, setInvUploading] = useState(false);
  const [invResult, setInvResult] = useState(null);
  const [invPreview, setInvPreview] = useState(null);
  const [invError, setInvError] = useState("");

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

  // 재고 엑셀 파일 선택
  async function handleInvFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setInvFile(file);
    setInvResult(null);
    setInvPreview(null);
    setInvError("");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const parsed = await parseInventoryBulkSetFile(arrayBuffer, file.name);

      if (parsed.errors?.length > 0) {
        setInvError(`파싱 오류 ${parsed.errors.length}건: ${parsed.errors.slice(0, 3).join(", ")}`);
      }

      setInvPreview(parsed);
    } catch (err) {
      setInvError(err?.message || "엑셀 파싱 실패");
      setInvPreview(null);
    }
  }

  // 재고 업로드 실행
  async function handleInvUpload() {
    if (!invPreview?.items?.length) {
      setInvError("업로드할 데이터가 없습니다.");
      return;
    }

    setInvUploading(true);
    setInvResult(null);
    setInvError("");

    try {
      const res = await http.post("/inventory/bulk-set", {
        items: invPreview.items,
        sourceKey: invFile?.name || "excel-upload",
      });

      setInvResult(res);

      if (res?.success > 0) {
        alert(`재고 설정 완료: ${res.success}건 성공, ${res.skipped || 0}건 스킵, ${res.error || 0}건 오류`);
      } else {
        alert(`업로드 결과: 성공 0건 (스킵: ${res?.skipped || 0}, 오류: ${res?.error || 0})`);
      }
    } catch (err) {
      setInvError(err?.message || "업로드 실패");
    } finally {
      setInvUploading(false);
    }
  }

  const cardStyle = {
    background: "#fff",
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
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
    <div style={{ padding: 20, maxWidth: 800 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>설정</h1>

      {/* 매장 관리 */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>매장 관리</div>
        <div style={{ display: "flex", gap: 6, marginBottom: storeError ? 8 : 0 }}>
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
            style={{ ...inputSmall, flex: 1 }}
            onKeyDown={(e) => e.key === "Enter" && handleAddStore()}
          />
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
      </div>

      {/* Location 관리 */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>창고/Location 관리</div>
        <div style={{ display: "flex", gap: 6, marginBottom: locError ? 8 : 0 }}>
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
            style={{ ...inputSmall, flex: 1 }}
            onKeyDown={(e) => e.key === "Enter" && handleAddLoc()}
          />
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

      {/* 재고관리 (Excel 업로드) */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>재고관리 (Excel 업로드)</div>
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10 }}>
          필수 헤더: <b>매장코드</b>, <b>단품코드</b>, <b>Location</b>, <b>수량</b> | 선택: 메모
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleInvFileSelect}
            disabled={invUploading}
            style={{ fontSize: 12 }}
          />
          <button
            type="button"
            onClick={handleInvUpload}
            disabled={invUploading || !invPreview?.items?.length}
            style={{ ...primaryBtn, padding: "6px 12px", fontSize: 12 }}
          >
            {invUploading ? "업로드 중..." : "업로드"}
          </button>
        </div>

        {invError && (
          <div style={{ marginTop: 8, fontSize: 11, color: "#ef4444" }}>
            {invError}
          </div>
        )}

        {/* 미리보기 */}
        {invPreview && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>
              파싱 결과: <b>{invPreview.items?.length || 0}</b>건
              {invPreview.errors?.length > 0 && (
                <span style={{ color: "#ef4444", marginLeft: 8 }}>
                  (오류: {invPreview.errors.length}건)
                </span>
              )}
            </div>

            {invPreview.sample?.length > 0 && (
              <div style={{ maxHeight: 200, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 6 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={thStyle}>매장코드</th>
                      <th style={thStyle}>단품코드</th>
                      <th style={thStyle}>Location</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>수량</th>
                      <th style={thStyle}>메모</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invPreview.sample.map((item, idx) => (
                      <tr key={idx}>
                        <td style={tdStyle}><b>{item.storeCode}</b></td>
                        <td style={tdStyle}>{item.skuCode}</td>
                        <td style={tdStyle}>{item.locationCode}</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>{item.qty?.toLocaleString()}</td>
                        <td style={tdStyle}>{item.memo || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 업로드 결과 */}
        {invResult && (
          <div style={{ marginTop: 10, padding: 10, background: "#f0fdf4", borderRadius: 8, fontSize: 12 }}>
            <div>
              총: <b>{invResult.total}</b>건 |
              성공: <b style={{ color: "#16a34a" }}>{invResult.success}</b>건 |
              스킵: <b>{invResult.skipped}</b>건 |
              오류: <b style={{ color: "#dc2626" }}>{invResult.error}</b>건
            </div>
            {invResult.results?.filter(r => r.status === "error").slice(0, 5).map((r, i) => (
              <div key={i} style={{ marginTop: 4, color: "#dc2626", fontSize: 11 }}>
                [{r.storeCode}] {r.skuCode} @ {r.locationCode}: {r.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
