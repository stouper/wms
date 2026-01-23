import { BadRequestException, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';

type RowObj = Record<string, any>;

/**
 * 헤더 정규화: 특수문자/공백/괄호 제거, 소문자화
 * 엑셀 정렬 시 생성되는 ▲▼ 등 특수문자 처리
 */
function normHeader(s: string): string {
  const raw = String(s ?? '').trim();
  if (!raw) return '';
  return raw
    .replace(/\s+/g, '')           // 공백 제거
    .replace(/[()[\]{}]/g, '')     // 괄호 제거
    .replace(/[▲▼△▽↑↓←→]/g, '')   // 정렬 특수문자 제거
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // 제로폭 문자/BOM 제거
    .toLowerCase();
}

/**
 * 여러 키워드 중 매칭되는 값 추출
 */
function pick(obj: RowObj, keys: string[]): any {
  const normalizedKeys = keys.map((k) => normHeader(k));

  for (const objKey of Object.keys(obj || {})) {
    const normalizedObjKey = normHeader(objKey);
    const idx = normalizedKeys.indexOf(normalizedObjKey);
    if (idx >= 0) {
      const v = obj[objKey];
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
  }
  return '';
}

/**
 * 필수 헤더 존재 여부 확인 (정규화된 키로 비교)
 */
function hasHeader(obj: RowObj, keys: string[]): boolean {
  const normalizedKeys = keys.map((k) => normHeader(k));

  for (const objKey of Object.keys(obj || {})) {
    const normalizedObjKey = normHeader(objKey);
    if (normalizedKeys.includes(normalizedObjKey)) {
      return true;
    }
  }
  return false;
}

function toInt(v: any, fieldName: string, defaultValue: number | null = null) {
  if (v === null || v === undefined || v === '') return defaultValue;
  const cleaned = String(v).replace(/,/g, '').trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new BadRequestException(`Invalid number for ${fieldName}: ${v}`);
  return Math.trunc(n);
}

function toDateOnly(v: any, fieldName: string): Date {
  if (v === null || v === undefined || v === '') {
    throw new BadRequestException(`Missing ${fieldName}`);
  }

  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return new Date(v.getFullYear(), v.getMonth(), v.getDate(), 0, 0, 0, 0);
  }

  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d?.y && d?.m && d?.d) return new Date(d.y, d.m - 1, d.d, 0, 0, 0, 0);
  }

  const s = String(v).trim();
  const m = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0, 0);
  }

  throw new BadRequestException(`Invalid date for ${fieldName}: ${v}`);
}

function normalizeStoreKey(storeName: string) {
  return String(storeName ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[()]/g, '')
    .toUpperCase();
}

function parseYYYYMMDD(input: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(input ?? '').trim());
  if (!m) throw new BadRequestException(`Invalid date format: ${input}. Use YYYY-MM-DD`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) throw new BadRequestException(`Invalid date value: ${input}`);
  return dt;
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

