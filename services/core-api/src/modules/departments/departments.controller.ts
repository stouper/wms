import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { DepartmentsService } from './departments.service';

@Controller('departments')
export class DepartmentsController {
  constructor(private departmentsService: DepartmentsService) {}

  // GET /departments - 부서 목록
  @Get()
  async findAll(@Query('activeOnly') activeOnly?: string) {
    const departments = await this.departmentsService.findAll(activeOnly === 'true');
    return {
      rows: departments.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        isActive: d.isActive,
        employeeCount: d._count.employees,
      })),
    };
  }

  // POST /departments - 부서 생성
  @Post()
  async create(@Body() body: { code: string; name: string }) {
    if (!body.code || !body.name) {
      return { success: false, error: 'code and name are required' };
    }
    try {
      const department = await this.departmentsService.create(body);
      return { success: true, department };
    } catch (error: any) {
      if (error.code === 'P2002') {
        return { success: false, error: '이미 존재하는 부서코드입니다.' };
      }
      return { success: false, error: error.message };
    }
  }

  // PATCH /departments/:id - 부서 수정
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { code?: string; name?: string; isActive?: boolean },
  ) {
    try {
      const department = await this.departmentsService.update(id, body);
      return { success: true, department };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // DELETE /departments/:id - 부서 삭제
  @Delete(':id')
  async delete(@Param('id') id: string) {
    try {
      await this.departmentsService.delete(id);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
