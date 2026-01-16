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

// ✅ Sales (추가)
import { SalesModule } from './modules/sales/sales.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,

    InventoryModule,
    ImportsModule,

    JobsModule,
    ExportsModule,

    // ✅ 매출 업로드/조회
    SalesModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
