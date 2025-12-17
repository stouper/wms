import { safeReadLocal } from "./storage";

export const DEFAULT_API_BASE = "http://localhost:3000";

/**
 * UI에 노출하지 않고, 코드/로컬스토리지에서만 API Base를 관리한다.
 * - localStorage key: wms.apiBase
 */
export function getApiBase() {
  return safeReadLocal("wms.apiBase") || DEFAULT_API_BASE;
}
