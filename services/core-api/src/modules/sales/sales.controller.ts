import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SalesService } from './sales.service';

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post('import-excel')
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(
    @UploadedFile() file: Express.Multer.File,
    @Body('sourceKey') sourceKey?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('file (xlsx) is required');
    }
    return this.sales.importExcelToSalesRaw(file.buffer, sourceKey);
  }

  /**
   * 매장별 매출 집계
   * GET /sales/by-store?from=2026-01-01&to=2026-01-31
   */
  @Get('by-store')
  async byStore(@Query('from') from?: string, @Query('to') to?: string) {
    if (!from || !to) {
      throw new BadRequestException('from,to (YYYY-MM-DD) is required');
    }
    return this.sales.getSalesByStore(from, to);
  }

  /**
   * 디버그: 최근 저장된 매출 데이터 확인
   * GET /sales/debug-recent
   */
  @Get('debug-recent')
  async debugRecent() {
    return this.sales.getRecentSalesRaw();
  }

  /**
   * 매출 목록 조회
   * GET /sales?storeCode=xxx&from=2026-01-01&to=2026-01-31
   */
  @Get()
  async getSalesList(
    @Query('storeCode') storeCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.sales.getSalesList(storeCode, from, to);
  }

  /**
   * 매출 단건 조회
   * GET /sales/:id
   */
  @Get(':id')
  async getSalesById(@Param('id') id: string) {
    return this.sales.getSalesById(id);
  }

  /**
   * 매출 생성
   * POST /sales
   */
  @Post()
  async createSale(
    @Body()
    body: {
      storeCode: string;
      storeName?: string;
      saleDate: string; // YYYY-MM-DD
      amount: number;
      qty?: number;
      productType?: string;
      itemCode?: string;
      codeName?: string;
      sourceKey?: string;
    },
  ) {
    if (!body.storeCode || !body.saleDate || body.amount === undefined) {
      throw new BadRequestException('storeCode, saleDate, amount are required');
    }
    return this.sales.createSale(body);
  }

  /**
   * 매출 수정
   * PUT /sales/:id
   */
  @Put(':id')
  async updateSale(
    @Param('id') id: string,
    @Body()
    body: {
      storeCode?: string;
      storeName?: string;
      saleDate?: string; // YYYY-MM-DD
      amount?: number;
      qty?: number;
      productType?: string;
      itemCode?: string;
      codeName?: string;
      sourceKey?: string;
    },
  ) {
    return this.sales.updateSale(id, body);
  }

  /**
   * 매출 삭제
   * DELETE /sales/:id
   */
  @Delete(':id')
  async deleteSale(@Param('id') id: string) {
    return this.sales.deleteSale(id);
  }
}
