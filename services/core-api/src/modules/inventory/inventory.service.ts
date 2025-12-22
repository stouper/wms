import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryOutDto } from './dto/inventory-out.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private norm(v: any): string {
    return String(v ?? '').trim();
  }
  private normUpper(v: any): string {
    return this.norm(v).toUpperCase();
  }

  /* -------------------- SKU -------------------- */

  private async resolveSku(input: { skuCode: string; makerCode?: string | null; name?: string | null }) {
    const code = this.normUpper(input.skuCode);
    if (!code) throw new BadRequestException('skuCode is required');

    const found = await this.prisma.sku.findUnique({ where: { code } });
    if (found) return found;

    return this.prisma.sku.create({
      data: { code, makerCode: input.makerCode ?? null, name: input.name ?? null } as any,
    });
  }

  /* -------------------- Store(HQ) + Location -------------------- */

  private async getHqStore() {
    const store = await this.prisma.store.findFirst({
      where: { code: 'HQ' },
      select: { id: true, code: true },
    });
    if (!store) throw new NotFoundException('HQ Store not found. (Store.code="HQ")');
    return store;
  }

  private async resolveOrCreateLocationByCode(code: string) {
    const c = this.norm(code);
    if (!c) throw new BadRequestException('locationCode is required');

    const existing = await this.prisma.location.findFirst({ where: { code: c } });
    if (existing) return existing;

    const hq = await this.getHqStore();

    try {
      return await this.prisma.location.create({
        data: {
          code: c,
          store: { connect: { id: hq.id } }, // ✅ store 필수
        } as any,
      });
    } catch (e) {
      const again = await this.prisma.location.findFirst({ where: { code: c } });
      if (again) return again;
      throw e;
    }
  }

  private async getOnHand(skuId: string, locationId: string) {
    const agg = await this.prisma.inventoryTx.aggregate({
      where: { skuId, locationId },
      _sum: { qty: true },
    });
    return agg._sum.qty ?? 0;
  }

  /* -------------------- summary -------------------- */

  async summary(opts: { q?: string; limit: number }) {
    const keyword = opts.q?.trim();

    const grouped = await this.prisma.inventoryTx.groupBy({
      by: ['skuId', 'locationId'],
      _sum: { qty: true },
      _max: { createdAt: true },
      where: keyword
        ? ({
            OR: [
              { sku: { is: { code: { contains: keyword } } } },
              { sku: { is: { name: { contains: keyword } } } },
              { sku: { is: { makerCode: { contains: keyword } } } },
              { location: { is: { code: { contains: keyword } } } },
            ],
          } as any)
        : undefined,
    });

    const skuIds = grouped.map((g) => g.skuId);
    const locIds = grouped.map((g) => g.locationId);

    const [skus, locs] = await Promise.all([
      this.prisma.sku.findMany({ where: { id: { in: skuIds } } }),
      this.prisma.location.findMany({ where: { id: { in: locIds } } }),
    ]);

    const skuMap = new Map(skus.map((s) => [s.id, s]));
    const locMap = new Map(locs.map((l) => [l.id, l]));

    return grouped.map((g) => {
      const sku = skuMap.get(g.skuId);
      const loc = locMap.get(g.locationId);
      return {
        skuId: g.skuId,
        skuCode: sku?.code ?? null,
        skuName: sku?.name ?? null,
        makerCode: sku?.makerCode ?? null,
        locationId: g.locationId,
        locationCode: loc?.code ?? null,
        storeId: (loc as any)?.storeId ?? null,
        onHand: g._sum.qty ?? 0,
        lastTxAt: g._max.createdAt ?? null,
      };
    });
  }

  /* -------------------- listTx -------------------- */

  async listTx(opts: { q?: string; limit: number }) {
    const keyword = opts.q?.trim();
    const take = Math.max(1, Math.min(Number(opts.limit ?? 200), 1000));

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
      include: { sku: true, location: true },
    });
  }

  /* -------------------- reset: 여러 로케이션 -------------------- */

  async resetLocationsToZeroByCodes(input: { locationCodes: string[] }) {
    const codes = (input.locationCodes ?? []).map((c) => this.norm(c)).filter(Boolean);
    const uniq = Array.from(new Set(codes));
    if (uniq.length === 0) return { ok: true, deleted: 0, locations: 0 };

    const locs = [];
    for (const code of uniq) locs.push(await this.resolveOrCreateLocationByCode(code));
    const ids = locs.map((l) => l.id);

    const deleted = await this.prisma.inventoryTx.deleteMany({
      where: { locationId: { in: ids } },
    });

    return { ok: true, deleted: deleted.count, locations: ids.length };
  }

  /* -------------------- setQuantity -------------------- */

  async setQuantity(input: {
    sku: string;
    quantity: number;
    location: string;
    makerCode?: string | null;
    name?: string | null;
  }) {
    const skuCode = this.normUpper(input.sku);
    if (!skuCode) throw new BadRequestException('sku is required');

    const locationCode = this.norm(input.location);
    if (!locationCode) throw new BadRequestException('location is required');

    const sku = await this.resolveSku({
      skuCode,
      makerCode: input.makerCode ?? null,
      name: input.name ?? null,
    });

    const loc = await this.resolveOrCreateLocationByCode(locationCode);

    const target = Number(input.quantity);
    if (!Number.isFinite(target) || target < 0) {
      throw new BadRequestException('quantity must be >= 0');
    }

    const before = await this.getOnHand(sku.id, loc.id);
    const diff = target - before;

    if (diff === 0) return { ok: true, changed: false };

    await this.prisma.inventoryTx.create({
      data: { skuId: sku.id, locationId: loc.id, qty: diff, type: 'set' } as any,
    });

    return { ok: true, changed: true };
  }

  /* -------------------- out -------------------- */

  async out(dto: InventoryOutDto) {
    const skuCode = this.norm(dto.skuCode);
    if (!skuCode) throw new BadRequestException('skuCode is required');

    const locationCode = this.norm(dto.locationCode);
    if (!locationCode) throw new BadRequestException('locationCode is required');

    const sku = await this.resolveSku({ skuCode });
    const loc = await this.resolveOrCreateLocationByCode(locationCode);

    const qty = dto.qty ?? 1;
    const onHand = await this.getOnHand(sku.id, loc.id);

    if (onHand < qty) {
      throw new BadRequestException(`재고 부족: onHand=${onHand}, out=${qty}`);
    }

    await this.prisma.inventoryTx.create({
      data: { skuId: sku.id, locationId: loc.id, qty: -qty, type: 'out' } as any,
    });

    return { ok: true };
  }
}
