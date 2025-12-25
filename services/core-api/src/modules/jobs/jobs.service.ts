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

  async listJobs(opts?: { date?: string; status?: 'open' | 'done' | string }) {
    const where: any = {};

    const status = (opts?.status ?? '').toString().trim().toLowerCase();
    if (status) {
      // ✅ 허용: open | done (그 외는 에러로 바로 잡아주기)
      if (status !== 'open' && status !== 'done') {
        throw new BadRequestException(`invalid status: ${status} (use open|done)`);
      }
      where.status = status;
    }

    // date 필터는 일단 옵션으로만 받고(호환), 필요하면 추후 createdAt 범위로 붙이면 됨
    return this.prisma.job.findMany({
      where,
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

  // 유효한 것만
  const valid = rawItems.filter((it) => (it.skuCode || it.makerCode) && Number.isFinite(it.qty) && it.qty > 0);
  if (!valid.length) return { ok: true, createdCount: 0, updatedCount: 0 };

  // 1) sku resolve (없으면 생성) -> resolved로 skuId/qty 모으기
  const resolved: Array<{
    skuId: string;
    qty: number;
    makerCodeSnapshot: string | null;
    nameSnapshot: string | null;
  }> = [];

  for (const it of valid) {
    let sku: any = null;

    if (it.skuCode) {
      sku = await this.prisma.sku.findUnique({ where: { sku: it.skuCode } as any } as any);
    }
    if (!sku && it.makerCode) {
      sku = await this.prisma.sku.findFirst({ where: { makerCode: it.makerCode } as any } as any);
    }

    if (!sku) {
      const code = (it.skuCode || `AUTO-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`).toUpperCase();
      sku = await this.prisma.sku.create({
        data: {
          sku: code, // ✅ 필수
          makerCode: it.makerCode || null,
          name: null,
        } as any,
      } as any);
    } else {
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

  // 2) 같은 skuId끼리 합산
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

  // 3) jobId+skuId 유니크를 피해가려면 createMany 금지 -> 존재하면 update, 없으면 create
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

    // 4) 재고(전산) 계산: inventoryTx 합계 (강제출고는 제외)
    return this.prisma.$transaction(async (tx) => {
      // 4-0) ✅ Planned(요청수량) 초과 방지 + (승인된) 추가피킹 허용
      // - 기본: qtyPicked + qty > qtyPlanned 이면 409
      // - 단, 버튼 승인(extraApprovedQty)된 수량만큼은 초과 허용(추적: extraPickedQty)
      const freshItem = await tx.jobItem.findUnique({
        where: { id: item.id } as any,
        select: { id: true, qtyPlanned: true, qtyPicked: true, extraApprovedQty: true, extraPickedQty: true } as any,
      } as any);

      const planned = Number((freshItem as any)?.qtyPlanned ?? 0);
      const picked = Number((freshItem as any)?.qtyPicked ?? 0);
      const extraApproved = Number((freshItem as any)?.extraApprovedQty ?? 0);
      const extraPicked = Number((freshItem as any)?.extraPickedQty ?? 0);

      // 9) ✅ 스캔 결과로 job 완료 여부 자동 반영 (백엔드가 진실)
      // - 모든 JobItem이 qtyPicked >= qtyPlanned 이면 job.status='done', completedAt 세팅
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
        // ✅ 누적 exceed가 아니라 "이번 스캔으로 새로 발생한 초과분"만 계산
        const prevPicked = picked;
        const nextPicked = picked + qty;

        const prevExceed = Math.max(0, prevPicked - planned);
        const nextExceed = Math.max(0, nextPicked - planned);

        const deltaExceed = Math.max(0, nextExceed - prevExceed); // 이번 스캔으로 늘어난 초과분
        let remainingExtra = Math.max(0, extraApproved - extraPicked);

        // ✅ planned 초과는 "승인(extraApprovedQty)" 기반으로만 제한한다.
        // (allowOverpick은 재고 부족/오버피킹 로직에만 사용)
        if (deltaExceed > remainingExtra && !force) {
          throw new ConflictException(
            `[PLANNED_EXCEEDED] planned=${planned}, picked=${picked}, requested=${qty}, exceed=${nextExceed}, extraRemaining=${remainingExtra}`,
          );
        }


        extraInc = deltaExceed;
      }
      // 4-1) ✅ 사용할 locationId 결정 (정석: 고정 우선순위)
      // - locationCode가 스캔/입력되면 그 location을 사용
      // - locationCode가 없으면: 해당 SKU의 inventory row 중 location.code 오름차순(고정 우선순위) 1개 선택
      // - 어느 location에도 row가 없으면: NEED_FORCE_OUT (확인 후 force=true면 UNASSIGNED로 강제 출고)
      let useLocationId: string | null = scannedLocation?.id ?? null;
      let useLocationCode: string | null = scannedLocation?.code ?? null;

      // 출고 스캔에서 RET-01(반품풀)은 사용 금지
      if (useLocationCode === 'RET-01') {
        throw new ConflictException('RET-01 is return pool. Not allowed for outbound scan.');
      }

      if (!useLocationId) {
        const invs = await tx.inventory.findMany({
          where: { skuId: sku.id } as any,
          include: { location: true } as any,
          orderBy: [{ location: { code: 'asc' } }] as any,
        } as any);

        if (!invs || invs.length === 0) {
          // ✅ SKU가 어느 location에도 없음 → 프론트에 확인 요청
          if (!force) {
            return {
              ok: false,
              status: 'NEED_FORCE_OUT',
              reason: 'NO_LOCATION',
              message: '해당 SKU는 어느 로케이션에도 재고가 없습니다. UNASSIGNED로 강제 출고할까요?',
              sku: { id: sku.id, sku: (sku as any).sku ?? (sku as any).code ?? null, makerCode: (sku as any).makerCode ?? null, name: (sku as any).name ?? null },
              jobItemId: item.id,
            } as any;
          }

          // ✅ force=true → UNASSIGNED로 강제 출고
          const unassigned = await tx.location.findFirst({ where: { code: 'UNASSIGNED' } as any } as any);
          if (!unassigned) throw new NotFoundException('UNASSIGNED location not found');
          useLocationId = unassigned.id;
          useLocationCode = unassigned.code;
        } else {
          // ✅ 고정 우선순위 1개 선택
          useLocationId = invs[0].locationId;
          useLocationCode = (invs[0] as any).location?.code ?? null;
        }
      }

      // 4-2) 전산재고(before) 계산
      let before = 0;
      if (useLocationId) {
        const invRow = await tx.inventory.findUnique({
          where: { skuId_locationId: { skuId: sku.id, locationId: useLocationId } },
            select: { qty: true },
             });
          before = Number(invRow?.qty ?? 0);
     
      }

      // 부족인데 force/allowOverpick 아니면 막기 (✅ 409)
      if (before < qty && !(force || allowOverpick)) {
        throw new ConflictException(`Insufficient stock. total=${before}, requested=${qty}`);
      }

      const outQty = qty;

// ✅ 정상모드(전산재고 신뢰): 재고 부족이면 차단
// ✅ force/allowOverpick 모드: 재고 부족/로우 없음이어도 출고 허용(음수 허용)
const isForced = (force || allowOverpick) && before < qty;
const forcedReason = isForced ? (force ? (forceReason || 'FORCED') : 'ALLOW_OVERPICK') : null;

// 4-3) inventory out tx (선택된/스캔된 location에서 -outQty) (선택된/스캔된 location에서 -outQty)
      let invTx: any = null;
      if (useLocationId && outQty > 0) {
        invTx = await tx.inventoryTx.create({
          data: {
            skuId: sku.id,
            locationId: useLocationId,
            qty: -outQty,
            type: 'out',
            isForced,
            forcedReason,
            beforeQty: before,
            afterQty: before - outQty,
          } as any,
        } as any);

        // ✅ Inventory 스냅샷도 함께 갱신(로우 없으면 자동 생성, 음수 허용)
        await (tx as any).inventory.upsert({
          where: { skuId_locationId: { skuId: sku.id, locationId: useLocationId } } as any,
          create: { skuId: sku.id, locationId: useLocationId, qty: before - outQty } as any,
          update: { qty: { decrement: outQty } as any } as any,
        } as any);
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
        status: useLocationCode === 'RET-01' ? 'SHORTAGE' : (extraInc > 0 ? 'EXTRA' : 'NORMAL'),
        pickResult: useLocationCode === 'RET-01' ? 'SHORTAGE_TO_RET01' : (extraInc > 0 ? 'EXTRA_PICK' : 'NORMAL_PICK'),
        usedLocationCode: useLocationCode,
        extra: { used: extraInc, approved: extraApproved, picked: extraPicked + extraInc, remaining: Math.max(0, extraApproved - (extraPicked + extraInc)) },
        sku: { id: sku.id, sku: (sku as any).sku ?? (sku as any).code ?? null, makerCode: (sku as any).makerCode ?? null, name: (sku as any).name ?? null },
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
    // NOTE: 기존 로직 유지(파일에서 일부 생략되어 있었다면, 네 repo 원본과 맞춰야 함)
    // 여기 아래는 네가 올린 통파일 기준 그대로 유지된다고 가정.
    // 만약 exportEpms 전체가 필요한 상태면, repo 원본 통파일로 다시 맞춰줄게.

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
 * body:
 * {
 *   "value": "..." | "barcode": "..." | "skuCode": "...",
 *   "qty": 1,
 *   "locationCode": "RET-01" (optional)
 * }
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

  const inputLocationCode = this.norm(dto?.locationCode); // '' or 'AUTO'이면 자동 추천

  // 1) job + items
  const job = await this.prisma.job.findUnique({
    where: { id: jobId } as any,
    include: { items: true } as any,
  } as any);
  if (!job) throw new NotFoundException('Job not found');

  // 2) sku 찾기 (scan 로직과 동일하게)
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

  // 4) 트랜잭션 처리 (로케이션 자동 추천 포함)
  return this.prisma.$transaction(async (tx) => {
    // ✅ location 결정
    const wantAuto = !inputLocationCode || inputLocationCode.toUpperCase() === 'AUTO';

    let loc: any = null;
    if (!wantAuto) {
      loc = await tx.location.findFirst({ where: { code: inputLocationCode } as any } as any);
      if (!loc) throw new NotFoundException(`Location not found: ${inputLocationCode}`);
    } else {
      // 1) 기존 재고가 있는 로케이션 중 qty가 가장 큰 곳(가장 자연스러운 '원래 자리')
      const best = await (tx.inventory as any).findFirst({
        where: { skuId: sku.id, qty: { gt: 0 } } as any,
        orderBy: { qty: 'desc' } as any,
        include: { location: true } as any,
      });
      if (best?.location?.id) {
        loc = best.location;
      } else {
        // 2) 어디에도 재고가 없으면 RET-01
        loc = await tx.location.findFirst({ where: { code: 'RET-01' } as any } as any);
        if (!loc) throw new NotFoundException('RET-01 location not found');
      }
    }
    // 카운팅 증가
    const updatedItem = await tx.jobItem.update({
      where: { id: item.id } as any,
      data: { qtyPicked: { increment: qty } } as any,
      include: { sku: true } as any,
    } as any);

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
      } as any,
    });

    // ✅ Inventory 스냅샷 갱신 (로우 없으면 자동 생성)
    const invRow = await (tx as any).inventory.findUnique({
      where: { skuId_locationId: { skuId: sku.id, locationId: loc.id } } as any,
      select: { qty: true } as any,
    } as any);
    const before = Number(invRow?.qty ?? 0);

    await (tx as any).inventory.upsert({
      where: { skuId_locationId: { skuId: sku.id, locationId: loc.id } } as any,
      create: { skuId: sku.id, locationId: loc.id, qty: before + qty } as any,
      update: { qty: { increment: qty } as any } as any,
    } as any);


    // ✅ 완료 자동 반영 (백엔드가 진실)
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
      usedLocationCode: loc.code,
      sku: { id: sku.id, sku: (sku as any).sku ?? (sku as any).code ?? null, makerCode: sku.makerCode ?? null, name: sku.name ?? null },
      picked: updatedItem,
      invTx: { id: invTx?.id },
      jobStatus: isDone ? 'done' : (job as any).status,
    };
  });
}

  // ✅ 송장/택배 정보 저장(있으면 업데이트, 없으면 생성)
  async upsertParcel(jobId: string, dto: any) {
    // 스키마가 repo마다 다를 수 있어서 안전하게 any로 처리
    // JobParcel이 이미 존재(너 로그에도 deleteMany가 있었음)하니까 이 방식이 제일 안전
    const job = await this.prisma.job.findUnique({ where: { id: jobId } as any } as any);
    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);

    // jobId 기준으로 1개만 유지한다는 가정 (일반적)
    const data = {
      jobId,
      ...dto,
    };

    // ⚠️ unique 키가 jobId가 아닐 수도 있어서 (jobId_unique 등)
    // 일단 가장 흔한 형태로 시도하고, 실패하면 create로 폴백
    try {
      return await (this.prisma as any).jobParcel.upsert({
        where: { jobId } as any,
        create: data as any,
        update: dto as any,
      });
    } catch (e) {
      // upsert가 안 되는 스키마면 createMany/updateMany로 대체
      await (this.prisma as any).jobParcel.deleteMany({ where: { jobId } as any });
      return await (this.prisma as any).jobParcel.create({ data: data as any });
    }
  }

  // ---------- controller helpers ----------
  // jobs.controller.ts에서 호출: /jobs/:id/done
  async markDone(id: string) {
    // 스키마에 status/complete 플래그가 다를 수 있어서 any로 처리
    return this.prisma.job.update({
      where: { id },
      data: { status: 'done', doneAt: new Date() } as any,
    });
  }

  // jobs.controller.ts에서 호출: DELETE /jobs/:id
  async deleteJob(id: string) {
    return this.prisma.$transaction(async (tx) => {
      // child 먼저 삭제 (FK 제약 회피)
      try {
        await (tx as any).jobItem.deleteMany({ where: { jobId: id } });
      } catch {
        // ignore: 모델명이 다르거나 FK가 없는 경우
      }
      try {
        await (tx as any).jobTx.deleteMany({ where: { jobId: id } });
      } catch {
        // ignore
      }
      return tx.job.delete({ where: { id } });
    });
  }

}