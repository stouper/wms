import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryOutDto } from './dto/inventory-out.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('tx')
  async listTx(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.inventory.listTx({
      q,
      limit: Number(limit ?? 50),
    });
  }

  @Get('summary')
  async summary(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.inventory.summary({
      q,
      limit: Number(limit ?? 200),
    });
  }

  // ✅ 출고(OUT): skuCode 또는 makerCode로 처리
  @Post('out')
  async out(@Body() dto: InventoryOutDto) {
    return this.inventory.out(dto);
  }
}
