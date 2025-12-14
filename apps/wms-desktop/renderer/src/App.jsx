import React, { useEffect, useMemo, useState } from "react";

export default function App() {
  const [screen, setScreen] = useState("inbound"); // dashboard | inbound | outbound | logs
  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", height: "100vh", fontFamily: "Segoe UI, Roboto, sans-serif" }}>
      <aside style={{ borderRight: "1px solid #e5e7eb", padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>ESKA WMS</div>
        <NavButton active={screen==="dashboard"} onClick={()=>setScreen("dashboard")}>대시보드</NavButton>
        <NavButton active={screen==="inbound"} onClick={()=>setScreen("inbound")}>입고(엑셀 업로드)</NavButton>
        <NavButton active={screen==="outbound"} onClick={()=>setScreen("outbound")}>출고(바코드)</NavButton>
        <NavButton active={screen==="logs"} onClick={()=>setScreen("logs")}>업로드 이력</NavButton>
      </aside>
      <main style={{ padding: 20, overflow: "auto" }}>
        {screen === "dashboard" && <Dashboard />}
        {screen === "inbound" && <InboundPage />}
        {screen === "outbound" && <OutboundPage />}
        {screen === "logs" && <UploadLogsPage />}
      </main>
    </div>
  );
}

function NavButton({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 8, cursor: "pointer",
        borderRadius: 10, border: "1px solid #e5e7eb",
        background: active ? "#f1f5f9" : "#fff", fontWeight: active ? 700 : 500
      }}
    >
      {children}
    </button>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, alignItems: "center" }}>
      <label>{label}</label>
      <div>{children}</div>
    </div>
  );
}

/* ---------- 대시보드(임시) ---------- */
function Dashboard() {
  return (
    <div>
      <h1>대시보드</h1>
      <p style={{ color: "#64748b" }}>요약 지표 영역 (향후 구현).</p>
    </div>
  );
}

