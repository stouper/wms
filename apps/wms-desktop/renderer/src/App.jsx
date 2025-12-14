// renderer/src/App.jsx
import React, { useEffect, useMemo, useState } from "react";

/** =========================
 * 좌측 메뉴 구성 (사용자 지정)
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
 * 화면 컴포넌트 레지스트리
 * ========================= */
const COMPONENTS = {
  DashboardPage,
  InventoryPage,
  WarehouseInboundPage,
  WarehouseOutboundPage,
  StoreOutboundPage,
  DeliveryOutboundPage,
};

export default function App() {
  const [activeKey, setActiveKey] = useState(MENUS[0].key);

  const ActiveComp = useMemo(() => {
    const found = MENUS.find((m) => m.key === activeKey) || MENUS[0];
    const Comp = COMPONENTS[found.component] || FallbackPage;
    return () => <Comp {...(found.props || {})} />;
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

      <style>{`@keyframes flash{from{background:#e6f2ff}to{background:transparent}}`}</style>
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

/* =========================
 * 1) 데쉬보드 (요약 위젯 자리)
 * ========================= */
function DashboardPage() {
  return (
    <div>
      <h1>데쉬보드</h1>
      <p style={{ color: "#64748b" }}>
        오늘의 작업 요약, 재고 변동, 업로드 이력, 진행중인 출고 등 주요 위젯을 배치할 수 있어.
      </p>
    </div>
  );
}

/* =========================
 * 2) 창고 재고 — ESKA 전체 물량
 * ========================= */
function InventoryPage() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");

  async function load() {
    const r = await window.api?.getProducts?.();
    if (r?.ok) setRows(r.rows || []);
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (v) =>
        (v.sku || "").toLowerCase().includes(s) ||
        (v.name || "").toLowerCase().includes(s) ||
        (v.location || "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  return (
    <div>
      <h1>창고 재고</h1>
      <div style={{ margin: "8px 0 16px" }}>
        <input
          placeholder="SKU/상품명/로케이션 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ padding: 8, width: 320, border: "1px solid #d1d5db", borderRadius: 8 }}
        />
        <span style={{ marginLeft: 8, color: "#64748b", fontSize: 12 }}>
          총 {rows.length} / 결과 {filtered.length}
        </span>
      </div>

      <table border="1" cellPadding="6" style={{ borderCollapse: "collapse", minWidth: 960 }}>
        <thead>
          <tr>
            <th style={{ width: 60 }}>No.</th>
            <th>Warehouse</th>
            <th>SKU</th>
            <th>Maker</th>
            <th>상품명</th>
            <th>로케이션</th>
            <th>수량</th>
            <th>MSRP</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r, i) => (
            <tr key={r.id ?? `${r.sku}-${i}`}>
              <td>{i + 1}</td>
              <td>{r.warehouse || "-"}</td>
              <td>{r.sku}</td>
              <td>{r.maker_code || "-"}</td>
              <td>{r.name}</td>
              <td>{r.location || "-"}</td>
              <td>{r.quantity ?? 0}</td>
              <td>{(r.price ?? 0).toLocaleString()}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={8} style={{ color: "#64748b" }}>
                검색 결과가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* =========================
 * 3) 창고 입고 — CSV 업로드로 수량 반영(+)
 * ========================= */
function WarehouseInboundPage() {
  const [info, setInfo] = useState("");
  const [rows, setRows] = useState([]);

  async function refresh() {
    const r = await window.api?.getProducts?.();
    if (r?.ok) setRows(r.rows || []);
  }
  useEffect(() => {
    refresh();
  }, []);

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const csv = await file.text();
    if (!confirm(`${file.name} 파일을 업로드할까요?`)) {
      e.target.value = "";
      return;
    }
    const r = await window.api?.importCSV?.(csv, file.name);
    if (!r?.ok) {
      alert(r?.error || "업로드 실패");
      e.target.value = "";
      return;
    }
    setInfo(`처리 ${r.processed} / 반영 ${r.changed}`);
    setRows(r.rows || []);
    e.target.value = "";
  }

  return (
    <div>
      <h1>창고 입고</h1>
      <p style={{ color: "#64748b" }}>
        입고 물량을 CSV로 반영합니다. 형식: <code>Warehouse,Code,MakerCode,CodeName,Location,Quantity,Msrp</code>
      </p>
      <input type="file" accept=".csv,text/csv" onChange={onFile} />
      {info && <div style={{ marginTop: 8, color: "#0f766e" }}>{info}</div>}
      <div style={{ marginTop: 16 }}>
        <button onClick={refresh}>재고 새로고침</button>
      </div>
    </div>
  );
}

/* =========================
 * 4) 창고 출고 — (설계/후속연동 자리)
 *    매장 반품 등 창고에서 다른 경로로 내보내는 흐름
 * ========================= */
function WarehouseOutboundPage() {
  return (
    <div>
      <h1>창고 출고</h1>
      <p style={{ color: "#64748b" }}>
        매장 반품/이동 등 창고 내·외부 출고 시나리오를 후속으로 연결합니다.
      </p>
    </div>
  );
}

/* =========================
 * 5) 매장 출고 — (설계/후속연동 자리)
 *    매장 발주/매장 간 이동 등
 * ========================= */
function StoreOutboundPage() {
  return (
    <div>
      <h1>매장 출고</h1>
      <p style={{ color: "#64748b" }}>
        매장 발주/매장 간 이동 등 매장 관련 출고를 후속으로 붙입니다.
      </p>
    </div>
  );
}

/* =========================
 * 6) 택배 출고 — 작업지 생성 + 스캔 + 결과엑셀(M) 내보내기
 * ========================= */
function DeliveryOutboundPage() {
  const [jobs, setJobs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("READY");
  const [scanBuf, setScanBuf] = useState("");
  const [lastHitId, setLastHitId] = useState(null);

  async function loadJobs() {
    const r = await window.wms?.listJobs?.();
    if (r?.ok) setJobs(r.rows || []);
  }
  async function selectJob(id) {
    const r = await window.wms?.getJob?.(id);
    if (r?.ok !== false) {
      setSelected(r?.job || null);
      setItems(r?.items || []);
    }
  }
  async function resync() {
    if (!selected) return;
    await selectJob(selected.id);
  }

  useEffect(() => {
    loadJobs();
  }, []);

  // 주문 엑셀 업로드 → 작업지 생성
  async function onUploadExcel(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const startRow = 4;
    const keyField = "ANY"; // 'H' | 'I' | 'K' | 'ANY'
    const res = await window.wms?.importJobExcel?.(buf, file.name, startRow, keyField);
    if (!res?.ok) {
      alert(res?.error || "작업지 생성 실패");
      e.target.value = "";
      return;
    }
    await loadJobs();
    await selectJob(res.jobId);
    e.target.value = "";
  }

  // 바코드 스캐너(HID) 입력: Enter로 종료
  useEffect(() => {
    function onKey(e) {
      if (!selected || selected.status === "DONE") return;
      if (e.key === "Enter") {
        const code = scanBuf.trim();
        setScanBuf("");
        if (code) handleScan(code);
      } else if (e.key.length === 1) {
        setScanBuf((prev) => prev + e.key);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scanBuf, selected, items]);

  async function handleScan(code) {
    setStatus(`스캔 처리: ${code}`);
    const r = await window.wms?.scanCode?.({ jobId: selected.id, code });
    if (!r?.ok) {
      setStatus(
        r?.reason === "NO_MATCH"
          ? "매칭되는 항목이 없습니다(H/I/K 중 아무거나)."
          : r?.reason === "ENOUGH"
          ? "✅ 필요한 수량 모두 완료"
          : "스캔 실패"
      );
      return;
    }
    const next = await window.wms?.getJob?.(selected.id);
    const nextItems = next?.items || [];
    const hit = nextItems.find(
      (x) => (x.picked_qty || 0) > ((items.find((y) => y.id === x.id)?.picked_qty) ?? -1)
    );
    setSelected(next?.job || null);
    setItems(nextItems);
    if (hit) {
      setLastHitId(hit.id);
      setTimeout(() => setLastHitId(null), 600);
    }
    setStatus(r.done ? "🎉 작업 완료!" : "✅ 스캔 반영됨");
  }

  const progress = useMemo(() => {
    const req = items.reduce((a, c) => a + (c.required_qty || 0), 0);
    const got = items.reduce((a, c) => a + (c.picked_qty || 0), 0);
    return { req, got };
  }, [items]);

  return (
    <div>
      <h1>택배 출고</h1>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <span>주문 엑셀 업로드(.xlsx/.xls):</span>
        <input type="file" accept=".xlsx,.xls" onChange={onUploadExcel} />
        <button disabled={!selected} onClick={() => window.wms?.exportJobExcel?.(selected.id)}>
          피킹결과 엑셀(M) 내보내기
        </button>
        <button disabled={!selected} onClick={resync}>
          상세 새로고침
        </button>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16 }}>
        <div>
          <h3>작업지 목록</h3>
          <table border="1" cellPadding="6" style={{ borderCollapse: "collapse", minWidth: 360 }}>
            <thead>
              <tr>
                <th style={{ width: 60 }}>ID</th>
                <th>주문(외부ID)</th>
                <th style={{ width: 90 }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr
                  key={j.id}
                  onClick={() => selectJob(j.id)}
                  style={{
                    cursor: "pointer",
                    background: selected?.id === j.id ? "#f5f7ff" : "transparent",
                  }}
                >
                  <td>{j.id}</td>
                  <td>{j.order_no}</td>
                  <td>{j.status}</td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ color: "#64748b" }}>
                    작업지가 없습니다. 주문 엑셀을 업로드하세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <h3>작업 상세 {selected ? `#${selected.id}` : ""}</h3>
          <p style={{ margin: "6px 0 12px 0", opacity: 0.8 }}>
            진행: {progress.got} / {progress.req} {selected?.status === "DONE" && "✅"}
          </p>

          <table border="1" cellPadding="6" style={{ borderCollapse: "collapse", minWidth: 840 }}>
            <thead>
              <tr>
                <th>H</th>
                <th>I</th>
                <th>K</th>
                <th style={{ width: 80 }}>요청(K)</th>
                <th style={{ width: 80 }}>피킹(M)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const done = (it.picked_qty || 0) >= (it.required_qty || 0);
                const bg = done ? "#f1fff1" : it.picked_qty > 0 ? "#fffbee" : "transparent";
                const hi = lastHitId === it.id ? { animation: "flash 600ms ease" } : {};
                return (
                  <tr key={it.id} style={{ background: bg, ...hi }}>
                    <td>{it.col_h || ""}</td>
                    <td>{it.col_i || ""}</td>
                    <td>{it.col_k || ""}</td>
                    <td>{it.required_qty ?? 0}</td>
                    <td>{it.pickedQty ?? it.picked_qty ?? 0}</td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ color: "#64748b" }}>
                    항목이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div style={{ marginTop: 12, opacity: 0.8 }}>상태: {status}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
            참고: H/I/K 아무 값으로 스캔해도 매칭되도록 구현(Enter로 종료).
          </div>
        </div>
      </section>
    </div>
  );
}

function FallbackPage() {
  return <div>컴포넌트를 찾을 수 없습니다.</div>;
}
