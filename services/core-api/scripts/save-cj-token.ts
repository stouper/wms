import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function saveCjToken() {
  const tokenNum = 'f97a479c-9f3f-4ae3-8e4e-16fe3ac03fe2';

  // 24시간 토큰이므로 현재 시각 + 23시간으로 설정 (안전 마진)
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 23);

  console.log('토큰 저장 중...');
  console.log('Token:', tokenNum);
  console.log('Expires at:', expiresAt.toISOString());

  // 기존 토큰 삭제 (있다면)
  await prisma.cjToken.deleteMany({});

  // 새 토큰 저장
  const saved = await prisma.cjToken.create({
    data: {
      tokenNum,
      expiresAt,
    },
  });

  console.log('✅ 토큰 저장 완료:', saved);

  await prisma.$disconnect();
}

saveCjToken()
  .catch((e) => {
    console.error('❌ 토큰 저장 실패:', e);
    process.exit(1);
  });
