'use client';
import HealthBadge from '@/components/HealthBadge';

export default function HomePage() {
  async function sendAbsolute() {
    const csv = `orderNo,sku,qty
ABS-001,SKU-001,1
ABS-002,SKU-002,2
`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const file = new File([blob], 'absolute.csv');
    const form = new FormData();
    form.append('file', file); // ★ 필드명 'file'

    const res = await fetch('http://127.0.0.1:3000/imports/orders?type=STORE', { method: 'POST', body: form });
    const text = await res.text();
    console.log('[ABS] status:', res.status, 'body:', text);
    alert(`[ABS] status ${res.status} (콘솔 확인)`);
  }

  async function sendProxy() {
    const csv = `orderNo,sku,qty
PRX-001,SKU-101,3
PRX-002,SKU-102,4
`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const file = new File([blob], 'proxy.csv');
    const form = new FormData();
    form.append('file', file);

    const res = await fetch('/api/imports/orders?type=STORE', { method: 'POST', body: form });
    const text = await res.text();
    console.log('[PRX] status:', res.status, 'body:', text);
    alert(`[PRX] status ${res.status} (콘솔 확인)`);
  }

  return (
    <main style={{ padding: 40 }}>
      <h1>회사 홈페이지</h1>
      <p>프론트(4000) ↔ 백엔드(3000) 연결 & 업로드 최종 테스트</p>

      <div style={{ marginTop: 12 }}>
        <HealthBadge />
      </div>

      <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
        <button onClick={sendAbsolute} style={{ padding: '10px 14px' }}>절대주소로 업로드(直)</button>
        <button onClick={sendProxy} style={{ padding: '10px 14px' }}>/api 프록시로 업로드</button>
      </div>

      <p style={{ marginTop: 12, color: '#555' }}>
        버튼 클릭 후 DevTools → Network에서 요청 확인, 백엔드 콘솔에는 <code>[IMPORTS]</code> 로그가 찍혀야 정상!
      </p>
    </main>
  );
}
