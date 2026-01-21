import { parseParcelRequestFileToRows } from "../_common/excel/parseParcelRequest";
import { jobsApi } from "../jobs/jobs.api";
import { http } from "../_common/http";

export async function runParcelRequest({ file }) {
  try {
    if (!file) return { ok: false, error: "파일이 필요합니다", level: "warn" };
    const result = await parseParcelRequestFromFile(file);
    return { ok: true, data: { rows: result.rows } };
  } catch (e) {
    return { ok: false, error: e?.message || "처리 실패", level: "error" };
  }
}

export const parcelShipMode = {
  key: "parcelShip",
  title: "택배 요청",
  sheetName: "WORK",

  validateUpload() {
    return { ok: true };
  },

  /**
   * 택배요청 rows → 배치 Job + 하위 Job 생성
   * - 배치 Job: 엑셀 파일 단위로 1개 생성
   * - 하위 Job: 주문별로 생성 (parentId로 배치와 연결)
   * - 단포(sortOrder=1) / 합포(sortOrder=2) 구분
   */
  async createJobsFromPreview({ rows, fileName } = {}) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("택배요청 데이터가 없습니다");
    }

    console.log("✅ 택배 배치 작지 생성 시작");
    console.log("📦 파싱된 rows 개수:", rows.length);

    // 주문번호별로 그룹화
    const orderGroups = groupByOrderNo(rows);
    const totalOrders = orderGroups.size;

    console.log("📦 주문번호별 그룹 개수:", totalOrders);

    // ✅ 1) 배치 Job 생성
    const now = new Date();
    const timeStr = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const batchTitle = `[택배] ${timeStr} (${totalOrders}건)`;

    // HQ(본사) 스토어 조회 - 택배는 본사에서 발송
    let hqStoreId = null;
    try {
      const storesRes = await http.get("/stores");
      const hqStore = (storesRes?.rows || []).find((s) => s.isHq || s.code === "HQ");
      hqStoreId = hqStore?.id;
    } catch (e) {
      console.error("HQ 스토어 조회 실패:", e);
    }

    if (!hqStoreId) {
      throw new Error("본사(HQ) 스토어를 찾을 수 없습니다");
    }

    const batchJob = await jobsApi.create({
      storeId: hqStoreId,
      title: batchTitle,
      memo: `택배 배치: ${fileName || ""} (${totalOrders}건)`,
      type: "OUTBOUND",
      // 배치 Job은 parentId, packType 없음
    });

    const batchJobId = batchJob?.id || batchJob?.job?.id;
    if (!batchJobId) throw new Error("배치 Job 생성 실패");

    console.log("✅ 배치 Job 생성 완료:", batchJobId, batchTitle);

    // ✅ 2) 하위 Job 생성 (주문별)
    let createdCount = 0;
    const createdJobIds = [batchJobId];
    const failedOrders = [];

    for (const [orderNo, orderRows] of orderGroups.entries()) {
      let childJobId = null;

      try {
        const first = orderRows[0];

        // 단포/합포 판별
        const totalQty = orderRows.reduce((sum, r) => sum + (r.qty || 1), 0);
        const isSinglePack = orderRows.length === 1 && totalQty === 1;
        const packType = isSinglePack ? "single" : "multi";
        const sortOrder = isSinglePack ? 1 : 2;

        // 지역 추출
        const region = extractRegion(first.address);

        // 하위 Job 타이틀: "수취인명 (지역) [단포/합포]"
        const packLabel = isSinglePack ? "단포" : "합포";
        const childTitle = `${first.receiverName || "?"} (${region}) [${packLabel}]`;

        // 하위 Job 생성
        const childJob = await jobsApi.create({
          storeId: hqStoreId,
          title: childTitle,
          memo: `주문: ${orderNo}`,
          type: "OUTBOUND",
          parentId: batchJobId,
          packType,
          sortOrder,
        });

        childJobId = childJob?.id || childJob?.job?.id;
        if (!childJobId) throw new Error("하위 Job 생성 실패");

        // JobParcel 생성 (배송 정보)
        await http.post(`/jobs/${childJobId}/parcels/upsert`, {
          orderNo: first.orderNo || orderNo,
          recipientName: first.receiverName,
          phone: first.phone,
          zip: first.zipcode,
          addr1: first.address,
          addr2: "",
          memo: first.message,
          carrierCode: "CJ",
        });

        // JobItem 생성 (상품 정보)
        const items = orderRows.map((r, idx) => {
          const optionName = String(r.optionRaw || "").trim();
          return {
            makerCode: optionName || `UNKNOWN-${orderNo}-${idx + 1}`,
            name: optionName || "택배상품",
            qty: r.qty || 1,
            qtyPlanned: r.qty || 1,
          };
        });

        await jobsApi.addItems(childJobId, { items });

        createdCount += 1;
        createdJobIds.push(childJobId);

        console.log(`✅ 하위 Job 생성: ${childTitle} (${packType})`);
      } catch (error) {
        // 에러 발생 시 생성된 하위 Job 삭제
        if (childJobId) {
          try {
            await jobsApi.delete(childJobId);
          } catch (e) {
            console.error(`하위 Job 삭제 실패: ${childJobId}`, e);
          }
        }

        failedOrders.push({
          orderNo,
          error: error?.message || String(error),
        });
      }
    }

    // 모두 실패한 경우 배치 Job도 삭제
    if (createdCount === 0) {
      try {
        await jobsApi.delete(batchJobId);
      } catch (e) {
        console.error("배치 Job 삭제 실패:", e);
      }
      throw new Error(`모든 작지 생성 실패:\n${failedOrders.map((f) => `${f.orderNo}: ${f.error}`).join("\n")}`);
    }

    if (failedOrders.length > 0) {
      console.warn(`⚠️ 일부 작지 생성 실패:`, failedOrders);
    }

    return {
      ok: true,
      batchJobId,
      createdCount,
      createdJobIds,
      failedOrders,
    };
  },

  async scan() {
    return { ok: false, error: "배치 스캔은 jobsApi.scanBatch()를 사용하세요" };
  },
};

