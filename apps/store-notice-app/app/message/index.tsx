// app/message/index.tsx
// ✅ Multi-tenant: companyId로 receipts 필터링 + 신규 스키마 반영

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
import { auth, db } from "../../firebaseConfig";

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

  // ✅ 타겟(확장)
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
  // ✅ 같은 회사인지 확인
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

  // HQ_DEPT
  const myDept = me.department ?? null;
  if (!myDept) return false;
  return t.depts.includes(myDept);
}

export default function StaffMessageList() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);

  const [me, setMe] = useState<Me | null>(null);
  const [meReady, setMeReady] = useState(false);

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [messages, setMessages] = useState<Record<string, Message>>({});

  const unsubReceiptsRef = useRef<(() => void) | undefined>(undefined);
  const unsubMeRef = useRef<(() => void) | undefined>(undefined);

  // ✅ 1) 내 users 문서 먼저 실시간 구독
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

  // ✅ 2) receipts 실시간 구독 (같은 회사만)
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

          // createdAt 기준으로 정렬 (안전장치)
          rows.sort((a, b) => {
            if (!a.createdAt && !b.createdAt) return 0;
            if (!a.createdAt) return 1;
            if (!b.createdAt) return -1;
            const aTime = a.createdAt?.toMillis?.() ?? 0;
            const bTime = b.createdAt?.toMillis?.() ?? 0;
            return bTime - aTime;
          });

          setReceipts(rows);

          // ✅ 3) 필요한 messages만 가져오기
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

                      // ✅ companyId 검증
                      if (m.companyId !== me.companyId) continue;

                      // ✅ 타겟 2차 필터
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

  // ✅ 화면 표시용 데이터: receipts 중에서 message가 있는 것만
  const data = useMemo(() => {
    return receipts.filter((r) => !!messages[r.messageId]);
  }, [receipts, messages]);

  // 로딩: receipts 로딩 + me 로딩 둘 다 고려
  const stillLoading = loading || !meReady;

  if (stillLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1E5BFF" />
        <Text style={styles.muted}>공지 목록을 불러오는 중...</Text>
      </View>
    );
  }

  if (data.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>받은 공지가 없습니다.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
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
              onPress={() => router.push(`/message/${item.messageId}`)}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B0C10" },
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

  listContainer: { padding: 16, paddingBottom: 20 },

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
});
