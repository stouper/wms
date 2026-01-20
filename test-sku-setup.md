# 택배 작지 스캔 테스트 가이드

## 1단계: 엑셀 업로드 및 작지 생성

1. Desktop 앱 실행: `cd apps/wms-desktop && npm run dev`
2. F12 → Console 열기
3. 좌측 메뉴 → "택배 작업"
4. 엑셀 업로드 → `C:\repo\wms\온라인택배요청.xlsx`
5. "작지 생성" 클릭
6. 콘솔에서 자동 생성된 주문번호 확인: `AUTO-XXXXXXXX`

---

## 2단계: 생성된 작지 확인

**우측 상단 작지 목록에서:**
- 제목: `[택배] AUTO-XXXXXXXX`
- 상품 목록 확인 (JobItem)
- 각 상품의 SKU 코드 확인

**예시:**
```
상품 1: ORDER-AUTO-12345678-1 (수량: 1)
상품 2: ORDER-AUTO-12345678-2 (수량: 1)
```

---

## 3단계: SKU 및 재고 준비

### 옵션 A: Prisma Studio로 수동 생성

1. 브라우저에서 http://localhost:5555 접속
2. `Sku` 테이블 열기
3. "Add record" 클릭
4. 데이터 입력:
   ```
   sku: ORDER-AUTO-12345678-1
   makerCode: BARCODE-001
   name: 테스트상품1
   ```
5. Save
6. `Inventory` 테이블 열기
7. "Add record" 클릭
8. 데이터 입력:
   ```
   skuId: (방금 생성한 SKU의 ID 선택)
   locationId: (기존 Location의 ID 선택, 없으면 Location 먼저 생성)
   qty: 10
   ```
9. Save

### 옵션 B: API로 생성 (간편)

콘솔에서 실행:
```bash
# Location 생성 (이미 있으면 스킵)
curl -X POST http://localhost:3000/inventory/in \
  -H "Content-Type: application/json" \
  -d '{
    "skuCode": "ORDER-AUTO-12345678-1",
    "makerCode": "BARCODE-001",
    "name": "테스트상품1",
    "qty": 10,
    "locationCode": "A-01-01"
  }'
```

---

## 4단계: 스캔 테스트

1. Desktop 앱 → 택배 작업 페이지
2. 우측 상단에서 방금 생성한 작지 클릭
3. 하단 "바코드" 입력란에 입력:
   - `ORDER-AUTO-12345678-1` 또는
   - `BARCODE-001` (makerCode)
4. 수량: 1
5. Enter 또는 "스캔" 버튼 클릭

**예상 결과:**
- ✅ "스캔 성공" 토스트 메시지
- 작지의 qtyPicked 증가: 0 → 1
- 피킹 완료 시 (100%) 자동 CJ 예약 시도

---

## 5단계: 자동 CJ 예약 및 운송장 확인

**피킹 100% 완료 시:**
1. 자동으로 "피킹 완료, 자동으로 CJ 예약을 진행합니다..." 메시지
2. CJ API 호출 (POST /exports/cj/reservation/:jobId)
3. 성공 시: "CJ 예약 완료, 운송장번호: XXXX" 메시지
4. 운송장 모달 자동 표시

**CJ API 실패 시:**
- 실제 CJ API 연동이 안 되어 있으면 실패할 수 있음
- 이 경우 수동으로 "CJ 예약 접수" 버튼 클릭 (개발 중에는 정상)

---

## 문제 해결

### "SKU를 찾을 수 없습니다" 오류
→ SKU가 DB에 없음. 위 3단계로 SKU 생성

### "재고가 부족합니다" 오류
→ Inventory 테이블에 재고 추가 또는 "강제 출고" 체크

### "CJ 예약 실패" 오류
→ 정상 (실제 CJ API 연동 필요). 스캔 기능 자체는 정상 작동함

### 작지 목록에 아무것도 안 보임
→ parcel 필드 누락. 서버 재시작 후 다시 테스트

---

## 전체 성공 시나리오

```
1. 엑셀 업로드 ✅
2. 작지 생성 (AUTO-XXXXXXXX) ✅
3. 작지 선택 ✅
4. SKU 스캔 (BARCODE-001) ✅
5. qtyPicked 증가 ✅
6. 피킹 100% 완료 ✅
7. 자동 CJ 예약 시도 ✅
8. 운송장 모달 표시 ✅
```

---

## 현재 상태

- 서버: ✅ 실행 중 (PID 20948)
- Prisma Studio: ✅ 실행 중 (http://localhost:5555)
- Desktop 앱: 직접 실행 필요
- 주문번호 자동 생성: ✅ 구현 완료
- parcel 필드 포함: ✅ 구현 완료
