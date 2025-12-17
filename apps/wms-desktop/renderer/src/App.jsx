import React, { useMemo, useState } from "react";
import { layoutStyle, asideStyle, mainStyle, navBtnStyle } from "./ui/styles";

import DashboardPage from "./pages/DashboardPage";
import InventoryPage from "./pages/InventoryPage";
import EmptyPage from "./pages/EmptyPage";
import JobsExcelWorkbench from "./pages/JobsExcelWorkbench";

const MENUS = [
  { key: "dashboard", label: "데쉬보드", component: "DashboardPage" },
  { key: "inventory", label: "창고 재고", component: "InventoryPage" },
  { key: "whInbound", label: "창고 입고", component: "WarehouseInboundPage" },
  { key: "whOutbound", label: "창고 출고", component: "WarehouseOutboundPage" },
  { key: "storeShip", label: "매장 출고", component: "StoreOutboundPage" },
  { key: "delivery", label: "택배 출고", component: "DeliveryOutboundPage" },
];

export default function App() {
  const [activeKey, setActiveKey] = useState("storeShip");

  const ActiveComp = useMemo(() => {
    const found = MENUS.find((m) => m.key === activeKey) || MENUS[0];
    const map = {
      DashboardPage,
      InventoryPage,
      WarehouseInboundPage,
      WarehouseOutboundPage,
      StoreOutboundPage,
      DeliveryOutboundPage,
    };
    const Comp = map[found.component] || (() => <EmptyPage title="페이지 없음" />);
    return () => <Comp />;
  }, [activeKey]);

  return (
    <div style={layoutStyle}>
      <aside style={asideStyle}>
        <div style={{ fontWeight: 800, marginBottom: 12 }}>ESKA WMS Desktop</div>
        <nav>
          {MENUS.map((m) => (
            <button key={m.key} onClick={() => setActiveKey(m.key)} style={navBtnStyle(activeKey === m.key)}>
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

/* ---- pages ---- */

function WarehouseInboundPage() {
  return <EmptyPage title="창고 입고" subtitle="입고는 다음 단계(OUT 안정화 후)로 붙일게." />;
}

function WarehouseOutboundPage() {
  // 요청대로: 우선 좌측 메뉴만 남기고 내용 비움
  return <EmptyPage title="창고 출고" />;
}

function DeliveryOutboundPage() {
  // 요청대로: 우선 좌측 메뉴만 남기고 내용 비움
  return <EmptyPage title="택배 출고" />;
}

function StoreOutboundPage() {
  // 현재 메인 플로우(엑셀 업로드/작지/스캔)
  return <JobsExcelWorkbench pageKey="storeShip" pageTitle="매장 출고" defaultStoreCode="" />;
}
