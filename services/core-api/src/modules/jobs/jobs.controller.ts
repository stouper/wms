import { Body, Controller, Delete, Get, Param, Patch, Post, Query, BadRequestException } from '@nestjs/common';
import { JobType } from '@prisma/client';
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
    @Query('storeId') storeId?: string,
    @Query('type') type?: JobType,
    @Query('parentId') parentId?: string,
  ) {
    const s = (status ?? '').toString().trim().toLowerCase();

    // ✅ desktop/레거시 호환: completed -> done
    const normalized =
      s === 'completed' || s === 'complete' || s === 'finished' ? 'done' : s;

    const idRaw = (storeId ?? '').toString().trim();
    const id =
      idRaw && idRaw !== 'undefined' && idRaw !== 'null' ? idRaw : undefined;

    // ✅ parentId 처리: "null"이면 null로 변환 (최상위 Job만)
    let parentIdParsed: string | null | undefined = undefined;
    if (parentId === 'null') {
      parentIdParsed = null;
    } else if (parentId && parentId !== 'undefined') {
      parentIdParsed = parentId;
    }

    return this.jobs.listJobs({
      date,
      status: (normalized || undefined) as any,
      storeId: id,
      type,
      parentId: parentIdParsed,
    } as any);
  }

  // ================================
  // 🔽 배치(묶음) Job 관련 엔드포인트 (라우트 순서 중요: :id보다 위에!)
  // ================================

  /**
   * 배치 Job 상세 조회 (하위 Job 포함)
   * GET /jobs/:id/batch
   */
  @Get(':id/batch')
  getBatchJob(@Param('id') id: string) {
    return this.jobs.getBatchJob(id);
  }

  /**
   * 배치 Job 스캔
   * POST /jobs/:id/batch/scan
   */
  @Post(':id/batch/scan')
  scanBatch(@Param('id') id: string, @Body() dto: ScanDto) {
    return this.jobs.scanBatch(id, dto as any);
  }

  // ================================
  // 🔽 단일 Job 관련 엔드포인트
  // ================================

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

  // ✅ 최근 tx부터 특정 tx까지 연속 undo (body: { txId, operatorId })
  @Post(':id/undo')
  undoUntil(@Param('id') id: string, @Body() body: { txId?: string; operatorId?: string }) {
    const txId = (body?.txId ?? '').toString().trim();
    if (!txId) throw new BadRequestException('txId is required');
    return this.jobs.undoUntilTx(id, txId, body?.operatorId);
  }

  // ✅ job 전체 undo (최근 tx부터 끝까지)
  @Post(':id/undo-all')
  undoAll(@Param('id') id: string, @Body() body?: { operatorId?: string }) {
    return this.jobs.undoAllTx(id, body?.operatorId);
  }

  @Post(':id/undo-last')
  undoLast(@Param('id') id: string, @Body() body?: { operatorId?: string }) {
    return this.jobs.undoLastTx(id, body?.operatorId);
  }

  // ✅ (호환) Desktop: POST /jobs/:jobId/approve-extra  (body: { jobItemId, qty })
  @Post(':jobId/approve-extra')
  approveExtraAlias(
    @Param('jobId') jobId: string,
    @Body() body: { jobItemId: string; qty: number },
  ) {
    const qty = Number(body?.qty ?? 0);
    return this.jobs.approveExtra(jobId, body?.jobItemId, qty);
  }
}
