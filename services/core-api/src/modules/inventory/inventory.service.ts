import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type SetQuantityInput = {
  sku: string;            // 엑셀 "코드"
  qty: number;            // 엑셀 "수량(전산)"
  location?: string;      // 엑셀 "창고" (A-1 등), 기본 HQ
  // ↓ 선택값: 있으면 SKU upsert 시 함께 반영
  makerCode?: string;     // 엑셀 "Maker코드"
  name?: string;          // 엑셀 "코드명"
  reason?: string;
  ref?: string;
};

type Result =
  | { ok: true; modified: boolean; id?: string; note?: string }
  | { ok: false; error: string };

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private norm(s: any) { return String(s ?? '').trim(); }

  async setQuantity(input: SetQuantityInput): Promise<Result> {
    const code = this.norm(input.sku);
    const loc  = this.norm(input.location ?? 'HQ').toUpperCase();
    const qty  = Number(input.qty);

    if (!code) return { ok: false, error: 'sku(code) is required' };
    if (!Number.isFinite(qty)) return { ok: false, error: 'qty must be a number' };

    // 0) HQ Store 보장
    const store = await this.prisma.store.upsert({
      where: { code: 'HQ' },
      update: {},
      create: { code: 'HQ', name: 'Head Office' },
      select: { id: true },
    });

    // 1) SKU upsert (code 필수 + makerCode/name 선택 반영)
    const sku = await this.prisma.sku.upsert({
      where: { code },
      update: {
        // 값이 들어온 경우에만 업데이트 (undefined면 무시)
        makerCode: input.makerCode ? this.norm(input.makerCode) : undefined,
        name:      input.name ? this.norm(input.name) : undefined,
      },
      create: {
        code,
        makerCode: input.makerCode ? this.norm(input.makerCode) : undefined,
        name:      input.name ? this.norm(input.name) : undefined,
      },
      select: { id: true },
    });

    // 2) Location upsert (복합 유니크: storeId + code)
    const location = await this.prisma.location.upsert({
      where: { storeId_code: { storeId: store.id, code: loc } },
      update: {},
      create: {
        code: loc,
        store: { connect: { id: store.id } },
      },
      select: { id: true },
    });

    // 3) Inventory upsert (skuId + locationId 유니크)
    const existing = await this.prisma.inventory.findUnique({
      where: { skuId_locationId: { skuId: sku.id, locationId: location.id } },
    });

    if (existing) {
      if (existing.qty === qty) return { ok: true, modified: false, id: existing.id, note: 'no change' };
      const updated = await this.prisma.inventory.update({
        where: { id: existing.id },
        data: { qty },
        select: { id: true },
      });
      await this.prisma.inventoryTx.create({
        data: { skuId: sku.id, locationId: location.id, qty, type: 'set' },
      });
      return { ok: true, modified: true, id: updated.id };
    } else {
      const created = await this.prisma.inventory.create({
        data: { skuId: sku.id, locationId: location.id, qty },
        select: { id: true },
      });
      await this.prisma.inventoryTx.create({
        data: { skuId: sku.id, locationId: location.id, qty, type: 'set' },
      });
      return { ok: true, modified: true, id: created.id };
    }
  }
}
