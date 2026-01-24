import React, { useState, useEffect } from "react";
import { inputStyle, primaryBtn } from "../ui/styles";
import { http } from "../workflows/_common/http";
import { parseInventoryResetFile } from "../workflows/_common/excel/parseInventoryReset";
import { parseStoreBulkUpsertFile } from "../workflows/_common/excel/parseStoreBulkUpsert";
import { runSalesImport } from "../workflows/sales/sales.workflow";

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

  // 부서 관리
  const [departments, setDepartments] = useState([]);
  const [deptsLoading, setDeptsLoading] = useState(false);
  const [deptsVisible, setDeptsVisible] = useState(false);
  const [newDeptCode, setNewDeptCode] = useState("");
  const [newDeptName, setNewDeptName] = useState("");
  const [deptError, setDeptError] = useState("");
  const [editingDept, setEditingDept] = useState(null);

  // 직원 관리
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeesVisible, setEmployeesVisible] = useState(false);

  // 재고 초기화 (전체 교체)
  const [resetStoreCode, setResetStoreCode] = useState("");
  const [resetFile, setResetFile] = useState(null);
  const [resetUploading, setResetUploading] = useState(false);
  const [resetResult, setResetResult] = useState(null);
  const [resetPreview, setResetPreview] = useState(null);
  const [resetError, setResetError] = useState("");

  // 재고 초기화 상세 모달
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetSortKey, setResetSortKey] = useState(""); // storeName, sku, qty, location, makerCode, name
  const [resetSortDir, setResetSortDir] = useState("asc"); // asc, desc
  const [resetFilterStore, setResetFilterStore] = useState(""); // 매장 필터

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

  // 매출 관리
  const [salesFile, setSalesFile] = useState(null);
  const [salesSourceKey, setSalesSourceKey] = useState("");
  const [salesUploading, setSalesUploading] = useState(false);
  const [salesResult, setSalesResult] = useState(null);
  const [salesError, setSalesError] = useState("");

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

  // 부서 목록 로드
  async function loadDepartments() {
    setDeptsLoading(true);
    try {
      const res = await http.get("/departments");
      setDepartments(res?.rows || []);
      setDeptsVisible(true);
    } catch (e) {
      console.error("부서 목록 로드 실패:", e);
    } finally {
      setDeptsLoading(false);
    }
  }

  // 부서 추가
  async function handleAddDept() {
    const code = (newDeptCode || "").trim();
    const name = (newDeptName || "").trim();

    if (!code || !name) {
      setDeptError("부서코드와 부서명을 모두 입력해주세요");
      return;
    }

    setDeptError("");
    try {
      const res = await http.post("/departments", { code, name });
      if (!res.success) {
        setDeptError(res.error || "부서 추가 실패");
        return;
      }
      setNewDeptCode("");
      setNewDeptName("");
      await loadDepartments();
    } catch (e) {
      setDeptError(e?.message || "부서 추가 실패");
    }
  }

  // 부서 수정
  async function handleUpdateDept() {
    if (!editingDept) return;

    const code = (editingDept.code || "").trim();
    const name = (editingDept.name || "").trim();

    if (!code || !name) {
      setDeptError("부서코드와 부서명을 모두 입력해주세요");
      return;
    }

    setDeptError("");
    try {
      await http.patch(`/departments/${editingDept.id}`, { code, name, isActive: editingDept.isActive });
      setEditingDept(null);
      await loadDepartments();
    } catch (e) {
      setDeptError(e?.message || "부서 수정 실패");
    }
  }

  // 부서 삭제
  async function handleDeleteDept(id, name) {
    if (!confirm(`부서 "${name}"을(를) 삭제하시겠습니까?\n\n⚠️ 소속 직원은 부서가 해제됩니다.`)) return;

    try {
      await http.delete(`/departments/${id}`);
      await loadDepartments();
    } catch (e) {
      alert(e?.message || "부서 삭제 실패");
    }
  }

  // 직원 목록 로드
  async function loadEmployees() {
    setEmployeesLoading(true);
    try {
      const res = await http.get("/auth/employees");
      setEmployees(res || []);
      setEmployeesVisible(true);
    } catch (e) {
      console.error("직원 목록 로드 실패:", e);
    } finally {
      setEmployeesLoading(false);
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

  // 재고 초기화 실행 (매장명 매칭으로 여러 매장 한번에 처리)
  // skipConfirm: 모달에서 이미 확인한 경우 confirm 건너뛰기
  async function handleResetUpload(skipConfirm = false) {
    if (!resetPreview?.rows?.length) {
      setResetError("업로드할 데이터가 없습니다.");
      return;
    }

    // 엑셀 rows를 storeName별로 그룹핑
    const groupedByStore = {};
    const unmatchedStores = new Set();

    for (const row of resetPreview.rows) {
      const storeName = (row.storeName || "").trim();
      if (!storeName) continue;

      // 매장 매칭: code 우선, 없으면 name으로 매칭 (Store.code 기준 통일)
      const matchedStore = invStores.find((s) => s.code === storeName)
        || invStores.find((s) => s.name === storeName);

      if (!matchedStore) {
        unmatchedStores.add(storeName);
        continue;
      }

      const storeCode = matchedStore.code;
      const isHq = matchedStore.isHq;

      if (!groupedByStore[storeCode]) {
        groupedByStore[storeCode] = {
          storeCode,
          storeName: matchedStore.name,
          isHq,
          rows: [],
        };
      }

      // 매장(isHq가 아닌 경우)이고 location이 없으면 FLOOR로 자동 설정
      const finalRow = { ...row };
      if (!isHq && !finalRow.location) {
        finalRow.location = "FLOOR";
      }

      groupedByStore[storeCode].rows.push(finalRow);
    }

    const storeGroups = Object.values(groupedByStore);

    if (storeGroups.length === 0) {
      setResetError(`매칭되는 매장이 없습니다. 엑셀의 '매장/창고' 컬럼을 확인해주세요.\n매칭 실패: ${[...unmatchedStores].join(", ")}`);
      return;
    }

    // 확인 메시지 (모달에서 이미 확인한 경우 건너뛰기)
    if (!skipConfirm) {
      const storeList = storeGroups.map((g) => `  • ${g.storeName} (${g.storeCode}): ${g.rows.length}건`).join("\n");
      const unmatchedMsg = unmatchedStores.size > 0 ? `\n\n⚠️ 매칭 실패 매장: ${[...unmatchedStores].join(", ")}` : "";

      if (!confirm(`다음 매장의 재고를 엑셀 기준으로 전체 교체합니다.\n\n${storeList}${unmatchedMsg}\n\n⚠️ 주의: 각 매장별로 엑셀에 없는 재고는 삭제됩니다.\n\n계속하시겠습니까?`)) {
        return;
      }
    }

    setResetUploading(true);
    setResetResult(null);
    setResetError("");

    const results = [];
    const errors = [];

    for (const group of storeGroups) {
      try {
        const res = await http.post("/inventory/reset", {
          storeCode: group.storeCode,
          rows: group.rows,
        });
        results.push({
          storeCode: group.storeCode,
          storeName: group.storeName,
          ...res,
        });
      } catch (err) {
        errors.push({
          storeCode: group.storeCode,
          storeName: group.storeName,
          error: err?.message || "업로드 실패",
        });
      }
    }

    setResetResult({ results, errors, totalStores: storeGroups.length });

    // 완료 메시지
    const successCount = results.length;
    const errorCount = errors.length;
    const totalApplied = results.reduce((sum, r) => sum + (r.applied || 0), 0);

    let msg = `재고 초기화 완료!\n\n성공: ${successCount}개 매장\n적용: ${totalApplied}건`;
    if (errorCount > 0) {
      msg += `\n\n❌ 실패: ${errorCount}개 매장\n${errors.map((e) => `  • ${e.storeName}: ${e.error}`).join("\n")}`;
    }
    alert(msg);

    if (errors.length > 0) {
      setResetError(`${errors.length}개 매장 처리 실패: ${errors.map((e) => e.storeName).join(", ")}`);
    }

    setResetUploading(false);
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

  // 매출 엑셀 파일 선택
  function handleSalesFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setSalesFile(file);
    setSalesResult(null);
    setSalesError("");

    // sourceKey 자동 설정
    if (!salesSourceKey) {
      setSalesSourceKey(file.name.replace(/\.(xlsx|xls|csv)$/i, ""));
    }
  }

  // 매출 엑셀 업로드
  async function handleSalesUpload() {
    if (!salesFile) {
      setSalesError("엑셀 파일을 선택해주세요.");
      return;
    }

    setSalesUploading(true);
    setSalesResult(null);
    setSalesError("");

    try {
      const res = await runSalesImport({
        file: salesFile,
        sourceKey: salesSourceKey?.trim() || null,
        onProgress: () => {},
      });

      setSalesResult(res);

      if (res?.inserted > 0) {
        alert(`매출 업로드 완료: ${res.inserted}건 저장${res.skipped ? ` (${res.skipped}건 스킵)` : ""}`);
      } else {
        alert(`업로드 결과: 저장된 데이터가 없습니다 (스킵: ${res?.skipped || 0}건)`);
      }
    } catch (err) {
      setSalesError(err?.message || "매출 업로드 실패");
    } finally {
      setSalesUploading(false);
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
            Excel 일괄 등록 - 필수: <b>매장코드</b>, <b>매장명</b>
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
              <>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 8, marginBottom: 4 }}>
                  총 <b style={{ color: "#0ea5e9" }}>{stores.length}</b>개 매장 (본사: {stores.filter(s => s.isHq).length}, 매장: {stores.filter(s => !s.isHq).length})
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ ...thStyle, width: 60 }}>#</th>
                    <th style={{ ...thStyle, width: 220 }}>ID (DB)</th>
                    <th style={thStyle}>코드</th>
                    <th style={thStyle}>매장명</th>
                    <th style={thStyle}>구분</th>
                    <th style={{ ...thStyle, width: 100 }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map((s, idx) => (
                    <tr key={s.id}>
                      <td style={{ ...tdStyle, color: "#94a3b8", fontSize: 11 }}>{idx + 1}</td>
                      <td style={{ ...tdStyle, fontFamily: "Consolas, monospace", fontSize: 10, color: "#64748b" }}>{s.id}</td>
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
                          <div style={{ display: "flex", gap: 4, whiteSpace: "nowrap" }}>
                            <button
                              type="button"
                              onClick={handleUpdateStore}
                              style={{ ...smallBtnStyle, background: "#3b82f6", color: "#fff", border: "none", padding: "4px 8px", whiteSpace: "nowrap" }}
                            >
                              저장
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingStore(null)}
                              style={{ ...smallBtnStyle, padding: "4px 8px", whiteSpace: "nowrap" }}
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 4, whiteSpace: "nowrap" }}>
                            <button
                              type="button"
                              onClick={() => setEditingStore({ id: s.id, code: s.code, name: s.name || "" })}
                              style={{ ...smallBtnStyle, padding: "4px 8px", whiteSpace: "nowrap" }}
                            >
                              수정
                            </button>
                            {!s.isHq && (
                              <button
                                type="button"
                                onClick={() => handleDeleteStore(s.id, s.code, s.isHq)}
                                style={{ ...smallBtnStyle, color: "#ef4444", padding: "4px 8px", whiteSpace: "nowrap" }}
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
              </>
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

      {/* 부서 관리 */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>부서 관리</span>
            <input
              type="text"
              value={newDeptCode}
              onChange={(e) => setNewDeptCode(e.target.value)}
              placeholder="부서코드"
              style={{ ...inputSmall, width: 100 }}
            />
            <input
              type="text"
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              placeholder="부서명"
              style={{ ...inputSmall, width: 120 }}
              onKeyDown={(e) => e.key === "Enter" && handleAddDept()}
            />
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              onClick={handleAddDept}
              style={{ ...primaryBtn, padding: "6px 12px", fontSize: 12 }}
            >
              추가
            </button>
            <button
              type="button"
              onClick={loadDepartments}
              disabled={deptsLoading}
              style={{ ...smallBtnStyle, background: "#3b82f6", color: "#fff", border: "none" }}
            >
              {deptsLoading ? "..." : "조회"}
            </button>
          </div>
        </div>

        {deptError && (
          <div style={{ marginBottom: 8, fontSize: 11, color: "#ef4444" }}>
            {deptError}
          </div>
        )}

        {/* 부서 목록 */}
        {deptsVisible && (
          <>
            {deptsLoading ? (
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>로딩 중...</div>
            ) : departments.length === 0 ? (
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>등록된 부서가 없습니다.</div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 8, marginBottom: 4 }}>
                  총 <b style={{ color: "#0ea5e9" }}>{departments.length}</b>개 부서
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={{ ...thStyle, width: 60 }}>#</th>
                      <th style={thStyle}>코드</th>
                      <th style={thStyle}>부서명</th>
                      <th style={thStyle}>직원수</th>
                      <th style={thStyle}>상태</th>
                      <th style={{ ...thStyle, width: 100 }}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {departments.map((d, idx) => (
                      <tr key={d.id}>
                        <td style={{ ...tdStyle, color: "#94a3b8", fontSize: 11 }}>{idx + 1}</td>
                        <td style={tdStyle}>
                          {editingDept?.id === d.id ? (
                            <input
                              type="text"
                              value={editingDept.code}
                              onChange={(e) => setEditingDept({ ...editingDept, code: e.target.value })}
                              style={{ ...inputSmall, width: 80 }}
                            />
                          ) : (
                            <b>{d.code}</b>
                          )}
                        </td>
                        <td style={tdStyle}>
                          {editingDept?.id === d.id ? (
                            <input
                              type="text"
                              value={editingDept.name || ""}
                              onChange={(e) => setEditingDept({ ...editingDept, name: e.target.value })}
                              style={{ ...inputSmall, width: "100%" }}
                            />
                          ) : (
                            d.name || "-"
                          )}
                        </td>
                        <td style={tdStyle}>
                          <span style={{ color: "#64748b" }}>{d.employeeCount || 0}명</span>
                        </td>
                        <td style={tdStyle}>
                          {editingDept?.id === d.id ? (
                            <select
                              value={editingDept.isActive ? "active" : "inactive"}
                              onChange={(e) => setEditingDept({ ...editingDept, isActive: e.target.value === "active" })}
                              style={{ ...inputSmall, width: 80 }}
                            >
                              <option value="active">활성</option>
                              <option value="inactive">비활성</option>
                            </select>
                          ) : d.isActive ? (
                            <span style={{ color: "#16a34a", fontWeight: 600, fontSize: 11 }}>활성</span>
                          ) : (
                            <span style={{ color: "#94a3b8", fontSize: 11 }}>비활성</span>
                          )}
                        </td>
                        <td style={tdStyle}>
                          {editingDept?.id === d.id ? (
                            <div style={{ display: "flex", gap: 4, whiteSpace: "nowrap" }}>
                              <button
                                type="button"
                                onClick={handleUpdateDept}
                                style={{ ...smallBtnStyle, background: "#3b82f6", color: "#fff", border: "none", padding: "4px 8px", whiteSpace: "nowrap" }}
                              >
                                저장
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingDept(null)}
                                style={{ ...smallBtnStyle, padding: "4px 8px", whiteSpace: "nowrap" }}
                              >
                                취소
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", gap: 4, whiteSpace: "nowrap" }}>
                              <button
                                type="button"
                                onClick={() => setEditingDept({ id: d.id, code: d.code, name: d.name || "", isActive: d.isActive })}
                                style={{ ...smallBtnStyle, padding: "4px 8px", whiteSpace: "nowrap" }}
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteDept(d.id, d.name)}
                                style={{ ...smallBtnStyle, color: "#ef4444", padding: "4px 8px", whiteSpace: "nowrap" }}
                              >
                                삭제
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
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
            필수: <b>매장/창고</b>, <b>SKU</b>, <b>수량</b>, <b>MakerCode</b>, <b>상품명</b> | 선택: Location (매장은 FLOOR 자동)
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleResetFileSelect}
              disabled={resetUploading}
              style={{ fontSize: 12 }}
            />
            <span style={{ fontSize: 11, color: "#64748b" }}>엑셀의 '매장/창고' 컬럼으로 매장 자동 매칭</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setResetSortKey("");
              setResetSortDir("asc");
              setResetFilterStore("");
              setResetModalOpen(true);
            }}
            disabled={!resetPreview?.rows?.length}
            style={{ ...primaryBtn, padding: "6px 12px", fontSize: 12 }}
          >
            상세 보기
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
            {/* 매장별 요약 */}
            {(() => {
              const storeNames = [...new Set(resetPreview.rows?.map(r => r.storeName).filter(Boolean) || [])];
              // code 우선, name 보조 매칭 (Store.code 기준 통일)
              const findStore = (name) => invStores.find(s => s.code === name) || invStores.find(s => s.name === name);
              const matched = storeNames.filter(name => findStore(name));
              const unmatched = storeNames.filter(name => !findStore(name));
              return (
                <div style={{ fontSize: 11, marginBottom: 8, padding: 6, background: "#f8fafc", borderRadius: 4 }}>
                  <span>매장: </span>
                  {matched.length > 0 && <span style={{ color: "#16a34a" }}>매칭됨 {matched.length}개 ({matched.join(", ")})</span>}
                  {matched.length > 0 && unmatched.length > 0 && <span> | </span>}
                  {unmatched.length > 0 && <span style={{ color: "#dc2626" }}>미매칭 {unmatched.length}개 ({unmatched.join(", ")})</span>}
                </div>
              );
            })()}

            {resetPreview.sample?.length > 0 && (
              <div style={{ maxHeight: 180, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 6 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={thStyle}>매장/창고</th>
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
                        <td style={{ ...tdStyle, fontWeight: 600, color: (invStores.find(s => s.code === item.storeName) || invStores.find(s => s.name === item.storeName)) ? "#16a34a" : "#dc2626" }}>{item.storeName || "-"}</td>
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
            <div style={{ marginBottom: 6, fontWeight: 700 }}>
              처리 완료: {resetResult.results?.length || 0}개 매장
              {resetResult.errors?.length > 0 && <span style={{ color: "#dc2626", marginLeft: 8 }}>실패: {resetResult.errors.length}개</span>}
            </div>
            {resetResult.results?.map((r, idx) => (
              <div key={idx} style={{ marginBottom: 4 }}>
                <span style={{ color: "#16a34a" }}>✓</span> {r.storeName} ({r.storeCode}): Location {r.locations}개, SKU {r.skus}개, 적용 <b>{r.applied}</b>건
              </div>
            ))}
            {resetResult.errors?.map((e, idx) => (
              <div key={idx} style={{ marginBottom: 4, color: "#dc2626" }}>
                ✗ {e.storeName} ({e.storeCode}): {e.error}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 매출 관리 */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>매출 관리</span>
            <span style={{ fontSize: 11, color: "#0ea5e9" }}>매출 데이터 업로드</span>
          </div>
          <span style={{ fontSize: 11, color: "#64748b" }}>
            필수: <b>매장명</b>, <b>매출일</b>, <b>매출금액</b>, <b>수량</b>, <b>코드명</b> | 선택: 구분, 단품코드
          </span>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleSalesFileSelect}
            disabled={salesUploading}
            style={{ fontSize: 12 }}
          />
          <input
            type="text"
            value={salesSourceKey}
            onChange={(e) => setSalesSourceKey(e.target.value)}
            placeholder="sourceKey (중복 추적용)"
            style={{ ...inputSmall, width: 180 }}
            disabled={salesUploading}
          />
          <button
            type="button"
            onClick={handleSalesUpload}
            disabled={salesUploading || !salesFile}
            style={{ ...primaryBtn, padding: "6px 12px", fontSize: 12 }}
          >
            {salesUploading ? "업로드 중..." : "업로드"}
          </button>
        </div>

        {salesFile && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#78716c" }}>
            선택됨: <b>{salesFile.name}</b>
          </div>
        )}

        {salesError && (
          <div style={{ marginTop: 8, fontSize: 11, color: "#ef4444" }}>
            {salesError}
          </div>
        )}

        {salesResult && (
          <div style={{ marginTop: 10, padding: 10, background: "#f0fdf4", borderRadius: 8, fontSize: 12 }}>
            <div>
              저장: <b style={{ color: "#16a34a" }}>{salesResult.inserted}</b>건 | 스킵: <b>{salesResult.skipped}</b>건
            </div>
            {salesResult.errorsSample?.length > 0 && (
              <div style={{ marginTop: 6, color: "#dc2626" }}>
                에러 샘플: {salesResult.errorsSample.slice(0, 3).join(", ")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 직원 관리 */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>직원 관리</span>
          <button
            type="button"
            onClick={loadEmployees}
            disabled={employeesLoading}
            style={{ ...smallBtnStyle, background: "#3b82f6", color: "#fff", border: "none" }}
          >
            {employeesLoading ? "..." : "조회"}
          </button>
        </div>

        {/* 직원 목록 */}
        {employeesVisible && (
          <>
            {employeesLoading ? (
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>로딩 중...</div>
            ) : employees.length === 0 ? (
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>등록된 직원이 없습니다.</div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 8, marginBottom: 4 }}>
                  총 <b style={{ color: "#0ea5e9" }}>{employees.length}</b>명 |
                  활성: {employees.filter(e => e.status === "ACTIVE").length}명 |
                  승인대기: {employees.filter(e => e.status === "PENDING").length}명 |
                  비활성: {employees.filter(e => e.status === "DISABLED").length}명
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={{ ...thStyle, width: 40 }}>#</th>
                      <th style={thStyle}>이름</th>
                      <th style={thStyle}>이메일</th>
                      <th style={thStyle}>전화번호</th>
                      <th style={thStyle}>역할</th>
                      <th style={thStyle}>소속</th>
                      <th style={thStyle}>상태</th>
                      <th style={thStyle}>가입일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp, idx) => (
                      <tr key={emp.id}>
                        <td style={{ ...tdStyle, color: "#94a3b8", fontSize: 11 }}>{idx + 1}</td>
                        <td style={tdStyle}>
                          <b>{emp.name}</b>
                        </td>
                        <td style={{ ...tdStyle, fontSize: 11, color: "#64748b" }}>{emp.email}</td>
                        <td style={{ ...tdStyle, fontSize: 11 }}>{emp.phone || "-"}</td>
                        <td style={tdStyle}>
                          <span style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: emp.isHq ? "#0ea5e9" : "#64748b"
                          }}>
                            {emp.role === "HQ_ADMIN" ? "본사관리자" :
                             emp.role === "HQ_WMS" ? "본사WMS" :
                             emp.role === "SALES" ? "영업" :
                             emp.role === "STORE_MANAGER" ? "매장관리자" :
                             emp.role === "STORE_STAFF" ? "매장직원" : emp.role}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          {emp.isHq ? (
                            <span style={{ fontSize: 11, color: "#0ea5e9" }}>
                              {emp.departmentName || "본사"}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11 }}>
                              {emp.storeName || "-"}
                            </span>
                          )}
                        </td>
                        <td style={tdStyle}>
                          {emp.status === "ACTIVE" ? (
                            <span style={{ color: "#16a34a", fontWeight: 600, fontSize: 11 }}>활성</span>
                          ) : emp.status === "PENDING" ? (
                            <span style={{ color: "#f59e0b", fontWeight: 600, fontSize: 11 }}>승인대기</span>
                          ) : (
                            <span style={{ color: "#94a3b8", fontSize: 11 }}>비활성</span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, fontSize: 11, color: "#64748b" }}>
                          {emp.createdAt ? new Date(emp.createdAt).toLocaleDateString("ko-KR") : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
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

      {/* 재고 초기화 상세 모달 */}
      {resetModalOpen && resetPreview?.rows?.length > 0 && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setResetModalOpen(false);
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              width: "90%",
              maxWidth: 1200,
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
          >
            {/* 모달 헤더 */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <span style={{ fontSize: 16, fontWeight: 700 }}>재고 초기화 상세</span>
                <span style={{ fontSize: 13, color: "#64748b", marginLeft: 12 }}>
                  총 <b>{resetPreview.rows.length}</b>건
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  value={resetFilterStore}
                  onChange={(e) => setResetFilterStore(e.target.value)}
                  style={{ ...inputSmall, minWidth: 150 }}
                >
                  <option value="">전체 매장</option>
                  {[...new Set(resetPreview.rows.map((r) => r.storeName).filter(Boolean))].map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setResetModalOpen(false)}
                  style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontSize: 12 }}
                >
                  닫기
                </button>
              </div>
            </div>

            {/* 모달 본문 - 테이블 */}
            <div style={{ flex: 1, overflow: "auto", padding: "0 20px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead style={{ position: "sticky", top: 0, background: "#f8fafc", zIndex: 1 }}>
                  <tr>
                    {[
                      { key: "storeName", label: "매장/창고" },
                      { key: "sku", label: "SKU" },
                      { key: "qty", label: "수량", align: "right" },
                      { key: "location", label: "Location" },
                      { key: "makerCode", label: "MakerCode" },
                      { key: "name", label: "상품명" },
                      { key: "productType", label: "상품구분" },
                    ].map((col) => (
                      <th
                        key={col.key}
                        onClick={() => {
                          if (resetSortKey === col.key) {
                            setResetSortDir(resetSortDir === "asc" ? "desc" : "asc");
                          } else {
                            setResetSortKey(col.key);
                            setResetSortDir("asc");
                          }
                        }}
                        style={{
                          ...thStyle,
                          textAlign: col.align || "left",
                          cursor: "pointer",
                          userSelect: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {col.label}
                        {resetSortKey === col.key && (
                          <span style={{ marginLeft: 4 }}>{resetSortDir === "asc" ? "▲" : "▼"}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let rows = [...resetPreview.rows];

                    // 매장 필터
                    if (resetFilterStore) {
                      rows = rows.filter((r) => r.storeName === resetFilterStore);
                    }

                    // 정렬
                    if (resetSortKey) {
                      rows.sort((a, b) => {
                        let va = a[resetSortKey] ?? "";
                        let vb = b[resetSortKey] ?? "";

                        // 숫자 컬럼
                        if (resetSortKey === "qty") {
                          va = Number(va) || 0;
                          vb = Number(vb) || 0;
                          return resetSortDir === "asc" ? va - vb : vb - va;
                        }

                        // 문자열 컬럼
                        va = String(va).toLowerCase();
                        vb = String(vb).toLowerCase();
                        if (va < vb) return resetSortDir === "asc" ? -1 : 1;
                        if (va > vb) return resetSortDir === "asc" ? 1 : -1;
                        return 0;
                      });
                    }

                    return rows.map((item, idx) => {
                      // code 우선, name 보조 매칭 (Store.code 기준 통일)
                      const isMatched = invStores.find((s) => s.code === item.storeName) || invStores.find((s) => s.name === item.storeName);
                      return (
                        <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ ...tdStyle, fontWeight: 600, color: isMatched ? "#16a34a" : "#dc2626" }}>
                            {item.storeName || "-"}
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>{item.sku}</td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>{item.qty?.toLocaleString()}</td>
                          <td style={tdStyle}>{item.location || "-"}</td>
                          <td style={tdStyle}>{item.makerCode || "-"}</td>
                          <td style={tdStyle}>{item.name || "-"}</td>
                          <td style={tdStyle}>{item.productType || "-"}</td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>

            {/* 모달 푸터 */}
            <div
              style={{
                padding: "16px 20px",
                borderTop: "1px solid #e5e7eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ fontSize: 12, color: "#64748b" }}>
                {(() => {
                  const storeNames = [...new Set(resetPreview.rows.map((r) => r.storeName).filter(Boolean))];
                  // code 우선, name 보조 매칭 (Store.code 기준 통일)
                  const findStore = (name) => invStores.find((s) => s.code === name) || invStores.find((s) => s.name === name);
                  const matched = storeNames.filter((name) => findStore(name));
                  const unmatched = storeNames.filter((name) => !findStore(name));
                  return (
                    <>
                      <span style={{ color: "#16a34a" }}>매칭됨: {matched.length}개 매장</span>
                      {unmatched.length > 0 && (
                        <span style={{ color: "#dc2626", marginLeft: 12 }}>미매칭: {unmatched.length}개 ({unmatched.join(", ")})</span>
                      )}
                    </>
                  );
                })()}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setResetModalOpen(false)}
                  style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontSize: 13 }}
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResetModalOpen(false);
                    handleResetUpload(true); // skipConfirm=true: 모달에서 이미 확인함
                  }}
                  disabled={resetUploading}
                  style={{
                    padding: "8px 20px",
                    borderRadius: 6,
                    border: "1px solid #fecaca",
                    background: "#fef2f2",
                    color: "#dc2626",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {resetUploading ? "처리중..." : "확정 (재고 초기화 실행)"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
