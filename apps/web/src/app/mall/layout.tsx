import Link from 'next/link';

export default function MallLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="section">
      <div className="container" style={{ display:'grid', gap:16 }}>
        <div className="card" style={{ padding: 10 }}>
          <nav className="nav-links" style={{ justifyContent:'space-between', gap:8 }}>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <Link href="/mall">Mall 홈</Link>
              <Link href="/mall/shop">상품</Link>
              <Link href="/mall/admin">어드민</Link>
            </div>
            <div>
              <Link href="/mall/login">로그인</Link>
            </div>
          </nav>
        </div>
        <div>{children}</div>
      </div>
    </section>
  );
}
