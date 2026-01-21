import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  // 테스트 Store 확인/생성 (택배용)
  let store = await prisma.store.findFirst({ where: { code: 'PARCEL' } });
  if (!store) {
    store = await prisma.store.create({
      data: {
        code: 'PARCEL',
        name: '택배 출고',
        isHq: false,
      },
    });
    console.log('Store 생성:', store.id);
  } else {
    console.log('기존 Store:', store.id);
  }

  // 테스트 SKU 확인/생성
  let sku = await prisma.sku.findFirst({ where: { sku: 'TEST-CJ-SKU' } });
  if (!sku) {
    sku = await prisma.sku.create({
      data: {
        sku: 'TEST-CJ-SKU',
        name: 'CJ 테스트 상품',
        makerCode: 'TEST-CJ-SKU',
      },
    });
    console.log('SKU 생성:', sku.id);
  } else {
    console.log('기존 SKU:', sku.id);
  }

  // 테스트 Job 생성
  const job = await prisma.job.create({
    data: {
      type: 'OUTBOUND',
      status: 'done',
      storeId: store.id,
      title: '테스트 택배 #' + Date.now(),
      items: {
        create: {
          skuId: sku.id,
          qtyPlanned: 1,
          qtyPicked: 1,
        },
      },
      parcel: {
        create: {
          orderNo: 'TEST-ORDER-' + Date.now(),
          recipientName: '홍길동',
          phone: '010-1234-5678',
          zip: '06232',
          addr1: '서울특별시 강남구 테헤란로 427',
          addr2: '위워크빌딩 3층',
          memo: '문 앞에 놓아주세요',
        },
      },
    },
    include: { parcel: true },
  });

  console.log('Job 생성:', job.id);
  console.log('Parcel:', JSON.stringify(job.parcel, null, 2));

  await prisma.$disconnect();
}

main().catch(console.error);