// 헤더 파싱 키워드 정의
const HEADER_KEYWORDS = {
  storeName: ['매장명', 'storeName', 'store_name', '매장', '지점', '지점명'],
  saleDate: ['매출일', 'saleDate', 'sale_date', '일자', '날짜', 'date'],
  amount: ['매출금액', 'amount', '금액', '매출액', 'salesAmount', 'sales_amount'],
  qty: ['수량', 'qty', 'quantity', '판매수량'],
  codeName: ['코드명', 'codeName', 'code_name', '상품명', '품명', 'productName', 'product_name'],
  productType: ['구분', 'productType', 'product_type', '상품구분', 'type', 'category'],
  itemCode: ['단품코드', 'itemCode', 'item_code', 'sku', 'SKU', '품번'],
};

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async importExcelToSalesRaw(buffer: Buffer, sourceKey?: string) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) throw new BadRequestException('No sheet found in xlsx');

    const ws = wb.Sheets[sheetName];

    const rows: RowObj[] = XLSX.utils.sheet_to_json(ws, {
      defval: '',
      raw: true,
    });

    if (!rows.length) {
      return { inserted: 0, skipped: 0, errorsSample: ['No rows found'] };
    }

    const first = rows[0];

    // 필수 헤더 검증 (정규화된 키로 비교)
    const requiredChecks = [
      { name: '매장명', keys: HEADER_KEYWORDS.storeName },
      { name: '매출일', keys: HEADER_KEYWORDS.saleDate },
      { name: '매출금액', keys: HEADER_KEYWORDS.amount },
      { name: '수량', keys: HEADER_KEYWORDS.qty },
      { name: '코드명', keys: HEADER_KEYWORDS.codeName },
    ];

    for (const check of requiredChecks) {
      if (!hasHeader(first, check.keys)) {
        throw new BadRequestException(
          `엑셀 데이터에 "${check.name}" 컬럼이 없어. (현재 헤더: ${Object.keys(first).join(', ')})`,
        );
      }
    }

    const errorsSample: string[] = [];
    let skipped = 0;

    // Store 테이블 조회 (매장명 → Store.code 매칭용)
    const allStores = await this.prisma.store.findMany({
      select: { id: true, code: true, name: true },
    });
    // 매장명/코드 → Store.code 매핑 (code 우선, name 보조)
    const storeMap = new Map<string, string>();
    for (const s of allStores) {
      if (s.code) storeMap.set(s.code.toLowerCase(), s.code);
      if (s.name) storeMap.set(s.name.toLowerCase(), s.code);
    }

    const data = rows
      .map((r, idx) => {
        try {
          const storeName = String(pick(r, HEADER_KEYWORDS.storeName) ?? '').trim();
          if (!storeName) throw new Error('Missing 매장명');

          const saleDateRaw = pick(r, HEADER_KEYWORDS.saleDate);
          const saleDate = toDateOnly(saleDateRaw, '매출일');

          const qtyRaw = pick(r, HEADER_KEYWORDS.qty);
          const qty = toInt(qtyRaw, '수량');
          if (qty === null) throw new Error('Missing 수량');

          const amountRaw = pick(r, HEADER_KEYWORDS.amount);
          const amount = toInt(amountRaw, '매출금액');
          if (amount === null) throw new Error('Missing 매출금액');

          const codeName = String(pick(r, HEADER_KEYWORDS.codeName) ?? '').trim();
          if (!codeName) throw new Error('Missing 코드명');

          // Store 테이블에서 매칭 (code 우선, name 보조, 없으면 매장명 대문자 변환)
          const storeCode = storeMap.get(storeName.toLowerCase()) || normalizeStoreKey(storeName);

          // 선택 컬럼 (있으면 저장 / 없으면 null)
          const productType = String(pick(r, HEADER_KEYWORDS.productType) ?? '').trim() || null;
          const itemCode = String(pick(r, HEADER_KEYWORDS.itemCode) ?? '').trim() || null;

          return {
            saleDate,
            storeCode,
            storeName,
            qty,
            amount,
            sourceKey: sourceKey || null,
            productType,
            itemCode,
            codeName,
          };
        } catch (e: any) {
          skipped += 1;
          if (errorsSample.length < 20) {
            errorsSample.push(`row ${idx + 2}: ${e?.message || String(e)}`);
          }
          return null;
        }
      })
      .filter(Boolean) as any[];

    if (!data.length) {
      return { sheetName, totalRows: rows.length, inserted: 0, skipped, errorsSample };
    }

    const BATCH = 5000;
    let inserted = 0;

    for (let i = 0; i < data.length; i += BATCH) {
      const chunk = data.slice(i, i + BATCH);
      const res = await this.prisma.salesRaw.createMany({
        data: chunk,
      });
      inserted += res.count;
    }

    return {
      sheetName,
      totalRows: rows.length,
      inserted,
      skipped,
      errorsSample,
    };
  }

  /**
   * 디버그: 최근 저장된 매출 데이터 확인
   */
  async getRecentSalesRaw() {
    const total = await this.prisma.salesRaw.count();
    const recent = await this.prisma.salesRaw.findMany({
      take: 10,
      orderBy: { id: 'desc' },
    });

    // 날짜 범위 확인
    const dateRange = await this.prisma.salesRaw.aggregate({
      _min: { saleDate: true },
      _max: { saleDate: true },
    });

    return {
      totalCount: total,
      dateRange: {
        min: dateRange._min.saleDate,
        max: dateRange._max.saleDate,
      },
      recentItems: recent.map((r) => ({
        id: r.id,
        saleDate: r.saleDate,
        storeCode: r.storeCode,
        storeName: r.storeName,
        qty: r.qty,
        amount: r.amount,
        codeName: r.codeName,
      })),
    };
  }

  /**
   * ✅ 매장별 매출 조회
   */
  async getSalesByStore(from: string, to: string) {
    const fromDate = parseYYYYMMDD(from);
    const toDate = parseYYYYMMDD(to);
    if (fromDate.getTime() > toDate.getTime()) {
      throw new BadRequestException('from must be <= to');
    }

    const rows = await this.prisma.salesRaw.groupBy({
      by: ['storeCode', 'storeName'],
      where: {
        saleDate: {
          gte: fromDate,
          lte: endOfDay(toDate),
        },
      },
      _sum: { amount: true, qty: true },
      orderBy: { _sum: { amount: 'desc' } },
    });

    return {
      from,
      to,
      items: rows.map((r) => ({
        storeCode: r.storeCode,
        storeName: r.storeName ?? null,
        totalAmount: r._sum.amount ?? 0,
        totalQty: r._sum.qty ?? 0,
      })),
    };
  }
}
