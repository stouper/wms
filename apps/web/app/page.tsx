// apps/web/app/page.tsx
import TrackForm from './TrackForm';

type Carrier = { id: string; name: string; code: string };

async function fetchCarriers(): Promise<Carrier[]> {
  try {
    const res = await fetch('http://127.0.0.1:3000/carriers', { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export default async function Page() {
  const carriers = await fetchCarriers();
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>배송 조회</h1>
      <TrackForm carriers={carriers} />
    </main>
  );
}
