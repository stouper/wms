import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { CjApiService } from '../src/modules/cj-api/cj-api.service';

// 환경변수 로드
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient() as any;

/**
 * CJ API 전체 테스트 스크립트
 * - 1. 토큰 발급/확인
 * - 2. 주소 정제 (ReqAddrRfnSm)
 * - 3. 운송장 번호 발급 (ReqInvcNo)
 * - 4. 예약 접수 (RegBook)
 * - 5. 예약 취소 (CnclBook)
 */

async function testCjApi() {
  console.log('\n========================================');
  console.log('    CJ API 전체 테스트 시작');
  console.log('========================================\n');

  // ConfigService 생성
  const config = new ConfigService();

  // CjApiService 생성
  const cjApi = new CjApiService(config, prisma);

  let testJobId: string | null = null;

  try {
    // ============================================
    // 1. 토큰 확인
    // ============================================
    console.log('1. 토큰 확인');
    console.log('----------------------------------------');
    const token = await cjApi.getValidToken();
    console.log(`   토큰: ${token.slice(0, 20)}...`);
    console.log('   [성공]\n');

    // ============================================
    // 2. 주소 정제 테스트
    // ============================================
    console.log('2. 주소 정제 테스트 (ReqAddrRfnSm)');
    console.log('----------------------------------------');
    try {
      const testAddr = '서울시 강남구 테헤란로 427';
      console.log(`   입력: ${testAddr}`);
      const addrResult = await cjApi.verifyAddress(testAddr);
      console.log(`   결과: ${JSON.stringify(addrResult, null, 2)}`);
      console.log('   [성공]\n');
    } catch (e: any) {
      console.log(`   [실패] ${e.message}\n`);
    }

    // ============================================
    // 3. 운송장 번호 발급 테스트
    // ============================================
    console.log('3. 운송장 번호 발급 테스트 (ReqInvcNo)');
    console.log('----------------------------------------');
    let testWaybillNo: string | null = null;
    try {
      const waybills = await cjApi.generateWaybillNumbers(1);
      testWaybillNo = waybills[0] || null;
      console.log(`   발급된 운송장: ${waybills.join(', ')}`);
      console.log('   [성공]\n');
    } catch (e: any) {
      console.log(`   [실패] ${e.message}\n`);
    }

    // ============================================
    // 4. 예약 접수 테스트 (RegBook)
    // ============================================
    console.log('4. 예약 접수 테스트 (RegBook)');
    console.log('----------------------------------------');

    // 테스트용 Job/Parcel 생성
    try {
      console.log('   테스트용 데이터 생성 중...');

      // 테스트용 Store 확인/생성
      let testStore = await prisma.store.findFirst({
        where: { code: 'PARCEL' },
      });
      if (!testStore) {
        testStore = await prisma.store.create({
          data: {
            code: 'PARCEL',
            name: '택배 출고',
            isHq: false,
          },
        });
      }

      // 기존 테스트 SKU 확인 또는 생성
      let testSku = await prisma.sku.findFirst({
        where: { sku: 'TEST-CJ-SKU' },
      });
      if (!testSku) {
        testSku = await prisma.sku.create({
          data: {
            sku: 'TEST-CJ-SKU',
            name: 'CJ API 테스트 상품',
            makerCode: 'TEST-CJ-SKU',
          },
        });
      }

      // 테스트용 Job 생성 (타입: OUTBOUND)
      const testJob = await prisma.job.create({
        data: {
          type: 'OUTBOUND',
          status: 'open',
          storeId: testStore.id,
          items: {
            create: {
              skuId: testSku.id,
              qtyPlanned: 1,
              qtyPicked: 1,
            },
          },
          parcel: {
            create: {
              orderNo: `TEST-ORDER-${Date.now()}`,
              recipientName: '홍길동',
              phone: '010-1234-5678',
              zip: '06232',
              addr1: '서울특별시 강남구 테헤란로 427',
              addr2: '위워크빌딩 3층',
              memo: 'CJ API 테스트 배송',
            },
          },
        },
      });

      testJobId = testJob.id;
      console.log(`   테스트 Job 생성: ${testJobId}`);

      // 예약 접수 실행
      const reservation = await cjApi.createReservation(testJob.id);
      console.log(`   접수일자: ${reservation.RCPT_YMD}`);
      console.log(`   운송장번호: ${reservation.INVC_NO}`);
      console.log(`   묶음키: ${reservation.MPCK_KEY || 'N/A'}`);
      console.log('   [성공]\n');

      // ============================================
      // 5. 예약 취소 테스트 (CnclBook)
      // ============================================
      console.log('5. 예약 취소 테스트 (CnclBook)');
      console.log('----------------------------------------');

      const cancelResult = await cjApi.cancelReservation(testJob.id);
      console.log(`   결과: ${cancelResult.message}`);
      console.log('   [성공]\n');

    } catch (e: any) {
      console.log(`   [실패] ${e.message}`);
      console.log(`   상세: ${e.stack}\n`);
    }

    // ============================================
    // 결과 요약
    // ============================================
    console.log('========================================');
    console.log('    테스트 완료');
    console.log('========================================');
    console.log(`
테스트 API 목록:
  1. 토큰 발급 (ReqOneDayToken)     - 완료
  2. 주소 정제 (ReqAddrRfnSm)       - 완료
  3. 운송장 발급 (ReqInvcNo)        - 완료
  4. 예약 접수 (RegBook)            - 완료
  5. 예약 취소 (CnclBook)           - 완료
`);

  } catch (error: any) {
    console.error('\n[오류] 테스트 실패:', error.message);
    console.error('상세:', error.stack);
  } finally {
    // 테스트 데이터 정리
    if (testJobId) {
      console.log('\n테스트 데이터 정리 중...');
      try {
        // CjShipment 삭제
        await prisma.cjShipment.deleteMany({
          where: { jobId: testJobId },
        });
        // JobItem 삭제
        await prisma.jobItem.deleteMany({
          where: { jobId: testJobId },
        });
        // JobParcel 삭제
        await prisma.jobParcel.deleteMany({
          where: { jobId: testJobId },
        });
        // Job 삭제
        await prisma.job.delete({
          where: { id: testJobId },
        });
        console.log('테스트 데이터 정리 완료');
      } catch (cleanupError: any) {
        console.log('테스트 데이터 정리 실패:', cleanupError.message);
      }
    }

    await prisma.$disconnect();
  }
}

