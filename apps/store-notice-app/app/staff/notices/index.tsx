// app/staff/notices/index.tsx
// 직원용 받은 공지 목록

import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../../../firebaseConfig";

type Receipt = {
  id: string;
  messageId: string;
  companyId?: string;
  read: boolean;
  createdAt?: any;
};

type Message = {
  id: string;
  title?: string;
  body?: string;
  companyId?: string;
  createdAt?: any;
  targetType?: "ALL" | "STORE" | "HQ_DEPT";
  targetStoreIds?: string[] | null;
  targetDeptCodes?: string[] | null;
};

type Me = {
  companyId?: string;
  role?: "OWNER" | "MANAGER" | "SALES";
  status?: "PENDING" | "ACTIVE" | "REJECTED" | "DISABLED";
  storeId?: string | null;
  department?: string | null;
};

function normalizeTarget(m: Message): {
  type: "ALL" | "STORE" | "HQ_DEPT";
  stores: string[];
  depts: string[];
} {
  const type = (m.targetType ?? "ALL") as any;
  const stores = Array.isArray(m.targetStoreIds) ? m.targetStoreIds : [];
  const depts = Array.isArray(m.targetDeptCodes) ? m.targetDeptCodes : [];

  if (type === "STORE") return { type: "STORE", stores, depts: [] };
  if (type === "HQ_DEPT") return { type: "HQ_DEPT", stores: [], depts };
  return { type: "ALL", stores: [], depts: [] };
}

function isVisibleForMe(m: Message, me: Me | null): boolean {
  if (m.companyId && me?.companyId && m.companyId !== me.companyId) {
    return false;
  }

  const t = normalizeTarget(m);
  if (t.type === "ALL") return true;

  if (!me) return false;

  if (t.type === "STORE") {
    const myStore = me.storeId ?? null;
    if (!myStore) return false;
    return t.stores.includes(myStore);
  }

  const myDept = me.department ?? null;
  if (!myDept) return false;
  return t.depts.includes(myDept);
}

export default function StaffNoticesList() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [meReady, setMeReady] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [messages, setMessages] = useState<Record<string, Message>>({});

  const unsubReceiptsRef = useRef<(() => void) | undefined>(undefined);
  const unsubMeRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;

    if (unsubMeRef.current) {
      unsubMeRef.current();
      unsubMeRef.current = undefined;
    }

    setMe(null);
    setMeReady(false);

    unsubMeRef.current = onSnapshot(
      doc(db, "users", u.uid),
      (snap) => {
        setMe(snap.exists() ? (snap.data() as any) : null);
        setMeReady(true);
      },
      (err) => {
        console.log("[Me] onSnapshot error:", err);
        setMe(null);
        setMeReady(true);
      }
    );

    return () => {
      if (unsubMeRef.current) unsubMeRef.current();
    };
  }, []);

  useEffect(() => {
    const u = auth.currentUser;
    if (!u || !me?.companyId) return;

    if (unsubReceiptsRef.current) {
      unsubReceiptsRef.current();
      unsubReceiptsRef.current = undefined;
    }

    setLoading(true);
    setReceipts([]);
    setMessages({});

    const q = query(
      collection(db, "receipts"),
      where("userId", "==", u.uid),
      where("companyId", "==", me.companyId),
      orderBy("createdAt", "desc")
    );

    unsubReceiptsRef.current = onSnapshot(
      q,
      async (snap) => {
        try {
          const rows: Receipt[] = [];
          const messageIds = new Set<string>();

          snap.forEach((d) => {
            const data = d.data() as any;
            rows.push({
              id: d.id,
              messageId: data.messageId,
              companyId: data.companyId,
              read: !!data.read,
              createdAt: data.createdAt,
            });
            if (data.messageId) messageIds.add(data.messageId);
          });

          rows.sort((a, b) => {
            if (!a.createdAt && !b.createdAt) return 0;
            if (!a.createdAt) return 1;
            if (!b.createdAt) return -1;
            const aTime = a.createdAt?.toMillis?.() ?? 0;
            const bTime = b.createdAt?.toMillis?.() ?? 0;
            return bTime - aTime;
          });

          setReceipts(rows);

          setMessages((prev) => {
            const toFetch: string[] = [];
            messageIds.forEach((mid) => {
              if (!prev[mid]) toFetch.push(mid);
            });

            if (toFetch.length > 0) {
              (async () => {
                for (const mid of toFetch) {
                  try {
                    const msnap = await getDoc(doc(db, "messages", mid));
                    if (msnap.exists()) {
                      const m: Message = { id: msnap.id, ...(msnap.data() as any) };
                      if (m.companyId !== me.companyId) continue;
                      if (!isVisibleForMe(m, me)) continue;

                      setMessages((current) => ({
                        ...current,
                        [mid]: m,
                      }));
                    }
                  } catch (e) {
                    console.log("[StaffList] message fetch error:", e);
                  }
                }
              })();
            }

            return prev;
          });

          setLoading(false);
        } catch (e: any) {
          console.error("[StaffList] onSnapshot callback error:", e);
          setLoading(false);
        }
      },
      (err) => {
        console.error("[StaffList] onSnapshot error:", err);
        Alert.alert(
          "오류",
          err?.code === "failed-precondition"
            ? "인덱스가 생성 중입니다. 잠시 후 다시 시도해 주세요."
            : err?.message ?? "데이터를 불러오는 중 오류가 발생했습니다."
        );
        setLoading(false);
      }
    );

    return () => {
      if (unsubReceiptsRef.current) unsubReceiptsRef.current();
    };
  }, [me?.companyId, me?.storeId, me?.department, meReady]);

  const data = useMemo(() => {
    return receipts.filter((r) => !!messages[r.messageId]);
  }, [receipts, messages]);

  const stillLoading = loading || !meReady;

  if (stillLoading) {
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

      {data.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>받은 공지가 없습니다.</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContainer}
          data={data}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => {
            const m = messages[item.messageId];
            const title = m?.title ?? "(삭제된 공지)";
            const desc = m?.body ?? "";

            return (
              <Pressable
                onPress={() => router.push(`/staff/notices/${item.messageId}`)}
                style={[styles.card, !item.read ? styles.cardUnread : null]}
                android_ripple={{ color: "#111827" }}
              >
                <View style={styles.rowHead}>
                  <Text style={[styles.title, !item.read && styles.titleBold]} numberOfLines={1}>
                    {title}
                  </Text>
                  {!item.read && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>미확인</Text>
                    </View>
                  )}
                </View>

                {!!desc && (
                  <Text numberOfLines={2} style={styles.desc}>
                    {desc}
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
