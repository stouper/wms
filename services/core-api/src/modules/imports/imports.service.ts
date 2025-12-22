import { Injectable, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { HqInventoryService } from './hq-inventory.service';
import { Request } from 'express';

@Injectable()
export class ImportsService {
  constructor(private readonly hq: HqInventoryService) {}

  private normHeader(s: any) {
    return String(s ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '') // 공백/줄바꿈 제거
      .replace(/[()]/g, ''); // 괄호 제거
  }

  private toNumber(v: any) {
    if (v == null) return NaN;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/,/g, '').trim();
    return Number(s);
  }

  async processHqInventory(req: Request, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('파일이 없습니다.');

    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new BadRequestException('엑셀 시트가 없습니다.');

    const sheet = wb.Sheets[sheetName];
    if (!sheet?.['!ref']) throw new BadRequestException('엑셀 범위를 읽을 수 없습니다(!ref 없음).');

    const range = XLSX.utils.decode_range(sheet['!ref']);

    // ✅ 브라더 파일: 3행이 헤더 (0-based r=2)
    const headerRowIdx = 2;

    // 헤더 읽기
    const headers: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: headerRowIdx, c })];
      headers.push(String(cell?.v ?? '').trim());
    }

    const H = headers.map((h) => this.normHeader(h));

    // ✅ 정확 매핑
    const idxCode = H.findIndex((h) => h === '코드');
    const idxMaker = H.findIndex((h) => h === 'maker코드' || h === 'makercode');
    const idxName = H.findIndex((h) => h === '코드명');
    const idxQty = H.findIndex((h) => h === '수량전산'); // 수량(전산) → 수량전산

    // ✅ 핵심: '규격' 컬럼을 로케이션으로 사용
    const idxLoc = H.findIndex((h) => h === '규격');

    if (idxCode < 0) throw new BadRequestException('헤더에서 "코드" 컬럼을 찾지 못했습니다.');
    if (idxQty < 0) throw new BadRequestException('헤더에서 "수량(전산)" 컬럼을 찾지 못했습니다.');
    if (idxLoc < 0) throw new BadRequestException('헤더에서 "규격"(로케이션) 컬럼을 찾지 못했습니다.');

    const rows: Array<{ sku: string; qty: number; location: string; makerCode?: string; name?: string }> = [];

    for (let r = headerRowIdx + 1; r <= range.e.r; r++) {
      const get = (idx: number) => sheet[XLSX.utils.encode_cell({ r, c: range.s.c + idx })]?.v;

      const sku = String(get(idxCode) ?? '').trim();
      if (!sku) continue;

      const qty = this.toNumber(get(idxQty));
      if (!Number.isFinite(qty)) continue;
      if (qty < 0) continue;

      if (qty > 1_000_000) {
        throw new BadRequestException(
          `수량이 비정상적으로 큽니다. (엑셀 ${r + 1}행) qty=${qty}. "수량(전산)" 컬럼 확인하세요.`,
        );
      }

      const location = String(get(idxLoc) ?? '').trim();
      if (!location) {
        throw new BadRequestException(`로케이션(규격)이 비었습니다. (엑셀 ${r + 1}행)`);
      }

      const makerCode = idxMaker >= 0 ? String(get(idxMaker) ?? '').trim() : undefined;
      const name = idxName >= 0 ? String(get(idxName) ?? '').trim() : undefined;

      rows.push({ sku, qty, location, makerCode, name });
    }

    if (rows.length === 0) throw new BadRequestException('엑셀에 유효한 재고 데이터가 없습니다.');

    // fallbackLoc (혹시 규격이 비어있을 경우 대비용)
    const warehouseLocationCode = (req.body?.warehouseLocationCode
      ? String(req.body.warehouseLocationCode)
      : '').trim();

    const result = await this.hq.replaceAll(rows as any, {
      warehouseLocationCode: warehouseLocationCode || undefined,
    });

    return {
      headerRow: headerRowIdx + 1,
      headers,
      map: { code: idxCode, qty: idxQty, makerCode: idxMaker, name: idxName, location_from_spec: idxLoc },
      rows: rows.length,
      warehouseLocationCode: warehouseLocationCode || null,
      ...result,
    };
  }
}
