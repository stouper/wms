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
   * 택배요청 rows → Job/JobParcel 생성
   * - rows: parseParcelRequest 결과 (orderNo, receiverName, address, optionRaw, qty 등)
   * - 주문번호별로 그룹화하여 각각 1개 Job 생성
   * - JobParcel: 배송 정보 저장
   * - JobItem: 상품 정보 (optionRaw에서 SKU 추출 시도)
   */
  async createJobsFromPreview({ rows, fileName } = {}) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("택배요청 데이터가 없습니다");
    }

    console.log("✅ 택배 작지 생성 시작");
    console.log("📦 파싱된 rows 개수:", rows.length);
    console.log("📦 첫 번째 row:", rows[0]);

    // 주문번호별로 그룹화
    const orderGroups = groupByOrderNo(rows);

    console.log("📦 주문번호별 그룹 개수:", orderGroups.size);
    console.log("📦 그룹 키(주문번호):", Array.from(orderGroups.keys()));

    let createdCount = 0;
    const createdJobIds = [];
    const failedOrders = [];

    for (const [orderNo, orderRows] of orderGroups.entries()) {
      let jobId = null;

      try {
        // 첫 번째 row의 배송 정보 사용
        const first = orderRows[0];
        const storeCode = first.storeCode || "ONLINE";

        // Job 생성
        const job = await jobsApi.create({
          storeCode,
          title: `[택배] ${orderNo}`,
          memo: `택배요청: ${fileName || ""}`,
          type: "OUTBOUND",
          kind: "출고",
        });

        jobId = job?.id || job?.job?.id;
        if (!jobId) throw new Error("Job 생성 실패");

        // JobParcel 생성 (배송 정보)
        await http.post(`/jobs/${jobId}/parcels/upsert`, {
          orderNo: first.orderNo,
          recipientName: first.receiverName,
          phone: first.phone,
          zip: first.zipcode,
          addr1: first.address,
          addr2: "", // 상세주소는 address에 포함된 경우가 많음
          memo: first.message,
          carrierCode: "CJ", // 기본값
        });

        // JobItem 생성 (상품 정보)
        // ✅ optionRaw를 그대로 makerCode로 사용
        // 백엔드에서 SKU 테이블의 makerCode 또는 sku 필드와 자동 매칭
        const items = orderRows.map((r, idx) => {
          const optionName = String(r.optionRaw || "").trim();
          if (!optionName) {
            console.warn(`⚠️ 주문 ${orderNo} 행 ${idx}: optionRaw 없음`);
          }
          return {
            makerCode: optionName || `UNKNOWN-${orderNo}-${idx + 1}`,
            name: optionName || "택배상품",
            qty: r.qty || 1,
            qtyPlanned: r.qty || 1,
          };
        });

        await jobsApi.addItems(jobId, { items });

        createdCount += 1;
        createdJobIds.push(jobId);
      } catch (error) {
        // ✅ 에러 발생 시 생성된 Job 삭제 (롤백)
        if (jobId) {
          console.error(`❌ 주문 ${orderNo} 작지 생성 실패, Job 삭제 중...`, error);
          try {
            await jobsApi.delete(jobId);
            console.log(`✅ 실패한 Job 삭제 완료: ${jobId}`);
          } catch (deleteError) {
            console.error(`⚠️ Job 삭제 실패: ${jobId}`, deleteError);
          }
        }

        // ✅ 실패 정보 기록 (에러를 던지지 않고 계속 진행)
        failedOrders.push({
          orderNo,
          error: error?.message || String(error),
        });
      }
    }

    // ✅ 부분 성공 허용: 일부 성공, 일부 실패 가능
    if (failedOrders.length > 0) {
      const failedMsg = failedOrders
        .map((f) => `${f.orderNo}: ${f.error}`)
        .join("\n");

      if (createdCount === 0) {
        // 모두 실패
        throw new Error(`모든 작지 생성 실패:\n${failedMsg}`);
      } else {
        // 일부 실패
        console.warn(`⚠️ 일부 작지 생성 실패:\n${failedMsg}`);
      }
    }

    return { ok: true, createdCount, createdJobIds, failedOrders };
  },

  async scan() {
    return { ok: false, error: "택배 요청 화면에서는 스캔 기능을 아직 안 써. (미리보기까지만)" };
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

    // ✅ 주문번호가 없으면 자동 생성 (수취인 정보 기준)
    if (!orderNo) {
      const receiverName = String(r.receiverName || "").trim();
      const address = String(r.address || "").trim();
      const phone = String(r.phone || "").trim();

      // 수취인명+주소+연락처 기준으로 고유 키 생성
      const key = `${receiverName}|${address}|${phone}`;
      const hash = simpleHash(key);
      orderNo = `AUTO-${hash}`;

      console.log(`📦 주문번호 자동 생성: ${orderNo} (${receiverName}, ${address.substring(0, 20)}...)`);
    }

    if (!map.has(orderNo)) {
      map.set(orderNo, []);
    }
    map.get(orderNo).push(r);
  }

  return map;
}

/**
 * 간단한 문자열 해시 생성 (같은 문자열 = 같은 해시)
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // 32bit 정수로 변환
  }
  return Math.abs(hash).toString(36).toUpperCase().substring(0, 8);
}

/**
 * optionRaw에서 SKU 코드 추출 시도
 * 패턴 예: "크록스 클래식 (207009-001)" → "207009-001"
 *         "상품명 / SKU: ABC123" → "ABC123"
 */
function extractSkuCode(optionRaw) {
  if (!optionRaw) return null;

  const s = String(optionRaw).trim();
  if (!s) return null;

  // 패턴 1: 괄호 안의 코드 (예: 207009-001, ABC-123)
  const pattern1 = /\(([A-Z0-9\-]+)\)/i;
  const match1 = s.match(pattern1);
  if (match1) return match1[1];

  // 패턴 2: "SKU:" 또는 "코드:" 뒤의 값
  const pattern2 = /(?:sku|코드|code)[\s:]+([A-Z0-9\-]+)/i;
  const match2 = s.match(pattern2);
  if (match2) return match2[1];

  // 패턴 3: 슬래시(/) 앞뒤로 분리 후 코드 형식 찾기
  const parts = s.split(/[\/\|]/);
  for (const part of parts) {
    const cleaned = part.trim();
    // 숫자-숫자 형식 (예: 207009-001)
    if (/^\d{5,}-\d{2,}$/.test(cleaned)) return cleaned;
    // 대문자-숫자 형식 (예: ABC-123)
    if (/^[A-Z]{2,}-\d+$/i.test(cleaned)) return cleaned;
  }

  return null;
}
