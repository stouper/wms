export type CsvRow = Record<string, string>;

export type StoreOrderRow = {
  storeCode: string;
  storeName?: string;
  sku: string;      // skuCode
  size: string;
  qty: number;
  orderNo?: string; // 없으면 서버가 발급
  memo?: string;
};

export type ParcelOrderRow = {
  receiverName: string;
  address1: string;
  phone: string;
  sku: string;      // skuCode
  size: string;
  qty: number;
  orderNo?: string; // 없으면 서버가 발급
  memo?: string;
  carrierCode?: string;
};

// 매장용 CSV 헤더 매핑 (예시)
export function mapStoreRow(r: CsvRow): StoreOrderRow {
  return {
    storeCode: val(r, ['storeCode', '매장코드']),
    storeName: opt(r, ['storeName', '매장명']),
    sku: val(r, ['sku', 'SKU', '상품코드']),
    size: val(r, ['size', '사이즈']),
    qty: num(r, ['qty', '수량']),
    orderNo: opt(r, ['orderNo', '주문번호']),
    memo: opt(r, ['memo', '메모']),
  };
}

// 택배용 CSV 헤더 매핑 (예시)
export function mapParcelRow(r: CsvRow): ParcelOrderRow {
  return {
    receiverName: val(r, ['receiverName', '수령인']),
    address1: val(r, ['address1', '주소']),
    phone: val(r, ['phone', '연락처']),
    sku: val(r, ['sku', 'SKU', '상품코드']),
    size: val(r, ['size', '사이즈']),
    qty: num(r, ['qty', '수량']),
    orderNo: opt(r, ['orderNo', '주문번호']),
    memo: opt(r, ['memo', '메모']),
    carrierCode: opt(r, ['carrierCode', '택배사코드']),
  };
}

/* ---------------- helpers ---------------- */
function val(r: CsvRow, keys: string[]) {
  for (const k of keys) {
    const v = r[k];
    if (v !== undefined && String(v).trim() !== '') return String(v).trim();
  }
  throw new Error(`필수 컬럼 누락: ${keys.join(' | ')}`);
}
function opt(r: CsvRow, keys: string[]) {
  for (const k of keys) {
    const v = r[k];
    if (v !== undefined && String(v).trim() !== '') return String(v).trim();
  }
  return undefined;
}
function num(r: CsvRow, keys: string[]) {
  const v = Number(val(r, keys));
  if (Number.isFinite(v)) return v;
  throw new Error(`숫자 변환 오류: ${keys.join(' | ')}`);
}
