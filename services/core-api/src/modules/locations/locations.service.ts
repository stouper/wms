import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// 시스템 필수 Location (삭제 불가)
const SYSTEM_LOCATION_CODES = ['RET-01', 'UNASSIGNED', 'DEFECT', 'HOLD'];

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  private norm(v: any): string {
    return String(v ?? '').trim();
  }

  // 시스템 Location 여부
  isSystemLocation(code: string): boolean {
    return SYSTEM_LOCATION_CODES.includes(code);
  }

  // 본사 창고(HQ) Location 목록
  async listHqLocations() {
    const hqStore = await this.prisma.store.findFirst({
      where: { isHq: true },
    });

    if (!hqStore) {
      return { ok: true, rows: [], storeId: null };
    }

    const rows = await this.prisma.location.findMany({
      where: { storeId: hqStore.id },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        storeId: true,
      },
    });

    // 시스템 Location 여부 추가
    const rowsWithSystem = rows.map((r) => ({
      ...r,
      isSystem: this.isSystemLocation(r.code),
    }));

    return { ok: true, rows: rowsWithSystem, storeId: hqStore.id };
  }

  // 특정 Store의 Location 목록
  async listByStore(storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException(`Store not found: ${storeId}`);

    const rows = await this.prisma.location.findMany({
      where: { storeId },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        storeId: true,
      },
    });

    const rowsWithSystem = rows.map((r) => ({
      ...r,
      isSystem: store.isHq && this.isSystemLocation(r.code),
    }));

    return { ok: true, rows: rowsWithSystem, storeId };
  }

  // 단일 조회 (id)
  async getById(id: string) {
    const location = await this.prisma.location.findUnique({
      where: { id },
      select: { id: true, code: true, name: true, storeId: true },
    });
    if (!location) throw new NotFoundException(`Location not found: ${id}`);
    return { ok: true, location };
  }

  // 생성
  async create(dto: { storeId?: string; code: string; name?: string }) {
    const code = this.norm(dto.code);
    if (!code) throw new BadRequestException('code is required');

    // storeId가 없으면 HQ 기준
    let storeId = dto.storeId;
    if (!storeId) {
      const hqStore = await this.prisma.store.findFirst({ where: { isHq: true } });
      if (!hqStore) throw new BadRequestException('본사 창고(HQ)가 없습니다. 먼저 생성해주세요.');
      storeId = hqStore.id;
    }

    // 중복 체크
    const existing = await this.prisma.location.findFirst({
      where: { storeId, code },
    });
    if (existing) throw new ConflictException(`Location code already exists: ${code}`);

    const location = await this.prisma.location.create({
      data: {
        storeId,
        code,
        name: this.norm(dto.name) || null,
      },
      select: { id: true, code: true, name: true, storeId: true },
    });

    return { ok: true, location };
  }

  // 수정
  async update(id: string, dto: { code?: string; name?: string }) {
    const location = await this.prisma.location.findUnique({
      where: { id },
      include: { store: true },
    });
    if (!location) throw new NotFoundException(`Location not found: ${id}`);

    // 시스템 Location 코드 변경 불가
    if (location.store.isHq && this.isSystemLocation(location.code)) {
      if (dto.code !== undefined && dto.code !== location.code) {
        throw new BadRequestException(`시스템 Location(${location.code})의 코드는 변경할 수 없습니다.`);
      }
    }

    const data: any = {};

    if (dto.code !== undefined) {
      const code = this.norm(dto.code);
      if (!code) throw new BadRequestException('code cannot be empty');

      // 중복 체크 (자기 자신 제외)
      const existing = await this.prisma.location.findFirst({
        where: { storeId: location.storeId, code, id: { not: id } },
      });
      if (existing) throw new ConflictException(`Location code already exists: ${code}`);
      data.code = code;
    }

    if (dto.name !== undefined) {
      data.name = this.norm(dto.name) || null;
    }

    const updated = await this.prisma.location.update({
      where: { id },
      data,
      select: { id: true, code: true, name: true, storeId: true },
    });

    return { ok: true, location: updated };
  }

  // 삭제
  async delete(id: string) {
    const location = await this.prisma.location.findUnique({
      where: { id },
      include: { store: true },
    });
    if (!location) throw new NotFoundException(`Location not found: ${id}`);

    // 시스템 Location 삭제 불가
    if (location.store.isHq && this.isSystemLocation(location.code)) {
      throw new BadRequestException(`시스템 Location(${location.code})은 삭제할 수 없습니다.`);
    }

    // 연결된 Inventory가 있는지 확인
    const invCount = await this.prisma.inventory.count({ where: { locationId: id } });
    if (invCount > 0) {
      throw new ConflictException(`이 Location에 재고(${invCount}건)가 있어 삭제할 수 없습니다.`);
    }

    await this.prisma.location.delete({ where: { id } });
    return { ok: true };
  }
}
