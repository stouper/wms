// renderer/src/lib/api.js
import { safeReadLocal } from "./storage";

const DEFAULT_SERVER = "https://backend.dheska.com";

export function getApiBase() {
  // ✅ 0) main.cjs가 주입한 config(최우선)
  const injected = globalThis?.__APP_CONFIG__?.apiBase;
  if (injected) return String(injected).trim();

  // ✅ 1) (선택) 로컬스토리지 override - 필요 없으면 삭제해도 됨
  const saved = safeReadLocal("wms.apiBase");
  if (saved) return String(saved).trim();

  // ✅ 2) 최후 fallback
  return DEFAULT_SERVER;
}
