import React, { useEffect, useMemo, useRef, useState, useLayoutEffect, useDeferredValue } from "react";

const layoutStyle = {
  height: "100%",
  display: "grid",
  gridTemplateColumns: "220px 1fr",
  overflow: "hidden",
  fontFamily: "Segoe UI, Roboto, sans-serif",
};

const MENUS = [
  { key: "dashboard",  label: "데쉬보드",   component: "DashboardPage" },
  { key: "inventory",  label: "창고 재고",  component: "InventoryPage" },
  { key: "whInbound",  label: "창고 입고",  component: "WarehouseInboundPage" },
  { key: "whOutbound", label: "창고 출고",  component: "WarehouseOutboundPage" },
  { key: "storeShip",  label: "매장 출고",  component: "StoreOutboundPage" },
  { key: "delivery",   label: "택배 출고",  component: "DeliveryOutboundPage" },
];

export default function App() {
  const [activeKey, setActiveKey] = useState("inventory");
  const ActiveComp = useMemo(() => {
    const found = MENUS.find((m) => m.key === activeKey) || MENUS[0];
    const map = { DashboardPage, InventoryPage, WarehouseInboundPage, WarehouseOutboundPage, StoreOutboundPage, DeliveryOutboundPage };
    const Comp = map[found.component] || FallbackPage;
    return () => <Comp />;
  }, [activeKey]);

  return (
    <div style={layoutStyle}>
      <aside style={{ borderRight: "1px solid #e5e7eb", padding: 12, background: "#fbfbfb", overflowY: "auto" }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>ESKA WMS Desktop</div>
        <nav>
          {MENUS.map((m) => (
            <button
              key={m.key}
              onClick={() => setActiveKey(m.key)}
              style={{
                width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 8, cursor: "pointer",
                borderRadius: 10, border: "1px solid #e5e7eb", background: activeKey === m.key ? "#eef2ff" : "#fff",
                fontWeight: activeKey === m.key ? 700 : 500,
              }}
            >
              {m.label}
            </button>
          ))}
        </nav>
      </aside>
      <main style={{ padding: 20, overflow: "auto", minWidth: 0 }}>
        <ActiveComp />
      </main>
    </div>
  );
}
function FallbackPage(){ return <div>컴포넌트를 찾을 수 없습니다.</div>; }
function DashboardPage(){ return <div><h1>데쉬보드</h1><p style={{color:"#64748b"}}>요약 위젯 자리</p></div>; }

/* ---------------- 가상 스크롤 테이블 ---------------- */
function VirtualTable({ rows, rowHeight = 36, columns }) {
  const wrapRef = useRef(null);
  const [height, setHeight] = useState(400);
  const [scrollTop, setScrollTop] = useState(0);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const resize = () => {
      const h = Math.max(240, el.parentElement?.clientHeight - el.offsetTop - 40 || 400);
      setHeight(h);
    };
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(document.body);
    return () => obs.disconnect();
  }, []);

  const onScroll = (e) => setScrollTop(e.currentTarget.scrollTop);

  const total = rows.length;
  const totalHeight = total * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 10);
  const endIndex = Math.min(total - 1, startIndex + Math.ceil(height / rowHeight) + 20);
  const items = rows.slice(startIndex, endIndex + 1);
  const offsetY = startIndex * rowHeight;

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
        <thead style={{ background: "#f8fafc" }}>
          <tr>{columns.map((c) => <Th key={c.key}>{c.title}</Th>)}</tr>
        </thead>
      </table>
      <div ref={wrapRef} onScroll={onScroll} style={{ height, overflow: "auto", position: "relative" }}>
        <div style={{ height: totalHeight, position: "relative" }}>
          <table style={{ borderCollapse:"collapse", width:"100%", minWidth:900, position:"absolute", top:0, left:0, transform:`translateY(${offsetY}px)` }}>
            <tbody>
              {items.map((r, i) => (
                <tr key={startIndex + i} style={{ height: rowHeight }}>
                  {columns.map((c) => <Td key={c.key} style={c.tdStyle?.(r)}>{c.render ? c.render(r) : r[c.dataIndex]}</Td>)}
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={columns.length} style={{ textAlign:'center', color:'#94a3b8', padding:20 }}>표시할 데이터가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
const Th = ({ children }) => <th style={{ padding:'8px 10px', textAlign:'left', borderBottom:'1px solid #e5e7eb' }}>{children}</th>;
const Td = ({ children, style }) => <td style={{ padding:'8px 10px', borderBottom:'1px solid #f1f5f9', ...style }}>{children}</td>;

/* ---------------- 창고 재고 ---------------- */
function InventoryPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [headerRow, setHeaderRow] = useState(3);

  const [latest, setLatest] = useState(null);
  const [latestExpanded, setLatestExpanded] = useState(false);

  const [q, setQ] = useState("");
  const [sort, setSort] = useState("qtyDesc");
  const [filter, setFilter] = useState("all");
  const qDeferred = useDeferredValue(q);

  const fileInputRef = useRef(null);
  const searchRef = useRef(null);

  // ✅ 포커스 강제 루틴
  const focusSearch = () => searchRef.current?.focus({ preventScroll: true });

  useEffect(() => {
    // 초진입
    const t = setTimeout(focusSearch, 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    // Alt+Tab 복귀(메인에서 신호 받음)
    const handler = () => setTimeout(focusSearch, 0);
    window.electron?.ipcRenderer?.on?.('wms:focus-restore', handler);
    // visibilitychange (파일 대화상자/윈도우 복귀 포함)
    const vis = () => { if (!document.hidden) setTimeout(focusSearch, 0); };
    document.addEventListener('visibilitychange', vis, true);

    // 바디 타이핑 → 검색창 리디렉트
    const redirect = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      const editable = (e.target?.isContentEditable) || tag === 'input' || tag === 'textarea' || tag === 'select';
      if (editable) return;
      if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
        focusSearch();
      }
    };
    window.addEventListener('keydown', redirect, true);

    // 단축키 `/`, Ctrl/Cmd+K
    const hotkey = (e) => {
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || e.key === "/") {
        e.preventDefault();
        focusSearch();
      }
    };
    window.addEventListener("keydown", hotkey, true);

    return () => {
      window.electron?.ipcRenderer?.removeAllListeners?.('wms:focus-restore');
      document.removeEventListener('visibilitychange', vis, true);
      window.removeEventListener('keydown', redirect, true);
      window.removeEventListener('keydown', hotkey, true);
    };
  }, []);

  const warningsNow = useMemo(() => {
    let negatives = 0, zeros = 0;
    for (const r of rows) { if (Number(r.quantity) < 0) negatives++; if (Number(r.quantity) === 0) zeros++; }
    return { negatives, zeros };
  }, [rows]);

  const viewRows = useMemo(() => {
    let r = rows;
    const qq = qDeferred.trim().toLowerCase();
    if (qq) {
      r = r.filter(x =>
        String(x.sku||'').toLowerCase().includes(qq) ||
        String(x.name||'').toLowerCase().includes(qq) ||
        String(x.maker_code||'').toLowerCase().includes(qq) ||
        String(x.location||'').toLowerCase().includes(qq)
      );
    }
    if (filter === "negative") r = r.filter(x => Number(x.quantity) < 0);
    else if (filter === "zero") r = r.filter(x => Number(x.quantity) === 0);
    const byStr = (a,b,k)=>String(a[k]||'').localeCompare(String(b[k]||''),'ko');
    const byNum = (a,b,k)=>Number(a[k]||0)-Number(b[k]||0);
    if (sort === "qtyDesc") r = [...r].sort((a,b)=>byNum(b,a,'quantity'));
    else if (sort === "qtyAsc") r = [...r].sort((a,b)=>byNum(a,b,'quantity'));
    else if (sort === "sku") r = [...r].sort((a,b)=>byStr(a,b,'sku'));
    else if (sort === "name") r = [...r].sort((a,b)=>byStr(a,b,'name'));
    return r;
  }, [rows, qDeferred, sort, filter]);

  async function loadInventory() {
    setLoading(true);
    try {
      const r = await window.api?.getProducts?.();
      if (r?.ok) setRows(r.rows || []); else setRows([]);
    } finally { setLoading(false); }
  }
  async function loadLatest() {
    const r = await window.wms?.inventory?.listUploads?.();
    const one = (r?.uploads || [])[0];
    setLatest(one || null);
  }
  useEffect(() => { loadInventory(); loadLatest(); }, []);

  async function onFilePicked(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const prev = await window.wms?.inventory?.previewExcel(buf, file.name, Number(headerRow)||3);
      if (!prev?.ok) { alert('미리보기 실패: ' + (prev?.error || 'unknown')); return; }
      const w = prev.warnings || {};
      const warnText = `⚠ 경고 요약\n- 음수 수량: ${w.negatives||0}\n- 0 수량: ${w.zeros||0}\n- SKU 공란: ${w.blankSku||0}\n- 중복 SKU: ${w.dupSku||0}`;
      const msg =
        `파일: ${prev.fileName}\n헤더 행: ${prev.headerRow}\n행수: ${prev.rowsCount.toLocaleString()}\n수량 합계: ${prev.qtySum.toLocaleString()}\n\n${warnText}\n\n` +
        `※ 경고가 있어도 확정은 가능합니다.\n현재 재고는 이 파일 내용으로 '전체 교체' 됩니다.\n계속 진행할까요?`;
      if (!confirm(msg)) { e.target.value=""; return; }

      setStatus("업데이트 중…"); setLoading(true);
      const res = await window.wms?.inventory?.overwriteExcel(buf, file.name, Number(headerRow)||3);
      if (!res?.ok) { alert("적용 실패: " + (res?.error || 'unknown')); setStatus("실패"); }
      else {
        setStatus(`완료: 처리 ${res.processed.toLocaleString()} / 합계 ${res.qtySum.toLocaleString()}`);
        await loadInventory(); await loadLatest();
      }
    } catch (err) {
      console.error(err); alert('업로드 중 오류: ' + (err?.message || String(err))); setStatus('오류');
    } finally {
      setLoading(false); e.target.value = "";
      setTimeout(focusSearch, 0); // 파일 대화상자 닫힘 직후 재포커스
    }
  }

  async function toggleLatestDetail() {
    if (!latest) return;
    if (!latestExpanded) {
      const r = await window.wms?.inventory?.getUpload?.(latest.id);
      if (r?.ok) setLatest(r.upload);
    }
    setLatestExpanded(v=>!v);
  }
  async function restoreFromLatest() {
    if (!latest) return;
    if (!confirm(`이전 업로드(${latest.fileName})로 재고를 복원할까요?\n현재 재고는 모두 교체됩니다.`)) return;
    const r = await window.wms?.inventory?.restoreUpload?.(latest.id);
    if (r?.ok) { alert('복원 완료'); await loadInventory(); setTimeout(focusSearch, 0); }
    else { alert('복원 실패: ' + (r?.error || 'unknown')); }
  }

  return (
    <div>
      <h1>창고 재고</h1>

      {/* 이전 업로드(직전) — Sticky */}
      <div style={{ position:'sticky', top:0, zIndex:3, background:'#fff', paddingTop:6, marginBottom:10 }}>
        <h3 style={{ margin:'6px 0 8px' }}>이전 업로드(직전)</h3>
        <div style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:10, display:'flex', alignItems:'center', gap:12, fontSize:13, boxShadow:'0 1px 0 rgba(0,0,0,0.03)' }}>
          {!latest ? <div style={{ color:'#94a3b8' }}>표시할 이전 업로드가 없습니다.</div> : (
            <>
              <div style={{ lineHeight:1.4 }}>
                <div><b>{latest.fileName}</b></div>
                <div style={{ color:'#64748b' }}>{new Date(latest.at).toLocaleString()} · 행수 {latest.rowsCount} · 합계 {latest.qtySum}</div>
                {latest.warnings && <div style={{ color:'#64748b', marginTop:2 }}>경고: 음수 {latest.warnings.negatives||0} · 0수량 {latest.warnings.zeros||0} · 공란 {latest.warnings.blankSku||0} · 중복 {latest.warnings.dupSku||0}</div>}
              </div>
              <div style={{ flex:1 }} />
              <button onClick={restoreFromLatest} style={{ padding:'6px 10px', border:'1px solid #e5e7eb', borderRadius:8 }}>복원</button>
              <button onClick={toggleLatestDetail} style={{ padding:'6px 10px', border:'1px solid #e5e7eb', borderRadius:8 }}>{latestExpanded ? '접기' : '자세히'}</button>
            </>
          )}
        </div>
        {latestExpanded && latest && latest.sample && (
          <div style={{ marginTop:8, border:'1px solid #e5e7eb', borderRadius:10, overflow:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:800 }}>
              <thead style={{ background:'#f8fafc' }}><tr><Th>창고</Th><Th>SKU</Th><Th>Maker코드</Th><Th>상품명</Th><Th>위치</Th><Th>수량</Th><Th>가격</Th></tr></thead>
              <tbody>
                {latest.sample.slice(0, 10).map((r,i)=>(
                  <tr key={i}>
                    <Td>{r.warehouse}</Td><Td>{r.sku}</Td><Td>{r.maker_code}</Td><Td>{r.name}</Td><Td>{r.location}</Td>
                    <Td style={{ color: Number(r.quantity)<0 ? '#dc2626' : Number(r.quantity)===0 ? '#b45309' : undefined }}>{r.quantity}</Td>
                    <Td>{r.price}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize:12, color:'#94a3b8', padding:'6px 10px' }}>※ 샘플은 최대 10행 표시</div>
          </div>
        )}
      </div>

      {/* 컨트롤바 */}
      <div style={{ display:'grid', gridTemplateColumns:'auto auto 1fr minmax(240px, 360px) auto auto auto', gap:12, alignItems:'center', marginBottom:12 }}>
        <label style={{ whiteSpace:'nowrap' }}>
          <strong>헤더(컬럼명) 행:</strong>
          <input type="number" value={headerRow} onChange={(e)=>setHeaderRow(e.target.value)} style={{ width:72, marginLeft:8 }}/>
        </label>

        {/* 숨김 파일 인풋 + 버튼 */}
        <div style={{ position:'relative' }}>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFilePicked} style={{ position:'absolute', inset:0, opacity:0, pointerEvents:'none' }} tabIndex={-1}/>
          <button type="button" onClick={()=>fileInputRef.current?.click()} style={{ padding:'8px 10px', border:'1px solid #e5e7eb', borderRadius:8, background:'#fff' }}>엑셀 업로드</button>
        </div>

        <div />

        {/* 검색창 */}
        <input
          ref={searchRef}
          type="text"
          value={q}
          onChange={(e)=>setQ(e.target.value)}
          placeholder="SKU/상품명/메이커/위치 검색 (/, Ctrl+K)"
          style={{ padding:'8px 10px', border:'1px solid #e5e7eb', borderRadius:8, minWidth:240, background:'#fff' }}
        />

        <select value={sort} onChange={(e)=>setSort(e.target.value)} style={{ padding:'8px 10px', border:'1px solid #e5e7eb', borderRadius:8, background:'#fff' }}>
          <option value="qtyDesc">수량 ↓</option><option value="qtyAsc">수량 ↑</option><option value="sku">SKU</option><option value="name">상품명</option>
        </select>

        <button onClick={()=>loadInventory()} disabled={loading}>새로고침</button>
        <span style={{ color:'#666' }}>{status}</span>
      </div>

      {/* 경고 칩 */}
      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
        <Chip active={filter==='all'} onClick={()=>setFilter('all')}>모두보기</Chip>
        <Chip active={filter==='negative'} onClick={()=>setFilter('negative')} kind="danger">음수 {warningsNow.negatives}</Chip>
        <Chip active={filter==='zero'} onClick={()=>setFilter('zero')} kind="warn">수량 0 {warningsNow.zeros}</Chip>
      </div>

      {/* 가상 스크롤 테이블 */}
      <VirtualTable
        rows={useMemo(()=>viewRows, [viewRows])}
        rowHeight={36}
        columns={[
          { key:'warehouse', title:'창고', dataIndex:'warehouse' },
          { key:'sku',       title:'SKU', dataIndex:'sku' },
          { key:'maker',     title:'Maker코드', dataIndex:'maker_code' },
          { key:'name',      title:'상품명', dataIndex:'name' },
          { key:'loc',       title:'위치', dataIndex:'location' },
          { key:'qty',       title:'수량', render:(r)=>r.quantity, tdStyle:(r)=>({ color: Number(r.quantity)<0 ? '#dc2626' : Number(r.quantity)===0 ? '#b45309' : undefined }) },
          { key:'price',     title:'MSRP/현재가', render:(r)=> (typeof r.price === 'number' ? r.price.toLocaleString() : r.price) },
        ]}
      />
    </div>
  );
}
function Chip({ children, onClick, active, kind }) {
  const colors = { base:{bg:'#f1f5f9',bd:'#e5e7eb',fg:'#111827'}, danger:{bg:'#fee2e2',bd:'#fecaca',fg:'#b91c1c'}, warn:{bg:'#fef3c7',bd:'#fde68a',fg:'#b45309'} }[kind||'base'];
  return <button onClick={onClick} style={{ padding:'6px 10px', border:`1px solid ${colors.bd}`, borderRadius:999, background: active ? colors.bg : '#fff', color: colors.fg, cursor:'pointer' }}>{children}</button>;
}

/* 나머지 메뉴들 */
function WarehouseInboundPage(){ return <div><h1>창고 입고</h1><p style={{color:"#64748b"}}>엑셀 템플릿 확정 후 연결 예정</p></div>; }
function WarehouseOutboundPage(){ return <div><h1>창고 출고</h1><p style={{color:"#64748b"}}>엑셀 템플릿 확정 후 연결 예정</p></div>; }
function StoreOutboundPage(){ return <div><h1>매장 출고</h1><p className="muted">작지 플로우는 이전 버전 유지.</p></div>; }
function DeliveryOutboundPage(){ return <div><h1>택배 출고</h1><p className="muted">연결 예정</p></div>; }
