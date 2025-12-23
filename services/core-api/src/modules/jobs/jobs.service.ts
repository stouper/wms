import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as ExcelJS from 'exceljs';

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  private norm(v?: string | null) {
    return (v ?? '').trim();
  }
  private normSkuCode(v?: string | null) {
    return this.norm(v).toUpperCase();
  }
  private isLikelyBarcode(v: string) {
    return /^[0-9]{8,}$/.test(v);
  }

  private async resolveSkuByValue(value: string) {
    const v = this.norm(value);
    if (!v) throw new BadRequestException('scan value is required');

    if (this.isLikelyBarcode(v)) {
      const sku = await this.prisma.sku.findFirst({
        where: { makerCode: v },
        select: { id: true, code: true, makerCode: true, name: true },
      });
      if (!sku) throw new NotFoundException(`SKU not found by makerCode: ${v}`);
      return sku;
    }

    const code = this.normSkuCode(v);
    const sku = await this.prisma.sku.findUnique({
      where: { code },
      select: { id: true, code: true, makerCode: true, name: true },
    });
    if (!sku) throw new NotFoundException(`SKU not found: ${code}`);
    return sku;
  }

  private async resolveLocationByCode(code: string) {
    const c = this.norm(code);
    const loc = await this.prisma.location.findFirst({
      where: { code: c } as any,
      select: { id: true, code: true },
    });
    if (!loc) throw new NotFoundException(`Location not found: ${c}`);
    return loc;
  }

  private async onHand(skuId: string, locationId: string) {
    const agg = await this.prisma.inventoryTx.aggregate({
      where: { skuId, locationId },
      _sum: { qty: true },
    });
    return agg._sum.qty ?? 0;
  }

  async createJob(input: { storeCode: string; title?: string; memo?: string }) {
    const storeCode = this.norm(input.storeCode);
    if (!storeCode) throw new BadRequestException('storeCode is required');

    return this.prisma.job.create({
      data: {
        storeCode,
        title: input.title?.trim() || null,
        memo: input.memo?.trim() || null,
        status: 'open',
      } as any,
    } as any);
  }

  async listJobs(opts: { date?: string }) {
    if (!opts.date) {
      return this.prisma.job.findMany({
        orderBy: { createdAt: 'desc' } as any,
        take: 200,
      } as any);
    }

    const d = opts.date;
    if (!/^\d{8}$/.test(d)) throw new BadRequestException('date must be YYYYMMDD');

    const start = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    return this.prisma.job.findMany({
      where: { createdAt: { gte: start, lt: end } } as any,
      orderBy: { createdAt: 'desc' } as any,
      take: 500,
    } as any);
  }

  async getJob(jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId } as any,
      include: {
        items: {
          include: { sku: { select: { code: true, makerCode: true, name: true } } },
        } as any,
        parcel: true,
      } as any,
    } as any);

    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);
    return job;
  }

  async addItems(jobId: string, items: Array<{ skuCode?: string; makerCode?: string; qty: number }>) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } as any });
    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);
    if (!items?.length) throw new BadRequestException('items is required');

    const created: any[] = [];

    for (const it of items) {
      const qty = Math.floor(Number(it.qty));
      if (!Number.isFinite(qty) || qty <= 0) throw new BadRequestException('qty must be >= 1');

      let sku: any = null;

      if (it.makerCode) {
        sku = await this.prisma.sku.findFirst({
          where: { makerCode: this.norm(it.makerCode) },
          select: { id: true, makerCode: true },
        });
      } else if (it.skuCode) {
        sku = await this.prisma.sku.findUnique({
          where: { code: this.normSkuCode(it.skuCode) },
          select: { id: true, makerCode: true },
        });
      } else {
        throw new BadRequestException('skuCode or makerCode is required for each item');
      }

      if (!sku) throw new NotFoundException('SKU not found for item');

      const row = await this.prisma.jobItem.create({
        data: {
          jobId,
          skuId: sku.id,
          qtyPlanned: qty,
          qtyPicked: 0,
          makerCodeSnapshot: sku.makerCode ?? null,
        } as any,
      } as any);

      created.push(row);
    }

    await this.prisma.job.update({
      where: { id: jobId } as any,
      data: { status: 'picking' } as any,
    } as any);

    return created;
  }

  async upsertParcel(jobId: string, input: any) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } as any });
    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);

    return this.prisma.jobParcel.upsert({
      where: { jobId } as any,
      create: { jobId, ...input } as any,
      update: { ...input } as any,
    } as any);
  }

  async scan(jobId: string, dto: { value: string; qty?: number; locationCode?: string }) {
    const job: any = await this.prisma.job.findUnique({
      where: { id: jobId } as any,
      include: { items: true, parcel: true } as any,
    } as any);
    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);

    const qty = Math.floor(Number(dto.qty ?? 1));
    if (!Number.isFinite(qty) || qty <= 0) throw new BadRequestException('qty must be >= 1');

    const sku = await this.resolveSkuByValue(dto.value);

    const item = (job.items as any[]).find(
      (x) => x.skuId === sku.id && (x.qtyPicked ?? 0) < x.qtyPlanned,
    );
    if (!item) throw new BadRequestException('This SKU is not in job, or already completed');

    const remain = item.qtyPlanned - (item.qtyPicked ?? 0);
    if (remain < qty) throw new BadRequestException(`Exceeds remaining qty. remain=${remain}, scan=${qty}`);

    let locationId: string | null = null;
    let usedLocationCode: string | null = null;

    // 1) 요청 위치 우선
    if (dto.locationCode) {
      const req = await this.resolveLocationByCode(dto.locationCode);
      const current = await this.onHand(sku.id, req.id);
      if (current >= qty) {
        locationId = req.id;
        usedLocationCode = req.code;
      }
    }

    // 2) 자동 위치(재고 많은 곳 우선)
    if (!locationId) {
      const candidates: any[] = await this.prisma.inventoryTx.groupBy({
        by: ['locationId'],
        where: { skuId: sku.id },
        _sum: { qty: true },
      } as any);

      const filtered = candidates
        .filter((c) => !!c.locationId)
        .sort((a, b) => (b._sum?.qty ?? 0) - (a._sum?.qty ?? 0));

      const pick = filtered.find((c) => (c._sum?.qty ?? 0) >= qty);
      if (!pick?.locationId) {
        const total = filtered.reduce((acc, c) => acc + (c._sum?.qty ?? 0), 0);
        throw new BadRequestException(`Insufficient stock. total=${total}, requested=${qty}`);
      }

      const loc = await this.prisma.location.findUnique({
        where: { id: pick.locationId } as any,
        select: { id: true, code: true },
      } as any);

      if (!loc) throw new NotFoundException(`Location not found by id: ${pick.locationId}`);

      locationId = loc.id;
      usedLocationCode = loc.code;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const invTx = await tx.inventoryTx.create({
        data: {
          skuId: sku.id,
          locationId,
          qty: -qty,
          type: 'out',
        } as any,
      } as any);

      const updatedItem = await tx.jobItem.update({
        where: { id: item.id } as any,
        data: { qtyPicked: { increment: qty } } as any,
      } as any);

      const items = await tx.jobItem.findMany({ where: { jobId } as any } as any);
      const done = items.every((x: any) => (x.qtyPicked ?? 0) >= x.qtyPlanned);

      if (done) {
        await tx.job.update({
          where: { id: jobId } as any,
          data: { status: 'done', doneAt: new Date() } as any,
        } as any);
      }

      return { invTx, updatedItem, done };
    });

    return {
      ok: true,
      usedLocationCode,
      sku,
      picked: result.updatedItem,
      jobDone: result.done,
      inventoryTx: result.invTx,
    };
  }

  async markDone(jobId: string) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } as any });
    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);

    return this.prisma.job.update({
      where: { id: jobId } as any,
      data: { status: 'done', doneAt: new Date() } as any,
    } as any);
  }

  
  async exportXlsxByStore(opts: { date: string }) {
    const date = this.norm(opts?.date);
    if (!date) throw new BadRequestException('date is required (YYYY-MM-DD)');

    // KST(Asia/Seoul) 기준 하루 범위
    const start = new Date(`${date}T00:00:00+09:00`);
    const end = new Date(`${date}T23:59:59.999+09:00`);

    const jobs: any[] = await this.prisma.job.findMany({
      where: { createdAt: { gte: start, lte: end } } as any,
      include: {
        items: {
          include: { sku: { select: { code: true, makerCode: true, name: true } } },
        } as any,
        parcel: true,
      } as any,
      orderBy: { createdAt: 'asc' } as any,
    } as any);

    const rows = jobs.flatMap((job: any) =>
      (job.items ?? []).map((it: any) => ({
        storeCode: job.storeCode,
        jobId: job.id,
        title: job.title ?? '',
        status: job.status ?? '',
        createdAt: job.createdAt,
        skuCode: it.sku?.code ?? '',
        makerCode: it.sku?.makerCode ?? '',
        name: it.sku?.name ?? '',
        qtyPlanned: it.qtyPlanned ?? 0,
        qtyPicked: it.qtyPicked ?? 0,
        carrier: job.parcel?.carrier ?? '',
        waybillNo: job.parcel?.waybillNo ?? '',
      })),
    );

    const byStore = new Map<string, any[]>();
    for (const r of rows) {
      const key = String(r.storeCode ?? 'UNKNOWN');
      if (!byStore.has(key)) byStore.set(key, []);
      byStore.get(key)!.push(r);
    }

    const wb = new ExcelJS.Workbook();

    const wsSum = wb.addWorksheet('SUMMARY');
    wsSum.columns = [
      { header: 'storeCode', key: 'storeCode', width: 12 },
      { header: 'lines', key: 'lines', width: 10 },
      { header: 'qtyPlannedSum', key: 'qtyPlannedSum', width: 14 },
      { header: 'qtyPickedSum', key: 'qtyPickedSum', width: 14 },
    ];
    wsSum.getRow(1).font = { bold: true };

    for (const [storeCode, list] of byStore.entries()) {
      wsSum.addRow({
        storeCode,
        lines: list.length,
        qtyPlannedSum: list.reduce((a, x) => a + (x.qtyPlanned ?? 0), 0),
        qtyPickedSum: list.reduce((a, x) => a + (x.qtyPicked ?? 0), 0),
      });
    }

    const columns: any[] = [
      { header: 'storeCode', key: 'storeCode', width: 12 },
      { header: 'jobId', key: 'jobId', width: 26 },
      { header: 'title', key: 'title', width: 22 },
      { header: 'status', key: 'status', width: 10 },
      { header: 'skuCode', key: 'skuCode', width: 22 },
      { header: 'makerCode', key: 'makerCode', width: 18 },
      { header: 'name', key: 'name', width: 28 },
      { header: 'qtyPlanned', key: 'qtyPlanned', width: 10 },
      { header: 'qtyPicked', key: 'qtyPicked', width: 10 },
      { header: 'carrier', key: 'carrier', width: 10 },
      { header: 'waybillNo', key: 'waybillNo', width: 18 },
    ];

    for (const [storeCode, list] of byStore.entries()) {
      const sheetName = String(storeCode).slice(0, 31);
      const ws = wb.addWorksheet(sheetName);
      ws.columns = columns as any;
      ws.addRows(list as any);
      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
    }

    const out: any = await wb.xlsx.writeBuffer();
    return Buffer.isBuffer(out) ? out : Buffer.from(out);
  }

  // ✅ EPMS Export Source (Dashboard CSV용)
  // GET /jobs/export-source?date=YYYY-MM-DD
  // - 특정 날짜(KST) 기준 "완료(done)"된 작지 전체
  // - items 포함 (qtyPicked 기준으로 프론트에서 CSV 생성)
  async exportSource(opts: { date: string }) {
    const date = this.norm(opts?.date);
    if (!date) throw new BadRequestException('date is required (YYYY-MM-DD)');

    // KST(Asia/Seoul) 기준 하루 범위
    const start = new Date(`${date}T00:00:00+09:00`);
    const end = new Date(`${date}T23:59:59.999+09:00`);

    const jobs: any[] = await this.prisma.job.findMany({
      where: {
        status: 'done',
        doneAt: { gte: start, lte: end },
      } as any,
      include: {
        items: {
          include: { sku: { select: { code: true, makerCode: true, name: true } } },
        } as any,
      },
      orderBy: [{ storeCode: 'asc' }, { doneAt: 'asc' }] as any,
    });

    return jobs.map((job: any) => ({
      id: job.id,
      storeCode: job.storeCode,
      status: job.status,
      doneAt: job.doneAt,
      items: (job.items || []).map((it: any) => ({
        id: it.id,
        qtyPlanned: it.qtyPlanned,
        qtyPicked: it.qtyPicked,
        makerCodeSnapshot: it.makerCodeSnapshot,
        sku: it.sku,
      })),
    }));
  }


  // ✅ 삭제 API
  // - 다른 로직(재고 롤백 등) 건드리지 않음
  // - JobItem / JobParcel 먼저 삭제 후 Job 삭제
  async deleteJob(jobId: string) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } as any } as any);
    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);

    await this.prisma.$transaction([
      this.prisma.jobItem.deleteMany({ where: { jobId } as any } as any),
      this.prisma.jobParcel.deleteMany({ where: { jobId } as any } as any),
      this.prisma.job.delete({ where: { id: jobId } as any } as any),
    ]);

    return { ok: true, id: jobId };
  }

