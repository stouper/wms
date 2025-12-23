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
  private clampLimit(n: number, min: number, max: number) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    return Math.max(min, Math.min(max, x));
  }

  /* -------------------- Store(HQ) -------------------- */

  private async getHqStore() {
    const store = await this.prisma.store.findFirst({
      where: { code: 'HQ' },
      select: { id: true, code: true },
    });
    if (!store) throw new NotFoundException('HQ Store not found. (Store.code="HQ")');
    return store;
  }

  /* -------------------- SKU -------------------- */

  private async resolveSku(input: { skuCode?: string | null; makerCode?: string | null; name?: string | null }) {
    const code = this.normUpper(input.skuCode ?? '');
    const maker = this.norm(input.makerCode ?? '');

    // 1) skuCode 우선
    if (code) {
      const found = await this.prisma.sku.findUnique({ where: { code } });
      if (found) {
        // 선택: 들어온 makerCode/name이 있으면 보강 업데이트
        const nextMaker = maker || null;
        const nextName = this.norm(input.name ?? '') || null;

        if (
          (nextMaker && (found as any).makerCode !== nextMaker) ||
          (nextName && (found as any).name !== nextName)
        ) {
          await this.prisma.sku.update({
            where: { id: found.id },
            data: {
              ...(nextMaker ? { makerCode: nextMaker } : {}),
              ...(nextName ? { name: nextName } : {}),
            } as any,
          });
        }
        return found;
      }

      // skuCode는 신규 생성 허용 (HQ 대량입고/마스터 보강용)
      return this.prisma.sku.create({
        data: {
          code,
          makerCode: maker ? maker : null,
          name: input.name ? this.norm(input.name) : null,
        } as any,
      });
    }

    // 2) skuCode가 없으면 makerCode로 조회만 (스캔 반품입고용)
    if (maker) {
      const list = await this.prisma.sku.findMany({
        where: { makerCode: maker },
        take: 2,
      });
      if (list.length === 0) throw new BadRequestException('SKU not found for makerCode');
      if (list.length > 1) throw new BadRequestException('Duplicate makerCode detected');
      return list[0];
    }

    throw new BadRequestException('skuCode or makerCode is required');
  }

  /* -------------------- Location -------------------- */

  private async resolveOrCreateLocationByCode(codeRaw: string) {
    const code = this.norm(codeRaw);
    if (!code) throw new BadRequestException('locationCode is required');

    const hq = await this.getHqStore();

    const found = await this.prisma.location.findFirst({
      where: { storeId: hq.id, code },
      select: { id: true, code: true },
    });
    if (found) return found;

    return this.prisma.location.create({
      data: { storeId: hq.id, code } as any,
      select: { id: true, code: true },
    });
  }

  /* -------------------- OnHand -------------------- */

  private async getOnHand(skuId: string, locationId: string) {
    const agg = await this.prisma.inventoryTx.aggregate({
      where: { skuId, locationId },
      _sum: { qty: true },
    });
    return Number(agg._sum.qty ?? 0);
  }

  /* =========================================================
     ✅ (복구) HQ 대량입고(imports)에서 쓰는 유틸 메서드들
     ========================================================= */

  // ✅ 특정 로케이션(들)의 재고를 0으로 리셋 (현재 onhand 만큼 반대방향 tx를 추가)
  async resetLocationsToZeroByCodes(params: { locationCodes: string[] }) {
    const locationCodes = (params.locationCodes || []).map((c) => this.norm(c)).filter(Boolean);
    if (locationCodes.length === 0) return { ok: true, locations: 0, touchedSkus: 0 };

    const hq = await this.getHqStore();

    const locations = await this.prisma.location.findMany({
      where: { storeId: hq.id, code: { in: locationCodes } },
      select: { id: true, code: true },
    });

    let touchedSkus = 0;

    for (const loc of locations) {
      const groups = await this.prisma.inventoryTx.groupBy({
        by: ['skuId'],
        where: { locationId: loc.id },
        _sum: { qty: true },
      });

      for (const g of groups) {
        const onHand = Number(g._sum.qty ?? 0);
        if (!onHand) continue;

        // 0으로 만들기 위해 -onHand 만큼 조정 tx 추가
        await this.prisma.inventoryTx.create({
          data: {
            skuId: g.skuId,
            locationId: loc.id,
            qty: -onHand,
            type: 'reset',
          } as any,
        });
        touchedSkus++;
      }
    }

    return { ok: true, locations: locations.length, touchedSkus };
  }

  // ✅ sku+location의 절대 수량을 qty로 "맞추기" (delta만큼 tx 추가)
  async setQuantity(params: { skuCode: string; locationCode: string; qty: number; makerCode?: string | null; name?: string | null; }) {
    const skuCode = this.normUpper(params.skuCode);
    const locationCode = this.norm(params.locationCode);
    const qty = Number(params.qty);

    if (!skuCode) throw new BadRequestException('skuCode is required');
    if (!locationCode) throw new BadRequestException('locationCode is required');
    if (!Number.isFinite(qty) || qty < 0) throw new BadRequestException('qty must be >= 0');

    const sku = await this.resolveSku({
      skuCode,
      makerCode: params.makerCode ?? null,
      name: params.name ?? null,
    });

    const loc = await this.resolveOrCreateLocationByCode(locationCode);
    const current = await this.getOnHand(sku.id, loc.id);
    const delta = qty - current;

    if (delta !== 0) {
      await this.prisma.inventoryTx.create({
        data: {
          skuId: sku.id,
          locationId: loc.id,
          qty: delta,
          type: 'set',
        } as any,
      });
    }

    const onHand = await this.getOnHand(sku.id, loc.id);
    return {
      ok: true,
      skuCode: sku.code,
      makerCode: (sku as any).makerCode ?? null,
      locationCode,
      changed: delta,
      onHand,
    };
  }

  // ✅ (복구) 코드 기반 onhand 조회 (컨트롤러에서 사용)
  async onHandByCodes(params: { skuCode: string; locationCode: string }) {
    const skuCode = this.normUpper(params.skuCode);
    const locationCode = this.norm(params.locationCode);

    if (!skuCode) throw new BadRequestException('skuCode is required');
    if (!locationCode) throw new BadRequestException('locationCode is required');

    const sku = await this.prisma.sku.findUnique({ where: { code: skuCode } });
    if (!sku) throw new NotFoundException('SKU not found');

    const hq = await this.getHqStore();
    const loc = await this.prisma.location.findFirst({ where: { storeId: hq.id, code: locationCode } });

    if (!loc) return { skuCode, locationCode, onHand: 0 };

    const onHand = await this.getOnHand(sku.id, loc.id);
    return { skuCode, locationCode, onHand };
  }

  /* -------------------- API -------------------- */

  async inbound(dto: InventoryInDto) {
    const skuCode = this.normUpper(dto.skuCode ?? '');
    const makerCode = this.norm((dto as any).makerCode ?? '');
    const locationCode = this.norm(dto.locationCode);
    const qty = Number(dto.qty);

    if (!locationCode) throw new BadRequestException('locationCode is required');
    if (!Number.isFinite(qty) || qty <= 0) throw new BadRequestException('qty must be > 0');
    if (!skuCode && !makerCode) throw new BadRequestException('skuCode or makerCode is required');

    const sku = await this.resolveSku({
      skuCode: skuCode || null,
      makerCode: makerCode || null,
      name: (dto as any).name ?? null,
    });

    const loc = await this.resolveOrCreateLocationByCode(locationCode);

    await this.prisma.inventoryTx.create({
      data: {
        skuId: sku.id,
        locationId: loc.id,
        qty: qty,
        type: 'in',
      } as any,
    });

    const onHand = await this.getOnHand(sku.id, loc.id);
    return {
      ok: true,
      skuCode: sku.code,
      makerCode: (sku as any).makerCode ?? null,
      locationCode,
      changed: qty,
      onHand,
    };
  }

  async out(dto: InventoryOutDto) {
    const skuCode = this.normUpper((dto as any).skuCode);
    const locationCode = this.norm((dto as any).locationCode);
    const qty = Number((dto as any).qty);

    if (!skuCode) throw new BadRequestException('skuCode is required');
    if (!locationCode) throw new BadRequestException('locationCode is required');
    if (!Number.isFinite(qty) || qty <= 0) throw new BadRequestException('qty must be > 0');

    const sku = await this.resolveSku({
      skuCode,
      makerCode: (dto as any).makerCode ?? null,
      name: (dto as any).name ?? null,
    });

    const loc = await this.resolveOrCreateLocationByCode(locationCode);

    await this.prisma.inventoryTx.create({
      data: {
        skuId: sku.id,
        locationId: loc.id,
        qty: -qty,
        type: 'out',
      } as any,
    });

    const onHand = await this.getOnHand(sku.id, loc.id);
    return { ok: true, skuCode, locationCode, changed: -qty, onHand };
  }

  async listTx(params: { q?: string; limit?: number }) {
    const q = this.norm(params.q ?? '');
    const take = this.clampLimit(params.limit ?? 200, 1, 1000);

    return this.prisma.inventoryTx.findMany({
      where: q
        ? {
            OR: [
              { sku: { code: { contains: q, mode: 'insensitive' } } as any },
              { sku: { makerCode: { contains: q, mode: 'insensitive' } } as any },
              { location: { code: { contains: q, mode: 'insensitive' } } as any },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' } as any,
      take,
      select: {
        id: true,
        qty: true,
        type: true,
        createdAt: true,
        sku: { select: { code: true, makerCode: true, name: true } },
        location: { select: { code: true } },
      },
    });
  }

  async summary(params: { q?: string; limit?: number }) {
    const q = this.norm(params.q ?? '');
    const take = this.clampLimit(params.limit ?? 200, 1, 2000);

    const list = await this.prisma.inventoryTx.findMany({
      where: q
        ? {
            OR: [
              { sku: { code: { contains: q, mode: 'insensitive' } } as any },
              { sku: { makerCode: { contains: q, mode: 'insensitive' } } as any },
              { location: { code: { contains: q, mode: 'insensitive' } } as any },
            ],
          }
        : undefined,
      take,
      select: {
        qty: true,
        skuId: true,
        locationId: true,
        sku: { select: { code: true, makerCode: true, name: true } },
        location: { select: { code: true } },
      },
    });

    const map = new Map<string, any>();
    for (const r of list as any[]) {
      const key = `${r.skuId}:${r.locationId}`;
      const cur = map.get(key) || {
        skuCode: r.sku?.code,
        makerCode: r.sku?.makerCode ?? null,
        name: r.sku?.name ?? null,
        locationCode: r.location?.code,
        onHand: 0,
      };
      cur.onHand += Number(r.qty ?? 0);
      map.set(key, cur);
    }

    return Array.from(map.values()).sort((a, b) => String(a.skuCode).localeCompare(String(b.skuCode)));
  }
}
