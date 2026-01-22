import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JobType, Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { ExportsService } from '../exports/exports.service';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly exportsService: ExportsService, // ✅ CJ 자동 예약용
  ) {}

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
    const storeId = String(dto?.storeId ?? '').trim();
    if (!storeId) throw new BadRequestException('storeId is required');

    // Store 존재 여부 확인
    const store = await this.prisma.store.findUnique({
      where: { id: storeId } as any,
      select: { id: true, code: true, name: true } as any,
    } as any);
    if (!store) throw new BadRequestException(`Store not found: ${storeId}`);

    const title = this.norm(dto?.title) || '작업';
    const memo = this.norm(dto?.memo);
    const type = dto?.type ?? JobType.OUTBOUND;
    const operatorId = this.norm(dto?.operatorId) || null;

    // 의뢰요청일 파싱
    let requestDate: Date | null = null;
    if (dto?.requestDate) {
      const parsed = new Date(dto.requestDate);
      if (!isNaN(parsed.getTime())) {
        requestDate = parsed;
      }
    }

    // ✅ 배치 Job용 필드
    const parentId = this.norm(dto?.parentId) || null;
    const packType = this.norm(dto?.packType) || null;
    const sortOrder = Number(dto?.sortOrder ?? 0);

    // parentId가 있으면 부모 Job 존재 여부 확인
    if (parentId) {
      const parentJob = await this.prisma.job.findUnique({
        where: { id: parentId } as any,
        select: { id: true } as any,
      } as any);
      if (!parentJob) throw new BadRequestException(`Parent Job not found: ${parentId}`);
    }

    const job = await this.prisma.job.create({
      data: {
        storeId,
        title,
        memo: memo || null,
        type,
        status: 'open',
        allowOverpick: Boolean(dto?.allowOverpick),
        operatorId,
        requestDate,
        parentId,
        packType,
        sortOrder,
      } as any,
      select: {
        id: true, storeId: true, title: true, memo: true, type: true,
        status: true, allowOverpick: true, operatorId: true, requestDate: true,
        parentId: true, packType: true, sortOrder: true,
      } as any,
    } as any);

    return { ok: true, ...job };
  }

  async listJobs(params?: {
  storeId?: string;
  status?: string;
  type?: JobType;
  parentId?: string | null; // null이면 최상위만, undefined면 전체
  parcel?: boolean; // true면 택배(parcel 있는) Job만
}) {
  const where: any = {};

  // storeId 필터 (옵션)
  if (
    params?.storeId &&
    params.storeId !== 'undefined' &&
    params.storeId !== 'null' &&
    params.storeId.trim() !== ''
  ) {
    where.storeId = params.storeId.trim();
  }

  // status 필터 (옵션)
  if (
    params?.status &&
    params.status !== 'undefined' &&
    params.status !== 'null'
  ) {
    where.status = params.status;
  }

  // type 필터 (옵션)
  if (params?.type) {
    where.type = params.type;
  }

  // ✅ parentId 필터: null이면 최상위(배치) Job만
  if (params?.parentId === null) {
    where.parentId = null;
  } else if (params?.parentId) {
    where.parentId = params.parentId;
  }

  // ✅ parcel 필터: 택배 Job만
  if (params?.parcel === true) {
    where.parcel = { isNot: null };
  }

const rows = await this.prisma.job.findMany({
  where,
  orderBy: { createdAt: "desc" },
  select: {
    id: true,
    storeId: true,
    store: {
      select: { id: true, code: true, name: true, isHq: true },
    },
    title: true,
    memo: true,
    type: true,
    status: true,
    allowOverpick: true,
    createdAt: true,
    updatedAt: true,
    doneAt: true,
    // ✅ 배치 Job용 필드
    parentId: true,
    packType: true,
    sortOrder: true,
    items: {
      select: {
        id: true,
        qtyPlanned: true,
        qtyPicked: true,
        makerCodeSnapshot: true,
        nameSnapshot: true,
        sku: {
          select: { sku: true, makerCode: true, name: true },
        },
      },
    },
    parcel: true,
    // ✅ 하위 Job 목록 (배치 Job인 경우)
    children: {
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        title: true,
        status: true,
        packType: true,
        sortOrder: true,
        doneAt: true,
        parcel: true,
        items: {
          select: {
            id: true,
            qtyPlanned: true,
            qtyPicked: true,
            makerCodeSnapshot: true,
            nameSnapshot: true,
            sku: {
              select: { sku: true, makerCode: true, name: true },
            },
          },
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
      include: {
        store: true,
        items: { include: { sku: true } },
      } as any,
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

    // ✅ 단품코드 (skuCode) - SKU 테이블의 sku 필드용
    const skuCode = String(
      row?.skuCode ??
        row?.sku ??
        row?.["단품코드"] ??
        row?.["단품"] ??
        row?.["품번"] ??
        ""
    ).trim();

    // ✅ Maker코드 (makerCode) - SKU 테이블의 makerCode 필드용
    const maker = String(
      row?.makerCode ??
        row?.maker ??
        row?.makerCodeSnapshot ??
        row?.["Maker코드"] ??
        row?.["메이커코드"] ??
        row?.["바코드"] ??
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

    // ✅ 상품구분 (productType)
    const productType = String(
      row?.productType ??
        row?.["상품구분"] ??
        row?.["제품구분"] ??
        row?.["제품타입"] ??
        ""
    ).trim() || "SHOES";

    // 🔥 maker/name 필수 (빈 줄 방지)
    if (!maker || !name) {
      const keys = Object.keys(row || {}).join(" | ");
      throw new BadRequestException(
        `작지 아이템 정보 누락: makerCode/name 필수 (jobId=${jobId}) keys=[${keys}] maker="${maker}" name="${name}"`
      );
    }

    // ✅ SKU 찾기: makerCode, sku(단품코드) 필드로 검색
    const searchTerms: any[] = [];
    if (maker) {
      searchTerms.push({ makerCode: maker });
      searchTerms.push({ sku: maker });
    }
    if (skuCode && skuCode !== maker) {
      searchTerms.push({ sku: skuCode });
    }

    let sku: any = searchTerms.length > 0
      ? await this.prisma.sku.findFirst({
          where: { OR: searchTerms } as any,
        } as any)
      : null;

    // ✅ SKU가 없으면 자동 생성 + UNASSIGNED에 재고 추가
    if (!sku) {
      // SKU 생성: sku=단품코드, makerCode=Maker코드
      sku = await this.prisma.sku.create({
        data: {
          sku: skuCode || maker, // 단품코드가 없으면 makerCode 사용
          makerCode: maker,
          name: name,
          productType: productType,
        } as any,
      } as any);

      // HQ Store의 UNASSIGNED location 찾기
      const hqStore = await this.prisma.store.findFirst({
        where: { isHq: true } as any,
      } as any);

      if (hqStore) {
        const unassignedLoc = await this.prisma.location.findFirst({
          where: { storeId: hqStore.id, code: 'UNASSIGNED' } as any,
        } as any);

        if (unassignedLoc) {
          // UNASSIGNED에 재고 0으로 Inventory 생성 (이미 있으면 무시)
          await this.prisma.inventory.upsert({
            where: {
              skuId_locationId: { skuId: sku.id, locationId: unassignedLoc.id },
            } as any,
            update: {},
            create: {
              skuId: sku.id,
              locationId: unassignedLoc.id,
              qty: 0,
            } as any,
          } as any);
        }
      }

      console.log(`[addItems] SKU 자동 생성: sku=${skuCode || maker}, makerCode=${maker}, name=${name} → UNASSIGNED에 재고 추가`);
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
   * 출고 스캔(피킹) - 창고 재고 감소 + 매장 재고 증가 (양방향 처리)
   */
  async scan(
    jobId: string,
    dto: {
      value?: string;
      skuCode?: string;
      qty?: number;
      locationCode?: string;
      force?: boolean;
      forceReason?: string;
      operatorId?: string;
    },
  ) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId } as any,
      include: { items: true, store: true } as any,
    } as any);
    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);

    // ✅ Job type 검증: scan은 OUTBOUND만 허용
    if ((job as any).type !== JobType.OUTBOUND) {
      throw new ConflictException(`Job type mismatch: expected OUTBOUND, got ${(job as any).type}`);
    }

    const allowOverpick = Boolean((job as any).allowOverpick);
    const destStoreId = (job as any).storeId; // 목적지 매장

    const raw = this.norm(dto.value || dto.skuCode);
    if (!raw) throw new BadRequestException('value/skuCode is required');

    const qty = Number(dto.qty ?? 1);
    if (!Number.isFinite(qty) || qty <= 0) throw new BadRequestException('qty must be > 0');

    const force = Boolean(dto.force);
    const forceReason = this.norm(dto.forceReason);

    const locationCode = this.norm(dto.locationCode); // ✅ 선택값 (RF 스캔에서는 없을 수 있음)

    // 1) sku 찾기: 숫자면 makerCode 우선, 아니면 skuCode
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

      // 4-1) 출발지(창고) location 결정: scannedLocation 있으면 사용, 아니면 자동
      let srcLoc: any = scannedLocation;
      if (!srcLoc) {
        // 가장 qty 큰 로케이션 우선
        const best = await (tx.inventory as any).findFirst({
          where: { skuId: sku.id, qty: { gt: 0 } } as any,
          orderBy: { qty: 'desc' } as any,
          include: { location: true } as any,
        });
        if (best?.location?.id) srcLoc = best.location;

        // fallback: UNASSIGNED
        if (!srcLoc) {
          srcLoc = await tx.location.findFirst({ where: { code: 'UNASSIGNED' } as any } as any);
          if (!srcLoc) throw new NotFoundException('UNASSIGNED location not found');
        }
      }

      // ✅ 4-2) 도착지(매장) location 결정: 매장의 기본 location (FLOOR)
      let destLoc: any = null;
      if (destStoreId) {
        // 매장의 FLOOR location 찾기/생성
        destLoc = await tx.location.findFirst({
          where: { storeId: destStoreId, code: 'FLOOR' } as any,
        } as any);

        if (!destLoc) {
          // 매장에 FLOOR location 자동 생성
          destLoc = await tx.location.create({
            data: { storeId: destStoreId, code: 'FLOOR' } as any,
          } as any);
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

      // 6) inventoryTx 기록 (out - 창고에서 출고)
      await (tx as any).inventoryTx.create({
        data: {
          type: 'out',
          qty: -qty,
          skuId: sku.id,
          locationId: srcLoc.id,
          jobId,
          jobItemId: item.id,
          isForced: force,
          forcedReason: force ? forceReason || null : null,
          operatorId: this.norm(dto.operatorId) || null,
        } as any,
      });

      // 7) 창고 inventory snapshot 갱신 (감소)
      const srcInvRow = await (tx as any).inventory.findUnique({
        where: { skuId_locationId: { skuId: sku.id, locationId: srcLoc.id } } as any,
        select: { qty: true } as any,
      } as any);
      const srcBefore = Number(srcInvRow?.qty ?? 0);

      await (tx as any).inventory.upsert({
        where: { skuId_locationId: { skuId: sku.id, locationId: srcLoc.id } } as any,
        create: { skuId: sku.id, locationId: srcLoc.id, qty: srcBefore - qty } as any,
        update: { qty: { decrement: qty } as any } as any,
      } as any);

      // ✅ 8) 매장 재고 증가 (도착지가 있을 때만)
      if (destLoc) {
        // inventoryTx 기록 (in - 매장으로 입고)
        await (tx as any).inventoryTx.create({
          data: {
            type: 'in',
            qty: +qty,
            skuId: sku.id,
            locationId: destLoc.id,
            jobId,
            jobItemId: item.id,
            isForced: false,
            operatorId: this.norm(dto.operatorId) || null,
            note: `창고출고→매장입고 (from: ${srcLoc.code})`,
          } as any,
        });

        // 매장 inventory snapshot 갱신 (증가)
        const destInvRow = await (tx as any).inventory.findUnique({
          where: { skuId_locationId: { skuId: sku.id, locationId: destLoc.id } } as any,
          select: { qty: true } as any,
        } as any);
        const destBefore = Number(destInvRow?.qty ?? 0);

        await (tx as any).inventory.upsert({
          where: { skuId_locationId: { skuId: sku.id, locationId: destLoc.id } } as any,
          create: { skuId: sku.id, locationId: destLoc.id, qty: destBefore + qty } as any,
          update: { qty: { increment: qty } as any } as any,
        } as any);
      }

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
        usedLocationCode: srcLoc.code,
        destLocationCode: destLoc?.code || null,
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
   * 입고/반품 receive (qtyPicked 카운팅) - 양방향 처리
   * - INBOUND: 외부에서 창고로 입고 (창고 재고만 증가)
   * - RETURN: 매장에서 창고로 반품 (매장 재고 감소 + 창고 재고 증가)
   * - locationCode 없으면 AUTO 추천: 재고 있는 로케이션 > 없으면 RET-01
   */
  async receive(
    jobId: string,
    dto: {
      value?: string;
      skuCode?: string;
      qty?: number;
      locationCode?: string;
      operatorId?: string;
    },
  ) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId } as any,
      include: { items: true, store: true } as any,
    } as any);
    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);

    // ✅ Job type 검증: receive는 INBOUND 또는 RETURN만 허용
    const jobType = (job as any).type;
    if (jobType !== JobType.INBOUND && jobType !== JobType.RETURN) {
      throw new ConflictException(`Job type mismatch: expected INBOUND/RETURN, got ${jobType}`);
    }

    const isReturn = jobType === JobType.RETURN;
    const srcStoreId = (job as any).storeId; // 반품 시 출발지 매장

    const raw = this.norm(dto?.value || dto?.skuCode);
    if (!raw) throw new BadRequestException('value/skuCode is required');

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

      // ✅ 도착지(창고) location 결정
      const wantAuto = !inputLocationCode || inputLocationCode.toUpperCase() === 'AUTO';

      let destLoc: any = null;
      if (!wantAuto) {
        destLoc = await tx.location.findFirst({ where: { code: inputLocationCode } as any } as any);
        if (!destLoc) throw new NotFoundException(`Location not found: ${inputLocationCode}`);
      } else {
        // 1) 기존 재고가 있는 로케이션 중 qty가 가장 큰 곳
        const best = await (tx.inventory as any).findFirst({
          where: { skuId: sku.id, qty: { gt: 0 } } as any,
          orderBy: { qty: 'desc' } as any,
          include: { location: true } as any,
        });
        if (best?.location?.id) {
          destLoc = best.location;
        } else {
          // 2) 없으면 기본 반품 위치
          destLoc = await tx.location.findFirst({ where: { code: 'RET-01' } as any } as any);
          if (!destLoc) throw new NotFoundException('RET-01 location not found');
        }
      }

      // ✅ RETURN일 때: 출발지(매장) location 결정
      let srcLoc: any = null;
      if (isReturn && srcStoreId) {
        // 매장의 FLOOR location 찾기
        srcLoc = await tx.location.findFirst({
          where: { storeId: srcStoreId, code: 'FLOOR' } as any,
        } as any);

        if (!srcLoc) {
          // 매장에 FLOOR location 자동 생성
          srcLoc = await tx.location.create({
            data: { storeId: srcStoreId, code: 'FLOOR' } as any,
          } as any);
        }

        // ✅ 매장 재고 감소 (출발지)
        await (tx as any).inventoryTx.create({
          data: {
            type: 'out',
            qty: -qty,
            skuId: sku.id,
            locationId: srcLoc.id,
            jobId,
            jobItemId: item.id,
            isForced: false,
            operatorId: this.norm(dto?.operatorId) || null,
            note: `매장반품→창고입고 (to: ${destLoc.code})`,
          } as any,
        });

        // 매장 inventory snapshot 감소
        const srcInvRow = await (tx as any).inventory.findUnique({
          where: { skuId_locationId: { skuId: sku.id, locationId: srcLoc.id } } as any,
          select: { qty: true } as any,
        } as any);
        const srcBefore = Number(srcInvRow?.qty ?? 0);

        await (tx as any).inventory.upsert({
          where: { skuId_locationId: { skuId: sku.id, locationId: srcLoc.id } } as any,
          create: { skuId: sku.id, locationId: srcLoc.id, qty: srcBefore - qty } as any,
          update: { qty: { decrement: qty } as any } as any,
        } as any);
      }

      // 카운팅 증가 (입고도 qtyPicked로 카운팅)
      const updatedItem = await tx.jobItem.update({
        where: { id: item.id } as any,
        data: { qtyPicked: { increment: qty } } as any,
        include: { sku: true } as any,
      } as any);

      // ✅ 창고 재고 증가 (도착지)
      await (tx as any).inventoryTx.create({
        data: {
          type: 'in',
          qty: +qty,
          skuId: sku.id,
          locationId: destLoc.id,
          jobId,
          jobItemId: item.id,
          isForced: false,
          operatorId: this.norm(dto?.operatorId) || null,
          note: isReturn ? `매장반품→창고입고 (from: ${srcLoc?.code || 'N/A'})` : null,
        } as any,
      });

      // ✅ 창고 Inventory 스냅샷 갱신 (증가)
      const destInvRow = await (tx as any).inventory.findUnique({
        where: { skuId_locationId: { skuId: sku.id, locationId: destLoc.id } } as any,
        select: { qty: true } as any,
      } as any);
      const destBefore = Number(destInvRow?.qty ?? 0);

      await (tx as any).inventory.upsert({
        where: { skuId_locationId: { skuId: sku.id, locationId: destLoc.id } } as any,
        create: { skuId: sku.id, locationId: destLoc.id, qty: destBefore + qty } as any,
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
        usedLocationCode: destLoc.code,
        srcLocationCode: srcLoc?.code || null,
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

    const data = {
      orderNo: dto.orderNo || null,
      recipientName: dto.recipientName,
      phone: dto.phone,
      zip: dto.zip || null,
      addr1: dto.addr1,
      addr2: dto.addr2 || null,
      memo: dto.memo || null,
      carrierCode: dto.carrierCode || null,
      waybillNo: dto.waybillNo || null,
    };

    const row = await (this.prisma as any).jobParcel.upsert({
      where: { jobId } as any,
      create: { jobId, ...data } as any,
      update: data as any,
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

  /**
   * ✅ undoLastTx - 양방향 처리 지원
   * - 출고/입고 시 창고+매장 양쪽에 tx가 생성되므로, 연관된 tx들을 함께 삭제
   * - 같은 jobItemId + 1초 이내에 생성된 tx들을 쌍으로 처리
   */
  async undoLastTx(jobId: string, operatorId?: string) {
  return this.prisma.$transaction(async (tx) => {
    // 1) 마지막 InventoryTx (이 Job 기준)
    const lastTx = await (tx as any).inventoryTx.findFirst({
      where: { jobId },
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

    // ✅ 1-1) 양방향 처리된 연관 tx 찾기
    // 같은 jobItemId + 1초 이내에 생성된 tx들 (out/in 쌍)
    const lastCreatedAt = new Date(lastTx.createdAt);
    const oneSecondBefore = new Date(lastCreatedAt.getTime() - 1000);

    const relatedTxs = await (tx as any).inventoryTx.findMany({
      where: {
        jobId,
        jobItemId: lastTx.jobItemId,
        createdAt: { gte: oneSecondBefore },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 처리할 tx 목록 (연관된 것들 모두)
    const txsToUndo = relatedTxs.length > 0 ? relatedTxs : [lastTx];

    // ✅ 1-2) 각 tx에 대해 순서 검증 (이후 작업이 있으면 undo 불가)
    for (const txItem of txsToUndo) {
      const newerTx = await (tx as any).inventoryTx.findFirst({
        where: {
          skuId: txItem.skuId,
          locationId: txItem.locationId,
          createdAt: { gt: txItem.createdAt },
        },
        select: { id: true, type: true, qty: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });

      if (newerTx) {
        throw new BadRequestException(
          '이 스캔 이후 동일 SKU/로케이션에서 다른 작업이 진행되어 취소할 수 없어. (최근 작업부터 먼저 취소해야 함)',
        );
      }
    }

    // 2) 각 tx에 대해 재고 복구
    const deletedTxIds: string[] = [];
    for (const txItem of txsToUndo) {
      const txAbsQty = Math.abs(Number(txItem.qty || 0));
      const delta = txItem.qty < 0 ? +txAbsQty : -txAbsQty;

      // inventory 현재값
      const invRow = await (tx as any).inventory.findUnique({
        where: {
          skuId_locationId: {
            skuId: txItem.skuId,
            locationId: txItem.locationId,
          },
        },
        select: { qty: true },
      });

      const before = Number(invRow?.qty ?? 0);
      const after = before + delta;

      // ✅ 음수 방어
      if (after < 0) {
        throw new BadRequestException(
          `재고가 이미 다른 작업으로 사용되어 취소할 수 없어. (location: ${txItem.locationId}, 재고 부족)`,
        );
      }

      await (tx as any).inventory.upsert({
        where: {
          skuId_locationId: {
            skuId: txItem.skuId,
            locationId: txItem.locationId,
          },
        },
        create: {
          skuId: txItem.skuId,
          locationId: txItem.locationId,
          qty: after,
        },
        update: {
          qty: { increment: delta },
        },
      });

      // tx 삭제
      await (tx as any).inventoryTx.delete({
        where: { id: txItem.id },
      });

      deletedTxIds.push(txItem.id);
    }

    // 3) jobItem.qtyPicked 되돌리기 (한 번만 - 연관 tx들이 같은 수량을 처리했으므로)
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

    // 4) job done 상태 되돌리기(필요 시)
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
      deletedTxIds,
      undoneCount: deletedTxIds.length,
    };
  });
}
  // ================================
  // 🔽 UNDO 확장 (추가)
  // ================================

  // job 기준 InventoryTx 목록 (UNDO 시 삭제되므로 활성 로그만 조회됨)
  async listInventoryTx(jobId: string) {
    return (this.prisma as any).inventoryTx.findMany({
      where: { jobId },
      orderBy: { createdAt: 'desc' },
      include: {
        sku: { select: { id: true, sku: true, makerCode: true, name: true } },
        location: { select: { id: true, code: true, name: true } },
      },
    });
  }

  // 최근 tx부터 특정 tx까지 연속 undo
  async undoUntilTx(jobId: string, targetTxId: string, operatorId?: string) {
    const txs = await (this.prisma as any).inventoryTx.findMany({
      where: { jobId },
      orderBy: { createdAt: 'desc' },
      select: { id: true } as any,
    });

    const idx = (txs || []).findIndex((t: any) => t.id === targetTxId);
    if (idx < 0) {
      throw new BadRequestException('해당 tx는 undo 대상이 아니야');
    }

    let undoneCount = 0;
    for (let i = 0; i <= idx; i++) {
      await this.undoLastTx(jobId, operatorId);
      undoneCount += 1;
    }

    return { ok: true, undoneCount, untilTxId: targetTxId };
  }

  // job 전체 undo
  async undoAllTx(jobId: string, operatorId?: string) {
    let undoneCount = 0;

    while (true) {
      const last = await (this.prisma as any).inventoryTx.findFirst({
        where: { jobId },
        orderBy: { createdAt: 'desc' },
        select: { id: true } as any,
      });

      if (!last) break;

      await this.undoLastTx(jobId, operatorId);
      undoneCount += 1;

      if (undoneCount > 5000) {
        throw new BadRequestException('undoAll safety stop');
      }
    }

    return { ok: true, undoneCount };
  }

  // ================================
  // 🔽 배치(묶음) Job 스캔
  // ================================

  /**
   * 배치 Job 스캔
   * - 배치 Job의 하위 Job 중 해당 SKU가 포함된 Job을 찾아 스캔 처리
   * - 단포(sortOrder=1) 우선, 합포(sortOrder=2) 나중
   * - 하위 Job 완료 시 CJ 송장 발급 가능 상태로 변경
   * - 모든 하위 Job 완료 시 배치 Job도 완료 처리
   */
  async scanBatch(
    batchJobId: string,
    dto: {
      value?: string;
      skuCode?: string;
      qty?: number;
      locationCode?: string;
      operatorId?: string;
    },
  ) {
    // 1) 배치 Job 확인
    const batchJob = await this.prisma.job.findUnique({
      where: { id: batchJobId } as any,
      select: { id: true, parentId: true, status: true } as any,
    } as any);

    if (!batchJob) throw new NotFoundException(`Batch Job not found: ${batchJobId}`);
    if ((batchJob as any).parentId) {
      throw new BadRequestException('이 Job은 배치 Job이 아닙니다 (하위 Job입니다)');
    }

    const raw = this.norm(dto.value || dto.skuCode);
    if (!raw) throw new BadRequestException('value/skuCode is required');

    const qty = Number(dto.qty ?? 1);
    if (!Number.isFinite(qty) || qty <= 0) throw new BadRequestException('qty must be > 0');

    // 2) SKU 찾기
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
      throw new NotFoundException(`SKU not found: ${raw}`);
    }

    // 3) 하위 Job 중 해당 SKU를 포함하고, 아직 완료되지 않은 Job 찾기
    //    - sortOrder 오름차순 (단포=1 우선)
    //    - 해당 SKU의 qtyPicked < qtyPlanned인 것
    const childJobs = await this.prisma.job.findMany({
      where: {
        parentId: batchJobId,
        status: { not: 'done' },
      } as any,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] as any,
      include: {
        items: {
          where: { skuId: sku.id },
          select: { id: true, qtyPlanned: true, qtyPicked: true },
        },
        parcel: true,
      } as any,
    } as any);

    // 해당 SKU가 있고, 아직 피킹이 덜 된 Job 찾기
    let targetJob: any = null;
    let targetItem: any = null;

    for (const job of childJobs) {
      const item = (job as any).items?.find(
        (it: any) => Number(it.qtyPicked) < Number(it.qtyPlanned)
      );
      if (item) {
        targetJob = job;
        targetItem = item;
        break;
      }
    }

    if (!targetJob || !targetItem) {
      throw new NotFoundException(`이 바코드(${raw})가 포함된 미완료 주문이 없습니다`);
    }

    // 4) 해당 Job에 대해 기존 scan 로직 호출
    const scanResult = await this.scan(targetJob.id, {
      value: raw,
      qty,
      locationCode: dto.locationCode,
      operatorId: dto.operatorId,
    });

    // 5) 해당 Job 완료 여부 확인
    const updatedJob = await this.prisma.job.findUnique({
      where: { id: targetJob.id } as any,
      include: {
        items: { select: { qtyPlanned: true, qtyPicked: true } },
        parcel: true,
      } as any,
    } as any);

    const items = (updatedJob as any)?.items || [];
    const jobIsDone = items.length > 0 && items.every(
      (it: any) => Number(it.qtyPicked) >= Number(it.qtyPlanned)
    );

    // 6) ✅ 주문 완료 시 자동 CJ 예약
    let cjReservation: any = null;
    if (jobIsDone) {
      try {
        this.logger.log(`주문 완료 - 자동 CJ 예약 시작: ${targetJob.id}`);
        cjReservation = await this.exportsService.createCjReservation(targetJob.id);
        this.logger.log(`CJ 예약 완료: ${cjReservation.invcNo}`);
      } catch (cjError: any) {
        // CJ 예약 실패해도 스캔 결과는 반환 (에러 로그만)
        this.logger.error(`CJ 자동 예약 실패: ${cjError.message}`);
        cjReservation = { error: cjError.message };
      }
    }

    // 7) 모든 하위 Job 완료 여부 확인 → 배치 Job 완료 처리
    const allChildren = await this.prisma.job.findMany({
      where: { parentId: batchJobId } as any,
      select: { id: true, status: true } as any,
    } as any);

    const allChildrenDone = allChildren.length > 0 && allChildren.every(
      (c: any) => c.status === 'done'
    );

    if (allChildrenDone) {
      await this.prisma.job.update({
        where: { id: batchJobId } as any,
        data: { status: 'done', doneAt: new Date() } as any,
      } as any);
    }

    // 8) 결과 반환
    return {
      ...scanResult,
      matchedJobId: targetJob.id,
      matchedJobTitle: (targetJob as any).title,
      matchedParcel: (targetJob as any).parcel,
      jobCompleted: jobIsDone,
      batchCompleted: allChildrenDone,
      // ✅ CJ 예약 결과 포함
      cjReservation,
      // 진행 상황
      progress: {
        completedJobs: allChildren.filter((c: any) => c.status === 'done').length,
        totalJobs: allChildren.length,
      },
    };
  }

  /**
   * 배치 Job 상세 조회 (하위 Job 포함)
   */
  async getBatchJob(batchJobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: batchJobId } as any,
      include: {
        store: true,
        items: { include: { sku: true } },
        parcel: true,
        children: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            items: { include: { sku: true } },
            parcel: true,
          },
        },
      } as any,
    } as any);

    if (!job) throw new NotFoundException(`Job not found: ${batchJobId}`);

    // 진행 상황 계산
    const children = (job as any).children || [];
    const completedChildren = children.filter((c: any) => c.status === 'done');

    // 단포/합포 통계
    const singlePackJobs = children.filter((c: any) => c.packType === 'single');
    const multiPackJobs = children.filter((c: any) => c.packType === 'multi');

    return {
      ok: true,
      job,
      progress: {
        totalJobs: children.length,
        completedJobs: completedChildren.length,
        singlePack: {
          total: singlePackJobs.length,
          completed: singlePackJobs.filter((c: any) => c.status === 'done').length,
        },
        multiPack: {
          total: multiPackJobs.length,
          completed: multiPackJobs.filter((c: any) => c.status === 'done').length,
        },
      },
    };
  }

}
  