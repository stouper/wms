// app/message/[id].tsx
// ✅ PostgreSQL 연동: 매장 목록은 core-api에서 가져옴

import { useLocalSearchParams, useRouter } from "expo-router";
import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  onSnapshot,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Alert, Button, ScrollView, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { auth, db } from "../../firebaseConfig";
import { getStores } from "../../lib/authApi";

type TargetType = "ALL" | "STORE" | "HQ_DEPT";

function safeArray(v: any): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

export default function StaffMessageDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams() as { id: string };

  const [myCompanyId, setMyCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState<string>("");
  const [body, setBody] = useState<string>("");

  const [message, setMessage] = useState<any>(null);

  // ✅ stores 맵: { STORE-001: "아이즈빌-부평점", ... }
  const [storeNameMap, setStoreNameMap] = useState<Record<string, string>>({});

  // ✅ 내 companyId 가져오기
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

  // 1) PostgreSQL에서 매장 목록 가져오기 (라벨용)
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

  // 2) 공지 로드 + companyId 검증
  useEffect(() => {
    if (!myCompanyId || !id) return;

    (async () => {
      try {
        const msnap = await getDoc(doc(db, "messages", id));

        if (!msnap.exists()) {
          Alert.alert("안내", "해당 공지는 삭제되었습니다.", [
            { text: "확인", onPress: () => router.replace("/message") },
          ]);
          return;
        }

        const m = msnap.data() as any;

        // ✅ companyId 검증
        if (m?.companyId !== myCompanyId) {
          Alert.alert("권한 없음", "다른 회사의 공지입니다.", [
            { text: "확인", onPress: () => router.replace("/message") },
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

  // ✅ '확인했습니다' 처리
  const markRead = async () => {
    const u = auth.currentUser;
    if (!u || !myCompanyId) return;

    try {
      const receiptId = `${id}_${u.uid}`;
      const receiptRef = doc(db, "receipts", receiptId);

      const receiptSnap = await getDoc(receiptRef);
      if (!receiptSnap.exists()) {
        Alert.alert("안내", "이미 삭제되었거나 확인 대상이 아닙니다.", [
          { text: "확인", onPress: () => router.replace("/message") },
        ]);
        return;
      }

      const receiptData = receiptSnap.data() as any;

      // ✅ companyId 검증
      if (receiptData?.companyId !== myCompanyId) {
        Alert.alert("권한 없음", "다른 회사의 공지입니다.", [
          { text: "확인", onPress: () => router.replace("/message") },
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
      <View style={styles.loadingWrap}>
        <ActivityIndicator color="#1E5BFF" />
        <Text style={styles.muted}>공지를 불러오는 중...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{title}</Text>

      <Text style={styles.target}>{targetText}</Text>

      <Text style={styles.body}>{body}</Text>

      <View style={{ height: 20 }} />

      <Button title="확인했습니다" onPress={markRead} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: "#0B0C10",
    flexGrow: 1,
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: "#0B0C10",
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
});
