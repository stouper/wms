'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, setPending] = useState(false);
  const from = sp.get('from') || '';

  async function doLogin(role: 'admin' | 'guest') {
    try {
      setPending(true);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error('login failed');
      // 역할에 따라 분기
      router.replace(role === 'admin' ? (from || '/mall/admin') : '/mall/shop');
    } catch (e) {
      alert('로그인에 실패했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="container grid">
      <div className="card">
        <h2>로그인</h2>
        <p>임시: 역할을 선택하면 세션이 설정됩니다.</p>
        <div style={{ display:'flex', gap:12, marginTop:12, flexWrap:'wrap' }}>
          <button className="btn btn-primary" disabled={pending} onClick={() => doLogin('admin')}>어드민으로</button>
          <button className="btn" disabled={pending} onClick={() => doLogin('guest')}>게스트로</button>
        </div>
      </div>
    </div>
  );
}
