import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { CjApiService } from '../src/modules/cj-api/cj-api.service';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient() as any;

async function main() {
  const jobId = process.argv[2] || 'cmkmzk8an0005yhsqvpziqqpv';

  console.log('=== CJ 예약 테스트 ===\n');
  console.log('Job ID:', jobId);

  const config = new ConfigService();
  const cjApi = new CjApiService(config, prisma);

  try {
    const result = await cjApi.createReservation(jobId);
    console.log('\n성공!');
    console.log('운송장번호:', result.INVC_NO);
    console.log('접수일자:', result.RCPT_YMD);
  } catch (e: any) {
    console.log('\n실패:', e.message);
    if (e.response) {
      console.log('Response:', e.response);
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
