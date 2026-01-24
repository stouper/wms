// app/admin/settings/company.tsx
// 회사 정보 화면 - 정적 정보 표시

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

export default function CompanyInfo() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => router.push("/admin/settings")} style={styles.backButton}>
          <Text style={styles.backButtonText}>← 설정</Text>
        </Pressable>

        <Text style={styles.title}>회사 정보</Text>

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
            관리자가 설정 › 회원 관리에서 가입 신청을 승인합니다
          </Text>
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
  container: { padding: 16, gap: 12, paddingBottom: 100 },

  backButton: { marginBottom: 12 },
  backButtonText: { color: "#1E5BFF", fontSize: 16, fontWeight: "600" },

  title: {
    color: "#E6E7EB",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 12,
  },

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

  valueSmall: {
    color: "#A9AFBC",
    fontSize: 13,
    fontFamily: "monospace",
  },

  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },

  inviteCode: {
    color: "#1E5BFF",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 2,
    fontFamily: "monospace",
  },

  copyBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#1E5BFF",
  },

  copyText: { color: "#fff", fontWeight: "700", fontSize: 14 },

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
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  navButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },
  navIcon: {
    fontSize: 24,
    marginBottom: 4,
    opacity: 0.5,
  },
  navText: {
    color: "#A9AFBC",
    fontSize: 11,
    fontWeight: "600",
    opacity: 0.5,
  },
  navActive: {
    opacity: 1,
    color: "#1E5BFF",
  },
});
