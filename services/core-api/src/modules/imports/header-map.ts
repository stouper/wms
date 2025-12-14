// src/modules/imports/header-map.ts
export const headerMap = {
  // SKU 기준: Maker코드(바코드) 최우선 → 없을 때만 코드 사용
  sku: ['Maker코드', '코드', 'SKU', '품번', '스타일코드', '제품코드'],

  // 수량
  qty: ['수량(전산)', '수량', '재고', 'Qty', 'QTY', 'Quantity'],

  // 위치(없으면 HQ)
  location: ['위치', '창고', '로케이션', 'Location', 'WH', 'Warehouse'],

  // 🔽 보조 정보(있으면 Sku 생성 시 같이 저장)
  code: ['코드'],                // 내부 품번
  name: ['코드명', '상품명', 'Name'], // 상품명
} as const;
