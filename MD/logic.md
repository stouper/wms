# WMS 택배 출고 로직 문서

> 작성일: 2026-01-25
> 최종 수정: 2026-01-25

---

## 1. 개요

Desktop WMS에서 택배 작업(OUTBOUND) 스캔 시 Inventory와 InventoryTx의 연결 구조 및 데이터 흐름을 문서화합니다.

---

## 2. Job 모델 구조

```prisma
model Job {
  id            String      @id @default(cuid())
  storeId       String      // 매장 FK (중요: 의미가 상황에 따라 다름)
  type          JobType     // INBOUND | OUTBOUND | RETURN | MOVE | ADJUST
  channel       String?     // "STORE" | "ONLINE" | "COUPANG" 등 (판매채널)
  status        String      // "open" | "picking" | "done" | "cancelled"

  // 택배 관련
  parentId      String?     // 배치(묶음) Job ID
  packType      String?     // "single" | "multi"
  sortOrder     Int         // 단포=1, 합포=2

  // 관계
  store         Store       @relation(fields: [storeId])
  items         JobItem[]   // 작업 상세 (SKU 목록)
  parcel        JobParcel?  // 택배 정보 (배송지)
  txs           InventoryTx[] // 거래 이력
}
```

### 2.1 Job.storeId의 의미 (문제!)

**현재 모호함:**

| 시나리오 | Job.channel | Job.storeId | 의미 |
|---------|-----------|-----------|------|
| 본사→매장 배송 | "STORE" | 목적지 매장 ID | 매장이 입고받음 |
| 고객 배송 (온라인) | "ONLINE" | ??? | 도착지는 고객 주소 (매장 아님) |
| 고객 배송 (쿠팡) | "COUPANG" | ??? | 도착지는 고객 주소 (매장 아님) |
| 매장→매장 이체 | "STORE" | 목적지 매장 ID | 매장이 입고받음 |

**결론:** `Job.channel`로 분기 필요 (현재 미구현)

---

## 3. 스캔 흐름: 상품 1개 스캔 시 DB 변화

### 3.1 입력 데이터

```javascript
// Desktop에서 택배 작업 스캔
POST /jobs/{jobId}/scan
{
  value: "8809346938476",      // 바코드
  qty: 1,
  locationCode: "WAREHOUSE",    // 선택사항
  force: false
}
```

### 3.2 처리 로직 (jobs.service.ts:480-800)

#### 단계 1: SKU 검색/생성
```
바코드(8809346938476) 입력
  ↓
Sku 테이블에서 찾기
  ├─ makerCode = "8809346938476" (숫자면 우선)
  └─ 없으면 자동 생성
```

#### 단계 2: JobItem 생성/확인
```
Job 내에서 이 SKU가 처음 스캔되는가?
  ├─ YES: JobItem 새로 생성
  │  └─ qtyPlanned: 0, qtyPicked: 0
  └─ NO: 기존 JobItem 사용
```

#### 단계 3: 출발지(Location) 결정
```
locationCode 입력됨?
  ├─ YES: 해당 location 사용
  └─ NO: 자동 선택
     ├─ 재고 있는 location 중 수량 큰 것 (최우선)
     └─ 없으면 "UNASSIGNED" fallback
```

#### 단계 4: 도착지(Location) 결정 - **중요: Job.channel 확인 필요**

**현재 코드 (문제 있음):**
```javascript
const destStoreId = job.storeId;
if (destStoreId) {
  // 매장의 FLOOR location 찾기/생성
  destLoc = await tx.location.findFirst({
    where: { storeId: destStoreId, code: 'FLOOR' }
  });
}
```

**문제:** ONLINE/COUPANG 채널도 `destStoreId`를 사용하면 안 됨
- 고객 배송은 매장이 도착지가 아님
- 택배사로 출고만 하고 끝

**수정안 필요:**
```javascript
// Job.channel에 따라 분기
if (job.channel === "STORE") {
  // 본사→매장: 매장 입고
  destStoreId = job.storeId;
  destLoc = FLOOR location;
} else if (job.channel === "ONLINE" || job.channel === "COUPANG") {
  // 고객 배송: 택배사 출고만, 매장 입고 없음
  destStoreId = null;
  destLoc = null;
}
```

---

## 4. 트랜잭션 내 데이터 생성

### 4.1 시나리오 A: 매장 배송 (Job.channel="STORE")

