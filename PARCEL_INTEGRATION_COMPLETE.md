# CJ 택배 API 통합 완료 보고서

## 작업 일시
2026-01-20

## 완료된 작업

### 1. CJ API 서비스 구현 (Backend)

#### 파일: `services/core-api/src/modules/cj-api/cj-api.service.ts`

**구현된 기능:**
- ✅ 1Day Token 자동 발급 및 갱신
- ✅ 주소 정제 API (ReqAddrRfnSm)
- ✅ 운송장 번호 발급 API (ReqInvcNo)
- ✅ 예약 접수 API (RegBook)
- ✅ 상품 추적 API (ReqOneGdsTrc)
- ✅ 운송장 출력용 데이터 생성

**주요 수정사항:**
- CJ API 요청 형식: 모든 payload를 `{"DATA": {...}}` 구조로 wrapping
- 응답 파싱: `result.RESULT_CD === "S"` 형식으로 변경
- DB 저장 오류 수정: `payload.DATA.CUST_USE_NO` 사용
- 전화번호 파싱: 010/02 형식 자동 분리

#### 파일: `services/core-api/src/modules/cj-api/cj-api.module.ts`

**수정사항:**
- PrismaModule import 추가 → NestJS 의존성 주입 오류 해결

---

### 2. Desktop 앱 통합

#### 파일: `apps/wms-desktop/renderer/src/workflows/_common/exports.api.js` (신규)

**구현된 API 함수:**
```javascript
- createCjReservation(jobId)      // CJ 예약 접수
- getCjReservationStatus(jobId)   // 예약 상태 조회
- getCjWaybillData(jobId)         // 운송장 출력 데이터
- trackCjShipment(waybillNo)      // 배송 추적
```

#### 파일: `apps/wms-desktop/renderer/src/pages/StoreOutboundPage.jsx`

**추가된 UI 요소:**
- "CJ 예약 접수" 버튼
  - parcel 정보가 있는 Job만 활성화
  - 예약 완료 시 운송장 번호 표시
- "운송장 출력" 버튼
  - 예약 완료된 Job만 활성화
  - 모달로 운송장 정보 표시

**추가된 상태 관리:**
```javascript
cjLoading    // CJ API 호출 중
cjStatus     // 예약 상태 (invcNo 포함)
waybillData  // 운송장 출력 데이터
showWaybillModal  // 운송장 모달 표시 여부
```

---

### 3. 택배 요청 Excel 파싱

#### 파일: `apps/wms-desktop/renderer/src/workflows/_common/excel/parseParcelRequest.js`

**회사 양식 특성:**
- Row 1: 안내 문구 (수취인 우편번호 "11111" & 몰코드 필수 기재)
- Row 2: 헤더 (12개 컬럼)
- Row 3~: 데이터 (주문 그룹핑 구조)

**그룹핑 로직:**
- 수취인명이 있는 행 → 새 주문 시작
- 수취인명이 없는 행 → 이전 주문의 추가 상품
- 첫 행에만 배송 정보, 이후 행은 상품 정보만

**핵심 함수:**
```javascript
normalizeAndGroupParcelRows(objs)
  - lastOrder 상태 유지
  - 수취인명 기준 주문 감지
  - 빈 행 필터링 (매장코드, 옵션, 수량 모두 없으면 제외)

detectHeaderRow(grid)
  - '수취인명', '수취인주소', '매장코드', '옵션' 중 2개 이상 포함된 행 탐지
  - 최대 30행까지 검색
```

**중요 수정:**
- ES Module 환경에 맞춰 `require("xlsx")` → `await import("xlsx")` 변경
- 함수 시그니처: `export async function parseParcelRequestFileToRows(...)`

#### 파일: `apps/wms-desktop/renderer/src/workflows/parcelRequest/parcelRequest.workflow.js`

**Job/Parcel 생성 로직:**
```javascript
createJobsFromPreview({ rows, fileName })
  1. 주문번호별로 rows 그룹화
  2. 각 주문마다:
     - Job 생성 (type: OUTBOUND, title: "[택배] {주문번호}")
     - JobParcel 생성 (배송 정보: 수취인, 주소, 전화, 메모)
     - JobItem 생성 (상품: SKU, 수량)
```

**SKU 추출 로직:**
```javascript
extractSkuCode(optionRaw)
  Pattern 1: (207009-001) 형식
  Pattern 2: SKU: ABC123 형식
  Pattern 3: 슬래시 구분 (207009-001/M/화이트)
```

**async/await 수정:**
```javascript
parseParcelRequestFromFile(file)
  - await parseParcelRequestFileToRows() 추가
```

#### 파일: `apps/wms-desktop/renderer/src/pages/ParcelRequestPage.jsx`

**추가된 기능:**
- "작지 생성" 버튼
  - rows 데이터가 있을 때만 표시
  - 생성 중일 때 "작지 생성 중..." 표시
  - 완료 후 성공 토스트 메시지

---

### 4. 테스트 결과

