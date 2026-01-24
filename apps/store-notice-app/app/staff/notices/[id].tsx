// app/staff/notices/[id].tsx
// 직원용 공지 상세 보기 - PostgreSQL 기반

import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Alert, ScrollView, StyleSheet, Text, View, ActivityIndicator, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth } from "../../../firebaseConfig";
import { getMessage, markMessageAsRead, getStores, MessageInfo } from "../../../lib/authApi";

type TargetType = "ALL" | "STORE" | "HQ_DEPT";

function safeArray(v: any): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

export default function StaffNoticeDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams() as { id: string };

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<MessageInfo | null>(null);
  const [storeNameMap, setStoreNameMap] = useState<Record<string, string>>({});

  // PostgreSQL에서 매장 목록 가져오기 (라벨용)
  const loadStores = useCallback(async () => {
    try {
      const stores = await getStores();
      const map: Record<string, string> = {};
      stores.forEach((s) => {
        map[s.id] = s.name || s.code;
      });
      setStoreNameMap(map);
    } catch (e) {
      console.log("[Detail] stores load error:", e);
    }
  }, []);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  useEffect(() => {
    if (!id) return;

    loadMessage();
  }, [id]);

  const loadMessage = async () => {
    setLoading(true);
    try {
      const result = await getMessage(id);
      if (!result) {
        Alert.alert("안내", "해당 공지는 삭제되었습니다.", [
          { text: "확인", onPress: () => router.replace("/staff/notices") },
        ]);
        return;
      }

      setMessage(result);
    } catch (e) {
      console.log("[Detail] load error:", e);
      Alert.alert("오류", "공지를 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  };

  const targetText = useMemo(() => {
    if (!message) return "대상: 전체";

    const t: TargetType = message.targetType as TargetType;
    const storeIds = safeArray(message.targetStoreIds);
    const deptCodes = safeArray(message.targetDeptCodes);

    if (t === "STORE") {
      if (storeIds.length === 0) return "대상: 매장(미지정)";
      const names = storeIds.map((sid) => storeNameMap[sid] ?? sid).join(", ");
      return `대상: 매장 · ${names}`;
    }

    if (t === "HQ_DEPT") {
      if (deptCodes.length === 0) return "대상: 본사부서(미지정)";
      const names = deptCodes.join(", ");
      return `대상: 본사부서 · ${names}`;
    }

    return "대상: 전체";
  }, [message, storeNameMap]);

  const markRead = async () => {
    if (!auth.currentUser || !id) return;

    try {
      const result = await markMessageAsRead(id);
      if (result.success) {
        Alert.alert("완료", "확인 처리되었습니다.");
        router.back();
      } else {
        Alert.alert("오류", result.error ?? "확인 처리에 실패했습니다.");
      }
    } catch (e: any) {
      console.log("[Detail] markRead error:", e);
      Alert.alert("오류", "확인 처리에 실패했습니다.");
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.push("/staff/notices")}>
            <Text style={styles.backButton}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>공지 상세</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#1E5BFF" />
          <Text style={styles.muted}>공지를 불러오는 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.push("/staff/notices")}>
          <Text style={styles.backButton}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>공지 상세</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{message?.title ?? ""}</Text>
        <Text style={styles.target}>{targetText}</Text>
        <Text style={styles.body}>{message?.body ?? ""}</Text>

        <View style={{ height: 20 }} />

        <Pressable onPress={markRead} style={styles.confirmButton}>
          <Text style={styles.confirmButtonText}>확인했습니다</Text>
        </Pressable>
      </ScrollView>

      {/* 하단 네비게이션 바 */}
      <SafeAreaView edges={["bottom"]} style={styles.bottomNavContainer}>
        <View style={styles.bottomNav}>
          <Pressable
            onPress={() => router.push("/staff")}
            style={styles.navButton}
          >
            <Text style={styles.navIcon}>🏠</Text>
            <Text style={styles.navText}>홈</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/staff/settings")}
            style={styles.navButton}
          >
            <Text style={styles.navIcon}>⚙️</Text>
            <Text style={styles.navText}>설정</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B0C10" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2F3A",
  },
  backButton: {
    color: "#E6E7EB",
    fontSize: 28,
    fontWeight: "300",
  },
  headerTitle: {
    color: "#E6E7EB",
    fontSize: 18,
    fontWeight: "700",
  },
  container: {
    padding: 16,
    paddingBottom: 100,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  muted: { color: "#A9AFBC", fontSize: 14 },
  title: {
    color: "#E6E7EB",
    fontSize: 20,
    fontWeight: "700",
  },
  target: {
    marginTop: 10,
    color: "#A9AFBC",
    fontWeight: "700",
    fontSize: 13,
  },
  body: {
    marginTop: 12,
    lineHeight: 20,
    color: "#A9AFBC",
  },
  confirmButton: {
    backgroundColor: "#1E5BFF",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },

  bottomNavContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#1A1D24",
  },
  bottomNav: {
    flexDirection: "row",
    backgroundColor: "#1A1D24",
    borderTopWidth: 1,
    borderTopColor: "#2A2F3A",
    paddingVertical: 4,
    paddingHorizontal: 16,
  },
  navButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  navIcon: {
    fontSize: 16,
    marginBottom: 2,
    opacity: 0.5,
  },
  navText: {
    color: "#A9AFBC",
    fontSize: 9,
    fontWeight: "600",
    opacity: 0.5,
  },
});
