import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';

/**
 * HQ 재고 업로드 서비스 (호환성 유지용 Wrapper)
 *
 * 실제 로직은 InventoryService.reset()으로 위임
 * /imports/hq-inventory 엔드포인트 호환성을 위해 유지
 */

export type HqRow = {
  sku: string;
  qty: number;
  location?: string;
  makerCode?: string;
  name?: string;
  productType?: string;
};

@Injectable()
export class HqInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  /**
   * HQ 인벤토리 "전체 교체" 반영
   * - 기존 /imports/hq-inventory 호환성 유지
   * - 내부적으로 InventoryService.reset() 호출 (storeCode='HQ')
   */
  async replaceAll(rows: HqRow[]) {
    if (!Array.isArray(rows) || rows.length <= 0) {
      throw new BadRequestException('rows is required');
    }

    // HQ store 코드 조회
    const hqStore = await this.prisma.store.findFirst({
      where: { isHq: true } as any,
      select: { code: true } as any,
    } as any) as any;

    if (!hqStore) {
      throw new BadRequestException('본사 창고(isHq=true)가 등록되어 있지 않습니다.');
    }

    // InventoryService.reset() 호출
    const result = await this.inventoryService.reset({
      storeCode: hqStore.code,
      rows: rows.map(r => ({
        sku: r.sku,
        qty: r.qty,
        location: r.location,
        makerCode: r.makerCode,
        name: r.name,
        productType: r.productType,
      })),
    });

    // 기존 응답 형식 유지 (호환성)
    return {
      ok: result.ok,
      mode: 'HQ_REPLACE_ALL_OPTIMIZED', // 기존 모드명 유지
      storeCode: result.storeCode,
      locations: result.locations,
      skus: result.skus,
      applied: result.applied,
      inputRows: result.inputRows,
    };
  }
}
