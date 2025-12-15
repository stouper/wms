// 컬럼 시노님(동의어) — 범위를 크게 넓힘
export const HEADER_SYNONYMS = {
  sku: [
    // EN
    'sku', 'code', 'productcode', 'product_code', 'itemcode', 'item_code', 'model', 'style', 'stylecode', 'style_code',
    // KR
    '상품코드', '상품 코드', '상품번호', '제품코드', '제품 코드', '품번', '모델번호', '스타일', '스타일코드', '바코드', 'ean', 'EAN',
    // 복합표현
    '상품코드(sku)', 'sku코드', '제품코드(sku)', '스타일번호', '품번(sku)',
  ],
  qty: [
    // EN
    'qty', 'quantity', 'qty(pcs)', 'qty pcs', 'q\'ty', 'q-ty',
    // KR
    '수량', '재고', '현재고', '가용수량', '총수량', '수량합계', '입고수량', '출고수량', '수량(개)', '수량(pcs)', '수량 pcs',
  ],
  location: [
    // EN
    'location', 'loc', 'bin', 'rack', 'slot', 'section',
    // KR
    '로케이션', '창고', '위치', '로케', '지번', '셀', '섹션', '빈',
    // 복합
    '로케이션코드', '창고코드', 'bin code',
  ],
} as const;

export type CanonicalHeader = keyof typeof HEADER_SYNONYMS;

export function normalize(text: any): string {
  return String(text ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/[()\[\]{}]/g, ' ')      // 괄호 제거
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// 완전일치 → 부분일치 순서로 매핑
export function mapToCanonical(headerText: string): CanonicalHeader | null {
  const h = normalize(headerText);
  for (const key of Object.keys(HEADER_SYNONYMS) as CanonicalHeader[]) {
    if (HEADER_SYNONYMS[key].some((syn) => normalize(syn) === h)) return key;
  }
  for (const key of Object.keys(HEADER_SYNONYMS) as CanonicalHeader[]) {
    if (HEADER_SYNONYMS[key].some((syn) => h.includes(normalize(syn)))) return key;
  }
  return null;
}
