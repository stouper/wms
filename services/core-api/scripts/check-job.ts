import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const jobId = process.argv[2] || 'cmkmyz9op003gic5jqmubchmh';

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      parcel: true,
      items: { include: { sku: true } },
      cjShipment: true,
    },
  });

  if (!job) {
    console.log('Job not found:', jobId);
    await prisma.$disconnect();
    return;
  }

  console.log('=== Job ===');
  console.log('id:', job.id);
  console.log('status:', job.status);
  console.log('title:', job.title);

  console.log('\n=== Parcel ===');
  if (job.parcel) {
    console.log('orderNo:', job.parcel.orderNo);
    console.log('recipientName:', `"${job.parcel.recipientName}"`);
    console.log('phone:', `"${job.parcel.phone}"`);
    console.log('zip:', `"${job.parcel.zip}"`);
    console.log('addr1:', `"${job.parcel.addr1}"`);
    console.log('addr2:', `"${job.parcel.addr2}"`);
    console.log('memo:', `"${job.parcel.memo}"`);
    console.log('waybillNo:', job.parcel.waybillNo);
  } else {
    console.log('Parcel: NULL');
  }

  console.log('\n=== Items ===');
  job.items?.forEach(it => {
    console.log('- SKU:', it.sku?.sku, '| name:', it.sku?.name, '| qtyPicked:', it.qtyPicked);
  });

  console.log('\n=== CjShipment ===');
  if (job.cjShipment) {
    console.log('invcNo:', job.cjShipment.invcNo);
    console.log('rcptYmd:', job.cjShipment.rcptYmd);
  } else {
    console.log('CjShipment: NULL (예약 안됨)');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
