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
    return Math.max(min, Math.min(max, Math.floor(x)));
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
    const code = this.normUpper(input.skuCode);
    const makerCode = this.norm(input.makerCode);
    const name = this.norm(input.name);

    // 1) skuCode 우선
    if (code) {
      const found = await this.prisma.sku.findUnique({ where: { sku: code } });
      if (found) {
        // 선택: 들어온 makerCode/name이 있으면 보강 업데이트
        const data: any = {};
        if (makerCode && !found.makerCode) data.makerCode = makerCode;
        if (name && !found.name) data.name = name;
        if (Object.keys(data).length) {
          await this.prisma.sku.update({ where: { id: found.id }, data });
        }
        return found;
      }
    }

    // 2) makerCode로 찾기
    if (makerCode) {
      const found = await this.prisma.sku.findFirst({
        where: { makerCode },
        orderBy: { id: 'desc' } as any,
      });
      if (found) {
        // skuCode가 있으면 sku 필드도 보강(중복만 아니면)
        if (code && found.sku !== code) {
          // sku는 unique라 충돌나면 그냥 무시
          try {
            await this.prisma.sku.update({ where: { id: found.id }, data: { sku: code } as any });
          } catch {}
        }
        if (name && !found.name) {
          await this.prisma.sku.update({ where: { id: found.id }, data: { name } });
        }
        return found;
      }
    }

    // 3) 없으면 생성 (skuCode가 없으면 생성 불가)
    if (!code) throw new BadRequestException('skuCode is required to create sku');

    return this.prisma.sku.create({
      data: { sku: code, makerCode: makerCode || null, name: name || null } as any,
    });
  }

  /* -------------------- Location (HQ) -------------------- */

  private async resolveOrCreateLocationByCode(codeRaw: any) {
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

   // ✅ onHand는 Inventory.qty를 기준으로 (없으면 Tx 합산 fallback)
  private async getOnHand(skuId: string, locationId: string) {
  const inv = await this.prisma.inventory.findUnique({
    where: { skuId_locationId: { skuId, locationId } },
    select: { qty: true },
  });

  if (inv) return Number(inv.qty ?? 0);

  // fallback (초기/예외용)
  const agg = await this.prisma.inventoryTx.aggregate({
    where: { skuId, locationId, isForced: false },
    _sum: { qty: true },
  });
  return Number(agg._sum.qty ?? 0);
  }

  /* =========================================================
   * Inbound (IN)
   * ========================================================= */

  async in(dto: InventoryInDto) {
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

    const beforeQty = await this.getOnHand(sku.id, loc.id);

    const inv = await this.prisma.$transaction(async (tx) => {
  await tx.inventoryTx.create({
    data: {
      skuId: sku.id,
      locationId: loc.id,
      qty,
      type: 'in',
      isForced: false,
      beforeQty,
      afterQty: beforeQty + qty,
    } as any,
  });

  const invRow = await tx.inventory.upsert({
    where: {
      skuId_locationId: {
        skuId: sku.id,
        locationId: loc.id,
      },
    },
    update: {
      qty: { increment: qty },
    },
    create: {
      skuId: sku.id,
      locationId: loc.id,
      qty,
    },
  });

  return invRow; // ✅ 여기!
});

// ✅ 확정 로그 (잠깐만)
console.log('[INBOUND] skuId=', sku.id, 'locId=', loc.id, 'delta=', qty, 'inventoryQty=', inv.qty);

return { ok: true, skuCode, locationCode, changed: qty, onHand: inv.qty };

  }

  /* =========================================================
   * Bulk / Reset helpers (기존 로직 유지 + onHand는 forced 제외)
   * ========================================================= */

  async resetLocationsToZero(params: { locationCodes: string[] }) {
    const locationCodes = (params.locationCodes ?? []).map((x) => this.norm(x)).filter(Boolean);
    if (!locationCodes.length) throw new BadRequestException('locationCodes is required');

    const hq = await this.getHqStore();
    const locations = await this.prisma.location.findMany({
      where: { storeId: hq.id, code: { in: locationCodes } },
      select: { id: true, code: true },
    });

    let touchedSkus = 0;

    for (const loc of locations) {
      const groups = await this.prisma.inventoryTx.groupBy({
        by: ['skuId'],
        where: { locationId: loc.id, isForced: false },
        _sum: { qty: true },
      });

      for (const g of groups) {
        const onHand = Number(g._sum.qty ?? 0);
        if (!onHand) continue;

        // 0으로 만들기 위해 -onHand 만큼 조정 tx 추가 (forced 제외)
        await this.prisma.inventoryTx.create({
          data: {
            skuId: g.skuId,
            locationId: loc.id,
            qty: -onHand,
            type: 'adjust',
            isForced: false,
            beforeQty: onHand,
            afterQty: 0,
          } as any,
        });

        touchedSkus += 1;
      }
    }

    return { ok: true, locations: locations.length, touchedSkus };
  }

  /* =========================================================
   * Outbound (OUT) + FORCE
   * ========================================================= */

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

    // 현재 전산 재고(강제 출고 제외)
    const beforeQty = await this.getOnHand(sku.id, loc.id);

    // 재고가 충분하면 정상 출고 (전산 재고 차감)
    if (beforeQty >= qty) {
      await this.prisma.inventoryTx.create({
        data: {
          skuId: sku.id,
          locationId: loc.id,
          qty: -qty,
          type: 'out',
          isForced: false,
          beforeQty,
          afterQty: beforeQty - qty,
        } as any,
      });

      const onHand = await this.getOnHand(sku.id, loc.id);
      return { ok: true, skuCode, locationCode, changed: -qty, onHand, isForced: false };
    }

    // 재고 부족 → 강제 출고(전산 재고 0 유지) 옵션
    const force = Boolean((dto as any).force);
    const forceReason = this.norm((dto as any).forceReason);

    if (!force) {
      throw new BadRequestException(`재고 부족: onHand=${beforeQty}, 요청=${qty}`);
    }

    // ✅ 강제 출고: tx는 남기되, getOnHand 계산에서는 제외(isForced=true)
    await this.prisma.inventoryTx.create({
      data: {
        skuId: sku.id,
        locationId: loc.id,
        qty: -qty, // 로그용(-qty)으로 남기고, onHand 계산에서는 제외
        type: 'out',
        isForced: true,
        forcedReason: forceReason || 'FORCED_OUT',
        beforeQty,
        afterQty: beforeQty, // 전산 재고는 그대로(0 유지)
      } as any,
    });

    const onHand = await this.getOnHand(sku.id, loc.id);
    return { ok: true, skuCode, locationCode, changed: 0, forcedQty: qty, onHand, isForced: true };
  }

  /* =========================================================
   * Queries
   * ========================================================= */

  async listTx(params: { q?: string; limit?: number }) {
    const q = this.norm(params.q ?? '');
    const take = this.clampLimit(params.limit ?? 200, 1, 1000);

    return this.prisma.inventoryTx.findMany({
      where: q
        ? {
            OR: [
              { sku: { sku: { contains: q, mode: 'insensitive' } } as any },
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
        isForced: true,
        forcedReason: true,
        beforeQty: true,
        afterQty: true,
        createdAt: true,
        sku: { select: { sku: true, makerCode: true, name: true } },
        location: { select: { code: true } },
      },
    });
  }

  async summary(params: { q?: string; limit?: number }) {
    const q = this.norm(params.q ?? '');
    const take = this.clampLimit(params.limit ?? 200, 1, 2000);

    // ✅ summary/onHand는 강제출고 제외
    const where: any = { isForced: false };

    if (q) {
      where.OR = [
        { sku: { sku: { contains: q, mode: 'insensitive' } } as any },
        { sku: { makerCode: { contains: q, mode: 'insensitive' } } as any },
        { location: { code: { contains: q, mode: 'insensitive' } } as any },
      ];
    }

    const list = await this.prisma.inventoryTx.findMany({
      where,
      take,
      select: {
        qty: true,
        skuId: true,
        locationId: true,
        sku: { select: { sku: true, makerCode: true, name: true } },
        location: { select: { code: true } },
      },
    });

    const map = new Map<string, any>();
    for (const r of list as any[]) {
      const key = `${r.skuId}:${r.locationId}`;
      const cur = map.get(key) || {
        skuCode: r.sku?.sku,
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

    // =========================
  // Backward-compatible aliases
  // (기존 모듈들이 쓰던 메서드명 유지용)
  // =========================

  // 기존 imports/hq-inventory.service.ts에서 호출
  async resetLocationsToZeroByCodes(params: { locationCodes: string[] }) {
    return this.resetLocationsToZero(params);
  }

  // 기존 inventory.controller.ts에서 호출
  async inbound(dto: InventoryInDto) {
    return this.in(dto);
  }

  // 기존 inventory.controller.ts에서 호출
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

  // 기존 imports/hq-inventory.service.ts에서 호출
  // "절대 수량으로 세팅" (전산 재고를 qty로 맞춤)
  async setQuantity(params: {
    skuCode: string;
    locationCode: string;
    qty: number;
    makerCode?: string | null;
    name?: string | null;
    reason?: string | null;
  }) {
    const skuCode = this.normUpper(params.skuCode);
    const locationCode = this.norm(params.locationCode);
    const targetQty = Number(params.qty);

    if (!skuCode) throw new BadRequestException('skuCode is required');
    if (!locationCode) throw new BadRequestException('locationCode is required');
    if (!Number.isFinite(targetQty) || targetQty < 0) {
      throw new BadRequestException('qty must be >= 0');
    }

    const sku = await this.resolveSku({
      skuCode,
      makerCode: params.makerCode ?? null,
      name: params.name ?? null,
    });

    const loc = await this.resolveOrCreateLocationByCode(locationCode);

    // 현재 전산 재고(강제출고 제외)
    const beforeQty = await this.getOnHand(sku.id, loc.id);

    // 이미 같은 값이면 아무것도 안 함
    if (beforeQty === targetQty) {
      return { ok: true, skuCode, locationCode, changed: 0, onHand: beforeQty };
    }

    const diff = targetQty - beforeQty; // +면 증가, -면 감소

    // adjust 트랜잭션으로 절대수량 맞추기 (forced 제외)
    await this.prisma.inventoryTx.create({
      data: {
        skuId: sku.id,
        locationId: loc.id,
        qty: diff,
        type: 'adjust',
        isForced: false,
        forcedReason: null,
        beforeQty,
        afterQty: targetQty,
      } as any,
    });

    const onHand = await this.getOnHand(sku.id, loc.id);
    return { ok: true, skuCode, locationCode, changed: diff, onHand };
  }



}
