// app/staff/index.tsx
// 직원 대시보드 - PostgreSQL 기반

import React, { useEffect, useState } from "react";
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { auth } from "../../firebaseConfig";
import { getEvents, getMyUnreadCount, EventInfo, authenticateWithCoreApi } from "../../lib/authApi";
import Card from "../../components/ui/Card";
import { SafeAreaView } from "react-native-safe-area-context";

export default function StaffDashboard() {
  const router = useRouter();
  const [todayEvents, setTodayEvents] = useState<EventInfo[]>([]);
  const [employeeName, setEmployeeName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!auth.currentUser) return;

    // 직원 정보 가져오기
    authenticateWithCoreApi().then((result) => {
      if (result.success && result.employee) {
        setEmployeeName(result.employee.name);
        setStoreName(result.employee.storeName || result.employee.departmentName || "");
      }
    });

    // 오늘 일정 가져오기
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const todayStr = `${year}-${month}-${day}`;

    getEvents(todayStr, todayStr).then((events) => {
      setTodayEvents(events);
    });

    // 미읽음 공지 수 가져오기
    getMyUnreadCount().then((count) => {
      setUnreadCount(count);
    });

    // 주기적으로 미읽음 수 갱신
    const interval = setInterval(() => {
      getMyUnreadCount().then((count) => {
        setUnreadCount(count);
      });
    }, 30000); // 30초마다

    return () => clearInterval(interval);
  }, []);


  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{storeName || employeeName || "직원 대시보드"}</Text>
        </View>

        {/* 캘린더 */}
        <Card>
          <Text style={styles.calendarTitle}>📅 오늘의 일정</Text>
          <View style={styles.calendarContainer}>
            <View style={styles.dateBox}>
              <Text style={styles.dateMonth}>
                {new Date().toLocaleDateString("ko-KR", { month: "long" })}
              </Text>
              <Text style={styles.dateDay}>{new Date().getDate()}</Text>
              <Text style={styles.dateWeekday}>
                {new Date().toLocaleDateString("ko-KR", { weekday: "long" })}
              </Text>
            </View>
            <View style={styles.scheduleBox}>
              {todayEvents.length === 0 ? (
                <Text style={styles.scheduleEmpty}>오늘 등록된 일정이 없습니다</Text>
              ) : (
                <>
                  {todayEvents.map((event) => (
                    <View key={event.id} style={styles.scheduleItem}>
                      <Text style={styles.scheduleTitle} numberOfLines={1}>
                        • {event.title}
                        {event.description && (
                          <Text style={styles.scheduleDescription}> - {event.description}</Text>
                        )}
                      </Text>
                    </View>
                  ))}
                </>
              )}
            </View>
          </View>
        </Card>

        <Card>
          <Pressable
            onPress={() => router.push("/staff/notices")}
            style={styles.menuItem}
            android_ripple={{ color: "#1A1D24" }}
          >
            <View style={styles.menuLabelRow}>
              <Text style={styles.menuLabel}>📋 받은 공지</Text>
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount}</Text>
                </View>
              )}
            </View>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        </Card>

        <Card>
          <Pressable
            onPress={() => router.push("/staff/board")}
            style={styles.menuItem}
            android_ripple={{ color: "#1A1D24" }}
          >
            <Text style={styles.menuLabel}>💬 게시판</Text>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        </Card>

        <Card>
          <Pressable
            onPress={() => router.push("/staff/inventory")}
            style={styles.menuItem}
            android_ripple={{ color: "#1A1D24" }}
          >
            <Text style={styles.menuLabel}>📦 매장재고</Text>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        </Card>

        <Card>
          <Pressable
            onPress={() => router.push("/staff/sales")}
            style={styles.menuItem}
            android_ripple={{ color: "#1A1D24" }}
          >
            <Text style={styles.menuLabel}>💰 매출등록</Text>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        </Card>
      </ScrollView>

      {/* 하단 네비게이션 바 */}
      <SafeAreaView edges={["bottom"]} style={styles.bottomNavContainer}>
        <View style={styles.bottomNav}>
          <Pressable
            onPress={() => router.push("/staff")}
            style={styles.navButton}
          >
            <Text style={[styles.navIcon, styles.navActive]}>🏠</Text>
            <Text style={[styles.navText, styles.navActive]}>홈</Text>
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
  container: { paddingHorizontal: 16, paddingTop: 8, gap: 12, paddingBottom: 100 },
  titleRow: {
    alignItems: "center",
    marginBottom: 4,
  },
  title: {
    color: "#E6E7EB",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },

  calendarTitle: {
    color: "#E6E7EB",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10,
  },
  calendarContainer: {
    flexDirection: "row",
    gap: 10,
  },
  dateBox: {
    backgroundColor: "#1E5BFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 85,
  },
  dateMonth: {
    color: "#B8D0FF",
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 2,
  },
  dateDay: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 34,
  },
  dateWeekday: {
    color: "#B8D0FF",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  scheduleBox: {
    flex: 1,
    backgroundColor: "#1A1D24",
    padding: 12,
    borderRadius: 10,
    justifyContent: "center",
  },
  scheduleEmpty: {
    color: "#64748b",
    fontSize: 12,
    textAlign: "center",
  },
  scheduleItem: {
    marginBottom: 6,
  },
  scheduleTitle: {
    color: "#E6E7EB",
    fontSize: 13,
    fontWeight: "600",
  },
  scheduleDescription: {
    color: "#A9AFBC",
    fontSize: 13,
    fontWeight: "400",
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
