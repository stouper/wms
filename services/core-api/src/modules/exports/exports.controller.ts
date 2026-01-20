import { Controller, Get, Post, Query, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ExportsService } from './exports.service';

@Controller('exports')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  /**
   * ============================================
   * EPMS CSV 내보내기 (기존)
   * ============================================
   */

  // /exports/epms?date=20251216
  @Get('epms')
  async epms(@Query('date') date: string, @Res() res: Response) {
    const { filename, csv } = await this.exports.exportEpmsCsv(date);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // 엑셀 한글 깨짐 방지 BOM
    res.send('\uFEFF' + csv);
  }

  /**
   * ============================================
   * CJ 대한통운 택배 API 엔드포인트
   * ============================================
   */

  /**
   * CJ 예약 접수
   * POST /exports/cj/reservation/:jobId
   *
   * 사용 예시:
   * - Desktop에서 출고 완료 후 호출
   * - Job에 대해 CJ API 예약 접수
   * - 운송장 번호 자동 발급 및 저장
   */
  @Post('cj/reservation/:jobId')
  async createCjReservation(@Param('jobId') jobId: string) {
    return this.exports.createCjReservation(jobId);
  }

  /**
   * 운송장 출력 데이터 조회
   * GET /exports/cj/waybill/:jobId
   *
   * 사용 예시:
   * - Desktop에서 운송장 출력 화면에 표시할 데이터 조회
   * - 실제 프린트는 Desktop에서 처리
   */
  @Get('cj/waybill/:jobId')
  async getWaybillData(@Param('jobId') jobId: string) {
    return this.exports.getWaybillData(jobId);
  }

  /**
   * CJ 배송 추적
   * GET /exports/cj/track/:waybillNo
   *
   * 사용 예시:
   * - 운송장 번호로 배송 상태 조회
   * - 스캔 이력, 현재 위치 등 확인
   */
  @Get('cj/track/:waybillNo')
  async trackShipment(@Param('waybillNo') waybillNo: string) {
    return this.exports.trackCjShipment(waybillNo);
  }

  /**
   * CJ 예약 상태 확인
   * GET /exports/cj/status/:jobId
   *
   * 사용 예시:
   * - Job에 대한 CJ 예약이 이미 되어있는지 확인
   * - 운송장 번호 등 조회
   */
  @Get('cj/status/:jobId')
  async getCjReservationStatus(@Param('jobId') jobId: string) {
    return this.exports.getCjReservationStatus(jobId);
  }
}
