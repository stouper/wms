# WMS 택배 연동 작업 현황 및 다음 할 일

## 작성일: 2026-01-20

---

## 📋 오늘 완료한 작업

### 1. Excel 파싱 로직 수정 및 테스트
**파일:** `apps/wms-desktop/renderer/src/workflows/_common/excel/parseParcelRequest.js`

**문제:**
- ES Module 환경에서 `require("xlsx")` 사용 불가
- `ReferenceError: require is not defined in ES module scope`

**해결:**
```javascript
// Before
export function parseParcelRequestFileToRows(arrayBuffer, fileName = "") {
  let XLSX;
  try {
    XLSX = require("xlsx");  // ❌
  }
}

// After
export async function parseParcelRequestFileToRows(arrayBuffer, fileName = "") {
  let XLSX;
  try {
    XLSX = await import("xlsx");  // ✅
  }
}
```

**결과:**
- ✅ 회사 Excel 양식 (`온라인 주문서 양식.xlsx`) 정상 파싱
- ✅ 주문 그룹핑 로직 정상 동작 (첫 행에만 수취인 정보, 이후 행은 상품만)

---

### 2. 프론트→백엔드 전체 플로우 통합 테스트 (5회 성공)
**테스트 파일:** `apps/wms-desktop/test-job-creation.mjs` (작업 후 삭제)

**테스트 흐름:**
```
Excel 파일 읽기
  ↓
parseParcelRequestFileToRows() 파싱
  ↓
Job 생성 (POST /jobs)
  ↓
JobParcel 생성 (POST /jobs/:id/parcels/upsert)
  ↓
JobItems 생성 (POST /jobs/:id/items)
  ↓
백엔드 조회 (GET /jobs/:id)
  ↓
정리 (DELETE /jobs/:id)
```

**발견 및 수정한 에러:**

#### 에러 1: Job API 응답 형식
```javascript
// 문제: res.data.id 접근 시 undefined
// 원인: API가 { ok: true, id: "...", ... } 직접 반환 (data 래퍼 없음)
// 수정: res.data → res
```

#### 에러 2: JobParcel API - 잘못된 Prisma 모델명
```typescript
// Before (services/core-api/src/modules/jobs/jobs.service.ts:778)
const row = await (this.prisma as any).parcel.upsert({  // ❌
  where: { jobId },
  create: { jobId, payload },
  update: { payload },
});

// After
const data = {
  orderNo: dto.orderNo || null,
  recipientName: dto.recipientName,
  phone: dto.phone,
  zip: dto.zip || null,
  addr1: dto.addr1,
  addr2: dto.addr2 || null,
  memo: dto.memo || null,
  carrierCode: dto.carrierCode || null,
  waybillNo: dto.waybillNo || null,
};

const row = await (this.prisma as any).jobParcel.upsert({  // ✅
  where: { jobId },
  create: { jobId, ...data },
  update: data,
});
```

#### 에러 3: JobItems API - 필수 필드 누락
```javascript
// 문제: "작지 아이템 정보 누락: makerCode/name 필수" 에러
// 원인: skuCode 전송했지만 API는 makerCode 요구
// 수정:
const items = rows.map((r, idx) => {
  const skuCode = extractSkuCode(r.optionRaw) || `TEST-SKU-${testNum}-${idx + 1}`;
  return {
    makerCode: skuCode,  // ✅ 필드명 수정
    name: r.optionRaw || `테스트상품${idx + 1}`,
    qty: r.qty || 1,
  };
});
```

**최종 결과:**
- ✅ 5/5 테스트 성공
- ✅ Excel → Job → JobParcel → JobItems → Backend 전체 흐름 검증 완료

---

### 3. Desktop 택배 페이지 재설계
**신규 파일:** `apps/wms-desktop/renderer/src/pages/ParcelShipmentPage.jsx`

**기존 문제:**
- 택배 기능이 2개 페이지에 분산 (ParcelRequestPage + StoreOutboundPage)
- Excel 업로드 후 → 페이지 이동해야 작지 확인 가능
- 일반 출고와 택배가 혼재되어 복잡

**새로운 통합 페이지 구조:**
```
┌─────────────────────────────────────────┐
│  택배 작업 (ParcelShipmentPage)         │
├─────────────────────────────────────────┤
│  1️⃣ Excel 업로드 & 미리보기 (#fefce8)  │
│  2️⃣ 택배 작지 목록 (#eff6ff)           │
│  3️⃣ 피킹 작업 (스캔) (#f0fdf4)         │
│  4️⃣ CJ 예약 & 운송장 (#fef3c7)         │
└─────────────────────────────────────────┘
```

