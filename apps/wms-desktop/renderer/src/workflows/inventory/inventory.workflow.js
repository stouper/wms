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

  // 전체 매장 재고 조회 (창고/HQ 제외)
  loadAllStores: async ({ limit = 50000, q } = {}) => {
    const data = await inventoryApi.allStores({ limit, q });
    return {
      items: normalizeList(data),
      stores: data?.stores || [],
    };
  },

  // 매장별 재고 요약 (집계) - 가벼운 응답
  loadStoresSummary: async () => {
    const data = await inventoryApi.storesSummary();
    return {
      items: normalizeList(data),
    };
  },

  // 특정 매장 재고 상세 (페이지네이션)
  loadStoreDetail: async ({ storeCode, q, offset = 0, limit = 500 } = {}) => {
    const data = await inventoryApi.storeDetail({ storeCode, q, offset, limit });
    return {
      storeCode: data?.storeCode,
      storeName: data?.storeName,
      isHq: data?.isHq,
      total: data?.total || 0,
      offset: data?.offset || 0,
      limit: data?.limit || 500,
      items: normalizeList(data),
    };
  },
};
