# ESKA WMS

창고 관리 시스템 (Warehouse Management System)

## 프로젝트 구조

```
repo/wms/
├── apps/
│   └── wms-desktop/          # Electron 기반 데스크톱 앱 (바코드 스캔, 입출고)
├── services/
│   └── core-api/             # NestJS 백엔드 API + Prisma ORM
└── packages/
    └── shared-types/         # 공유 타입 정의
```

## 기술 스택

- **Desktop**: Electron + React
- **Backend**: NestJS + Prisma + PostgreSQL
- **Shared**: TypeScript

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

- 바코드 스캔 기반 입고/출고
- 재고 관리 및 이력 추적
- UNDO 기능 (직전/연속/전체 취소)
- Excel 업로드 (택배/출고 요청)
- 작업 지시서 출력
