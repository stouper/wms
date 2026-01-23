import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
  badge?: number;
}

interface ExpoPushResponse {
  data: Array<{
    status: 'ok' | 'error';
    id?: string;
    message?: string;
    details?: any;
  }>;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

  constructor(private prisma: PrismaService) {}

  // Expo Push API로 알림 발송
  async sendPushNotifications(messages: ExpoPushMessage[]): Promise<void> {
    if (messages.length === 0) return;

    try {
      const response = await fetch(this.EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(messages),
      });

      const result: ExpoPushResponse = await response.json();

      // 결과 로깅
      result.data.forEach((ticket, index) => {
        if (ticket.status === 'error') {
          this.logger.warn(`Push failed for ${messages[index].to}: ${ticket.message}`);
        }
      });

      this.logger.log(`Push sent: ${messages.length} messages`);
    } catch (error: any) {
      this.logger.error(`Push API error: ${error?.message || error}`);
    }
  }

  // 특정 매장 직원들에게 알림 발송
  async notifyStoreEmployees(
    storeId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<number> {
    // 해당 매장의 ACTIVE 직원 중 푸시 토큰이 있는 사람
    const employees = await this.prisma.employee.findMany({
      where: {
        storeId,
        status: 'ACTIVE',
        pushToken: { not: null },
      },
      select: { pushToken: true },
    });

    if (employees.length === 0) {
      this.logger.log(`No employees with push token for store ${storeId}`);
      return 0;
    }

    const messages: ExpoPushMessage[] = employees
      .filter((e) => e.pushToken?.startsWith('ExponentPushToken'))
      .map((e) => ({
        to: e.pushToken!,
        title,
        body,
        data,
        sound: 'default' as const,
      }));

    await this.sendPushNotifications(messages);
    return messages.length;
  }

  // 출고 완료 알림
  async notifyOutboundComplete(
    storeId: string,
    storeName: string,
    jobId: string,
    itemCount: number,
  ): Promise<void> {
    const title = '출고 완료';
    const body = `${storeName}으로 ${itemCount}건의 상품이 출고되었습니다.`;
    const data = { type: 'OUTBOUND_COMPLETE', jobId };

    const sent = await this.notifyStoreEmployees(storeId, title, body, data);
    this.logger.log(`Outbound notification sent to ${sent} employees for store ${storeName}`);
  }
}
