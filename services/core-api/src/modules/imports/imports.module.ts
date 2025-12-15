import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { HqInventoryService } from './hq-inventory.service';
import { InventoryModule } from '../inventory/inventory.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule, InventoryModule],
  controllers: [ImportsController],
  providers: [ImportsService, HqInventoryService],
})
export class ImportsModule {}
