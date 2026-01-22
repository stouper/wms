// renderer/src/workflows/inventory/inventory.api.js
import { http } from "../_common/http";

export const inventoryApi = {
  summary: async ({ limit = 50000, storeId } = {}) => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (storeId) params.set("storeId", storeId);
    return http.get(`/inventory/summary?${params.toString()}`);
  },
};
