import Link from 'next/link';

export default function MallHome() {
  return (
    <div className="grid container">
      <div className="card">
        <h2>폐쇄몰</h2>
        <p>사내 전용 쇼핑/관리 영역입니다.</p>
        <div style={{ display:'flex', gap:12, marginTop:12, flexWrap:'wrap' }}>
          <Link className="btn btn-primary" href="/mall/login">로그인</Link>
          <Link className="btn" href="/mall/shop">게스트로 보기</Link>
        </div>
      </div>
      <div className="card">
        <h3>빠른 링크</h3>
        <ul style={{ margin:'8px 0 0', paddingLeft:18, lineHeight:1.9 }}>
          <li><Link href="/mall/admin">어드민 홈</Link></li>
          <li><Link href="/mall/admin/products">상품 관리</Link></li>
        </ul>
      </div>
    </div>
  );
}
