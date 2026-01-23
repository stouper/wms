// app/_layout.tsx
// ✅ Safe Area 적용된 Root Layout (상단 상태바/노치 겹침 해결)
// - react-native-safe-area-context 사용
// - 알림 클릭 라우팅 로직 유지

import React, { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import {
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

// 포그라운드에서도 알림 표시 허용
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    // 알림 클릭 시 라우팅 처리
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        try {
          const data: any =
            response?.notification?.request?.content?.data ?? {};
          const messageId = String(data?.messageId ?? data?.id ?? "").trim();
          if (!messageId) return;

          const hint =
            String(data?.target ?? data?.route ?? "").toLowerCase() ||
            (data?.isAdmin ? "admin" : "");

          if (hint === "admin") {
            router.push(`/admin/notices/${messageId}`);
          } else {
            router.push(`/message/${messageId}`);
          }
        } catch (e) {
          console.log("[_layout] notification route error:", e);
        }
      }
    );

    return () => sub.remove();
  }, [router]);

  return (
    <SafeAreaProvider>
      {/* 상태바 영역 확보 */}
      <StatusBar style="dark" />

      {/* 실제 화면 Safe Area */}
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "fade",
          }}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
