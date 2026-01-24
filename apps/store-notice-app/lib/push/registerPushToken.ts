// lib/push/registerPushToken.ts
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { auth } from "../../firebaseConfig";
import { updatePushToken } from "../authApi";

/**
 * 로그인 직후 1회 호출:
 * - 권한 허용 시 최신 Expo Push Token 발급
 * - PostgreSQL Employee에 푸시 토큰 저장
 */
export async function registerPushToken() {
  const u = auth.currentUser;
  if (!u) return;

  // 알림 권한
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") {
    // 권한 거부 → 조용히 종료 (앱은 계속 사용가능)
    return;
  }

  // Expo Push Token 발급 (EAS projectId 필요)
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  // ✅ core-api Employee에 푸시 토큰 저장
  try {
    await updatePushToken(token);
  } catch (error) {
    console.warn("core-api push token update failed:", error);
  }
}
