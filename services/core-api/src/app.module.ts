import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Prisma
import { PrismaModule } from './prisma/prisma.module';

// Domain modules
import { InventoryModule } from './modules/inventory/inventory.module';
import { ImportsModule } from './modules/imports/imports.module';

/**
 * AppModule
 * - ConfigModule 전역 로드 (env)
 * - Prisma/Inventory/Imports 모듈 조립
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    InventoryModule,   // InventoryService를 exports 하고 있어야 함
    ImportsModule,     // 컨트롤러/서비스/어댑터 등록
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
