import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import { headerMap } from './header-map';
import { InventoryService } from '../inventory/inventory.service';

const prisma = new PrismaClient();

/** 헤더 정규화: 따옴표/공백 제거 + 소문자 */
function normalize(s: string) {
  return String(s)
    .replace(/"/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** 후보 헤더 중 실제 시트에 존재하는 컬럼명을 찾아서 원본 헤더 문자열을 반환 */
function pick(headers: string[], candidates: readonly string[]) {
  const normHeaders = headers.map((h) => normalize(h));
  for (const c of candidates) {
    const idx = normHeaders.indexOf(normalize(c));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

/** 느슨한 숫자 파싱: '69,900' → 69900, '' → 0 */
function toNumberLoose(v: any): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(/,/g, '').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** 문자열화(바코드/코드용): 숫자/문자 어떤 형식이어도 안전하게 string */
function toStr(v: any): string {
  if (v === null || v === undefined) return '';
  // 숫자면 그대로 문자열화 (12~13자리 바코드는 JS 정수 안전범위 내)
  if (typeof v === 'number') return String(v);
  // 문자열이면 트림
  return String(v).trim();
}

@Injectable()
export class HqInventoryService {
  constructor(private inventory: InventoryService) {}

  /** 엑셀(3행 헤더, 4행 데이터) → HQ 재고 스냅샷(delta 적용) */
  async importExcel(buffer: Buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];

    // 3행이 헤더(1-index) → range:2 (0-index)로 지정
    const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: '', range: 2 });

    if (!rows.length) {
      return { total: 0, success: 0, fail: 0, changed: 0, createdSkus: 0, createdLocations: 0 };
    }

    const headers = Object.keys(rows[0] ?? {});
    // 디버그: 실제 헤더 확인
    console.log('📎 HEADERS(raw):', headers);

    const skuCol = pick(headers, headerMap.sku);
    const qtyCol = pick(headers, headerMap.qty);
    const locCol = pick(headers, headerMap.location);
    const codeCol = pick(headers, headerMap.code);
    const nameCol = pick(headers, headerMap.name);

    if (!skuCol || !qtyCol) {
      console.error('❌ 헤더 매칭 실패:', { skuCol, qtyCol, headers });
      throw new Error('SKU / 수량 컬럼을 찾을 수 없음');
    }

    // HQ 스토어 보장 (seed 없이도 최초 1회 자동 생성)
    const store = await prisma.store.upsert({
      where: { storeCode: 'HQ' },
      update: {},
      create: { storeCode: 'HQ', storeName: '본사창고' },
    });

    let success = 0,
      fail = 0,
      changed = 0,
      createdSkus = 0,
      createdLocations = 0;

    // 첫 1~2행 샘플 로그
    console.log('🔍 SAMPLE ROW #1:', rows[0]);
    if (rows[1]) console.log('🔍 SAMPLE ROW #2:', rows[1]);

    for (const r of rows) {
      try {
        const makerOrCode = toStr(r[skuCol]); // Maker코드(최우선) 또는 코드
        if (!makerOrCode) {
          throw new Error(`빈 SKU(maker/code) 값: skuCol=${skuCol}, raw=${r[skuCol]}`);
        }

        const desired = toNumberLoose(r[qtyCol]);
        // 위치가 없으면 HQ, 있으면 트림/정규화 없이 원본 그대로 code 사용
        const locationCode = (toStr(locCol ? r[locCol] : '') || 'HQ') || 'HQ';

        // 1) SKU 찾거나 만들기 (makerCode 우선, 없으면 code로도 탐색)
        let sku = await prisma.sku.findFirst({
          where: { OR: [{ makerCode: makerOrCode }, { code: makerOrCode }] },
        });

        if (!sku) {
          const codeVal = codeCol ? toStr(r[codeCol]) || null : null;
          const nameVal = nameCol ? toStr(r[nameCol]) || null : null;
          sku = await prisma.sku.create({
            data: {
              makerCode: makerOrCode, // 바코드를 우선 makerCode에 저장
              code: codeVal,
              name: nameVal,
            },
          });
          createdSkus++;
        } else if (!sku.makerCode) {
          // 기존 sku가 code로만 존재했을 때 makerCode 갱신
          sku = await prisma.sku.update({
            where: { id: sku.id },
            data: { makerCode: makerOrCode },
          });
        }

        // 2) Location 찾거나 만들기
        let location = await prisma.location.findUnique({
          where: { storeId_code: { storeId: store.id, code: locationCode } },
        });
        if (!location) {
          location = await prisma.location.create({
            data: { storeId: store.id, code: locationCode },
          });
          createdLocations++;
        }

        // 3) 현재 수량 대비 delta 계산 → adjustInventory 호출
        const current = await prisma.inventory.findUnique({
          where: { skuId_locationId: { skuId: sku.id, locationId: location.id } },
          select: { qty: true },
        });

        const before = current?.qty ?? 0;
        const delta = desired - before;

        if (delta !== 0) {
          await this.inventory.adjustInventory({
            skuId: sku.id,
            delta,
            locationCode,
            reason: 'INIT',
          });
          changed++;
        }

        success++;
      } catch (e) {
        // 🔥 실패 원인 디버그
        console.error('❌ ROW FAIL:', r);
        console.error('   ↳ ERROR:', (e as Error).message);
        fail++;
      }
    }

    return { total: rows.length, success, fail, changed, createdSkus, createdLocations };
  }
}