/* ---------- 입고(엑셀 업로드) ---------- */
function InboundPage() {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [csvInfo, setCsvInfo] = useState("");
  const [pendingCSV, setPendingCSV] = useState(null);
  const [pendingName, setPendingName] = useState("");

  async function refresh() {
    const res = await window.api.getProducts();
    if (res.ok) setRows(res.rows);
  }
  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter(r =>
      (r.sku || "").toLowerCase().includes(q) ||
      (r.name || "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  async function onCSVSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setPendingCSV(text);
    setPendingName(file.name);
    setCsvInfo(`선택됨: ${file.name}`);
    e.target.value = "";
  }

  async function onCSVConfirm() {
    if (!pendingCSV) return;
    const ok = confirm(`엑셀 파일을 등록하시겠습니까?\n\n파일명: ${pendingName}`);
    if (!ok) return;
    const res = await window.api.importCSV(pendingCSV, pendingName);
    if (!res.ok) return alert(res.error || "CSV 처리 실패");
    setRows(res.rows);
    setCsvInfo(`처리 ${res.processed}행 / 변경 ${res.changed}건`);
    setPendingCSV(null);
    setPendingName("");
  }

  async function onDelete(id) {
    if (!confirm("정말 삭제할까요?")) return;
    const res = await window.api.deleteProduct(id);
    if (!res.ok) return alert(res.error || "삭제 실패");
    setRows(res.rows);
  }

  return (
    <div>
      <h1>입고(엑셀 업로드)</h1>
      <p style={{ color: "#64748b" }}>
        CSV 업로드 시 동일 Code는 <b>수량 누적(+)</b>됩니다. 형식:
        <code> Warehouse,Code,MakerCode,CodeName,Location,Quantity,Msrp</code>
      </p>

      <section style={{ margin: "12px 0" }}>
        <input
          placeholder="Code / CodeName 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ padding: 8, width: 320, border: "1px solid #d1d5db", borderRadius: 8 }}
        />
        <span style={{ marginLeft: 8, color: "#64748b", fontSize: 12 }}>
          총 {rows.length}개 / 필터 {filtered.length}개
        </span>
      </section>

      <section style={{ margin: "8px 0 20px" }}>
        <h3>📥 엑셀(CSV) 업로드</h3>
        <input type="file" accept=".csv,text/csv" onChange={onCSVSelected} />
        {csvInfo && (
          <div style={{ marginTop: 8 }}>
            <div style={{ color: "#0f766e", marginBottom: 6 }}>{csvInfo}</div>
            {pendingCSV && <button onClick={onCSVConfirm}>등록 실행</button>}
          </div>
        )}
      </section>

      <section>
        <h3>📦 재고 목록</h3>
        <table border="1" cellPadding="6" style={{ borderCollapse: "collapse", minWidth: 960 }}>
          <thead>
            <tr>
              <th style={{ width: 60 }}>No.</th>
              <th>Warehouse</th>
              <th>Code</th>
              <th>MakerCode</th>
              <th>CodeName</th>
              <th>Location</th>
              <th>Quantity</th>
              <th>Msrp</th>
              <th style={{ width: 90 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.id}>
                <td>{i + 1}</td>
                <td>{r.warehouse || "-"}</td>
                <td>{r.sku}</td>
                <td>{r.maker_code || "-"}</td>
                <td>{r.name}</td>
                <td>{r.location || "-"}</td>
                <td>{r.quantity}</td>
                <td>{(r.price ?? 0).toLocaleString()}</td>
                <td><button onClick={() => onDelete(r.id)}>삭제</button></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ color: "#64748b" }}>검색 결과가 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/* ---------- 출고(바코드) - 틀 ---------- */
function OutboundPage() {
  const [scan, setScan] = useState("");
  const [log, setLog] = useState([]);

  function onScanSubmit(e) {
    e.preventDefault();
    if (!scan.trim()) return;
    setLog((p) => [{ time: new Date().toLocaleTimeString(), code: scan.trim() }, ...p]);
    setScan("");
  }

  return (
    <div>
      <h1>출고(바코드)</h1>
      <p style={{ color: "#64748b" }}>바코드 스캐너(HID) 입력 창입니다. Enter로 전송.</p>

      <form onSubmit={onScanSubmit} style={{ margin: "12px 0" }}>
        <Row label="바코드 / Code">
          <input
            autoFocus
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            placeholder="스캐너로 스캔 또는 직접 입력 후 Enter"
            style={{ padding: 8 }}
          />
        </Row>
        <div style={{ marginTop: 8 }}>
          <button type="submit">등록</button>
        </div>
      </form>

      <section>
        <h3>최근 스캔 로그</h3>
        <table border="1" cellPadding="6" style={{ borderCollapse: "collapse", minWidth: 480 }}>
          <thead><tr><th style={{ width: 120 }}>시간</th><th>Code</th></tr></thead>
          <tbody>
            {log.map((r, i) => <tr key={i}><td>{r.time}</td><td>{r.code}</td></tr>)}
            {log.length === 0 && <tr><td colSpan={2} style={{ color:"#64748b" }}>아직 없음</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/* ---------- 업로드 이력 ---------- */
function UploadLogsPage() {
  const [logs, setLogs] = useState([]);

  async function load() {
    const res = await window.api.getUploadLogs();
    if (res.ok) setLogs(res.rows);
  }
  useEffect(() => { load(); }, []);

  return (
    <div>
      <h1>업로드 이력</h1>
      <button onClick={load} style={{ marginBottom: 12 }}>새로고침</button>
      <table border="1" cellPadding="6" style={{ borderCollapse: "collapse", minWidth: 720 }}>
        <thead>
          <tr>
            <th style={{ width: 60 }}>No.</th>
            <th>파일명</th>
            <th>처리행</th>
            <th>반영건</th>
            <th style={{ width: 180 }}>업로드 시각</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((r, i) => (
            <tr key={r.id}>
              <td>{i + 1}</td>
              <td>{r.filename || "-"}</td>
              <td>{r.processed}</td>
              <td>{r.changed}</td>
              <td>{r.created_at}</td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr><td colSpan={5} style={{ color:"#64748b" }}>이력이 없습니다</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
