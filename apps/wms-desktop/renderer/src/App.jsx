import React, { useEffect, useMemo, useState } from "react";

/** =========================
 * 좌측 메뉴
 * ========================= */
const MENUS = [
  { key: "dashboard",  label: "데쉬보드",   component: "DashboardPage" },
  { key: "inventory",  label: "창고 재고",  component: "InventoryPage" },
  { key: "whInbound",  label: "창고 입고",  component: "WarehouseInboundPage" },
  { key: "whOutbound", label: "창고 출고",  component: "WarehouseOutboundPage" },
  { key: "storeShip",  label: "매장 출고",  component: "StoreOutboundPage" },
  { key: "delivery",   label: "택배 출고",  component: "DeliveryOutboundPage" },
];

/** =========================
 * 루트 App
 * ========================= */
export default function App() {
  const [activeKey, setActiveKey] = useState(MENUS[0].key);

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
    const Comp = map[found.component] || FallbackPage;
    return () => <Comp />;
  }, [activeKey]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", height: "100vh", fontFamily: "Segoe UI, Roboto, sans-serif" }}>
      <aside style={{ borderRight: "1px solid #e5e7eb", padding: 12, background: "#fbfbfb" }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>ESKA WMS Desktop</div>
        <nav>
          {MENUS.map((m) => (
            <NavButton key={m.key} active={activeKey === m.key} onClick={() => setActiveKey(m.key)}>
              {m.label}
            </NavButton>
          ))}
        </nav>
      </aside>

      <main style={{ padding: 20, overflow: "auto" }}>
        <ActiveComp />
      </main>
    </div>
  );
}

function NavButton({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "10px 12px",
        marginBottom: 8,
        cursor: "pointer",
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        background: active ? "#eef2ff" : "#fff",
        fontWeight: active ? 700 : 500,
      }}
    >
      {children}
    </button>
  );
}

function FallbackPage() {
  return <div>컴포넌트를 찾을 수 없습니다.</div>;
}

/* =========================
 * 1) 데쉬보드
 * ========================= */
function DashboardPage() {
  return (
    <div>
      <h1>데쉬보드</h1>
      <p style={{ color: "#64748b" }}>재고/입출고/작업지 요약 위젯 자리.</p>
    </div>
  );
}

/* =========================
 * 2) 창고 재고 (엑셀 업로드 포함)
 * ========================= */
function InventoryPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [startRow, setStartRow] = useState(3);   // 헤더(컬럼명) 행 번호. 3이면 4행부터 데이터.
  const [mode, setMode] = useState("SET");       // SET | ADD

  async function load() {
    setLoading(true);
    try {
      const r = await window.api.getProducts();
      if (r?.ok) setRows(r.rows || []);
      else setRows([]);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function onUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window?.wms?.importInventoryExcel) {
      alert("preload 연결 오류: window.wms.importInventoryExcel 이 없습니다.");
      e.target.value = "";
      return;
    }

    const ok = confirm(
      mode === "SET"
        ? "⚠️ 기존 재고를 엑셀 값으로 설정합니다(정합화). 진행할까요?"
        : "엑셀 수량만큼 재고를 증감합니다. 진행할까요?"
    );
    if (!ok) {
      e.target.value = "";
      return;
    }

    setStatus("업로드 중…");
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const res = await window.wms.importInventoryExcel(
        buf,
        file.name,
        Number.isFinite(Number(startRow)) ? Number(startRow) : undefined, // undefined면 헤더 자동탐지
        mode
      );
      if (!res?.ok) {
        alert("업로드 실패: " + (res?.error || "unknown"));
        setStatus("실패: " + (res?.error || "unknown"));
      } else {
        setStatus(`완료: 처리 ${res.processed} / 반영 ${res.changed}`);
        await load();
      }
    } catch (err) {
      console.error(err);
      alert("업로드 중 예외: " + (err?.message || String(err)));
      setStatus("오류 발생");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }

  return (
    <div>
      <h1>창고 재고</h1>

      <div style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label>
          <strong>헤더(컬럼명) 행:</strong>
          <input
            type="number"
            min={1}
            value={startRow}
            onChange={(e) => setStartRow(e.target.value)}
            style={{ width: 72, marginLeft: 8 }}
            title="엑셀에서 컬럼명이 적힌 행 번호. 3이면 4행부터 데이터."
          />
        </label>

        <label>
          <strong>모드:</strong>
          <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ marginLeft: 8 }}>
            <option value="SET">SET (엑셀 수량으로 설정)</option>
            <option value="ADD">ADD (엑셀 수량만큼 증감)</option>
          </select>
        </label>

        <label>
          <strong>재고 엑셀 업로드</strong>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={onUpload} style={{ marginLeft: 8 }} />
        </label>

        <button onClick={load} disabled={loading}>새로고침</button>
        <span style={{ color: "#666" }}>{status}</span>
      </div>

      <table border="1" cellPadding="6" style={{ borderCollapse: "collapse", minWidth: 900 }}>
        <thead>
          <tr>
            <th>창고</th>
            <th>SKU</th>
            <th>메이커코드</th>
            <th>상품명</th>
            <th>로케이션</th>
            <th>수량</th>
            <th>MSRP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.warehouse}</td>
              <td>{r.sku}</td>
              <td>{r.maker_code}</td>
              <td>{r.name}</td>
              <td>{r.location}</td>
              <td>{r.quantity}</td>
              <td>{typeof r.price === "number" ? r.price.toLocaleString() : r.price}</td>
            </tr>
          ))}
          {rows.length === 0 && !loading && (
            <tr>
              <td colSpan={7} style={{ textAlign: "center", color: "#888" }}>
                재고 데이터가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* =========================
 * 3) 창고 입고
 * ========================= */
function WarehouseInboundPage() {
  return (
    <div>
      <h1>창고 입고</h1>
      <p style={{ color: "#64748b" }}>엑셀 템플릿 확정 후 연결 예정.</p>
    </div>
  );
}

/* =========================
 * 4) 창고 출고
 * ========================= */
function WarehouseOutboundPage() {
  return (
    <div>
      <h1>창고 출고</h1>
      <p style={{ color: "#64748b" }}>엑셀 템플릿 확정 후 연결 예정.</p>
    </div>
  );
}

/* =========================
 * 5) 매장 출고
 * ========================= */
function StoreOutboundPage() {
  return (
    <div>
      <h1>매장 출고</h1>
      <p style={{ color: "#64748b" }}>작지/스캔과 재고 차감 연동 완료 상태로 확장 예정.</p>
    </div>
  );
}

/* =========================
 * 6) 택배 출고
 * ========================= */
function DeliveryOutboundPage() {
  return (
    <div>
      <h1>택배 출고</h1>
      <p style={{ color: "#64748b" }}>작지 업로드(H/I/J/K) + 스캔 매칭(DONE 시 차감) 로직 사용.</p>
    </div>
  );
}
