import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  // ✅ C안: Job 단위 실재고 우선 토글
  async setAllowOverpick(jobId: string, allowOverpick: boolean) {
    const job = await this.prisma.job.update({
      where: { id: jobId } as any,
      data: { allowOverpick } as any,
      select: { id: true, allowOverpick: true } as any,
    } as any);

    return { ok: true, ...job };
  }

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

    // 숫자열이면 makerCode(바코드)로 먼저 찾기
    if (this.isLikelyBarcode(v)) {
      const found = await this.prisma.sku.findFirst({
        where: { makerCode: v } as any,
        select: { id: true, sku: true, makerCode: true, name: true },
      });
      if (found) return found;
    }

    // 아니면 skuCode로 찾기
    const code = this.normSkuCode(v);
    const sku = await this.prisma.sku.findUnique({
      where: { sku: code } as any,
      select: { id: true, sku: true, makerCode: true, name: true },
    });
    if (!sku) throw new NotFoundException(`SKU not found: ${code}`);
    return sku;
  }

  private async resolveLocationByCode(code: string) {
    const c = this.norm(code);
    if (!c) throw new BadRequestException('locationCode is required');

    const loc = await this.prisma.location.findFirst({
      where: { code: c } as any,
      select: { id: true, code: true },
    });
    if (!loc) throw new NotFoundException(`Location not found: ${c}`);
    return loc;
  }

  // ✅ 전산 재고 = 강제출고(isForced=true) 제외한 합
  private async onHand(skuId: string, locationId: string) {
    const agg = await this.prisma.inventoryTx.aggregate({
      where: { skuId, locationId, isForced: false } as any,
      _sum: { qty: true },
    } as any);
    return Number(agg._sum?.qty ?? 0);
  }

  async createJob(input: any) {
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
    if (!opts?.date) {
      return this.prisma.job.findMany({
        orderBy: { createdAt: 'desc' } as any,
        take: 200,
      } as any);
    }

    const date = this.norm(opts.date);
    const start = new Date(`${date}T00:00:00+09:00`);
    const end = new Date(`${date}T23:59:59.999+09:00`);

    return this.prisma.job.findMany({
      where: { createdAt: { gte: start, lte: end } } as any,
      orderBy: { createdAt: 'desc' } as any,
      take: 500,
    } as any);
  }

  async getJob(jobId: string) {
    const job: any = await this.prisma.job.findUnique({
      where: { id: jobId } as any,
      include: {
        items: {
          include: {
            sku: { select: { sku: true, makerCode: true, name: true } },
          } as any,
        } as any,
        parcel: true,
      } as any,
    } as any);

    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);

    return {
      ...job,
      items: (job.items || []).map((it: any) => ({
        ...it,
        skuCode: it.sku?.sku ?? null,
        makerCode: it.sku?.makerCode ?? null,
        name: it.sku?.name ?? null,
      })),
    };
  }

  async addItems(jobId: string, items: { skuCode?: string; makerCode?: string; qty: number }[]) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } as any });
    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);
    if (!Array.isArray(items) || items.length === 0) throw new BadRequestException('items is required');

    const normItems = items
      .map((x) => ({
        skuCode: x.skuCode ? this.normSkuCode(x.skuCode) : undefined,
        makerCode: x.makerCode ? this.norm(x.makerCode) : undefined,
        qty: Math.floor(Number(x.qty)),
      }))
      .filter((x) => Number.isFinite(x.qty) && x.qty > 0 && (x.skuCode || x.makerCode));

    if (!normItems.length) throw new BadRequestException('no valid items');

    const skuList = await Promise.all(
      normItems.map(async (it) => {
        if (it.makerCode) {
          const found = await this.prisma.sku.findFirst({
            where: { makerCode: it.makerCode } as any,
            select: { id: true, sku: true, makerCode: true, name: true },
          });
          if (found) return found;
        }

        if (it.skuCode) {
          const found = await this.prisma.sku.findUnique({
            where: { sku: it.skuCode } as any,
            select: { id: true, sku: true, makerCode: true, name: true },
          });
          if (found) return found;
        }

        if (!it.skuCode) throw new BadRequestException('skuCode is required when sku not found');
        return this.prisma.sku.create({
          data: { sku: it.skuCode, makerCode: it.makerCode ?? null } as any,
          select: { id: true, sku: true, makerCode: true, name: true },
        });
      }),
    );

    const bySku = new Map<string, { skuId: string; qty: number }>();
    for (let i = 0; i < normItems.length; i++) {
      const sku = skuList[i];
      const it = normItems[i];
      const cur = bySku.get(sku.id) || { skuId: sku.id, qty: 0 };
      cur.qty += it.qty;
      bySku.set(sku.id, cur);
    }

    for (const r of bySku.values()) {
      await this.prisma.jobItem.upsert({
        where: { jobId_skuId: { jobId, skuId: r.skuId } } as any,
        create: { jobId, skuId: r.skuId, qtyPlanned: r.qty, qtyPicked: 0 } as any,
        update: { qtyPlanned: { increment: r.qty } } as any,
      } as any);
    }

    return this.getJob(jobId);
  }

  async upsertParcel(jobId: string, input: any) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } as any });
    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);
    const allowOverpick = Boolean(job.allowOverpick);
    return this.prisma.jobParcel.upsert({
      where: { jobId } as any,
      create: { jobId, ...(input as any) } as any,
      update: { ...(input as any) } as any,
    } as any);
  }

  /**
   * ✅ 스캔 (강제출고 연결 버전)
   * body 예시:
   * {
   *   "barcode": "...." | "skuCode": "...." | "value": "....",
   *   "qty": 1,
   *   "locationCode": "A-11",
   *   "force": true,
   *   "forceReason": "전산 미반영"
   * }
   */
  async scan(
  jobId: string,
  dto: {
    value?: string;
    barcode?: string;
    skuCode?: string;
    qty?: number;
    locationCode?: string;
    force?: boolean;
    forceReason?: string;
  },
) {
  const job: any = await this.prisma.job.findUnique({
    where: { id: jobId } as any,
    include: { items: true, parcel: true } as any,
  } as any);
  if (!job) throw new NotFoundException(`Job not found: ${jobId}`);

  // ✅ C안 토글
  const allowOverpick = Boolean((job as any).allowOverpick);

  const qty = Math.floor(Number(dto.qty ?? 1));
  if (!Number.isFinite(qty) || qty <= 0) throw new BadRequestException('qty must be >= 1');

  const scanValue = String(dto.value ?? dto.barcode ?? dto.skuCode ?? '').trim();
  if (!scanValue) throw new BadRequestException('barcode (or skuCode/value) is required');

  const sku = await this.resolveSkuByValue(scanValue);

  const item = (job.items as any[]).find((x) => x.skuId === sku.id && (x.qtyPicked ?? 0) < x.qtyPlanned);
  if (!item) throw new BadRequestException('This SKU is not in job, or already completed');

  const remain = item.qtyPlanned - (item.qtyPicked ?? 0);
  if (remain < qty) throw new BadRequestException(`Exceeds remaining qty. remain=${remain}, scan=${qty}`);

  const force = Boolean(dto.force);
  const forceReason = this.norm(dto.forceReason) || 'FORCED_SCAN';

  // ✅ 강제 스캔이면 locationCode 필수 (어디서 출고 로그 남길지)
  if (force && !dto.locationCode) {
    throw new BadRequestException('For forced scan, locationCode is required');
  }

  // ✅ C안: allowOverpick인데 재고가 0일 수도 있으니,
  // "어느 로케이션에서 꺼냈는지" 기록이 필요함 → locationCode 없으면 안내
  if (allowOverpick && !dto.locationCode) {
    throw new BadRequestException('Overpick enabled. locationCode is required to record where you picked from.');
  }

  // location 결정: (1) 요청 location에서 충분하면 사용
  let locationId: string | null = null;
  let usedLocationCode: string | null = null;

  if (dto.locationCode) {
    const reqLoc = await this.resolveLocationByCode(dto.locationCode);
    const have = await this.onHand(sku.id, reqLoc.id);

    // ✅ allowOverpick이면 "부족해도" 해당 location을 사용(기록 목적)
    if (have >= qty || force || allowOverpick) {
      locationId = reqLoc.id;
      usedLocationCode = reqLoc.code;
    }
  }

  // (2) 충분한 location 자동 선택 (force가 아니면)
  if (!locationId && !force) {
    const groups: any[] = await this.prisma.inventoryTx.groupBy({
      by: ['locationId'],
      where: { skuId: sku.id, isForced: false } as any,
      _sum: { qty: true },
    } as any);

    const sorted = groups
      .filter((g) => !!g.locationId)
      .sort((a, b) => (b._sum?.qty ?? 0) - (a._sum?.qty ?? 0));

    // ✅ allowOverpick이면 "충분한 곳"이 없어도 가장 많은 곳 선택
    const pick = allowOverpick ? sorted[0] : sorted.find((g) => (g._sum?.qty ?? 0) >= qty);

    if (pick?.locationId) {
      const loc = await this.prisma.location.findUnique({
        where: { id: pick.locationId } as any,
        select: { id: true, code: true },
      } as any);
      if (!loc) throw new NotFoundException(`Location not found by id: ${pick.locationId}`);
      locationId = loc.id;
      usedLocationCode = loc.code;
    }
  }

  // force가 아니고도 location이 없으면 재고 부족
  if (!locationId) {
    const groups: any[] = await this.prisma.inventoryTx.groupBy({
      by: ['locationId'],
      where: { skuId: sku.id, isForced: false } as any,
      _sum: { qty: true },
    } as any);

    const total = groups.reduce((acc, g) => acc + Number(g._sum?.qty ?? 0), 0);

    // ✅ allowOverpick이면 여기까지 오면 "location 기록 불가" 케이스
    if (allowOverpick) {
      throw new BadRequestException(
        `Overpick enabled but no location could be resolved. Provide locationCode. total=${total}, requested=${qty}`,
      );
    }

    throw new BadRequestException(`Insufficient stock. total=${total}, requested=${qty}`);
  }

  // ✅ 트랜잭션: tx 생성 + picked 증가 + done 처리
  const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const before = await tx.inventoryTx
      .aggregate({
        where: { skuId: sku.id, locationId, isForced: false } as any,
        _sum: { qty: true },
      } as any)
      .then((a: any) => Number(a._sum?.qty ?? 0));

    // 부족인데 force/allowOverpick 아니면 막기
    if (before < qty && !(force || allowOverpick)) {
      throw new BadRequestException(`Insufficient stock. total=${before}, requested=${qty}`);
    }

    // ✅ allowOverpick이면 강제 처리로 기록
    const isForced = (force || allowOverpick) && before < qty;
    const forcedReason = isForced ? (force ? forceReason : 'ALLOW_OVERPICK') : null;

    const invTx = await tx.inventoryTx.create({
      data: {
        skuId: sku.id,
        locationId,
        qty: -qty,
        type: 'out',
        isForced,
        forcedReason,
        beforeQty: before,
        afterQty: isForced ? before : before - qty, // ✅ 강제면 전산 유지
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
    overpick:
      result.invTx?.isForced && (result.invTx?.forcedReason === 'ALLOW_OVERPICK')
        ? {
            requested: qty,
            beforeQty: Number(result.invTx.beforeQty ?? 0),
            shortage: Math.max(0, qty - Number(result.invTx.beforeQty ?? 0)),
          }
        : null,
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

    const start = new Date(`${date}T00:00:00+09:00`);
    const end = new Date(`${date}T23:59:59.999+09:00`);

    const jobs: any[] = await this.prisma.job.findMany({
      where: { createdAt: { gte: start, lte: end } } as any,
      include: {
        items: { include: { sku: { select: { sku: true, makerCode: true, name: true } } } } as any,
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
        skuCode: it.sku?.sku ?? '',
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
      { header: 'count', key: 'count', width: 10 },
    ] as any;
    for (const [storeCode, list] of byStore.entries()) {
      wsSum.addRow({ storeCode, count: list.length });
    }
    wsSum.getRow(1).font = { bold: true };
    wsSum.views = [{ state: 'frozen', ySplit: 1 }];

    const columns = [
      { header: 'storeCode', key: 'storeCode', width: 12 },
      { header: 'jobId', key: 'jobId', width: 28 },
      { header: 'title', key: 'title', width: 24 },
      { header: 'status', key: 'status', width: 10 },
      { header: 'createdAt', key: 'createdAt', width: 22 },
      { header: 'skuCode', key: 'skuCode', width: 20 },
      { header: 'makerCode', key: 'makerCode', width: 18 },
      { header: 'name', key: 'name', width: 28 },
      { header: 'qtyPlanned', key: 'qtyPlanned', width: 12 },
      { header: 'qtyPicked', key: 'qtyPicked', width: 12 },
      { header: 'carrier', key: 'carrier', width: 12 },
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

  async exportSource(opts: { date: string }) {
    const date = this.norm(opts?.date);
    if (!date) throw new BadRequestException('date is required');

    const start = new Date(`${date}T00:00:00+09:00`);
    const end = new Date(`${date}T23:59:59.999+09:00`);

    const jobs: any[] = await this.prisma.job.findMany({
      where: { status: 'done', doneAt: { gte: start, lte: end } } as any,
      include: { items: { include: { sku: { select: { sku: true, makerCode: true, name: true } } } } as any } as any,
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

  async deleteJob(jobId: string) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } as any });
    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);

    await this.prisma.jobParcel.deleteMany({ where: { jobId } as any } as any);
    await this.prisma.jobItem.deleteMany({ where: { jobId } as any } as any);

    return this.prisma.job.delete({ where: { id: jobId } as any } as any);
  }
 

}
