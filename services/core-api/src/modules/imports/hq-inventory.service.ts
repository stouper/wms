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
  sku: string; // SKU 코드
  qty: number; // 수량
  location?: string; // 로케이션 코드
  makerCode?: string; // 바코드/메이커코드
  name?: string; // 상품명
  productType?: string; // 상품구분
};

type HqSkuInfo = {
  qty: number;
  makerCode?: string;
  name?: string;
  productType?: string;
};

function norm(v: any) {
  const s = String(v ?? '').trim();
  return s.length ? s : '';
}
function normUpper(v: any) {
  return norm(v).toUpperCase();
}

// 프로젝트 기존 normalize가 있다면 거기 로직을 그대로 쓰는게 최선인데,
// 현재 파일 기준으로는 이 함수만 필요
function normalizeProductType(v: any) {
  const s = norm(v);
  if (!s) return undefined;
  const u = s.toUpperCase();
  if (u === 'SHOES' || u === 'SHOE') return 'SHOES';
  if (u === 'ACC' || u === 'ACCESSORY' || u === 'ACCESSORIES') return 'ACCESSORY';
  if (u === 'SET') return 'SET';
  return s; // 원본 유지
}

@Injectable()
export class HqInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * HQ 인벤토리 "전체 교체" 반영
   * - location 단위 스냅샷: 엑셀에 없는 SKU는 삭제
   * - qty=0은 row를 남기지 않음
   *
   * + (B안 강화) store 전체 스냅샷:
   * - 엑셀에 없는 로케이션의 재고는 전부 삭제
   * - 단, UNASSIGNED / RET-01 은 로케이션만 유지하고 재고는 항상 비움
   */
  async replaceAll(rows: HqRow[]) {
    if (!Array.isArray(rows) || rows.length <= 0) {
      throw new BadRequestException('rows is required');
    }

    // HQ store 찾기 (isHq: true 기준)
    const hqStore = await this.prisma.store.findFirst({
      where: { isHq: true } as any,
      select: { id: true, code: true } as any,
    } as any);

    if (!hqStore) {
      throw new BadRequestException('본사 창고(isHq=true)가 등록되어 있지 않습니다.');
    }

    // location별 skuMap 구성
    const byLoc = new Map<string, Map<string, HqSkuInfo>>();
    const uniqLocCodes: string[] = [];

    for (const r of rows) {
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

      // 같은 (loc, sku)가 여러 줄로 오면 합산
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

    // ✅ 예외 로케이션: 로케이션은 유지하되, 재고(Inventory)는 항상 비워둠
    const KEEP_EMPTY_LOCATION_CODES = new Set(['UNASSIGNED', 'RET-01']);

    await this.prisma.$transaction(async (tx) => {
      // ✅ (B안) HQ 전체 스냅샷 정책:
      //  - 엑셀에 없는 로케이션의 재고는 전부 삭제
      //  - 단, UNASSIGNED / RET-01 은 '로케이션만 유지'하고 '재고는 항상 0개(삭제)'로 유지
      //
      // 1) UNASSIGNED / RET-01 Location 확보(없으면 생성)
      for (const code of Array.from(KEEP_EMPTY_LOCATION_CODES)) {
        const existing = await tx.location.findFirst({
          where: { storeId: hqStore.id, code } as any,
          select: { id: true, code: true } as any,
        } as any);

        if (!existing) {
          await tx.location.create({
            data: { storeId: hqStore.id, code, name: code } as any,
            select: { id: true, code: true } as any,
          } as any);
        }
      }

      // 2) UNASSIGNED / RET-01 내부 재고는 무조건 비움
      await tx.inventory.deleteMany({
        where: {
          location: {
            storeId: hqStore.id,
            code: { in: Array.from(KEEP_EMPTY_LOCATION_CODES) },
          },
        } as any,
      } as any);

      // 3) 엑셀에 없는 로케이션의 재고는 전부 삭제 (예외 로케이션 제외)
      await tx.inventory.deleteMany({
        where: {
          location: {
            storeId: hqStore.id,
            AND: [
              { code: { notIn: uniqLocCodes } },
              { code: { notIn: Array.from(KEEP_EMPTY_LOCATION_CODES) } },
            ],
          },
        } as any,
      } as any);

      for (const locCode of uniqLocCodes) {
        // ✅ 예외 로케이션은 로케이션만 유지하고 재고는 항상 비우므로, 업로드로 갱신하지 않음
        if (KEEP_EMPTY_LOCATION_CODES.has(locCode)) continue;

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
         * (A) 엑셀에 없는 SKU는 삭제 (location 단위 스냅샷 정책)
         */
        const existingInv = await tx.inventory.findMany({
          where: { locationId: (loc as any).id } as any,
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

          console.log('[HQ_DELETE_MISSING]', (loc as any).code, inv?.sku?.sku, inv.id, inv.qty);

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
            if (makerCode && makerCode !== (sku as any).makerCode) updateData.makerCode = makerCode;
            if (name && name !== (sku as any).name) updateData.name = name;
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
            where: { locationId: (loc as any).id, skuId: (sku as any).id } as any,
            select: { id: true, qty: true } as any,
          } as any);

          // 🔥 qty=0이면 row를 남기지 않음
          if (targetQty === 0) {
            if (inv) {
              console.log('[HQ_DELETE_ZERO]', (loc as any).code, skuCode, inv.id, inv.qty);
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
                locationId: (loc as any).id,
                skuId: (sku as any).id,
                qty: targetQty,
              } as any,
            } as any);
            applied++;
          } else {
            if (Number((inv as any).qty ?? 0) !== targetQty) {
              await tx.inventory.update({
                where: { id: (inv as any).id } as any,
                data: { qty: targetQty } as any,
              } as any);
              applied++;
            }
          }
        }

        // ✅ 안전장치: 혹시 남아있는 qty=0 row는 정리
        await tx.inventory.deleteMany({
          where: { locationId: (loc as any).id, qty: 0 } as any,
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
