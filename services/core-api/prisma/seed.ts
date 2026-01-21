import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 시스템 필수 Location (삭제 불가)
const SYSTEM_LOCATIONS = [
  { code: 'RET-01', name: '반품' },
  { code: 'UNASSIGNED', name: '미지정' },
  { code: 'DEFECT', name: '불량' },
  { code: 'HOLD', name: '출고금지' },
];

async function main() {
  // 1) 기본 Store (HQ) 보장 - 본사 창고
  const store = await prisma.store.upsert({
    where: { code: 'HQ' },
    update: { isHq: true },
    create: { code: 'HQ', name: '본사 창고', isHq: true },
    select: { id: true },
  });

  // 2) 시스템 필수 Location 생성
  for (const loc of SYSTEM_LOCATIONS) {
    await prisma.location.upsert({
      where: { storeId_code: { storeId: store.id, code: loc.code } } as any,
      update: { name: loc.name },
      create: { storeId: store.id, code: loc.code, name: loc.name } as any,
    } as any);
  }

  console.log('seed done: store(HQ) + system locations:', SYSTEM_LOCATIONS.map(l => l.code).join(', '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
