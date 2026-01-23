import { Controller, Post, Body, Get, Param, Patch, Query } from '@nestjs/common';
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

  // GET /auth/employees - 직원 목록 (관리자용)
  @Get('employees')
  async getEmployees(@Query('status') status?: string) {
    const employeeStatus = status as EmployeeStatus | undefined;
    return this.authService.getEmployees(employeeStatus);
  }

  // PATCH /auth/employees/:id/approve - 직원 승인
  @Patch('employees/:id/approve')
  async approveEmployee(
    @Param('id') id: string,
    @Body() body: { role?: string; storeId?: string },
  ) {
    return this.authService.updateEmployeeStatus(
      id,
      EmployeeStatus.ACTIVE,
      body.role,
      body.storeId,
    );
  }

  // PATCH /auth/employees/:id/reject - 직원 거부/비활성화
  @Patch('employees/:id/reject')
  async rejectEmployee(@Param('id') id: string) {
    return this.authService.updateEmployeeStatus(id, EmployeeStatus.DISABLED);
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
}
