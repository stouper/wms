import { Injectable, BadRequestException } from '@nestjs/common';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class HqInventoryService {
  constructor(private readonly inventory: InventoryService) {}

  async replaceAll(
    rows: Array<{ sku: string; qty: number; location?: string; makerCode?: string; name?: string }>,
    opts?: { warehouseLocationCode?: string },
  ) {
    if (!rows || rows.length === 0) {
      throw new BadRequestException('replaceAll: rows is empty');
    }

    const fallbackLoc = String(opts?.warehouseLocationCode ?? '').trim();

    const locCodes = rows
      .map((r) => String(r?.location ?? '').trim() || fallbackLoc)
      .filter((c) => !!c);

    const uniqLocCodes = Array.from(new Set(locCodes));
    if (uniqLocCodes.length === 0) {
      throw new BadRequestException('replaceAll: location codes not found (규격 컬럼 확인)');
    }

    // ✅ 1) 엑셀에 등장한 로케이션들 전부 초기화
    await this.inventory.resetLocationsToZeroByCodes({
      locationCodes: uniqLocCodes,
    });

    // ✅ 2) set
    let applied = 0;
    for (const r of rows) {
      const sku = String(r?.sku ?? '').trim();
      if (!sku) continue;

      const location = String(r?.location ?? '').trim() || fallbackLoc;
      if (!location) {
        throw new BadRequestException(`row location missing for sku=${sku} (규격 컬럼 확인)`);
      }

      await this.inventory.setQuantity({
        skuCode: sku,
        qty: Number(r?.qty ?? 0),
        locationCode: location,
        makerCode: r?.makerCode ?? null,
        name: r?.name ?? null,
      });

      applied++;
    }

    return {
      ok: true,
      mode: 'REPLACE_ALL_MULTI_LOCATION',
      locations: uniqLocCodes.length,
      applied,
      inputRows: rows.length,
    };
  }
}
