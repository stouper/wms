import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ExportsModule } from '../exports/exports.module';

@Module({
  imports: [ExportsModule], // ✅ CJ 자동 예약용
  controllers: [JobsController],
  providers: [JobsService, PrismaService],
})
export class JobsModule {}
