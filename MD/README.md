# Store Notice App

매장 공지 및 업무 관리 앱 (Expo + React Native + Firebase)

## 기술 스택

- **Frontend**: Expo + React Native + TypeScript
- **Backend**: Firebase (Firestore, Auth, Storage)
- **Routing**: Expo Router (file-based routing)

## 프로젝트 구조

```
app/
├── index.tsx              # 앱 진입점 (역할별 라우팅)
├── auth/                  # 로그인/회원가입
├── admin/                 # 관리자 전용 페이지
│   ├── index.tsx          # 관리자 대시보드
│   ├── notices/           # 공지 작성/목록
│   ├── board/             # 게시판
│   ├── approvals/         # 결재
│   ├── inventory/         # 매장재고
│   ├── sales/             # 매출등록
│   └── settings/          # 설정 (승인대기, 회사정보, 부서/매장/회원 관리)
├── staff/                 # 직원 전용 페이지
│   ├── index.tsx          # 직원 대시보드
│   ├── notices/           # 받은 공지 목록/상세
│   ├── board/             # 게시판 (글 작성, 본인 글 삭제 가능)
│   ├── inventory/         # 매장재고
│   ├── sales/             # 매출등록
│   └── settings/          # 설정 (회사정보만, 읽기 전용)
└── message/               # (Legacy) 기존 직원용 공지 페이지
```

## 역할별 기능

| 기능 | 관리자 (OWNER/MANAGER) | 직원 (SALES/STORE/ETC) |
|------|------------------------|------------------------|
| 공지 작성 | O | X |
| 공지 목록 | 전체 | 받은 공지만 |
| 게시판 | O (모든 글 삭제) | O (본인 글만 삭제) |
| 결재 | O | X |
| 매장재고 | O | O |
| 매출등록 | O | O |
| 설정 | 전체 | 회사정보만 (읽기 전용) |

## 로컬 개발 환경 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 앱 실행

```bash
npx expo start
```

### 3. 실행 옵션

- **Android**: `a` 키 또는 Expo Go 앱에서 QR 스캔
- **iOS**: `i` 키 또는 Expo Go 앱에서 QR 스캔
- **Web**: `w` 키

## Firebase 설정

`firebaseConfig.js` 파일에 Firebase 프로젝트 설정 필요

## Firebase 데이터 스키마

### users 컬렉션
```typescript
{
  uid: string,
  email: string,
  name: string,
  phone?: string,
  companyId: string,
  role: "OWNER" | "MANAGER" | "SALES" | "STORE" | "ETC",
  status: "PENDING" | "ACTIVE" | "REJECTED" | "DISABLED",
  storeId?: string,      // 소속 매장 (매장명)
  department?: string,
  createdAt: Timestamp
}
```

### companies 컬렉션
```typescript
{
  name: string,
  inviteCode: string,    // 직원 초대 코드
  createdAt: Timestamp
}
```

### stores 컬렉션
```typescript
{
  companyId: string,
  code: string,          // 매장코드 (WMS 연동 키) - 필수
  name: string,          // 매장명 - 필수
  phone?: string,        // 전화번호
  active: boolean,
  createdAt: Timestamp
}
```

### notices 컬렉션
```typescript
{
  companyId: string,
  title: string,
  content: string,
  authorId: string,
  authorName: string,
  targetType: "ALL" | "DEPARTMENT" | "STORE" | "INDIVIDUAL",
  targetIds: string[],
  attachments?: Array<{ name: string, url: string }>,
  createdAt: Timestamp
}
```

### receipts 컬렉션
```typescript
{
  noticeId: string,
  userId: string,
  confirmedAt?: Timestamp
}
```

### posts 컬렉션 (게시판)
```typescript
{
  companyId: string,
  title: string,
  content: string,
  authorId: string,
  authorName: string,
  attachments?: Array<{ name: string, url: string }>,
  createdAt: Timestamp
}
```

## WMS API 연동

### 아키텍처

Store Notice App은 **하이브리드 백엔드 구조**를 사용합니다:

```
┌─────────────────────────────────────────────────────────┐
│                   Store Notice App                       │
│                 (Expo + React Native)                    │
└─────────────────┬───────────────────────┬───────────────┘
                  │                       │
                  ▼                       ▼
    ┌─────────────────────┐   ┌─────────────────────────┐
    │      Firebase       │   │        WMS API          │
    │  (Firestore/Auth)   │   │ (https://backend.dheska │
    │                     │   │        .com)            │
    └─────────────────────┘   └─────────────────────────┘
           │                             │
           │                             ▼
           │                  ┌─────────────────────────┐
           │                  │      PostgreSQL         │
           │                  │    (AWS Lightsail)      │
           │                  └─────────────────────────┘
           ▼
    ┌─────────────────────┐
    │  Firebase Firestore │
    └─────────────────────┘
```

