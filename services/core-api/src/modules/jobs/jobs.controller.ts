import { Body, Controller, Delete, Get, Param, Patch, Post, Query, BadRequestException } from '@nestjs/common';
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
    return this.jobs.createJob(dto as any);
  }

  // ✅ 목록 (date 쿼리는 지금은 무시: 필요하면 service 쪽에 필터 다시 붙이면 됨)
  @Get()
  list(
    @Query('date') date?: string,
    @Query('status') status?: string,
    @Query('storeCode') storeCode?: string,
  ) {
    const s = (status ?? '').toString().trim().toLowerCase();

    // ✅ desktop/레거시 호환: completed -> done
    const normalized =
      s === 'completed' || s === 'complete' || s === 'finished' ? 'done' : s;

    const scRaw = (storeCode ?? '').toString().trim();
    const sc =
      scRaw && scRaw !== 'undefined' && scRaw !== 'null' ? scRaw : undefined;

    return this.jobs.listJobs({
      date,
      status: (normalized || undefined) as any,
      storeCode: sc,
    } as any);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.jobs.getJob(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.jobs.deleteJob(id);
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

  // ✅ SKU 스캔(피킹)
  // ✅ (프론트 호환) /jobs/:id/items/scan
  @Post(':id/items/scan')
  scanItem(@Param('id') id: string, @Body() dto: ScanDto) {
    return this.jobs.scan(id, dto as any);
  }

  @Post(':id/scan')
  scan(@Param('id') id: string, @Body() dto: ScanDto) {
    return this.jobs.scan(id, dto as any);
  }

  // ✅ 입고(반품)
  @Post(':id/receive')
  receive(@Param('id') id: string, @Body() dto: ScanDto) {
    return this.jobs.receive(id, dto as any);
  }

  // ✅ (택배) 송장번호/박스 등 업데이트
  @Post(':id/parcels/upsert')
  upsertParcel(@Param('id') id: string, @Body() dto: UpsertParcelDto) {
    return this.jobs.upsertParcel(id, dto as any);
  }

  // ✅ C안: allowOverpick 토글
  @Patch(':id/allow-overpick')
  setAllowOverpick(
    @Param('id') id: string,
    @Body() body: { allowOverpick: boolean },
  ) {
    return this.jobs.setAllowOverpick(id, Boolean(body?.allowOverpick));
  }

  // ✅ job 기준 InventoryTx 목록 (undo UI용)
  @Get(':id/tx')
  listTx(@Param('id') id: string) {
    return this.jobs.listInventoryTx(id);
  }

  // ✅ 최근 tx부터 특정 tx까지 연속 undo (body: { txId })
  @Post(':id/undo')
  undoUntil(@Param('id') id: string, @Body() body: { txId?: string }) {
    const txId = (body?.txId ?? '').toString().trim();
    if (!txId) throw new BadRequestException('txId is required');
    return this.jobs.undoUntilTx(id, txId);
  }

  // ✅ job 전체 undo (최근 tx부터 끝까지)
  @Post(':id/undo-all')
  undoAll(@Param('id') id: string) {
    return this.jobs.undoAllTx(id);
  }

  @Post(':id/undo-last')
  undoLast(@Param('id') id: string) {
    return this.jobs.undoLastTx(id);
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
