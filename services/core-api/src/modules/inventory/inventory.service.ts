import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryOutDto } from './dto/inventory-out.dto';

export type SetQuantityInput = {
  sku?: string;
  skuCode?: string;

  location?: string | null;
  locationCode?: string | null;

  storeId?: string | null;

  // 마스터 SKU 보강용
  makerCode?: string | null;
  name?: string | null;

  quantity?: number;
  qty?: number;

  reason?: string | null; // ✅ DB에 저장하지 않음
};

export type SetQuantityResult = {
  ok: boolean;
  modified: boolean;
  sku: { id: string; code: string; name: string | null; makerCode: string | null };
  locationId: string;
  before: number;
  after: number;
  change: number;
  txId?: string;
  message?: string;
};

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // -----------------------------
  // helpers
  // -----------------------------
  private norm(v?: string | null) {
    return (v ?? '').trim();
  }

  private normOrNull(v?: string | null) {
    const x = (v ?? '').trim();
    return x.length ? x : null;
  }

  private normSkuCode(v?: string | null) {
    return this.norm(v).toUpperCase();
  }

  private normMakerCode(v?: string | null) {
    return this.norm(v);
  }

  private clampLimit(n: number, def: number, max: number) {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return def;
    return Math.min(v, max);
  }

  /**
   * ✅ SKU 찾기: makerCode 우선 → 없으면 skuCode(code)
   */
  private async resolveSku(input: { skuCode?: string; makerCode?: string }) {
    const makerCode = input.makerCode ? this.normMakerCode(input.makerCode) : '';
    const skuCode = input.skuCode ? this.normSkuCode(input.skuCode) : '';

    if (!makerCode && !skuCode) {
      throw new BadRequestException('skuCode or makerCode is required');
    }

    if (makerCode) {
      const sku = await this.prisma.sku.findFirst({
        where: { makerCode },
        select: { id: true, code: true, name: true, makerCode: true },
      });
      if (!sku) throw new NotFoundException(`SKU not found by makerCode: ${makerCode}`);
      return sku;
    }

    const sku = await this.prisma.sku.findUnique({
      where: { code: skuCode },
      select: { id: true, code: true, name: true, makerCode: true },
    });
    if (!sku) throw new NotFoundException(`SKU not found: ${skuCode}`);
    return sku;
  }

  /**
   * ✅ Location code는 unique가 아닐 수 있어 findFirst
   */
  private async resolveLocationByCode(locationCode: string, storeId?: string | null) {
    const loc = await this.prisma.location.findFirst({
      where: storeId ? ({ code: locationCode, storeId } as any) : ({ code: locationCode } as any),
      select: { id: true, code: true },
    });
    if (!loc) throw new NotFoundException(`Location not found: ${storeId ? `${storeId}/` : ''}${locationCode}`);
    return loc;
  }

  private async getOnHand(skuId: string, locationId: string) {
    const agg = await this.prisma.inventoryTx.aggregate({
      where: { skuId, locationId },
      _sum: { qty: true },
    });
    return agg._sum.qty ?? 0;
  }

  // -----------------------------
  // TX list (옵션)
  // -----------------------------
  async listTx(opts: { q?: string; limit: number }) {
    const take = this.clampLimit(opts.limit, 50, 200);
    const keyword = opts.q?.trim();

    return this.prisma.inventoryTx.findMany({
      take,
      orderBy: { createdAt: 'desc' },
      where: keyword
        ? ({
            OR: [
              { type: { contains: keyword } },
              { sku: { is: { code: { contains: keyword } } } },
              { sku: { is: { name: { contains: keyword } } } },
              { sku: { is: { makerCode: { contains: keyword } } } },
              { location: { is: { code: { contains: keyword } } } },
            ],
          } as any)
        : undefined,
      include: {
        sku: { select: { code: true, name: true, makerCode: true } },
        location: { select: { code: true } },
      } as any,
    });
  }

  // -----------------------------
  // Summary (sku/location별 재고 합)
  // -----------------------------
  async summary(opts: { q?: string; limit: number }) {
    const take = this.clampLimit(opts.limit, 200, 1000);
    const keyword = opts.q?.trim();

    const grouped = await this.prisma.inventoryTx.groupBy({
      by: ['skuId', 'locationId'],
      _sum: { qty: true },
      _max: { createdAt: true },
      where: keyword
        ? ({
            OR: [
              { type: { contains: keyword } },
              { sku: { is: { code: { contains: keyword } } } },
              { sku: { is: { name: { contains: keyword } } } },
              { sku: { is: { makerCode: { contains: keyword } } } },
              { location: { is: { code: { contains: keyword } } } },
            ],
          } as any)
        : undefined,
      orderBy: [{ skuId: 'asc' }, { locationId: 'asc' }],
      take,
    } as any);

    if (!grouped.length) return [];

    const skuIds = Array.from(new Set((grouped as any[]).map((g) => g.skuId)));
    const locationIds = Array.from(
      new Set((grouped as any[]).map((g) => g.locationId).filter(Boolean) as string[]),
    );

    const [skus, locations] = await this.prisma.$transaction([
      this.prisma.sku.findMany({
        where: { id: { in: skuIds } },
        select: { id: true, code: true, name: true, makerCode: true },
      }),
      this.prisma.location.findMany({
        where: { id: { in: locationIds } },
        select: { id: true, code: true, storeId: true },
      }),
    ]);

    const skuMap = new Map(skus.map((s) => [s.id, s]));
    const locMap = new Map(locations.map((l) => [l.id, l]));

    return (grouped as any[]).map((g) => {
      const sku = skuMap.get(g.skuId) ?? null;
      const loc = g.locationId ? locMap.get(g.locationId) ?? null : null;

      return {
        skuId: g.skuId,
        skuCode: sku?.code ?? null,
        skuName: sku?.name ?? null,
        makerCode: sku?.makerCode ?? null,

        locationId: g.locationId,
        locationCode: loc?.code ?? null,
        storeId: loc?.storeId ?? null,

        onHand: g._sum?.qty ?? 0,
        lastTxAt: g._max?.createdAt ?? null,
      };
    });
  }

  // -----------------------------
  // setQuantity (엑셀 업로드/초기화용)
  // -----------------------------
  async setQuantity(input: SetQuantityInput): Promise<SetQuantityResult> {
    const skuCode = this.normSkuCode(input.skuCode ?? input.sku ?? '');
    if (!skuCode) throw new BadRequestException('setQuantity: skuCode is required');

    const locationCode = this.normOrNull(input.locationCode ?? input.location ?? null);
    if (!locationCode) throw new BadRequestException('setQuantity: locationCode is required');

    const rawQty = input.quantity ?? input.qty;
    const targetQty = Number(rawQty);
    if (!Number.isFinite(targetQty) || targetQty < 0) {
      throw new BadRequestException('setQuantity: quantity must be a number >= 0');
    }

    return this.prisma.$transaction(async (tx) => {
      const sku = await tx.sku.findUnique({
        where: { code: skuCode },
        select: { id: true, code: true, name: true, makerCode: true },
      });
      if (!sku) throw new NotFoundException(`SKU not found: ${skuCode}`);

      // 마스터 SKU 보강
      const nextMaker = this.normOrNull(input.makerCode ?? null);
      const nextName = this.normOrNull(input.name ?? null);
      if (nextMaker || nextName) {
        await tx.sku.update({
          where: { id: sku.id },
          data: {
            ...(nextMaker ? { makerCode: nextMaker } : {}),
            ...(nextName ? { name: nextName } : {}),
          } as any,
        });
      }

      const storeId = this.normOrNull(input.storeId ?? null);
      const loc = await this.resolveLocationByCode(locationCode, storeId);

      const before = await this.getOnHand(sku.id, loc.id);
      const change = targetQty - before;

      if (change === 0) {
        return {
          ok: true,
          modified: false,
          sku,
          locationId: loc.id,
          before,
          after: before,
          change: 0,
          message: 'no change',
        };
      }

      const created = await tx.inventoryTx.create({
        data: {
          skuId: sku.id,
          locationId: loc.id,
          qty: change,
          type: 'set' as any,
        } as any,
        select: { id: true },
      });

      return {
        ok: true,
        modified: true,
        sku,
        locationId: loc.id,
        before,
        after: before + change,
        change,
        txId: created.id,
      };
    });
  }

  // -----------------------------
  // out (출고): ✅ tx에 sku/location 포함해서 프론트에서 makerCode 보이게
  // -----------------------------
  async out(dto: InventoryOutDto) {
    const qty = dto.qty ?? 1;
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new BadRequestException('out: qty must be a positive integer');
    }

    const sku = await this.resolveSku({
      skuCode: dto.skuCode,
      makerCode: dto.makerCode,
    });

    const requestedLocationCode = this.normOrNull(dto.locationCode ?? null);

    // 1) 요청 location 우선
    if (requestedLocationCode) {
      const loc = await this.resolveLocationByCode(requestedLocationCode, null);
      const current = await this.getOnHand(sku.id, loc.id);

      if (current >= qty) {
        const created: any = await this.prisma.inventoryTx.create({
          data: {
            skuId: sku.id,
            locationId: loc.id,
            qty: -qty,
            type: 'out' as any,
          } as any,
          include: {
            sku: { select: { code: true, makerCode: true, name: true } },
            location: { select: { code: true } },
          },
        } as any);

        return {
          ok: true,
          before: current,
          after: current - qty,
          requestedLocationCode,
          usedLocationCode: created?.location?.code ?? requestedLocationCode,
          tx: created,
        };
      }
      // 부족하면 자동 폴백
    }

    // 2) 자동 폴백 (재고 가능한 location 선택)
    const candidates = await this.prisma.inventoryTx.groupBy({
      by: ['locationId'],
      where: { skuId: sku.id },
      _sum: { qty: true },
    } as any);

    const filtered = (candidates as any[])
      .filter((c) => !!c.locationId)
      .sort((a, b) => (b._sum?.qty ?? 0) - (a._sum?.qty ?? 0));

    const pick = filtered.find((c) => (c._sum?.qty ?? 0) >= qty);

    if (!pick || !pick.locationId) {
      const total = filtered.reduce((acc, c) => acc + (c._sum?.qty ?? 0), 0);
      throw new BadRequestException(
        `Insufficient stock. total=${total}, requested=${qty}${
          requestedLocationCode ? ` (requestedLocation=${requestedLocationCode})` : ''
        }`,
      );
    }

    const location = await this.prisma.location.findUnique({
      where: { id: pick.locationId },
      select: { id: true, code: true },
    });
    if (!location) throw new NotFoundException(`Location not found by id: ${pick.locationId}`);

    const before = pick._sum?.qty ?? 0;

    const created: any = await this.prisma.inventoryTx.create({
      data: {
        skuId: sku.id,
        locationId: location.id,
        qty: -qty,
        type: 'out' as any,
      } as any,
      include: {
        sku: { select: { code: true, makerCode: true, name: true } },
        location: { select: { code: true } },
      },
    } as any);

    return {
      ok: true,
      before,
      after: before - qty,
      requestedLocationCode,
      usedLocationCode: created?.location?.code ?? location.code,
      tx: created,
    };
  }
}
