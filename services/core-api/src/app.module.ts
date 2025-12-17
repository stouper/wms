import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Prisma
import { PrismaModule } from './prisma/prisma.module';

// Domain modules
import { InventoryModule } from './modules/inventory/inventory.module';
import { ImportsModule } from './modules/imports/imports.module';

// ✅ New modules
import { JobsModule } from './modules/jobs/jobs.module';
import { ExportsModule } from './modules/exports/exports.module';

/**
 * AppModule
 * - ConfigModule 전역 로드 (env)
 * - Prisma/Inventory/Imports/Jobs/Exports 모듈 조립
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,

    InventoryModule, // InventoryService를 exports 하고 있어야 함
    ImportsModule,   // 컨트롤러/서비스/어댑터 등록

    // ✅ 작업지시 + EPMS Export
    JobsModule,
    ExportsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
