// src/modules/inventory/inventory.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

@Injectable()
export class InventoryService {
  /**
   * 재고 증감 (+입고 / -출고 / 조정)
   * - skuId: Sku.id (주의: makerCode 아님)
   * - storeCode/locationCode 기본값: HQ
   */
  async adjustInventory(opts: {
    skuId: string;
    delta: number;
    storeCode?: string;
    locationCode?: string;
    reason?: string;
  }) {
    const {
      skuId,
      delta,
      storeCode = 'HQ',
      locationCode = 'HQ',
      reason = 'ADJUST',
    } = opts;

    return prisma.$transaction(async (tx) => {
      const store = await tx.store.findUnique({ where: { storeCode } });
      if (!store) throw new Error(`Store not found: ${storeCode}`);

      const location = await tx.location.findUnique({
        where: { storeId_code: { storeId: store.id, code: locationCode } },
      });
      if (!location) throw new Error(`Location not found: ${storeCode}/${locationCode}`);

      const beforeRow = await tx.inventory.findUnique({
        where: { skuId_locationId: { skuId, locationId: location.id } },
        select: { qty: true },
      });
      const before = beforeRow?.qty ?? 0;

      const afterRow = await tx.inventory.upsert({
        where: { skuId_locationId: { skuId, locationId: location.id } },
        update: { qty: { increment: delta } },
        create: { skuId, locationId: location.id, qty: Math.max(0, delta) },
      });

      // 로그
      await tx.inventoryTx.create({
        data: {
          skuId,
          locationId: location.id,
          type: 'ADJUST',
          qty: delta,
          reason,
        },
      });

      return { before, after: afterRow.qty };
    });
  }
}
