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

  // 2) 기본 Location 생성 (HQ 창고 같은 의미로 코드 'A-1' 예시)
  await prisma.location.upsert({
    where: { storeId_code: { storeId: store.id, code: 'A-1' } },
    update: {},
    create: { storeId: store.id, code: 'A-1' },
  });

  console.log('seed done');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
