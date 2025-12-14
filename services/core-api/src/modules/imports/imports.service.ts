import { Injectable, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';

type Row = Record<string, any>;

@Injectable()
export class ImportsService {
  async importProducts(buffer: Buffer, filename: string, mimetype?: string) {
    // 0) 파일 타입 가드
    const okType =
      mimetype?.includes('spreadsheetml') ||
      mimetype === 'application/vnd.ms-excel' ||
      mimetype === 'text/csv' ||
      filename.toLowerCase().endsWith('.xlsx') ||
      filename.toLowerCase().endsWith('.csv');
    if (!okType) throw new BadRequestException('엑셀(xlsx/csv)만 허용');

    // 1) 워크북 로드
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    const sh = wb.Sheets[sheetName];

    // 2) 3행 헤더/4행 데이터 가능성 고려 → range:2 우선, 비면 기본
    let rawRows: Row[] = [];
    try {
      rawRows = XLSX.utils.sheet_to_json<Row>(sh, { defval: null, raw: true, range: 2 });
      if (rawRows.length === 0) {
        rawRows = XLSX.utils.sheet_to_json<Row>(sh, { defval: null, raw: true });
      }
    } catch {
      rawRows = XLSX.utils.sheet_to_json<Row>(sh, { defval: null, raw: true });
    }

    // 3) 키 정규화: 개행/공백 제거 + 소문자
    const normalizeKey = (k: string) =>
      (k || '')
        .toString()
        .replace(/\r?\n/g, '')  // '수량\r\n(전산)' → '수량(전산)'
        .replace(/\s+/g, '')    // 모든 공백 제거
        .toLowerCase();

    const normalizedRows: Row[] = rawRows.map((r) => {
      const o: Row = {};
      for (const k of Object.keys(r)) o[normalizeKey(k)] = r[k];
      return o;
    });

    // 4) 이번 파일 대응 매핑
    const key = {
      sku: ['코드', 'sku', 'code'],
      barcode: ['maker코드', 'makercode', 'barcode', '바코드'],
      name: ['코드명', '상품명', '제품명', 'name'],
      qty: ['수량(전산)', '수량', 'qty', '재고'],
      price: ['현재가', '단가', 'price'],
      location: ['창고', '로케이션', 'location', 'bin'],
    };

    const N = Object.fromEntries(
      Object.entries(key).map(([k, arr]) => [k, arr.map(normalizeKey)])
    ) as Record<keyof typeof key, string[]>;

    const pick = (row: Row, fields: string[]) => {
      for (const f of fields) if (f in row) return row[f];
      return undefined;
    };

    // 5) 처리: 필수(SKU, QTY) 없으면 "스킵"만 하고 계속 진행 → 서버 안 멈춤
    let processed = 0;
    let changed = 0;
    const skipped: Array<{ index: number; reason: string }> = [];

    for (let i = 0; i < normalizedRows.length; i++) {
      const r = normalizedRows[i];
      const sku = pick(r, N.sku);
      const qtyRaw = pick(r, N.qty);
      const name = pick(r, N.name);
      const barcode = pick(r, N.barcode);
      const priceRaw = pick(r, N.price);
      const location = pick(r, N.location);

      const qty = qtyRaw == null || qtyRaw === '' ? undefined : Number(qtyRaw);
      const price =
        priceRaw == null || priceRaw === '' || Number.isNaN(Number(priceRaw))
          ? undefined
          : Number(priceRaw);

      if (!sku || qty == null || Number.isNaN(qty)) {
        skipped.push({ index: i + 1, reason: '필수 누락/형식 오류(SKU/수량)' });
        continue;
      }

      processed++;

      // ▼ 나중에 여기서 Prisma upsert 연결 (스키마 주면 즉시 실코드로 바꿔줄게)
      // await this.prisma.$transaction(async (tx) => {
      //   await tx.product.upsert({ ... });
      //   await tx.inventory.upsert({ ... }); // (sku+location 고유키 가정)
      // });

      changed++;
    }

    return {
      filename,
      sheet: sheetName,
      processedRows: processed,
      changedRows: changed,
      skipped: skipped.length,
      note:
        '한국어/개행 포함 헤더 자동 매핑. SKU·수량 없거나 수량이 숫자 아님 → 스킵만 하고 계속 처리(서버 안 멈춤).',
    };
  }
}
