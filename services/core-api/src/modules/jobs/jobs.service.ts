import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
    const q = Number(qty ?? 0);
    if (!Number.isFinite(q) || q <= 0) throw new BadRequestException('qty must be > 0');

    const item = await (this.prisma as any).jobItem.findUnique({
      where: { id: jobItemId } as any,
      select: { id: true, jobId: true, extraApprovedQty: true } as any,
    });

    if (!item || item.jobId !== jobId) throw new NotFoundException('jobItem not found');

    const updated = await (this.prisma as any).jobItem.update({
      where: { id: jobItemId } as any,
      data: { extraApprovedQty: { increment: q } } as any,
      select: { id: true, extraApprovedQty: true } as any,
    });

    return { ok: true, ...updated };
  }

  // ===== helpers =====
  private norm(v?: any) {
    const s = String(v ?? '').trim();
    return s ? s : '';
  }

  private normSkuCode(v?: any) {
    const s = this.norm(v);
    return s ? s.toUpperCase() : '';
  }

  private isLikelyBarcode(v: string) {
    // 숫자 위주면 makerCode(바코드)로 우선 판단
    return /^[0-9]{8,}$/.test(v);
  }

  // ===== jobs =====
  async createJob(dto: any) {
    const storeCode = String(dto?.storeCode ?? '').trim();
    if (!storeCode) throw new BadRequestException('storeCode is required');

    const title = this.norm(dto?.title) || '작업';
    const memo = this.norm(dto?.memo);

    const job = await this.prisma.job.create({
      data: {
        storeCode,
        title,
        memo: memo || null,
        status: 'open',
        allowOverpick: Boolean(dto?.allowOverpick),
      } as any,
      select: { id: true, storeCode: true, title: true, memo: true, status: true, allowOverpick: true } as any,
    } as any);

    return { ok: true, ...job };
  }

  async listJobs(params?: {
  storeCode?: string;
  status?: string;
}) {
  const where: any = {};

  // storeCode 필터 (옵션)
  if (
    params?.storeCode &&
    params.storeCode !== 'undefined' &&
    params.storeCode !== 'null' &&
    params.storeCode.trim() !== ''
  ) {
    where.storeCode = params.storeCode.trim();
  }

  // status 필터 (옵션)
  if (
    params?.status &&
    params.status !== 'undefined' &&
    params.status !== 'null'
  ) {
    where.status = params.status;
  }
const rows = await this.prisma.job.findMany({
  where,
  orderBy: { createdAt: "desc" },
  select: {
    id: true,
    storeCode: true,
    title: true,
    memo: true,
    status: true,
    allowOverpick: true,
    createdAt: true,
    updatedAt: true,
    doneAt: true,
    items: {
      select: {
        id: true,
        qtyPlanned: true,
        qtyPicked: true,
        makerCodeSnapshot: true,
        nameSnapshot: true,
        sku: {
          select: { makerCode: true, name: true },
        },
      },
    },
  },
});


 return { ok: true, rows };
} 

  async getJob(jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId } as any,
      include: { items: { include: { sku: true } } } as any,
    } as any);
    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);
    return { ok: true, job };
  }

