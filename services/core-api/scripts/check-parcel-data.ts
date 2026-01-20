import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const jobs = await prisma.job.findMany({
    where: { parcel: { isNot: null } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      parcel: true,
      items: { include: { sku: true } },
    },
  });

  console.log('=== 최근 택배 작지 (CJ 필수 필드 체크) ===\n');

  for (const job of jobs) {
    const p = job.parcel;
    console.log('----------------------------------------');
    console.log('Job ID:', job.id);
    console.log('Title:', job.title);
    console.log('Status:', job.status);
    console.log('');

    if (!p) {
      console.log('❌ Parcel 데이터 없음!');
      continue;
    }

    const isValid = (v: any) => v && v !== 'null' && v !== 'NULL' && v !== 'undefined';
    const display = (v: any) => {
      if (!v) return '(없음)';
      const s = String(v);
      return s.length > 50 ? s.slice(0, 50) + '...' : s;
    };

    console.log('  수취인명:', isValid(p.recipientName) ? '✅' : '⚠️', display(p.recipientName));
    console.log('  전화번호:', isValid(p.phone) ? '✅' : '⚠️', display(p.phone));
    console.log('  우편번호:', isValid(p.zip) ? '✅' : '⚠️', display(p.zip));
    console.log('  주소:', isValid(p.addr1) ? '✅' : '⚠️', display(p.addr1));
    console.log('  상세주소:', isValid(p.addr2) ? '✅' : '⚠️', display(p.addr2));
    console.log('  주문번호:', isValid(p.orderNo) ? '✅' : '⚠️', display(p.orderNo));
    console.log('  배송메모:', isValid(p.memo) ? '✅' : '⚠️', display(p.memo));
    console.log('  운송장번호:', isValid(p.waybillNo) ? '✅' : '⚠️', display(p.waybillNo));

    console.log('');
    console.log('  상품:');
    for (const item of job.items) {
      const name = item.sku?.name || item.sku?.sku || 'Unknown';
      console.log('    -', name, 'x', item.qtyPlanned);
    }
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
