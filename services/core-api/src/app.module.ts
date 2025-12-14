// src/app.module.ts
import { Module } from '@nestjs/common';
import { ImportsModule } from './modules/imports/imports.module';
import { InventoryModule } from './modules/inventory/inventory.module';
// 아래가 프로젝트에 실제 있으면 유지, 없으면 제거
// import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    InventoryModule,
    ImportsModule,
    // HealthModule,
  ],
})
export class AppModule {}
