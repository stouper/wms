// app/staff/notices/[id].tsx
// 직원용 공지 상세 보기

import { useLocalSearchParams, useRouter } from "expo-router";
import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, ScrollView, StyleSheet, Text, View, ActivityIndicator, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../../../firebaseConfig";

type TargetType = "ALL" | "STORE" | "HQ_DEPT";

function safeArray(v: any): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

export default function StaffNoticeDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams() as { id: string };

  const [myCompanyId, setMyCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState<string>("");
  const [body, setBody] = useState<string>("");
  const [message, setMessage] = useState<any>(null);
  const [storeNameMap, setStoreNameMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const unsub = onSnapshot(doc(db, "users", uid), (snap) => {
      if (snap.exists()) {
        const companyId = (snap.data() as any)?.companyId;
        setMyCompanyId(companyId || null);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!myCompanyId) return;

    (async () => {
      try {
        const q = query(
          collection(db, "stores"),
          where("companyId", "==", myCompanyId)
        );
        const snap = await getDocs(q);
        const map: Record<string, string> = {};
        snap.forEach((d) => {
          const data = d.data() as any;
          map[d.id] = (data?.name ?? d.id) as string;
        });
        setStoreNameMap(map);
      } catch (e) {
        console.log("[Detail] stores load error:", e);
      }
    })();
  }, [myCompanyId]);

  useEffect(() => {
    if (!myCompanyId || !id) return;

    (async () => {
      try {
        const msnap = await getDoc(doc(db, "messages", id));

        if (!msnap.exists()) {
          Alert.alert("안내", "해당 공지는 삭제되었습니다.", [
            { text: "확인", onPress: () => router.replace("/staff/notices") },
          ]);
          return;
        }

        const m = msnap.data() as any;

        if (m?.companyId !== myCompanyId) {
          Alert.alert("권한 없음", "다른 회사의 공지입니다.", [
            { text: "확인", onPress: () => router.replace("/staff/notices") },
          ]);
          return;
        }

        setMessage(m);
        setTitle(m?.title ?? "");
        setBody(m?.body ?? "");
      } catch (e) {
        console.log("[Detail] load error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, myCompanyId, router]);

  const targetText = useMemo(() => {
    const m = message ?? {};
    const t: TargetType = (m?.targetType ?? "ALL") as TargetType;
    const storeIds = safeArray(m?.targetStoreIds);
    const deptCodes = safeArray(m?.targetDeptCodes);

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
    const u = auth.currentUser;
    if (!u || !myCompanyId) return;

    try {
      const receiptId = `${id}_${u.uid}`;
      const receiptRef = doc(db, "receipts", receiptId);

      const receiptSnap = await getDoc(receiptRef);
      if (!receiptSnap.exists()) {
        Alert.alert("안내", "이미 삭제되었거나 확인 대상이 아닙니다.", [
          { text: "확인", onPress: () => router.replace("/staff/notices") },
        ]);
        return;
      }

      const receiptData = receiptSnap.data() as any;

      if (receiptData?.companyId !== myCompanyId) {
        Alert.alert("권한 없음", "다른 회사의 공지입니다.", [
          { text: "확인", onPress: () => router.replace("/staff/notices") },
        ]);
        return;
      }

      if (receiptData?.read) {
        Alert.alert("안내", "이미 확인 처리된 공지입니다.");
        router.back();
        return;
      }

      await updateDoc(receiptRef, { read: true, readAt: serverTimestamp() });

      Alert.alert("완료", "확인 처리되었습니다.");
      router.back();
    } catch (e: any) {
      console.log("[Detail] markRead error:", e);
      Alert.alert("오류", e?.message ?? "확인 처리에 실패했습니다.");
    }
  };

  if (!myCompanyId || loading) {
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
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.target}>{targetText}</Text>
        <Text style={styles.body}>{body}</Text>

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