**예시:** 본사 창고(WAREHOUSE) → 부산점(STORE-BUSAN)

#### InventoryTx 2개 생성

**1️⃣ 출고 기록 (창고에서 상품 나감)**
```sql
INSERT INTO InventoryTx (
  type='out',
  qty=-1,
  skuId='SKU-123',
  locationId='WAREHOUSE',
  jobId='JOB-456',
  jobItemId='JOBITEM-789',
  isForced=false,
  createdAt=NOW()
);
```

**2️⃣ 입고 기록 (매장에 상품 들어옴)**
```sql
INSERT INTO InventoryTx (
  type='in',
  qty=+1,
  skuId='SKU-123',
  locationId='STORE-BUSAN/FLOOR',
  jobId='JOB-456',
  jobItemId='JOBITEM-789',
  isForced=false,
  note='창고출고→매장입고 (from: WAREHOUSE)',
  createdAt=NOW()
);
```

#### Inventory 2개 갱신

**창고 재고 감소:**
```sql
UPDATE Inventory
SET qty = qty - 1
WHERE skuId='SKU-123' AND locationId='WAREHOUSE';
-- 10 → 9
```

**매장 재고 증가:**
```sql
UPDATE Inventory
SET qty = qty + 1
WHERE skuId='SKU-123' AND locationId='STORE-BUSAN/FLOOR';
-- 5 → 6
```

### 4.2 시나리오 B: 고객 배송 (Job.channel="ONLINE" 또는 "COUPANG")

**예시:** 본사 창고(WAREHOUSE) → 고객 주소 (택배사 배송)

#### InventoryTx 1개만 생성

**✋ 출고 기록 (창고에서 상품 나감)**
```sql
INSERT INTO InventoryTx (
  type='out',
  qty=-1,
  skuId='SKU-123',
  locationId='WAREHOUSE',
  jobId='JOB-456',
  jobItemId='JOBITEM-789',
  isForced=false,
  createdAt=NOW()
);
```

**❌ 입고 기록 없음** (도착지가 매장이 아니므로)

#### Inventory 1개만 갱신

**창고 재고 감소:**
```sql
UPDATE Inventory
SET qty = qty - 1
WHERE skuId='SKU-123' AND locationId='WAREHOUSE';
-- 10 → 9
```

**매장 재고 변화 없음** (고객이 받는 거라)

---

## 5. JobParcel 관계

```prisma
model JobParcel {
  id           String  @id @default(cuid())
  jobId        String  @unique

  recipientName String  // 받는 사람
  phone         String  // 연락처
  addr1         String  // 배송 주소 1
  addr2         String? // 배송 주소 2
  zip           String? // 우편번호
  memo          String? // 배송 메모

  carrierCode   String? // "CJ" 등 택배사
  waybillNo     String? // 운송장 번호

  createdAt     DateTime
  updatedAt     DateTime

  job Job @relation(fields: [jobId])
}
```

### 5.1 특징

- **locationId 없음** ✋
- 배송지 주소만 저장 (고객 배송) 또는 매장 주소 참고용
- 택배 정보 (운송장번호, 택배사) 저장
- 1:1 관계 (1개 Job = 1개 JobParcel)

---

## 6. 현재 코드의 문제점 및 개선안

### 문제 1: Job.channel 미반영

**현재 코드:**
```typescript
// jobs.service.ts:504
const destStoreId = job.storeId;

// 항상 destLoc 생성 시도
if (destStoreId) {
  destLoc = await tx.location.findFirst({
    where: { storeId: destStoreId, code: 'FLOOR' }
  });
}
```

**문제:**
- ONLINE/COUPANG 채널도 `destStoreId`가 있으면 매장 입고 발생
- 고객 배송이면 `destStoreId`는 본사 창고일 텐데도 처리 안 함

**개선안:**
```typescript
let destLoc = null;

// Job.channel에 따라 도착지 결정
if (job.channel === "STORE" || job.channel === null) {
  // 점포 배송: 매장 입고
  const destStoreId = job.storeId;
  if (destStoreId) {
    destLoc = await tx.location.findFirst({
      where: { storeId: destStoreId, code: 'FLOOR' }
    });
  }
} else if (job.channel === "ONLINE" || job.channel === "COUPANG") {
  // 택배 배송: 출고만, 입고 없음
  destLoc = null;
}

// 이후 로직은 destLoc이 null이면 in 트랜잭션 생성 스킵
if (destLoc) {
  // in 트랜잭션 생성
}
```

