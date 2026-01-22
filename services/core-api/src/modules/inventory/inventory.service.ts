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
    memo?: string;
    isForced?: boolean;
  }) {
    const { skuId, locationId, qty, type } = params;
    const memo = this.norm(params.memo ?? '');
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
        memo: memo || null,
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
      memo: (dto as any).memo,
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
      memo: force ? (forceReason || 'forced out') : (dto as any).memo,
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
        { memo: { contains: q, mode: 'insensitive' } } as any,
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
        memo: true,
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
  async summary(params: { q?: string; limit?: number; excludeForced?: boolean }) {
    const q = this.norm(params.q ?? '');
    const take = this.clampLimit(params.limit ?? 200, 1, 50000);
    // excludeForced는 InventoryTx 기반 집계에서 쓰던 옵션. Inventory 스냅샷 기반에서는 무시.
    // const excludeForced = Boolean((params as any).excludeForced);

    const where: any = {};
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
        location: { select: { code: true } } as any,
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
   * 재고 일괄 설정 (Excel 업로드용)
   * - 기존 재고와 비교하여 차이만큼 조정 (type: 'set')
   */
  async bulkSet(params: {
    items: Array<{ skuCode: string; locationCode: string; qty: number; memo?: string }>;
    sourceKey?: string;
  }) {
    const { items, sourceKey } = params;
    const results: Array<{
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
      const skuCode = this.normUpper(item.skuCode);
      const locationCode = this.norm(item.locationCode);
      const targetQty = Number(item.qty ?? 0);
      const memo = this.norm(item.memo || sourceKey || 'bulk-set');

      if (!skuCode || !locationCode) {
        results.push({
          skuCode: item.skuCode,
          locationCode: item.locationCode,
          status: 'error',
          message: 'skuCode and locationCode are required',
        });
        errorCount++;
        continue;
      }

      if (!Number.isFinite(targetQty) || targetQty < 0) {
        results.push({
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
            skuCode,
            locationCode,
            status: 'error',
            message: `SKU not found: ${skuCode}`,
          });
          errorCount++;
          continue;
        }

        const skuId = String(skuRow.id);

        // Location 조회/생성
        const loc = await this.resolveOrCreateLocationByCode(locationCode);
        const locId = String(loc.id);

        // 현재 재고 조회
        const currentQty = await this.getOnHand(skuId, locId);

        // 변동량 계산
        const delta = targetQty - currentQty;

        if (delta === 0) {
          results.push({
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
          memo: `${memo} (${currentQty} -> ${targetQty})`,
          isForced: false,
        });

        results.push({
          skuCode,
          locationCode,
          status: 'ok',
          beforeQty,
          afterQty,
        });
        successCount++;
      } catch (e: any) {
        results.push({
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
}
