import type { Response } from 'express';
import { Body, Controller, Delete, Get, Param, Post, Query, BadRequestException, Res } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { AddItemsDto } from './dto/add-items.dto';
import { UpsertParcelDto } from './dto/upsert-parcel.dto';
import { ScanDto } from './dto/scan.dto';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  create(@Body() dto: CreateJobDto) {
    return this.jobs.createJob(dto);
  }

  @Get()
  list(@Query('date') date?: string) {
    return this.jobs.listJobs({ date });
  }


  @Get('export-xlsx')
  async exportXlsx(@Query('date') date: string, @Res() res: Response) {
    if (!date) throw new BadRequestException('date is required (YYYY-MM-DD)');
    const buf = await this.jobs.exportXlsxByStore({ date });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="export_${date}.xlsx"`);
    res.send(buf);
  }


  // ✅ EPMS Export Source (Dashboard CSV용)
  @Get('export-source')
  exportSource(@Query('date') date: string) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date is required (YYYY-MM-DD)');
    }
    return this.jobs.exportSource({ date });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.jobs.getJob(id);
  }

  @Post(':id/items')
  addItems(@Param('id') id: string, @Body() dto: AddItemsDto) {
    return this.jobs.addItems(id, dto.items);
  }

  @Post(':id/parcel')
  upsertParcel(@Param('id') id: string, @Body() dto: UpsertParcelDto) {
    return this.jobs.upsertParcel(id, dto);
  }

  @Post(':id/scan')
  scan(@Param('id') id: string, @Body() dto: ScanDto) {
    return this.jobs.scan(id, dto);
  }

   // ✅ 반품입고용: Job 진행률만 반영 (재고 X)
  @Post(':id/receive')
  receive(@Param('id') id: string, @Body() dto: ScanDto) {
    return this.jobs.receive(id, dto);
  }

  @Post(':id/done')
  done(@Param('id') id: string) {
    return this.jobs.markDone(id);
  }

  // ✅ 삭제 API
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.jobs.deleteJob(id);
  }
}
