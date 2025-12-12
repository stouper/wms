import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { parse } from 'csv-parse/sync';
import { mapParcelRow, mapStoreRow, CsvRow } from './mappers';
import { randomUUID } from 'crypto';

type ImportType = 'STORE' | 'PARCEL';

@Injectable()
export class ImportsService {
  constructor(private prisma: PrismaService) {}

  async importOrdersCsv(buf: Buffer, type: ImportType) {
    // 1) ImportJob 생성
    const job = await this.prisma.importJob.create({
      data: { type: type === 'STORE' ? 'ORDER_STORE' : 'ORDER_PARCEL' },
    });

    try {
      // 2) CSV 파싱
      const records: CsvRow[] = parse(buf, {
        bom: true,
        columns: true,     // 1행을 헤더로
        skip_empty_lines: true,
        trim: true,
      });

      let success = 0;
      let fail = 0;

      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        try {
          if (type === 'STORE') {
            await this.processStoreRow(row);
          } else {
            await this.processParcelRow(row);
          }
          success++;
        } catch (err: any) {
          fail++;
          await this.prisma.importLog.create({
            data: {
              jobId: job.id,
              rowNo: i + 2, // 헤더가 1행이므로 +1, 0-index 보정 +1
              raw: JSON.stringify(row),
              error: String(err?.message ?? err),
            },
          });
        }
      }

      // 3) Job 업데이트
      const updated = await this.prisma.importJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          totalRows: records.length,
          successCount: success,
          failCount: fail,
        },
      });

      return {
        ok: true,
        jobId: updated.id,
        total: updated.totalRows,
        success: updated.successCount,
        fail: updated.failCount,
      };
    } catch (e) {
      // 실패시 Job 상태 업데이트
      await this.prisma.importJob.update({
        where: { id: job.id },
        data: { status: 'FAILED' },
      });
      throw new BadRequestException('CSV 파싱/처리 중 오류: ' + (e as Error).message);
    }
  }

  /* ---------------- internal processors ---------------- */

  private async processStoreRow(r: CsvRow) {
    const row = mapStoreRow(r);

    // 1) Store upsert (정책 2번: 코드 있으면 이름 업데이트)
    const store = await this.prisma.store.upsert({
      where: { storeCode: row.storeCode },
      update: { storeName: row.storeName ?? undefined },
      create: { storeCode: row.storeCode, storeName: row.storeName ?? null },
    });

    // 2) SKU 찾기 (skuCode + size)
    const sku = await this.prisma.sku.findUnique({
      where: { skuCode_size: { skuCode: row.sku, size: row.size } },
    });
    if (!sku) throw new Error(`SKU 미존재: ${row.sku} / ${row.size}`);

    // 3) 주문 생성/업서트
    const orderNo = row.orderNo ?? this.generateOrderNo('S');
    const order = await this.prisma.order.upsert({
      where: { orderNo },
      update: {},
      create: {
        orderNo,
        orderType: 'STORE',
        destStoreId: store.id,
        status: 'CREATED',
        memo: row.memo ?? undefined,
      },
    });

    // 4) 라인 추가
    await this.prisma.orderLine.create({
      data: {
        orderId: order.id,
        skuId: sku.id,
        qty: row.qty,
      },
    });
  }

  private async processParcelRow(r: CsvRow) {
    const row = mapParcelRow(r);

    // 1) SKU 찾기
    const sku = await this.prisma.sku.findUnique({
      where: { skuCode_size: { skuCode: row.sku, size: row.size } },
    });
    if (!sku) throw new Error(`SKU 미존재: ${row.sku} / ${row.size}`);

    // 2) 주문 생성/업서트
    const orderNo = row.orderNo ?? this.generateOrderNo('P');
    const order = await this.prisma.order.upsert({
      where: { orderNo },
      update: {},
      create: {
        orderNo,
        orderType: 'PARCEL',
        receiverName: row.receiverName,
        address1: row.address1,
        phone: row.phone,
        carrierCode: row.carrierCode ?? undefined,
        status: 'CREATED',
        memo: row.memo ?? undefined,
      },
    });

    // 3) 라인 추가
    await this.prisma.orderLine.create({
      data: { orderId: order.id, skuId: sku.id, qty: row.qty },
    });
  }

  private generateOrderNo(prefix: 'S' | 'P') {
    // 예: S-20251213-ABCD (간단 버전)
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `${prefix}-${ymd}-${randomUUID().slice(0, 4).toUpperCase()}`;
    // 운영에서 규칙이 필요하면 여기만 교체
  }
}
