import { Injectable } from '@nestjs/common';
// 타입만 import
import type { Express } from 'express';

// CSV 파싱은 표준 라이브러리 없이도 간단히 처리 가능하지만,
// 견고하게 하려면 'csv-parse/sync' 추천.
// 우선 의존성 없이 간단 파서(쉼표·따옴표 최소 대응)로 시작.
@Injectable()
export class ImportsService {
  /**
   * 간단 CSV 파싱 (UTF-8 가정)
   * 첫 줄을 헤더로 쓰고, 이후 줄은 객체로 매핑
   */
  async parseCsv(buffer: Buffer): Promise<{
    header: string[];
    rows: Record<string, string>[];
    sample: Record<string, string>[];
  }> {
    const text = buffer.toString('utf8').replace(/\r\n/g, '\n').trim();
    const lines = text.split('\n').filter(Boolean);
    if (lines.length === 0) return { header: [], rows: [], sample: [] };

    // 아주 기본적인 CSV split — 큰따옴표 포함 케이스는 최소 대응
    const splitCsvLine = (line: string): string[] => {
      const out: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          // 연속 "" → " 로 처리
          if (inQuotes && line[i + 1] === '"') {
            cur += '"'; i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          out.push(cur);
          cur = '';
        } else {
          cur += ch;
        }
      }
      out.push(cur);
      return out.map(s => s.trim());
    };

    const header = splitCsvLine(lines[0]);
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i]);
      const obj: Record<string, string> = {};
      header.forEach((h, idx) => (obj[h] = cols[idx] ?? ''));
      rows.push(obj);
    }

    return { header, rows, sample: rows.slice(0, 3) };
  }

  /**
   * (나중) Prisma 업서트 골격
   * 모델/키 확정 후 구현
   */
  // async upsertOrders(
  //   rows: Record<string, string>[],
  //   ctx: { type: 'STORE' | 'ONLINE' },
  // ) {
  //   // 예시 스키마 가정:
  //   // model Order {
  //   //   id           String @id @default(cuid())
  //   //   externalId   String @unique
  //   //   sku          String
  //   //   qty          Int
  //   //   customerName String?
  //   //   storeCode    String?
  //   //   source       String   // 'STORE' | 'ONLINE'
  //   //   createdAt    DateTime @default(now())
  //   //   updatedAt    DateTime @updatedAt
  //   // }
  //   //
  //   // for (const r of rows) {
  //   //   const data = {
  //   //     externalId: r['orderId'],
  //   //     sku: r['sku'],
  //   //     qty: Number(r['qty'] ?? 0),
  //   //     customerName: r['name'] ?? null,
  //   //     storeCode: r['store'] ?? null,
  //   //     source: ctx.type,
  //   //   };
  //   //   await this.prisma.order.upsert({
  //   //     where: { externalId: data.externalId },
  //   //     update: data,
  //   //     create: data,
  //   //   });
  //   // }
  //   // return { upserted: rows.length };
  // }
}
