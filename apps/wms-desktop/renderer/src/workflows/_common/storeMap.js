// renderer/src/workflows/_common/storeMap.js
// API 기반 매장 정보 관리 (하드코딩 제거)
import { http } from "./http";

// 매장 캐시
let storesCache = [];
let cacheLoaded = false;

/**
 * API에서 매장 목록 로드
 */
export async function loadStores() {
  try {
    const res = await http.get("/stores");
    storesCache = res?.rows || [];
    cacheLoaded = true;
    return storesCache;
  } catch (e) {
    console.error("매장 목록 로드 실패:", e);
    return [];
  }
}

/**
 * 캐시된 매장 목록 반환 (없으면 빈 배열)
 */
export function getStoresCache() {
  return storesCache;
}

/**
 * 캐시 로드 여부
 */
export function isCacheLoaded() {
  return cacheLoaded;
}

/**
 * 매장코드로 매장명 조회 (캐시 기반)
 * @param {string} code 매장코드
 * @returns {string} 매장명 (없으면 빈 문자열)
 */
export function storeName(code) {
  const c = String(code ?? "").trim();
  if (!c) return "";

  const store = storesCache.find((s) => s.code === c);
  return store?.name || "";
}

/**
 * 매장코드로 라벨 생성: "매장명 (코드)" 형식
 * 매장명이 없으면 코드만 반환
 * @param {string} code 매장코드
 * @returns {string} 라벨
 */
export function storeLabel(code) {
  const c = String(code ?? "").trim();
  if (!c) return "";

  const name = storeName(c);
  return name ? `${name} (${c})` : c;
}

/**
 * Job 객체에서 매장 라벨 추출 (store relation 우선)
 * @param {object} job Job 객체
 * @param {string} fallbackCode fallback 매장코드
 * @returns {string} 매장 라벨
 */
export function jobStoreLabel(job, fallbackCode = "") {
  // store relation이 있으면 우선 사용
  if (job?.store) {
    const code = job.store.code || "";
    const name = job.store.name || "";
    return name ? `${name} (${code})` : code;
  }

  // fallback: storeCode 필드 (레거시)
  const code = job?.storeCode || fallbackCode;
  return storeLabel(code);
}

/**
 * Job 객체에서 매장코드 추출 (store relation 우선)
 * @param {object} job Job 객체
 * @param {string} fallbackCode fallback 매장코드
 * @returns {string} 매장코드
 */
export function jobStoreCode(job, fallbackCode = "") {
  if (job?.store?.code) return job.store.code;
  return job?.storeCode || fallbackCode;
}
