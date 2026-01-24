import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpException, HttpStatus } from '@nestjs/common';
import { EventsService } from './events.service';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('events')
export class EventsController {
  constructor(
    private eventsService: EventsService,
    private prisma: PrismaService,
  ) {}

  // GET /events?startDate=2026-01-01&endDate=2026-01-31
  // 날짜 범위로 이벤트 목록 조회
  @Get()
  async findByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    if (!startDate || !endDate) {
      throw new HttpException('startDate and endDate are required', HttpStatus.BAD_REQUEST);
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new HttpException('Invalid date format', HttpStatus.BAD_REQUEST);
    }

    const events = await this.eventsService.findByDateRange(start, end);

    return {
      rows: events.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        date: e.date.toISOString().split('T')[0], // YYYY-MM-DD 형식
        createdById: e.createdById,
        createdByName: e.createdBy.name,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
    };
  }

  // POST /events - 이벤트 생성
  @Post()
  async create(
    @Body() body: {
      firebaseUid: string;
      title: string;
      description?: string;
      date: string; // YYYY-MM-DD
    },
  ) {
    if (!body.firebaseUid || !body.title || !body.date) {
      return { success: false, error: 'firebaseUid, title, date are required' };
    }

    // firebaseUid로 Employee 조회
    const employee = await this.prisma.employee.findUnique({
      where: { firebaseUid: body.firebaseUid },
    });

    if (!employee) {
      return { success: false, error: 'Employee not found' };
    }

    try {
      const event = await this.eventsService.create({
        title: body.title,
        description: body.description,
        date: new Date(body.date),
        createdById: employee.id,
      });

      return {
        success: true,
        event: {
          id: event.id,
          title: event.title,
          description: event.description,
          date: event.date.toISOString().split('T')[0],
          createdById: event.createdById,
          createdByName: event.createdBy.name,
          createdAt: event.createdAt.toISOString(),
          updatedAt: event.updatedAt.toISOString(),
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // PATCH /events/:id - 이벤트 수정
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: {
      firebaseUid: string;
      title?: string;
      description?: string;
      date?: string;
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

    // 이벤트 조회
    const existingEvent = await this.eventsService.findById(id);
    if (!existingEvent) {
      return { success: false, error: 'Event not found' };
    }

    // 본인 또는 관리자만 수정 가능
    const isOwner = existingEvent.createdById === employee.id;
    const isAdmin = employee.role === 'ADMIN' && employee.isHq;

    if (!isOwner && !isAdmin) {
      return { success: false, error: '수정 권한이 없습니다.' };
    }

    try {
      const event = await this.eventsService.update(id, {
        title: body.title,
        description: body.description,
        date: body.date ? new Date(body.date) : undefined,
      });

      return {
        success: true,
        event: {
          id: event.id,
          title: event.title,
          description: event.description,
          date: event.date.toISOString().split('T')[0],
          createdById: event.createdById,
          createdByName: event.createdBy.name,
          createdAt: event.createdAt.toISOString(),
          updatedAt: event.updatedAt.toISOString(),
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // DELETE /events/:id - 이벤트 삭제
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

    // 이벤트 조회
    const existingEvent = await this.eventsService.findById(id);
    if (!existingEvent) {
      return { success: false, error: 'Event not found' };
    }

    // 본인 또는 관리자만 삭제 가능
    const isOwner = existingEvent.createdById === employee.id;
    const isAdmin = employee.role === 'ADMIN' && employee.isHq;

    if (!isOwner && !isAdmin) {
      return { success: false, error: '삭제 권한이 없습니다.' };
    }

    try {
      await this.eventsService.delete(id);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