### API 엔드포인트

| 환경 | URL |
|------|-----|
| Production | `https://backend.dheska.com` |
| Development | `http://localhost:3000` |

### 데이터 소스 매핑

| 기능 | 데이터 소스 | 비고 |
|------|------------|------|
| 사용자 인증 | Firebase Auth | 로그인/회원가입 |
| 사용자 정보 | Firebase Firestore | users 컬렉션 |
| 회사 정보 | Firebase Firestore | companies 컬렉션 |
| 공지사항 | Firebase Firestore | notices, receipts 컬렉션 |
| 게시판 | Firebase Firestore | posts 컬렉션 |
| 결재 | Firebase Firestore | approvals 컬렉션 |
| 매장 목록 | Firebase + WMS API | Firebase: 기본정보, WMS: 재고/매출 |
| 재고 관리 | WMS API | `/inventory?storeCode=XXX` |
| 매출 등록 | WMS API | `/sales` |
| SKU/상품 | WMS API | `/skus` |

### 매장코드 연동

Firebase의 `stores.code`와 WMS의 `stores.code`를 동일하게 관리하여 데이터 연동:

```
┌─────────────────────┐         ┌─────────────────────┐
│   Firebase stores   │         │    WMS stores       │
├─────────────────────┤         ├─────────────────────┤
│ code: "GN001"       │ ══════> │ code: "GN001"       │
│ name: "강남점"       │         │ name: "강남점"       │
│ phone: "02-..."     │         │ address: "..."      │
└─────────────────────┘         └─────────────────────┘
         │                               │
         │                               ▼
         │                      ┌─────────────────────┐
         │                      │ inventory, sales    │
         │                      │ (storeCode 기준)     │
         └──────────────────────┴─────────────────────┘
```

**사용 예시:**
```typescript
// 1. Firebase에서 매장 정보 조회
const storeDoc = await getDoc(doc(db, "stores", storeId));
const storeCode = storeDoc.data().code;  // "GN001"

// 2. WMS API에서 해당 매장 재고 조회
const inventory = await fetch(
  `${WMS_API}/inventory?storeCode=${storeCode}`
);
```

### API 호출 예시

```typescript
// lib/wmsApi.ts
const WMS_API_URL = "https://backend.dheska.com";

export async function getStores() {
  const res = await fetch(`${WMS_API_URL}/stores`);
  return res.json();
}

export async function getInventory(storeId: string) {
  const res = await fetch(`${WMS_API_URL}/inventory?storeId=${storeId}`);
  return res.json();
}

export async function createSale(data: SaleInput) {
  const res = await fetch(`${WMS_API_URL}/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}
```

### 빌드 참고사항

- **HTTPS**: WMS API는 HTTPS로 배포되어 있어 iOS ATS(App Transport Security) 및 Android 9+ 요구사항을 충족
- **CORS**: WMS API에서 모바일 앱 요청을 허용하도록 CORS 설정 필요
- **인증**: 필요시 Firebase Auth 토큰을 WMS API에 전달하여 인증 연동 가능

### 성능 최적화

하이브리드 백엔드 사용 시 성능 고려사항:

| 항목 | Firebase | WMS API (아시아 리전) |
|------|----------|----------------------|
| 예상 latency | ~50-100ms | ~30-80ms |
| 캐싱 | 자동 오프라인 캐시 | 직접 구현 필요 |

**권장 패턴:**
```typescript
// 병렬 호출로 대기시간 최소화
const [userData, inventory] = await Promise.all([
  getDoc(doc(db, "users", uid)),           // Firebase
  fetch(`${WMS_API}/inventory?storeCode=${code}`)  // WMS API
]);
```

**추가 최적화 (필요시):**
- React Query / TanStack Query: 캐싱 + 중복 요청 방지
- AsyncStorage 캐시: 오프라인 지원


# ESKA WMS

창고 관리 시스템 (Warehouse Management System)

## 프로젝트 구조

```
repo/wms/
├── apps/
│   └── wms-desktop/              # Electron 기반 데스크톱 앱
│       └── renderer/src/
│           ├── App.jsx
│           ├── pages/
│           │   ├── DashboardPage.jsx       # 대시보드 (작업현황)
│           │   ├── WarehouseInboundPage.jsx # 본사 입고
│           │   ├── StoreOutboundPage.jsx    # 매장 출고
│           │   ├── ParcelRequestPage.jsx    # 택배 요청 (Excel 업로드)
│           │   ├── ParcelShipmentPage.jsx   # 택배 발송 (CJ 연동)
│           │   ├── InventoryPage.jsx        # 재고 조회/조정
│           │   ├── SalesPage.jsx            # 매출 현황
│           │   └── SettingsPage.jsx         # 설정 (매장/SKU 관리)
│           ├── components/
│           └── lib/
├── services/
│   └── core-api/                 # NestJS 백엔드 API
│       └── src/modules/
│           ├── inventory/        # 재고 관리 (입고/출고/조정)
│           ├── jobs/             # 작업 관리 (Job/JobItem)
│           ├── imports/          # Excel 업로드 (택배/재고)
│           ├── exports/          # Excel 다운로드
│           ├── cj-api/           # CJ 대한통운 API 연동
│           ├── carriers/         # 택배사 어댑터
│           ├── stores/           # 매장 관리
│           ├── locations/        # 위치 관리
│           ├── sales/            # 매출 관리
│           └── health/           # 헬스체크
└── packages/
    └── shared-types/             # 공유 타입 정의
