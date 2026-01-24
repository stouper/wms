// app/admin/notices/index.tsx
// ✅ PostgreSQL 연동: 공지 목록 (Firebase → PostgreSQL 마이그레이션 완료)

import React, { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getMessages,
  getEmployees,
  MessageInfo,
} from "../../../lib/authApi";

export default function AdminNoticeList() {
  const router = useRouter();
  const [items, setItems] = useState<MessageInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  // pendingCount 로드
  const loadPendingCount = useCallback(async () => {
    try {
      const employees = await getEmployees("PENDING");
      setPendingCount(employees.length);
    } catch (error) {
      console.error("loadPendingCount error:", error);
    }
  }, []);

  useEffect(() => {
    loadPendingCount();
  }, [loadPendingCount]);

  // 공지 목록 로드
  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getMessages(50, 0);
      setItems(result.rows);
    } catch (e: any) {
      console.error("[AdminNoticeList] load error:", e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>공지 목록</Text>

        {loading && (
          <View style={styles.center}>
            <ActivityIndicator color="#1E5BFF" />
            <Text style={styles.muted}>공지 목록 불러오는 중...</Text>
          </View>
        )}

        {!loading && items.length === 0 && (
          <Card>
            <EmptyState
              title="등록된 공지가 없습니다"
              subtitle="'새 공지 작성'에서 공지를 추가하세요"
            />
          </Card>
        )}

        {!loading &&
          items.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => router.push(`/admin/notices/${m.id}`)}
              style={styles.item}
              android_ripple={{ color: "#111827" }}
            >
              <Text style={styles.itemTitle} numberOfLines={1}>
                {m.title}
              </Text>
              <Text style={styles.itemSub}>{formatDate(m.createdAt)}</Text>
            </Pressable>
          ))}
        <View style={{ height: 8 }} />
      </ScrollView>

      {/* 하단 네비게이션 바 */}
      <SafeAreaView edges={["bottom"]} style={styles.bottomNavContainer}>
        <View style={styles.bottomNav}>
          <Pressable
            onPress={() => router.push("/admin")}
            style={styles.navButton}
          >
            <Text style={styles.navIcon}>🏠</Text>
            <Text style={styles.navText}>홈</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/admin/organization")}
            style={styles.navButton}
          >
            <Text style={styles.navIcon}>📊</Text>
            <Text style={styles.navText}>조직도</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/admin/settings")}
            style={styles.navButton}
          >
            <View style={styles.navIconContainer}>
              <Text style={styles.navIcon}>⚙️</Text>
              {pendingCount > 0 && (
                <View style={styles.navBadge}>
                  <Text style={styles.navBadgeText}>{pendingCount}</Text>
                </View>
              )}
            </View>
            <Text style={styles.navText}>설정</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B0C10" },
  container: { paddingHorizontal: 16, paddingTop: 8, gap: 12, paddingBottom: 100 },
  title: { color: "#E6E7EB", fontSize: 20, fontWeight: "700", marginBottom: 4 },
  center: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 40,
  },
  muted: { color: "#A9AFBC", fontSize: 14 },
  item: {
    backgroundColor: "#1A1D24",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2A2F3A",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  itemTitle: { color: "#E6E7EB", fontSize: 16, fontWeight: "600" },
  itemSub: { color: "#A9AFBC", marginTop: 2, fontSize: 12 },

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
  navIconContainer: {
    position: "relative",
  },
  navIcon: {
    fontSize: 16,
    marginBottom: 2,
    opacity: 0.5,
  },
  navBadge: {
    position: "absolute",
    top: -3,
    right: -6,
    backgroundColor: "#EF4444",
    minWidth: 12,
    height: 12,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  navBadgeText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "900",
  },
  navText: {
    color: "#A9AFBC",
    fontSize: 9,
    fontWeight: "600",
    opacity: 0.5,
  },
});
