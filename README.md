# ESKA WMS & Store Notice App - 통합 문서

> 최종 업데이트: 2026-01-25

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
| 달력 | PostgreSQL Event | ✅ 완료 |
| 게시판 | PostgreSQL BoardPost | ✅ 완료 |
| 공지발송 | PostgreSQL Message/Receipt | ✅ 완료 |
| 결재 | PostgreSQL Approval | ✅ 완료 |

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

### 7.1 완료된 작업

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
| 9 | 달력 Firebase → PostgreSQL 마이그레이션 | ✅ |
| 10 | 게시판 Firebase → PostgreSQL 마이그레이션 | ✅ |
| 11 | 공지발송 Firebase → PostgreSQL 마이그레이션 | ✅ |
| 12 | 결재 Firebase → PostgreSQL 마이그레이션 | ✅ |

### 7.2 현재 아키텍처

```
┌─────────────┐     ┌─────────────┐
│   Desktop   │────▶│  PostgreSQL │  (WMS: 재고/출고/매장/부서/직원)
└─────────────┘     └─────────────┘

┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│     App     │────▶│  PostgreSQL │ +   │  Firebase   │
└─────────────┘     │ (모든 데이터)│     │ (Auth만)    │
                    └─────────────┘     └─────────────┘
```

**Firebase 역할**: 사용자 인증(Auth)만 담당
**PostgreSQL 역할**: 모든 비즈니스 데이터 (직원, 매장, 부서, 달력, 게시판, 공지, 결재)

### 7.3 추가된 테이블 (PostgreSQL)

| 모델 | 설명 |
|------|------|
| Event | 달력 이벤트 |
| BoardPost | 게시판 글 |
| Message | 공지 메시지 |
| Receipt | 공지 수신/읽음 기록 |
| Approval | 결재 문서 |
| ApprovalApprover | 결재 승인자 |
| ApprovalAttachment | 결재 첨부파일 |

---

## 문의처

- **WMS 관련**: 개발팀 내부
- **CJ API 관련**: openapi@cjlogistics.com
- **Firebase 관련**: Firebase Console 참고

---

**마지막 업데이트**: 2026-01-25
**작성**: Claude Code

---

<!--
작업 이력:
- 2026-01-25: Firebase → PostgreSQL 마이그레이션 완료 (달력, 게시판, 공지, 결재)
- 2026-01-24: MVP 7단계 완료, 부서/매장 PostgreSQL 전환, 승인대기 화면 개선
- 2026-01-22: 매장 Excel 일괄 등록, 재고 조정/초기화
- 2026-01-20: Multi-Tenant 리팩토링, Firebase Functions
- 2026-01-19: store-notice-app 초기 개발
-->
