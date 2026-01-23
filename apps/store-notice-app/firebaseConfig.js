// firebaseConfig.ts
import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {
  initializeAuth,
  getAuth,
  inMemoryPersistence, // 👈 영구 저장 안 함 (앱 종료 시 세션 삭제)
} from "firebase/auth";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";

// ✅ 아시아 리전 (eska-office 프로젝트)
const firebaseConfig = {
  apiKey: "AIzaSyBex-AI1IAniXEhwltucDsv4QlXm7oDzlE",
  authDomain: "eska-office.firebaseapp.com",
  projectId: "eska-office",
  storageBucket: "eska-office.firebasestorage.app",
  messagingSenderId: "827314599653",
  appId: "1:827314599653:web:2bb15bff8b72883ce6c60c",
  measurementId: "G-G5ETYGBNEB",
};

// 앱 싱글톤
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// ✅ RN에서는 메모리 퍼시스턴스로 강제 (앱 재시작 시 항상 로그아웃 상태)
export const auth =
  Platform.OS === "web"
    ? getAuth(app) // 웹은 기본 동작 유지(원하면 이쪽도 조정 가능)
    : (() => {
        try {
          return initializeAuth(app, {
            persistence: inMemoryPersistence,
          });
        } catch {
          return getAuth(app);
        }
      })();

export const db = getFirestore(app);
export const storage = getStorage(app);
