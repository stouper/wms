import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ExportsModule } from '../exports/exports.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ExportsModule, // ✅ CJ 자동 예약용
    AuthModule,    // ✅ 출고 완료 푸시 알림용
  ],
  controllers: [JobsController],
  providers: [JobsService, PrismaService],
})
export class JobsModule {}
