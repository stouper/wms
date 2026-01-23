# 개발 가이드

## 📱 현재 개발 환경 상태

**Development Build 설치 완료**
- 빌드 타입: Development (개발용)
- 설치 파일: https://expo.dev/accounts/stouper/projects/store-notice-app/builds/8487ca56-3e32-481f-a12b-01453bc26556
- 특징: expo start로 실시간 코드 업데이트 가능

---

## 🚀 매일 개발 워크플로우

### 1️⃣ 개발 시작 (매일 아침)

```bash
# PowerShell 또는 터미널에서
expo start
```

- **한 번만 실행하고 계속 켜두세요!**
- QR 코드가 표시됨
- Android 앱이 자동으로 연결됨

### 2️⃣ 코드 수정 (하루 종일)

```
1. VS Code에서 파일 수정
2. Ctrl+S (저장)
3. 앱에 자동으로 반영됨! (몇 초 안에)
```

- expo start는 **계속 켜진 상태**
- 저장할 때마다 자동 업데이트
- 앱 재설치 필요 없음

### 3️⃣ 개발 종료 (저녁)

```bash
Ctrl+C  # expo start 종료
```

---

## 🔧 Development Build vs Preview Build

| 항목 | Development Build (현재) | Preview Build |
|------|------------------------|---------------|
| 사용 목적 | 개발 | 배포/테스트 |
| expo start | ✅ 필요 | ❌ 불필요 |
| 코드 수정 반영 | 즉시 (몇 초) | 다시 빌드 (15-20분) |
| 빌드 명령어 | `eas build -p android --profile development` | `eas build -p android --profile preview` |

---

## 📝 언제 재빌드가 필요한가?

### ❌ 재빌드 불필요 (expo start만 사용)
- React 컴포넌트 수정
- UI 스타일 변경
- 비즈니스 로직 변경
- 순수 JavaScript 코드 변경
- Firebase 규칙 변경 (firebase deploy만)

### ✅ 재빌드 필요 (다시 EAS Build)
- app.json 수정 (권한, 플러그인 등)
- 새로운 네이티브 모듈 추가
- 패키지명, 버전 변경
- Android/iOS 네이티브 설정 변경

**재빌드 명령어:**
```bash
# Development Build (개발용)
eas build -p android --profile development

# Preview Build (배포 전 테스트용)
eas build -p android --profile preview
```

---

## 🔥 Firebase 규칙 배포

코드 변경은 expo start로 자동 반영되지만, **Firebase 규칙은 별도 배포 필요:**

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

## 🎯 일반적인 개발 시나리오

### 시나리오 1: UI 색상 변경
```bash
1. VS Code에서 색상 코드 수정
2. Ctrl+S 저장
3. 앱에서 즉시 확인 ✅
```

### 시나리오 2: 새 페이지 추가
```bash
1. app/ 폴더에 새 파일 생성
2. 코드 작성 후 저장
3. 앱에서 즉시 확인 ✅
```

### 시나리오 3: Firebase 규칙 수정
```bash
1. firestore.rules 수정
2. firebase deploy --only firestore:rules
3. 앱에서 테스트 ✅
```

### 시나리오 4: 새 권한 추가 (예: 위치 권한)
```bash
1. app.json에 권한 추가
2. eas build -p android --profile development
3. 새 APK 다운로드 및 설치 (15-20분 소요)
```

---

## 🐛 문제 해결

### 앱이 "Connecting to Metro..."에서 멈춤
```bash
# PowerShell에서 확인
expo start  # 실행 중인지 확인

# 안 되면 재시작
Ctrl+C  # 종료
expo start  # 다시 시작
```

### 코드 수정이 반영 안 됨
```bash
# 앱에서 새로고침
1. 앱 화면을 흔들기 (Shake)
2. "Reload" 선택

# 또는 expo start 재시작
Ctrl+C
expo start
```

### 빌드 에러
```bash
# 캐시 삭제 후 재시작
expo start --clear

# node_modules 재설치
rm -rf node_modules
npm install
expo start
```

---

## 📦 현재 프로젝트 구조

```
store-notice-app/
├── app/                    # 화면/페이지
│   ├── admin/             # 관리자 페이지
│   │   ├── board/         # 게시판 (이미지/파일 첨부 가능)
│   │   ├── notices/       # 공지사항
│   │   └── ...
│   └── ...
├── components/            # 재사용 컴포넌트
├── lib/                   # 유틸리티 함수
│   └── uploadFile.ts      # Firebase Storage 업로드
├── firebaseConfig.js      # Firebase 설정
├── app.json              # Expo 앱 설정
├── eas.json              # EAS Build 설정
├── firestore.rules       # Firestore 보안 규칙
├── storage.rules         # Storage 보안 규칙
└── package.json          # 의존성
```

---

## 🎓 개발 팁

1. **expo start는 항상 켜두세요** - 종료하면 앱이 업데이트 안 됨
2. **저장만 하면 됩니다** - 별도 명령어 불필요
3. **Firebase 규칙은 따로 배포** - `firebase deploy` 사용
4. **네이티브 변경은 재빌드** - app.json 수정 시 다시 빌드

---

## 📞 주요 명령어 요약

```bash
# 개발 시작
expo start

# Firebase 규칙 배포
firebase deploy --only firestore:rules,storage

# 재빌드 (필요 시)
eas build -p android --profile development

# QR 코드 표시
npx qrcode-terminal "다운로드URL"
```

---

## ✅ 완료된 기능

- ✅ 사용자 인증 (Firebase Auth)
- ✅ 공지사항 시스템
- ✅ 게시판 (이미지/파일 첨부 가능)
- ✅ 푸시 알림
- ✅ 멀티 테넌트 (회사별 분리)
- ✅ 관리자/직원 권한 관리
- ✅ Firebase Storage 연동

---

**마지막 업데이트:** 2026-01-20
**현재 버전:** Development Build (개발용)
