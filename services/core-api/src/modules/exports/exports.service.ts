import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CjApiService } from '../cj-api/cj-api.service';
import type { WaybillPrintData, CjTrackingData } from '../cj-api/interfaces/cj-api.interface';

type Row = { storeCode: string; makerCode: string; qty: number };

@Injectable()
export class ExportsService {
  private readonly logger = new Logger(ExportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cjApi: CjApiService,
  ) {}

  /**
   * ============================================
   * EPMS CSV 내보내기 (기존 기능)
   * ============================================
   */

  private assertDate(date: string) {
    if (!/^\d{8}$/.test(date)) throw new BadRequestException('date must be YYYYMMDD');

    const start = new Date(
      `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00`,
    );
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  private csvCell(v: any) {
    // ✅ replaceAll 대신 정규식 replace
    const s = String(v ?? '').replace(/"/g, '""');
    return `"${s}"`;
  }

  async exportEpmsCsv(date: string) {
    const { start, end } = this.assertDate(date);

    // ✅ 당일 완료(doneAt) 기준으로 1번 export
    const jobs: any[] = await this.prisma.job.findMany({
      where: {
        status: 'done',
        doneAt: { gte: start, lt: end } as any,
      } as any,
      include: {
        store: { select: { code: true } },
        items: {
          include: { sku: { select: { makerCode: true } } },
        } as any,
      } as any,
    } as any);

    const map = new Map<string, Row>();

    for (const job of jobs) {
      const storeCode = String(job.store?.code ?? '').trim();
      if (!storeCode) continue;

      for (const it of (job.items ?? []) as any[]) {
        const picked = Number(it.qtyPicked ?? 0);
        if (!picked || picked <= 0) continue;

        const maker =
          String(it.makerCodeSnapshot ?? '').trim() ||
          String(it.sku?.makerCode ?? '').trim();

        if (!maker) continue;

        const key = `${storeCode}__${maker}`;
        const prev = map.get(key);
        if (prev) prev.qty += picked;
        else map.set(key, { storeCode, makerCode: maker, qty: picked });
      }
    }

    const rows = Array.from(map.values()).sort((a, b) => {
      if (a.storeCode === b.storeCode) return a.makerCode.localeCompare(b.makerCode);
      return a.storeCode.localeCompare(b.storeCode);
    });

    const header = [
      '출고구분:1:출고 2:반품',
      '출고일자',
      '창고코드',
      '매장코드',
      '행사코드',
      '단품/MAKER코드',
      '수량',
      '전표비고',
      '출고의뢰전표번호',
      '가격',
    ];

    const lines: string[] = [header.join(',')];

    for (const r of rows) {
      const line = [
        '1',          // A 출고
        date,         // B YYYYMMDD
        '',           // C 빈칸
        r.storeCode,  // D 매장코드
        '',           // E 빈칸
        r.makerCode,  // F makerCode
        String(r.qty),// G 수량
        '', '', '',   // H I J
      ];
      lines.push(line.map((x) => this.csvCell(x)).join(','));
    }

    return {
      filename: `EPMS_OUT_${date}.csv`,
      csv: lines.join('\r\n'),
      count: rows.length,
    };
  }

  /**
   * ============================================
   * CJ 대한통운 택배 연동
   * ============================================
   */

  /**
   * CJ 예약 접수
   * - Job에 대해 CJ API 호출
   * - CjShipment 레코드 생성
   * - JobParcel에 운송장 번호 저장
   *
   * ✅ Race Condition 방지:
   * - 선점 레코드(pending) 먼저 생성 → API 호출 → 완료 업데이트
   * - 트랜잭션으로 선점 단계 보호
   */
  async createCjReservation(jobId: string) {
    this.logger.log(`CJ 예약 시작: ${jobId}`);

    // ============================================
    // 1단계: 선점 레코드 생성 (트랜잭션으로 보호)
    // ============================================
    let pendingShipment: any;

    try {
      pendingShipment = await this.prisma.$transaction(async (tx) => {
        // 이미 CjShipment가 있는지 확인 (FOR UPDATE 효과)
        const existing = await tx.cjShipment.findUnique({
          where: { jobId },
        });

        if (existing) {
          // 이미 완료된 예약
          if (existing.invcNo && existing.invcNo !== 'PENDING') {
            throw new BadRequestException(`CJ 예약이 이미 존재합니다. 운송장 번호: ${existing.invcNo}`);
          }
          // pending 상태인 경우 (다른 요청이 진행 중)
          if (existing.invcNo === 'PENDING') {
            throw new BadRequestException('CJ 예약이 진행 중입니다. 잠시 후 다시 시도해주세요.');
          }
        }

        // 선점 레코드 생성 (pending 상태)
        const pending = await tx.cjShipment.create({
          data: {
            jobId,
            invcNo: 'PENDING', // 임시 값
            custUseNo: `PENDING_${Date.now()}`,
            rcptYmd: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
          },
        });

        this.logger.log(`선점 레코드 생성: ${pending.id}`);
        return pending;
      }, {
        timeout: 10000, // 10초 타임아웃
      });
    } catch (error: any) {
      // Unique constraint 에러 처리 (동시 요청 시)
      if (error.code === 'P2002') {
        throw new BadRequestException('CJ 예약이 이미 진행 중입니다. 잠시 후 다시 시도해주세요.');
      }
      throw error;
    }

    // ============================================
    // 2단계: CJ API 호출 (트랜잭션 밖에서)
    // ============================================
    try {
      const data = await this.cjApi.createReservation(jobId);

      // ============================================
      // 3단계: 선점 레코드를 실제 데이터로 업데이트
      // ============================================
      await this.prisma.cjShipment.update({
        where: { id: pendingShipment.id },
        data: {
          invcNo: data.INVC_NO,
          rcptYmd: data.RCPT_YMD,
          mpckKey: data.MPCK_KEY,
        },
      });

      this.logger.log(`CJ 예약 완료: ${jobId}, 운송장: ${data.INVC_NO}`);

      return {
        success: true,
        jobId,
        invcNo: data.INVC_NO,
        waybillNo: data.INVC_NO, // 호환성
        rcptYmd: data.RCPT_YMD,
        mpckKey: data.MPCK_KEY,
        // ✅ 주소 정제 데이터 추가 (송장 출력용)
        destCode: data.DEST_CODE,
        subDestCode: data.SUB_DEST_CODE,
        clsfAddr: data.CLSF_ADDR,
        branchName: data.BRANCH_NAME,
      };

    } catch (apiError: any) {
      // API 호출 실패 시 선점 레코드 삭제
      this.logger.error(`CJ API 호출 실패, 선점 레코드 삭제: ${pendingShipment.id}`);

      try {
        await this.prisma.cjShipment.delete({
          where: { id: pendingShipment.id },
        });
      } catch (deleteError: any) {
        this.logger.error(`선점 레코드 삭제 실패: ${deleteError.message}`);
      }

      throw apiError;
    }
  }

  /**
   * 운송장 출력용 데이터 조회
   * - Desktop에서 프린트 전에 호출
   */
  async getWaybillData(jobId: string) {
    const data = await this.cjApi.getWaybillPrintData(jobId);

    // 프론트엔드 호환 형식으로 변환
    return {
      waybillNo: data.waybillNo,
      orderNo: data.orderNo,
      recipient: data.recipient.name,
      recipientPhone: data.recipient.phone,
      address: `${data.recipient.addr} ${data.recipient.addrDetail || ''}`.trim(),
      zip: data.recipient.zip,
      sender: data.sender.name,
      senderPhone: data.sender.phone,
      senderAddress: `${data.sender.addr} ${data.sender.addrDetail || ''}`.trim(),
      goodsName: data.goods.name,
      goodsQty: data.goods.qty,
      memo: data.memo,
      rcptYmd: data.rcptYmd,
      // 원본 데이터도 포함
      _raw: data,
    };
  }

  /**
   * CJ 배송 추적
   */
  async trackCjShipment(waybillNo: string): Promise<CjTrackingData> {
    return this.cjApi.trackShipment(waybillNo);
  }

  /**
   * Job의 CJ 예약 상태 확인
   */
  async getCjReservationStatus(jobId: string) {
    const shipment = await this.prisma.cjShipment.findUnique({
      where: { jobId },
      include: { job: { include: { parcel: true } } },
    });

    if (!shipment) {
      return { exists: false };
    }

    // PENDING 상태면 진행 중
    if (shipment.invcNo === 'PENDING') {
      return { exists: false, pending: true };
    }

    return {
      exists: true,
      invcNo: shipment.invcNo,
      waybillNo: shipment.invcNo, // 호환성
      custUseNo: shipment.custUseNo,
      rcptYmd: shipment.rcptYmd,
      mpckKey: shipment.mpckKey,
      createdAt: shipment.createdAt,
      updatedAt: shipment.updatedAt,
    };
  }

  /**
   * CJ 예약 취소 (테스트용)
   */
  async cancelCjReservation(jobId: string) {
    return this.cjApi.cancelReservation(jobId);
  }

  /**
   * ============================================
   * CJ API 테스트용 메서드
   * ============================================
   */

  async testVerifyAddress(addr: string) {
    if (!addr) {
      throw new BadRequestException('주소(addr)를 입력하세요');
    }
    return this.cjApi.verifyAddress(addr);
  }

  async testGenerateWaybillNumbers(count: number = 1) {
    if (count < 1 || count > 10) {
      throw new BadRequestException('count는 1~10 사이여야 합니다');
    }
    return this.cjApi.generateWaybillNumbers(count);
  }
}
