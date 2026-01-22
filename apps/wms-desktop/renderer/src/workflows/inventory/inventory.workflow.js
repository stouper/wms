// renderer/src/workflows/inventory/inventory.workflow.js
import { inventoryApi } from "./inventory.api";

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

export const inventoryFlow = {
  loadSummary: async ({ limit = 50000, storeId } = {}) => {
    const data = await inventoryApi.summary({ limit, storeId });
    return normalizeList(data);
  },
};
