import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type SetQuantityInput = {
  sku?: string;
  location?: string | null;
  storeId?: string | null;
  makerCode?: string | null;
  name?: string | null;
  barcode?: string | null;
  reason?: string | null;

  skuCode?: string;
  locationCode?: string | null;

  quantity?: number;
  qty?: number;

  // 아래는 imports가 넘길 수 있어서 "받기만" (DB에 저장 안 함)
  source?: string;
  refType?: string;
  refId?: string;
};

export type SetQuantityResult = {
  ok: boolean;
  modified: boolean;
  sku: { id: string; code: string; name: string | null };
  locationId: string | null;
  before: number;
  after: number;
  change: number;
  txId?: string;
  message?: string;
};

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listTx(opts: { q?: string; limit: number }) {
    const { q, limit } = opts;

    return this.prisma.inventoryTx.findMany({
      take: Math.min(limit || 50, 200),
      orderBy: { createdAt: 'desc' },
      where: q
        ? {
            sku: {
              is: {
                OR: [{ code: { contains: q } }, { name: { contains: q } }],
              },
            },
          }
        : undefined,
      include: {
        sku: { select: { code: true, name: true } },
        location: { select: { code: true } },
      },
    });
  }

  async setQuantity(input: SetQuantityInput): Promise<SetQuantityResult> {
    const skuCode = (input.sku ?? input.skuCode ?? '').trim();
    if (!skuCode) throw new BadRequestException('sku (or skuCode) is required');

    const rawQty = input.quantity ?? input.qty;
    if (rawQty == null || Number.isNaN(Number(rawQty))) {
      throw new BadRequestException('quantity (or qty) is required');
    }
    const targetQty = Math.floor(Number(rawQty));

    const locationCode = (input.location ?? input.locationCode ?? '').trim();
    const storeId = (input.storeId ?? '').trim();

    const sku = await this.prisma.sku.findUnique({
      where: { code: skuCode },
      select: { id: true, code: true, name: true },
    });
    if (!sku) throw new NotFoundException(`SKU not found: ${skuCode}`);

    let locationId: string | null = null;
    if (locationCode) {
      // Location은 code 단독 unique가 아니라서 findFirst 사용
      const loc = await this.prisma.location.findFirst({
        where: {
          code: locationCode,
          ...(storeId ? { storeId } : {}),
        } as any,
        select: { id: true, code: true },
      });
      if (!loc) {
        throw new NotFoundException(
          `Location not found: ${storeId ? `${storeId}/` : ''}${locationCode}`,
        );
      }
      locationId = loc.id;
    }

    // 현재 수량 = Tx 합계
    const agg = await this.prisma.inventoryTx.aggregate({
      _sum: { qty: true },
      where: {
        skuId: sku.id,
        ...(locationId ? { locationId } : {}),
      },
    });

    const before = agg._sum.qty ?? 0;
    const change = targetQty - before;

    if (change === 0) {
      return {
        ok: true,
        modified: false,
        sku,
        locationId,
        before,
        after: before,
        change: 0,
        message: 'no change',
      };
    }

    // ✅ 여기서부터 핵심 수정:
    // InventoryTx 모델에 실제 있는 필드만 넣는다.
    // (너 로그 기준으로 source/refType/refId 는 없음)
    const tx = await this.prisma.inventoryTx.create({
      data: {
        skuId: sku.id,
        locationId,
        qty: change,
        type: 'ADJUST' as any, // 기존에 ADJUST가 통과했으니 유지
      } as any,
      select: { id: true },
    });

    return {
      ok: true,
      modified: true,
      sku,
      locationId,
      before,
      after: before + change,
      change,
      txId: tx.id,
    };
  }
}