// 엑셀/목록으로 jobItem 추가
async addItems(jobId: string, dto: any) {
  console.log("DEBUG addItems dto.items[0] =", dto?.items?.[0]);

  const job = await this.prisma.job.findUnique({
    where: { id: jobId } as any,
  } as any);
  if (!job) throw new NotFoundException(`Job not found: ${jobId}`);

  const rawItems: any[] = Array.isArray(dto?.items) ? dto.items : [];
  if (rawItems.length <= 0) throw new BadRequestException("items is required");

  const resolved: Array<{
    skuId: string;
    qtyPlanned: number;
    makerCodeSnapshot: string;
    nameSnapshot: string;
  }> = [];

  for (const row of rawItems) {
    const qtyPlanned = Number(row?.qty ?? row?.qtyPlanned ?? 0);
    if (!Number.isFinite(qtyPlanned) || qtyPlanned <= 0) continue;

    // ✅ 프론트에서 보내는 키 우선 (makerCode/name)
    const maker = String(
      row?.makerCode ??
        row?.maker ??
        row?.makerCodeSnapshot ??
        row?.["Maker코드"] ??
        row?.["메이커코드"] ??
        row?.["단품코드"] ??
        ""
    ).trim();

    const name = String(
      row?.name ??
        row?.itemName ??
        row?.nameSnapshot ??
        row?.["코드명"] ??
        row?.["상품명"] ??
        row?.["품명"] ??
        ""
    ).trim();

    // 🔥 maker/name 필수 (빈 줄 방지)
    if (!maker || !name) {
      const keys = Object.keys(row || {}).join(" | ");
      throw new BadRequestException(
        `작지 아이템 정보 누락: makerCode/name 필수 (jobId=${jobId}) keys=[${keys}] maker="${maker}" name="${name}"`
      );
    }

    // ✅ makerCode 기준 SKU 찾기
    let sku: any = await this.prisma.sku.findFirst({
      where: { makerCode: maker } as any,
    } as any);

    // ✅ sku unique는 sku 필드이므로 skuCode 없으면 maker 기반으로 만들어줌
    const skuCode = String(row?.skuCode ?? "").trim() ||
      `UNASSIGNED-${maker}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    if (!sku) {
      const code = skuCode.toUpperCase().trim();
      sku = await (this.prisma as any).sku.upsert({
        where: { sku: code } as any,
        update: { makerCode: maker, name } as any,
        create: { sku: code, makerCode: maker, name } as any,
      } as any);
    } else {
      // 기존 sku에 maker/name 없을 때만 보강
      const patch: any = {};
      if (!sku.makerCode) patch.makerCode = maker;
      if (!sku.name) patch.name = name;

      if (Object.keys(patch).length) {
        sku = await (this.prisma as any).sku.update({
          where: { id: sku.id } as any,
          data: patch as any,
        } as any);
      }
    }

    resolved.push({
      skuId: sku.id,
      qtyPlanned,
      makerCodeSnapshot: maker,
      nameSnapshot: name,
    });
  }

  if (resolved.length <= 0) throw new BadRequestException("No valid items");

  // ✅ upsert 성격: 이미 있으면 planned +=
  for (const it of resolved) {
    const existing = await (this.prisma as any).jobItem.findFirst({
      where: { jobId, skuId: it.skuId } as any,
    });

    if (existing) {
      await (this.prisma as any).jobItem.update({
        where: { id: existing.id } as any,
        data: {
          qtyPlanned: { increment: it.qtyPlanned } as any,
          makerCodeSnapshot: it.makerCodeSnapshot,
          nameSnapshot: it.nameSnapshot,
        } as any,
      });
    } else {
      await (this.prisma as any).jobItem.create({
        data: {
          jobId,
          skuId: it.skuId,
          qtyPlanned: it.qtyPlanned,
          qtyPicked: 0,
          makerCodeSnapshot: it.makerCodeSnapshot,
          nameSnapshot: it.nameSnapshot,
          extraApprovedQty: 0,
          extraPickedQty: 0,
        } as any,
      });
    }
  }

  return { ok: true };
}
  /**
   * 출고 스캔(피킹)
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
    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);

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
      sku =
        (await (this.prisma as any).sku.findUnique({ where: { sku: code } as any }).catch(() => null)) ||
        (await (this.prisma as any).sku.findUnique({ where: { code } as any }).catch(() => null));
    }
    if (!sku) {
      // ✅ SKU가 전산에 없으면 자동 생성 (현장 예외 SKU도 흐름을 끊지 않기)
      const code = this.normSkuCode(raw) || `AUTO-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`.toUpperCase();
      sku = await this.prisma.sku.create({
        data: {
          sku: code,
          makerCode: this.isLikelyBarcode(raw) ? raw : null,
          name: null,
        } as any,
      } as any);
    }

    // 2) jobItem은 트랜잭션 안에서 '있으면 사용, 없으면 생성' (qtyPlanned=0 라인 자동 생성)

    // 3) location lookup (있을 때만). 없으면 tx 안에서 자동 선택한다.
    let scannedLocation: any = null;
    if (locationCode) {
      scannedLocation = await this.prisma.location.findFirst({ where: { code: locationCode } as any } as any);
      if (!scannedLocation) throw new NotFoundException(`Location not found: ${locationCode}`);
    }

    // 4) 재고(전산) 계산: inventoryTx 합계 (강제출고는 제외)
    // ✅ 4-0) jobItem row를 트랜잭션 밖에서 먼저 보장(409 등으로 롤백돼도 row는 남도록)
    let ensuredItem: any = await (this.prisma as any).jobItem.findFirst({
      where: { jobId, skuId: sku.id } as any,
    } as any);

    if (!ensuredItem) {
      try {
        ensuredItem = await (this.prisma as any).jobItem.create({
          data: {
            jobId,
            skuId: sku.id,
            qtyPlanned: 0,
            qtyPicked: 0,
            makerCodeSnapshot: (sku as any).makerCode ?? null,
            nameSnapshot: (sku as any).name ?? null,
            extraApprovedQty: 0,
            extraPickedQty: 0,
          } as any,
        } as any);
      } catch (e) {
        // 동시성 등으로 이미 생겼을 수 있으니 재조회
        ensuredItem = await (this.prisma as any).jobItem.findFirst({
          where: { jobId, skuId: sku.id } as any,
        } as any);
      }
    }


    return this.prisma.$transaction(async (tx) => {
      // 4-0) ✅ jobItem은 위에서 이미 보장됨(롤백 방지). 트랜잭션 안에서는 fresh 조회만.
      const item = await (tx as any).jobItem.findUnique({
        where: { id: ensuredItem.id } as any,
      } as any);

      if (!item) throw new NotFoundException('jobItem not found (ensured)');

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

      const nextPicked = picked + qty;
      const exceed = Math.max(0, nextPicked - planned);

      if (!force) {
        if (exceed > 0) {
          if (!allowOverpick) {
            throw new ConflictException({
              code: 'OVERPICK',
              message: `planned(${planned}) exceeded`,
              planned,
              picked,
              nextPicked,
            });
          }

          // allowOverpick=true일 때도 승인된 수량까지만 허용
          const canUseExtra = Math.max(0, extraApproved - extraPicked);
          if (exceed > canUseExtra) {
            throw new ConflictException({
              code: 'EXTRA_NOT_APPROVED',
              message: `extra not approved: need ${exceed}, available ${canUseExtra}`,
              planned,
              picked,
              extraApproved,
              extraPicked,
              exceed,
              canUseExtra,
            });
          }
        }
      }

      // 4-1) location 결정: scannedLocation 있으면 사용, 아니면 자동
      let loc: any = scannedLocation;
      if (!loc) {
        // 가장 qty 큰 로케이션 우선
        const best = await (tx.inventory as any).findFirst({
          where: { skuId: sku.id, qty: { gt: 0 } } as any,
          orderBy: { qty: 'desc' } as any,
          include: { location: true } as any,
        });
        if (best?.location?.id) loc = best.location;

        // fallback: UNASSIGNED
        if (!loc) {
          loc = await tx.location.findFirst({ where: { code: 'UNASSIGNED' } as any } as any);
          if (!loc) throw new NotFoundException('UNASSIGNED location not found');
        }
      }

      // 5) jobItem qtyPicked 증가 + (초과분이면 extraPickedQty도 증가)
      const deltaExceed = Math.max(0, nextPicked - planned);
      const incExtra = Math.min(qty, Math.max(0, deltaExceed)); // 이번 스캔에서 초과로 들어간 수량

      const updatedItem = await tx.jobItem.update({
        where: { id: item.id } as any,
        data: {
          qtyPicked: { increment: qty } as any,
          ...(incExtra > 0 ? { extraPickedQty: { increment: incExtra } as any } : {}),
        } as any,
        include: { sku: true } as any,
      } as any);

      // 6) inventoryTx 기록 (out)
      await (tx as any).inventoryTx.create({
        data: {
          type: 'out',
          qty: -qty,
          skuId: sku.id,
          locationId: loc.id,
          jobId,
          jobItemId: item.id,
          isForced: force,
          forcedReason: force ? forceReason || null : null,
        } as any,
      });

      // 7) inventory snapshot 갱신 (row 없으면 upsert로 생성)
      const invRow = await (tx as any).inventory.findUnique({
        where: { skuId_locationId: { skuId: sku.id, locationId: loc.id } } as any,
        select: { qty: true } as any,
      } as any);
      const before = Number(invRow?.qty ?? 0);

      await (tx as any).inventory.upsert({
        where: { skuId_locationId: { skuId: sku.id, locationId: loc.id } } as any,
        create: { skuId: sku.id, locationId: loc.id, qty: before - qty } as any,
        update: { qty: { decrement: qty } as any } as any,
      } as any);

      // 9) ✅ 스캔 결과로 job 완료 여부 자동 반영 (백엔드가 진실)
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
        sku: { id: sku.id, sku: sku.sku, makerCode: sku.makerCode, name: sku.name },
        picked: {
          id: updatedItem.id,
          jobId,
          skuId: sku.id,
          qtyPlanned: updatedItem.qtyPlanned,
          qtyPicked: updatedItem.qtyPicked,
          extraApprovedQty: updatedItem.extraApprovedQty,
          extraPickedQty: updatedItem.extraPickedQty,
          makerCodeSnapshot: updatedItem.makerCodeSnapshot,
          nameSnapshot: updatedItem.nameSnapshot,
        },
      };
    });
  }

  // EPMS export (생략: 기존 그대로)
  async exportEpms(jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId } as any,
      include: { items: { include: { sku: true } } } as any,
    } as any);
    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('EPMS');

    ws.addRow([
      'makerCode',
      'sku',
      'qty',
      'location',
      'memo',
      'jobId',
      'jobItemId',
      'extraApprovedQty',
      'extraPickedQty',
    ]);

    for (const it of (job as any).items ?? []) {
      // ✅ planned=0 이라도 picked가 있으면 내보내기에서 잡히게 됨 (row가 있으니까)
      ws.addRow([
        it.makerCodeSnapshot ?? it.sku?.makerCode ?? '',
        it.sku?.sku ?? '',
        Number(it.qtyPicked ?? 0),
        '',
        job.memo ?? '',
        job.id,
        it.id,
        Number(it.extraApprovedQty ?? 0),
        Number(it.extraPickedQty ?? 0),
      ]);
    }

    const buf = await wb.xlsx.writeBuffer();
    return { ok: true, filename: `epms_${jobId}.xlsx`, data: Buffer.from(buf).toString('base64') };
  }

  /**
   * 입고/반품 receive (qtyPicked 카운팅)
   * - locationCode 없으면 AUTO 추천: 재고 있는 로케이션 > 없으면 RET-01
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
    const job = await this.prisma.job.findUnique({
      where: { id: jobId } as any,
      include: { items: true } as any,
    } as any);
    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);

    const raw = this.norm(dto?.value || dto?.barcode || dto?.skuCode);
    if (!raw) throw new BadRequestException('value/barcode/skuCode is required');

    const qty = Number(dto?.qty ?? 1);
    if (!Number.isFinite(qty) || qty <= 0) throw new BadRequestException('qty must be > 0');

    const inputLocationCode = this.norm(dto?.locationCode);

    // 1) sku 찾기
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
    if (!sku) {
      // ✅ SKU가 전산에 없으면 자동 생성
      const code = this.normSkuCode(raw) || `AUTO-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`.toUpperCase();
      sku = await this.prisma.sku.create({
        data: {
          sku: code,
          makerCode: this.isLikelyBarcode(raw) ? raw : null,
          name: null,
        } as any,
      } as any);
    }

    // 3) jobItem은 트랜잭션 안에서 '있으면 사용, 없으면 생성' (qtyPlanned=0 라인 자동 생성)

    // 4) 트랜잭션 처리 (로케이션 자동 추천 포함)
    // ✅ jobItem row를 트랜잭션 밖에서 먼저 보장(에러/롤백돼도 row는 남도록)
    let ensuredItem: any = await (this.prisma as any).jobItem.findFirst({
      where: { jobId, skuId: sku.id } as any,
    } as any);

    if (!ensuredItem) {
      try {
        ensuredItem = await (this.prisma as any).jobItem.create({
          data: {
            jobId,
            skuId: sku.id,
            qtyPlanned: 0,
            qtyPicked: 0,
            makerCodeSnapshot: (sku as any).makerCode ?? null,
            nameSnapshot: (sku as any).name ?? null,
            extraApprovedQty: 0,
            extraPickedQty: 0,
          } as any,
        } as any);
      } catch (e) {
        ensuredItem = await (this.prisma as any).jobItem.findFirst({
          where: { jobId, skuId: sku.id } as any,
        } as any);
      }
    }


    return this.prisma.$transaction(async (tx) => {
      // ✅ jobItem은 위에서 이미 보장됨(롤백 방지). 트랜잭션 안에서는 fresh 조회만.
      const item = await (tx as any).jobItem.findUnique({
        where: { id: ensuredItem.id } as any,
      } as any);

      if (!item) throw new NotFoundException('jobItem not found (ensured)');

      // ✅ location 결정
      const wantAuto = !inputLocationCode || inputLocationCode.toUpperCase() === 'AUTO';

      let loc: any = null;
      if (!wantAuto) {
        loc = await tx.location.findFirst({ where: { code: inputLocationCode } as any } as any);
        if (!loc) throw new NotFoundException(`Location not found: ${inputLocationCode}`);
      } else {
        // 1) 기존 재고가 있는 로케이션 중 qty가 가장 큰 곳
        const best = await (tx.inventory as any).findFirst({
          where: { skuId: sku.id, qty: { gt: 0 } } as any,
          orderBy: { qty: 'desc' } as any,
          include: { location: true } as any,
        });
        if (best?.location?.id) {
          loc = best.location;
        } else {
          // 2) 없으면 기본 반품 위치
          loc = await tx.location.findFirst({ where: { code: 'RET-01' } as any } as any);
          if (!loc) throw new NotFoundException('RET-01 location not found');
        }
      }

      // 카운팅 증가 (입고도 qtyPicked로 카운팅)
      const updatedItem = await tx.jobItem.update({
        where: { id: item.id } as any,
        data: { qtyPicked: { increment: qty } } as any,
        include: { sku: true } as any,
      } as any);

      // 재고 + 기록
      await (tx as any).inventoryTx.create({
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
        sku: { id: sku.id, sku: sku.sku, makerCode: sku.makerCode, name: sku.name },
        picked: {
          id: updatedItem.id,
          jobId,
          skuId: sku.id,
          qtyPlanned: updatedItem.qtyPlanned,
          qtyPicked: updatedItem.qtyPicked,
          extraApprovedQty: updatedItem.extraApprovedQty,
          extraPickedQty: updatedItem.extraPickedQty,
          makerCodeSnapshot: updatedItem.makerCodeSnapshot,
          nameSnapshot: updatedItem.nameSnapshot,
        },
      };
    });
  }

  // parcel, done, delete 등은 기존 그대로 (여기서는 생략 없이 유지)
  async upsertParcel(jobId: string, dto: any) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } as any } as any);
    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);

    const payload = dto || {};
    const row = await (this.prisma as any).parcel.upsert({
      where: { jobId } as any,
      create: { jobId, payload } as any,
      update: { payload } as any,
    });

    return { ok: true, row };
  }

  async markDone(jobId: string) {
    const job = await this.prisma.job.update({
      where: { id: jobId } as any,
      data: { status: 'done', doneAt: new Date() } as any,
      select: { id: true, status: true, doneAt: true } as any,
    } as any);
    return { ok: true, ...job };
  }

  async deleteJob(jobId: string) {
    await (this.prisma as any).job.delete({ where: { id: jobId } as any });
    return { ok: true };
    
  }

  async undoLastTx(jobId: string) {
  return this.prisma.$transaction(async (tx) => {
    // 1) 아직 undo 안 된 마지막 InventoryTx (이 Job 기준)
    const lastTx = await (tx as any).inventoryTx.findFirst({
      where: { jobId, undoneAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastTx) {
      throw new BadRequestException('되돌릴 스캔/입고 기록이 없어');
    }

    const absQty = Math.abs(Number(lastTx.qty || 0));
    if (!absQty) {
      throw new BadRequestException('수량이 0인 트랜잭션은 되돌릴 수 없어');
    }

    if (!lastTx.locationId) {
      throw new BadRequestException('location 없는 트랜잭션은 undo 불가');
    }

    // ✅ 1-1) "스캔 취소(UNDO)" 정석 규칙:
    // 같은 SKU+Location에 대해 lastTx 이후(createdAt 더 큰) 트랜잭션이 하나라도 있으면
    // 순서가 깨지므로 undo 불가 (시간 역순 undo 강제)
    const newerTx = await (tx as any).inventoryTx.findFirst({
      where: {
        skuId: lastTx.skuId,
        locationId: lastTx.locationId,
        undoneAt: null,
        createdAt: { gt: lastTx.createdAt },
      },
      select: { id: true, type: true, qty: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    if (newerTx) {
      throw new BadRequestException(
        '이 스캔 이후 동일 SKU/로케이션에서 다른 작업이 진행되어 취소할 수 없어. (최근 작업부터 먼저 취소해야 함)',
      );
    }

    // 2) 재고 반대로 복구
    // out(-qty) → +absQty / in(+qty) → -absQty
    const delta = lastTx.qty < 0 ? +absQty : -absQty;

    // inventory 현재값
    const invRow = await (tx as any).inventory.findUnique({
      where: {
        skuId_locationId: {
          skuId: lastTx.skuId,
          locationId: lastTx.locationId,
        },
      },
      select: { qty: true },
    });

    const before = Number(invRow?.qty ?? 0);
    const after = before + delta;

    // ✅ 음수 방어는 유지하되, 메시지를 더 명확하게
    if (after < 0) {
      throw new BadRequestException(
        '재고가 이미 다른 작업으로 사용되어 취소할 수 없어. (해당 SKU/로케이션 재고 부족)',
      );
    }

    await (tx as any).inventory.upsert({
      where: {
        skuId_locationId: {
          skuId: lastTx.skuId,
          locationId: lastTx.locationId,
        },
      },
      create: {
        skuId: lastTx.skuId,
        locationId: lastTx.locationId,
        qty: after,
      },
      update: {
        qty: { increment: delta },
      },
    });

    // 3) jobItem.qtyPicked 되돌리기
    if (lastTx.jobItemId) {
      const item = await (tx as any).jobItem.findUnique({
        where: { id: lastTx.jobItemId },
        select: {
          id: true,
          qtyPicked: true,
          extraPickedQty: true,
          qtyPlanned: true,
        },
      });

      if (item) {
        const nextPicked = Math.max(0, Number(item.qtyPicked) - absQty);
        await (tx as any).jobItem.update({
          where: { id: item.id },
          data: { qtyPicked: nextPicked },
        });
      }
    }

    // 4) undo용 InventoryTx 생성 (감사 로그)
    const undoTx = await (tx as any).inventoryTx.create({
      data: {
        type: 'undo',
        qty: delta,
        skuId: lastTx.skuId,
        locationId: lastTx.locationId,
        jobId: lastTx.jobId,
        jobItemId: lastTx.jobItemId,
        isForced: true,
        beforeQty: before,
        afterQty: after,
      },
    });

    // 5) 원본 tx에 undone 표시
    await (tx as any).inventoryTx.update({
      where: { id: lastTx.id },
      data: {
        undoneAt: new Date(),
        undoneTxId: undoTx.id,
      },
    });

    // 6) job done 상태 되돌리기(필요 시)
    const job = await (tx as any).job.findUnique({
      where: { id: jobId },
      select: { status: true },
    });

    if (job?.status === 'done') {
      const items = await (tx as any).jobItem.findMany({
        where: { jobId },
        select: { qtyPicked: true, qtyPlanned: true },
      });

      const stillDone =
        items.length > 0 &&
        items.every((it: any) => Number(it.qtyPicked) >= Number(it.qtyPlanned));

      if (!stillDone) {
        await (tx as any).job.update({
          where: { id: jobId },
          data: { status: 'open', doneAt: null },
        });
      }
    }

    return {
      ok: true,
      undoneTxId: lastTx.id,
      undoAppliedTxId: undoTx.id,
      delta,
    };
  });
}
  // ================================
  // 🔽 UNDO 확장 (추가)
  // ================================

  // job 기준 InventoryTx 목록
  async listInventoryTx(jobId: string) {
    return (this.prisma as any).inventoryTx.findMany({
      where: { jobId, undoneAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 최근 tx부터 특정 tx까지 연속 undo
  async undoUntilTx(jobId: string, targetTxId: string) {
    const txs = await (this.prisma as any).inventoryTx.findMany({
      where: { jobId, undoneAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true } as any,
    });

    const idx = (txs || []).findIndex((t: any) => t.id === targetTxId);
    if (idx < 0) {
      throw new BadRequestException('해당 tx는 undo 대상이 아니야');
    }

    let undoneCount = 0;
    for (let i = 0; i <= idx; i++) {
      await this.undoLastTx(jobId);
      undoneCount += 1;
    }

    return { ok: true, undoneCount, untilTxId: targetTxId };
  }

  // job 전체 undo
  async undoAllTx(jobId: string) {
    let undoneCount = 0;

    while (true) {
      const last = await (this.prisma as any).inventoryTx.findFirst({
        where: { jobId, undoneAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true } as any,
      });

      if (!last) break;

      await this.undoLastTx(jobId);
      undoneCount += 1;

      if (undoneCount > 5000) {
        throw new BadRequestException('undoAll safety stop');
      }
    }

    return { ok: true, undoneCount };
  }

}
  