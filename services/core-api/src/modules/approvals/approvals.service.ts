import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, ApprovalType, ApprovalStatus, ApproverStatus } from '@prisma/client';

interface ApproverInput {
  order: number;
  employeeId: string;
  name: string;
  department?: string;
}

interface AttachmentInput {
  name: string;
  url: string;
  type: string;
  size: number;
}

@Injectable()
export class ApprovalsService {
  constructor(private prisma: PrismaService) {}

  // 결재 문서 목록 조회 (기안자 기준)
  async findMyDrafts(authorId: string, limit = 50, offset = 0) {
    return this.prisma.approval.findMany({
      where: { authorId },
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: { id: true, name: true },
        },
        approvers: {
          orderBy: { order: 'asc' },
          include: {
            employee: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });
  }

  // 내가 승인할 결재 문서 (PENDING 상태, 내 차례)
  async findPendingApprovals(employeeId: string, limit = 50, offset = 0) {
    return this.prisma.approval.findMany({
      where: {
        status: 'PENDING',
        approvers: {
          some: {
            employeeId,
            status: 'PENDING',
          },
        },
      },
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: { id: true, name: true },
        },
        approvers: {
          orderBy: { order: 'asc' },
          include: {
            employee: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });
  }

  // 내가 처리한 결재 문서
  async findProcessedApprovals(employeeId: string, limit = 50, offset = 0) {
    return this.prisma.approval.findMany({
      where: {
        approvers: {
          some: {
            employeeId,
            status: { in: ['APPROVED', 'REJECTED'] },
          },
        },
      },
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: { id: true, name: true },
        },
        approvers: {
          orderBy: { order: 'asc' },
          include: {
            employee: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });
  }

  // 결재 문서 단건 조회
  async findById(id: string) {
    return this.prisma.approval.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, name: true },
        },
        approvers: {
          orderBy: { order: 'asc' },
          include: {
            employee: {
              select: { id: true, name: true },
            },
          },
        },
        attachments: true,
      },
    });
  }

  // 결재 문서 생성
  async create(data: {
    authorId: string;
    department?: string;
    type: ApprovalType;
    title: string;
    content: string;
    details?: unknown;
    approvers: ApproverInput[];
    attachments?: AttachmentInput[];
  }) {
    return this.prisma.approval.create({
      data: {
        authorId: data.authorId,
        department: data.department,
        type: data.type,
        title: data.title,
        content: data.content,
        details: data.details ? (data.details as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        status: 'PENDING',
        currentStep: 1,
        approvers: {
          create: data.approvers.map((a) => ({
            order: a.order,
            employeeId: a.employeeId,
            name: a.name,
            department: a.department,
            status: 'PENDING',
          })),
        },
        attachments: data.attachments
          ? {
              create: data.attachments.map((att) => ({
                name: att.name,
                url: att.url,
                type: att.type,
                size: att.size,
              })),
            }
          : undefined,
      },
      include: {
        author: {
          select: { id: true, name: true },
        },
        approvers: {
          orderBy: { order: 'asc' },
        },
        attachments: true,
      },
    });
  }

  // 결재 처리 (승인/반려)
  async processApproval(
    approvalId: string,
    employeeId: string,
    action: 'APPROVED' | 'REJECTED',
    comment?: string,
  ) {
    // 현재 문서 조회
    const approval = await this.prisma.approval.findUnique({
      where: { id: approvalId },
      include: {
        approvers: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!approval) {
      throw new Error('결재 문서를 찾을 수 없습니다.');
    }

    if (approval.status !== 'PENDING') {
      throw new Error('이미 처리된 결재 문서입니다.');
    }

    // 내 승인자 정보 찾기
    const myApprover = approval.approvers.find((a) => a.employeeId === employeeId);
    if (!myApprover) {
      throw new Error('승인 권한이 없습니다.');
    }

    if (myApprover.order !== approval.currentStep) {
      throw new Error('현재 승인 순서가 아닙니다.');
    }

    if (myApprover.status !== 'PENDING') {
      throw new Error('이미 처리한 결재입니다.');
    }

    // 승인자 상태 업데이트
    await this.prisma.approvalApprover.update({
      where: { id: myApprover.id },
      data: {
        status: action,
        comment: comment || null,
        processedAt: new Date(),
      },
    });

    // 문서 상태 결정
    let newStatus: ApprovalStatus = approval.status;
    let newCurrentStep = approval.currentStep;

    if (action === 'REJECTED') {
      // 반려 시 전체 문서 반려
      newStatus = 'REJECTED';
    } else if (action === 'APPROVED') {
      // 승인 시
      if (approval.currentStep >= approval.approvers.length) {
        // 마지막 승인자가 승인 -> 문서 승인 완료
        newStatus = 'APPROVED';
      } else {
        // 다음 승인자로 이동
        newCurrentStep = approval.currentStep + 1;
      }
    }

    // 문서 상태 업데이트
    return this.prisma.approval.update({
      where: { id: approvalId },
      data: {
        status: newStatus,
        currentStep: newCurrentStep,
      },
      include: {
        author: {
          select: { id: true, name: true },
        },
        approvers: {
          orderBy: { order: 'asc' },
        },
      },
    });
  }

  // 결재 문서 삭제 (기안자만)
  async delete(id: string) {
    return this.prisma.approval.delete({
      where: { id },
    });
  }

  // 수 조회
  async countMyDrafts(authorId: string) {
    return this.prisma.approval.count({
      where: { authorId },
    });
  }

  async countPendingApprovals(employeeId: string) {
    return this.prisma.approval.count({
      where: {
        status: 'PENDING',
        approvers: {
          some: {
            employeeId,
            status: 'PENDING',
          },
        },
      },
    });
  }
}
