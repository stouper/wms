import { Injectable, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { HqInventoryService } from './hq-inventory.service';
import { Request } from 'express';

type ColumnMap = { sku: number; qty: number; location?: number; makerCode?: number; name?: number };

@Injectable()
export class ImportsService {
  constructor(private readonly hq: HqInventoryService) {}

  private readHeaderRow(sheet: XLSX.WorkSheet): string[] {
    const range = XLSX.utils.decode_range(sheet['!ref']!);
    const headerRowIdx = 2; // 3행 = 헤더
    const headers: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: headerRowIdx, c })];
      headers.push(String(cell?.v ?? '').trim());
    }
    return headers;
  }

  private inferColumnMap(headers: string[], body: any): ColumnMap {
    // 기본 한글 헤더 키 (필요시 바디로 override 가능)
    const skuKey = body?.skuKey ?? '코드';
    const qtyKey = body?.qtyKey ?? '수량(전산)';
    const locationKey = body?.locationKey ?? '창고';
    const makerKey = body?.makerKey ?? 'Maker코드';
    const nameKey = body?.nameKey ?? '코드명';

    const idx = (k: string) =>
      headers.findIndex((h) => h.replace(/\s/g, '') === String(k).replace(/\s/g, ''));

    const sku = idx(skuKey);
    const qty = idx(qtyKey);
    const location = idx(locationKey);
    const makerCode = idx(makerKey);
    const name = idx(nameKey);

    if (sku < 0) throw new BadRequestException(`필수 컬럼 누락: SKU(${skuKey})`);
    if (qty < 0) throw new BadRequestException(`필수 컬럼 누락: 수량(${qtyKey})`);

    return {
      sku,
      qty,
      location: location >= 0 ? location : undefined,
      makerCode: makerCode >= 0 ? makerCode : undefined,
      name: name >= 0 ? name : undefined,
    };
  }

  private* iterRows(sheet: XLSX.WorkSheet, map: ColumnMap) {
    const range = XLSX.utils.decode_range(sheet['!ref']!);

    for (let r = 3; r <= range.e.r; r++) {
      // 4행부터 데이터
      const get = (c: number | undefined) =>
        c == null ? undefined : sheet[XLSX.utils.encode_cell({ r, c })]?.v;

      const sku = String(get(map.sku) ?? '').trim();
      if (!sku) continue;

      const qtyRaw = get(map.qty);
      const qty = Number(qtyRaw);
      if (!Number.isFinite(qty)) continue;

      // ✅ 안전장치: 음수 수량은 스킵 (원하면 여기서 throw로 바꿔도 됨)
      if (qty < 0) continue;

      const location = String(get(map.location) ?? 'A-1').trim(); // 기존 'HQ' → 'A-1'
      const makerCode = get(map.makerCode) != null ? String(get(map.makerCode)).trim() : undefined;
      const name = get(map.name) != null ? String(get(map.name)).trim() : undefined;

      yield { sku, qty, location, makerCode, name };
    }
  }

  async processHqInventory(req: Request, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('파일이 없습니다.');

    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new BadRequestException('시트를 찾을 수 없습니다.');

    const headers = this.readHeaderRow(sheet);
    const map = this.inferColumnMap(headers, req.body);

    let total = 0,
      changed = 0,
      noChange = 0;

    for (const row of this.iterRows(sheet, map)) {
      total++;
      const res = await this.hq.apply(row);
      if (res.ok && res.modified) changed++;
      else if (res.ok && !res.modified) noChange++;
    }

    const debug = req.body?.debug
      ? {
          headerRow: headers,
          columnMap: map,
          total,
          changed,
          noChange,
        }
      : undefined;

    return debug ? debug : { total, changed, noChange };
  }
}
