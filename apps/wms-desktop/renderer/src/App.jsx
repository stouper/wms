import React, { useMemo, useState } from "react";
import { layoutStyle, asideStyle, mainStyle, navBtnStyle } from "./ui/styles";

import DashboardPage from "./pages/DashboardPage";
import InventoryPage from "./pages/InventoryPage";
import EmptyPage from "./pages/EmptyPage";
import JobsExcelWorkbench from "./pages/JobsExcelWorkbench";

const MENUS = [
  { key: "dashboard", label: "데쉬보드" },
  { key: "inventory", label: "창고 재고" },
  { key: "whInbound", label: "창고 입고" },
  { key: "whOutbound", label: "창고 출고" },
  { key: "storeShip", label: "매장 출고" },
  { key: "delivery", label: "택배 출고" },
];

function WarehouseInboundPage() {
  return <EmptyPage title="창고 입고" subtitle="입고는 다음 단계(OUT 안정화 후)로 붙일게." />;
}
function WarehouseOutboundPage() {
  return <EmptyPage title="창고 출고" />;
}
function DeliveryOutboundPage() {
  return <EmptyPage title="택배 출고" />;
}
function StoreOutboundPage() {
  return <JobsExcelWorkbench pageKey="storeShip" pageTitle="매장 출고" defaultStoreCode="" />;
}

export default function App() {
  const [activeKey, setActiveKey] = useState("storeShip");

  const ActiveComp = useMemo(() => {
    switch (activeKey) {
      case "dashboard":
        return DashboardPage;
      case "inventory":
        return InventoryPage;
      case "whInbound":
        return WarehouseInboundPage;
      case "whOutbound":
        return WarehouseOutboundPage;
      case "delivery":
        return DeliveryOutboundPage;
      case "storeShip":
        return StoreOutboundPage;
      default:
        return () => <EmptyPage title="페이지 없음" />;
    }
  }, [activeKey]);

  return (
    <div style={layoutStyle}>
      <aside style={asideStyle}>
        <div style={{ fontWeight: 800, marginBottom: 12 }}>ESKA WMS Desktop</div>
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

        <div style={{ marginTop: 12, fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>
          ✅ B안: 엑셀 1번 업로드 → storeCode별 작지 자동 분리 생성 → 스캔 → EPMS Export
          <br />
          ✅ API Base는 화면에 숨김 (localStorage: wms.apiBase)
        </div>
      </aside>

      <main style={mainStyle}>
        <ActiveComp />
      </main>
    </div>
  );
}
