import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  private norm(v: any): string {
    return String(v ?? '').trim();
  }

  // 전체 목록
  async list() {
    const rows = await this.prisma.store.findMany({
      orderBy: [{ isHq: 'desc' }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        isHq: true,
      },
    });
    return { ok: true, rows };
  }

  // 단일 조회 (id)
  async getById(id: string) {
    const store = await this.prisma.store.findUnique({
      where: { id },
      select: { id: true, code: true, name: true, isHq: true },
    });
    if (!store) throw new NotFoundException(`Store not found: ${id}`);
    return { ok: true, store };
  }

  // 단일 조회 (code)
  async getByCode(code: string) {
    const c = this.norm(code);
    if (!c) throw new BadRequestException('code is required');

    const store = await this.prisma.store.findUnique({
      where: { code: c },
      select: { id: true, code: true, name: true, isHq: true },
    });
    if (!store) throw new NotFoundException(`Store not found: ${c}`);
    return { ok: true, store };
  }

  // 생성
  async create(dto: { code: string; name?: string; isHq?: boolean }) {
    const code = this.norm(dto.code);
    if (!code) throw new BadRequestException('code is required');

    // 중복 체크
    const existing = await this.prisma.store.findUnique({ where: { code } });
    if (existing) throw new ConflictException(`Store code already exists: ${code}`);

    // isHq는 하나만 가능
    if (dto.isHq) {
      const hqExists = await this.prisma.store.findFirst({ where: { isHq: true } });
      if (hqExists) throw new ConflictException('본사 창고(isHq=true)는 이미 존재합니다.');
    }

    const store = await this.prisma.store.create({
      data: {
        code,
        name: this.norm(dto.name) || null,
        isHq: Boolean(dto.isHq),
      },
      select: { id: true, code: true, name: true, isHq: true },
    });

    return { ok: true, store };
  }

  // 수정
  async update(id: string, dto: { code?: string; name?: string; isHq?: boolean }) {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) throw new NotFoundException(`Store not found: ${id}`);

    const data: any = {};

    if (dto.code !== undefined) {
      const code = this.norm(dto.code);
      if (!code) throw new BadRequestException('code cannot be empty');

      // 중복 체크 (자기 자신 제외)
      const existing = await this.prisma.store.findFirst({
        where: { code, id: { not: id } },
      });
      if (existing) throw new ConflictException(`Store code already exists: ${code}`);
      data.code = code;
    }

    if (dto.name !== undefined) {
      data.name = this.norm(dto.name) || null;
    }

    if (dto.isHq !== undefined) {
      // isHq는 하나만 가능
      if (dto.isHq && !store.isHq) {
        const hqExists = await this.prisma.store.findFirst({
          where: { isHq: true, id: { not: id } },
        });
        if (hqExists) throw new ConflictException('본사 창고(isHq=true)는 이미 존재합니다.');
      }
      data.isHq = Boolean(dto.isHq);
    }

    const updated = await this.prisma.store.update({
      where: { id },
      data,
      select: { id: true, code: true, name: true, isHq: true },
    });

    return { ok: true, store: updated };
  }

  // 삭제
  async delete(id: string) {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) throw new NotFoundException(`Store not found: ${id}`);

    // 본사 창고는 삭제 불가
    if (store.isHq) {
      throw new BadRequestException('본사 창고(isHq=true)는 삭제할 수 없습니다.');
    }

    // 연결된 Job이 있는지 확인
    const jobCount = await this.prisma.job.count({ where: { storeId: id } });
    if (jobCount > 0) {
      throw new ConflictException(`이 매장에 연결된 작업(${jobCount}건)이 있어 삭제할 수 없습니다.`);
    }

    await this.prisma.store.delete({ where: { id } });
    return { ok: true };
  }

  // 일괄 생성/수정 (Excel 업로드용)
  async bulkUpsert(items: Array<{ code: string; name?: string }>) {
    const results: Array<{
      code: string;
      name?: string;
      status: 'created' | 'updated' | 'skipped' | 'error';
      message?: string;
    }> = [];

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const item of items) {
      const code = this.norm(item.code);
      const name = this.norm(item.name) || null;

      if (!code) {
        results.push({
          code: item.code,
          name: item.name,
          status: 'error',
          message: '매장코드가 없습니다.',
        });
        errorCount++;
        continue;
      }

      try {
        // 기존 매장 조회
        const existing = await this.prisma.store.findUnique({ where: { code } });

        if (existing) {
          // 이름이 같으면 스킵
          if (existing.name === name) {
            results.push({
              code,
              name,
              status: 'skipped',
              message: '변경 없음',
            });
            skippedCount++;
          } else {
            // 이름 업데이트
            await this.prisma.store.update({
              where: { code },
              data: { name },
            });
            results.push({
              code,
              name,
              status: 'updated',
            });
            updatedCount++;
          }
        } else {
          // 신규 생성
          await this.prisma.store.create({
            data: { code, name, isHq: false },
          });
          results.push({
            code,
            name,
            status: 'created',
          });
          createdCount++;
        }
      } catch (e: any) {
        results.push({
          code,
          name,
          status: 'error',
          message: e?.message || String(e),
        });
        errorCount++;
      }
    }

    return {
      ok: true,
      total: items.length,
      created: createdCount,
      updated: updatedCount,
      skipped: skippedCount,
      error: errorCount,
      results,
    };
  }
}
