import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Desktop → /imports/hq-inventory 업로드 처리 결과를 DB에 반영하는 서비스
 *
 * HQ 스냅샷 정책 (DELETE_MISSING + DELETE_ZERO):
 * - (A) 엑셀에 없는 (location, sku) 인벤토리 row는 삭제
 * - (B) 엑셀에 있는 (location, sku)는 qty로 SET
 * - qty = 0 은 row를 남기지 않고 삭제 (깔끔 유지)
 *
 * ✅ 최적화: 배치 조회 + 벌크 작업으로 쿼리 수 최소화
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

function normalizeProductType(v: any) {
  const s = norm(v);
  if (!s) return undefined;
  const u = s.toUpperCase();
  if (u === 'SHOES' || u === 'SHOE') return 'SHOES';
  if (u === 'ACC' || u === 'ACCESSORY' || u === 'ACCESSORIES') return 'ACCESSORY';
  if (u === 'SET') return 'SET';
  return s;
}

@Injectable()
export class HqInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * HQ 인벤토리 "전체 교체" 반영 (최적화 버전)
   */
  async replaceAll(rows: HqRow[]) {
    if (!Array.isArray(rows) || rows.length <= 0) {
      throw new BadRequestException('rows is required');
    }

    // HQ store 찾기
    const hqStore = await this.prisma.store.findFirst({
      where: { isHq: true } as any,
      select: { id: true, code: true } as any,
    } as any);

    if (!hqStore) {
      throw new BadRequestException('본사 창고(isHq=true)가 등록되어 있지 않습니다.');
    }

    // ========================================
    // 1. 입력 데이터 정리 (location별 skuMap)
    // ========================================
    const byLoc = new Map<string, Map<string, HqSkuInfo>>();
    const allSkuCodes = new Set<string>();
    const allLocCodes = new Set<string>();

    for (const r of rows) {
      const skuCode = normUpper(r?.sku);
      if (!skuCode) continue;

      const locCode = normUpper(r?.location) || 'UNASSIGNED';
      const qty = Number(r?.qty ?? 0);
      if (!Number.isFinite(qty) || qty < 0) continue;

      allSkuCodes.add(skuCode);
      allLocCodes.add(locCode);

      if (!byLoc.has(locCode)) {
        byLoc.set(locCode, new Map());
      }

      const skuMap = byLoc.get(locCode)!;
      const prev = skuMap.get(skuCode);

      if (!prev) {
        skuMap.set(skuCode, {
          qty,
          makerCode: norm(r?.makerCode) || undefined,
          name: norm(r?.name) || undefined,
          productType: normalizeProductType(r?.productType),
        });
      } else {
        skuMap.set(skuCode, {
          qty: Number(prev.qty ?? 0) + qty,
          makerCode: norm(r?.makerCode) || prev.makerCode,
          name: norm(r?.name) || prev.name,
          productType: normalizeProductType(r?.productType) ?? prev.productType,
        });
      }
    }

    const uniqLocCodes = Array.from(allLocCodes);
    const uniqSkuCodes = Array.from(allSkuCodes);

    // 예외 로케이션: 재고는 항상 비움
    const KEEP_EMPTY_LOCATION_CODES = new Set(['UNASSIGNED', 'RET-01', 'DEFECT', 'HOLD']);

    let applied = 0;

    await this.prisma.$transaction(async (tx) => {
      // ========================================
      // 2. 기존 Location 일괄 조회 + 없으면 생성
      // ========================================
      const existingLocs = await tx.location.findMany({
        where: { storeId: hqStore.id } as any,
        select: { id: true, code: true } as any,
      } as any);

      const locMap = new Map<string, string>(); // code → id
      for (const loc of existingLocs as any[]) {
        locMap.set(normUpper(loc.code), loc.id);
      }

      // 필요한 Location 생성 (예외 로케이션 포함)
      const locsToCreate = [
        ...uniqLocCodes.filter(c => !locMap.has(c)),
        ...Array.from(KEEP_EMPTY_LOCATION_CODES).filter(c => !locMap.has(c)),
      ];
      const uniqueLocsToCreate = [...new Set(locsToCreate)];

      if (uniqueLocsToCreate.length > 0) {
        await tx.location.createMany({
          data: uniqueLocsToCreate.map(code => ({
            storeId: hqStore.id,
            code,
            name: code,
          })) as any,
          skipDuplicates: true,
        } as any);

        // 새로 생성된 Location 조회
        const newLocs = await tx.location.findMany({
          where: { storeId: hqStore.id, code: { in: uniqueLocsToCreate } } as any,
          select: { id: true, code: true } as any,
        } as any);

        for (const loc of newLocs as any[]) {
          locMap.set(normUpper(loc.code), loc.id);
        }
      }

      // ========================================
      // 3. 기존 SKU 일괄 조회 + 없으면 생성
      // ========================================
      const existingSkus = await tx.sku.findMany({
        where: { sku: { in: uniqSkuCodes } } as any,
        select: { id: true, sku: true, makerCode: true, name: true, productType: true } as any,
      } as any);

      const skuMap = new Map<string, any>(); // sku code → { id, makerCode, name, productType }
      for (const s of existingSkus as any[]) {
        skuMap.set(normUpper(s.sku), s);
      }

      // 새 SKU 생성
      const skusToCreate = uniqSkuCodes.filter(c => !skuMap.has(c));
      if (skusToCreate.length > 0) {
        // 메타 정보 수집
        const skuDataMap = new Map<string, HqSkuInfo>();
        for (const [locCode, locSkuMap] of byLoc.entries()) {
          for (const [skuCode, info] of locSkuMap.entries()) {
            if (!skuDataMap.has(skuCode)) {
              skuDataMap.set(skuCode, info);
            }
          }
        }

        await tx.sku.createMany({
          data: skusToCreate.map(code => {
            const info = skuDataMap.get(code);
            return {
              sku: code,
              makerCode: info?.makerCode,
              name: info?.name,
              productType: info?.productType,
            };
          }) as any,
          skipDuplicates: true,
        } as any);

        // 새로 생성된 SKU 조회
        const newSkus = await tx.sku.findMany({
          where: { sku: { in: skusToCreate } } as any,
          select: { id: true, sku: true, makerCode: true, name: true, productType: true } as any,
        } as any);

        for (const s of newSkus as any[]) {
          skuMap.set(normUpper(s.sku), s);
        }
        applied += skusToCreate.length;
      }

      // SKU 메타 업데이트 (배치)
      for (const [locCode, locSkuMap] of byLoc.entries()) {
        for (const [skuCode, info] of locSkuMap.entries()) {
          const existing = skuMap.get(skuCode);
          if (!existing) continue;

          const updateData: any = {};
          if (info.makerCode && info.makerCode !== existing.makerCode) updateData.makerCode = info.makerCode;
          if (info.name && info.name !== existing.name) updateData.name = info.name;
          if (info.productType && info.productType !== existing.productType) updateData.productType = info.productType;

          if (Object.keys(updateData).length > 0) {
            await tx.sku.update({
              where: { id: existing.id } as any,
              data: updateData as any,
            } as any);
            // 캐시 업데이트
            Object.assign(existing, updateData);
            applied++;
          }
        }
      }

      // ========================================
      // 4. HQ 전체 Inventory 삭제 후 새로 생성 (가장 빠른 방식)
      // ========================================

      // 4-1. HQ의 모든 Inventory 삭제
      await tx.inventory.deleteMany({
        where: {
          location: { storeId: hqStore.id },
        } as any,
      } as any);

      // 4-2. 새 Inventory 생성 (qty > 0인 것만)
      const inventoryToCreate: { locationId: string; skuId: string; qty: number }[] = [];

      for (const [locCode, locSkuMap] of byLoc.entries()) {
        // 예외 로케이션은 재고 생성 안함
        if (KEEP_EMPTY_LOCATION_CODES.has(locCode)) continue;

        const locId = locMap.get(locCode);
        if (!locId) continue;

        for (const [skuCode, info] of locSkuMap.entries()) {
          const targetQty = Number(info?.qty ?? 0);
          if (targetQty <= 0) continue; // qty=0은 생성 안함

          const sku = skuMap.get(skuCode);
          if (!sku) continue;

          inventoryToCreate.push({
            locationId: locId,
            skuId: sku.id,
            qty: targetQty,
          });
        }
      }

      if (inventoryToCreate.length > 0) {
        await tx.inventory.createMany({
          data: inventoryToCreate as any,
          skipDuplicates: true,
        } as any);
        applied += inventoryToCreate.length;
      }

    }, { timeout: 60000 }); // 60초 타임아웃

    return {
      ok: true,
      mode: 'HQ_REPLACE_ALL_OPTIMIZED',
      storeCode: hqStore.code,
      locations: uniqLocCodes.length,
      skus: uniqSkuCodes.length,
      applied,
      inputRows: rows.length,
    };
  }
}