**주요 기능:**
- ✅ 섹션별 색상 구분으로 현재 단계 명확히 파악
- ✅ 진행률 실시간 표시 (프로그레스 바)
- ✅ 작지 생성 후 자동 새로고침
- ✅ Job 선택 시 CJ 예약 상태 자동 조회
- ✅ 택배 전용 필터링 (`parcel` 있는 Job만)

**라우팅 업데이트:** `apps/wms-desktop/renderer/src/App.jsx`
```javascript
import ParcelShipmentPage from "./pages/ParcelShipmentPage";

const MENUS = [
  // ...
  { key: "delivery", label: "택배 작업" },  // 변경됨
];

case "delivery":
  return ParcelShipmentPage;  // ParcelRequestPage → ParcelShipmentPage
```

---

### 4. Job 분리 구조 확인 및 수정
**문제 발견:**
- StoreOutboundPage에서 택배 작지도 함께 표시되고 있었음
- 원인: `type === 'OUTBOUND'` 조건만으로 필터링 (택배도 OUTBOUND)

**수정:** `apps/wms-desktop/renderer/src/pages/StoreOutboundPage.jsx:240-244`
```javascript
// Before
const list = normalized.filter((j) => {
  return j.type === 'OUTBOUND';  // ❌ 택배 포함
});

// After
const list = normalized.filter((j) => {
  return j.type === 'OUTBOUND' && !j.parcel;  // ✅ 택배 제외
});
```

**분리 구조 확정:**

| 구분 | 대시보드 작지 | 택배 작지 |
|------|--------------|-----------|
| **Excel 양식** | 작업지시서.xlsx | 온라인 주문서 양식.xlsx |
| **Job.type** | OUTBOUND/RETURN | OUTBOUND |
| **JobParcel** | ❌ 없음 | ✅ 있음 |
| **표시 페이지** | StoreOutboundPage<br/>WarehouseInboundPage | ParcelShipmentPage |
| **필터 조건** | `!parcel` | `parcel 있음` |

**문서화:** `JOB_SEPARATION_GUIDE.md` 생성

---

### 5. InventoryTx 연동 확인
**검증 내용:**
- ✅ Prisma Schema에 InventoryTx 모델 정의 확인
- ✅ 출고 스캔 시 자동 생성 (type='out', qty=-1)
- ✅ 입고 스캔 시 자동 생성 (type='in', qty=+1)
- ✅ UNDO 시 자동 생성 (type='undo')
- ✅ API 엔드포인트 존재 확인
  - `GET /jobs/:id/tx` - Job별 트랜잭션 조회
  - `GET /inventory/tx?q=SKU&limit=100` - 전체 트랜잭션 조회
- ✅ 작업자 ID 자동 기록 (operatorId)
- ✅ 강제 출고 기록 (isForced, forcedReason)
- ✅ UNDO 이력 보존 (undoneAt, undoneTxId)

**문서화:** `INVENTORY_TX_INTEGRATION.md` 생성

---

## 🖥️ 서버 환경 (Backend)

### 기술 스택
- **Framework:** NestJS 10.x
- **ORM:** Prisma 5.x
- **Database:** PostgreSQL (로컬)
- **Runtime:** Node.js
- **Port:** 3000

### 실행 중인 서비스
```bash
cd services/core-api
npm run start:dev  # 개발 모드 실행 중
```

### 주요 API 엔드포인트

#### Job 관리
- `POST /jobs` - Job 생성
- `GET /jobs` - Job 목록 조회
- `GET /jobs/:id` - Job 상세 조회
- `DELETE /jobs/:id` - Job 삭제
- `POST /jobs/:id/scan` - 바코드 스캔 (입고/출고)
- `POST /jobs/:id/undo` - UNDO (직전 스캔 취소)

#### JobParcel 관리
- `POST /jobs/:id/parcels/upsert` - 택배 정보 생성/수정
- `GET /jobs/:id/parcels` - 택배 정보 조회

#### JobItems 관리
- `POST /jobs/:id/items` - 작지 아이템 생성

#### InventoryTx (재고 트랜잭션)
- `GET /jobs/:id/tx` - Job별 트랜잭션 조회
- `GET /inventory/tx?q=&limit=` - 전체 트랜잭션 조회

#### CJ API (택배 연동)
- `POST /cj/clean-address` - 주소 정제
- `POST /cj/request-waybill` - 운송장 번호 발급
- `POST /cj/reservation` - 택배 예약 접수
- `GET /cj/track/:waybillNo` - 배송 추적

### Prisma Schema 주요 모델