export async function parseParcelRequestFromFile(file) {
  if (!file) throw new Error("file is required");
  const buf = await file.arrayBuffer();
  return await parseParcelRequestFileToRows(buf, file.name || "");
}

/**
 * 주문번호별로 rows 그룹화
 * - 주문번호가 있으면 그대로 사용
 * - 주문번호가 없으면 수취인명+주소+연락처로 자동 생성 (합배송 처리)
 * @returns Map<orderNo, rows[]>
 */
function groupByOrderNo(rows) {
  const map = new Map();

  for (const r of rows) {
    let orderNo = String(r.orderNo || "").trim();

    // 주문번호가 없으면 자동 생성 (수취인 정보 기준)
    if (!orderNo) {
      const receiverName = String(r.receiverName || "").trim();
      const address = String(r.address || "").trim();
      const phone = String(r.phone || "").trim();

      const key = `${receiverName}|${address}|${phone}`;
      const hash = simpleHash(key);
      orderNo = `AUTO-${hash}`;
    }

    if (!map.has(orderNo)) {
      map.set(orderNo, []);
    }
    map.get(orderNo).push(r);
  }

  return map;
}

/**
 * 간단한 문자열 해시 생성
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).toUpperCase().substring(0, 8);
}

/**
 * 주소에서 시/군/구 단위 지역 추출
 * 예: "충청북도 청주시 서원구..." → "청주"
 *     "경상북도 안동시 육사로..." → "안동"
 *     "서울특별시 강남구..." → "강남"
 */
function extractRegion(address) {
  if (!address) return "?";

  const addr = String(address).trim();

  // 패턴 1: "OO시" 추출 (예: 청주시, 안동시, 수원시)
  const cityMatch = addr.match(/([가-힣]{1,4})시/);
  if (cityMatch) {
    return cityMatch[1]; // "청주", "안동" 등
  }

  // 패턴 2: "OO구" 추출 (서울/부산 등 광역시)
  const guMatch = addr.match(/([가-힣]{1,3})구/);
  if (guMatch) {
    return guMatch[1]; // "강남", "해운대" 등
  }

  // 패턴 3: "OO군" 추출
  const gunMatch = addr.match(/([가-힣]{1,4})군/);
  if (gunMatch) {
    return gunMatch[1];
  }

  // 추출 실패 시 앞 10글자
  return addr.substring(0, 10);
}
