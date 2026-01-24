import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MessageTargetType } from '@prisma/client';

@Controller('messages')
export class MessagesController {
  constructor(
    private messagesService: MessagesService,
    private prisma: PrismaService,
  ) {}

  // GET /messages - 메시지 목록 조회
  @Get()
  async findAll(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    const messages = await this.messagesService.findAll(
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );

    const total = await this.messagesService.count();

    return {
      rows: messages.map((msg) => ({
        id: msg.id,
        title: msg.title,
        body: msg.body,
        targetType: msg.targetType,
        targetStoreIds: msg.targetStoreIds,
        targetDeptCodes: msg.targetDeptCodes,
        authorId: msg.authorId,
        authorName: msg.author.name,
        receiptCount: msg._count.receipts,
        createdAt: msg.createdAt.toISOString(),
        updatedAt: msg.updatedAt.toISOString(),
      })),
      total,
    };
  }

  // GET /messages/:id - 메시지 상세 조회 (receipts 포함)
  @Get(':id')
  async findById(@Param('id') id: string) {
    const msg = await this.messagesService.findById(id);

    if (!msg) {
      throw new HttpException('Message not found', HttpStatus.NOT_FOUND);
    }

    // receipts를 읽음/미읽음으로 분류
    const reads = msg.receipts.filter((r) => r.read);
    const unreads = msg.receipts.filter((r) => !r.read);

    return {
      id: msg.id,
      title: msg.title,
      body: msg.body,
      targetType: msg.targetType,
      targetStoreIds: msg.targetStoreIds,
      targetDeptCodes: msg.targetDeptCodes,
      authorId: msg.authorId,
      authorName: msg.author.name,
      createdAt: msg.createdAt.toISOString(),
      updatedAt: msg.updatedAt.toISOString(),
      reads: reads.map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        employeeName: r.employee.name,
        storeId: r.employee.storeId,
        storeName: r.employee.store?.name || r.employee.store?.code,
        departmentId: r.employee.departmentId,
        departmentName: r.employee.department?.name,
        readAt: r.readAt?.toISOString(),
      })),
      unreads: unreads.map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        employeeName: r.employee.name,
        storeId: r.employee.storeId,
        storeName: r.employee.store?.name || r.employee.store?.code,
        departmentId: r.employee.departmentId,
        departmentName: r.employee.department?.name,
        pushToken: r.employee.pushToken || r.pushTokenAtSend,
        status: r.employee.status,
        role: r.employee.role,
      })),
    };
  }

  // POST /messages - 메시지 생성 (+ receipts 자동 생성)
  @Post()
  async create(
    @Body()
    body: {
      firebaseUid: string;
      title: string;
      body: string;
      targetType: MessageTargetType;
      targetStoreIds?: string[];
      targetDeptCodes?: string[];
    },
  ) {
    if (!body.firebaseUid || !body.title || !body.body) {
      return { success: false, error: 'firebaseUid, title, body are required' };
    }

    // firebaseUid로 Employee 조회
    const employee = await this.prisma.employee.findUnique({
      where: { firebaseUid: body.firebaseUid },
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    try {
      const result = await this.messagesService.create({
        title: body.title,
        body: body.body,
        authorId: employee.id,
        targetType: body.targetType || 'ALL',
        targetStoreIds: body.targetStoreIds,
        targetDeptCodes: body.targetDeptCodes,
      });

      return {
        success: true,
        message: {
          id: result.message.id,
          title: result.message.title,
          body: result.message.body,
          targetType: result.message.targetType,
          authorId: result.message.authorId,
          authorName: result.message.author.name,
          createdAt: result.message.createdAt.toISOString(),
        },
        targetCount: result.targetCount,
        // 푸시 발송용 토큰 목록
        pushTokens: result.targetEmployees
          .filter((emp) => emp.pushToken)
          .map((emp) => emp.pushToken),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  // PATCH /messages/:id - 메시지 수정
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      firebaseUid: string;
      title?: string;
      body?: string;
    },
  ) {
    if (!body.firebaseUid) {
      return { success: false, error: 'firebaseUid is required' };
    }

    // firebaseUid로 Employee 조회
    const employee = await this.prisma.employee.findUnique({
      where: { firebaseUid: body.firebaseUid },
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    // 메시지 조회
    const existingMsg = await this.messagesService.findById(id);
    if (!existingMsg) {
      return { success: false, error: 'Message not found' };
    }

    // 본인 또는 관리자만 수정 가능
    const isOwner = existingMsg.authorId === employee.id;
    const isAdmin = employee.role === 'ADMIN' && employee.isHq;

    if (!isOwner && !isAdmin) {
      return { success: false, error: '수정 권한이 없습니다.' };
    }

    try {
      const msg = await this.messagesService.update(id, {
        title: body.title,
        body: body.body,
      });

      return {
        success: true,
        message: {
          id: msg.id,
          title: msg.title,
          body: msg.body,
          authorId: msg.authorId,
          authorName: msg.author.name,
          updatedAt: msg.updatedAt.toISOString(),
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  // DELETE /messages/:id - 메시지 삭제
  @Delete(':id')
  async delete(@Param('id') id: string, @Body('firebaseUid') firebaseUid: string) {
    if (!firebaseUid) {
      return { success: false, error: 'firebaseUid is required' };
    }

    // firebaseUid로 Employee 조회
    const employee = await this.prisma.employee.findUnique({
      where: { firebaseUid },
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    // 메시지 조회
    const existingMsg = await this.messagesService.findById(id);
    if (!existingMsg) {
      return { success: false, error: 'Message not found' };
    }

    // 본인 또는 관리자만 삭제 가능
    const isOwner = existingMsg.authorId === employee.id;
    const isAdmin = employee.role === 'HQ_ADMIN' || employee.role === 'HQ_WMS';

    if (!isOwner && !isAdmin) {
      return { success: false, error: '삭제 권한이 없습니다.' };
    }

    try {
      await this.messagesService.delete(id);
      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  // ==========================================
  // Receipt 관련 엔드포인트
  // ==========================================

  // POST /messages/:id/read - 읽음 처리
  @Post(':id/read')
  async markAsRead(
    @Param('id') messageId: string,
    @Body('firebaseUid') firebaseUid: string,
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

    try {
      await this.messagesService.markAsRead(messageId, employee.id);
      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  // GET /messages/my/unread-count - 내 미읽음 수
  @Get('my/unread-count')
  async getMyUnreadCount(@Query('firebaseUid') firebaseUid: string) {
    if (!firebaseUid) {
      return { success: false, error: 'firebaseUid is required' };
    }

    const employee = await this.prisma.employee.findUnique({
      where: { firebaseUid },
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    const count = await this.messagesService.getUnreadCount(employee.id);
    return { success: true, count };
  }

  // GET /messages/my/list - 내 메시지 목록
  @Get('my/list')
  async getMyMessages(
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

    const receipts = await this.messagesService.getEmployeeMessages(
      employee.id,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );

    return {
      success: true,
      rows: receipts.map((r) => ({
        id: r.id,
        messageId: r.message.id,
        title: r.message.title,
        body: r.message.body,
        read: r.read,
        readAt: r.readAt?.toISOString(),
        createdAt: r.message.createdAt.toISOString(),
      })),
    };
  }

  // GET /messages/:id/unread-recipients - 미읽음 수신자 목록 (재발송용)
  @Get(':id/unread-recipients')
  async getUnreadRecipients(@Param('id') messageId: string) {
    const recipients = await this.messagesService.getUnreadRecipients(messageId);

    return {
      success: true,
      recipients: recipients
        .filter((r) => r.employee.status === 'ACTIVE')
        .map((r) => ({
          employeeId: r.employeeId,
          employeeName: r.employee.name,
          pushToken: r.employee.pushToken || r.pushTokenAtSend,
          role: r.employee.role,
        })),
    };
  }
}
