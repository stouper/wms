// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1) HQ Store 보장
  const store = await prisma.store.upsert({
    where: { storeCode: 'HQ' },
    update: {},
    create: {
      storeCode: 'HQ',
      storeName: '본사창고',
    },
  });

  // 2) 기본 Location(HQ) 보장 (선택이지만 추천)
  await prisma.location.upsert({
    where: {
      storeId_code: {
        storeId: store.id,
        code: 'HQ',
      },
    },
    update: {},
    create: {
      storeId: store.id,
      code: 'HQ',
    },
  });

  console.log('✅ Seed completed: HQ store & location ready');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
