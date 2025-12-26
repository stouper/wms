import React, { useMemo, useState } from "react";
import { layoutStyle, asideStyle, mainStyle, navBtnStyle } from "./ui/styles";
import DashboardPage from "./pages/DashboardPage";
import InventoryPage from "./pages/InventoryPage";
import EmptyPage from "./pages/EmptyPage";

// ✅ 이제 Workbench를 App에서 직접 호출하지 않는다.
// ✅ 메뉴별 전용 Page로 분리 (창고입고/매장출고)
import WarehouseInboundPage from "./pages/WarehouseInboundPage";
import StoreOutboundPage from "./pages/StoreOutboundPage";
import ParcelRequestPage from "./pages/ParcelRequestPage";

const MENUS = [
  { key: "dashboard", label: "데쉬보드" },
  { key: "inventory", label: "창고 재고" },
  { key: "whInbound", label: "창고 입고" },
  { key: "whOutbound", label: "창고 출고" },
  { key: "storeShip", label: "매장 출고" },
  { key: "delivery", label: "택배 출고" },
];

function WarehouseOutboundPage() {
  // TODO: 창고 출고 전용 페이지 만들 때 여기 교체
  return <EmptyPage title="창고 출고" />;
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
      case "storeShip":
        return StoreOutboundPage;
      case "delivery":
        return ParcelRequestPage;
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
        <ActiveComp key={activeKey} />
      </main>
    </div>
  );
}
