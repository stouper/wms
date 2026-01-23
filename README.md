# ESKA WMS & Store Notice App - 통합 문서

> 최종 업데이트: 2026-01-24

---

## 📋 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [전체 프로젝트 구조](#2-전체-프로젝트-구조)
3. [WMS (창고관리시스템)](#3-wms-창고관리시스템)
4. [Store Notice App (매장 공지 앱)](#4-store-notice-app-매장-공지-앱)
5. [CJ 택배 API 연동](#5-cj-택배-api-연동)
6. [Claude Code 작업 규칙](#6-claude-code-작업-규칙)
7. [작업 이력](#7-작업-이력)

---

## 1. 프로젝트 개요

### 1.1 ESKA WMS (Warehouse Management System)
창고 관리 시스템 - 바코드 스캔 기반 입출고, 재고 관리, 택배 발송

### 1.2 Store Notice App
매장 공지 및 업무 관리 모바일 앱 (Multi-tenant SaaS)

---

## 2. 전체 프로젝트 구조

```
C:\repo\wms/
├── apps/
│   ├── wms-desktop/              # Electron 기반 데스크톱 앱
│   └── store-notice-app/         # Expo + React Native 모바일 앱
├── services/
│   └── core-api/                 # NestJS 백엔드 API
├── packages/
│   └── shared-types/             # 공유 타입 정의
└── md/                           # 문서 모음
```

---

## 3. WMS (창고관리시스템)

### 3.1 기술 스택

| 구성요소 | 기술 |
|----------|------|
| Desktop | Electron + React (JSX) |
| Backend | NestJS + Prisma + PostgreSQL |
| 외부 연동 | CJ 대한통운 API |

### 3.2 주요 기능

#### 입고/출고
- 바코드 스캔 기반 입고 (본사 창고)
- 바코드 스캔 기반 출고 (매장 배송)
- UNDO 기능 (직전/연속/전체 취소)
- 강제 출고 (재고 부족 시 0 유지)

#### 택배 발송
- Excel 업로드 (택배 요청 일괄 등록)
- CJ 대한통운 API 연동 (송장 발행)
- 단포/합포 자동 분류
- 택배 라벨 출력

#### 재고 관리
- 재고 현황 조회
- 수동 재고 조정 (사유 기록)
- 재고 이력 추적 (InventoryTx)

#### 매출 관리
- 매장별 매출 현황
- Excel 업로드 (매출 데이터)

### 3.3 데이터 모델 (Prisma)

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

### 3.4 로컬 개발 환경 실행

#### 1단계: 의존성 설치
```bash
npm install
```

#### 2단계: 데이터베이스 설정
```bash
cd services/core-api
cp .env.example .env  # .env 파일 생성 후 DB 정보 입력
npx prisma migrate dev
npx prisma db seed
```

#### 3단계: 개발 서버 실행

**방법 1: 일괄 실행 (Windows)**
```bash
start-dev.bat
```

- Core API (http://localhost:3000)
- Prisma Studio (http://localhost:5555)
- WMS Desktop (Electron)

**방법 2: 개별 실행**
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

### 3.5 서버 배포 정보

#### SSH 접속 정보

| 항목 | 값 |
|------|-----|
| 서버 | AWS Lightsail (ap-northeast-2) |
| IP | `13.125.126.15` |
| 도메인 | `backend.dheska.com` |
| 사용자 | `ubuntu` |
| SSH 키 | `~/.ssh/LightsailDefaultKey-ap-northeast-2.pem` |

#### 배포 명령어
```bash
# SSH 접속
ssh -i ~/.ssh/LightsailDefaultKey-ap-northeast-2.pem ubuntu@13.125.126.15

# 한 줄로 배포
ssh -i ~/.ssh/LightsailDefaultKey-ap-northeast-2.pem ubuntu@13.125.126.15 \
  "cd ~/wms/services/core-api && git pull && npm run build && pm2 restart all"
```

#### PM2 관리
```bash
pm2 status          # 상태 확인
pm2 logs            # 로그 보기
pm2 restart all     # 재시작
```

### 3.6 주요 파일 경로

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

### 3.7 wms-desktop config.json

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

---

## 4. Store Notice App (매장 공지 앱)

### 4.1 기술 스택

| 구성요소 | 기술 |
|----------|------|
| Frontend | Expo + React Native + TypeScript |
| Backend | Firebase (Firestore, Auth, Storage, Functions) |
| Routing | Expo Router (file-based routing) |
| Push | Expo Notifications |

### 4.2 프로젝트 구조

```
apps/store-notice-app/
├── app/                    # 화면/페이지 (Expo Router)
│   ├── index.tsx          # 앱 진입점 (역할별 라우팅)
│   ├── auth/              # 로그인/회원가입
│   ├── admin/             # 관리자 전용 페이지
│   │   ├── index.tsx      # 관리자 대시보드
│   │   ├── notices/       # 공지 작성/목록
│   │   ├── board/         # 게시판
│   │   ├── approvals/     # 결재
│   │   ├── inventory/     # 매장재고
│   │   ├── sales/         # 매출등록
│   │   └── settings/      # 설정 (승인대기, 회사정보, 부서/매장/회원 관리)
│   └── staff/             # 직원 전용 페이지
│       ├── index.tsx      # 직원 대시보드
│       ├── notices/       # 받은 공지 목록/상세
│       ├── board/         # 게시판 (글 작성, 본인 글 삭제 가능)
│       ├── inventory/     # 매장재고
│       ├── sales/         # 매출등록
│       └── settings/      # 설정 (회사정보만, 읽기 전용)
├── components/            # 재사용 컴포넌트
│   └── ui/
├── lib/                   # 유틸리티 함수
│   ├── noticeTargets.ts   # 타입 정의
│   ├── firestoreMessage.ts # 메시지 작성/조회
│   ├── uploadFile.ts      # Firebase Storage 업로드
│   └── wmsApi.ts          # WMS API 호출
├── functions/             # Firebase Cloud Functions
│   └── src/
│       ├── index.ts       # Callable/Trigger 함수
│       └── migrate.ts     # 마이그레이션 스크립트
├── firebaseConfig.js      # Firebase 설정
├── app.json              # Expo 앱 설정
├── eas.json              # EAS Build 설정
├── firestore.rules       # Firestore 보안 규칙
└── storage.rules         # Storage 보안 규칙
```

### 4.3 Multi-Tenant 구조

#### 역할별 기능

| 기능 | 관리자 (OWNER/MANAGER) | 직원 (SALES/STORE/ETC) |
|------|------------------------|------------------------|
| 공지 작성 | O | X |
| 공지 목록 | 전체 | 받은 공지만 |
| 게시판 | O (모든 글 삭제) | O (본인 글만 삭제) |
| 결재 | O | X |
| 매장재고 | O | O |
| 매출등록 | O | O |
| 설정 | 전체 | 회사정보만 (읽기 전용) |

#### Firebase 데이터 스키마

**companies 컬렉션**
```typescript
{
  id: string,
  name: string,
  inviteCode: string,    // 직원 초대 코드 (8자리)
  createdAt: Timestamp
}
```

**users 컬렉션**
```typescript
{
  uid: string,
  email: string,
  name: string,
  phone?: string,
  companyId: string,     // 회사 ID (필수)
  role: "OWNER" | "MANAGER" | "SALES" | "STORE" | "ETC",
  status: "PENDING" | "ACTIVE" | "REJECTED" | "DISABLED",
  storeId?: string,      // 소속 매장 (매장명)
  department?: string,
  createdAt: Timestamp
}
```

**stores 컬렉션**
```typescript
{
  companyId: string,
  code: string,          // 매장코드 (WMS 연동 키) - 필수
  name: string,          // 매장명 - 필수
  phone?: string,
  active: boolean,
  createdAt: Timestamp
}
```

**notices 컬렉션**
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

**receipts 컬렉션**
```typescript
{
  noticeId: string,
  userId: string,
  companyId: string,     // 회사 ID (필수)
  confirmedAt?: Timestamp
}
```

#### Cloud Functions

| 함수 | 역할 |
|------|------|
| **createCompany** | 회사 생성 (생성자=OWNER) |
| **joinCompanyByInvite** | 초대 코드로 가입 (status=PENDING) |
| **approveUser** | 직원 승인/거부 |
| **dispatchNoticeFast** | 공지 즉시 발송 |
| **onMessageCreated** | 메시지 생성 → receipts 생성 + 푸시 발송 |
| **remindUnread** | 미확인 공지 재알림 |

### 4.4 WMS API 연동

#### 아키텍처

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

#### API 엔드포인트

| 환경 | URL |
|------|-----|
| Production | `https://backend.dheska.com` |
| Development | `http://localhost:3000` |

#### 데이터 소스 매핑

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

#### 매장코드 연동

Firebase의 `stores.code`와 WMS의 `stores.code`를 동일하게 관리:

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

### 4.5 개발 환경 실행

#### 로컬 개발
```bash
# 의존성 설치
cd apps/store-notice-app
npm install

# 앱 실행
npx expo start

# 실행 옵션
# - Android: `a` 키 또는 Expo Go 앱에서 QR 스캔
# - iOS: `i` 키 또는 Expo Go 앱에서 QR 스캔
# - Web: `w` 키
```

#### Development Build vs Preview Build

| 항목 | Development Build (개발용) | Preview Build (배포용) |
|------|------------------------|---------------|
| 사용 목적 | 개발 | 배포/테스트 |
| expo start | ✅ 필요 | ❌ 불필요 |
| 코드 수정 반영 | 즉시 (몇 초) | 다시 빌드 (15-20분) |
| 빌드 명령어 | `eas build -p android --profile development` | `eas build -p android --profile preview` |

#### Firebase 규칙 배포

```bash
# Firestore 규칙 배포
firebase deploy --only firestore:rules

# Storage 규칙 배포
firebase deploy --only storage

# 인덱스 배포
firebase deploy --only firestore:indexes

# 모두 배포
firebase deploy --only firestore:rules,firestore:indexes,storage
```

---

## 5. CJ 택배 API 연동

### 5.1 기본 사항

| 항목 | 값 |
|------|------|
| 통신 규약 | REST |
| 인코딩 | UTF-8 |
| 헤더 | `CJ-Gateway-APIKey`, `Content-Type: application/json`, `Accept: application/json` |

### 5.2 환경별 URL

| 환경 | Base URL |
|------|----------|
| **개발** | `https://dxapi-dev.cjlogistics.com:5054` |
| **운영** | `https://dxapi.cjlogistics.com:5052` |

### 5.3 1Day Token

| 항목 | 내용 |
|------|------|
| 유효시간 | **24시간** |
| 주의사항 | 1초에 1회 이상 요청 시 차단됨 |
| 갱신 | 만료 30분 전 ~ 만료시간 사이에 재요청 시 토큰 갱신 |

### 5.4 API 목록

| API | Endpoint | 설명 |
|-----|----------|------|
| 1Day 토큰 발행 | `/ReqOneDayToken` | 인증 토큰 발급 |
| 주소 정제 | `/ReqAddrRfnSm` | 주소 정제 + 권역 정보 |
| 운송장 번호 생성 | `/ReqInvcNo` | 단건 운송장 번호 채번 |
| 예약 접수 | `/RegBook` | 배송 예약 등록 |
| 예약 취소 | `/CnclBook` | 예약 취소 |

### 5.5 WMS 연동 현황

| 기능 | 엔드포인트 | 상태 |
|------|----------|:----:|
| 토큰 발급 | `ReqOneDayToken` | ✅ |
| 운송장 채번 | `ReqInvcNo` | ✅ |
| 주소 정제 | `ReqAddrRfnSm` | ✅ |
| 예약 접수 | `RegBook` | ✅ |
| 예약 취소 | `CnclBook` | ⚠️ |

### 5.6 예약 취소 관련

> ⚠️ **중요**
> - 우리 WMS는 운송장 자체 출력 방식 (`PRT_ST: '02'`)
> - CJ API 정책상 **취소 API 사용 불가**
> - **대안**: 상품을 발송하지 않으면 택배운임에서 자동 제외됨

### 5.7 로컬 환경 설정

#### WMS API (core-api)

| 항목 | 값 |
|------|------|
| Base URL | `http://localhost:3000` |
| 포트 | `3000` (env: PORT) |

#### CJ API 엔드포인트 (WMS 내부)

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/exports/cj/reservation/:jobId` | CJ 예약 접수 (운송장 자동 발급) |
| GET | `/exports/cj/status/:jobId` | CJ 예약 상태 확인 |
| GET | `/exports/cj/waybill/:jobId` | 운송장 출력 데이터 조회 |
| POST | `/exports/cj/cancel/:jobId` | CJ 예약 취소 (⚠️ 정책상 불가) |

#### 환경변수 (.env)

```bash
# CJ API 설정
CJ_API_BASE_URL=https://dxapi-dev.cjlogistics.com:5054
CJ_CUST_ID=30501859
CJ_BIZ_REG_NUM=1158700619

# 보내는 사람 정보
CJ_SENDER_NAME=에스카테스트
CJ_SENDER_TEL1=02
CJ_SENDER_TEL2=1234
CJ_SENDER_TEL3=5678
CJ_SENDER_ZIP=12345
CJ_SENDER_ADDR=서울시 강남구 테스트로 123
CJ_SENDER_DETAIL_ADDR=테스트빌딩 1층
```

---

## 6. Claude Code 작업 규칙

### 6.1 기본 커뮤니케이션 규칙

- 모든 설명과 답변은 **한국어**로 한다.
- 사용자는 실무 중심 개발자이며, 장황한 이론 설명을 원하지 않는다.
- "왜 문제인지 / 실무에서 어떤 문제가 생기는지"를 중심으로 설명한다.
- 추상적인 아키텍처 토론보다 **현재 코드 기준 판단**을 우선한다.

### 6.2 코드 수정 및 제안 규칙 (중요)

- **코드 수정 시 코드를 절대 출력하지 않는다.**
  - 코드 블록 출력 ❌ (수정 전/후 코드 모두 포함)
  - 코드 예시, 코드 조각 출력 ❌
  - Edit/Write 도구로 직접 파일 수정 ⭕
- 수정 완료 후 아래 항목만 간단히 보고:
  1. 변경된 파일 목록 (표 형태)
  2. 변경 내용 요약 (1~2줄, 코드 없이 텍스트로만)
  3. 주의사항 (있을 경우만)

### 6.3 프로젝트 구조 인식

#### Desktop (핵심)
- 경로: `apps/wms-desktop`
- 기술: Electron + React
- 역할: 바코드/스캔 기반 입출고, UNDO, 비프음/경고/실무 UX

#### Backend
- 경로: `services/core-api`
- 기술: NestJS + Prisma
- DB: 로컬 환경(Postgres), 스키마 정합성, 트랜잭션 로직 중요

#### Mobile App
- 경로: `apps/store-notice-app`
- 기술: Expo + React Native + Firebase
- 역할: 매장 공지, 재고 조회, 매출 등록

### 6.4 WMS 실무 기준

#### 우선순위
1. Inbound / Outbound 스캔 흐름 안정성
2. Inventory / InventoryTx 수량 정합성
3. UNDO 로직의 안전성
4. 중복 스캔, 잘못된 스캔 시 되돌릴 수 있는 구조

#### 특히 주의할 포인트
- UI와 DB 수량 불일치
- InventoryTx.type(in/out/move/adjust) 혼동
- UNDO 후 재스캔 시 수량 꼬임
- 비프음/경고가 실무 흐름을 방해하는 경우

### 6.5 환경 전제

- 현재는 **로컬 개발/검증 환경**만을 기준으로 한다.
- 운영(Lightsail, 서버, 배포, 백업, 보안) 관점은 기본 전제에 포함하지 않는다.
- 운영 환경 점검은 **사용자가 명시적으로 요청할 때만** 고려한다.

### 6.6 요약 (핵심 규칙)

- 한국어
- 코드 출력 없이 직접 수정
- WMS 실무 기준
- 로컬 환경 기준 판단
- 데이터 꼬임 / 되돌릴 수 없는 사고 최우선 차단

---

## 7. 아키텍처 로드맵 (진행 중)

> 📋 build.md 기반 아키텍처 결정 사항

### 7.1 현재 문제점

```
현재 구조 (분리됨)
┌─────────────┐     ┌─────────────┐
│   Desktop   │────▶│  PostgreSQL │  (WMS: 재고/출고/매장)
└─────────────┘     └─────────────┘

┌─────────────┐     ┌─────────────┐
│     App     │────▶│  Firebase   │  (공지/게시판/인증)
└─────────────┘     └─────────────┘

→ 서로 연결고리 없음
→ 매장/사용자 정보 중복 관리
→ 출고 시 매장 직원 알림 불가
```

### 7.2 목표 구조

```
변경 후 (연결됨)
┌─────────────┐
│   Desktop   │──────────┐
└─────────────┘          │
                         ▼
┌─────────────┐     ┌─────────────┐
│     App     │────▶│  PostgreSQL │  ◀── SSOT (권한/매장/사용자)
└─────────────┘     └─────────────┘
       │                 ▲
       ▼                 │
┌─────────────┐          │
│  Firebase   │──────────┘
│  (Auth만)   │   firebaseUid로 연결
└─────────────┘
```

### 7.3 SSOT (Single Source of Truth) 정리

| 데이터 | 주인 (SSOT) | 현재 | 변경 후 |
|--------|-------------|------|---------|
| 매장 정보 | PostgreSQL | Firebase stores + PostgreSQL Store | PostgreSQL만 |
| 사용자/권한 | PostgreSQL | Firebase users | PostgreSQL Employee |
| 부서 | 선택 | Firebase departments | 유지 또는 PostgreSQL |
| 공지/게시판 | Firebase | Firebase | 유지 (실시간 필요) |
| 재고/출고 | PostgreSQL | PostgreSQL | 유지 |

### 7.4 추가 예정 모델: Employee

```
Employee (신규 - PostgreSQL)
├── firebaseUid     ← Firebase Auth 연결 (unique)
├── storeId         ← PostgreSQL Store 연결
├── pushToken       ← 알림 발송용
├── name, phone, email
├── role            ← HQ_ADMIN/HQ_WMS/SALES/STORE_MANAGER/STORE_STAFF
└── status          ← ACTIVE/PENDING/DISABLED
```

### 7.5 인증 흐름 변경

**현재:**
```
App 로그인 → Firebase Auth → Firestore users 직접 조회 → 화면 표시
```

**변경 후:**
```
App 로그인 → Firebase Auth → core-api로 idToken 전송 → PostgreSQL 권한 확인
                                                         ↓
                                              Employee 없음 → PENDING 생성 (승인대기)
                                              Employee 있음 → role/store 반환 → 화면 분기
```

### 7.6 Lightsail 배포 시 필요 작업

> ⚠️ **중요**: Firebase 인증 테스트 전 반드시 설정 필요

**1. 환경변수 설정** (Lightsail 서버 `/home/ubuntu/wms/services/core-api/.env`):
```bash
# 방법 1: JSON 문자열로 직접 설정
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"your-project","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"..."}'

# 방법 2: 파일 경로 지정
GOOGLE_APPLICATION_CREDENTIALS=/home/ubuntu/wms/firebase-service-account.json
```

**2. 서비스 계정 키 발급** (Firebase Console):
- Firebase Console > 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성
- JSON 파일 다운로드 → Lightsail에 업로드

**3. 배포 명령어**:
```bash
# 로컬에서
git push

# Lightsail SSH 접속 후
cd ~/wms/services/core-api
git pull
npm install
npm run build
pm2 restart all
```

### 7.7 구현 순서 (MVP 7단계)

| 단계 | 작업 | 완료 기준 | 상태 |
|------|------|----------|:----:|
| 1 | Prisma에 Employee 모델 추가 + migrate | DB에 테이블 생성됨 | ✅ 완료 |
| 2 | core-api에 firebase-admin 설치 + idToken 검증 | 토큰 검증 성공 로그 | ✅ 완료 |
| 3 | `POST /auth/firebase` 엔드포인트 구현 | Postman 테스트 통과 | ✅ 완료 (Lightsail 테스트 필요) |
| 4 | App 로그인 후 core-api 호출 로직 추가 | 로그인 시 Employee 생성됨 | ✅ 완료 |
| 5 | 승인대기 화면 + 승인 API 구현 | PENDING→ACTIVE 전환 가능 | ✅ 완료 |
| 6 | role별 화면 분기 | 관리자/직원 메뉴 다르게 표시 | ✅ 완료 |
| 7 | 푸시토큰 연동 + 출고 알림 | 출고 시 매장 직원에게 푸시 | ✅ 완료 |

### 7.7 엑셀 업로드 필드 매핑 (참고)

> 엑셀 컬럼은 외부 프로그램 export라 변경 불가

| 엑셀 종류 | 핵심 컬럼 | PostgreSQL 매칭 |
|----------|----------|-----------------|
| 매장 등록 | 매장코드, 매장명 | Store.code, Store.name |
| 출고/반품 | 거래처코드, 단품코드, 수량 | Store.code, Sku.sku |
| 택배 요청 | 매장코드, 옵션, 수취인정보 | Store.code |
| 재고 초기화 | 코드, 수량, 매장/창고 | Sku.sku, Store.name |
| 매출 업로드 | 매장명, 매출일, 금액 | SalesRaw.storeName (자동 code 생성) |

---

## 8. 작업 이력

### 2026-01-24 (오후)
- **App 재고 조회 방식 변경**: Firebase Functions → WMS API 직접 호출로 변경
- **바코드 스캐너 추가**: expo-camera 설치 + app.json plugins 설정
- **EAS Build 실행**: Development Build로 네이티브 모듈 반영
- **아키텍처 검토**: build.md 기반 Employee 모델 및 인증 흐름 설계

### 2026-01-24
- **CJ API 문서화**: CJ 택배 API 테스트 환경 요약 문서 (`cj.md`) 작성
- **디버그 로그 제거**: cj-api.service.ts에서 debug 로그 5개 제거
- **store-notice-app 이동**: `C:\store-notice-app` → `C:\repo\wms\apps\store-notice-app`
- **workspace 설정**: store-notice-app을 workspace에서 제외하여 의존성 충돌 방지

### 2026-01-22
- **매장 Excel 일괄 등록**: `POST /stores/bulk-upsert` API 구현
- **재고 조정/초기화**: 재고 조정 및 초기화 기능 추가
- **매장별 재고 검색**: 매장별 재고 조회 API 추가
- **Desktop UI 개선**: InventoryPage, SalesPage, SettingsPage 등 개선

### 2026-01-20
- **Multi-Tenant 리팩토링**: store-notice-app을 Multi-tenant SaaS로 전환
- **Firebase Functions**: createCompany, joinWithInvite, approveUser 함수 구현
- **Firestore Rules**: 회사별 데이터 격리 규칙 작성
- **테스트 기능**: seedTestData, runRepeatedTest 함수 구현

### 2026-01-19
- **store-notice-app 초기 개발**: Firebase + Expo 기반 앱 구축
- **푸시 알림**: Expo Notifications 연동
- **게시판 기능**: 이미지/파일 첨부 기능 구현

---

## 📞 문의처

- **WMS 관련**: 개발팀 내부
- **CJ API 관련**: openapi@cjlogistics.com
- **Firebase 관련**: Firebase Console 참고

---

**마지막 업데이트**: 2026-01-24
**작성**: Claude Code
