import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  // 이벤트 목록 조회 (날짜 범위)
  async findByDateRange(startDate: Date, endDate: Date) {
    return this.prisma.event.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { date: 'asc' },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  // 특정 날짜의 이벤트 조회
  async findByDate(date: Date) {
    return this.prisma.event.findMany({
      where: { date },
      orderBy: { createdAt: 'asc' },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  // 이벤트 생성
  async create(data: { title: string; description?: string; date: Date; createdById: string }) {
    return this.prisma.event.create({
      data: {
        title: data.title,
        description: data.description,
        date: data.date,
        createdById: data.createdById,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  // 이벤트 수정
  async update(id: string, data: { title?: string; description?: string; date?: Date }) {
    return this.prisma.event.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.date !== undefined && { date: data.date }),
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  // 이벤트 삭제
  async delete(id: string) {
    return this.prisma.event.delete({
      where: { id },
    });
  }

  // 이벤트 단건 조회 (소유자 확인용)
  async findById(id: string) {
    return this.prisma.event.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }
}
