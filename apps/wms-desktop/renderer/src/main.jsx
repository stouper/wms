// apps/wms-desktop/renderer/src/main.jsx
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

function assertPreload() { if (!window?.wms) throw new Error('preload 연결 안됨'); }

function Sidebar({ current, onChange }) {
  const items = [
    { key: 'dashboard',          label: '대시보드' },
    { key: 'storeOutbound',      label: '매장 출고' },
    { key: 'parcelOutbound',     label: '택배 출고' },
    { key: 'inventoryUpload',    label: '재고 업로드(엑셀)' },
    { key: 'warehouseInventory', label: '창고 재고' },        // 👈 신설
    { key: 'etc',                label: '기타' },
  ];
  return (
    <div className="sidebar">
      <div className="brand">WMS Desktop</div>
      <div className="nav">
        {items.map(it => (
          <button key={it.key} className={current === it.key ? 'active' : ''} onClick={() => onChange(it.key)}>
            {it.label}
          </button>
        ))}
      </div>
      <div style={{ marginTop:'auto', fontSize:12, opacity:.75 }}>v0.1</div>
    </div>
  );
}

function Summary({ summary }) {
  if (!summary) return null;
  const { rows, totalQty, totalAmount, sheetName, headerRow, savedAt } = summary;
  return (
    <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:12 }}>
      <span><b>시트</b>: {sheetName}</span>
      <span><b>헤더행</b>: {headerRow}</span>
      <span><b>행수</b>: {rows?.toLocaleString?.() ?? rows}</span>
      <span><b>총 수량</b>: {totalQty?.toLocaleString?.() ?? totalQty}</span>
      <span><b>총 금액</b>: {totalAmount?.toLocaleString?.() ?? totalAmount}</span>
      {savedAt && <span><b>저장</b>: {new Date(savedAt).toLocaleString()}</span>}
    </div>
  );
}
function Table({ columns, rows }) {
  if (!rows?.length) return <div className="muted">표시할 데이터가 없습니다.</div>;
  return (
    <div style={{ overflow:'auto', border:'1px solid #e5e7eb', borderRadius:10 }}>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead style={{ background:'#f8fafc' }}>
          <tr>{columns.map(c => <th key={c} style={{ padding:'8px 10px', borderBottom:'1px solid #e5e7eb', textAlign:'left' }}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map(c => <td key={c} style={{ padding:'8px 10px', borderBottom:'1px solid #f1f5f9' }}>{r[c] ?? ''}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ padding:8, fontSize:12, color:'#6b7280' }}>미리보기는 업로드 탭 200행 제한, 창고 재고 탭은 전체 저장본 표시</div>
    </div>
  );
}

/* ------------------------------
   탭: 재고 업로드(엑셀)
   - 업로드 → 파싱 → 저장까지 수행
------------------------------ */
function ViewInventoryUpload() {
  const [filePath, setFilePath] = useState('');
  const [res, setRes] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => { try { assertPreload(); } catch(e) { setMsg(e.message); } }, []);

  const onPick = async () => { const fp = await window.wms.pickExcel(); if (fp) setFilePath(fp); };
  const onUpload = async () => {
    if (!filePath) return alert('파일을 선택해주세요.');
    setMsg('업로드/파싱 중…');
    const parsed = await window.wms.importInventoryExcel(filePath);
    setRes(parsed);
    setMsg('파싱 완료. 저장 중…');
    await window.wms.saveWarehouseInventory(parsed);   // 👈 디스크에 저장
    setMsg('저장 완료. "창고 재고" 탭에서 확인하세요.');
  };

  return (
    <div className="card">
      <h1>재고 업로드 (엑셀)</h1>
      <p className="muted">본사 창고 재고 포맷을 자동 인식하여 파싱 & 저장합니다.</p>

      <div className="row">
        <input value={filePath} onChange={e => setFilePath(e.target.value)} placeholder="C:\path\to\inventory.xlsx" />
      </div>
      <div className="row">
        <button onClick={onPick}>파일 선택</button>
        <button onClick={onUpload}>업로드 & 저장</button>
      </div>

      {msg && <div style={{ marginTop:12 }}>{msg}</div>}
      {res?.ok && (<><Summary summary={res.summary} /><Table columns={res.columns} rows={res.rows} /></>)}
    </div>
  );
}

/* ------------------------------
   탭: 창고 재고 (저장본 열람)
------------------------------ */
function ViewWarehouseInventory() {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('로딩 중…');

  const load = async () => {
    setMsg('로딩 중…');
    const r = await window.wms.loadWarehouseInventory();
    if (r?.exists && r.data) { setData(r.data); setMsg(''); }
    else { setData(null); setMsg('저장된 창고 재고가 없습니다.'); }
  };
  useEffect(() => { load(); }, []);

  const onClear = async () => {
    await window.wms.clearWarehouseInventory();
    await load();
  };

  return (
    <div className="card">
      <h1>창고 재고</h1>
      <p className="muted">마지막 업로드/저장된 창고 재고 스냅샷을 보여줍니다.</p>
      <div className="row">
        <button onClick={load}>새로고침</button>
        <button onClick={onClear}>초기화</button>
      </div>

      {msg && <div style={{ marginTop:12 }}>{msg}</div>}
      {data?.summary && (<><Summary summary={data.summary} /><Table columns={data.columns || []} rows={data.rows || []} /></>)}
    </div>
  );
}

/* ------------------------------
   그 외 탭(임시)
------------------------------ */
function ViewDashboard()      { return <div className="card"><h1>대시보드</h1><p className="muted">KPI 등 (TODO)</p></div>; }
function ViewStoreOutbound()  { return <div className="card"><h1>매장 출고</h1><p className="muted">작지/스캔/피킹 (TODO)</p></div>; }
function ViewParcelOutbound() { return <div className="card"><h1>택배 출고</h1><p className="muted">라벨/히스토리 (TODO)</p></div>; }
function ViewEtc()            { return <div className="card"><h1>기타</h1><p className="muted">도구/설정/백업 (TODO)</p></div>; }

/* ------------------------------
   앱 루트
------------------------------ */
function App() {
  const [tab, setTab] = useState('warehouseInventory'); // 기본을 창고 재고로
  const render = () => {
    switch (tab) {
      case 'dashboard':          return <ViewDashboard />;
      case 'storeOutbound':      return <ViewStoreOutbound />;
      case 'parcelOutbound':     return <ViewParcelOutbound />;
      case 'inventoryUpload':    return <ViewInventoryUpload />;
      case 'warehouseInventory': return <ViewWarehouseInventory />; // 👈 신설
      case 'etc':                return <ViewEtc />;
      default:                   return <ViewDashboard />;
    }
  };
  return (<><Sidebar current={tab} onChange={setTab} /><div className="content">{render()}</div></>);
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
