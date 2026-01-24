// app/staff/settings/company.tsx
// 직원용 회사 정보 화면 - 정적 정보 표시

import React from "react";
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Card from "../../../components/ui/Card";

export default function StaffCompanyInfo() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.push("/staff/settings")}>
          <Text style={styles.backButton}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>회사 정보</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <Card style={styles.card}>
          <Text style={styles.label}>회사명</Text>
          <Text style={styles.value}>ESKA</Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.label}>시스템</Text>
          <Text style={styles.value}>매장 공지 및 업무 관리</Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.label}>직원 등록 방법</Text>
          <Text style={styles.hint}>
            관리자에게 문의하여 가입 신청을 승인받으세요
          </Text>
        </Card>
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
  container: { padding: 16, gap: 12, paddingBottom: 100 },

  card: {
    marginBottom: 0,
  },

  label: {
    color: "#A9AFBC",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },

  value: {
    color: "#E6E7EB",
    fontSize: 20,
    fontWeight: "700",
  },

  inviteCode: {
    color: "#1E5BFF",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 2,
    fontFamily: "monospace",
    marginBottom: 8,
  },

  hint: {
    color: "#64748b",
    fontSize: 12,
  },

  emptyText: {
    color: "#A9AFBC",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 20,
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
