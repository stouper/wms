# ESKA WMS & Store Notice App - 통합 문서

> 최종 업데이트: 2026-01-27

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [전체 프로젝트 구조](#2-전체-프로젝트-구조)
3. [WMS Desktop 빌드 및 배포](#3-wms-desktop-빌드-및-배포)
4. [라벨 프린터 설정](#4-라벨-프린터-설정)
5. [WMS (창고관리시스템)](#5-wms-창고관리시스템)
6. [Store Notice App (매장 공지 앱)](#6-store-notice-app-매장-공지-앱)
7. [CJ 택배 API 연동](#7-cj-택배-api-연동)
8. [Claude Code 작업 규칙](#8-claude-code-작업-규칙)
9. [아키텍처 현황 및 로드맵](#9-아키텍처-현황-및-로드맵)

---

## 1. 프로젝트 개요

### 1.1 ESKA WMS (Warehouse Management System)
창고 관리 시스템 - 바코드 스캔 기반 입출고, 재고 관리, 택배 발송

### 1.2 Store Notice App
매장 공지 및 업무 관리 모바일 앱 (Multi-tenant SaaS)

---

## 2. 전체 프로젝트 구조

### 2.1 Git 저장소
```
https://github.com/stouper/wms.git
```

**클론:**
```bash
git clone https://github.com/stouper/wms.git
cd wms
npm install
```

### 2.2 폴더 구조
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

## 3. WMS Desktop 빌드 및 배포

### 3.1 요구사항
- Node.js 18 이상

### 3.2 빌드 명령어
```bash
cd apps/wms-desktop
npm install
npm run dist
```

### 3.3 빌드 결과물
```
apps/wms-desktop/dist-electron/
├── ESKA WMS Setup 1.0.0.exe   # 설치 파일 (81MB)
└── win-unpacked/               # 포터블 버전
    └── ESKA WMS.exe
```

### 3.4 설치 방법

**방법 1: 설치 파일**
```
ESKA WMS Setup 1.0.0.exe 실행 → 설치 경로 선택 → 완료
```

**방법 2: 포터블**
```
win-unpacked 폴더 통째로 복사 → ESKA WMS.exe 실행
```

### 3.5 설정 파일 (config.json)

**위치:**
- 설치 버전: `C:\Program Files\ESKA WMS\resources\config.json`
- 포터블 버전: `win-unpacked\resources\config.json`

**내용:**
```json
{
  "mode": "prod",
  "api": {
    "dev": "http://localhost:3000",
    "prod": "https://backend.dheska.com"
  },
  "printer": {
    "label": "\\\\localhost\\BV420D_RAW"
  }
}
```

| 항목 | 설명 | 예시 |
|------|------|------|
| `mode` | API 모드 (dev/prod) | `"prod"` |
| `api.dev` | 개발 서버 주소 | `"http://localhost:3000"` |
| `api.prod` | 운영 서버 주소 | `"https://backend.dheska.com"` |
| `printer.label` | 라벨 프린터 경로 | `"\\\\localhost\\BV420D_RAW"` |

---

## 4. 라벨 프린터 설정

### 4.1 지원 프린터
- Toshiba BV420D
- 기타 ZPL/TSPL 지원 라벨 프린터

### 4.2 Windows 공유 프린터 등록

1. **제어판** → **장치 및 프린터**
2. 프린터 **우클릭** → **프린터 속성**
3. **공유 탭** 클릭
4. **"이 프린터 공유"** 체크
5. **공유 이름** 입력 (예: `BV420D_RAW`)
6. **확인**

### 4.3 config.json 프린터 경로 설정

```json
"printer": {
  "label": "\\\\localhost\\공유이름"
}
```

**예시:**
| 상황 | 경로 |
|------|------|
| 로컬 프린터 | `"\\\\localhost\\BV420D_RAW"` |
| 네트워크 프린터 | `"\\\\192.168.1.100\\BV420D_RAW"` |
| 다른 PC 프린터 | `"\\\\PC이름\\BV420D_RAW"` |

### 4.4 프린터 테스트 (Windows CMD)

```cmd
echo ^XA^FO50,50^A0N,50,50^FDTEST^FS^XZ > test.txt
copy /b test.txt \\localhost\BV420D_RAW
del test.txt
```
→ "TEST" 라벨이 출력되면 성공

### 4.5 문제 해결

| 증상 | 해결 방법 |
|------|----------|
| 프린터 출력 안됨 | 1. Windows 공유 설정 확인<br>2. config.json 경로 확인<br>3. 프린터 드라이버 확인 |
| 하얀 화면 | 1. 개발자 도구(Ctrl+Shift+I)로 에러 확인<br>2. config.json 문법 오류 확인 |
| API 연결 안됨 | 1. mode 설정 확인 (dev/prod)<br>2. 서버 주소 접근 확인 |

---

## 5. WMS (창고관리시스템)

### 5.1 기술 스택

| 구성요소 | 기술 |
|----------|------|
| Desktop | Electron + React (JSX) |
| Backend | NestJS + Prisma + PostgreSQL |
| 외부 연동 | CJ 대한통운 API |

### 5.2 주요 기능

#### 입고/출고
- 바코드 스캔 기반 입고 (본사 창고)
- 바코드 스캔 기반 출고 (매장 배송)
- UNDO 기능 (직전/연속/전체 취소)
- 강제 출고 (재고 부족 시 0 유지)

#### 입고 유형
| 유형 | JobType | 설명 |
|------|---------|------|
| 외부입고 | `INBOUND` | 외부→창고 (창고 재고만 +증가) |
| 매장반품 | `RETURN` | 매장→창고 (매장 -감소, 창고 +증가) |

#### 택배 발송
- Excel 업로드 (택배 요청 일괄 등록)
- CJ 대한통운 API 연동 (송장 발행)
- 단포/합포 자동 분류
- 택배 라벨 출력

#### 재고 관리
- 재고 현황 조회
- 수동 재고 조정 (사유 기록)
- 재고 이력 추적 (InventoryTx)

### 5.3 데이터 모델 (Prisma)

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

### 5.4 서버 배포 정보

| 항목 | 값 |
|------|-----|
| 서버 | AWS Lightsail (ap-northeast-2) |
| IP | `13.125.126.15` |
| 도메인 | `backend.dheska.com` |

```bash
# SSH 접속 + 배포
ssh -i ~/.ssh/LightsailDefaultKey-ap-northeast-2.pem ubuntu@13.125.126.15 \
  "cd ~/wms && git pull && cd services/core-api && npm run build && pm2 restart wms-core-api"
```

---

## 6. Store Notice App (매장 공지 앱)

### 6.1 기술 스택

| 구성요소 | 기술 |
|----------|------|
| Frontend | Expo + React Native + TypeScript |
| Backend | Firebase (Auth) + PostgreSQL (core-api) |
| Routing | Expo Router (file-based routing) |
| Push | Expo Push Notifications |

### 6.2 역할 시스템 (EmployeeRole)

| 역할 | 설명 | 권한 |
|------|------|------|
| `MASTER` | 최고 관리자 | 모든 권한, ADMIN 지정 가능, 삭제/강등 불가 |
| `ADMIN` | 관리자 | 직원 승인, STAFF만 지정 가능 |
| `STAFF` | 일반 직원 | 기본 기능만 |

**MASTER 자동 생성:** `.env`의 `MASTER_EMAIL`과 일치하는 이메일로 로그인 시 자동 MASTER 권한 부여

### 6.3 현재 데이터 소스 현황

| 기능 | 저장소 | 상태 |
|------|--------|:----:|
| 사용자 인증 | Firebase Auth | 유지 |
| 사용자 정보/권한 | PostgreSQL Employee | ✅ |
| 부서 관리 | PostgreSQL Department | ✅ |
| 매장 관리 | PostgreSQL Store | ✅ |
| 재고 조회 | PostgreSQL (WMS API) | ✅ |
| 달력 | PostgreSQL Event | ✅ |
| 게시판 | PostgreSQL BoardPost | ✅ |
| 공지발송 | PostgreSQL Message/Receipt | ✅ |
| 결재 | PostgreSQL Approval | ✅ |

### 6.4 Employee 모델 (PostgreSQL)

```
Employee
├── firebaseUid     ← Firebase Auth 연결 (unique)
├── storeId         ← PostgreSQL Store 연결
├── departmentId    ← PostgreSQL Department 연결
├── pushToken       ← Expo Push Token (알림용)
├── name, phone, email
├── role            ← MASTER/ADMIN/STAFF
├── status          ← ACTIVE/PENDING/DISABLED
└── isHq            ← 본사 여부
```

### 6.5 인증 흐름

```
App 로그인 → Firebase Auth → core-api로 idToken 전송 → PostgreSQL Employee 조회
                                                         ↓
                                              Employee 없음 → 자동 생성 (PENDING)
                                              Employee PENDING → 승인대기 안내
                                              Employee ACTIVE → role에 따라 화면 분기
                                              MASTER 이메일 → 자동 MASTER + ACTIVE
```

---

## 7. CJ 택배 API 연동

### 7.1 환경별 URL

| 환경 | Base URL |
|------|----------|
| 개발 | `https://dxapi-dev.cjlogistics.com:5054` |
| 운영 | `https://dxapi.cjlogistics.com:5052` |

### 7.2 API 목록

| API | Endpoint | 설명 |
|-----|----------|------|
| 1Day 토큰 발행 | `/ReqOneDayToken` | 인증 토큰 발급 (24시간 유효) |
| 주소 정제 | `/ReqAddrRfnSm` | 주소 정제 + 권역 정보 |
| 운송장 번호 생성 | `/ReqInvcNo` | 단건 운송장 번호 채번 |
| 예약 접수 | `/RegBook` | 배송 예약 등록 |

### 7.3 환경변수 설정 (.env)

```bash
# CJ API 개발환경
CJ_API_BASE_URL=https://dxapi-dev.cjlogistics.com:5054
CJ_CUST_ID=30501859
CJ_BIZ_REG_NUM=1158700619

# 보내는 사람 기본 정보
CJ_SENDER_NAME=에스카테스트
CJ_SENDER_TEL1=02
CJ_SENDER_TEL2=1234
CJ_SENDER_TEL3=5678
CJ_SENDER_ZIP=12345
CJ_SENDER_ADDR=서울시 강남구 테스트로 123
CJ_SENDER_DETAIL_ADDR=테스트빌딩 1층
```

---

## 8. Claude Code 작업 규칙

### 8.1 기본 규칙

- 모든 설명과 답변은 **한국어**로 한다
- **코드 수정 시 코드를 절대 출력하지 않는다** → Edit/Write 도구로 직접 수정
- 수정 완료 후 변경 파일 목록과 요약만 보고

### 8.2 WMS 실무 기준 우선순위

1. Inbound / Outbound 스캔 흐름 안정성
2. Inventory / InventoryTx 수량 정합성
3. UNDO 로직의 안전성
4. 중복 스캔, 잘못된 스캔 시 되돌릴 수 있는 구조

---

## 9. 아키텍처 현황 및 로드맵

### 9.1 현재 아키텍처

```
┌─────────────┐     ┌─────────────┐
│   Desktop   │────▶│  PostgreSQL │  (WMS: 재고/출고/매장/부서/직원)
└─────────────┘     └─────────────┘

┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│     App     │────▶│  PostgreSQL │ +   │  Firebase   │
└─────────────┘     │ (모든 데이터)│     │ (Auth만)    │
                    └─────────────┘     └─────────────┘
```

**Firebase 역할**: 사용자 인증(Auth) + Storage만 담당
**PostgreSQL 역할**: 모든 비즈니스 데이터

### 9.2 완료된 작업

| 작업 | 상태 |
|------|:----:|
| Prisma Employee 모델 + Firebase 연동 | ✅ |
| 역할 시스템 (MASTER/ADMIN/STAFF) | ✅ |
| 부서/매장 관리 PostgreSQL 전환 | ✅ |
| 달력/게시판/공지/결재 PostgreSQL 마이그레이션 | ✅ |
| Desktop 빌드 환경 구성 (electron-builder) | ✅ |
| 라벨 프린터 RAW 출력 지원 | ✅ |
| 프린터 경로 config.json 외부화 | ✅ |

---

## 문의처

- **WMS 관련**: 개발팀 내부
- **CJ API 관련**: openapi@cjlogistics.com
- **Firebase 관련**: Firebase Console 참고

---

**마지막 업데이트**: 2026-01-27
**작성**: Claude Code

---

<!--
작업 이력:
- 2026-01-27: Desktop 빌드 환경 구성, 라벨 프린터 설정, 역할 시스템 업데이트 (MASTER/ADMIN/STAFF)
- 2026-01-25: Firebase → PostgreSQL 마이그레이션 완료 (달력, 게시판, 공지, 결재)
- 2026-01-24: MVP 7단계 완료, 부서/매장 PostgreSQL 전환, 승인대기 화면 개선
- 2026-01-22: 매장 Excel 일괄 등록, 재고 조정/초기화
-->
