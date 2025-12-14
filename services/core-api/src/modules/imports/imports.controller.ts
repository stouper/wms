import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';

type Row = Record<string, any>;

@Controller('imports')
export class ImportsController {
  constructor(private readonly prisma: PrismaService) {}

  /** 키 정규화: 따옴표/개행/공백 제거 + 소문자 */
  private normalizeKey(k: string) {
    return (k || '')
      .toString()
      .replace(/[“”"']/g, '') // 따옴표류 제거
      .replace(/\r?\n/g, '')   // 줄바꿈 제거
      .replace(/\s+/g, '')     // 모든 공백 제거
      .toLowerCase();
  }

  /** 요구 헤더(정규화). 순서 무관 */
  private readonly requiredHeaderSet = new Set([
    this.normalizeKey('코드'),
    this.normalizeKey('Maker코드'),  // = 바코드 (필수)
    this.normalizeKey('코드명'),
    this.normalizeKey('수량(전산)'),
    this.normalizeKey('현재가'),
    this.normalizeKey('창고'),
    // this.normalizeKey('현재가 금액'), // 계산 컬럼이면 필수 제외
  ]);

  /** 라벨 매핑 */
  private readonly mapCandidates = {
    sku: ['코드', 'code', 'sku', '상품코드', '제품코드'],            // 보조/표시용
    makerCode: ['Maker코드', 'makercode', 'barcode', '바코드'],     // 유니크 키(필수)
    name: ['코드명', '상품명', '제품명', 'name'],
    qty: ['수량(전산)', '수량', 'qty', '재고'],
    price: ['현재가', '단가', 'price'], // 현재는 DB에 저장 안함
    priceAmount: ['현재가 금액', '금액'],
    location: ['창고', '로케이션', 'location', 'bin'],
  } as const;

  private pick(row: Row, labels: readonly string[]) {
    for (const raw of labels) {
      const key = this.normalizeKey(raw);
      if (key in row) return row[key];
    }
    return undefined;
  }

  /** 3행(0-based 2) 헤더 검증 */
  private validateHeadersAtRow(sheet: XLSX.WorkSheet, rowIndex = 2) {
    const rows2D: any[][] =
      (XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as any[][]) ?? [];
    const headerRow: any[] = rows2D?.[rowIndex] ?? [];
    const normalized = headerRow.map((h) => this.normalizeKey(String(h ?? '')));
    const foundSet = new Set(normalized);

    const missing: string[] = [];
    for (const need of this.requiredHeaderSet) {
      if (!foundSet.has(need)) missing.push(need);
    }

    if (missing.length) {
      const received = headerRow.map((h) => String(h ?? ''));
      throw new BadRequestException({
        message: '필수 헤더가 없습니다. (헤더는 3행, 데이터는 4행부터)',
        required: Array.from(this.requiredHeaderSet),
        missing,
        received,
        tip: '예: 코드 / Maker코드(=바코드) / 코드명 / 수량(전산) / 현재가 / 창고',
      });
    }
  }

  @Post('hq-inventory')
  @UseInterceptors(FileInterceptor('file'))
  async uploadHQ(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('엑셀 파일 필요 (form-data: file)');

    const filename = file.originalname ?? 'upload.xlsx';
    const mimetype = file.mimetype ?? '';
    const okType =
      mimetype.includes('spreadsheetml') ||
      mimetype === 'application/vnd.ms-excel' ||
      mimetype === 'text/csv' ||
      filename.toLowerCase().endsWith('.xlsx') ||
      filename.toLowerCase().endsWith('.csv');
    if (!okType) throw new BadRequestException('엑셀(xlsx/csv)만 허용');

    // 1) 워크북/시트
    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    const sh = wb.Sheets[sheetName];

    // 2) 헤더 3행 검증
    this.validateHeadersAtRow(sh, 2);

    // 3) 3행 헤더 / 4행 데이터 파싱 → range:2
    let rawRows: Row[] = [];
    try {
      rawRows = XLSX.utils.sheet_to_json<Row>(sh, { defval: null, raw: true, range: 2 });
      if (rawRows.length === 0) {
        rawRows = XLSX.utils.sheet_to_json<Row>(sh, { defval: null, raw: true });
      }
    } catch {
      rawRows = XLSX.utils.sheet_to_json<Row>(sh, { defval: null, raw: true });
    }

    // 4) 키 정규화 적용
    const normRows: Row[] = rawRows.map((r) => {
      const o: Row = {};
      for (const k of Object.keys(r)) o[this.normalizeKey(k)] = r[k];
      return o;
    });

    // 5) 기준 Store 확보 (Location 복합키용 storeId 필요)
    const baseStore =
      (await this.prisma.store.findFirst({ select: { id: true } })) ?? null;
    if (!baseStore) {
      throw new BadRequestException(
        '기준 매장(Store)이 없습니다. 먼저 Store 레코드를 하나 생성해주세요.'
      );
    }

    // 6) 행 처리 (필수: makerCode(=바코드) + QTY) + DB 업서트
    let processed = 0;
    let changed = 0;
    let missingBarcode = 0;
    const skipped: Array<{ index: number; reason: string }> = [];
    const rowErrors: Array<{ index: number; reason: string }> = [];

    for (let i = 0; i < normRows.length; i++) {
      const r = normRows[i];

      const skuCode = this.pick(r, this.mapCandidates.sku);               // 보조/표시용
      const makerCodeRaw = this.pick(r, this.mapCandidates.makerCode);    // = 바코드(필수)
      const name = this.pick(r, this.mapCandidates.name);
      const qtyRaw = this.pick(r, this.mapCandidates.qty);
      // const priceRaw = this.pick(r, this.mapCandidates.price); // 현재 미사용
      const locationCode = this.pick(r, this.mapCandidates.location) ?? 'default';

      // 바코드는 숫자판별하면 선행 0이 날아갈 수 있어 문자열로 취급
      const makerCode =
        makerCodeRaw == null || makerCodeRaw === '' ? undefined : String(makerCodeRaw).trim();

      const qty = qtyRaw == null || qtyRaw === '' ? undefined : Number(qtyRaw);
      // const price = priceRaw == null || priceRaw === '' || Number.isNaN(Number(priceRaw)) ? undefined : Number(priceRaw);

      // ✅ 필수: makerCode(=바코드) + qty
      if (!makerCode) {
        missingBarcode++;
        skipped.push({ index: i + 1, reason: '바코드(Maker코드) 누락' });
        continue;
      }
      if (qty == null || Number.isNaN(qty)) {
        skipped.push({ index: i + 1, reason: '수량 형식 오류/누락' });
        continue;
      }

      processed++;

      try {
        // 6-1) Sku upsert — where: makerCode (유니크)
        const sku = await this.prisma.sku.upsert({
          where: { makerCode }, // 고유 바코드
          update: {
            name: name ? String(name) : undefined,
            // price 없음 (스키마에 가격 필드가 없어서 제거)
            // code 필드가 있다면 아래처럼 보조 식별자 보관 가능:
            // code: skuCode ? String(skuCode) : undefined,
          },
          create: {
            makerCode,
            name: name ? String(name) : (skuCode ? String(skuCode) : makerCode),
            // price 없음
            // code: skuCode ? String(skuCode) : undefined,
          },
          select: { id: true },
        });

        // 6-2) Location upsert — 복합 유니크(storeId + code)
        const loc = await this.prisma.location.upsert({
          where: { storeId_code: { storeId: baseStore.id, code: String(locationCode) } },
          update: {},
          create: { storeId: baseStore.id, code: String(locationCode) },
          select: { id: true },
        });

        // 6-3) Inventory upsert — 복합 유니크(skuId + locationId)
        await this.prisma.inventory.upsert({
          where: { skuId_locationId: { skuId: sku.id, locationId: loc.id } },
          update: { qty },
          create: { skuId: sku.id, locationId: loc.id, qty },
        });

        changed++;
      } catch (e: any) {
        rowErrors.push({ index: i + 1, reason: e?.message ?? 'DB upsert 실패' });
      }
    }

    return {
      filename,
      sheet: sheetName,
      processedRows: processed,
      changedRows: changed,
      skipped: skipped.length,
      missingBarcode, // 바코드 누락 행 수
      rowErrors: rowErrors.slice(0, 10),
      requiredHeaders: Array.from(this.requiredHeaderSet),
      note:
        '바코드(=Maker코드) 필수. Sku는 makerCode 기준 업서트, Location은 storeId+code, Inventory는 skuId+locationId로 업서트.',
    };
  }
}
