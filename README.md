# ESKA WMS & Store Notice App - 통합 문서

> 최종 업데이트: 2026-01-24

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [전체 프로젝트 구조](#2-전체-프로젝트-구조)
3. [WMS (창고관리시스템)](#3-wms-창고관리시스템)
4. [Store Notice App (매장 공지 앱)](#4-store-notice-app-매장-공지-앱)
5. [CJ 택배 API 연동](#5-cj-택배-api-연동)
6. [Claude Code 작업 규칙](#6-claude-code-작업-규칙)
7. [아키텍처 현황 및 로드맵](#7-아키텍처-현황-및-로드맵)

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

### 3.3 데이터 모델 (Prisma)

| 모델 | 설명 |
|------|------|
| Store | 매장 (본사/지점) |
| Department | 부서 |
| Employee | 직원 (Firebase Auth 연동) |
| Location | 창고 위치 |
| Sku | 상품 (SKU/바코드) |
| Inventory | 재고 (SKU + Location) |
| InventoryTx | 재고 트랜잭션 |
| Job | 작업 (입고/출고/반품/택배) |
| JobItem | 작업 상세 |
| JobParcel | 택배 정보 |
| CjShipment | CJ 송장 정보 |

### 3.4 서버 배포 정보

| 항목 | 값 |
|------|-----|
| 서버 | AWS Lightsail (ap-northeast-2) |
| IP | `13.125.126.15` |
| 도메인 | `backend.dheska.com` |

```bash
# SSH 접속 + 배포
ssh -i ~/.ssh/LightsailDefaultKey-ap-northeast-2.pem ubuntu@13.125.126.15 \
  "cd ~/wms/services/core-api && git pull && npm run build && pm2 restart all"
```

---

## 4. Store Notice App (매장 공지 앱)

### 4.1 기술 스택

| 구성요소 | 기술 |
|----------|------|
| Frontend | Expo + React Native + TypeScript |
| Backend | Firebase (Auth) + PostgreSQL (core-api) |
| Routing | Expo Router (file-based routing) |
| Push | Expo Notifications |

### 4.2 현재 데이터 소스 현황

| 기능 | 저장소 | 상태 |
|------|--------|:----:|
| 사용자 인증 | Firebase Auth | 유지 |
| 사용자 정보/권한 | PostgreSQL Employee | ✅ 완료 |
| 부서 관리 | PostgreSQL Department | ✅ 완료 |
| 매장 관리 | PostgreSQL Store | ✅ 완료 |
| 재고 조회 | PostgreSQL (WMS API) | ✅ 완료 |
| 게시판 | Firebase boardPosts | 마이그레이션 예정 |
| 달력 | Firebase events | 마이그레이션 예정 |
| 결재 | Firebase approvals | 마이그레이션 예정 |
| 공지발송 | Firebase messages | 마이그레이션 예정 |

### 4.3 역할별 기능

| 기능 | 관리자 (HQ_ADMIN/HQ_WMS) | 직원 (STORE_STAFF 등) |
|------|--------------------------|----------------------|
| 공지 작성 | O | X |
| 게시판 | O (모든 글 삭제) | O (본인 글만 삭제) |
| 결재 | O | X |
| 매장재고 | O | O |
| 매출등록 | O | O |
| 설정 | 전체 (승인대기, 부서/매장/회원 관리) | 제한적 |

### 4.4 Employee 모델 (PostgreSQL)

```
Employee
├── firebaseUid     ← Firebase Auth 연결 (unique)
├── storeId         ← PostgreSQL Store 연결
├── departmentId    ← PostgreSQL Department 연결
├── pushToken       ← 알림 발송용
├── name, phone, email
├── role            ← HQ_ADMIN/HQ_WMS/SALES/STORE_MANAGER/STORE_STAFF
├── status          ← ACTIVE/PENDING/DISABLED
└── isHq            ← 본사 여부
```

### 4.5 인증 흐름

```
App 로그인 → Firebase Auth → core-api로 idToken 전송 → PostgreSQL Employee 조회
                                                         ↓
                                              Employee 없음 → 회원가입 화면
                                              Employee PENDING → 승인대기 안내
                                              Employee ACTIVE → role에 따라 화면 분기
```

### 4.6 승인대기 화면 (admin/staff/pending.tsx)

- 역할 선택: **부서관리** (STORE_MANAGER) / **매장관리** (STORE_STAFF)
- 부서관리 선택 시 → 부서 목록 표시 (PostgreSQL Department)
- 매장관리 선택 시 → 매장 목록 표시 (PostgreSQL Store)
- 2열 그리드 레이아웃

---

## 5. CJ 택배 API 연동

### 5.1 환경별 URL

| 환경 | Base URL |
|------|----------|
| 개발 | `https://dxapi-dev.cjlogistics.com:5054` |
| 운영 | `https://dxapi.cjlogistics.com:5052` |

### 5.2 API 목록

| API | Endpoint | 설명 |
|-----|----------|------|
| 1Day 토큰 발행 | `/ReqOneDayToken` | 인증 토큰 발급 (24시간 유효) |
| 주소 정제 | `/ReqAddrRfnSm` | 주소 정제 + 권역 정보 |
| 운송장 번호 생성 | `/ReqInvcNo` | 단건 운송장 번호 채번 |
| 예약 접수 | `/RegBook` | 배송 예약 등록 |

---

## 6. Claude Code 작업 규칙

### 6.1 기본 규칙

- 모든 설명과 답변은 **한국어**로 한다
- **코드 수정 시 코드를 절대 출력하지 않는다** → Edit/Write 도구로 직접 수정
- 수정 완료 후 변경 파일 목록과 요약만 보고

### 6.2 WMS 실무 기준 우선순위

1. Inbound / Outbound 스캔 흐름 안정성
2. Inventory / InventoryTx 수량 정합성
3. UNDO 로직의 안전성
4. 중복 스캔, 잘못된 스캔 시 되돌릴 수 있는 구조

---

## 7. 아키텍처 현황 및 로드맵

### 7.1 완료된 작업 (MVP 7단계)

| 단계 | 작업 | 상태 |
|------|------|:----:|
| 1 | Prisma에 Employee 모델 추가 | ✅ |
| 2 | core-api에 firebase-admin + idToken 검증 | ✅ |
| 3 | `POST /auth/firebase` 엔드포인트 | ✅ |
| 4 | App 로그인 후 core-api 호출 | ✅ |
| 5 | 승인대기 화면 + 승인 API | ✅ |
| 6 | role별 화면 분기 | ✅ |
| 7 | 푸시토큰 연동 | ✅ |
| 8 | 부서/매장 관리 PostgreSQL 전환 | ✅ |

### 7.2 Firebase → PostgreSQL 마이그레이션 계획

#### 현재 상태
```
┌─────────────┐     ┌─────────────┐
│   Desktop   │────▶│  PostgreSQL │  (WMS: 재고/출고/매장/부서/직원)
└─────────────┘     └─────────────┘

┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│     App     │────▶│  PostgreSQL │ +   │  Firebase   │
└─────────────┘     │ (인증/매장)  │     │(게시판/달력)│
                    └─────────────┘     └─────────────┘
```

#### 마이그레이션 대상

| 기능 | 현재 | 이전 후 | 난이도 | 실시간 필요 |
|------|------|---------|:------:|:-----------:|
| 달력 | Firebase events | PostgreSQL Event | ⭐ | X |
| 게시판 | Firebase boardPosts | PostgreSQL BoardPost | ⭐⭐ | △ |
| 공지발송 | Firebase messages | PostgreSQL Message | ⭐⭐ | X |
| 결재 | Firebase approvals | PostgreSQL Approval | ⭐⭐⭐ | O |

#### 실시간 대안 (Firebase 제거 시)

| 방식 | 장점 | 단점 |
|------|------|------|
| Polling (5초) | 구현 쉬움 | 배터리/트래픽 소모 |
| WebSocket | 진짜 실시간 | 서버 복잡도 증가 |
| 푸시알림 | 인프라 있음 | 잦은 알림 부적합 |

**권장**: Polling + 새글/상태변경 시 푸시알림

#### 푸시알림 구현 방안 (PostgreSQL 전환 시)

```typescript
// core-api에서 Expo Push API 직접 호출
await fetch('https://exp.host/--/api/v2/push/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: employee.pushToken,
    title: '새 공지',
    body: '내용...',
  }),
});
```

- 대량 발송: 100개씩 배치 처리 필요
- 실패 재시도: 작업 큐(Bull 등) 도입 권장

#### 마이그레이션 우선순위

1. **달력** - 가장 쉬움, 실시간 불필요
2. **게시판** - Polling 방식으로 충분
3. **공지발송** - 푸시 서비스와 함께
4. **결재** - 가장 복잡, 마지막

### 7.3 예정 테이블 (PostgreSQL)

```sql
-- 달력
CREATE TABLE events (
  id UUID PRIMARY KEY,
  title VARCHAR,
  description TEXT,
  date DATE,
  created_by UUID REFERENCES employees(id)
);

-- 게시판
CREATE TABLE board_posts (
  id UUID PRIMARY KEY,
  title VARCHAR,
  content TEXT,
  author_id UUID REFERENCES employees(id),
  created_at TIMESTAMP
);

-- 공지
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  title VARCHAR,
  body TEXT,
  sender_id UUID,
  target_type VARCHAR, -- ALL, STORE, DEPARTMENT
  target_ids TEXT[],
  created_at TIMESTAMP
);

CREATE TABLE message_receipts (
  id UUID PRIMARY KEY,
  message_id UUID REFERENCES messages(id),
  recipient_id UUID REFERENCES employees(id),
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP
);

-- 결재
CREATE TABLE approvals (
  id UUID PRIMARY KEY,
  title VARCHAR,
  content TEXT,
  author_id UUID,
  status VARCHAR, -- PENDING, APPROVED, REJECTED
  created_at TIMESTAMP
);

CREATE TABLE approval_steps (
  id UUID PRIMARY KEY,
  approval_id UUID REFERENCES approvals(id),
  approver_id UUID REFERENCES employees(id),
  step_order INT,
  status VARCHAR,
  acted_at TIMESTAMP
);
```

---

## 문의처

- **WMS 관련**: 개발팀 내부
- **CJ API 관련**: openapi@cjlogistics.com
- **Firebase 관련**: Firebase Console 참고

---

**마지막 업데이트**: 2026-01-24
**작성**: Claude Code

---

<!--
작업 이력 (2026-01-24 이전):
- 2026-01-24: MVP 7단계 완료, 부서/매장 PostgreSQL 전환, 승인대기 화면 개선
- 2026-01-22: 매장 Excel 일괄 등록, 재고 조정/초기화
- 2026-01-20: Multi-Tenant 리팩토링, Firebase Functions
- 2026-01-19: store-notice-app 초기 개발
-->
