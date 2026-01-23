// app/admin/notices/index.tsx
// ✅ Multi-tenant: companyId로 messages 필터링

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from "react-native";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  Timestamp,
  doc,
  onSnapshot,
} from "firebase/firestore";
import { useRouter } from "expo-router";
import { auth, db } from "../../../firebaseConfig";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import { SafeAreaView } from "react-native-safe-area-context";

type Message = {
  id: string;
  title: string;
  createdAt?: Timestamp | null;
};

export default function AdminNoticeList() {
  const router = useRouter();
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null);
  const [items, setItems] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  // 내 companyId 가져오기 + pendingCount
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    let unsubPending: (() => void) | undefined;

    const unsub = onSnapshot(doc(db, "users", uid), (snap) => {
      if (snap.exists()) {
        const companyId = (snap.data() as any)?.companyId;
        setMyCompanyId(companyId || null);

        if (companyId) {
          // PENDING 사용자 수 실시간 가져오기
          const pendingQuery = query(
            collection(db, "users"),
            where("companyId", "==", companyId),
            where("status", "==", "PENDING")
          );
          unsubPending = onSnapshot(pendingQuery, (snapshot) => {
            setPendingCount(snapshot.size);
          });
        }
      }
    });

    return () => {
      unsub();
      unsubPending?.();
    };
  }, []);

  const load = async () => {
    if (!myCompanyId) return;

    setLoading(true);
    try {
      // ✅ companyId로 필터링
      const q = query(
        collection(db, "messages"),
        where("companyId", "==", myCompanyId),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      const list: Message[] = [];
      snap.forEach((d) => {
        const m = d.data() as any;
        list.push({
          id: d.id,
          title: m?.title ?? "(제목 없음)",
          createdAt: m?.createdAt ?? null,
        });
      });
      setItems(list);
    } catch (e: any) {
      console.error("[AdminNoticeList] load error:", e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [myCompanyId]);

  if (!myCompanyId) {
    return (
      <View style={styles.root}>
        <View style={styles.center}>
          <ActivityIndicator color="#1E5BFF" />
          <Text style={styles.muted}>회사 정보를 불러오는 중...</Text>
        </View>
      </View>
    );
  }

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
          items.map((m) => {
            const dateText = m.createdAt?.toDate
              ? m.createdAt.toDate().toLocaleString()
              : "-";
            return (
              <Pressable
                key={m.id}
                onPress={() => router.push(`/admin/notices/${m.id}`)}
                style={styles.item}
                android_ripple={{ color: "#111827" }}
              >
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {m.title}
                </Text>
                <Text style={styles.itemSub}>{dateText}</Text>
              </Pressable>
            );
          })}
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