### 문제 2: Job 모델의 storeId 의미 불명확

**개선안 1 (DB 스키마 수정):**
```prisma
model Job {
  // 현재
  storeId String  // 출발지? 도착지?

  // 개선안
  sourceStoreId  String?  // 출발지 (창고 매장)
  destStoreId    String?  // 도착지 (매장 배송일 때만)
}
```

**개선안 2 (주석 명확화):**
```prisma
// channel="STORE"일 때: 도착지 매장
// channel="ONLINE"|"COUPANG"일 때: 사용 안 함 (JobParcel.addr1 참고)
storeId String
```

---

## 7. 예제 쿼리

### 7.1 특정 택배 작업의 모든 거래 조회

```sql
SELECT
  it.id,
  it.type,
  it.qty,
  s.sku,
  s.name,
  l.code as location_code,
  it.jobId,
  it.createdAt
FROM InventoryTx it
JOIN Sku s ON it.skuId = s.id
JOIN Location l ON it.locationId = l.id
WHERE it.jobId = 'JOB-456'
ORDER BY it.createdAt;
```

**결과 예시 (매장 배송):**
```
| type | qty | sku    | location_code      | createdAt |
|------|-----|--------|-------------------|-----------|
| out  | -1  | SKU123 | WAREHOUSE         | 10:00:00  |
| in   | +1  | SKU123 | STORE-BUSAN/FLOOR | 10:00:00  |
```

**결과 예시 (고객 배송):**
```
| type | qty | sku    | location_code | createdAt |
|------|-----|--------|---------------|-----------|
| out  | -1  | SKU123 | WAREHOUSE     | 10:00:00  |
```

### 7.2 매장별 현재 재고 조회

```sql
SELECT
  l.id,
  l.code,
  s.id,
  s.sku,
  s.name,
  inv.qty
FROM Inventory inv
JOIN Location l ON inv.locationId = l.id
JOIN Sku s ON inv.skuId = s.id
WHERE l.storeId = 'STORE-BUSAN'
  AND inv.qty > 0
ORDER BY s.sku;
```

---

## 8. UNDO 로직 (재스캔 방지)

### 출고 중 실수 → UNDO

```
스캔 결과: InventoryTx(out, qty=-1) 생성
  ↓
UNDO 버튼 클릭
  ↓
InventoryTx(out, undoneAt=NOW()) 마크
+ InventoryTx(in, qty=+1) 생성 (반대 거래)
  ↓
Inventory 복구
```

**구현 위치:** jobs.service.ts:undo() 메서드

---

## 9. 강제 출고 (Forced Outbound)

### 재고 부족 시 force=true로 처리

```javascript
POST /jobs/{jobId}/scan
{
  value: "8809346938476",
  qty: 10,
  force: true,
  forceReason: "고객 요청 급출"
}
```

### 처리 결과

1. **음수 재고 허용**
   ```
   WAREHOUSE: 5 → -5 (음수!)
   ```

2. **InventoryTx에 기록**
   ```
   {
     type: 'out',
     qty: -10,
     isForced: true,
     forcedReason: '고객 요청 급출'
   }
   ```

3. **내부 처리**
   - Inventory는 음수 유지
   - InventoryTx에 `isForced=true` 플래그
   - 재고조정(ADJUST)으로 나중에 정산

---

## 10. 체크리스트: 택배 출고 구현 검증

- [ ] Job.channel 필드가 제대로 설정되는가?
- [ ] STORE vs ONLINE 채널에서 다른 로직 적용되는가?
- [ ] 택배 배송(ONLINE) 시 매장 입고 InventoryTx 생성 안 되는가?
- [ ] JobParcel.recipientName, addr1 정상 저장되는가?
- [ ] 운송장번호(waybillNo) 정상 발급/저장되는가?
- [ ] UNDO 시 InventoryTx 정상 반전되는가?
- [ ] 강제출고(force=true) 시 음수 재고 정상 기록되는가?

---

**최종 결론:**

현재 WMS 택배 로직은 **Job.channel 구분이 미반영**되어 있습니다.

**수정 필요 사항:**
1. jobs.service.ts 의 scan() 메서드에서 `job.channel` 확인 분기 추가
2. STORE 채널: 매장 입고 (in/out 모두)
3. ONLINE/COUPANG 채널: 출고만 (out만)
4. 선택: Job 모델 storeId 분리 (sourceStoreId, destStoreId)
