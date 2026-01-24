import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, MessageTargetType } from '@prisma/client';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  // 메시지 목록 조회 (최신순)
  async findAll(limit = 50, offset = 0) {
    return this.prisma.message.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            receipts: true,
          },
        },
      },
    });
  }

  // 메시지 단건 조회 (receipts 포함)
  async findById(id: string) {
    return this.prisma.message.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
        receipts: {
          include: {
            employee: {
              select: {
                id: true,
                name: true,
                storeId: true,
                departmentId: true,
                pushToken: true,
                role: true,
                status: true,
                store: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                  },
                },
                department: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  // 메시지 생성 + receipts 생성
  async create(data: {
    title: string;
    body: string;
    authorId: string;
    targetType: MessageTargetType;
    targetStoreIds?: string[];
    targetDeptCodes?: string[];
  }) {
    // 1. 대상 직원 목록 조회
    const targetEmployees = await this.getTargetEmployees(
      data.targetType,
      data.targetStoreIds,
      data.targetDeptCodes,
    );

    // 2. 메시지 생성
    const message = await this.prisma.message.create({
      data: {
        title: data.title,
        body: data.body,
        authorId: data.authorId,
        targetType: data.targetType,
        targetStoreIds: data.targetStoreIds
          ? (data.targetStoreIds as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        targetDeptCodes: data.targetDeptCodes
          ? (data.targetDeptCodes as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // 3. receipts 생성 (대상 직원별)
    if (targetEmployees.length > 0) {
      await this.prisma.receipt.createMany({
        data: targetEmployees.map((emp) => ({
          messageId: message.id,
          employeeId: emp.id,
          pushTokenAtSend: emp.pushToken,
        })),
      });
    }

    return {
      message,
      targetCount: targetEmployees.length,
      targetEmployees, // 푸시 발송용
    };
  }

  // 대상 직원 조회 로직
  private async getTargetEmployees(
    targetType: MessageTargetType,
    targetStoreIds?: string[],
    targetDeptCodes?: string[],
  ) {
    const where: Prisma.EmployeeWhereInput = {
      status: 'ACTIVE', // 활성 직원만
    };

    if (targetType === 'STORE' && targetStoreIds && targetStoreIds.length > 0) {
      where.storeId = { in: targetStoreIds };
    } else if (targetType === 'HQ_DEPT' && targetDeptCodes && targetDeptCodes.length > 0) {
      // 부서명으로 조회
      const departments = await this.prisma.department.findMany({
        where: { name: { in: targetDeptCodes } },
        select: { id: true },
      });
      const deptIds = departments.map((d) => d.id);
      where.departmentId = { in: deptIds };
    }
    // ALL인 경우 where 조건 없음 (모든 활성 직원)

    return this.prisma.employee.findMany({
      where,
      select: {
        id: true,
        name: true,
        pushToken: true,
      },
    });
  }

  // 메시지 수정
  async update(
    id: string,
    data: {
      title?: string;
      body?: string;
    },
  ) {
    const updateData: Prisma.MessageUpdateInput = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.body !== undefined) updateData.body = data.body;

    return this.prisma.message.update({
      where: { id },
      data: updateData,
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  // 메시지 삭제 (receipts도 cascade로 삭제됨)
  async delete(id: string) {
    return this.prisma.message.delete({
      where: { id },
    });
  }

  // 메시지 수 조회
  async count() {
    return this.prisma.message.count();
  }

  // ==========================================
  // Receipt 관련
  // ==========================================

  // 읽음 처리
  async markAsRead(messageId: string, employeeId: string) {
    return this.prisma.receipt.updateMany({
      where: {
        messageId,
        employeeId,
        read: false,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });
  }

  // 특정 직원의 미읽음 메시지 수
  async getUnreadCount(employeeId: string) {
    return this.prisma.receipt.count({
      where: {
        employeeId,
        read: false,
      },
    });
  }

  // 특정 직원의 메시지 목록 (receipt 기반)
  async getEmployeeMessages(employeeId: string, limit = 50, offset = 0) {
    return this.prisma.receipt.findMany({
      where: { employeeId },
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      include: {
        message: {
          select: {
            id: true,
            title: true,
            body: true,
            createdAt: true,
          },
        },
      },
    });
  }

  // 미읽음 직원 목록 조회 (재발송용)
  async getUnreadRecipients(messageId: string) {
    return this.prisma.receipt.findMany({
      where: {
        messageId,
        read: false,
      },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            pushToken: true,
            status: true,
            role: true,
          },
        },
      },
    });
  }
}
