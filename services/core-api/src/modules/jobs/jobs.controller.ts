import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { AddItemsDto } from './dto/add-items.dto';
import { UpsertParcelDto } from './dto/upsert-parcel.dto';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  create(@Body() dto: CreateJobDto) {
    return this.jobs.createJob(dto);
  }

  @Get()
  list(@Query('date') date?: string) {
    // 너희 서비스가 date로 목록 필터하는 형태라 그대로 맞춤
    return this.jobs.listJobs({ date } as any);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.jobs.getJob(id);
  }

  @Post(':id/items')
  addItems(@Param('id') id: string, @Body() dto: AddItemsDto) {
    // ✅ addItems는 배열을 받음
    return this.jobs.addItems(id, dto.items as any);
  }

  // ✅ 데스크탑이 호출하는 스캔 엔드포인트
  @Post(':id/items/scan')
  scanItem(@Param('id') id: string, @Body() dto: any) {
    return this.jobs.scan(id, dto);
  }

  // (혹시 예전 클라이언트가 이 경로를 쓰면 같이 지원)
  @Post(':id/scan')
  scanAlias(@Param('id') id: string, @Body() dto: any) {
    return this.jobs.scan(id, dto);
  }

  @Post(':id/parcel')
  upsertParcel(@Param('id') id: string, @Body() dto: UpsertParcelDto) {
    return this.jobs.upsertParcel(id, dto as any);
  }

  @Post(':id/done')
  done(@Param('id') id: string) {
    return this.jobs.markDone(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.jobs.deleteJob(id);
  }

  // =========================
  // ✅ C안: 실재고 우선 토글 (추가된 부분)
  // =========================
  @Patch(':id/allow-overpick')
  setAllowOverpick(@Param('id') id: string, @Body() body: { allowOverpick: boolean }) {
    return this.jobs.setAllowOverpick(id, Boolean(body?.allowOverpick));
  }
}