#### Job (작지)
```prisma
model Job {
  id         String   @id @default(cuid())
  type       String   // 'OUTBOUND' | 'RETURN'
  storeCode  String?
  title      String?
  status     String   @default("pending")
  createdAt  DateTime @default(now())

  items      JobItem[]
  parcel     JobParcel?  // ← 택배 여부 구분
  inventoryTxs InventoryTx[]
}
```

#### JobParcel (택배 정보)
```prisma
model JobParcel {
  id            String   @id @default(cuid())
  jobId         String   @unique
  orderNo       String?
  recipientName String
  phone         String
  zip           String?
  addr1         String
  addr2         String?
  memo          String?
  carrierCode   String?
  waybillNo     String?

  job Job @relation(fields: [jobId], references: [id], onDelete: Cascade)
}
```

#### InventoryTx (재고 트랜잭션)
```prisma
model InventoryTx {
  id         String   @id @default(cuid())
  type       String   // 'in' | 'out' | 'move' | 'adjust' | 'undo'
  qty        Int
  skuId      String
  locationId String?

  // 강제출고 로그
  isForced     Boolean @default(false)
  forcedReason String?
  beforeQty    Int?
  afterQty     Int?

  // 추적용
  jobId     String?
  jobItemId String?

  // UNDO용
  undoneAt   DateTime?
  undoneTxId String?

  // 작업자 ID
  operatorId String?

  createdAt DateTime @default(now())
}
```

### CJ API 연동 상태
- ✅ 토큰 발급 완료 (`f97a479c-9f3f-4ae3-8e4e-16fe3ac03fe2`)
- ✅ 주소 정제 API 연동 완료
- ✅ 운송장 번호 발급 API 연동 완료
- ✅ 예약 접수 API 연동 완료
- ✅ 배송 추적 API 연동 완료

---

## 💻 프론트 환경 (Desktop)

### 기술 스택
- **Framework:** Electron + React
- **번들러:** Vite
- **스타일:** Inline CSS (실용주의)
- **상태관리:** React useState + localStorage

### 실행 방법
```bash
cd apps/wms-desktop
npm run dev  # Electron 개발 모드
```

### 페이지 구조

#### 1. DashboardPage (대시보드)
- 일반 출고/반품 Excel 업로드
- 작업지시서.xlsx 양식 사용

#### 2. InventoryPage (창고 재고)
- 재고 조회 및 관리

#### 3. WarehouseInboundPage (창고 입고)
- 반품 입고 작업
- 필터: `type === 'RETURN'`

#### 4. SalesPage (매출)
- 매출 Excel 업로드

#### 5. StoreOutboundPage (매장 출고) ✅ 수정됨
- **일반 매장 출고만** 표시
- 필터: `type === 'OUTBOUND' && !parcel`
- 바코드 스캔 → 재고 차감 → InventoryTx 기록

