// lib/push/registerPushToken.ts
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import {
  doc, getDoc,
  serverTimestamp,
  setDoc, updateDoc,
} from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";
import { updatePushToken } from "../authApi";

/**
 * 로그인 직후 1회 호출:
 * - 권한 허용 시 최신 Expo Push Token 발급
 * - role이 'staff'인 경우에만 users/{uid}에 저장/갱신
 * - 관리자/기타 계정은 등록 스킵 (오발송/오류 방지)
 */
export async function registerPushToken() {
  const u = auth.currentUser;
  if (!u) return;

  // 현재 유저 role 확인
  const userRef = doc(db, "users", u.uid);
  const userSnap = await getDoc(userRef);
  const me = userSnap.exists() ? (userSnap.data() as any) : null;

  // 🔒 직원만 토큰 등록 허용 (관리자/기타는 스킵)
  if (!me || me.role !== "staff") return;

  // 알림 권한
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") {
    // 권한 거부 → 조용히 종료 (앱은 계속 사용가능)
    await updateDoc(userRef, {
      notificationEnabled: false,
      pushUpdatedAt: serverTimestamp(),
    }).catch(() => {});
    return;
  }

  // Expo Push Token 발급 (EAS projectId 필요)
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  // 기존 토큰과 비교하여 변경된 경우에만 업데이트
  const currentToken = me?.expoPushToken;
  const currentPlatform = me?.pushPlatform;
  const newPlatform = Constants.platform?.ios ? "ios" : "android";
  
  // 토큰이 변경되었거나 플랫폼이 변경된 경우에만 업데이트
  if (currentToken === token && currentPlatform === newPlatform && me?.notificationEnabled === true) {
    return; // 변경사항 없음
  }

  const payload = {
    expoPushToken: token,
    notificationEnabled: true,
    pushPlatform: newPlatform,
    pushUpdatedAt: serverTimestamp(),
  };

  // userSnap.exists()는 이미 확인했으므로 항상 true
  // 하지만 안전을 위해 merge 옵션 사용
  await updateDoc(userRef, payload).catch(async () => {
    // 만약 문서가 없다면 (이론적으로 불가능하지만) 생성
    // 이 경우 role은 이미 확인했으므로 staff로 설정
    await setDoc(userRef, {
      role: "staff",
      active: me?.active ?? true,
      createdAt: serverTimestamp(),
      ...payload,
    });
  });

  // ✅ core-api Employee에도 푸시 토큰 저장
  try {
    await updatePushToken(token);
  } catch (error) {
    console.warn("core-api push token update failed:", error);
  }
}
