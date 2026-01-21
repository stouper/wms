import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 택배 관련 Job 삭제 (title에 [택배] 또는 [단포] 또는 [합포] 포함)
  const jobs = await prisma.job.findMany({
    where: {
      OR: [
        { title: { contains: '[택배]' } },
        { title: { contains: '[단포]' } },
        { title: { contains: '[합포]' } },
      ]
    },
    select: { id: true, title: true }
  });
  
  console.log('삭제할 Job 개수:', jobs.length);
  for (const j of jobs) {
    console.log('- ' + j.id + ': ' + j.title);
  }
  
  // 삭제 (cascade로 JobItem, JobParcel, JobTx도 함께 삭제됨)
  for (const j of jobs) {
    await prisma.job.delete({ where: { id: j.id } });
    console.log('삭제 완료: ' + j.id);
  }
  
  console.log('\n총 ' + jobs.length + '개 Job 삭제 완료');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
