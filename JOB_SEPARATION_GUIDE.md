# Job 분리 구조 가이드

## 작성일: 2026-01-20

---

## ✅ 올바른 이해

**맞습니다!**

1. **대시보드 작지**: 일반 입고/출고 전용 → WarehouseInboundPage, StoreOutboundPage에서만 연결
2. **택배 작지**: 택배 전용 → ParcelShipmentPage에서만 연결

---

## 구조 설명

### 1. 대시보드 작지 생성

**Excel 양식:**
- 일반 출고/반품 양식 (`작업지시서.xlsx`)

**파서:**
- `parseJobFileToRows()` (parseStoreOutbound.js)

**Job 생성:**
```javascript
{
  type: "OUTBOUND" 또는 "RETURN",
  parcel: null,  // ← 택배 정보 없음
  storeCode: "4000",
  title: "[출고] 4000"
}
```

**사용 페이지:**
- **StoreOutboundPage** (매장 출고)
  - 필터: `type === "OUTBOUND" && !parcel` ✅
  - 일반 매장 출고 작지만 표시

- **WarehouseInboundPage** (창고 입고)
  - 필터: `type === "RETURN"`
  - 반품 입고 작지만 표시

---

### 2. 택배 작지 생성

**Excel 양식:**
- 택배요청 양식 (`온라인 주문서 양식.xlsx`)

**파서:**
- `parseParcelRequestFileToRows()` (parseParcelRequest.js)

**Job 생성:**
```javascript
{
  type: "OUTBOUND",
  parcel: {  // ← 택배 정보 있음!
    orderNo: "ORDER-123",
    recipientName: "홍길동",
    phone: "010-1234-5678",
    addr1: "서울시 강남구",
    carrierCode: "CJ"
  },
  storeCode: "ONLINE",
  title: "[택배] ORDER-123"
}
```

**사용 페이지:**
- **ParcelShipmentPage** (택배 작업)
  - 필터: `parcel 있음` ✅
  - 택배 작지만 표시

---

## 분리 로직 (핵심)

### DB 레벨
모든 Job은 **같은 Job 테이블**에 저장됨
- 일반 작지: `parcel = null`
- 택배 작지: `parcel 존재`

### 페이지 레벨 (필터링)

```javascript
// StoreOutboundPage (일반 매장 출고)
const list = jobs.filter((j) => {
  return j.type === 'OUTBOUND' && !j.parcel;  // 택배 제외
});

// ParcelShipmentPage (택배 작업)
const parcelJobs = jobs.filter((j) => {
  return j.parcel;  // 택배만
});

// WarehouseInboundPage (창고 입고)
const inboundJobs = jobs.filter((j) => {
  return j.type === 'RETURN';  // 반품만
});
```

---

## 데이터 흐름

### 일반 출고 작지

```
대시보드
  ↓ Excel 업로드 (작업지시서.xlsx)
  ↓ parseJobFileToRows()
  ↓
Job 생성 (type=OUTBOUND, parcel=null)
  ↓
StoreOutboundPage
  ↓ 필터: type=OUTBOUND && !parcel
  ↓
일반 매장 출고 작업
```

### 택배 작지

```
택배 작업 페이지
  ↓ Excel 업로드 (온라인 주문서 양식.xlsx)
  ↓ parseParcelRequestFileToRows()
  ↓
Job 생성 (type=OUTBOUND, parcel=있음)
JobParcel 생성
  ↓
ParcelShipmentPage
  ↓ 필터: parcel 있음
  ↓
택배 피킹 작업
  ↓
CJ 예약 접수
  ↓
운송장 출력
```

---

## 핵심 차이점

| 구분 | 대시보드 작지 | 택배 작지 |
|------|--------------|-----------|
| **Excel 양식** | 작업지시서.xlsx | 온라인 주문서 양식.xlsx |
| **파서** | parseJobFileToRows | parseParcelRequestFileToRows |
| **Job.type** | OUTBOUND/RETURN | OUTBOUND |
| **JobParcel** | ❌ 없음 | ✅ 있음 |
| **표시 페이지** | StoreOutboundPage<br/>WarehouseInboundPage | ParcelShipmentPage |
| **필터 조건** | `!parcel` | `parcel 있음` |
| **용도** | 일반 입고/출고 | 택배 전용 |
| **CJ 연동** | ❌ 없음 | ✅ 있음 |

