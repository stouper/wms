import { PrismaClient } from '@prisma/client';

export async function applyInventoryDelta(
  prisma: PrismaClient,
  params: {
    skuId: string;
    locationId: string;
    delta: number;
    type: string;
    jobId?: string;
    jobItemId?: string;
    operatorId?: string;
    force?: boolean;
    forceReason?: string;
  },
) {
  const { skuId, locationId, delta, type, jobId, jobItemId, operatorId, force, forceReason } = params;

  if (!skuId) throw new Error('applyInventoryDelta: skuId is required');
  if (!locationId) throw new Error('applyInventoryDelta: locationId is required');
  if (!Number.isFinite(delta) || delta === 0) throw new Error('applyInventoryDelta: delta must be non-zero');

  return prisma.$transaction(async (tx) => {
    const inv = await tx.inventory.upsert({
      where: { skuId_locationId: { skuId, locationId } },
      update: { qty: { increment: delta } },
      create: { skuId, locationId, qty: delta },
    });

    const isNegative = inv.qty < 0;

    if (isNegative && !force) {
      throw new Error(`Inventory negative: skuId=${skuId} locationId=${locationId} qty=${inv.qty}`);
    }

    await tx.inventoryTx.create({
      data: {
        skuId,
        locationId,
        qty: delta,
        type,
        jobId,
        jobItemId,
        operatorId,
        isForced: isNegative && force ? true : undefined,
        forcedReason: isNegative && force ? (forceReason || `강제 처리로 음수 재고 발생: ${inv.qty}`) : undefined,
      },
    });

    return { ...inv, isNegative };
  });
}
