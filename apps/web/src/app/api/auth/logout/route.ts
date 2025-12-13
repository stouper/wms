// 프론트 → (Next API) → 백엔드로 그대로 중계
export const runtime = 'nodejs'; // Edge 말고 node (formData 중계 안정)

const BACKEND_URL =
  process.env.CORE_API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:3000';

export async function POST(req: Request) {
  try {
    // 프론트에서 온 multipart 그대로 꺼내기
    const form = await req.formData();

    // 쿼리 유지 (type=STORE 등)
    const url = new URL(req.url);
    const type = url.searchParams.get('type') ?? 'STORE';

    // 백엔드로 그대로 전송
    const res = await fetch(`${BACKEND_URL}/imports/orders?type=${encodeURIComponent(type)}`, {
      method: 'POST',
      body: form, // Node18+ OK: multipart boundary 자동
    });

    // 백엔드 응답 그대로 반환
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'text/plain' },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message ?? 'proxy failed' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }
}

// 헬스체크: GET /api/imports/orders → "proxy ok"
export async function GET() {
  return new Response('proxy ok', { status: 200 });
}
