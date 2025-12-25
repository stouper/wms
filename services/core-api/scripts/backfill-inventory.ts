import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const groups = await prisma.inventoryTx.groupBy({
    by: ['skuId', 'locationId'],
    _sum: { qty: true },
  });

  for (const g of groups) {
    const qty = g._sum.qty ?? 0;

    await prisma.inventory.upsert({
      where: {
        skuId_locationId: {
          skuId: g.skuId,
          locationId: g.locationId!,
        },
      },
      update: { qty },
      create: {
        skuId: g.skuId,
        locationId: g.locationId!,
        qty,
      },
    });
  }

  console.log(`✅ Inventory backfill complete (${groups.length} rows)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
