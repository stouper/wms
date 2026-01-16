import { BadRequestException, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';

type RowObj = Record<string, any>;

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
    const requiredHeaders = ['매장명', '매출일', '매출금액'];
    for (const h of requiredHeaders) {
      if (!(h in first)) {
        throw new BadRequestException(
          `엑셀 데이터에 "${h}" 컬럼이 없어. (현재 헤더: ${Object.keys(first).join(', ')})`,
        );
      }
    }

    const errorsSample: string[] = [];
    let skipped = 0;

    const data = rows
      .map((r, idx) => {
        try {
          const storeName = String(r['매장명'] ?? '').trim();
          if (!storeName) throw new Error('Missing 매장명');

          const saleDate = toDateOnly(r['매출일'], '매출일');

          const qty = toInt(r['수량'], '수량', 0) ?? 0;
          const amount = toInt(r['매출금액'], '매출금액');
          if (amount === null) throw new Error('Missing 매출금액');

          const storeCode = normalizeStoreKey(storeName);

          // ✅ 추가 컬럼(있으면 저장 / 없으면 null)
          // productType: 구분
          // itemCode: 단품코드
          // codeName: 코드명
          const productType = String(r['구분'] ?? '').trim() || null;
          const itemCode = String(r['단품코드'] ?? '').trim() || null;
          const codeName = String(r['코드명'] ?? '').trim() || null;

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
