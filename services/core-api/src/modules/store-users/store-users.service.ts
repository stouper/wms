import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface RegisterUserDto {
  firebaseUid: string;
  storeCode: string;
  name?: string;
  phone?: string;
  pushToken?: string;
  role?: 'manager' | 'staff';
}

interface UpdatePushTokenDto {
  firebaseUid: string;
  pushToken: string;
}

@Injectable()
export class StoreUsersService {
  constructor(private prisma: PrismaService) {}

  // 사용자 등록/업데이트 (앱 로그인 시 호출)
  async registerUser(dto: RegisterUserDto) {
    const store = await this.prisma.store.findUnique({
      where: { code: dto.storeCode },
    });

    if (!store) {
      throw new NotFoundException(`매장 코드 "${dto.storeCode}"를 찾을 수 없습니다`);
    }

    // upsert: 있으면 업데이트, 없으면 생성
    const user = await this.prisma.storeUser.upsert({
      where: { firebaseUid: dto.firebaseUid },
      update: {
        storeId: store.id,
        name: dto.name,
        phone: dto.phone,
        pushToken: dto.pushToken,
        role: dto.role || 'staff',
        isActive: true,
      },
      create: {
        storeId: store.id,
        firebaseUid: dto.firebaseUid,
        name: dto.name,
        phone: dto.phone,
        pushToken: dto.pushToken,
        role: dto.role || 'staff',
      },
      include: {
        store: true,
      },
    });

    return user;
  }

  // 푸시 토큰만 업데이트
  async updatePushToken(dto: UpdatePushTokenDto) {
    const user = await this.prisma.storeUser.findUnique({
      where: { firebaseUid: dto.firebaseUid },
    });

    if (!user) {
      throw new NotFoundException('등록된 사용자가 아닙니다. 먼저 매장을 선택해주세요.');
    }

    return this.prisma.storeUser.update({
      where: { firebaseUid: dto.firebaseUid },
      data: { pushToken: dto.pushToken },
    });
  }

  // 내 정보 조회
  async getMyInfo(firebaseUid: string) {
    const user = await this.prisma.storeUser.findUnique({
      where: { firebaseUid },
      include: {
        store: true,
      },
    });

    if (!user) {
      return null;
    }

    return user;
  }

  // 매장별 사용자 목록 (알림 발송용)
  async getUsersByStore(storeCode: string, activeOnly = true) {
    const store = await this.prisma.store.findUnique({
      where: { code: storeCode },
    });

    if (!store) {
      throw new NotFoundException(`매장 코드 "${storeCode}"를 찾을 수 없습니다`);
    }

    return this.prisma.storeUser.findMany({
      where: {
        storeId: store.id,
        ...(activeOnly && { isActive: true }),
      },
      include: {
        store: true,
      },
    });
  }

  // 매장별 푸시 토큰 목록 (알림 발송용)
  async getPushTokensByStore(storeCode: string) {
    const users = await this.getUsersByStore(storeCode, true);
    return users
      .filter((u) => u.pushToken)
      .map((u) => u.pushToken as string);
  }

  // 사용자 비활성화
  async deactivateUser(firebaseUid: string) {
    return this.prisma.storeUser.update({
      where: { firebaseUid },
      data: { isActive: false },
    });
  }

  // 매장 목록 (사용자 수 포함)
  async getStoresWithUserCount() {
    const stores = await this.prisma.store.findMany({
      include: {
        _count: {
          select: { users: true },
        },
      },
      orderBy: { code: 'asc' },
    });

    return stores.map((s) => ({
      code: s.code,
      name: s.name,
      isHq: s.isHq,
      userCount: s._count.users,
    }));
  }
}
