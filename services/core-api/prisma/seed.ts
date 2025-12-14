import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function seedHQ() {
  const store = await prisma.store.upsert({
    where: { storeCode: 'HQ' },
    update: {},
    create: { storeCode: 'HQ', storeName: '본사창고' },
  });

  await prisma.location.upsert({
    where: { storeId_code: { storeId: store.id, code: 'HQ' } },
    update: {},
    create: { storeId: store.id, code: 'HQ' },
  });
}

async function main() {
  await seedHQ();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
