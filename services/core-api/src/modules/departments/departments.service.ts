import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  // 부서 목록 조회
  async findAll(activeOnly = false) {
    return this.prisma.department.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { code: 'asc' },
      include: {
        _count: {
          select: { employees: true },
        },
      },
    });
  }

  // 부서 생성
  async create(data: { code: string; name: string }) {
    return this.prisma.department.create({
      data: {
        code: data.code.toUpperCase(),
        name: data.name,
      },
    });
  }

  // 부서 수정
  async update(id: string, data: { code?: string; name?: string; isActive?: boolean }) {
    return this.prisma.department.update({
      where: { id },
      data: {
        ...(data.code && { code: data.code.toUpperCase() }),
        ...(data.name && { name: data.name }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  // 부서 삭제
  async delete(id: string) {
    // 소속 직원이 있으면 departmentId를 null로 설정
    await this.prisma.employee.updateMany({
      where: { departmentId: id },
      data: { departmentId: null },
    });

    return this.prisma.department.delete({
      where: { id },
    });
  }
}
