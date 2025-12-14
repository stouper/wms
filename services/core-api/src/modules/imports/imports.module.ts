import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule, // ✅ 이 한 줄이 핵심
  ],
  controllers: [ImportsController],
})
export class ImportsModule {}
