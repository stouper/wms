import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding start...');

  // 1. Stores (매장)
  const stores = [
    { storeCode: '1001', storeName: '강남점' },
    { storeCode: '1002', storeName: '홍대점' },
  ];

  for (const s of stores) {
    await prisma.store.upsert({
      where: { storeCode: s.storeCode },
      update: { storeName: s.storeName },
      create: s,
    });
  }

  // 2. Default Location (각 매장 MAIN)
  const allStores = await prisma.store.findMany();

  for (const store of allStores) {
    await prisma.location.upsert({
      where: {
        storeId_code: {
          storeId: store.id,
          code: 'MAIN',
        },
      },
      update: {},
      create: {
        storeId: store.id,
        code: 'MAIN',
      },
    });
  }

  // 3. Products
  const products = [
    { code: '10001-001', name: 'Classic Clog' },
    { code: '203591-6ur', name: 'Echo Slide' },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { code: p.code },
      update: { name: p.name },
      create: p,
    });
  }

  // 4. SKU (sku + size + barcode)
  const skus = [
    { skuCode: '10001-001', size: 'm4m6', barcode: '880000000001' },
    { skuCode: '10001-001', size: 'm5m7', barcode: '880000000002' },
    { skuCode: '203591-6ur', size: 'm4m6', barcode: '880000000003' },
  ];

  for (const s of skus) {
    const product = await prisma.product.findUnique({
      where: { code: s.skuCode },
    });

    if (!product) {
      console.warn(`❗ Product not found for skuCode=${s.skuCode}`);
      continue;
    }

    await prisma.sku.upsert({
      where: {
        skuCode_size: {
          skuCode: s.skuCode,
          size: s.size,
        },
      },
      update: { barcode: s.barcode },
      create: {
        skuCode: s.skuCode,
        size: s.size,
        barcode: s.barcode,
        productId: product.id,
      },
    });
  }

  console.log('✅ Seeding done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
