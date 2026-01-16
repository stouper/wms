import React, { useMemo, useState } from "react";
import { layoutStyle, asideStyle, mainStyle, navBtnStyle } from "./ui/styles";

import DashboardPage from "./pages/DashboardPage";
import InventoryPage from "./pages/InventoryPage";
import SalesPage from "./pages/SalesPage";

import WarehouseInboundPage from "./pages/WarehouseInboundPage";
import StoreOutboundPage from "./pages/StoreOutboundPage";
import ParcelRequestPage from "./pages/ParcelRequestPage";

const MENUS = [
  { key: "dashboard", label: "대시보드" },
  { key: "inventory", label: "창고 재고" },
  { key: "whInbound", label: "창고 입고" },

  // ✅ 매출 업로드 전용 메뉴로 분리
  { key: "salesImport", label: "매출" },

  { key: "storeShip", label: "매장 출고" },
  { key: "delivery", label: "택배 출고" },
];

export default function App() {
  const [activeKey, setActiveKey] = useState("salesImport");

  const ActiveComp = useMemo(() => {
    switch (activeKey) {
      case "dashboard":
        return DashboardPage;
      case "inventory":
        return InventoryPage;
      case "whInbound":
        return WarehouseInboundPage;
      case "salesImport":
        return SalesPage;
      case "storeShip":
        return StoreOutboundPage;
      case "delivery":
        return ParcelRequestPage;
      default:
        return () => <div>페이지 없음</div>;
    }
  }, [activeKey]);

  return (
    <div style={layoutStyle}>
      <aside style={asideStyle}>
        <div style={{ fontWeight: 800, marginBottom: 12 }}>
          ESKA WMS Desktop
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

        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            color: "#94a3b8",
            lineHeight: 1.5,
          }}
        >
          ✅ 매출 엑셀 업로드 → DB 적재
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
