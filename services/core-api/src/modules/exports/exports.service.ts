import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type Row = { storeCode: string; makerCode: string; qty: number };

@Injectable()
export class ExportsService {
  constructor(private readonly prisma: PrismaService) {}

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
        items: {
          include: { sku: { select: { makerCode: true } } },
        } as any,
      } as any,
    } as any);

    const map = new Map<string, Row>();

    for (const job of jobs) {
      const storeCode = String(job.storeCode ?? '').trim();
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
}
