import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js'; // ← ESM: .js 확장자 필수

@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
