import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type HqRow = {
  sku: string;
  qty: number;
  location?: string;
  makerCode?: string;
  name?: string;
};

type HqSkuAgg =
  | { qty: number; makerCode?: string; name?: string }
  | { sku: any; targetQty: number; info: { makerCode?: string; name?: string } };

function normalizeAgg(v: HqSkuAgg | undefined) {
  if (!v) return { qty: 0, makerCode: undefined as string | undefined, name: undefined as string | undefined };
  if ((v as any).qty !== undefined) {
    const a = v as any;
    return { qty: Number(a.qty ?? 0), makerCode: a.makerCode, name: a.name };
  }
  const b = v as any;
  return { qty: Number(b.targetQty ?? 0), makerCode: b.info?.makerCode, name: b.info?.name };
}


@Injectable()
export class HqInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private normUpper(v: any) {
    return String(v ?? '').trim().toUpperCase();
  }

  private async getOrCreateHqStore() {
    // Store.code는 @unique (스키마 기준)
    const HQ_CODE = 'HQ';
    const store =
      (await this.prisma.store.findUnique({ where: { code: HQ_CODE } })) ??
      (await this.prisma.store.create({ data: { code: HQ_CODE, name: 'HQ' } as any }));
    return store;
  }

  /**
   * HQ 재고 업로드 (REPLACE ALL)
   * - HQ store에 귀속된 location만 사용
   * - Inventory.qty = 엑셀 최종 수량 (SET)
   * - InventoryTx에는 delta만 기록
   */
  async replaceAll(rows: HqRow[], opts?: { warehouseLocationCode?: string }) {
    if (!rows?.length) throw new BadRequestException('replaceAll: rows is empty');

    // location이 비어있을 때 사용할 기본 로케이션
    const fallbackLoc = this.normUpper(opts?.warehouseLocationCode) || 'RET-01';

    // ✅ HQ store 확보
    const hqStore = await this.getOrCreateHqStore();

    // ✅ 기본 로케이션(RET-01) 항상 보장 (Prisma 수동 작업 제거)
    await this.prisma.location.upsert({
      where: { storeId_code: { storeId: hqStore.id, code: 'RET-01' } },
      update: {},
      create: { storeId: hqStore.id, code: 'RET-01', name: null } as any,
    });


    /**
     * 1) location + sku 기준으로 rows 합산
     */
    const byLoc = new Map<string, Map<string, HqSkuAgg>>();

    for (const r of rows) {
      const sku = this.normUpper(r.sku);
      const loc = this.normUpper(r.location) || fallbackLoc;
      const qty = Number(r.qty ?? 0);

      if (!sku) continue;
      if (!loc) continue;
      if (!Number.isFinite(qty) || qty < 0) continue;

      if (!byLoc.has(loc)) byLoc.set(loc, new Map<string, HqSkuAgg>());
      const skuMap = byLoc.get(loc)!;

      const prev = skuMap.get(sku);
      if (!prev) {
        skuMap.set(sku, { qty, makerCode: r.makerCode, name: r.name });
      } else {
        const p = normalizeAgg(prev);
        skuMap.set(sku, {
          qty: p.qty + qty,
          makerCode: p.makerCode ?? r.makerCode,
          name: p.name ?? r.name,
        });
      }
    }

    // ✅ 업로드 파일에 없는 기존 로케이션도 전부 0으로 reset되도록 포함 (HQ 전체 스냅샷)
    const existingLocs = await this.prisma.location.findMany({
      where: { storeId: hqStore.id } as any,
      select: { code: true } as any,
    });
    const uniqLocCodes = Array.from(
      new Set<string>(['RET-01', ...existingLocs.map((l: any) => String(l.code)), ...byLoc.keys()]),
    ).map((c) => this.normUpper(c)).filter(Boolean);

    let applied = 0;

    /**
     * 2) location 단위 처리
     */
    for (const locCode of uniqLocCodes) {
      // ✅ Location은 storeId+code 유니크이므로 storeId_code로 upsert 가능
      const loc = await this.prisma.location.upsert({
        where: {
          storeId_code: { storeId: hqStore.id, code: locCode },
        },
        update: {},
        create: {
          storeId: hqStore.id,
          code: locCode,
          name: null,
        } as any,
      });

      const skuMap = byLoc.get(locCode) ?? new Map<string, HqSkuAgg>();

      await this.prisma.$transaction(async (tx) => {
        /**
         * (A) 기존 Inventory → 0으로 reset (HQ store의 해당 location만)
         */
        const existingInv = await tx.inventory.findMany({
          where: { locationId: loc.id },
          select: { skuId: true, qty: true },
        });

        for (const inv of existingInv) {
          const beforeQty = Number(inv.qty ?? 0);
          if (beforeQty === 0) continue;

          await tx.inventoryTx.create({
            data: {
              skuId: inv.skuId,
              locationId: loc.id,
              qty: -beforeQty,
              type: 'set',
              isForced: false,
              beforeQty,
              afterQty: 0,
            } as any,
          });

          await tx.inventory.update({
            where: { skuId_locationId: { skuId: inv.skuId, locationId: loc.id } },
            data: { qty: 0 },
          });

          applied++;
        }

        /**
         * (B) 엑셀 기준 최종 수량 SET
         */
        for (const [skuCode, info] of skuMap.entries()) {
          const nInfo = normalizeAgg(info);
          const targetQty = Number(nInfo.qty ?? 0);
          if (!Number.isFinite(targetQty) || targetQty < 0) continue;

          // SKU 확보 (sku 필드가 unique가 아닐 수 있으니 findFirst→create 시도→재조회 안전)
          let sku = await tx.sku.findFirst({ where: { sku: skuCode } as any });
          if (!sku) {
            try {
              sku = await tx.sku.create({
                data: {
                  sku: skuCode,
                  makerCode: nInfo.makerCode ?? null,
                  name: nInfo.name ?? null,
                } as any,
              });
            } catch (e) {
              sku = await tx.sku.findFirst({ where: { sku: skuCode } as any });
              if (!sku) throw e;
            }
          }

          const curInv = await tx.inventory.findUnique({
            where: { skuId_locationId: { skuId: sku.id, locationId: loc.id } },
            select: { qty: true },
          });

          const beforeQty = Number(curInv?.qty ?? 0);
          const delta = targetQty - beforeQty;

          // Inventory 최종 수량 SET
          await tx.inventory.upsert({
            where: { skuId_locationId: { skuId: sku.id, locationId: loc.id } },
            update: { qty: targetQty },
            create: { skuId: sku.id, locationId: loc.id, qty: targetQty },
          });

          // Tx는 delta만 기록
          if (delta !== 0) {
            await tx.inventoryTx.create({
              data: {
                skuId: sku.id,
                locationId: loc.id,
                qty: delta,
                type: 'set',
                isForced: false,
                beforeQty,
                afterQty: targetQty,
              } as any,
            });
          }

          applied++;
        }
      });
    }

    return {
      ok: true,
      mode: 'HQ_REPLACE_ALL_SET',
      storeCode: hqStore.code,
      locations: uniqLocCodes.length,
      applied,
      inputRows: rows.length,
    };
  }
}
