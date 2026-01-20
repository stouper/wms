// renderer/src/workflows/_common/exports.api.js
import { http } from "./http";

export const exportsApi = {
  /**
   * CJ 예약 접수
   * POST /exports/cj/reservation/:jobId
   */
  createCjReservation: async (jobId) => {
    if (!jobId) throw new Error("jobId is required");
    return http.post(`/exports/cj/reservation/${jobId}`);
  },

  /**
   * CJ 예약 상태 확인
   * GET /exports/cj/status/:jobId
   */
  getCjReservationStatus: async (jobId) => {
    if (!jobId) throw new Error("jobId is required");
    return http.get(`/exports/cj/status/${jobId}`);
  },

  /**
   * CJ 운송장 출력 데이터 조회
   * GET /exports/cj/waybill/:jobId
   */
  getCjWaybillData: async (jobId) => {
    if (!jobId) throw new Error("jobId is required");
    return http.get(`/exports/cj/waybill/${jobId}`);
  },

  /**
   * CJ 배송 추적
   * GET /exports/cj/track/:waybillNo
   */
  trackCjShipment: async (waybillNo) => {
    if (!waybillNo) throw new Error("waybillNo is required");
    return http.get(`/exports/cj/track/${waybillNo}`);
  },
};
