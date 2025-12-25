import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // 1) 기본 Store 생성 (HQ)
  const store = await prisma.store.upsert({
    where: { code: 'HQ' },
    update: {},
    create: { code: 'HQ', name: 'Head Office' },
    select: { id: true },
  });

  // 2) 기본 Location 생성 (필수: RET-01)
  await prisma.location.upsert({
    where: { storeId_code: { storeId: store.id, code: 'RET-01' } },
    update: {},
    create: { storeId: store.id, code: 'RET-01' },
  });

  // 3) (옵션) 기존 테스트용 Location 유지: A-1
  await prisma.location.upsert({
    where: { storeId_code: { storeId: store.id, code: 'A-1' } },
    update: {},
    create: { storeId: store.id, code: 'A-1' },
  });

  console.log('seed done: HQ + RET-01 (+ A-1)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