// ✅ 반품입고용: 재고는 건드리지 않고 Job 진행률만 올림
  async receive(jobId: string, dto: { value: string; qty?: number }) {
    const job: any = await this.prisma.job.findUnique({
      where: { id: jobId } as any,
      include: { items: true } as any,
    } as any);
    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);

    const qtyReq = Math.floor(Number(dto.qty ?? 1));
    if (!Number.isFinite(qtyReq) || qtyReq <= 0) throw new BadRequestException('qty must be >= 1');

    const sku = await this.resolveSkuByValue(dto.value);

    // 남은 수량이 있는 아이템 찾기
    const item = (job.items as any[]).find(
      (x) => x.skuId === sku.id && (x.qtyPicked ?? 0) < x.qtyPlanned,
    );
    if (!item) throw new BadRequestException('This SKU is not in job, or already completed');

    const remaining = (item.qtyPlanned ?? 0) - (item.qtyPicked ?? 0);
    const applyQty = Math.min(qtyReq, remaining);
    if (applyQty <= 0) throw new BadRequestException('Already completed');

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedItem = await tx.jobItem.update({
        where: { id: item.id } as any,
        data: { qtyPicked: { increment: applyQty } } as any,
      } as any);

      const items = await tx.jobItem.findMany({ where: { jobId } as any } as any);
      const done = items.every((x: any) => (x.qtyPicked ?? 0) >= x.qtyPlanned);

      if (done) {
        await tx.job.update({
          where: { id: jobId } as any,
          data: { status: 'done', doneAt: new Date() } as any,
        } as any);
      }

      return { updatedItem, done };
    });

    return {
      ok: true,
      sku,
      picked: result.updatedItem,
      jobDone: result.done,
      appliedQty: applyQty,
    };
  }
}

  