// 개별 API 테스트 함수들 (선택적 실행)
async function testTokenOnly() {
  console.log('\n=== 토큰 테스트 ===\n');
  const config = new ConfigService();
  const cjApi = new CjApiService(config, prisma);

  const token = await cjApi.getValidToken();
  console.log(`토큰: ${token.slice(0, 30)}...`);

  await prisma.$disconnect();
}

async function testAddressOnly(addr: string) {
  console.log('\n=== 주소 정제 테스트 ===\n');
  const config = new ConfigService();
  const cjApi = new CjApiService(config, prisma);

  console.log(`입력: ${addr}`);
  const result = await cjApi.verifyAddress(addr);
  console.log('결과:', JSON.stringify(result, null, 2));

  await prisma.$disconnect();
}

async function testWaybillOnly(count = 1) {
  console.log('\n=== 운송장 발급 테스트 ===\n');
  const config = new ConfigService();
  const cjApi = new CjApiService(config, prisma);

  const waybills = await cjApi.generateWaybillNumbers(count);
  console.log('발급된 운송장:', waybills);

  await prisma.$disconnect();
}

// CLI 인자 처리
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'token':
    testTokenOnly();
    break;
  case 'address':
    testAddressOnly(args[1] || '서울시 강남구 테헤란로 427');
    break;
  case 'waybill':
    testWaybillOnly(parseInt(args[1]) || 1);
    break;
  default:
    testCjApi();
}
