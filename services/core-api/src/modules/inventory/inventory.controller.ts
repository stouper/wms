import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryOutDto } from './dto/inventory-out.dto';
import { InventoryInDto } from './dto/inventory-in.dto';
import { InventoryBulkSetDto } from './dto/inventory-bulk-set.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  // ✅ (호환) Desktop이 /inventory/summary 를 부르는 경우가 많음
  @Get('summary')
  async summary(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.inventory.summary({
      q,
      limit: limit ? Number(limit) : undefined,
    });
  }

  // ✅ (호환) Desktop이 /inventory/list 를 부르는 경우도 있음
  @Get('list')
  async listAlias(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.inventory.summary({
      q,
      limit: limit ? Number(limit) : undefined,
    });
  }

  // ✅ 루트(/inventory)도 summary 반환 (새 버전)
  @Get()
  async root(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.inventory.summary({
      q,
      limit: limit ? Number(limit) : undefined,
    });
  }

  // ✅ 트랜잭션 목록
  @Get('tx')
  async tx(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.inventory.listTx({
      q,
      limit: limit ? Number(limit) : undefined,
    });
  }

  // ✅ 코드 기반 onhand 조회 (HQ 기준)
  @Get('onhand')
  async onHand(@Query('skuCode') skuCode: string, @Query('locationCode') locationCode: string) {
    return this.inventory.onHandByCodes({ skuCode, locationCode });
  }

  // ✅ 창고입고 (IN)
  @Post('in')
  async inbound(@Body() dto: InventoryInDto) {
    return this.inventory.inbound(dto);
  }

  // ✅ 창고출고 (OUT)
  @Post('out')
  async out(@Body() dto: InventoryOutDto) {
    return this.inventory.out(dto);
  }

  // ✅ 재고 일괄 설정 (Excel 업로드용)
  @Post('bulk-set')
  async bulkSet(@Body() dto: InventoryBulkSetDto) {
    return this.inventory.bulkSet({
      items: dto.items,
      sourceKey: dto.sourceKey,
    });
  }
}
