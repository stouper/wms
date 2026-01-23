import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FirebaseService } from './firebase.service';
import { EmployeeStatus } from '@prisma/client';

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
    storeId: string | null;
    storeCode: string | null;
    storeName: string | null;
  };
  error?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private firebaseService: FirebaseService,
  ) {}

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
      include: { store: true },
    });

    // 3. 없으면 PENDING 상태로 생성
    if (!employee) {
      employee = await this.prisma.employee.create({
        data: {
          firebaseUid: uid,
          name: name || email?.split('@')[0] || 'Unknown',
          email: email || null,
          status: EmployeeStatus.PENDING,
        },
        include: { store: true },
      });
      this.logger.log(`New employee created: ${employee.id} (PENDING)`);
    }

    // 4. 결과 반환
    return {
      success: true,
      employee: {
        id: employee.id,
        firebaseUid: employee.firebaseUid!,
        name: employee.name,
        email: employee.email,
        phone: employee.phone,
        role: employee.role,
        status: employee.status,
        storeId: employee.storeId,
        storeCode: employee.store?.code || null,
        storeName: employee.store?.name || null,
      },
    };
  }

  // Employee 목록 조회 (관리자용)
  async getEmployees(status?: EmployeeStatus) {
    const employees = await this.prisma.employee.findMany({
      where: status ? { status } : undefined,
      include: { store: true },
      orderBy: { createdAt: 'desc' },
    });

    // 앱이 기대하는 형식으로 변환
    return employees.map((emp) => ({
      id: emp.id,
      firebaseUid: emp.firebaseUid,
      name: emp.name,
      email: emp.email,
      phone: emp.phone,
      role: emp.role,
      status: emp.status,
      storeId: emp.storeId,
      storeCode: emp.store?.code || null,
      storeName: emp.store?.name || null,
    }));
  }

  // Employee 승인/거부
  async updateEmployeeStatus(
    employeeId: string,
    status: EmployeeStatus,
    role?: string,
    storeId?: string,
  ) {
    return this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        status,
        ...(role && { role: role as any }),
        ...(storeId !== undefined && { storeId }),
      },
      include: { store: true },
    });
  }

  // 푸시 토큰 업데이트
  async updatePushToken(firebaseUid: string, pushToken: string) {
    return this.prisma.employee.update({
      where: { firebaseUid },
      data: { pushToken },
    });
  }

  // Employee 정보 수정
  async updateEmployee(
    employeeId: string,
    data: { name?: string; phone?: string; role?: string; storeId?: string },
  ) {
    return this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.phone !== undefined && { phone: data.phone || null }),
        ...(data.role && { role: data.role as any }),
        ...(data.storeId !== undefined && { storeId: data.storeId || null }),
      },
      include: { store: true },
    });
  }

  // Employee 삭제
  async deleteEmployee(employeeId: string) {
    return this.prisma.employee.delete({
      where: { id: employeeId },
    });
  }

  // 회원가입 (Employee 생성)
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

      // Employee 생성 (PENDING 상태)
      const employee = await this.prisma.employee.create({
        data: {
          firebaseUid: data.firebaseUid,
          name: data.name,
          email: data.email,
          phone: data.phone,
          isHq: data.isHq,
          status: EmployeeStatus.PENDING,
          // 기본 역할 설정: 본사면 HQ_WMS, 매장이면 STORE_STAFF
          role: data.isHq ? 'HQ_WMS' : 'STORE_STAFF',
        },
        include: { store: true },
      });

      this.logger.log(`New employee registered: ${employee.id} (${employee.name}, isHq=${data.isHq})`);

      return {
        success: true,
        employee: {
          id: employee.id,
          firebaseUid: employee.firebaseUid!,
          name: employee.name,
          email: employee.email,
          phone: employee.phone,
          role: employee.role,
          status: employee.status,
          storeId: employee.storeId,
          storeCode: employee.store?.code || null,
          storeName: employee.store?.name || null,
        },
      };
    } catch (error: any) {
      this.logger.error(`registerEmployee error: ${error.message}`);
      return { success: false, error: error.message || '가입 처리 중 오류가 발생했습니다.' };
    }
  }
}
