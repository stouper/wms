'use client';

import { useMemo, useState } from 'react';

type Carrier = { id: string; name: string; code: string };
type Event = { time: string; status: string; description: string; location: string };

export default function TrackForm({ carriers }: { carriers?: Carrier[] }) {
  const list = Array.isArray(carriers) ? carriers : [];
  const initialCode = useMemo(() => (list[0]?.code ?? ''), [list]);
  const [code, setCode] = useState(initialCode);
  const [number, setNumber] = useState('');
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code || !number) return;
    setLoading(true);
    setError(null);
    setEvents(null);
    try {
      const res = await fetch(`http://127.0.0.1:3000/carriers/${code}/track/${encodeURIComponent(number)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`조회 실패 (${res.status})`);
      const data = await res.json();
      setEvents(Array.isArray(data?.events) ? data.events : []);
    } catch (e: any) {
      setError(e?.message || 'error');
    } finally {
      setLoading(false);
    }
  }

  if (list.length === 0) {
    return <p style={{ color: '#666' }}>캐리어 데이터가 없습니다. (시드 후 새로고침)</p>;
  }

  return (
    <>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        <select value={code} onChange={e => setCode(e.target.value)} style={{ padding: 8 }}>
          {list.map(c => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>

        <input
          placeholder="운송장 번호"
          value={number}
          onChange={e => setNumber(e.target.value)}
          style={{ padding: 8 }}
        />

        <button disabled={loading || !number || !code} style={{ padding: 10 }}>
          {loading ? '조회 중…' : '조회'}
        </button>
      </form>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {events && (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {events.map((ev, i) => (
            <li key={i} style={{ padding: 12, borderLeft: '3px solid #333', marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: '#666' }}>
                {new Date(ev.time).toLocaleString()}
              </div>
              <div>
                <b>{ev.description}</b> — {ev.location}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
