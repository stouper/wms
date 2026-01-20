import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const jobId = process.argv[2] || 'cmkmzk8an0005yhsqvpziqqpv';

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      parcel: true,
      items: { include: { sku: true } },
    },
  });

  if (!job || !job.parcel) {
    console.log('Job or Parcel not found');
    await prisma.$disconnect();
    return;
  }

  const parcel = job.parcel;

  // "null" 문자열 처리
  const cleanString = (s: string | null | undefined): string => {
    if (!s || s === 'null' || s === 'undefined' || s === 'NULL') return '';
    return s.trim();
  };

  // 전화번호 파싱
  const parsePhone = (phone: string): [string, string, string] => {
    const cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('010') && cleaned.length === 11) {
      return [cleaned.slice(0, 3), cleaned.slice(3, 7), cleaned.slice(7)];
    }
    if (cleaned.startsWith('02') && cleaned.length === 10) {
      return [cleaned.slice(0, 2), cleaned.slice(2, 6), cleaned.slice(6)];
    }
    if (cleaned.length >= 9) {
      return [cleaned.slice(0, 3), cleaned.slice(3, 7), cleaned.slice(7)];
    }
    return ['010', '0000', '0000'];
  };

  const [rcvrTel1, rcvrTel2, rcvrTel3] = parsePhone(parcel.phone || '');
  const rcvrAddr2 = cleanString(parcel.addr2);
  const rcvrMemo = cleanString(parcel.memo);
  const rcvrZip = cleanString(parcel.zip) || '000000';

  const totalQty = job.items.reduce((sum, it) => sum + it.qtyPicked, 0) || 1;
  const goodsName = job.items.map((it) => it.sku.name || it.sku.sku).join(', ') || '상품';

  const today = new Date();
  const rcptYmd = today.toISOString().slice(0, 10).replace(/-/g, '');
  const custUseNo = parcel.orderNo || job.id;
  const mpckKey = `${rcptYmd}_CUSTID_${custUseNo}`;

  console.log('=== 분석 결과 ===\n');
  console.log('원본 데이터:');
  console.log('  recipientName:', `"${parcel.recipientName}"`);
  console.log('  phone:', `"${parcel.phone}"`);
  console.log('  zip:', `"${parcel.zip}"`);
  console.log('  addr1:', `"${parcel.addr1}"`);
  console.log('  addr2:', `"${parcel.addr2}"`);
  console.log('  memo:', `"${parcel.memo}"`);
  console.log('  orderNo:', `"${parcel.orderNo}"`);

  console.log('\n변환 후 (API로 전송될 값):');
  console.log('  RCVR_NM:', `"${parcel.recipientName}"`);
  console.log('  RCVR_TEL_NO1:', `"${rcvrTel1}"`);
  console.log('  RCVR_TEL_NO2:', `"${rcvrTel2}"`);
  console.log('  RCVR_TEL_NO3:', `"${rcvrTel3}"`);
  console.log('  RCVR_ZIP_NO:', `"${rcvrZip}"`);
  console.log('  RCVR_ADDR:', `"${parcel.addr1}"`);
  console.log('  RCVR_DETAIL_ADDR:', `"${rcvrAddr2}"`);
  console.log('  DLV_MSG:', `"${rcvrMemo}"`);
  console.log('  CUST_USE_NO:', `"${custUseNo}"`);
  console.log('  GDS_NM:', `"${goodsName}"`);
  console.log('  GDS_QTY:', totalQty);

  console.log('\n빈 값 체크:');
  const emptyFields: string[] = [];
  if (!parcel.recipientName) emptyFields.push('recipientName');
  if (!parcel.phone) emptyFields.push('phone');
  if (!parcel.addr1) emptyFields.push('addr1');
  if (!rcvrTel1 || rcvrTel1 === '010') emptyFields.push('rcvrTel1 (기본값)');
  if (!custUseNo) emptyFields.push('custUseNo');
  if (!goodsName || goodsName === '상품') emptyFields.push('goodsName (기본값)');

  if (emptyFields.length > 0) {
    console.log('  문제 가능성:', emptyFields.join(', '));
  } else {
    console.log('  필수 필드 모두 OK');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
