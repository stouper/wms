'use client';
import { useEffect, useState } from 'react';

export default function HealthBadge() {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(() => setOk(true))
      .catch(() => setOk(false));
  }, []);

  const bg = ok === null ? '#eee' : ok ? '#d1fae5' : '#fee2e2';
  const color = ok === null ? '#555' : ok ? '#065f46' : '#991b1b';

  return (
    <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 12, background: bg, color }}>
      {ok === null ? 'API 확인중' : ok ? 'API 연결 OK' : 'API 연결 실패'}
    </span>
  );
}
