import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovalType } from '@prisma/client';

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

@Controller('approvals')
export class ApprovalsController {
  constructor(
    private approvalsService: ApprovalsService,
    private prisma: PrismaService,
  ) {}

  // GET /approvals/my-drafts - 내가 올린 결재 문서
  @Get('my-drafts')
  async getMyDrafts(
    @Query('firebaseUid') firebaseUid: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (!firebaseUid) {
      return { success: false, error: 'firebaseUid is required' };
    }

    const employee = await this.prisma.employee.findUnique({
      where: { firebaseUid },
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    const approvals = await this.approvalsService.findMyDrafts(
      employee.id,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );

    const total = await this.approvalsService.countMyDrafts(employee.id);

    return {
      success: true,
      rows: approvals.map((a) => this.formatApproval(a, employee.id)),
      total,
    };
  }

  // GET /approvals/pending - 내가 승인할 결재 문서
  @Get('pending')
  async getPendingApprovals(
    @Query('firebaseUid') firebaseUid: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (!firebaseUid) {
      return { success: false, error: 'firebaseUid is required' };
    }

    const employee = await this.prisma.employee.findUnique({
      where: { firebaseUid },
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    const approvals = await this.approvalsService.findPendingApprovals(
      employee.id,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );

    // 내 차례인 것만 필터링
    const filtered = approvals.filter((a) => {
      const myApprover = a.approvers.find((ap) => ap.employeeId === employee.id);
      return myApprover && myApprover.order === a.currentStep && myApprover.status === 'PENDING';
    });

    const total = await this.approvalsService.countPendingApprovals(employee.id);

    return {
      success: true,
      rows: filtered.map((a) => this.formatApproval(a, employee.id)),
      total,
    };
  }

  // GET /approvals/processed - 내가 처리한 결재 문서
  @Get('processed')
  async getProcessedApprovals(
    @Query('firebaseUid') firebaseUid: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (!firebaseUid) {
      return { success: false, error: 'firebaseUid is required' };
    }

    const employee = await this.prisma.employee.findUnique({
      where: { firebaseUid },
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    const approvals = await this.approvalsService.findProcessedApprovals(
      employee.id,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );

    return {
      success: true,
      rows: approvals.map((a) => this.formatApproval(a, employee.id)),
    };
  }

  // GET /approvals/:id - 결재 문서 상세
  @Get(':id')
  async getApproval(@Param('id') id: string) {
    const approval = await this.approvalsService.findById(id);

    if (!approval) {
      throw new HttpException('Approval not found', HttpStatus.NOT_FOUND);
    }

    return {
      success: true,
      approval: {
        id: approval.id,
        authorId: approval.authorId,
        authorName: approval.author.name,
        department: approval.department,
        type: approval.type,
        title: approval.title,
        content: approval.content,
        details: approval.details,
        status: approval.status,
        currentStep: approval.currentStep,
        approvers: approval.approvers.map((a) => ({
          id: a.id,
          order: a.order,
          employeeId: a.employeeId,
          name: a.name,
          department: a.department,
          status: a.status,
          comment: a.comment,
          processedAt: a.processedAt?.toISOString(),
        })),
        attachments: approval.attachments.map((att) => ({
          id: att.id,
          name: att.name,
          url: att.url,
          type: att.type,
          size: att.size,
        })),
        createdAt: approval.createdAt.toISOString(),
        updatedAt: approval.updatedAt.toISOString(),
      },
    };
  }

  // POST /approvals - 결재 문서 생성
  @Post()
  async create(
    @Body()
    body: {
      firebaseUid: string;
      type: ApprovalType;
      title: string;
      content: string;
      details?: unknown;
      approvers: ApproverInput[];
      attachments?: AttachmentInput[];
    },
  ) {
    if (!body.firebaseUid || !body.title || !body.content) {
      return { success: false, error: 'firebaseUid, title, content are required' };
    }

    if (!body.approvers || body.approvers.length === 0) {
      return { success: false, error: 'At least one approver is required' };
    }

    const employee = await this.prisma.employee.findUnique({
      where: { firebaseUid: body.firebaseUid },
      include: {
        department: true,
      },
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    try {
      const approval = await this.approvalsService.create({
        authorId: employee.id,
        department: employee.department?.name,
        type: body.type || 'GENERAL',
        title: body.title,
        content: body.content,
        details: body.details,
        approvers: body.approvers,
        attachments: body.attachments,
      });

      return {
        success: true,
        approval: {
          id: approval.id,
          title: approval.title,
          type: approval.type,
          status: approval.status,
          createdAt: approval.createdAt.toISOString(),
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  // POST /approvals/:id/process - 결재 처리 (승인/반려)
  @Post(':id/process')
  async processApproval(
    @Param('id') id: string,
    @Body()
    body: {
      firebaseUid: string;
      action: 'APPROVED' | 'REJECTED';
      comment?: string;
    },
  ) {
    if (!body.firebaseUid || !body.action) {
      return { success: false, error: 'firebaseUid and action are required' };
    }

    const employee = await this.prisma.employee.findUnique({
      where: { firebaseUid: body.firebaseUid },
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    try {
      const approval = await this.approvalsService.processApproval(
        id,
        employee.id,
        body.action,
        body.comment,
      );

      return {
        success: true,
        approval: {
          id: approval.id,
          status: approval.status,
          currentStep: approval.currentStep,
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  // DELETE /approvals/:id - 결재 문서 삭제
  @Delete(':id')
  async delete(@Param('id') id: string, @Body('firebaseUid') firebaseUid: string) {
    if (!firebaseUid) {
      return { success: false, error: 'firebaseUid is required' };
    }

    const employee = await this.prisma.employee.findUnique({
      where: { firebaseUid },
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    const approval = await this.approvalsService.findById(id);
    if (!approval) {
      return { success: false, error: 'Approval not found' };
    }

    // 본인이 작성한 문서만 삭제 가능
    if (approval.authorId !== employee.id) {
      return { success: false, error: '삭제 권한이 없습니다.' };
    }

    try {
      await this.approvalsService.delete(id);
      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  // 공통 포맷터
  private formatApproval(approval: any, myEmployeeId: string) {
    const myApprover = approval.approvers.find((a: any) => a.employeeId === myEmployeeId);
    const currentApprover = approval.approvers.find((a: any) => a.order === approval.currentStep);

    return {
      id: approval.id,
      authorId: approval.authorId,
      authorName: approval.author.name,
      department: approval.department,
      type: approval.type,
      title: approval.title,
      status: approval.status,
      currentStep: approval.currentStep,
      totalSteps: approval.approvers.length,
      currentApproverName: currentApprover?.name,
      myStatus: myApprover?.status,
      createdAt: approval.createdAt.toISOString(),
    };
  }
}
