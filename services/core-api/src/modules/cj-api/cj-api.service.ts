import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CjApiResponse,
  CjTokenData,
  CjAddressRequest,
  CjAddressData,
  CjWaybillRequest,
  CjWaybillData,
  CjReservationRequest,
  CjReservationData,
  CjTrackingRequest,
  CjTrackingData,
  WaybillPrintData,
} from './interfaces/cj-api.interface';

@Injectable()
export class CjApiService {
  private readonly logger = new Logger(CjApiService.name);
  private readonly apiBaseUrl: string;
  private readonly custId: string;
  private readonly bizRegNum: string;

  // 보내는 사람 기본 정보
  private readonly senderName: string;
  private readonly senderTel1: string;
  private readonly senderTel2: string;
  private readonly senderTel3: string;
  private readonly senderZip: string;
  private readonly senderAddr: string;
  private readonly senderDetailAddr: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.apiBaseUrl = this.config.get<string>('CJ_API_BASE_URL')!;
    this.custId = this.config.get<string>('CJ_CUST_ID')!;
    this.bizRegNum = this.config.get<string>('CJ_BIZ_REG_NUM')!;

    this.senderName = this.config.get<string>('CJ_SENDER_NAME', '에스카');
    this.senderTel1 = this.config.get<string>('CJ_SENDER_TEL1', '02');
    this.senderTel2 = this.config.get<string>('CJ_SENDER_TEL2', '1234');
    this.senderTel3 = this.config.get<string>('CJ_SENDER_TEL3', '5678');
    this.senderZip = this.config.get<string>('CJ_SENDER_ZIP', '');
    this.senderAddr = this.config.get<string>('CJ_SENDER_ADDR', '서울시');
    this.senderDetailAddr = this.config.get<string>('CJ_SENDER_DETAIL_ADDR', '');
  }

  /**
   * ============================================
   * 1. Token 관리 (자동 갱신)
   * ============================================
   */

  /**
   * 유효한 토큰 가져오기 (자동 갱신)
   * - DB에서 만료 안 된 토큰 조회
   * - 없거나 만료 임박 시 새로 발급
   */
  async getValidToken(): Promise<string> {
    const now = new Date();

    // DB에서 최신 토큰 조회 (만료 1시간 전까지만 사용)
    const existing = await this.prisma.cjToken.findFirst({
      where: {
        expiresAt: { gt: new Date(now.getTime() + 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      this.logger.log(`Using existing CJ token: ${existing.tokenNum.slice(0, 10)}...`);
      return existing.tokenNum;
    }

    // 새로 발급
    this.logger.log('Requesting new CJ token...');
    const tokenNum = await this.requestNewToken();
    return tokenNum;
  }

  /**
   * CJ API: 1Day Token 발급
   */
  private async requestNewToken(): Promise<string> {
    const url = `${this.apiBaseUrl}/ReqOneDayToken`;

    const payload = {
      DATA: {
        CUST_ID: this.custId,
        BIZ_REG_NUM: this.bizRegNum,
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`CJ Token API failed: ${response.status}`);
      }

      const result: any = await response.json();

      // 토큰 발급 API는 RESULT_CD: "S" 형식
      if (result.RESULT_CD !== 'S') {
        throw new Error(`CJ Token Error: ${result.RESULT_DETAIL || 'Unknown error'}`);
      }

      const data = result.DATA;
      const tokenNum = data.TOKEN_NUM;

      // TOKEN_EXPRTN_DTM 파싱 (YYYYMMDDHHmmss -> Date)
      const exprStr = data.TOKEN_EXPRTN_DTM; // ex: "20251222235959"
      const expiresAt = new Date(
        `${exprStr.slice(0, 4)}-${exprStr.slice(4, 6)}-${exprStr.slice(6, 8)}T` +
        `${exprStr.slice(8, 10)}:${exprStr.slice(10, 12)}:${exprStr.slice(12, 14)}`,
      );

      // DB 저장
      await this.prisma.cjToken.create({
        data: { tokenNum, expiresAt },
      });

      this.logger.log(`New CJ token created, expires at ${expiresAt.toISOString()}`);
      return tokenNum;
    } catch (error: any) {
      this.logger.error('Failed to get CJ token', error);
      throw new BadRequestException('CJ 토큰 발급 실패: ' + error.message);
    }
  }

  /**
   * ============================================
   * 2. 주소 정제 API
   * ============================================
   */

  async verifyAddress(addr: string): Promise<CjAddressData> {
    const token = await this.getValidToken();
    const url = `${this.apiBaseUrl}/ReqAddrRfnSm`;

    const payload = {
      DATA: {
        TOKEN_NUM: token,
        CLNTNUM: this.custId,
        ADDRESS: addr,
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'CJ-Gateway-APIKey': token,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`CJ Address API failed: ${response.status}`);
      }

      const result: any = await response.json();

      if (result.RESULT_CD !== 'S') {
        throw new Error(`CJ Address Error: ${result.RESULT_DETAIL || 'Unknown error'}`);
      }

      return result.DATA;
    } catch (error: any) {
      this.logger.error('Failed to verify address', error);
      throw new BadRequestException('주소 정제 실패: ' + error.message);
    }
  }

  /**
   * ============================================
   * 3. 운송장 번호 발급 API
   * ============================================
   */

  async generateWaybillNumbers(count: number = 1): Promise<string[]> {
    const token = await this.getValidToken();
    const url = `${this.apiBaseUrl}/ReqInvcNo`;

    const payload = {
      DATA: {
        TOKEN_NUM: token,
        CLNTNUM: this.custId,
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'CJ-Gateway-APIKey': token,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`CJ Waybill API failed: ${response.status}`);
      }

      const result: any = await response.json();

      if (result.RESULT_CD !== 'S') {
        throw new Error(`CJ Waybill Error: ${result.RESULT_DETAIL || 'Unknown error'}`);
      }

      this.logger.debug('Waybill response DATA:', JSON.stringify(result.DATA));

      // 응답 구조 확인: INVC_NO_LIST 또는 INVC_NO 배열
      const waybills = result.DATA.INVC_NO_LIST || [result.DATA.INVC_NO];
      return waybills.filter(Boolean);
    } catch (error: any) {
      this.logger.error('Failed to generate waybill numbers', error);
      throw new BadRequestException('운송장 번호 발급 실패: ' + error.message);
    }
  }

  /**
   * ============================================
   * 4. 예약 접수 API (RegBook)
   * ============================================
   */

  async createReservation(jobId: string): Promise<CjReservationData> {
    // Job + JobParcel 조회
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        parcel: true,
        items: { include: { sku: true } },
      },
    });

    if (!job || !job.parcel) {
      throw new BadRequestException('Job or Parcel not found');
    }

    const parcel = job.parcel;

    // 운송장 번호 발급
    const [waybillNo] = await this.generateWaybillNumbers(1);

    // 전화번호 파싱 (예: "010-1234-5678" -> ["010", "1234", "5678"])
    const [rcvrTel1, rcvrTel2, rcvrTel3] = this.parsePhone(parcel.phone);
    const [sndrTel1, sndrTel2, sndrTel3] = [this.senderTel1, this.senderTel2, this.senderTel3];

    // 상품명/수량 집계
    const totalQty = job.items.reduce((sum, it) => sum + it.qtyPicked, 0) || 1;
    const goodsName = job.items.map((it) => it.sku.name || it.sku.sku).join(', ') || '상품';

    // 접수일자 (오늘 - 한국시간 기준)
    const today = new Date();
    const kstOffset = 9 * 60 * 60 * 1000; // UTC+9
    const kstDate = new Date(today.getTime() + kstOffset);
    const rcptYmd = kstDate.toISOString().slice(0, 10).replace(/-/g, '');

    // 묶음키 생성
    const custUseNo = parcel.orderNo || job.id;
    const mpckKey = `${rcptYmd}_${this.custId}_${custUseNo}`;

    const token = await this.getValidToken();
    const url = `${this.apiBaseUrl}/RegBook`;

    // 필수 필드 검증
    if (!parcel.recipientName) {
      throw new BadRequestException('수취인 이름이 없습니다');
    }
    if (!parcel.phone) {
      throw new BadRequestException('수취인 전화번호가 없습니다');
    }
    if (!parcel.addr1) {
      throw new BadRequestException('수취인 주소가 없습니다');
    }

    // "null" 문자열 처리 (엑셀 파싱 오류 대응)
    const cleanString = (s: string | null | undefined): string => {
      if (!s || s === 'null' || s === 'undefined' || s === 'NULL') return '';
      return s.trim();
    };

    // 우편번호 정리 (한국 우편번호는 5자리)
    const cleanZip = (zip: string | null | undefined): string => {
      if (!zip || zip === 'null') return '00000';
      const cleaned = zip.replace(/[^0-9]/g, '');
      return cleaned || '00000';
    };

    const rcvrAddr2 = cleanString(parcel.addr2) || '-'; // 빈 문자열 대신 하이픈
    const rcvrMemo = cleanString(parcel.memo); // 빈 문자열 허용
    const rcvrZip = cleanZip(parcel.zip);

    const payload = {
      DATA: {
        TOKEN_NUM: token,
        CUST_ID: this.custId,
        RCPT_YMD: rcptYmd,
        CUST_USE_NO: custUseNo,
        RCPT_DV: '01', // 01: 일반
        WORK_DV_CD: '01', // 01: 일반
        REQ_DV_CD: '01', // 01: 등록 (02: 취소)
        MPCK_KEY: mpckKey,
        CAL_DV_CD: '01', // 01: 계약 운임
        FRT_DV_CD: '03', // 03: 신용
        CNTR_ITEM_CD: '01', // 01: 일반 품목
        BOX_TYPE_CD: '01', // 01: 기본 박스
        BOX_QTY: 1,
        CUST_MGMT_DLCM_CD: this.custId,

        // 보내는 사람
        SENDR_NM: this.senderName,
        SENDR_TEL_NO1: sndrTel1,
        SENDR_TEL_NO2: sndrTel2,
        SENDR_TEL_NO3: sndrTel3,
        SENDR_ZIP_NO: cleanZip(this.senderZip),
        SENDR_ADDR: this.senderAddr,
        SENDR_DETAIL_ADDR: this.senderDetailAddr || ' ',

        // 받는 사람
        RCVR_NM: parcel.recipientName,
        RCVR_TEL_NO1: rcvrTel1,
        RCVR_TEL_NO2: rcvrTel2,
        RCVR_TEL_NO3: rcvrTel3,
        RCVR_ZIP_NO: rcvrZip,
        RCVR_ADDR: parcel.addr1,
        RCVR_DETAIL_ADDR: rcvrAddr2,

        // 운송장
        INVC_NO: waybillNo,

        // 기타
        PRT_ST: '01', // 01: 미출력
        DLV_DV: '01', // 01: 택배
        DLV_MSG: rcvrMemo,

        // 상품 정보 (ARRAY 형식)
        ARRAY: [
          {
            MPCK_SEQ: '1',
            GDS_NM: goodsName,
            GDS_QTY: totalQty,
          },
        ],
      },
    };

    try {
      // 디버그: 전송 데이터 로깅
      this.logger.debug('RegBook payload:', JSON.stringify({
        ...payload.DATA,
        TOKEN_NUM: '***',
      }, null, 2));

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'CJ-Gateway-APIKey': token,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`CJ Reservation API failed: ${response.status}`);
      }

      const result: any = await response.json();
      this.logger.debug('RegBook response:', JSON.stringify(result));

      if (result.RESULT_CD !== 'S') {
        throw new Error(`CJ Reservation Error: ${result.RESULT_DETAIL || 'Unknown error'}`);
      }

      // 응답 데이터 추출 (DATA가 없을 수 있음)
      const data = result.DATA || result;
      const responseInvcNo = data.INVC_NO || waybillNo;
      const responseRcptYmd = data.RCPT_YMD || rcptYmd;
      const responseMpckKey = data.MPCK_KEY || mpckKey;

      // CjShipment DB 저장
      await this.prisma.cjShipment.create({
        data: {
          jobId,
          invcNo: responseInvcNo,
          custUseNo: custUseNo,
          rcptYmd: responseRcptYmd,
          mpckKey: responseMpckKey,
          reqInvcNoJson: { waybillNo } as any,
          regBookJson: payload.DATA as any,
          cjResJson: result as any,
        },
      });

      // JobParcel에 운송장 번호 + 요청 시점 업데이트
      await this.prisma.jobParcel.update({
        where: { jobId },
        data: {
          carrierCode: 'CJ',
          waybillNo: responseInvcNo,
          requestedCjAt: new Date(),
        },
      });

      this.logger.log(`CJ Reservation created for Job ${jobId}, waybill: ${responseInvcNo}`);

      // 반환 데이터 구성
      return {
        RCPT_YMD: responseRcptYmd,
        INVC_NO: responseInvcNo,
        MPCK_KEY: responseMpckKey,
      };
    } catch (error: any) {
      this.logger.error('Failed to create CJ reservation', error);
      throw new BadRequestException('CJ 예약 접수 실패: ' + error.message);
    }
  }

  /**
   * ============================================
   * 5. 예약 취소 API (CnclBook)
   * ============================================
   */

  async cancelReservation(jobId: string): Promise<{ success: boolean; message: string }> {
    // CjShipment에서 기존 예약 데이터 조회
    const shipment = await this.prisma.cjShipment.findUnique({
      where: { jobId },
      include: {
        job: {
          include: {
            parcel: true,
            items: { include: { sku: true } },
          },
        },
      },
    });

    if (!shipment || !shipment.job) {
      throw new BadRequestException('CJ Shipment not found');
    }

    const job = shipment.job;
    const parcel = job.parcel;

    if (!parcel) {
      throw new BadRequestException('Parcel data not found');
    }

    // 이미 취소된 경우 체크
    if (shipment.cancelledAt) {
      throw new BadRequestException('이미 취소된 예약입니다.');
    }

    const token = await this.getValidToken();
    const url = `${this.apiBaseUrl}/CnclBook`;

    // 전화번호 파싱
    const [rcvrTel1, rcvrTel2, rcvrTel3] = this.parsePhone(parcel.phone);

    // 상품명/수량 집계
    const totalQty = job.items.reduce((sum, it) => sum + it.qtyPicked, 0);
    const goodsName = job.items.map((it) => it.sku.name || it.sku.sku).join(', ') || '상품';

    // 접수일자 (RCPT_YMD) 추출
    const rcptYmd = shipment.rcptYmd || new Date().toISOString().slice(0, 10).replace(/-/g, '');

    const payload = {
      DATA: {
        TOKEN_NUM: token,
        CUST_ID: this.custId,
        RCPT_YMD: rcptYmd,
        CUST_USE_NO: shipment.custUseNo || job.id,
        RCPT_DV: '01', // 일반
        WORK_DV_CD: '01', // 일반
        REQ_DV_CD: '02', // 취소
        MPCK_KEY: shipment.mpckKey || `${rcptYmd}_${this.custId}_${shipment.custUseNo}`,
        CAL_DV_CD: '01', // 계약 운임
        FRT_DV_CD: '03', // 신용
        CNTR_ITEM_CD: '01', // 일반 품목
        BOX_TYPE_CD: '01', // 기본 박스
        BOX_QTY: 1,
        CUST_MGMT_DLCM_CD: this.custId,

        // 보내는 사람
        SENDR_NM: this.senderName,
        SENDR_TEL_NO1: this.senderTel1,
        SENDR_TEL_NO2: this.senderTel2,
        SENDR_TEL_NO3: this.senderTel3,
        SENDR_ZIP_NO: this.senderZip || '000000',
        SENDR_ADDR: this.senderAddr,
        SENDR_DETAIL_ADDR: this.senderDetailAddr || '',

        // 받는 사람
        RCVR_NM: parcel.recipientName,
        RCVR_TEL_NO1: rcvrTel1,
        RCVR_TEL_NO2: rcvrTel2,
        RCVR_TEL_NO3: rcvrTel3,
        RCVR_ZIP_NO: parcel.zip || '000000',
        RCVR_ADDR: parcel.addr1,
        RCVR_DETAIL_ADDR: parcel.addr2 || '',

        // 운송장
        INVC_NO: shipment.invcNo,

        // 기타
        PRT_ST: '01', // 미출력
        DLV_DV: '01', // 택배

        ARRAY: [
          {
            MPCK_SEQ: '1',
            GDS_NM: goodsName,
            GDS_QTY: totalQty,
          },
        ],
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'CJ-Gateway-APIKey': token,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`CJ Cancel API failed: ${response.status}`);
      }

      const result: any = await response.json();

      if (result.RESULT_CD !== 'S') {
        // 운송장 스캔이 있거나 출력된 경우 등의 에러
        throw new Error(`CJ Cancel Error: ${result.RESULT_DETAIL || 'Unknown error'}`);
      }

      // DB 업데이트 - 취소 시점 기록
      await this.prisma.cjShipment.update({
        where: { jobId },
        data: {
          cancelledAt: new Date(),
        },
      });

      // JobParcel 운송장 정보 초기화
      await this.prisma.jobParcel.update({
        where: { jobId },
        data: {
          waybillNo: null,
          requestedCjAt: null,
        },
      });

      this.logger.log(`CJ Reservation cancelled for Job ${jobId}, waybill: ${shipment.invcNo}`);
      return { success: true, message: '예약이 취소되었습니다.' };
    } catch (error: any) {
      this.logger.error('Failed to cancel CJ reservation', error);
      throw new BadRequestException('CJ 예약 취소 실패: ' + error.message);
    }
  }

  /**
   * ============================================
   * 6. 상품 추적 API
   * ============================================
   */

  async trackShipment(waybillNo: string): Promise<CjTrackingData> {
    const token = await this.getValidToken();
    const url = `${this.apiBaseUrl}/ReqOneGdsTrc`;

    const payload = {
      DATA: {
        TOKEN_NUM: token,
        INVC_NO: waybillNo,
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'CJ-Gateway-APIKey': token,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`CJ Tracking API failed: ${response.status}`);
      }

      const result: any = await response.json();

      if (result.RESULT_CD !== 'S') {
        throw new Error(`CJ Tracking Error: ${result.RESULT_DETAIL || 'Unknown error'}`);
      }

      return result.DATA;
    } catch (error: any) {
      this.logger.error('Failed to track shipment', error);
      throw new BadRequestException('배송 추적 실패: ' + error.message);
    }
  }

  /**
   * ============================================
   * 6. 운송장 출력용 데이터 생성
   * ============================================
   */

  async getWaybillPrintData(jobId: string): Promise<WaybillPrintData> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        parcel: true,
        items: { include: { sku: true } },
        cjShipment: true,
      },
    });

    if (!job || !job.parcel) {
      throw new BadRequestException('Job or Parcel not found');
    }

    const parcel = job.parcel;
    const shipment = job.cjShipment;

    if (!shipment || !shipment.invcNo) {
      throw new BadRequestException('CJ Shipment not created yet');
    }

    const totalQty = job.items.reduce((sum, it) => sum + it.qtyPicked, 0);
    const goodsName = job.items.map((it) => it.sku.name || it.sku.sku).join(', ') || '상품';

    return {
      waybillNo: shipment.invcNo,
      orderNo: shipment.custUseNo || undefined,

      sender: {
        name: this.senderName,
        phone: `${this.senderTel1}-${this.senderTel2}-${this.senderTel3}`,
        zip: this.senderZip || undefined,
        addr: this.senderAddr,
        addrDetail: this.senderDetailAddr || undefined,
      },

      recipient: {
        name: parcel.recipientName,
        phone: parcel.phone,
        zip: parcel.zip || undefined,
        addr: parcel.addr1,
        addrDetail: parcel.addr2 || undefined,
      },

      goods: {
        name: goodsName,
        qty: totalQty,
        boxType: '01',
      },

      memo: parcel.memo || undefined,
      rcptYmd: shipment.rcptYmd || undefined,
    };
  }

  /**
   * ============================================
   * Utilities
   * ============================================
   */

  private parsePhone(phone: string): [string, string, string] {
    const cleaned = phone.replace(/[^0-9]/g, '');

    // 010-1234-5678 형태 파싱
    if (cleaned.startsWith('010') && cleaned.length === 11) {
      return [cleaned.slice(0, 3), cleaned.slice(3, 7), cleaned.slice(7)];
    }

    // 02-1234-5678 형태
    if (cleaned.startsWith('02') && cleaned.length === 10) {
      return [cleaned.slice(0, 2), cleaned.slice(2, 6), cleaned.slice(6)];
    }

    // 기본값
    if (cleaned.length >= 9) {
      return [cleaned.slice(0, 3), cleaned.slice(3, 7), cleaned.slice(7)];
    }

    return ['010', '0000', '0000'];
  }
}