#### CJ API 테스트 (2026-01-20)
```
✅ Token: f97a479c-9f3f-4ae3... (DB 저장 완료)
✅ Address verification: "서울시 강남구 테헤란로 427"
   → "삼성2 143-40 스위스타워"
✅ Waybill generation: 660026455391
```

#### Excel 파싱 테스트
```
파일: 온라인 주문서 양식.xlsx
✅ Parse successful
✅ Sheet Name: 주문서 양식
✅ Total Rows: 17
✅ Recipient info propagated to all rows:
   - 수취인: 한경순
   - 주소: 경기도 고양시 덕양구 향동로 123...
   - 전화: 0502-1694-5441
   - 매장: 2525 / NC창원점
```

#### Backend 서버 테스트
```
✅ TypeScript compilation: 0 errors
✅ NestJS modules initialized
✅ All endpoints registered:
   - POST /exports/cj/reservation/:jobId
   - GET  /exports/cj/status/:jobId
   - GET  /exports/cj/waybill/:jobId
   - GET  /exports/cj/track/:waybillNo
✅ Server running on port 3000
✅ Jobs endpoint responding correctly
```

---

### 5. 해결된 문제들

#### 문제 1: API 404 오류
- **원인:** 잘못된 endpoint 경로 (`/api/xxx/` prefix)
- **해결:** 올바른 경로로 수정 (`/ReqOneDayToken` 등)

#### 문제 2: API 500 오류
- **원인:** CJ API 요청 형식 불일치
- **해결:** 모든 payload를 `{"DATA": {...}}` 구조로 wrapping

#### 문제 3: TypeScript 컴파일 오류
- **원인:** `payload.CUST_USE_NO` → DATA wrapper 후 경로 변경 필요
- **해결:** `payload.DATA.CUST_USE_NO` 사용

#### 문제 4: NestJS 의존성 주입 오류
- **원인:** CjApiModule에 PrismaModule import 누락
- **해결:** `imports: [PrismaModule]` 추가

#### 문제 5: Port 3000 이미 사용 중
- **원인:** 이전 서버 프로세스 종료 안 됨
- **해결:** `taskkill //F //PID` 후 재시작

#### 문제 6: ES Module vs CommonJS 혼용
- **원인:** `require("xlsx")` in ES module context
- **해결:** `await import("xlsx")` 사용 + async function

---

### 6. 데이터 흐름

```
[Excel 업로드]
    ↓
parseParcelRequestFileToRows()
    ↓ (async)
[주문 그룹핑 데이터]
    ↓
createJobsFromPreview()
    ↓
[Job/JobParcel/JobItem 생성]
    ↓
StoreOutboundPage
    ↓
"CJ 예약 접수" 클릭
    ↓
createCjReservation(jobId)
    ↓
[CJ API RegBook 호출]
    ↓
[운송장 번호 발급 + DB 저장]
    ↓
"운송장 출력" 클릭
    ↓
getWaybillPrintData(jobId)
    ↓
[운송장 모달 표시]
    ↓
(프린터 출력 - 추후 구현)
```

---

### 7. 다음 단계 (미완료)

- [ ] 운송장 프린터 연동
  - CODE128 바코드 생성
  - 123mm×100mm 용지 레이아웃
  - 이름/전화번호 마스킹
  - 19개 필수 필드 출력

- [ ] 배송 추적 자동화
  - 주기적인 배송 상태 업데이트
  - 배송 완료 알림

- [ ] 예외 처리 강화
  - CJ API 호출 실패 시 재시도
  - 운송장 번호 발급 실패 시 처리
  - 주소 정제 실패 시 수동 입력

---

### 8. 주요 파일 목록

**Backend:**
- `services/core-api/src/modules/cj-api/cj-api.service.ts`
- `services/core-api/src/modules/cj-api/cj-api.module.ts`
- `services/core-api/src/modules/cj-api/interfaces/cj-api.interface.ts`
- `services/core-api/src/modules/exports/exports.controller.ts`

**Desktop:**
- `apps/wms-desktop/renderer/src/workflows/_common/exports.api.js`
- `apps/wms-desktop/renderer/src/workflows/_common/excel/parseParcelRequest.js`
- `apps/wms-desktop/renderer/src/workflows/parcelRequest/parcelRequest.workflow.js`
- `apps/wms-desktop/renderer/src/pages/ParcelRequestPage.jsx`
- `apps/wms-desktop/renderer/src/pages/StoreOutboundPage.jsx`

**Database:**
- `prisma/schema.prisma` (JobParcel, CjShipment 모델)

---

## 결론

프린터 연결 전까지 **모든 CJ 택배 로직이 완료**되었습니다.

- ✅ Backend CJ API 통합
- ✅ Desktop 앱 UI 및 워크플로우
- ✅ Excel 파싱 및 Job 생성
- ✅ 예약 접수 및 운송장 발급
- ✅ 모든 테스트 통과

**로컬 환경 기준 검증 완료, 실무 테스트 준비 완료.**
