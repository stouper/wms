import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
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
}
