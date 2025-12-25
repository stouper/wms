import { Injectable, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { Request } from 'express';
import { HqInventoryService } from './hq-inventory.service';

@Injectable()
export class ImportsService {
  constructor(private readonly hq: HqInventoryService) {}

  private normHeader(s: any) {
    // 엑셀 헤더 정규화:
    // - 공백 제거
    // - 괄호 제거
    // - 영문 소문자화
    // 예) "수량(전산)" -> "수량전산"
    //     "Maker코드" -> "maker코드"
    return String(s ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[()]/g, '');
  }

  private pickWarehouseLocationCode(req: Request, body?: any) {
    // 데스크탑이 FormData로 보내면 body에 문자열로 들어올 수 있음
    const fromBody = String(body?.warehouseLocationCode ?? '').trim();
    const fromQuery = String((req.query as any)?.warehouseLocationCode ?? '').trim();
    return (fromBody || fromQuery || 'HQ-01').toUpperCase();
  }

  /**
   * Desktop: POST /imports/hq-inventory (multipart/form-data file)
   * - 헤더: 3행
   * - 데이터: 4행부터
   * - 코드 컬럼: "코드"
   * - 수량 컬럼: "수량(전산)" (정규화 => "수량전산")
   * - 위치 컬럼: G열(0-based index 6)
   */
  async processHqInventory(req: Request, file?: Express.Multer.File, body?: any) {
    if (!file?.buffer?.length) throw new BadRequestException('file is required');

    const warehouseLocationCode = this.pickWarehouseLocationCode(req, body);

    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) throw new BadRequestException('No sheet found');

    const ws = wb.Sheets[sheetName];
    const grid: any[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: true,
      defval: '',
    });

    // ✅ 너 엑셀 포맷 고정: 3행이 헤더(0-based index 2)
    let headerRowIdx = 2;
    if (grid.length <= headerRowIdx) {
      throw new BadRequestException('Header row not found (sheet too short)');
    }

    const headers = (grid[headerRowIdx] || []).map((c) => this.normHeader(c));

    // ✅ 헤더 후보(너 엑셀 기준)
    const CODE_HEADERS = ['코드', 'code', 'sku', 'skucode', '상품코드', '품번', '제품코드'].map((x) =>
      this.normHeader(x),
    );
    const QTY_HEADERS = ['수량전산', 'qty', '수량', '재고', 'onhand', '재고수량', '기준수량'].map((x) =>
      this.normHeader(x),
    );
    const MAKER_HEADERS = ['maker코드', 'makercode', '바코드', 'barcode'].map((x) => this.normHeader(x));
    const NAME_HEADERS = ['코드명', 'name', '상품명', 'productname'].map((x) => this.normHeader(x));

    const idxCode = headers.findIndex((x) => CODE_HEADERS.includes(x));
    const idxQty = headers.findIndex((x) => QTY_HEADERS.includes(x));
    const idxMaker = headers.findIndex((x) => MAKER_HEADERS.includes(x));
    const idxName = headers.findIndex((x) => NAME_HEADERS.includes(x));

    // ✅ G열이 위치라고 확정: A=0, B=1, ... G=6
    const idxLoc = 6;

    if (idxCode < 0 || idxQty < 0) {
      throw new BadRequestException(
        `Missing code/qty columns. headers=${headers.join(',')}`,
      );
    }

    // 4행부터 데이터
    const rows: Array<{ sku: string; qty: number; location?: string; makerCode?: string; name?: string }> = [];

    for (let r = headerRowIdx + 1; r < grid.length; r++) {
      const row = grid[r] || [];

      const sku = String(row[idxCode] ?? '').trim();
      if (!sku) continue;

      const qty = Number(row[idxQty] ?? 0);
      if (!Number.isFinite(qty) || qty < 0) continue;

      const makerCode = idxMaker >= 0 ? String(row[idxMaker] ?? '').trim() : '';
      const name = idxName >= 0 ? String(row[idxName] ?? '').trim() : '';

      const location = String(row[idxLoc] ?? '').trim(); // G열
      rows.push({
        sku,
        qty,
        location: location || undefined, // 없으면 서비스에서 warehouseLocationCode로 fallback
        makerCode: makerCode || undefined,
        name: name || undefined,
      });
    }

    // ✅ HQ 업로드는 “최종수량 SET” 로직
    const result = await this.hq.replaceAll(rows, { warehouseLocationCode });

    // ⚠️ result 안에 ok가 있을 수 있어서 중복 방지(이번에 겪은 TS2783)
    return {
      sheet: sheetName,
      headerRow: headerRowIdx + 1, // 사용자에게는 1-based
      map: {
        code: idxCode,
        qty: idxQty,
        makerCode: idxMaker,
        name: idxName,
        location: idxLoc,
      },
      rows: rows.length,
      warehouseLocationCode,
      ...result,
    };
  }
}
