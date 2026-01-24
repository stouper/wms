// app/staff/notices/index.tsx
// 직원용 받은 공지 목록 - PostgreSQL 기반

import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth } from "../../../firebaseConfig";
import { getMyMessages } from "../../../lib/authApi";

type MessageReceipt = {
  id: string;
  messageId: string;
  title: string;
  body: string;
  read: boolean;
  readAt?: string;
  createdAt: string;
};

export default function StaffNoticesList() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<MessageReceipt[]>([]);

  useEffect(() => {
    if (!auth.currentUser) return;

    loadMessages();
  }, []);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const data = await getMyMessages(100, 0);
      setMessages(data);
    } catch (error) {
      console.error("Failed to load messages:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.push("/staff")}>
            <Text style={styles.backButton}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>받은 공지</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color="#1E5BFF" />
          <Text style={styles.muted}>공지 목록을 불러오는 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.push("/staff")}>
          <Text style={styles.backButton}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>받은 공지</Text>
        <View style={{ width: 24 }} />
      </View>

      {messages.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>받은 공지가 없습니다.</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContainer}
          data={messages}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => {
            return (
              <Pressable
                onPress={() => router.push(`/staff/notices/${item.messageId}`)}
                style={[styles.card, !item.read ? styles.cardUnread : null]}
                android_ripple={{ color: "#111827" }}
              >
                <View style={styles.rowHead}>
                  <Text style={[styles.title, !item.read && styles.titleBold]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {!item.read && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>미확인</Text>
                    </View>
                  )}
                </View>

                {!!item.body && (
                  <Text numberOfLines={2} style={styles.desc}>
                    {item.body}
                  </Text>
                )}
              </Pressable>
            );
          }}
        />
      )}

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
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  muted: { color: "#A9AFBC", fontSize: 14 },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  emptyText: { color: "#A9AFBC", textAlign: "center" },

  listContainer: { padding: 16, paddingBottom: 100 },

  card: {
    borderWidth: 1,
    borderColor: "#2A2F3A",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#1A1D24",
  },
  cardUnread: { backgroundColor: "#111827" },

  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: "#E6E7EB", fontSize: 16, fontWeight: "500", flex: 1 },
  titleBold: { fontWeight: "800" },
  desc: { marginTop: 6, color: "#A9AFBC" },

  badge: {
    backgroundColor: "#7f1d1d",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  badgeText: { color: "#E6E7EB", fontWeight: "700", fontSize: 12 },

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
