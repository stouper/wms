import React, { useMemo, useState, useEffect } from "react";
import { layoutStyle, asideStyle, mainStyle, navBtnStyle, primaryBtn, inputStyle } from "./ui/styles";

import DashboardPage from "./pages/DashboardPage";
import InventoryPage from "./pages/InventoryPage";
import StoreInventoryPage from "./pages/StoreInventoryPage";
import SalesPage from "./pages/SalesPage";

import ExternalInboundPage from "./pages/ExternalInboundPage";
import StoreReturnPage from "./pages/StoreReturnPage";
import StoreOutboundPage from "./pages/StoreOutboundPage";
import ParcelShipmentPage from "./pages/ParcelShipmentPage";
import SettingsPage from "./pages/SettingsPage";

// ✅ 작업자 ID 관리
import { getOperatorId, setOperatorId } from "./workflows/_common/operator";

const MENUS = [
  { key: "dashboard", label: "대시 보드" },
  { key: "storeShip", label: "매장 출고" },
  { key: "storeReturn", label: "매장 반품" },
  { key: "delivery", label: "택배 작업" },
  { key: "externalInbound", label: "외부 입고" },
  { key: "inventory", label: "창고 재고" },
  { key: "storeInventory", label: "매장 재고" },
  { key: "salesImport", label: "매출" },
  { key: "settings", label: "설정" },
];

export default function App() {
  const [activeKey, setActiveKey] = useState("dashboard");

  // ✅ 작업자 ID 상태
  const [operatorId, setOperatorIdState] = useState(() => getOperatorId() || "");
  const [showOperatorModal, setShowOperatorModal] = useState(false);
  const [tempOperatorId, setTempOperatorId] = useState("");

  // ✅ 초기 로드: operatorId 없으면 모달 띄움
  useEffect(() => {
    const id = getOperatorId();
    if (!id || id.trim() === "") {
      setShowOperatorModal(true);
      setTempOperatorId("");
    } else {
      setOperatorIdState(id);
    }
  }, []);

  // ✅ 작업자 ID 저장
  function saveOperatorId() {
    const trimmed = (tempOperatorId || "").trim();
    if (!trimmed) {
      alert("작업자 ID를 입력해주세요");
      return;
    }

    setOperatorId(trimmed);
    setOperatorIdState(trimmed);
    setShowOperatorModal(false);
    setTempOperatorId("");
  }

  // ✅ 작업자 변경 (사이드바 버튼)
  function changeOperator() {
    setTempOperatorId(operatorId || "");
    setShowOperatorModal(true);
  }

  const ActiveComp = useMemo(() => {
    switch (activeKey) {
      case "dashboard":
        return DashboardPage;
      case "inventory":
        return InventoryPage;
      case "storeInventory":
        return StoreInventoryPage;
      case "externalInbound":
        return ExternalInboundPage;
      case "storeReturn":
        return StoreReturnPage;
      case "salesImport":
        return SalesPage;
      case "storeShip":
        return StoreOutboundPage;
      case "delivery":
        return ParcelShipmentPage;
      case "settings":
        return SettingsPage;
      default:
        return () => <div>페이지 없음</div>;
    }
  }, [activeKey]);

  return (
    <div style={layoutStyle}>
      {/* ✅ 작업자 입력 모달 */}
      {showOperatorModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              width: 400,
              maxWidth: "90%",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.3)",
            }}
          >
            <h2 style={{ margin: 0, marginBottom: 16, fontSize: 18, fontWeight: 900 }}>작업자 확인</h2>
            <p style={{ margin: 0, marginBottom: 16, fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>
              작업 시작 전에 본인의 작업자 ID를 입력해주세요.
              <br />
              입력한 ID는 모든 작업 기록에 저장됩니다.
            </p>

            <input
              type="text"
              value={tempOperatorId}
              onChange={(e) => setTempOperatorId(e.target.value)}
              placeholder="작업자 ID (예: 홍길동, emp001)"
              style={{
                ...inputStyle,
                width: "100%",
                marginBottom: 16,
                fontSize: 16,
                padding: 12,
              }}
              onKeyDown={(e) => e.key === "Enter" && saveOperatorId()}
              autoFocus
            />

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              {operatorId && (
                <button
                  type="button"
                  onClick={() => {
                    setShowOperatorModal(false);
                    setTempOperatorId("");
                  }}
                  style={{
                    padding: "12px 20px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  취소
                </button>
              )}
              <button
                type="button"
                onClick={saveOperatorId}
                style={{
                  ...primaryBtn,
                  padding: "12px 24px",
                  fontSize: 14,
                }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      <aside style={asideStyle}>
        <div style={{ fontWeight: 800, marginBottom: 12 }}>
          ESKA WMS
        </div>

        <nav>
          {MENUS.map((m) => (
            <button
              key={m.key}
              onClick={() => setActiveKey(m.key)}
              style={navBtnStyle(activeKey === m.key)}
              type="button"
            >
              {m.label}
            </button>
          ))}
        </nav>

        {/* ✅ 작업자 정보 (하단) */}
        <div
          style={{
            marginTop: "auto",
            paddingTop: 16,
            borderTop: "1px solid #334155",
          }}
        >
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>
            현재 작업자
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: 10,
              background: "#1e293b",
              borderRadius: 8,
              border: "1px solid #334155",
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 900,
                color: "#fff",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={operatorId || "미설정"}
            >
              {operatorId || "미설정"}
            </div>
            <button
              type="button"
              onClick={changeOperator}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #475569",
                background: "#334155",
                cursor: "pointer",
                fontSize: 12,
                color: "#e2e8f0",
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              변경
            </button>
          </div>
        </div>
      </aside>

      <main style={mainStyle}>
        <ActiveComp key={activeKey} />
      </main>
    </div>
  );
}
