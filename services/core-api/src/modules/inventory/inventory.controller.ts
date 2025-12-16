import { Controller, Get, Query } from '@nestjs/common';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  /**
   * 재고 트랜잭션 조회 (사람이 읽는 형태)
   * GET /inventory/tx?q=크록스&limit=50
   */
  @Get('tx')
  async getInventoryTx(
    @Query('q') q?: string,
    @Query('limit') limit = '50',
  ) {
    return this.inventoryService.listTx({
      q,
      limit: Number(limit),
    });
  }
}
