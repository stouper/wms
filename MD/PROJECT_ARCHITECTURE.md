# 📱 store-notice-app 프로젝트 아키텍처 분석

## 1. 프로젝트 개요

**ESKA** - 직원 공지사항 및 조직 관리 모바일 앱 (React Native/Expo)

- **기술스택**: React Native 0.81.5 + Expo 54 + Firebase (Firestore, Auth, Cloud Functions) + TypeScript
- **플랫폼**: iOS / Android (웹도 지원)
- **구조**: Multi-tenant (회사별 격리)

---

## 2. 앱 폴더 구조

### 2.1 app/ (라우팅 - Expo Router)

| 경로 | 역할 |
|------|------|
| **index.tsx** | 루트 (로그인 상태 체크) |
| **auth/login.tsx** | 로그인 페이지 |
| **auth/signup.tsx** | 회원가입 페이지 |
| **message/index.tsx** | 직원용 공지 목록 |
| **message/[id].tsx** | 직원용 공지 상세 |

### 2.2 admin/ (관리자 전용 - 12개 페이지)

| 페이지 | 기능 |
|--------|------|
| **index.tsx** | 대시보드 |
| **notices/** | 공지 관리 |
| **board/** | 게시판 |
| **approvals/** | 결재 시스템 |
| **calendar/index.tsx** | 일정 관리 |
| **organization/index.tsx** | 조직도 |
| **settings/** | 설정 (회사, 직원) |
| **departments/index.tsx** | 부서 관리 |
| **stores/index.tsx** | 매장 관리 |

### 2.3 components/

```
components/
├── ui/
│   ├── Button.tsx
│   ├── Card.tsx
│   └── EmptyState.tsx
```

### 2.4 lib/ (공유 로직)

| 파일 | 내용 |
|------|------|
| **noticeTargets.ts** | 타입 정의 (User, Message, Receipt 등) |
| **firestoreMessage.ts** | 메시지 작성/조회 |
| **approvalTypes.ts** | 결재 타입 |
| **eventTypes.ts** | 일정 타입 |
| **uploadFile.ts** | 파일 업로드 |
| **push/registerPushToken.ts** | FCM 토큰 등록 |

---

## 3. 핵심 데이터 모델

### Multi-tenant 구조

```typescript
// User
{
  id: string;           // uid
  companyId: string;    // 회사 ID (필수)
  role: "OWNER" | "MANAGER" | "SALES";
  status: "PENDING" | "ACTIVE" | "REJECTED" | "DISABLED";
  email: string;
  name: string;
  storeId?: string;     // 매장 직원
  department?: string;  // 본사 직원
  expoPushToken?: string;
}

// Message (공지)
{
  id: string;
  companyId: string;    // 회사 ID (필수)
  title: string;
  body: string;
  targetType: "ALL" | "STORE" | "HQ_DEPT";
  targetStoreIds?: string[];
  targetDeptCodes?: string[];
  createdBy: string;
}

// Receipt (공지 수신 기록)
{
  messageId: string;
  userId: string;
  companyId: string;    // 회사 ID (필수)
  read: boolean;
  readAt?: timestamp;
}

// Store (매장)
{
  id: string;
  companyId: string;    // 회사 ID (필수)
  name: string;
  code?: string;
  address?: string;
}
```

---

## 4. Firestore 데이터 구조

```
companies/
  {companyId}/

users/
  {uid}
    ├── companyId (필수)
    ├── role
    ├── status
    └── ...

messages/
  {messageId}
    ├── companyId (필수)
    ├── title
    ├── body
    └── ...

receipts/
  {messageId}_{userId}
    ├── companyId (필수)
    ├── read
    └── ...

stores/
  {storeId}
    ├── companyId (필수)
    ├── name
    └── ...

boardPosts/
approvals/
events/
```

---

## 5. 직원 사용 흐름 (User Journey)

### 1️⃣ 회원가입 & 초대
```
신규 사용자 → auth/signup
  ↓
joinCompanyByInvite(초대코드)
  ↓
users/{uid} 생성 (status: "PENDING")
  ↓
관리자 승인 대기
```

### 2️⃣ 관리자 승인
```
관리자 → admin/settings/members
  ↓
PENDING 직원 선택
  ↓
approveUser() 호출 (status: "ACTIVE")
  ↓
직원 계정 활성화
```

### 3️⃣ 공지 수신
```
관리자 → admin/notices/new
  ↓
공지 작성 + 타겟 선택
  ↓
dispatchNoticeFast() 호출
  ↓
onMessageCreated (Cloud Function)
  ├─ receipts 생성
  ├─ 대상 users 필터링 (companyId + status=ACTIVE + 타겟)
  └─ Expo Push 발송
  ↓
직원 앱 → 알림 수신 → 클릭 → message/{id}
```

### 4️⃣ 공지 목록 조회 (message/index.tsx)
```
onSnapshot(receipts)
  - where("userId", "==", uid)
  - where("companyId", "==", me.companyId)
  ↓
receipts에서 messageId 추출
  ↓
getDoc(messages/{messageId})
  ↓
isVisibleForMe() 검증
  ↓
읽음/미읽음 표시
```

---

## 6. 관리자 대시보드 (admin/index.tsx)

```
┌─────────────────────────┐
│   관리자 대시보드        │
├─────────────────────────┤
│ 회사명                  │
│ 오늘의 일정             │
│ 미승인 직원 배지        │
├─────────────────────────┤
│ 하단 네비바             │
│ [홈] [조직도] [설정]   │
└─────────────────────────┘
```

**메뉴:**
- 공지 (notices)
- 게시판 (board)
- 결재 (approvals)
- 일정 (calendar)
- 조직도 (organization)
- 매장관리 (stores)
- 부서관리 (departments)
- 설정 (settings)

---

## 7. Firebase Cloud Functions (functions/src/index.ts)

### Callable 함수

| 함수 | 역할 |
|------|------|
| **createCompany(companyName)** | 회사 생성 (생성자=OWNER) |
| **joinCompanyByInvite(inviteCode)** | 초대 코드 가입 (status=PENDING) |
| **approveUser(userId, role, status, storeId, department)** | 직원 승인 |
| **dispatchNoticeFast(title, body, targetType, ...)** | 공지 즉시 발송 |

### Background Triggers

| 트리거 | 역할 |
|--------|------|
| **onMessageCreated** | 메시지 생성 → receipts 생성 + 푸시 발송 |
| **remindUnread** | 미확인 공지 재알림 (6시간 이내) |

### 푸시 발송 로직

```
메시지 생성
  ↓
onMessageCreated 트리거
  ↓
대상 users 조회
  - companyId = messageId.companyId
  - status = "ACTIVE"
  - targetType 필터 적용 (ALL/STORE/HQ_DEPT)
  ↓
receipts 컬렉션에 기록
  ↓
expoPushToken으로 배치 발송 (90개씩)
  ↓
Expo Push Notification Service
  ↓
직원 디바이스에 푸시 도착
```

---

## 8. 주요 라이브러리 (package.json)

```json
{
  "react": "19.1.0",
  "react-native": "0.81.5",
  "expo": "~54.0.31",
  "expo-router": "~6.0.21",
  "firebase": "^12.6.0",
  "@react-navigation/bottom-tabs": "^7.4.0",
  "@react-native-async-storage/async-storage": "2.2.0",
  "expo-notifications": "~0.32.16"
}
```

---

## 9. Multi-tenant 검증

### 모든 쿼리에 companyId 필터

```typescript
// ❌ 위험
const messages = await getDocs(
  collection(db, "messages")
);

// ✅ 안전
const messages = await getDocs(
  query(
    collection(db, "messages"),
    where("companyId", "==", userCompanyId)
  )
);
```

### Firestore 규칙

```
- companies: 같은 회사원만 조회
- users: 자신 OR 같은 회사 관리자 조회
- messages: companyId 필터 + targetType 검증
- receipts: userId 소유자만 조회
```

---

## 10. 주의사항

1. **Auth 세션**: RN에서 앱 재시작 시 로그아웃 (inMemoryPersistence)
2. **푸시 토큰**: storeId/department 할당 전에 expoPushToken 저장
3. **배치 처리**: 500개 이상 writes는 450개씩 쪼개기
4. **초대 코드**: 8자리 대문자 영숫자 (중복 확인)
5. **Firestore 인덱스**: array-contains 쿼리 불가 → 'in' 사용

---

## 11. 매장재고 조회 기능 추가 계획

### 추가될 파일

```
admin/
  └── inventory/
      ├── index.tsx       ← 재고 목록
      └── detail.tsx      ← 재고 상세 (optional)

lib/
  └── wmsApi.ts          ← WMS API 호출 (새로 추가)

components/
  └── InventoryTable.tsx ← 재고 표 컴포넌트
```

### 데이터 흐름

```
[조회 버튼]
  ↓
WMS API 호출 (https://backend.dheska.com/inventory)
  ↓
응답 데이터:
{
  skuCode: "10001-001-M10W12",
  makerCode: "841158002474",
  skuName: "Classic Blk M10/W12",
  locationCode: "A-1",
  onHand: 145,
  storeId: "store-001"
}
  ↓
화면에 표시
```

---

## 결론

**store-notice-app**은 **Multi-tenant 기반 직원 공지 시스템**으로:

- **관리자**: 회사별 공지 작성 + 직원 승인 + 조직 관리
- **직원**: 자신의 매장/부서에 맞는 공지만 수신
- **자동화**: Firebase Functions로 receipts 생성 + 푸시 자동 발송
- **확장성**: 모든 데이터가 companyId로 완벽하게 격리되어 다중 조직 동시 운영 가능

**다음 단계**: WMS와 연동하여 매장재고 조회 기능 추가
