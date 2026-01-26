import { Controller, Post, Body, Get, Param, Patch, Query, Delete, Headers } from '@nestjs/common';
import { AuthService } from './auth.service';
import { EmployeeStatus } from '@prisma/client';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // POST /auth/firebase - idToken으로 인증
  @Post('firebase')
  async authenticateWithFirebase(@Body('idToken') idToken: string) {
    if (!idToken) {
      return { success: false, error: 'idToken is required' };
    }
    return this.authService.authenticateWithFirebase(idToken);
  }

  // POST /auth/register - 회원가입 (Employee 생성)
  @Post('register')
  async registerEmployee(
    @Body() body: {
      firebaseUid: string;
      name: string;
      email: string;
      phone: string;
      isHq: boolean;
    },
  ) {
    if (!body.firebaseUid || !body.name || !body.email || !body.phone) {
      return { success: false, error: 'firebaseUid, name, email, phone are required' };
    }
    return this.authService.registerEmployee(body);
  }

  // GET /auth/employees - 직원 목록 (Desktop은 인증 없이 허용, Mobile은 ADMIN 이상)
  @Get('employees')
  async getEmployees(
    @Headers('x-firebase-uid') firebaseUid: string,
    @Query('status') status?: string,
  ) {
    const employeeStatus = status as EmployeeStatus | undefined;
    // firebaseUid가 없으면 Desktop 요청으로 간주 (인증 스킵)
    return this.authService.getEmployees(firebaseUid || null, employeeStatus);
  }

  // PATCH /auth/employees/:id/approve - 직원 승인 (ADMIN 이상)
  @Patch('employees/:id/approve')
  async approveEmployee(
    @Headers('x-firebase-uid') firebaseUid: string,
    @Param('id') id: string,
    @Body() body: { role?: string; storeId?: string; departmentId?: string },
  ) {
    if (!firebaseUid) {
      return { success: false, error: 'x-firebase-uid header is required' };
    }
    return this.authService.approveEmployee(firebaseUid, id, body.role, body.storeId, body.departmentId);
  }

  // PATCH /auth/employees/:id/reject - 직원 거부/비활성화 (ADMIN 이상)
  @Patch('employees/:id/reject')
  async rejectEmployee(
    @Headers('x-firebase-uid') firebaseUid: string,
    @Param('id') id: string,
  ) {
    if (!firebaseUid) {
      return { success: false, error: 'x-firebase-uid header is required' };
    }
    return this.authService.rejectEmployee(firebaseUid, id);
  }

  // POST /auth/push-token - 푸시 토큰 업데이트
  @Post('push-token')
  async updatePushToken(
    @Body('firebaseUid') firebaseUid: string,
    @Body('pushToken') pushToken: string,
  ) {
    if (!firebaseUid || !pushToken) {
      return { success: false, error: 'firebaseUid and pushToken are required' };
    }
    const employee = await this.authService.updatePushToken(firebaseUid, pushToken);
    return { success: true, employee };
  }

  // PATCH /auth/employees/:id - 직원 정보 수정 (ADMIN 이상)
  @Patch('employees/:id')
  async updateEmployee(
    @Headers('x-firebase-uid') firebaseUid: string,
    @Param('id') id: string,
    @Body() body: { name?: string; phone?: string; role?: string; storeId?: string; departmentId?: string },
  ) {
    if (!firebaseUid) {
      return { success: false, error: 'x-firebase-uid header is required' };
    }
    return this.authService.updateEmployee(firebaseUid, id, body);
  }

  // DELETE /auth/employees/:id - 직원 삭제 (MASTER만)
  @Delete('employees/:id')
  async deleteEmployee(
    @Headers('x-firebase-uid') firebaseUid: string,
    @Param('id') id: string,
  ) {
    if (!firebaseUid) {
      return { success: false, error: 'x-firebase-uid header is required' };
    }
    return this.authService.deleteEmployee(firebaseUid, id);
  }
}
