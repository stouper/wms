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
    return this.jobs.createJob(dto as any);
  }

  // ✅ 목록 (date 쿼리는 지금은 무시: 필요하면 service 쪽에 필터 다시 붙이면 됨)
  @Get()
  list(
    @Query('date') date?: string,
    @Query('status') status?: string,
  ) {
    const s = (status ?? '').toString().trim().toLowerCase();

    // ✅ desktop/레거시 호환: completed -> done
    const normalized =
      s === 'completed' || s === 'complete' || s === 'finished' ? 'done' : s;

    return this.jobs.listJobs({
      date,
      status: (normalized || undefined) as any,
    } as any);
  }

// ✅ 디테일: 반드시 items(+sku) 포함해서 내려줘야 desktop에서 보임
  @Get(':id')
  get(@Param('id') id: string) {
    return this.jobs.getJob(id);
  }

  @Post(':id/items')
  addItems(@Param('id') id: string, @Body() dto: AddItemsDto) {
    return this.jobs.addItems(id, dto as any);
  }
  // ✅ Planned 초과(추가피킹) 승인 — 버튼으로만 허용
  @Patch(':id/items/:itemId/approve-extra')
  approveExtra(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: { qty: number },
  ) {
    return this.jobs.approveExtra(id, itemId, Number(body?.qty || 0));
  }



  // ✅ SKU 스캔(피킹) — Desktop이 쓰는 엔드포인트
  @Post(':id/items/scan')
  scanItem(@Param('id') id: string, @Body() dto: any) {
    return this.jobs.scan(id, dto as any);
  }

  // ✅ 반품 입고(잡 귀속) — Desktop 반품 탭에서 사용
  @Post(':id/receive')
  receive(@Param('id') id: string, @Body() dto: any) {
    return this.jobs.receive(id, dto as any);
  }


  // ✅ (호환) 과거 클라이언트가 /scan 으로 치는 경우 대응
  // 지금은 Desktop을 items/scan으로 통일했지만, 남겨두면 안전함
  @Post(':id/scan')
  scan(@Param('id') id: string, @Body() dto: any) {
    return this.jobs.scan(id, dto as any);
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

  // ✅ C안: 실재고 우선 토글
  @Patch(':id/allow-overpick')
  setAllowOverpick(@Param('id') id: string, @Body() body: { allowOverpick: boolean }) {
    return this.jobs.setAllowOverpick(id, Boolean(body?.allowOverpick));
  }
  // ✅ (호환) Desktop: POST /jobs/:jobId/approve-extra  (body: { jobItemId, qty })
  // 기존 라우트(PATCH /jobs/:id/items/:itemId/approve-extra)는 그대로 두고,
  // 워크벤치 UI에서 쓰는 간단한 엔드포인트를 별칭으로 추가한다.
  @Post(':jobId/approve-extra')
  approveExtraAlias(
    @Param('jobId') jobId: string,
    @Body() body: { jobItemId: string; qty: number },
  ) {
    const qty = Number(body?.qty ?? 0);
    return this.jobs.approveExtra(jobId, body?.jobItemId, qty);
  }

}
