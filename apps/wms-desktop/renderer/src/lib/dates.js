// lib/dates.js
export function ymdKST(d) {
  const dt = new Date(d);

  // ✅ KST(Asia/Seoul) 기준으로 "YYYY-MM-DD" 생성 (수동 +9시간 금지)
  // en-CA 포맷은 날짜를 YYYY-MM-DD로 뽑아줘서 가장 깔끔함
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dt);
}
