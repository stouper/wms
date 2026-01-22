import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryOutDto } from './dto/inventory-out.dto';
import { InventoryInDto } from './dto/inventory-in.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private norm(v: any): string {
    return String(v ?? '').trim();
  }

  private normUpper(v: any): string {
    return this.norm(v).toUpperCase();
  }

  private clampLimit(v: number, min: number, max: number) {
    const n = Number(v);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  private async resolveSku(params: { skuCode: string }) {
    const skuCode = this.normUpper(params.skuCode);
    if (!skuCode) throw new BadRequestException('skuCode is required');

    const sku = await this.prisma.sku.findFirst({
      where: { sku: skuCode } as any,
      select: { id: true, sku: true, makerCode: true, name: true } as any,
    } as any);

    if (!sku) throw new NotFoundException(`SKU not found: ${skuCode}`);
    return sku as any;
  }

  private async resolveOrCreateLocationByCode(code: string) {
    const locationCode = this.norm(code);
    if (!locationCode) throw new BadRequestException('locationCode is required');

    // HQ store 찾기
    const hqStore = await this.prisma.store.findFirst({
      where: { isHq: true } as any,
      select: { id: true } as any,
    } as any);
    if (!hqStore) throw new BadRequestException('본사 창고(isHq=true)가 등록되어 있지 않습니다.');

    const loc = await this.prisma.location.upsert({
      where: { storeId_code: { storeId: hqStore.id, code: locationCode } } as any,
      update: {} as any,
      create: { storeId: hqStore.id, code: locationCode } as any,
      select: { id: true, code: true } as any,
    } as any);

    return loc as any;
  }

  async getOnHand(skuId: string, locationId: string) {
    const inv = await this.prisma.inventory.findUnique({
      where: { skuId_locationId: { skuId, locationId } },
      select: { qty: true },
    });

    if (inv) return Number(inv.qty ?? 0);

    // fallback (초기/예외용)
    const agg = await this.prisma.inventoryTx.aggregate({
      where: { skuId, locationId },
      _sum: { qty: true },
    });

    return Number((agg as any)?._sum?.qty ?? 0);
  }

  private async applyInventoryTx(params: {
    skuId: string;
    locationId: string;
    qty: number;
    type: 'in' | 'out' | 'set';
    note?: string;
    isForced?: boolean;
  }) {
    const { skuId, locationId, qty, type } = params;
    const note = this.norm(params.note ?? '');
    const isForced = Boolean(params.isForced);

    // ✅ inventory upsert
    const inv = await this.prisma.inventory.upsert({
      where: { skuId_locationId: { skuId, locationId } },
      create: { skuId, locationId, qty } as any,
      update: { qty: { increment: qty } } as any,
      select: { qty: true } as any,
    } as any);

    const afterQty = Number((inv as any)?.qty ?? 0);
    const beforeQty = afterQty - Number(qty ?? 0);

    // ✅ tx insert
    await this.prisma.inventoryTx.create({
      data: {
        skuId,
        locationId,
        qty,
        type,
        note: note || null,
        beforeQty,
        afterQty,
        isForced,
      } as any,
    } as any);

    return { beforeQty, afterQty };
  }

  // ✅ 창고입고 (IN)
  async inbound(dto: InventoryInDto) {
    const skuCode = this.normUpper((dto as any).skuCode || (dto as any).sku);
    const qty = Number((dto as any).qty ?? 0);
    const locationCode = this.norm((dto as any).locationCode || (dto as any).location);

    if (!skuCode) throw new BadRequestException('skuCode is required');
    if (!Number.isFinite(qty) || qty <= 0) throw new BadRequestException('qty must be > 0');
    if (!locationCode) throw new BadRequestException('locationCode is required');

    const sku = await this.resolveSku({ skuCode });
    const loc = await this.resolveOrCreateLocationByCode(locationCode);

    const { beforeQty, afterQty } = await this.applyInventoryTx({
      skuId: sku.id,
      locationId: loc.id,
      qty,
      type: 'in',
      note: (dto as any).memo,
      isForced: false,
    });

    return {
      ok: true,
      sku: { id: sku.id, sku: sku.sku, makerCode: sku.makerCode, name: sku.name },
      location: { id: loc.id, code: loc.code },
      qty,
      beforeQty,
      afterQty,
    };
  }

  // ✅ 창고출고 (OUT) — 강제출고 옵션 포함
  async out(dto: InventoryOutDto) {
    const skuCode = this.normUpper((dto as any).skuCode || (dto as any).sku);
    const qty = Number((dto as any).qty ?? 0);
    const locationCode = this.norm((dto as any).locationCode || (dto as any).location);
    const force = Boolean((dto as any).force);
    const forceReason = this.norm((dto as any).forceReason || (dto as any).memo || '');

    if (!skuCode) throw new BadRequestException('skuCode is required');
    if (!Number.isFinite(qty) || qty <= 0) throw new BadRequestException('qty must be > 0');
    if (!locationCode) throw new BadRequestException('locationCode is required');

    const sku = await this.resolveSku({ skuCode });
    const loc = await this.resolveOrCreateLocationByCode(locationCode);

    const onHand = await this.getOnHand(sku.id, loc.id);
    if (!force && onHand < qty) {
      throw new BadRequestException(`not enough onHand. onHand=${onHand}, requested=${qty}`);
    }

    const { beforeQty, afterQty } = await this.applyInventoryTx({
      skuId: sku.id,
      locationId: loc.id,
      qty: -Math.abs(qty),
      type: 'out',
      note: force ? (forceReason || 'forced out') : (dto as any).memo,
      isForced: force,
    });

    return {
      ok: true,
      sku: { id: sku.id, sku: sku.sku, makerCode: sku.makerCode, name: sku.name },
      location: { id: loc.id, code: loc.code },
      qty: -Math.abs(qty),
      beforeQty,
      afterQty,
      forced: force,
    };
  }

  // ✅ 트랜잭션 목록 (감사용)
  async listTx(params: { q?: string; limit?: number }) {
    const q = this.norm(params.q ?? '');
    const take = this.clampLimit(params.limit ?? 200, 1, 2000);

    const where: any = {};

    if (q) {
      where.OR = [
        { sku: { sku: { contains: q, mode: 'insensitive' } } as any },
        { sku: { makerCode: { contains: q, mode: 'insensitive' } } as any },
        { location: { code: { contains: q, mode: 'insensitive' } } as any },
        { note: { contains: q, mode: 'insensitive' } } as any,
      ];
    }

    return this.prisma.inventoryTx.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' } as any,
      select: {
        id: true,
        skuId: true,
        locationId: true,
        qty: true,
        type: true,
        note: true,
        isForced: true,
        beforeQty: true,
        afterQty: true,
        createdAt: true,
        sku: { select: { sku: true, makerCode: true, name: true } },
        location: { select: { code: true } },
      },
    } as any);
  }

  /**
   * 창고재고(요약) — SKU + Location 단위 현재고.
   * - 기본: 강제출고(isForced) 포함 (현장/실재고 관점에서 음수도 보여야 함)
   * - 필요하면 excludeForced=true 로 제외 가능
   */
  async summary(params: { q?: string; limit?: number; excludeForced?: boolean; storeId?: string }) {
    const q = this.norm(params.q ?? '');
    const take = this.clampLimit(params.limit ?? 200, 1, 50000);
    const storeId = this.norm(params.storeId ?? '');
    // excludeForced는 InventoryTx 기반 집계에서 쓰던 옵션. Inventory 스냅샷 기반에서는 무시.
    // const excludeForced = Boolean((params as any).excludeForced);

    const where: any = {};

    // ✅ storeId 필터 (매장별 재고 조회)
    if (storeId) {
      where.location = { storeId };
    }

    if (q) {
      where.OR = [
        { sku: { sku: { contains: q, mode: 'insensitive' } } as any },
        { sku: { makerCode: { contains: q, mode: 'insensitive' } } as any },
        { sku: { name: { contains: q, mode: 'insensitive' } } as any },
        { location: { code: { contains: q, mode: 'insensitive' } } as any },
      ];
    }

    // ✅ Inventory 스냅샷(qty) 기준으로 현재고 반환
    const invRows = await this.prisma.inventory.findMany({
      where,
      take: 50000, // take는 정렬 후 slice
      select: {
        id: true,
        skuId: true,
        locationId: true,
        qty: true,
        sku: { select: { sku: true, makerCode: true, name: true, productType: true } } as any,
        location: { select: { code: true, storeId: true } } as any,
      },
    } as any);

    const rows = invRows
      .map((r: any) => ({
        skuId: r.skuId ?? null,
        locationId: r.locationId ?? null,
        skuCode: r?.sku?.sku ?? null,
        makerCode: r?.sku?.makerCode ?? null,
        skuName: r?.sku?.name ?? null,
        name: r?.sku?.name ?? null,
        productType: r?.sku?.productType ?? null,
        locationCode: r?.location?.code ?? null,
        onHand: Number(r?.qty ?? 0),
      }))
      .filter((x: any) => x.skuCode && x.locationCode);

    rows.sort((a: any, b: any) => {
      const c = String(a.skuCode).localeCompare(String(b.skuCode));
      if (c !== 0) return c;
      return String(a.locationCode).localeCompare(String(b.locationCode));
    });

    return rows.slice(0, take);
  }

  async onHandByCodes(params: { skuCode: string; locationCode: string }) {
    const skuCode = this.normUpper(params.skuCode);
    const locationCode = this.norm(params.locationCode);

    if (!skuCode) throw new BadRequestException('skuCode is required');
    if (!locationCode) throw new BadRequestException('locationCode is required');

    const sku = await this.resolveSku({ skuCode });
    const loc = await this.resolveOrCreateLocationByCode(locationCode);

    const onHand = await this.getOnHand(sku.id, loc.id);
    return { ok: true, skuCode, locationCode, onHand };
  }

  /**
   * 재고 검색 (매장별 SKU/MakerCode 검색)
   * - 단건 조정용 검색
   */
  async searchByCode(params: { storeCode: string; q: string }) {
    const storeCode = this.norm(params.storeCode);
    const q = this.norm(params.q);

    if (!storeCode) throw new BadRequestException('storeCode is required');
    if (!q) throw new BadRequestException('q (SKU or MakerCode) is required');

    // Store 조회
    const store = await this.prisma.store.findFirst({
      where: { code: storeCode } as any,
      select: { id: true, code: true } as any,
    }) as any;

    if (!store) throw new BadRequestException(`Store not found: ${storeCode}`);

    // SKU 검색 (SKU 코드 또는 MakerCode로)
    const qUpper = q.toUpperCase();
    const invRows = await this.prisma.inventory.findMany({
      where: {
        location: { storeId: store.id },
        OR: [
          { sku: { sku: { equals: qUpper, mode: 'insensitive' } } as any },
          { sku: { makerCode: { equals: q, mode: 'insensitive' } } as any },
        ],
      } as any,
      take: 10,
      select: {
        id: true,
        skuId: true,
        locationId: true,
        qty: true,
        sku: { select: { sku: true, makerCode: true, name: true } } as any,
        location: { select: { code: true } } as any,
      },
    } as any);

    const items = invRows.map((r: any) => ({
      skuId: r.skuId,
      locationId: r.locationId,
      skuCode: r?.sku?.sku ?? null,
      makerCode: r?.sku?.makerCode ?? null,
      skuName: r?.sku?.name ?? null,
      locationCode: r?.location?.code ?? null,
      onHand: Number(r?.qty ?? 0),
    }));

    return { ok: true, storeCode, q, items };
  }

  /**
   * 재고 일괄 설정 (Excel 업로드용)
   * - 기존 재고와 비교하여 차이만큼 조정 (type: 'set')
   */
  /**
   * 매장코드로 Location 조회/생성
   */
  private async resolveOrCreateLocationByStoreCode(storeCode: string, locationCode: string) {
    const storeCodeNorm = this.norm(storeCode);
    const locationCodeNorm = this.norm(locationCode);

    if (!storeCodeNorm) throw new BadRequestException('storeCode is required');
    if (!locationCodeNorm) throw new BadRequestException('locationCode is required');

    // Store 조회
    const store = await this.prisma.store.findFirst({
      where: { code: storeCodeNorm } as any,
      select: { id: true, code: true } as any,
    }) as any;

    if (!store) throw new BadRequestException(`Store not found: ${storeCodeNorm}`);

    // Location upsert
    const loc = await this.prisma.location.upsert({
      where: { storeId_code: { storeId: store.id, code: locationCodeNorm } } as any,
      update: {} as any,
      create: { storeId: store.id, code: locationCodeNorm } as any,
      select: { id: true, code: true } as any,
    } as any);

    return loc as any;
  }

  async bulkSet(params: {
    items: Array<{ storeCode: string; skuCode: string; locationCode: string; qty: number; memo?: string }>;
    sourceKey?: string;
  }) {
    const { items, sourceKey } = params;
    const results: Array<{
      storeCode: string;
      skuCode: string;
      locationCode: string;
      status: 'ok' | 'error' | 'skipped';
      message?: string;
      beforeQty?: number;
      afterQty?: number;
    }> = [];

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const item of items) {
      const storeCode = this.norm(item.storeCode);
      const skuCode = this.normUpper(item.skuCode);
      const locationCode = this.norm(item.locationCode);
      const targetQty = Number(item.qty ?? 0);
      const memo = this.norm(item.memo || sourceKey || 'bulk-set');

      if (!storeCode || !skuCode || !locationCode) {
        results.push({
          storeCode: item.storeCode,
          skuCode: item.skuCode,
          locationCode: item.locationCode,
          status: 'error',
          message: 'storeCode, skuCode, locationCode are required',
        });
        errorCount++;
        continue;
      }

      if (!Number.isFinite(targetQty) || targetQty < 0) {
        results.push({
          storeCode,
          skuCode,
          locationCode,
          status: 'error',
          message: 'qty must be >= 0',
        });
        errorCount++;
        continue;
      }

      try {
        // SKU 조회
        const skuRow = await this.prisma.sku.findFirst({
          where: { sku: skuCode } as any,
          select: { id: true } as any,
        }) as any;

        if (!skuRow) {
          results.push({
            storeCode,
            skuCode,
            locationCode,
            status: 'error',
            message: `SKU not found: ${skuCode}`,
          });
          errorCount++;
          continue;
        }

        const skuId = String(skuRow.id);

        // 매장코드로 Location 조회/생성
        const loc = await this.resolveOrCreateLocationByStoreCode(storeCode, locationCode);
        const locId = String(loc.id);

        // 현재 재고 조회
        const currentQty = await this.getOnHand(skuId, locId);

        // 변동량 계산
        const delta = targetQty - currentQty;

        if (delta === 0) {
          results.push({
            storeCode,
            skuCode,
            locationCode,
            status: 'skipped',
            message: 'no change needed',
            beforeQty: currentQty,
            afterQty: currentQty,
          });
          skippedCount++;
          continue;
        }

        // 재고 조정 적용
        const { beforeQty, afterQty } = await this.applyInventoryTx({
          skuId,
          locationId: locId,
          qty: delta,
          type: 'set',
          note: `[${storeCode}] ${memo} (${currentQty} -> ${targetQty})`,
          isForced: false,
        });

        results.push({
          storeCode,
          skuCode,
          locationCode,
          status: 'ok',
          beforeQty,
          afterQty,
        });
        successCount++;
      } catch (e: any) {
        results.push({
          storeCode,
          skuCode,
          locationCode,
          status: 'error',
          message: e?.message || String(e),
        });
        errorCount++;
      }
    }

    return {
      ok: true,
      total: items.length,
      success: successCount,
      error: errorCount,
      skipped: skippedCount,
      results,
    };
  }

  /**
   * 재고 초기화 (전체 교체)
   * - 엑셀 기준으로 해당 매장의 재고를 전체 교체
   * - 엑셀에 없는 재고는 삭제
   * - qty = 0은 row 삭제
   * - storeCode로 모든 매장 지원 (HQ 포함)
   */
  async reset(params: {
    storeCode: string;
    rows: Array<{
      sku: string;
      qty: number;
      location?: string;
      makerCode?: string;
      name?: string;
      productType?: string;
    }>;
  }) {
    const { storeCode, rows } = params;
    const storeCodeNorm = this.norm(storeCode);

    if (!storeCodeNorm) {
      throw new BadRequestException('storeCode is required');
    }
    if (!Array.isArray(rows) || rows.length <= 0) {
      throw new BadRequestException('rows is required');
    }

    // Store 찾기
    const store = await this.prisma.store.findFirst({
      where: { code: storeCodeNorm } as any,
      select: { id: true, code: true, isHq: true } as any,
    } as any) as any;

    if (!store) {
      throw new BadRequestException(`매장을 찾을 수 없습니다: ${storeCodeNorm}`);
    }

    // ========================================
    // 1. 입력 데이터 정리 (location별 skuMap)
    // ========================================
    type SkuInfo = {
      qty: number;
      makerCode?: string;
      name?: string;
      productType?: string;
    };

    const byLoc = new Map<string, Map<string, SkuInfo>>();
    const allSkuCodes = new Set<string>();
    const allLocCodes = new Set<string>();

    for (const r of rows) {
      const skuCode = this.normUpper(r?.sku);
      if (!skuCode) continue;

      const locCode = this.normUpper(r?.location) || 'UNASSIGNED';
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
          makerCode: this.norm(r?.makerCode) || undefined,
          name: this.norm(r?.name) || undefined,
          productType: this.normalizeProductType(r?.productType),
        });
      } else {
        skuMap.set(skuCode, {
          qty: Number(prev.qty ?? 0) + qty,
          makerCode: this.norm(r?.makerCode) || prev.makerCode,
          name: this.norm(r?.name) || prev.name,
          productType: this.normalizeProductType(r?.productType) ?? prev.productType,
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
        where: { storeId: store.id } as any,
        select: { id: true, code: true } as any,
      } as any);

      const locMap = new Map<string, string>(); // code → id
      for (const loc of existingLocs as any[]) {
        locMap.set(this.normUpper(loc.code), loc.id);
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
            storeId: store.id,
            code,
            name: code,
          })) as any,
          skipDuplicates: true,
        } as any);

        // 새로 생성된 Location 조회
        const newLocs = await tx.location.findMany({
          where: { storeId: store.id, code: { in: uniqueLocsToCreate } } as any,
          select: { id: true, code: true } as any,
        } as any);

        for (const loc of newLocs as any[]) {
          locMap.set(this.normUpper(loc.code), loc.id);
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
        skuMap.set(this.normUpper(s.sku), s);
      }

      // 새 SKU 생성
      const skusToCreate = uniqSkuCodes.filter(c => !skuMap.has(c));
      if (skusToCreate.length > 0) {
        // 메타 정보 수집
        const skuDataMap = new Map<string, SkuInfo>();
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
          skuMap.set(this.normUpper(s.sku), s);
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
      // 4. 해당 매장 전체 Inventory 삭제 후 새로 생성 (가장 빠른 방식)
      // ========================================

      // 4-1. 해당 매장의 모든 Inventory 삭제
      await tx.inventory.deleteMany({
        where: {
          location: { storeId: store.id },
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
      mode: 'INVENTORY_RESET',
      storeCode: store.code,
      locations: uniqLocCodes.length,
      skus: uniqSkuCodes.length,
      applied,
      inputRows: rows.length,
    };
  }

  private normalizeProductType(v: any): string | undefined {
    const s = this.norm(v);
    if (!s) return undefined;
    const u = s.toUpperCase();
    if (u === 'SHOES' || u === 'SHOE') return 'SHOES';
    if (u === 'ACC' || u === 'ACCESSORY' || u === 'ACCESSORIES') return 'ACCESSORY';
    if (u === 'SET') return 'SET';
    return s;
  }
}
