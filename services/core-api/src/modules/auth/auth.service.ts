import { Injectable, Logger, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FirebaseService } from './firebase.service';
import { EmployeeStatus, EmployeeRole } from '@prisma/client';

interface FirebaseAuthResult {
  success: boolean;
  employee?: {
    id: string;
    firebaseUid: string;
    name: string;
    email: string | null;
    phone: string | null;
    role: string;
    status: string;
    isHq: boolean;
    storeId: string | null;
    storeCode: string | null;
    storeName: string | null;
    departmentId: string | null;
    departmentCode: string | null;
    departmentName: string | null;
  };
  error?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // MASTER 이메일 (환경변수에서 로드)
  private readonly MASTER_EMAIL = process.env.MASTER_EMAIL || '';

  constructor(
    private prisma: PrismaService,
    private firebaseService: FirebaseService,
  ) {
    if (this.MASTER_EMAIL) {
      this.logger.log(`MASTER_EMAIL configured: ${this.MASTER_EMAIL}`);
    } else {
      this.logger.warn('MASTER_EMAIL not configured!');
    }
  }

  // ========================================
  // 권한 검증 헬퍼
  // ========================================

  // firebaseUid로 요청자 조회 + 권한 확인
  async validateRequester(firebaseUid: string, requiredRoles: EmployeeRole[]): Promise<any> {
    if (!firebaseUid) {
      throw new ForbiddenException('firebaseUid is required');
    }

    const requester = await this.prisma.employee.findUnique({
      where: { firebaseUid },
      include: { store: true, department: true },
    });

    if (!requester) {
      throw new ForbiddenException('Employee not found');
    }

    if (requester.status !== EmployeeStatus.ACTIVE) {
      throw new ForbiddenException('Account not active');
    }

    if (!requiredRoles.includes(requester.role as EmployeeRole)) {
      throw new ForbiddenException(`Required role: ${requiredRoles.join(' or ')}`);
    }

    return requester;
  }

  // MASTER 여부 확인
  isMaster(role: string): boolean {
    return role === EmployeeRole.MASTER;
  }

  // ADMIN 이상 여부 확인
  isAdminOrAbove(role: string): boolean {
    return role === EmployeeRole.MASTER || role === EmployeeRole.ADMIN;
  }

  // ========================================
  // 인증
  // ========================================

  // idToken으로 인증 → Employee 조회/생성
  async authenticateWithFirebase(idToken: string): Promise<FirebaseAuthResult> {
    // 1. idToken 검증
    const decoded = await this.firebaseService.verifyIdToken(idToken);
    if (!decoded) {
      return { success: false, error: 'Invalid or expired token' };
    }

    const { uid, email, name } = decoded;
    this.logger.log(`Firebase auth: uid=${uid}, email=${email}`);

    // 2. Employee 조회
    let employee = await this.prisma.employee.findUnique({
      where: { firebaseUid: uid },
      include: { store: true, department: true },
    });

    // 3. MASTER 이메일인지 확인
    const isMasterEmail = this.MASTER_EMAIL && email === this.MASTER_EMAIL;

    // 4. 없으면 생성
    if (!employee) {
      if (isMasterEmail) {
        // MASTER 이메일이면 자동으로 MASTER + ACTIVE
        employee = await this.prisma.employee.create({
          data: {
            firebaseUid: uid,
            name: name || email?.split('@')[0] || 'Master',
            email: email || null,
            role: EmployeeRole.MASTER,
            status: EmployeeStatus.ACTIVE,
            isHq: true,
          },
          include: { store: true, department: true },
        });
        this.logger.log(`MASTER account created: ${employee.id}`);
      } else {
        // 일반 사용자는 PENDING으로 생성
        employee = await this.prisma.employee.create({
          data: {
            firebaseUid: uid,
            name: name || email?.split('@')[0] || 'Unknown',
            email: email || null,
            status: EmployeeStatus.PENDING,
            role: EmployeeRole.STAFF,
          },
          include: { store: true, department: true },
        });
        this.logger.log(`New employee created: ${employee.id} (PENDING)`);
      }
    } else {
      // 기존 계정이 있고, MASTER 이메일인데 MASTER가 아니면 승격
      if (isMasterEmail && employee.role !== EmployeeRole.MASTER) {
        employee = await this.prisma.employee.update({
          where: { id: employee.id },
          data: {
            role: EmployeeRole.MASTER,
            status: EmployeeStatus.ACTIVE,
            isHq: true,
          },
          include: { store: true, department: true },
        });
        this.logger.log(`Employee upgraded to MASTER: ${employee.id}`);
      }
    }

    // 5. 결과 반환
    return {
      success: true,
      employee: this.formatEmployee(employee),
    };
  }

