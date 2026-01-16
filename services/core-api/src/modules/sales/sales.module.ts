import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { PrismaModule } from '../../prisma/prisma.module'; // ✅ 추가

@Module({
  imports: [PrismaModule], // ✅ 추가
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
