import { Injectable, NotFoundException } from '@nestjs/common';

type Carrier = { code: string; name: string };

@Injectable()
export class CarriersService {
  // 임시 더미 목록 (DB 의존 제거)
  private readonly carriers: Carrier[] = [
    { code: 'cj',     name: 'CJ대한통운' },
    { code: 'lotte',  name: '롯데택배' },
    { code: 'hanjin', name: '한진택배' },
    { code: 'koreapost', name: '우체국택배' },
  ];

  findAll() {
    // 코드순 정렬
    return this.carriers.slice().sort((a, b) => a.code.localeCompare(b.code));
  }

  getByCode(code: string): Carrier {
    const row = this.carriers.find(c => c.code === code);
    if (!row) throw new NotFoundException(`Unknown carrier: ${code}`);
    return row;
  }

  // 더미 트래킹 (프론트 확인용)
  async track(code: string, number: string) {
    // 코드 유효성 검사
    this.getByCode(code);

    // number에 따라 살짝 다른 더미를 리턴 (UI 테스트용)
    const now = new Date();
    const mk = (min: number, msg: string, loc?: string) => ({
      timestamp: new Date(now.getTime() - min * 60 * 1000).toISOString(),
      location: loc ?? '인천 허브',
      message: msg,
    });

    const base = [
      mk(720, '접수완료', '온라인주문'),
      mk(600, '집하완료', 'OO대리점'),
      mk(420, '허브 이동중', '수도권허브'),
      mk(180, '배송지역 도착', '강남터미널'),
    ];
    const tailDelivered = [mk(60, '배송출발', '강남터미널'), mk(5, '배송완료', '수령인 확인')];
    const tailInTransit = [mk(90, '간선 상차', '수도권허브'), mk(30, '간선 하차', '강남터미널')];

    const deliveredLike = /999$/.test(number);
    const events = deliveredLike ? base.concat(tailDelivered) : base.concat(tailInTransit);

    return {
      carrier: code,
      trackingNo: number,
      status: deliveredLike ? 'delivered' : 'in_transit',
      events: events.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    };
  }
}
