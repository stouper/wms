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

    const loc = await this.prisma.location.upsert({
      where: { storeId_code: { storeId: 0, code: locationCode } } as any,
      update: {} as any,
      create: { storeId: 0, code: locationCode } as any,
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
    const excludeForced = Boolean((params as any).excludeForced);

    const where: any = {};
    if (excludeForced) where.isForced = false;

    if (q) {
      where.OR = [
        { sku: { sku: { contains: q, mode: 'insensitive' } } as any },
        { sku: { makerCode: { contains: q, mode: 'insensitive' } } as any },
        { location: { code: { contains: q, mode: 'insensitive' } } as any },
      ];
    }

    // ✅ DB에서 직접 집계 (JS에서 tx를 더하지 않음)
    const grouped = await (this.prisma.inventoryTx as any).groupBy({
      by: ['skuId', 'locationId'],
      where,
      _sum: { qty: true },
    });

    const skuIds = Array.from(new Set(grouped.map((r: any) => r.skuId).filter(Boolean)));
    const locationIds = Array.from(new Set(grouped.map((r: any) => r.locationId).filter(Boolean)));

    const [skus, locations] = await Promise.all([
      this.prisma.sku.findMany({
        where: { id: { in: skuIds } as any } as any,
        select: { id: true, sku: true, makerCode: true, name: true } as any,
      } as any),
      this.prisma.location.findMany({
        where: { id: { in: locationIds } as any } as any,
        select: { id: true, code: true } as any,
      } as any),
    ]);

    const skuMap = new Map<string, any>(skus.map((s: any) => [String(s.id), s]));
    const locMap = new Map<string, any>(locations.map((l: any) => [String(l.id), l]));

    const rows = grouped
      .map((r: any) => {
        const s = skuMap.get(String(r.skuId));
        const l = locMap.get(String(r.locationId));
        const onHand = Number(r?._sum?.qty ?? 0);
        return {
          skuId: r.skuId ?? null,
          locationId: r.locationId ?? null,
          skuCode: s?.sku ?? null,
          makerCode: s?.makerCode ?? null,
          skuName: s?.name ?? null,
          name: s?.name ?? null,
          locationCode: l?.code ?? null,
          onHand,
        };
      })
      // sku/location이 깨진 레코드 방어
      .filter((x: any) => x.skuCode && x.locationCode);

    rows.sort((a: any, b: any) => {
      // 기존과 동일하게 skuCode 기준 정렬 유지 (+ locationCode)
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
}
