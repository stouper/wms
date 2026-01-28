/**
 * CJ 대한통운 택배 API 인터페이스 정의
 * API Developer Guide V3.9.3 기준
 */

/**
 * 공통 응답 구조
 */
export interface CjApiResponse<T = any> {
  HEADER: {
    RESULT_CODE: string;  // '00000' = 정상
    RESULT_MSG?: string;
  };
  DATA?: T;
}

/**
 * 1Day Token 발급 응답
 */
export interface CjTokenData {
  TOKEN_NUM: string;           // 토큰 번호
  TOKEN_EXPRTN_DTM: string;    // 만료일시 (YYYYMMDDHHmmss)
}

/**
 * 주소 정제 요청
 */
export interface CjAddressRequest {
  TOKEN_NUM: string;   // 1Day 토큰 번호
  CLNTNUM: string;     // 고객 ID (계약코드)
  ADDRESS: string;     // 입력 주소
}

/**
 * 주소 정제 응답 (표준 API V3.9.3)
 */
export interface CjAddressData {
  ADDR: string;              // 정제된 주소
  ADDR_DETAIL?: string;      // 상세주소
  ZIP_NO?: string;           // 우편번호
  CLSFCD?: string;           // 권역코드 (분류코드)
  SUBCLSFCD?: string;        // 서브권역코드
  CLSFADDR?: string;         // 권역주소 (주소약칭)
  CLLDLVBRANNM?: string;     // 집배점명 (배달점소)
  CLLDLVBRANCD?: string;     // 집배점코드
  CLLDLVEMPNICKNM?: string;  // 배달사원 별칭
  P2PCD?: string;            // 권내배송코드 (P0~P50)
  ROADADDR?: string;         // 도로명주소
  JIBUNADDR?: string;        // 지번주소
}

/**
 * 운송장 번호 발급 요청
 */
export interface CjWaybillRequest {
  TOKEN_NUM: string;      // 1Day 토큰 번호
  CLNTNUM: string;        // 고객 ID (계약코드)
}

/**
 * 운송장 번호 발급 응답
 */
export interface CjWaybillData {
  INVC_NO_LIST: string[];  // 운송장 번호 리스트
}

/**
 * 예약 접수 요청 (RegBook)
 */
export interface CjReservationRequest {
  TOKEN_NUM: string;
  CUST_ID: string;          // 고객 ID (계약코드)
  CUST_USE_NO?: string;     // 고객 주문번호 (내부관리용)

  // 보내는 사람
  SNDR_NAME: string;
  SNDR_TEL1: string;
  SNDR_TEL2: string;
  SNDR_TEL3: string;
  SNDR_ADDR: string;
  SNDR_DETAIL_ADDR?: string;

  // 받는 사람
  RCVR_NAME: string;
  RCVR_TEL1: string;
  RCVR_TEL2: string;
  RCVR_TEL3: string;
  RCVR_ZIP_NO?: string;
  RCVR_ADDR: string;
  RCVR_DETAIL_ADDR?: string;

  // 상품 정보
  GDS_NM?: string;          // 상품명
  GDS_QTY?: number;         // 상품 수량
  BOX_TYPE_CD?: string;     // 박스 타입 (01~07)

  // 운송장
  INVC_NO: string;          // 운송장 번호

  // 기타 (표준 API V3.9.3)
  REMARK_1?: string;        // 배송 메시지 1
  REMARK_2?: string;        // 배송 메시지 2
  REMARK_3?: string;        // 배송 메시지 3
}

/**
 * 예약 접수 응답
 */
export interface CjReservationData {
  RCPT_YMD: string;         // 접수일자 (YYYYMMDD)
  INVC_NO: string;          // 운송장 번호
  MPCK_KEY?: string;        // 묶음 키
  // ✅ 주소 정제 API 데이터 (송장 출력용)
  DEST_CODE?: string | null;      // 분류코드 (CLSFCD)
  SUB_DEST_CODE?: string | null;  // 서브분류코드 (SUBCLSFCD)
  CLSF_ADDR?: string | null;      // 주소약칭 (CLSFADDR)
  BRANCH_NAME?: string | null;    // 배달점소 (CLLDLVBRANNM)
  EMP_NICKNAME?: string | null;   // 배달사원 별칭 (CLLDLVEMPNICKNM)
  P2P_CD?: string | null;         // 권내배송코드 (P2PCD) - P0~P50
}

/**
 * 상품 추적 요청 (단건) - 표준 API V3.9.3
 */
export interface CjTrackingRequest {
  TOKEN_NUM: string;
  CLNTNUM: string;          // 고객 ID (계약코드)
  INVC_NO: string;          // 운송장 번호
}

/**
 * 상품 추적 응답 (단건)
 */
export interface CjTrackingData {
  INVC_NO: string;
  GDS_NM?: string;
  RCVR_NAME?: string;

  SCAN_LIST?: Array<{
    SCAN_DTM: string;       // 스캔일시
    SCAN_STDG_NM: string;   // 스캔지점명
    PRGS_STTS_CD: string;   // 진행상태코드
    PRGS_STTS_NM: string;   // 진행상태명
  }>;
}

/**
 * 운송장 출력용 데이터
 */
export interface WaybillPrintData {
  waybillNo: string;
  orderNo?: string;

  sender: {
    name: string;
    phone: string;
    zip?: string;
    addr: string;
    addrDetail?: string;
  };

  recipient: {
    name: string;
    phone: string;
    zip?: string;
    addr: string;
    addrDetail?: string;
  };

  goods: {
    name: string;
    qty: number;
    boxType?: string;
  };

  memo?: string;
  rcptYmd?: string;
}
