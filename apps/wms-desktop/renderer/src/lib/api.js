import { safeReadLocal } from "./storage";

export function getApiBase() {
  // 1) 로컬 스토리지 우선 (개발 편의)
  const saved = safeReadLocal("wms.apiBase");
  if (saved) return saved;

  // 2) Electron 환경에서 dev면 로컬
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }

  // 3) 기본은 운영 서버
  return "https://api.dheska.com";
}
