import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryOutDto } from './dto/inventory-out.dto';
import { InventoryInDto } from './dto/inventory-in.dto';
import { InventoryBulkSetDto } from './dto/inventory-bulk-set.dto';
import { InventoryResetDto } from './dto/inventory-reset.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  // ✅ (호환) Desktop이 /inventory/summary 를 부르는 경우가 많음
  @Get('summary')
  async summary(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.inventory.summary({
      q,
      limit: limit ? Number(limit) : undefined,
      storeId,
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

  // ✅ 재고 검색 (매장별 SKU/MakerCode 검색)
  @Get('search')
  async search(
    @Query('storeCode') storeCode: string,
    @Query('q') q: string,
  ) {
    return this.inventory.searchByCode({ storeCode, q });
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

  // ✅ 재고 일괄 설정 (Excel 업로드용) - 재고 조정 (부분 수정)
  @Post('bulk-set')
  async bulkSet(@Body() dto: InventoryBulkSetDto) {
    return this.inventory.bulkSet({
      items: dto.items,
      sourceKey: dto.sourceKey,
    });
  }

  // ✅ 재고 초기화 (전체 교체) - 엑셀 기준으로 해당 매장 재고 전체 교체
  @Post('reset')
  async reset(@Body() dto: InventoryResetDto) {
    return this.inventory.reset({
      storeCode: dto.storeCode,
      rows: dto.rows,
    });
  }

  /**
   * 전체 매장 재고 조회 (창고/HQ 제외)
   * GET /inventory/all-stores
   */
  @Get('all-stores')
  async allStores(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.inventory.summaryAllStores({
      q,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /**
   * 매장별 재고 요약 (집계) - 매장별 SKU수, 총수량만 반환
   * GET /inventory/stores-summary
   */
  @Get('stores-summary')
  async storesSummary() {
    return this.inventory.storesSummary();
  }

  /**
   * 특정 매장 재고 상세 (페이지네이션)
   * GET /inventory/store/:storeCode
   */
  @Get('store/:storeCode')
  async storeDetail(
    @Param('storeCode') storeCode: string,
    @Query('q') q?: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    return this.inventory.storeDetail({
      storeCode,
      q,
      offset: offset ? Number(offset) : 0,
      limit: limit ? Number(limit) : 500,
    });
  }
}