---

## 왜 DB는 같은 테이블인가?

**장점:**
1. **Job 관리 통일**: 모든 작업이 Job 테이블에서 관리됨
2. **API 재사용**: 같은 Jobs API 사용
3. **트랜잭션 일관성**: 재고 차감 로직 공통
4. **이력 관리**: 모든 작업 이력이 한곳에 저장
5. **확장성**: 나중에 다른 배송사 추가 시에도 parcel 구조 재사용

**분리 방법:**
- `parcel` 필드 유무로 구분
- 각 페이지에서 필터링

**예:**
```sql
-- 일반 출고
SELECT * FROM Job
WHERE type = 'OUTBOUND' AND parcel IS NULL;

-- 택배
SELECT * FROM Job
WHERE parcel IS NOT NULL;
```

---

## 실무 시나리오

### 시나리오 1: 일반 매장 출고
1. 관리자가 대시보드에서 `작업지시서.xlsx` 업로드
2. "4000" 매장 출고 작지 10개 생성 (parcel 없음)
3. 작업자가 **StoreOutboundPage**에서 확인
4. 바코드 스캔하며 피킹
5. 완료

### 시나리오 2: 택배 출고
1. 관리자가 **택배 작업 페이지**에서 `온라인 주문서 양식.xlsx` 업로드
2. 택배 작지 17개 생성 (parcel 있음)
3. 작업자가 **ParcelShipmentPage**에서 확인 (같은 페이지!)
4. 바코드 스캔하며 피킹
5. "CJ 예약 접수" 버튼 클릭
6. 운송장 출력
7. 완료

### 시나리오 3: 혼재 상황
- 대시보드에서 일반 출고 작지 생성 → StoreOutboundPage에만 표시
- 택배 페이지에서 택배 작지 생성 → ParcelShipmentPage에만 표시
- **서로 섞이지 않음!** ✅

---

## 코드 확인 포인트

### StoreOutboundPage.jsx (line 240-244)
```javascript
// ✅ 일반 매장 출고만 표시
const list = normalized.filter((j) => {
  return j.type === 'OUTBOUND' && !j.parcel;  // 택배 제외!
});
```

### ParcelShipmentPage.jsx (line 101-102)
```javascript
// ✅ 택배 작지만 표시
const parcelJobs = (res.rows || []).filter((j) => j.parcel);
```

### parcelRequest.workflow.js (line 48-64)
```javascript
// ✅ 택배 Job 생성 시 parcel 필수
const job = await jobsApi.create({
  type: "OUTBOUND",
  title: `[택배] ${orderNo}`,
});

await http.post(`/jobs/${jobId}/parcels/upsert`, {
  orderNo: first.orderNo,
  recipientName: first.receiverName,
  phone: first.phone,
  // ... 택배 정보
});
```

---

## 정리

```
┌─────────────────────────────────────────┐
│           DB (Job Table)                │
├─────────────────────────────────────────┤
│  일반 작지 (parcel = null)              │
│  - type: OUTBOUND/RETURN                │
│  - storeCode: 4000, 2525, ...          │
│                                         │
│  택배 작지 (parcel = 있음)              │
│  - type: OUTBOUND                       │
│  - storeCode: ONLINE                    │
│  - parcel: { recipientName, phone, ... }│
└─────────────────────────────────────────┘
            ↓ 필터링 분기
    ┌───────┴───────┐
    ↓               ↓
┌─────────┐   ┌──────────────┐
│ 일반출고│   │   택배작업   │
│  페이지 │   │    페이지    │
├─────────┤   ├──────────────┤
│ !parcel │   │ parcel 있음  │
└─────────┘   └──────────────┘
```

**결론: 완벽하게 분리되어 있습니다!** ✅
