import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1) 기본 Store (HQ) 보장
  const store = await prisma.store.upsert({
    where: { code: 'HQ' },
    update: {},
    create: { code: 'HQ', name: 'Head Office' },
    select: { id: true },
  });

  // 2) 반품 버킷: RET-01
  await prisma.location.upsert({
    where: { storeId_code: { storeId: store.id, code: 'RET-01' } } as any,
    update: {},
    create: { storeId: store.id, code: 'RET-01' } as any,
  } as any);

  // 3) 강제 출고 버킷: UNASSIGNED
  await prisma.location.upsert({
    where: { storeId_code: { storeId: store.id, code: 'UNASSIGNED' } } as any,
    update: {},
    create: { storeId: store.id, code: 'UNASSIGNED' } as any,
  } as any);

  console.log('seed done: store(HQ) + locations(RET-01, UNASSIGNED)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
