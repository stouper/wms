import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="container hero">
      <section className="hero-pane">
        <h1>우리가 만드는 운영의 표준</h1>
        <p>
          매장 운영 · 재고 · 출고를 한눈에. ESKA는 반복을 줄이고 중요한 결정에 집중하게 해줘요.
        </p>
        <div style={{ display:'flex', gap:12, marginTop:18, flexWrap:'wrap' }}>
          <Link className="btn btn-primary" href="/mall">폐쇄몰로 들어가기</Link>
          <Link className="btn" href="/mall/shop">게스트로 둘러보기</Link>
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <h2>실시간 재고</h2>
          <p>입·출고 흐름 자동 기록, 대시보드 즉시 확인.</p>
        </div>
        <div className="card">
          <h2>출고 효율화</h2>
          <p>단품/다품 피킹, 엑셀 업로드, 라벨 출력까지 한 번에.</p>
        </div>
        <div className="card">
          <h2>권한/보안</h2>
          <p>회사/지점/직원 역할에 따른 화면·데이터 접근 제어.</p>
        </div>
        <div className="card">
          <h2>API 연동</h2>
          <p>상품/주문/택배사 연동용 API 제공.</p>
        </div>
      </section>
    </div>
  );
}
