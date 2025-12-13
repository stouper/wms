'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AdminHome() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/mall');
  }

  return (
    <div className="container grid">
      <div className="card">
        <h2>어드민 홈</h2>
        <p>상품, 주문, 업로드 등 관리 기능으로 이동하세요.</p>
        <div style={{ display:'flex', gap:12, marginTop:12, flexWrap:'wrap' }}>
          <Link className="btn btn-primary" href="/mall/admin/products">상품 관리</Link>
          <button className="btn" disabled={pending} onClick={logout}>로그아웃</button>
        </div>
      </div>
    </div>
  );
}
