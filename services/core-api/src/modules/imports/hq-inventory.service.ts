import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Desktop → /imports/hq-inventory 업로드 처리 결과를 DB에 반영하는 서비스
 *
 * HQ 스냅샷 정책 (DELETE_MISSING + DELETE_ZERO):
 * - (A) 엑셀에 없는 (location, sku) 인벤토리 row는 삭제
 * - (B) 엑셀에 있는 (location, sku)는 qty로 SET
 * - qty = 0 은 row를 남기지 않고 삭제 (깔끔 유지)
 */

export type HqRow = {
  sku: string;           // SKU 코드
  qty: number;           // 수량
  location?: string;     // 로케이션 코드
  makerCode?: string;
  name?: string;
  productType?: string;  // "SHOES" | "ACCESSORY" 등 (없으면 기본값)
};

type AggInfo = { qty: number; makerCode?: string; name?: string; productType?: string };

function normUpper(v: any) {
  return String(v ?? '').trim().toUpperCase();
}
function norm(v: any) {
  const s = String(v ?? '').trim();
  return s.length ? s : '';
}

function normalizeProductType(v: any): string | undefined {
  const raw = normUpper(v);
  if (!raw) return undefined;
  if (raw === 'SHOES' || raw === 'FOOTWEAR') return 'SHOES';
  if (raw === 'ACCESSORY' || raw === 'ACCESSORIES') return 'ACCESSORY';
  return undefined;
}

@Injectable()
export class HqInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * HQ 재고 업로드: "로케이션별로" 엑셀 기준 수량으로 완전히 맞춤 (스냅샷)
   */
  async replaceAll(rows: HqRow[]) {
    const cleanRows = Array.isArray(rows) ? rows : [];
    if (cleanRows.length <= 0) throw new BadRequestException('rows is empty');

    // ✅ HQ Store 확보 (seed 필요)
    const hqStore = await this.prisma.store.findFirst({
      where: { code: 'HQ' } as any,
      select: { id: true, code: true } as any,
    } as any);

    if (!hqStore) {
      throw new BadRequestException('HQ store not found (seed required)');
    }

    // locationCode → (skuCode → agg)
    const byLoc = new Map<string, Map<string, AggInfo>>();
    const uniqLocCodes: string[] = [];

    for (const r of cleanRows) {
      const skuCode = normUpper(r?.sku);
      if (!skuCode) continue;

      const locCode = normUpper(r?.location) || 'UNASSIGNED';
      const qty = Number(r?.qty ?? 0);
      if (!Number.isFinite(qty) || qty < 0) continue;

      const makerCode = norm(r?.makerCode) || undefined;
      const name = norm(r?.name) || undefined;
      const productType = normalizeProductType(r?.productType);

      if (!byLoc.has(locCode)) {
        byLoc.set(locCode, new Map());
        uniqLocCodes.push(locCode);
      }

      const skuMap = byLoc.get(locCode)!;
      const prev = skuMap.get(skuCode);

      if (!prev) {
        skuMap.set(skuCode, { qty, makerCode, name, productType });
      } else {
        skuMap.set(skuCode, {
          qty: Number(prev.qty ?? 0) + qty,
          makerCode: makerCode ?? prev.makerCode,
          name: name ?? prev.name,
          productType: productType ?? prev.productType,
        });
      }
    }

    let applied = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const locCode of uniqLocCodes) {
        const skuMap = byLoc.get(locCode)!;

        // ✅ location 확보 (storeId + code)
        let loc = await tx.location.findFirst({
          where: { storeId: hqStore.id, code: locCode } as any,
          select: { id: true, code: true } as any,
        } as any);

        if (!loc) {
          loc = await tx.location.create({
            data: { storeId: hqStore.id, code: locCode, name: locCode } as any,
            select: { id: true, code: true } as any,
          } as any);
        }

        /**
         * (A) 엑셀에 없는 SKU는 삭제 (HQ 스냅샷 정책)
         */
        const existingInv = await tx.inventory.findMany({
          where: { locationId: loc.id } as any,
          select: {
            id: true,
            qty: true,
            sku: { select: { sku: true } },
          } as any,
        } as any);

        const incomingSkuSet = new Set(Array.from(skuMap.keys()));
        for (const inv of existingInv as any[]) {
          const skuCode = normUpper(inv?.sku?.sku);
          if (!skuCode) continue;
          if (incomingSkuSet.has(skuCode)) continue;

          console.log('[HQ_DELETE_MISSING]', loc.code, inv?.sku?.sku, inv.id, inv.qty);

          await tx.inventory.delete({
            where: { id: inv.id } as any,
          } as any);
          applied++;
        }

        /**
         * (B) 엑셀 기준 최종 수량 SET
         *  - qty=0은 row를 남기지 않음(삭제)
         */
        for (const [skuCode, info] of skuMap.entries()) {
          const targetQty = Number(info?.qty ?? 0);
          if (!Number.isFinite(targetQty) || targetQty < 0) continue;

          const makerCode = info?.makerCode;
          const name = info?.name;
          const productType = normalizeProductType(info?.productType);

          // ✅ SKU 확보
          let sku = await tx.sku.findFirst({
            where: { sku: skuCode } as any,
          } as any);

          if (!sku) {
            sku = await tx.sku.create({
              data: {
                sku: skuCode,
                ...(makerCode ? { makerCode } : {}),
                ...(name ? { name } : {}),
                ...(productType ? { productType } : {}),
              } as any,
            } as any);
            applied++;
          } else {
            // 메타 업데이트(옵션)
            const updateData: any = {};
            if (makerCode && makerCode !== sku.makerCode) updateData.makerCode = makerCode;
            if (name && name !== sku.name) updateData.name = name;
            if (productType && productType !== (sku as any).productType) updateData.productType = productType;

            if (Object.keys(updateData).length > 0) {
              await tx.sku.update({
                where: { id: (sku as any).id } as any,
                data: updateData as any,
              } as any);
              applied++;
            }
          }

          // ✅ inventory upsert (location+sku)
          const inv = await tx.inventory.findFirst({
            where: { locationId: loc.id, skuId: (sku as any).id } as any,
            select: { id: true, qty: true } as any,
          } as any);

          // 🔥 qty=0이면 row를 남기지 않음
          if (targetQty === 0) {
            if (inv) {
              console.log('[HQ_DELETE_ZERO]', loc.code, skuCode, inv.id, inv.qty);
              await tx.inventory.delete({
                where: { id: inv.id } as any,
              } as any);
              applied++;
            }
            continue;
          }

          if (!inv) {
            await tx.inventory.create({
              data: {
                locationId: loc.id,
                skuId: (sku as any).id,
                qty: targetQty,
              } as any,
            } as any);
            applied++;
          } else {
            if (Number(inv.qty ?? 0) !== targetQty) {
              await tx.inventory.update({
                where: { id: inv.id } as any,
                data: { qty: targetQty } as any,
              } as any);
              applied++;
            }
          }
        }

        // ✅ 안전장치: 혹시 남아있는 qty=0 row는 정리
        await tx.inventory.deleteMany({
          where: { locationId: loc.id, qty: 0 } as any,
        } as any);
      }
    });

    return {
      ok: true,
      mode: 'HQ_REPLACE_ALL_DELETE_MISSING_DELETE_ZERO',
      storeCode: hqStore.code,
      locations: uniqLocCodes.length,
      applied,
      inputRows: rows.length,
    };
  }
}
