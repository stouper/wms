import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const jobs = await prisma.job.findMany({
    where: { parcel: { isNot: null } },
    include: {
      parcel: true,
      cjShipment: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  console.log('=== Parcel Jobs (최근 10개) ===\n');

  if (jobs.length === 0) {
    console.log('Parcel Job이 없습니다.');
  }

  jobs.forEach((j) => {
    console.log('---');
    console.log('Job ID:', j.id);
    console.log('Title:', j.title);
    console.log('Status:', j.status);
    console.log('수취인:', j.parcel?.recipientName);
    console.log('Parcel.waybillNo:', j.parcel?.waybillNo || 'NULL');
    console.log('CjShipment:', j.cjShipment ? `invcNo=${j.cjShipment.invcNo}` : 'NULL (예약 안됨)');
  });

  await prisma.$disconnect();
}

main().catch(console.error);