```

## 기술 스택

- **Desktop**: Electron + React (JSX)
- **Backend**: NestJS + Prisma + PostgreSQL
- **Shared**: TypeScript
- **외부 연동**: CJ 대한통운 API (택배 예약/송장 발행)

## 데이터 모델 (Prisma)

| 모델 | 설명 |
|------|------|
| Store | 매장 (본사/지점) |
| Location | 창고 위치 |
| Sku | 상품 (SKU/바코드) |
| Inventory | 재고 (SKU + Location) |
| InventoryTx | 재고 트랜잭션 (입고/출고/이동/조정) |
| Job | 작업 (입고/출고/반품/택배) |
| JobItem | 작업 상세 (SKU별 수량) |
| JobParcel | 택배 정보 (수령인/주소) |
| CjShipment | CJ 송장 정보 |
| CjToken | CJ API 토큰 |

## 로컬 개발 환경 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 데이터베이스 설정

```bash
cd services/core-api
cp .env.example .env  # .env 파일 생성 후 DB 정보 입력
npx prisma migrate dev
npx prisma db seed
```

### 3. 개발 서버 실행

#### 방법 1: 일괄 실행 (Windows)

```bash
start-dev.bat
```

- Core API (http://localhost:3000)
- Prisma Studio (http://localhost:5555)
- WMS Desktop (Electron)

#### 방법 2: 개별 실행

```bash
# Core API
cd services/core-api
npm run start:dev

# WMS Desktop
cd apps/wms-desktop
npm run dev

# Prisma Studio (선택사항)
cd services/core-api
npx prisma studio
```

## 주요 기능

### 입고/출고
- 바코드 스캔 기반 입고 (본사 창고)
- 바코드 스캔 기반 출고 (매장 배송)
- UNDO 기능 (직전/연속/전체 취소)
- 강제 출고 (재고 부족 시 0 유지)

### 택배 발송
- Excel 업로드 (택배 요청 일괄 등록)
- CJ 대한통운 API 연동 (송장 발행)
- 단포/합포 자동 분류
- 택배 라벨 출력

### 재고 관리
- 재고 현황 조회
- 수동 재고 조정 (사유 기록)
- 재고 이력 추적 (InventoryTx)

### 매출 관리
- 매장별 매출 현황
- Excel 업로드 (매출 데이터)

---

## 서버 배포 정보

### SSH 접속 정보

| 항목 | 값 |
|------|-----|
| 서버 | AWS Lightsail (ap-northeast-2) |
| IP | `13.125.126.15` |
| 도메인 | `backend.dheska.com` |
| 사용자 | `ubuntu` |
| SSH 키 | `~/.ssh/LightsailDefaultKey-ap-northeast-2.pem` |

### 배포 명령어

```bash
# SSH 접속
ssh -i ~/.ssh/LightsailDefaultKey-ap-northeast-2.pem ubuntu@13.125.126.15

# 또는 한 줄로 배포
ssh -i ~/.ssh/LightsailDefaultKey-ap-northeast-2.pem ubuntu@13.125.126.15 \
  "cd ~/wms/services/core-api && git pull && npm run build && pm2 restart all"
```

### PM2 관리

```bash
pm2 status          # 상태 확인
pm2 logs            # 로그 보기
pm2 restart all     # 재시작
```

---

## 2026-01-22 작업 내역

### 1. 매장 Excel 일괄 등록 기능

#### 백엔드 API
- **엔드포인트**: `POST /stores/bulk-upsert`
- **파일**: `services/core-api/src/modules/stores/stores.controller.ts`
- **서비스**: `services/core-api/src/modules/stores/stores.service.ts`

```typescript
// Request
POST /stores/bulk-upsert
{
  "items": [
    { "code": "1000", "name": "아이즈빌-부평점" },
    { "code": "6666", "name": "전주점" }
  ]
}

