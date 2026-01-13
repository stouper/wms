// renderer/src/workflows/inventory/inventory.api.js
import { http } from "../_common/http";

export const inventoryApi = {
  summary: async ({ limit = 50000 } = {}) => {
    const q = `?limit=${encodeURIComponent(String(limit))}`;
    return http.get(`/inventory/summary${q}`);
  },
};
