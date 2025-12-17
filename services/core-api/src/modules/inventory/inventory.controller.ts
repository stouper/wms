import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryOutDto } from './dto/inventory-out.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  /**
   * ✅ 루트 재고 조회 (wms-desktop에서 기본으로 때리는 엔드포인트)
   * - 기존에 /inventory/summary 는 있었는데, /inventory 가 없어서 404가 났던 상황
   * - 루트는 summary를 그대로 반환하도록 연결
   */
  @Get()
  async list(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.inventory.summary({
      q,
      limit: Number(limit ?? 200),
    });
  }

  // (선택) 서버 살아있는지 체크용
  @Get('_ping')
  ping() {
    return { ok: true };
  }

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
