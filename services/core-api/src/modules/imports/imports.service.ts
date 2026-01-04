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
    const raw = String(s ?? '').trim();
    if (!raw) return '';
    return raw
      .replace(/\s+/g, '')
      .replace(/[\(\)\[\]\{\}]/g, '')
      .replace(/[▲▼△▽]/g, '')
      .toLowerCase();
  }

  private pickHeaderRowIdx(grid: any[][], CODE_HEADERS: string[], QTY_HEADERS: string[]) {
    // ✅ 헤더 행 자동 탐색 (상단에 "검색조건" 같은 안내 행이 있어도 통과)
    const maxScan = Math.min(30, grid.length);
    for (let i = 0; i < maxScan; i++) {
      const hs = (grid[i] || []).map((c) => this.normHeader(c)).filter(Boolean);
      if (hs.length <= 0) continue;

      const hasCode = hs.some((h) => CODE_HEADERS.includes(h));
      const hasQty = hs.some((h) => QTY_HEADERS.includes(h));
      if (hasCode && hasQty) return i;
    }
    return -1;
  }

  async processHqInventory(req: Request, file?: Express.Multer.File, body?: any) {
    if (!file?.buffer?.length) throw new BadRequestException('file is required');

    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) throw new BadRequestException('No sheet in Excel');

    const ws = wb.Sheets[sheetName];
    const grid: any[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: true,
      defval: '',
    });

    // ✅ 헤더 후보(너 엑셀 기준 + 한글/영문 alias)
    const CODE_HEADERS = ['코드', 'code', 'sku', 'skucode', '상품코드', '품번', '제품코드'].map((x) =>
      this.normHeader(x),
    );
    const QTY_HEADERS = ['수량전산', 'qty', '수량', '재고', 'onhand', '재고수량', '기준수량'].map((x) =>
      this.normHeader(x),
    );
    const MAKER_HEADERS = ['maker코드', 'makercode', '바코드', 'barcode'].map((x) => this.normHeader(x));
    const NAME_HEADERS = ['코드명', 'name', '상품명', 'productname'].map((x) => this.normHeader(x));
    const PRODUCT_TYPE_HEADERS = ['producttype', '상품구분', '카테고리', 'category', '아이템', 'item', 'type'].map((x) =>
      this.normHeader(x),
    );
    const LOC_HEADERS = ['location', 'locationcode', '로케이션', 'location코드', '랙', '진열', '위치', 'loc'].map((x) =>
      this.normHeader(x),
    );

    // ✅ 헤더 행 자동탐색 (기존 3행 고정에서 업그레이드)
    let headerRowIdx = this.pickHeaderRowIdx(grid, CODE_HEADERS, QTY_HEADERS);
    if (headerRowIdx < 0) {
      // 디버그용으로 상단 5줄 헤더 스냅샷 포함
      const snap = grid
        .slice(0, 5)
        .map((r) => (r || []).map((c) => this.normHeader(c)).filter(Boolean))
        .filter((r) => r.length > 0);
      throw new BadRequestException(`Missing code/qty columns. headers=${JSON.stringify(snap)}`);
    }

    const headers = (grid[headerRowIdx] || []).map((c) => this.normHeader(c));

    const idxCode = headers.findIndex((x) => CODE_HEADERS.includes(x));
    const idxQty = headers.findIndex((x) => QTY_HEADERS.includes(x));
    const idxMaker = headers.findIndex((x) => MAKER_HEADERS.includes(x));
    const idxName = headers.findIndex((x) => NAME_HEADERS.includes(x));
    const idxProductType = headers.findIndex((x) => PRODUCT_TYPE_HEADERS.includes(x));

    // ✅ Location: 헤더로 먼저 찾고, 없으면 기존 G열(6) fallback 유지
    let idxLoc = headers.findIndex((x) => LOC_HEADERS.includes(x));
    if (idxLoc < 0) idxLoc = 6;

    if (idxCode < 0 || idxQty < 0) {
      throw new BadRequestException(
        `Missing code/qty columns. headers=${JSON.stringify(headers)}`,
      );
    }

    const warehouseLocationCode = String(body?.warehouseLocationCode ?? '').trim();

    const rows: Array<{
      sku: string;
      qty: number;
      location?: string;
      makerCode?: string;
      name?: string;
      productType?: string;
    }> = [];

    // 데이터는 헤더 다음 줄부터
    for (let r = headerRowIdx + 1; r < grid.length; r++) {
      const line = grid[r] || [];
      const rawSku = String(line[idxCode] ?? '').trim();
      if (!rawSku) continue;

      const qty = Number(line[idxQty] ?? 0);
      if (!Number.isFinite(qty)) continue;

      const location = String(line[idxLoc] ?? '').trim();
      const makerCode = idxMaker >= 0 ? String(line[idxMaker] ?? '').trim() : '';
      const name = idxName >= 0 ? String(line[idxName] ?? '').trim() : '';

      const productTypeRaw = idxProductType >= 0 ? String(line[idxProductType] ?? '').trim() : '';
      const productType = productTypeRaw || undefined;

      rows.push({
        sku: rawSku,
        qty,
        location: location || undefined, // 없으면 서비스에서 warehouseLocationCode로 fallback
        makerCode: makerCode || undefined,
        name: name || undefined,
        productType,
      });
    }

    // ✅ HQ 업로드는 “최종수량 SET” 로직
    const result = await this.hq.replaceAll(rows as any);

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
        productType: idxProductType,
      },
      rows: rows.length,
      warehouseLocationCode,
      ...result,
    };
  }
}
