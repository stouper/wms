import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ExportsService } from './exports.service';

@Controller('exports')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  // /exports/epms?date=20251216
  @Get('epms')
  async epms(@Query('date') date: string, @Res() res: Response) {
    const { filename, csv } = await this.exports.exportEpmsCsv(date);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // 엑셀 한글 깨짐 방지 BOM
    res.send('\uFEFF' + csv);
  }
}
