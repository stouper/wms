import { Module } from '@nestjs/common';
import { CarriersModule } from './modules/carriers/carriers.module';
import { HealthModule } from './modules/health/health.module';
import { ImportsModule } from './modules/imports/imports.module';

@Module({
  imports: [HealthModule, CarriersModule, ImportsModule],
})
export class AppModule {}