  // ========================================
  // 회원가입
  // ========================================

  async registerEmployee(data: {
    firebaseUid: string;
    name: string;
    email: string;
    phone: string;
    isHq: boolean;
  }): Promise<FirebaseAuthResult> {
    try {
      // 이미 등록된 firebaseUid인지 확인
      const existing = await this.prisma.employee.findUnique({
        where: { firebaseUid: data.firebaseUid },
      });

      if (existing) {
        return { success: false, error: '이미 가입된 계정입니다.' };
      }

      // MASTER 이메일인지 확인
      const isMasterEmail = this.MASTER_EMAIL && data.email === this.MASTER_EMAIL;

      // Employee 생성
      const employee = await this.prisma.employee.create({
        data: {
          firebaseUid: data.firebaseUid,
          name: data.name,
          email: data.email,
          phone: data.phone,
          isHq: isMasterEmail ? true : data.isHq,
          status: isMasterEmail ? EmployeeStatus.ACTIVE : EmployeeStatus.PENDING,
          role: isMasterEmail ? EmployeeRole.MASTER : EmployeeRole.STAFF,
        },
        include: { store: true, department: true },
      });

      this.logger.log(`New employee registered: ${employee.id} (${employee.name}, role=${employee.role})`);

      return {
        success: true,
        employee: this.formatEmployee(employee),
      };
    } catch (error: any) {
      this.logger.error(`registerEmployee error: ${error.message}`);
      return { success: false, error: error.message || '가입 처리 중 오류가 발생했습니다.' };
    }
  }

  // ========================================
  // 직원 관리 (권한 필요)
  // ========================================

  // Employee 목록 조회 (ADMIN 이상)
  async getEmployees(requesterUid: string, status?: EmployeeStatus) {
    await this.validateRequester(requesterUid, [EmployeeRole.MASTER, EmployeeRole.ADMIN]);

    const employees = await this.prisma.employee.findMany({
      where: status ? { status } : undefined,
      include: { store: true, department: true },
      orderBy: { createdAt: 'desc' },
    });

    return employees.map((emp) => this.formatEmployee(emp));
  }

  // Employee 승인 (MASTER: 모든 역할 가능, ADMIN: STAFF만 승인 가능)
  async approveEmployee(
    requesterUid: string,
    employeeId: string,
    role?: string,
    storeId?: string,
    departmentId?: string,
  ) {
    const requester = await this.validateRequester(requesterUid, [EmployeeRole.MASTER, EmployeeRole.ADMIN]);

    const target = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!target) {
      throw new BadRequestException('Employee not found');
    }

    // ADMIN은 ADMIN 역할 부여 불가 (MASTER만 가능)
    if (requester.role === EmployeeRole.ADMIN && role === EmployeeRole.ADMIN) {
      throw new ForbiddenException('Only MASTER can assign ADMIN role');
    }

    // MASTER 역할은 부여 불가 (자동 생성만 가능)
    if (role === EmployeeRole.MASTER) {
      throw new ForbiddenException('MASTER role cannot be assigned manually');
    }

