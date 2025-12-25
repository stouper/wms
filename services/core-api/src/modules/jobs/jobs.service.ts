import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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

  // ✅ Planned 초과(추가피킹) 승인 — 버튼/권한으로만 사용
  async approveExtra(jobId: string, jobItemId: string, qty: number) {
    const n = Number(qty || 0);
    if (!Number.isFinite(n) || n <= 0) {
      throw new BadRequestException('qty must be > 0');
    }

    const item = await this.prisma.jobItem.findFirst({
      where: { id: jobItemId, jobId } as any,
      select: { id: true, jobId: true, skuId: true, extraApprovedQty: true, extraPickedQty: true } as any,
    } as any);

    if (!item) throw new NotFoundException('JobItem not found');

    const updated = await this.prisma.jobItem.update({
      where: { id: jobItemId } as any,
      data: { extraApprovedQty: { increment: n } as any } as any,
      include: { sku: true } as any,
    } as any);

    return {
      ok: true,
      jobId,
      jobItemId,
      approvedAdded: n,
      extraApprovedQty: (updated as any).extraApprovedQty,
      extraPickedQty: (updated as any).extraPickedQty,
      sku: (updated as any).sku,
    };
  }

  private norm(v?: string | null) {
    return (v ?? '').trim();
  }
  private normSkuCode(v?: string | null) {
    return this.norm(v).toUpperCase();
  }
  private isLikelyBarcode(v: string) {
    const s = this.norm(v);
    if (!s) return false;
    // 숫자만 8~20자리면 바코드로 간주
    if (/^\d{8,20}$/.test(s)) return true;
    // 하이픈/영문 섞인 케이스는 SKU로 볼 확률 높음
    return false;
  }

  async createJob(dto: { storeCode: string; title?: string }) {
    const storeCode = this.norm(dto.storeCode);
    if (!storeCode) throw new BadRequestException('storeCode is required');

    return this.prisma.job.create({
      data: {
        storeCode,
        title: this.norm(dto.title) || null,
      } as any,
    } as any);
  }

  async listJobs() {
    return this.prisma.job.findMany({
      orderBy: { createdAt: 'desc' } as any,
      include: { items: { include: { sku: true } } } as any,
    } as any);
  }

  async getJob(jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId } as any,
      include: {
        items: {
          include: { sku: true },
        },
      } as any,
    } as any);

    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);
    return job;
  }

  async addItems(
  jobId: string,
  dto: { items: Array<{ skuCode?: string; makerCode?: string; qty?: number; qtyPlanned?: number }> },
) {
  const job = await this.prisma.job.findUnique({ where: { id: jobId } as any } as any);
  if (!job) throw new NotFoundException(`Job not found: ${jobId}`);

  const rawItems = (dto.items || []).map((x) => {
    const qty = Number(x.qtyPlanned ?? x.qty ?? 0);
    const skuCode = x.skuCode ? this.normSkuCode(x.skuCode) : '';
    const makerCode = x.makerCode ? this.norm(x.makerCode) : '';
    return { qty, skuCode, makerCode };
  });

  // 0) 유효한 입력만
  const valid = rawItems.filter((it) => (it.skuCode || it.makerCode) && Number.isFinite(it.qty) && it.qty > 0);
  if (!valid.length) return { ok: true, createdCount: 0, updatedCount: 0 };

  // 1) SKU 확보(없으면 생성) + 스냅샷 준비
  const resolved: Array<{
    skuId: string;
    qty: number;
    makerCodeSnapshot: string | null;
    nameSnapshot: string | null;
  }> = [];

  for (const it of valid) {
    let sku: any = null;

    if (it.skuCode) {
      // code/sku 혼재 안전 대응
      sku =
        (await (this.prisma as any).sku.findUnique({ where: { sku: it.skuCode } as any }).catch(() => null)) ||
        (await (this.prisma as any).sku.findUnique({ where: { code: it.skuCode } as any }).catch(() => null));
    }
    if (!sku && it.makerCode) {
      sku = await this.prisma.sku.findFirst({ where: { makerCode: it.makerCode } as any } as any);
    }

    if (!sku) {
      sku = await this.prisma.sku.create({
        data: {
          code: (it.skuCode || `AUTO-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`).toUpperCase(),
          makerCode: it.makerCode || null,
          name: null,
        } as any,
      } as any);
    } else {
      // makerCode가 들어왔는데 sku에 없으면 채우기
      if (it.makerCode && !sku.makerCode) {
        await this.prisma.sku.update({
          where: { id: sku.id } as any,
          data: { makerCode: it.makerCode } as any,
        } as any);
      }
    }

    resolved.push({
      skuId: sku.id,
      qty: it.qty,
      makerCodeSnapshot: sku.makerCode || it.makerCode || null,
      nameSnapshot: sku.name || null,
    });
  }

  // 2) 같은 skuId끼리 qty 합산 (중복 제거)
  const bySku = new Map<
    string,
    { skuId: string; qty: number; makerCodeSnapshot: string | null; nameSnapshot: string | null }
  >();

  for (const r of resolved) {
    const cur = bySku.get(r.skuId);
    if (!cur) {
      bySku.set(r.skuId, {
        skuId: r.skuId,
        qty: r.qty,
        makerCodeSnapshot: r.makerCodeSnapshot,
        nameSnapshot: r.nameSnapshot,
      });
    } else {
      cur.qty += r.qty;
      if (!cur.makerCodeSnapshot && r.makerCodeSnapshot) cur.makerCodeSnapshot = r.makerCodeSnapshot;
      if (!cur.nameSnapshot && r.nameSnapshot) cur.nameSnapshot = r.nameSnapshot;
    }
  }

  const merged = Array.from(bySku.values());
  if (!merged.length) return { ok: true, createdCount: 0, updatedCount: 0 };

  // 3) 기존 jobItem 있으면 누적(update), 없으면 생성(create)
  const results = await this.prisma.$transaction(async (tx) => {
    let createdCount = 0;
    let updatedCount = 0;

    for (const m of merged) {
      const existing = await tx.jobItem.findFirst({
        where: { jobId, skuId: m.skuId } as any,
        select: { id: true } as any,
      } as any);

      if (existing) {
        await tx.jobItem.update({
          where: { id: existing.id } as any,
          data: {
            qtyPlanned: { increment: m.qty } as any,
            makerCodeSnapshot: m.makerCodeSnapshot ?? undefined,
            nameSnapshot: m.nameSnapshot ?? undefined,
          } as any,
        } as any);
        updatedCount++;
      } else {
        await tx.jobItem.create({
          data: {
            jobId,
            skuId: m.skuId,
            qtyPlanned: m.qty,
            qtyPicked: 0,
            makerCodeSnapshot: m.makerCodeSnapshot,
            nameSnapshot: m.nameSnapshot,
          } as any,
        } as any);
        createdCount++;
      }
    }

    return { createdCount, updatedCount };
  });

  return { ok: true, ...results };
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
    const job = await this.prisma.job.findUnique({
      where: { id: jobId } as any,
      include: { items: true } as any,
    } as any);
    if (!job) throw new NotFoundException('Job not found');

    const allowOverpick = Boolean((job as any).allowOverpick);

    const raw = this.norm(dto.value || dto.barcode || dto.skuCode);
    if (!raw) throw new BadRequestException('value/barcode/skuCode is required');

    const qty = Number(dto.qty ?? 1);
    if (!Number.isFinite(qty) || qty <= 0) throw new BadRequestException('qty must be > 0');

    const force = Boolean(dto.force);
    const forceReason = this.norm(dto.forceReason);

    const locationCode = this.norm(dto.locationCode); // ✅ 선택값 (RF 스캔에서는 없을 수 있음)

    // 1) sku 찾기: barcode(숫자) 우선 makerCode, 아니면 skuCode
    let sku: any = null;
    if (this.isLikelyBarcode(raw)) {
      sku = await this.prisma.sku.findFirst({ where: { makerCode: raw } as any } as any);
    }
    if (!sku) {
      const code = this.normSkuCode(raw);
      // ✅ 스키마가 code vs sku로 섞여 있어도 안전하게
      sku =
        (await (this.prisma as any).sku.findUnique({ where: { sku: code } as any }).catch(() => null)) ||
        (await (this.prisma as any).sku.findUnique({ where: { code } as any }).catch(() => null));
    }
    if (!sku) throw new NotFoundException(`SKU not found: ${raw}`);

    // 2) jobItem 찾기
    const item = (job as any).items?.find((it: any) => it.skuId === sku.id);
    if (!item) throw new NotFoundException('This SKU is not in this job');

    // 3) location lookup (있을 때만). 없으면 tx 안에서 자동 선택한다.
    let scannedLocation: any = null;
    if (locationCode) {
      scannedLocation = await this.prisma.location.findFirst({ where: { code: locationCode } as any } as any);
      if (!scannedLocation) throw new NotFoundException(`Location not found: ${locationCode}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // 4-0) ✅ Planned(요청수량) 초과 방지 + (승인된) 추가피킹 허용
      const freshItem = await tx.jobItem.findUnique({
        where: { id: item.id } as any,
        select: { id: true, qtyPlanned: true, qtyPicked: true, extraApprovedQty: true, extraPickedQty: true } as any,
      } as any);

      const planned = Number((freshItem as any)?.qtyPlanned ?? 0);
      const picked = Number((freshItem as any)?.qtyPicked ?? 0);
      const extraApproved = Number((freshItem as any)?.extraApprovedQty ?? 0);
      const extraPicked = Number((freshItem as any)?.extraPickedQty ?? 0);

      // ✅ 완료 자동 반영
      const maybeMarkDone = async (): Promise<boolean> => {
        const items = await tx.jobItem.findMany({
          where: { jobId } as any,
          select: { qtyPlanned: true, qtyPicked: true } as any,
        } as any);

        const isDone = items.length > 0 && items.every((it: any) => Number(it.qtyPicked) >= Number(it.qtyPlanned));
        if (!isDone) return false;

        const current = await tx.job.findUnique({
          where: { id: jobId } as any,
          select: { status: true } as any,
        } as any);

        if ((current as any)?.status !== 'done') {
          await tx.job.update({
            where: { id: jobId } as any,
            data: { status: 'done', doneAt: new Date() } as any,
          } as any);
        }
        return true;
      };

      let extraInc = 0;
      if (planned > 0) {
        const newPicked = picked + qty;
        const exceed = Math.max(0, newPicked - planned);
        const remainingExtra = Math.max(0, extraApproved - extraPicked);

        if (exceed > remainingExtra) {
          throw new ConflictException(
            `[PLANNED_EXCEEDED] planned=${planned}, picked=${picked}, requested=${qty}, exceed=${exceed}, extraRemaining=${remainingExtra}`,
          );
        }
        extraInc = exceed;
      }

      // 4-1) ✅ 사용할 locationId 결정
      let useLocationId: string | null = scannedLocation?.id ?? null;
      let useLocationCode: string | null = scannedLocation?.code ?? null;

      // ✅ RET-01(부족풀)로 직접 스캔된 경우:
      // - RET-01에서는 출고(-)를 하지 않는다.
      // - RET-01에 +qty 적재만 기록하고, jobItem.qtyPicked는 증가시킨다.
      // - ✅ (중요) inventory 테이블도 +qty 증가시켜야 함
      if (useLocationCode === 'RET-01') {
        const poolLoc = scannedLocation ?? (await tx.location.findFirst({ where: { code: 'RET-01' } as any } as any));
        if (!poolLoc) throw new NotFoundException('Return pool location not found: RET-01');

        // ✅ inventory 기준 before/after
        const poolInvRow = await tx.inventory.findUnique({
          where: { skuId_locationId: { skuId: sku.id, locationId: poolLoc.id } } as any,
          select: { qty: true } as any,
        } as any);
        const beforePool = Number(poolInvRow?.qty ?? 0);

        const invTx = await tx.inventoryTx.create({
          data: {
            skuId: sku.id,
            locationId: poolLoc.id,
            qty: +qty,
            type: 'overpick', // ✅ 부족모음(적재) 기록
            isForced: false,
            forcedReason: null,
            beforeQty: beforePool,
            afterQty: beforePool + qty,
          } as any,
        } as any);

        // ✅ inventory 실제 반영 (+qty)
        await tx.inventory.upsert({
          where: { skuId_locationId: { skuId: sku.id, locationId: poolLoc.id } } as any,
          create: { skuId: sku.id, locationId: poolLoc.id, qty: beforePool + qty } as any,
          update: { qty: { increment: qty } as any } as any,
        } as any);

        const updatedItem = await tx.jobItem.update({
          where: { id: item.id } as any,
          data: {
            qtyPicked: { increment: qty } as any,
            extraPickedQty: { increment: extraInc } as any,
            makerCodeSnapshot: (item as any).makerCodeSnapshot ?? sku.makerCode ?? null,
            nameSnapshot: (item as any).nameSnapshot ?? sku.name ?? null,
          } as any,
          include: { sku: true } as any,
        } as any);

        await maybeMarkDone();
        return {
          ok: true,
          status: 'SHORTAGE',
          pickResult: 'SHORTAGE_TO_RET01',
          usedLocationCode: 'RET-01',
          extra: {
            used: extraInc,
            approved: extraApproved,
            picked: extraPicked + extraInc,
            remaining: Math.max(0, extraApproved - (extraPicked + extraInc)),
          },
          sku: {
            id: sku.id,
            sku: (sku as any).sku ?? (sku as any).code ?? null,
            makerCode: (sku as any).makerCode ?? null,
            name: (sku as any).name ?? null,
          },
          picked: {
            id: updatedItem.id,
            jobId,
            skuId: sku.id,
            qtyPlanned: updatedItem.qtyPlanned,
            qtyPicked: updatedItem.qtyPicked,
            makerCodeSnapshot: updatedItem.makerCodeSnapshot,
            nameSnapshot: updatedItem.nameSnapshot,
            createdAt: updatedItem.createdAt,
            updatedAt: updatedItem.updatedAt,
          },
          invTx: invTx ? { id: invTx.id } : null,
        };
      }

      if (!useLocationId) {
        // locationCode 미입력(RF): 전산재고가 있는 로케이션 중 qty가 가장 큰 곳 자동 선택
        let groups: any[] = [];
        try {
          groups = await (tx.inventoryTx as any).groupBy({
            by: ['locationId'],
            where: { skuId: sku.id, isForced: false } as any,
            _sum: { qty: true },
          });
        } catch {
          groups = [];
        }

        const candidates = (groups || [])
          .map((g: any) => ({ locationId: g.locationId, qty: Number(g._sum?.qty ?? 0) }))
          .filter((g: any) => g.locationId && g.qty > 0)
          .sort((a: any, b: any) => b.qty - a.qty);

        const best = candidates[0];
        if (!best) {
          if (force || allowOverpick) {
            useLocationId = null as any;
            useLocationCode = null;
          } else {
            throw new ConflictException(`Insufficient stock. total=0, requested=${qty}`);
          }
        } else {
          useLocationId = best.locationId;
        }

        if (useLocationId) {
          const locRow = await tx.location.findUnique({ where: { id: useLocationId } as any } as any);
          useLocationCode = locRow?.code ?? null;
        }
      }

      // 4-2) 전산재고(before) 계산: ✅ inventory 테이블 기준
      let before = 0;
      if (useLocationId) {
        const invRow = await tx.inventory.findUnique({
          where: { skuId_locationId: { skuId: sku.id, locationId: useLocationId } } as any,
          select: { qty: true } as any,
        } as any);
        before = Number(invRow?.qty ?? 0);
      }

      // 부족인데 force/allowOverpick 아니면 막기 (✅ 409)
      if (before < qty && !(force || allowOverpick)) {
        throw new ConflictException(`Insufficient stock. total=${before}, requested=${qty}`);
      }

      let outQty = qty;
      let shortage = 0;

      // allowOverpick(현장)에서는 선택 로케이션 전산재고만큼만 차감하고,
      // 부족분은 RET-01(부족풀)에 +로 누적한다. (로케이션 음수 방지)
      if (!force && allowOverpick) {
        const avail = Math.max(0, before);
        outQty = Math.min(qty, avail);
        shortage = qty - outQty;
      } else {
        shortage = Math.max(0, qty - before);
      }

      const isForced = (force || allowOverpick) && shortage > 0;
      const forcedReason = isForced ? (force ? forceReason : 'ALLOW_OVERPICK') : null;

      // 4-3) inventory out tx (선택된/스캔된 location에서 -outQty)
      let invTx: any = null;
      if (useLocationId && outQty > 0) {
        invTx = await tx.inventoryTx.create({
          data: {
            skuId: sku.id,
            locationId: useLocationId,
            qty: -outQty,
            type: 'out',
            isForced: force ? isForced : false,
            forcedReason: force ? forcedReason : null,
            beforeQty: before,
            afterQty: before - outQty,
          } as any,
        } as any);

        // ✅✅ (핵심) inventory 테이블 실제 감소 반영
        await tx.inventory.upsert({
          where: { skuId_locationId: { skuId: sku.id, locationId: useLocationId } } as any,
          create: { skuId: sku.id, locationId: useLocationId, qty: before - outQty } as any,
          update: { qty: { decrement: outQty } as any } as any,
        } as any);
      }

      // 4-4) ✅ 부족분은 RET-01(부족풀)로 누적 (shortage만큼)
      if (shortage > 0) {
        const poolLoc = await tx.location.findFirst({ where: { code: 'RET-01' } as any } as any);
        if (!poolLoc) throw new NotFoundException('RET-01 location not found');

        // ✅ inventory 기준 before/after
        const poolInvRow = await tx.inventory.findUnique({
          where: { skuId_locationId: { skuId: sku.id, locationId: poolLoc.id } } as any,
          select: { qty: true } as any,
        } as any);
        const beforePool = Number(poolInvRow?.qty ?? 0);

        await tx.inventoryTx.create({
          data: {
            skuId: sku.id,
            locationId: poolLoc.id,
            qty: +shortage,
            type: 'in',
            isForced: true,
            forcedReason: force ? forcedReason : 'SHORTAGE_TO_RET01',
            beforeQty: beforePool,
            afterQty: beforePool + shortage,
          } as any,
        } as any);

        // ✅✅ inventory 테이블 실제 증가 반영
        await tx.inventory.upsert({
          where: { skuId_locationId: { skuId: sku.id, locationId: poolLoc.id } } as any,
          create: { skuId: sku.id, locationId: poolLoc.id, qty: beforePool + shortage } as any,
          update: { qty: { increment: shortage } as any } as any,
        } as any);

        useLocationCode = 'RET-01';
      }

      // 4-5) jobItem picked 업데이트
      const updatedItem = await tx.jobItem.update({
        where: { id: item.id } as any,
        data: {
          qtyPicked: { increment: qty } as any,
          extraPickedQty: { increment: extraInc } as any,
          makerCodeSnapshot: (item as any).makerCodeSnapshot ?? sku.makerCode ?? null,
          nameSnapshot: (item as any).nameSnapshot ?? sku.name ?? null,
        } as any,
        include: { sku: true } as any,
      } as any);

      await maybeMarkDone();
      return {
        ok: true,
        status: useLocationCode === 'RET-01' ? 'SHORTAGE' : extraInc > 0 ? 'EXTRA' : 'NORMAL',
        pickResult:
          useLocationCode === 'RET-01' ? 'SHORTAGE_TO_RET01' : extraInc > 0 ? 'EXTRA_PICK' : 'NORMAL_PICK',
        usedLocationCode: useLocationCode,
        extra: {
          used: extraInc,
          approved: extraApproved,
          picked: extraPicked + extraInc,
          remaining: Math.max(0, extraApproved - (extraPicked + extraInc)),
        },
        sku: {
          id: sku.id,
          sku: (sku as any).sku ?? (sku as any).code ?? null,
          makerCode: (sku as any).makerCode ?? null,
          name: (sku as any).name ?? null,
        },
        picked: {
          id: updatedItem.id,
          jobId,
          skuId: sku.id,
          qtyPlanned: updatedItem.qtyPlanned,
          qtyPicked: updatedItem.qtyPicked,
          makerCodeSnapshot: updatedItem.makerCodeSnapshot,
          nameSnapshot: updatedItem.nameSnapshot,
          createdAt: updatedItem.createdAt,
          updatedAt: updatedItem.updatedAt,
        },
        invTx: invTx ? { id: invTx.id } : null,
      };
    });
  }

  async exportEpms() {
    const jobs = await this.prisma.job.findMany({
      orderBy: { createdAt: 'desc' } as any,
      include: { items: { include: { sku: true } } } as any,
    } as any);

    const rows: any[] = [];
    for (const j of jobs as any[]) {
      for (const it of j.items || []) {
        rows.push({
          storeCode: j.storeCode,
          jobId: j.id,
          skuCode: it?.sku?.code || '',
          makerCode: it?.makerCodeSnapshot || it?.sku?.makerCode || '',
          qtyPlanned: it?.qtyPlanned || 0,
          qtyPicked: it?.qtyPicked || 0,
          carrier: (j as any).carrier || '',
          waybillNo: (j as any).waybillNo || '',
        });
      }
    }

    const wb = new ExcelJS.Workbook();

    const byStore = new Map<string, any[]>();
    for (const r of rows) {
      if (!byStore.has(r.storeCode)) byStore.set(r.storeCode, []);
      byStore.get(r.storeCode)!.push(r);
    }

    const columns = [
      { header: 'storeCode', key: 'storeCode', width: 12 },
      { header: 'jobId', key: 'jobId', width: 26 },
      { header: 'skuCode', key: 'skuCode', width: 20 },
      { header: 'makerCode', key: 'makerCode', width: 18 },
      { header: 'qtyPlanned', key: 'qtyPlanned', width: 10 },
      { header: 'qtyPicked', key: 'qtyPicked', width: 10 },
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

  /**
   * ✅ 반품 입고(잡 귀속)
   * - Desktop 반품 탭에서 사용
   * - JobItem.qtyPicked 카운팅을 올리고, InventoryTx에는 +qty 로 기록
   * - ✅ (중요) inventory 테이블도 +qty 반영
   */
  async receive(
    jobId: string,
    dto: {
      value?: string;
      barcode?: string;
      skuCode?: string;
      qty?: number;
      locationCode?: string;
    },
  ) {
    const raw = this.norm(dto?.value || dto?.barcode || dto?.skuCode);
    if (!raw) throw new BadRequestException('value/barcode/skuCode is required');

    const qty = Number(dto?.qty ?? 1);
    if (!Number.isFinite(qty) || qty <= 0) throw new BadRequestException('qty must be > 0');

    const locationCode = this.norm(dto?.locationCode) || 'RET-01';

    // 1) job + items
    const job = await this.prisma.job.findUnique({
      where: { id: jobId } as any,
      include: { items: true } as any,
    } as any);
    if (!job) throw new NotFoundException('Job not found');

    // 2) sku 찾기
    let sku: any = null;
    if (this.isLikelyBarcode(raw)) {
      sku = await this.prisma.sku.findFirst({ where: { makerCode: raw } as any } as any);
    }
    if (!sku) {
      const code = this.normSkuCode(raw);
      sku =
        (await (this.prisma as any).sku.findUnique({ where: { sku: code } as any }).catch(() => null)) ||
        (await (this.prisma as any).sku.findUnique({ where: { code } as any }).catch(() => null));
    }
    if (!sku) throw new NotFoundException(`SKU not found: ${raw}`);

    // 3) jobItem 찾기
    const item = (job as any).items?.find((it: any) => it.skuId === sku.id);
    if (!item) throw new NotFoundException('This SKU is not in this job');

    // 4) location lookup (RET-01 기본)
    const loc = await this.prisma.location.findFirst({ where: { code: locationCode } as any } as any);
    if (!loc) throw new NotFoundException(`Location not found: ${locationCode}`);

    // 5) 트랜잭션 처리
    return this.prisma.$transaction(async (tx) => {
      const updatedItem = await tx.jobItem.update({
        where: { id: item.id } as any,
        data: { qtyPicked: { increment: qty } } as any,
        include: { sku: true } as any,
      } as any);

      // inventory before
      const invRow = await tx.inventory.findUnique({
        where: { skuId_locationId: { skuId: sku.id, locationId: loc.id } } as any,
        select: { qty: true } as any,
      } as any);
      const before = Number(invRow?.qty ?? 0);

      // 재고 + 기록
      const invTx = await (tx as any).inventoryTx.create({
        data: {
          type: 'in',
          qty: +qty,
          skuId: sku.id,
          locationId: loc.id,
          jobId,
          jobItemId: item.id,
          isForced: false,
          beforeQty: before,
          afterQty: before + qty,
        } as any,
      });

      // ✅ inventory 테이블 실제 증가 반영
      await tx.inventory.upsert({
        where: { skuId_locationId: { skuId: sku.id, locationId: loc.id } } as any,
        create: { skuId: sku.id, locationId: loc.id, qty: before + qty } as any,
        update: { qty: { increment: qty } as any } as any,
      } as any);

      // ✅ 완료 자동 반영
      const items = await tx.jobItem.findMany({
        where: { jobId } as any,
        select: { qtyPlanned: true, qtyPicked: true } as any,
      } as any);

      const isDone = items.length > 0 && items.every((it: any) => Number(it.qtyPicked) >= Number(it.qtyPlanned));
      if (isDone) {
        const current = await tx.job.findUnique({
          where: { id: jobId } as any,
          select: { status: true } as any,
        } as any);
        if ((current as any)?.status !== 'done') {
          await tx.job.update({
            where: { id: jobId } as any,
            data: { status: 'done', doneAt: new Date() } as any,
          } as any);
        }
      }

      return {
        ok: true,
        usedLocationCode: locationCode,
        sku: { id: sku.id, sku: (sku as any).sku ?? (sku as any).code ?? null, makerCode: sku.makerCode ?? null, name: sku.name ?? null },
        picked: updatedItem,
        invTx: { id: invTx?.id },
        jobStatus: isDone ? 'done' : (job as any).status,
      };
    });
  }

  // ✅ 송장/택배 정보 저장(있으면 업데이트, 없으면 생성)
  async upsertParcel(jobId: string, dto: any) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } as any } as any);
    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);

    const data = {
      jobId,
      ...dto,
    };

    try {
      return await (this.prisma as any).jobParcel.upsert({
        where: { jobId } as any,
        create: data as any,
        update: dto as any,
      });
    } catch (e) {
      await (this.prisma as any).jobParcel.deleteMany({ where: { jobId } as any });
      return await (this.prisma as any).jobParcel.create({ data: data as any });
    }
  }

  // ---------- controller helpers ----------
  async markDone(id: string) {
    return this.prisma.job.update({
      where: { id },
      data: { status: 'done', doneAt: new Date() } as any,
    });
  }

  async deleteJob(id: string) {
    return this.prisma.$transaction(async (tx) => {
      try {
        await (tx as any).jobItem.deleteMany({ where: { jobId: id } });
      } catch {}

      try {
        await (tx as any).jobTx.deleteMany({ where: { jobId: id } });
      } catch {}

      return tx.job.delete({ where: { id } });
    });
  }
}
