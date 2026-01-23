// app/admin/settings/index.tsx
// 관리자 설정 화면

import React, { useEffect, useState } from "react";
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, onSnapshot, collection, query, where } from "firebase/firestore";
import { auth, db } from "../../../firebaseConfig";
import Card from "../../../components/ui/Card";

export default function AdminSettings() {
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    let unsubPending: (() => void) | undefined;

    // 내 user 정보 가져와서 companyId 확인
    const unsubUser = onSnapshot(doc(db, "users", uid), async (userSnap) => {
      if (userSnap.exists()) {
        const companyId = (userSnap.data() as any)?.companyId;
        if (!companyId) return;

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
    });

    return () => {
      unsubUser();
      unsubPending?.();
    };
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>설정</Text>

        <Card>
          <Pressable
            onPress={() => router.push("/admin/staff/pending")}
            style={styles.menuItem}
            android_ripple={{ color: "#1A1D24" }}
          >
            <View style={styles.menuLabelRow}>
              <Text style={styles.menuLabel}>✅ 승인 대기</Text>
              {pendingCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{pendingCount}</Text>
                </View>
              )}
            </View>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        </Card>

        <Card>
          <Pressable
            onPress={() => router.push("/admin/settings/company")}
            style={styles.menuItem}
            android_ripple={{ color: "#1A1D24" }}
          >
            <Text style={styles.menuLabel}>🏢 회사 정보</Text>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        </Card>

        <Card>
          <Pressable
            onPress={() => router.push("/admin/departments")}
            style={styles.menuItem}
            android_ripple={{ color: "#1A1D24" }}
          >
            <Text style={styles.menuLabel}>📂 부서 관리</Text>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        </Card>

        <Card>
          <Pressable
            onPress={() => router.push("/admin/stores")}
            style={styles.menuItem}
            android_ripple={{ color: "#1A1D24" }}
          >
            <Text style={styles.menuLabel}>🏪 매장 관리</Text>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        </Card>

        <Card>
          <Pressable
            onPress={() => router.push("/admin/settings/members")}
            style={styles.menuItem}
            android_ripple={{ color: "#1A1D24" }}
          >
            <Text style={styles.menuLabel}>👥 회원 관리</Text>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        </Card>
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
            <Text style={[styles.navIcon, styles.navActive]}>⚙️</Text>
            <Text style={[styles.navText, styles.navActive]}>설정</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B0C10" },
  container: { paddingHorizontal: 16, paddingTop: 8, gap: 8, paddingBottom: 100 },
  title: {
    color: "#E6E7EB",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 8,
  },

  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  menuLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  menuLabel: {
    color: "#E6E7EB",
    fontSize: 16,
    fontWeight: "600",
  },
  badge: {
    backgroundColor: "#EF4444",
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  arrow: {
    color: "#64748b",
    fontSize: 24,
    fontWeight: "300",
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
  navActive: {
    opacity: 1,
    color: "#1E5BFF",
  },
});