    return this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        status: EmployeeStatus.ACTIVE,
        ...(role && { role: role as any }),
        ...(storeId !== undefined && { storeId }),
        ...(departmentId !== undefined && { departmentId }),
      },
      include: { store: true, department: true },
    });
  }

  // Employee 거부/비활성화 (ADMIN 이상)
  async rejectEmployee(requesterUid: string, employeeId: string) {
    await this.validateRequester(requesterUid, [EmployeeRole.MASTER, EmployeeRole.ADMIN]);

    const target = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!target) {
      throw new BadRequestException('Employee not found');
    }

    // MASTER는 비활성화 불가
    if (target.role === EmployeeRole.MASTER) {
      throw new ForbiddenException('Cannot disable MASTER account');
    }

    return this.prisma.employee.update({
      where: { id: employeeId },
      data: { status: EmployeeStatus.DISABLED },
      include: { store: true, department: true },
    });
  }

  // Employee 정보 수정 (ADMIN 이상)
  async updateEmployee(
    requesterUid: string,
    employeeId: string,
    data: { name?: string; phone?: string; role?: string; storeId?: string; departmentId?: string },
  ) {
    const requester = await this.validateRequester(requesterUid, [EmployeeRole.MASTER, EmployeeRole.ADMIN]);

    const target = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!target) {
      throw new BadRequestException('Employee not found');
    }

    // MASTER 계정 수정 보호
    if (target.role === EmployeeRole.MASTER) {
      // MASTER 본인만 자신의 name, phone 수정 가능
      if (requester.id !== target.id) {
        throw new ForbiddenException('Cannot modify MASTER account');
      }
      // role 변경 불가
      if (data.role && data.role !== EmployeeRole.MASTER) {
        throw new ForbiddenException('Cannot change MASTER role');
      }
    }

    // ADMIN은 ADMIN 역할 부여 불가
    if (requester.role === EmployeeRole.ADMIN && data.role === EmployeeRole.ADMIN) {
      throw new ForbiddenException('Only MASTER can assign ADMIN role');
    }

    // MASTER 역할은 수동 부여 불가
    if (data.role === EmployeeRole.MASTER) {
      throw new ForbiddenException('MASTER role cannot be assigned manually');
    }

    return this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.phone !== undefined && { phone: data.phone || null }),
        ...(data.role && { role: data.role as any }),
        ...(data.storeId !== undefined && { storeId: data.storeId || null }),
        ...(data.departmentId !== undefined && { departmentId: data.departmentId || null }),
      },
      include: { store: true, department: true },
    });
  }

  // Employee 삭제 (MASTER만 가능)
  async deleteEmployee(requesterUid: string, employeeId: string) {
    await this.validateRequester(requesterUid, [EmployeeRole.MASTER]);

    const target = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!target) {
      throw new BadRequestException('Employee not found');
    }

    // MASTER 삭제 불가
    if (target.role === EmployeeRole.MASTER) {
      throw new ForbiddenException('Cannot delete MASTER account');
    }

    return this.prisma.employee.delete({
      where: { id: employeeId },
    });
  }

  // ========================================
  // 기타
  // ========================================

  // 푸시 토큰 업데이트
  async updatePushToken(firebaseUid: string, pushToken: string) {
    return this.prisma.employee.update({
      where: { firebaseUid },
      data: { pushToken },
    });
  }

  // Employee 포맷팅 헬퍼
  private formatEmployee(emp: any) {
    return {
      id: emp.id,
      firebaseUid: emp.firebaseUid,
      name: emp.name,
      email: emp.email,
      phone: emp.phone,
      role: emp.role,
      status: emp.status,
      isHq: emp.isHq,
      storeId: emp.storeId,
      storeCode: emp.store?.code || null,
      storeName: emp.store?.name || null,
      departmentId: emp.departmentId,
      departmentCode: emp.department?.code || null,
      departmentName: emp.department?.name || null,
    };
  }
}
