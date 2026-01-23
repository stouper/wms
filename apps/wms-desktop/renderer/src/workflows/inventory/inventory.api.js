// renderer/src/workflows/inventory/inventory.api.js
import { http } from "../_common/http";

export const inventoryApi = {
  summary: async ({ limit = 50000, storeId } = {}) => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (storeId) params.set("storeId", storeId);
    return http.get(`/inventory/summary?${params.toString()}`);
  },

  // 전체 매장 재고 조회 (창고/HQ 제외)
  allStores: async ({ limit = 50000, q } = {}) => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (q) params.set("q", q);
    return http.get(`/inventory/all-stores?${params.toString()}`);
  },

  // 매장별 재고 요약 (집계) - 가벼운 응답
  storesSummary: async () => {
    return http.get("/inventory/stores-summary");
  },

  // 특정 매장 재고 상세 (페이지네이션)
  storeDetail: async ({ storeCode, q, offset = 0, limit = 500 } = {}) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("offset", String(offset));
    params.set("limit", String(limit));
    return http.get(`/inventory/store/${encodeURIComponent(storeCode)}?${params.toString()}`);
  },
};