// Response
{
  "ok": true,
  "total": 28,
  "created": 26,
  "updated": 2,
  "skipped": 0,
  "error": 0,
  "results": [...]
}
```

#### 프론트엔드 (wms-desktop)
- **Excel 파서**: `apps/wms-desktop/renderer/src/workflows/_common/excel/parseStoreBulkUpsert.js`
- **UI**: `apps/wms-desktop/renderer/src/pages/SettingsPage.jsx` (매장 관리 섹션)

**Excel 형식:**
| 행 | 내용 |
|----|------|
| 1행 | 제목 (무시) |
| 2행 | 헤더: `매장코드`, `매장명` |
| 3행~ | 데이터 |

**지원 헤더명:**
- 매장코드: `매장코드`, `storeCode`, `code`, `매장`
- 매장명: `매장명`, `storeName`, `name`, `이름`

### 2. 매장 정보 연동 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│  설정 페이지 (SettingsPage.jsx)                                  │
│  - 매장 관리 → Excel 업로드 → POST /stores/bulk-upsert          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Store DB (PostgreSQL)                                          │
│  - id, code, name, isHq                                         │
│  - 예: { code: "1000", name: "아이즈빌-부평점" }                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  storeMap.js (프론트 캐시)                                       │
│  - loadStores() → GET /stores → 캐시 저장                       │
│  - getStoreIdByCode(code) → storeId 반환                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  대시보드 (DashboardPage.jsx) - 작지 생성                        │
│  - Excel 업로드 → storeCode 파싱                                 │
│  - jobs.api.create({ storeCode }) → storeId 자동 변환           │
│  - Job 생성 시 store 정보 연결                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Job 조회 시 store 정보 포함                                     │
│  {                                                              │
│    "id": "xxx",                                                 │
│    "storeId": "yyy",                                            │
│    "store": { "code": "1000", "name": "아이즈빌-부평점" }         │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
```

### 3. 재고 Excel 업로드 스키마

**엔드포인트**: `POST /inventory/bulk-set`

**필수 헤더:**
| 헤더 | 설명 |
|------|------|
| 매장코드 | 매장 코드 (storeCode) |
| 단품코드 | SKU 코드 (skuCode) |
| Location | 창고 위치 코드 |
| 수량 | 설정할 재고 수량 |

**선택 헤더:**
| 헤더 | 설명 |
|------|------|
| 메모 | 조정 사유 |

### 4. CJ API 엔드포인트

| 엔드포인트 | 설명 |
|------------|------|
| `POST /exports/cj/reservation/:jobId` | 택배 예약 접수 |
| `GET /exports/cj/waybill/:jobId` | 운송장 출력 데이터 |
| `GET /exports/cj/track/:waybillNo` | 배송 추적 |
| `GET /exports/cj/status/:jobId` | 예약 상태 확인 |

### 5. 주요 파일 경로

```
wms/
├── apps/wms-desktop/
│   ├── config.json                    # API 모드 설정 (dev/prod)
│   └── renderer/src/
│       ├── pages/
│       │   ├── SettingsPage.jsx       # 매장/Location/재고 관리
│       │   └── DashboardPage.jsx      # 작지 생성
│       └── workflows/
│           ├── _common/
│           │   ├── storeMap.js        # 매장 캐시 (API 연동)
│           │   ├── http.js            # HTTP 클라이언트
│           │   └── excel/
│           │       ├── parseStoreBulkUpsert.js    # 매장 Excel 파서
│           │       └── parseInventoryBulkSet.js   # 재고 Excel 파서
│           └── jobs/
│               └── jobs.api.js        # Job API (storeCode→storeId 변환)
│
└── services/core-api/src/modules/
    ├── stores/
    │   ├── stores.controller.ts       # POST /stores/bulk-upsert
    │   └── stores.service.ts          # bulkUpsert 로직
    ├── inventory/
    │   └── inventory.service.ts       # bulkSet 로직
    └── cj-api/
        └── cj-api.service.ts          # CJ 대한통운 API
```

### 6. wms-desktop config.json

```json
{
  "mode": "prod",  // "dev" = localhost:3000, "prod" = backend.dheska.com
  "api": {
    "dev": "http://localhost:3000",
    "prod": "https://backend.dheska.com"
  }
}
```

**로컬 테스트 시**: `"mode": "dev"` 로 변경 후 앱 재시작