#### 6. ParcelShipmentPage (택배 작업) ✅ 신규 생성
- **택배 전용 통합 페이지**
- 4개 섹션 색상 구분:
  1. Excel 업로드 & 미리보기 (노란색 #fefce8)
  2. 택배 작지 목록 (파란색 #eff6ff)
  3. 피킹 작업 (초록색 #f0fdf4)
  4. CJ 예약 & 운송장 (노란색 #fef3c7)
- 필터: `parcel !== null`

### 작업자 ID 관리 ✅
- 앱 시작 시 작업자 ID 입력 모달
- localStorage에 저장 (`wms.operatorId`)
- 모든 스캔 작업에 operatorId 자동 전송
- 사이드바 하단에 현재 작업자 표시

### localStorage 키 구조
```javascript
// API 설정
"wms.apiBase" → "http://localhost:3000"

// 작업자 ID
"wms.operatorId" → "홍길동"

// 매장 출고 (일반)
"wms.jobs.created.storeShip" → [...일반 작지 목록]
"wms.jobs.selectedId.storeShip" → "cmk123..."

// 택배 작업
"wms.parcel.jobs" → [...택배 작지 목록]
"wms.parcel.selected" → "cmk456..."
```

### 주요 Workflow 파일

#### Excel 파싱
- `workflows/_common/excel/parseJobFile.js` - 일반 작업지시서 파싱
- `workflows/_common/excel/parseParcelRequest.js` - 택배 주문서 파싱 ✅ 수정됨

#### Job 생성
- `workflows/jobs/jobs.flow.js` - 일반 작지 생성
- `workflows/parcelRequest/parcelRequest.workflow.js` - 택배 작지 생성

#### 작업자 관리 ✅
- `workflows/_common/operator.js` - 작업자 ID 저장/조회

---

## 📝 앞으로 할 일

### 1순위: 운송장 프린터 연동 ⭐ 가장 중요

**현재 상태:**
- CJ 예약 완료 → 운송장 번호 발급 완료
- 운송장 정보를 모달로 표시만 함
- **실제 출력 기능 없음** ❌

**필요 작업:**

#### 1.1 바코드 생성
- 라이브러리 선정: `jsbarcode` vs `bwip-js`
- CODE128 형식으로 운송장 번호 바코드 생성
- Canvas 또는 SVG로 렌더링

#### 1.2 용지 레이아웃
- CJ 택배 운송장 규격: **123mm × 100mm**
- 19개 필수 필드 배치:
  - 운송장 번호 (바코드)
  - 보내는 분 (상호, 주소, 연락처)
  - 받는 분 (이름, 주소, 연락처)
  - 상품명, 수량, 배송메시지 등

#### 1.3 개인정보 마스킹
- 이름: 중간 글자 마스킹 (홍*동)
- 전화번호: 중간 4자리 마스킹 (010-****-5678)

#### 1.4 프린터 API 연동
- Electron에서 사용 가능한 프린터 라이브러리:
  - `electron-printer` (추천)
  - `node-printer` (네이티브)
- 프린터 목록 조회
- 기본 프린터 설정
- 출력 실행

**예상 파일:**
```
apps/wms-desktop/renderer/src/
  components/
    WaybillPrint.jsx        (신규: 운송장 출력 컴포넌트)
  utils/
    barcode.js              (신규: 바코드 생성)
    printer.js              (신규: 프린터 API)
```

**예상 소요:** 중간 규모 (2-3일)

---

### 2순위: 배송 추적 자동화

**현재 상태:**
- 수동으로 "배송 추적" 버튼 클릭 필요
- CJ API 호출 후 현재 상태만 표시

**필요 작업:**

#### 2.1 Backend 스케줄러
```typescript
// services/core-api/src/modules/cj/cj.service.ts
@Cron('0 */30 * * * *')  // 30분마다 실행
async autoUpdateDeliveryStatus() {
  // 1. 진행중인 택배 작지 조회 (waybillNo 있고 배송완료 아닌 것)
  const jobs = await this.prisma.jobParcel.findMany({
    where: {
      waybillNo: { not: null },
      deliveryStatus: { not: '배송완료' },
    },
  });

  // 2. 각 운송장 번호로 배송 추적
  for (const job of jobs) {
    const status = await this.trackDelivery(job.waybillNo);

    // 3. JobParcel.deliveryStatus 업데이트
    await this.prisma.jobParcel.update({
      where: { id: job.id },
      data: { deliveryStatus: status.status },
    });
  }
}
```

#### 2.2 Desktop 자동 새로고침
```javascript
// ParcelShipmentPage.jsx
useEffect(() => {
  // 30초마다 자동 새로고침
  const interval = setInterval(() => {
    loadParcelJobs();
  }, 30000);

  return () => clearInterval(interval);
}, []);
```

#### 2.3 배송 상태 표시 개선
- 배송 단계별 색상 표시:
  - "접수완료" → 파란색
  - "집화완료" → 주황색
  - "배송중" → 보라색
  - "배송완료" → 초록색

**예상 소요:** 작은 규모 (1일)

---

### 3순위: 예외 처리 강화

**현재 상태:**
- CJ API 호출 실패 시 단순 에러만 표시
- 네트워크 장애, API 타임아웃 시 재시도 없음

**필요 작업:**

#### 3.1 재시도 로직
```typescript
// services/core-api/src/modules/cj/cj.service.ts
async callCjApiWithRetry(endpoint, data, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await this.callCjApi(endpoint, data);
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      // 지수 백오프: 1초, 2초, 4초 대기
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
}
```

#### 3.2 주소 정제 실패 시 수동 입력
```javascript
// ParcelShipmentPage.jsx
async function handleAddressCleanFail(originalAddress) {
  // 모달 띄워서 사용자가 직접 주소 입력
  const manualAddress = await showAddressInputModal(originalAddress);
  return manualAddress;
}
```

#### 3.3 운송장 발급 실패 시 임시 저장
```typescript
// JobParcel에 failReason 필드 추가
model JobParcel {
  // ...
  waybillFailReason String?  // 발급 실패 사유
  lastRetryAt       DateTime? // 마지막 재시도 시각
}

// 나중에 일괄 재시도
async retryFailedWaybills() {
  const failed = await this.prisma.jobParcel.findMany({
    where: {
      waybillNo: null,
      waybillFailReason: { not: null },
    },
  });

  for (const job of failed) {
    // 재시도 로직
  }
}
```

**예상 소요:** 중간 규모 (2일)

---

### 4순위: UI/UX 개선

#### 4.1 일괄 처리 기능
- 여러 작지 동시 선택 (체크박스)
- 일괄 CJ 예약 버튼
- 일괄 운송장 출력 버튼

#### 4.2 검색 & 필터
```javascript
// ParcelShipmentPage.jsx
const [searchQuery, setSearchQuery] = useState("");
const [statusFilter, setStatusFilter] = useState("all"); // all | 진행중 | 완료

const filteredJobs = parcelJobs.filter((j) => {
  // 검색어 필터
  if (searchQuery) {
    const match =
      j.parcel?.orderNo?.includes(searchQuery) ||
      j.parcel?.recipientName?.includes(searchQuery);
    if (!match) return false;
  }

  // 상태 필터
  if (statusFilter === "진행중" && j.status === "completed") return false;
  if (statusFilter === "완료" && j.status !== "completed") return false;

  return true;
});
```

#### 4.3 통계 대시보드
```javascript
// 페이지 상단에 통계 카드
const stats = {
  todayTotal: parcelJobs.filter(j => isToday(j.createdAt)).length,
  todayCompleted: parcelJobs.filter(j => isToday(j.createdAt) && j.status === 'completed').length,
  cjReserved: parcelJobs.filter(j => j.parcel?.waybillNo).length,
};

<div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
  <StatCard label="오늘 작지" value={stats.todayTotal} />
  <StatCard label="완료" value={stats.todayCompleted} />
  <StatCard label="예약 접수" value={stats.cjReserved} />
</div>
```

**예상 소요:** 각각 작은~중간 규모 (1-2일)

---

## 🎯 추천 작업 순서

### Week 1: 운송장 프린터 연동 (필수)
- Day 1: 바코드 생성 + 레이아웃 설계
- Day 2: 프린터 API 연동
- Day 3: 테스트 및 개인정보 마스킹

### Week 2: 자동화 + 안정성
- Day 1: 배송 추적 자동화 (스케줄러)
- Day 2-3: 예외 처리 강화 (재시도, 임시 저장)

### Week 3: UX 개선
- Day 1: 일괄 처리 기능
- Day 2: 검색 & 필터
- Day 3: 통계 대시보드

---

## 📚 참고 문서

### 프로젝트 내 문서
- `CLAUDE.md` - 프로젝트 기본 규칙
- `PARCEL_INTEGRATION_COMPLETE.md` - CJ API 연동 완료 보고서
- `JOB_SEPARATION_GUIDE.md` - Job 분리 구조 가이드
- `INVENTORY_TX_INTEGRATION.md` - InventoryTx 연동 완료 보고서
- `PARCEL_PAGE_REDESIGN.md` - 택배 페이지 재설계 완료 보고서

### CJ API 문서
- CJ Standard API V3.9.3 Guide
- 운송장 출력 규격 (123mm×100mm)
- 바코드 형식: CODE128

---

## ⚠️ 주의사항

### 1. 로컬 환경 기준
- 현재 모든 작업은 **로컬 개발 환경** 기준
- 운영 배포 시 추가 작업 필요:
  - 환경 변수 설정 (CJ API 토큰)
  - DB 마이그레이션
  - 프린터 드라이버 설치

### 2. CJ API 토큰 관리
- 현재 하드코딩된 토큰: `f97a479c-9f3f-4ae3-8e4e-16fe3ac03fe2`
- 운영 시 환경 변수로 관리 필요 (`process.env.CJ_API_TOKEN`)

### 3. 데이터 정합성
- 모든 재고 변동은 Prisma 트랜잭션 내에서 실행
- InventoryTx 자동 기록 확인 필수
- UNDO 후 재스캔 시 수량 꼬임 주의

### 4. 프린터 연동 시 테스트
- 실제 프린터 없이 PDF 출력으로 먼저 테스트
- 용지 크기, 여백, 바코드 크기 정확히 확인
- 개인정보 마스킹 철저히 검증

---

## 🔧 트러블슈팅

### 서버 포트 충돌
```bash
# 에러: Error: listen EADDRINUSE: address already in use :::3000
# 해결: 기존 프로세스 종료
taskkill //F //PID <PID>
npm run start:dev
```

### Prisma 스키마 변경 시
```bash
cd services/core-api
npx prisma migrate dev --name add_new_field
npx prisma generate
```

### Desktop 빌드 에러
```bash
cd apps/wms-desktop
rm -rf node_modules
npm install
npm run dev
```

---

**다음 작업 시작 시:** 이 문서를 먼저 읽고 1순위(운송장 프린터 연동)부터 진행하는 것을 추천합니다.
