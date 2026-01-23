// app/admin/index.tsx
// ✅ Multi-tenant: 초대 코드 보기 기능 추가

import React, { useEffect, useState } from "react";
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { doc, onSnapshot, collection, query, where } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";
import Card from "../../components/ui/Card";
import { SafeAreaView } from "react-native-safe-area-context";
import { Event } from "../../lib/eventTypes";

export default function AdminDashboard() {
  const router = useRouter();
  const [todayEvents, setTodayEvents] = useState<Event[]>([]);
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    let unsubCompany: (() => void) | undefined;
    let unsubPending: (() => void) | undefined;
    let unsubEvents: (() => void) | undefined;

    // 내 user 정보 가져와서 companyId 확인
    const unsubUser = onSnapshot(doc(db, "users", uid), async (userSnap) => {
      if (userSnap.exists()) {
        const companyId = (userSnap.data() as any)?.companyId;
        if (!companyId) return;

        setMyCompanyId(companyId);

        // 회사 정보 가져오기
        unsubCompany = onSnapshot(doc(db, "companies", companyId), (companySnap) => {
          if (companySnap.exists()) {
            setCompanyName((companySnap.data() as any)?.name || "");
          }
        });

        // PENDING 사용자 수 실시간 가져오기
        const pendingQuery = query(
          collection(db, "users"),
          where("companyId", "==", companyId),
          where("status", "==", "PENDING")
        );
        unsubPending = onSnapshot(pendingQuery, (snapshot) => {
          setPendingCount(snapshot.size);
        });

        // 오늘 일정 실시간 가져오기
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, "0");
        const day = String(today.getDate()).padStart(2, "0");
        const todayStr = `${year}-${month}-${day}`;

        const eventsQuery = query(
          collection(db, "events"),
          where("companyId", "==", companyId)
        );
        unsubEvents = onSnapshot(eventsQuery, (snapshot) => {
          const events: Event[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            // 클라이언트에서 오늘 날짜만 필터링
            if (data.date === todayStr) {
              events.push({ id: doc.id, ...data } as Event);
            }
          });
          setTodayEvents(events);
        });
      }
    });

    return () => {
      unsubUser();
      unsubCompany?.();
      unsubPending?.();
      unsubEvents?.();
    };
  }, []);


  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{companyName || "관리자 대시보드"}</Text>
        </View>

        {/* 캘린더 */}
        <Pressable onPress={() => router.push("/admin/calendar")}>
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
        </Pressable>

        <Card>
          <Pressable
            onPress={() => router.push("/admin/notices/new")}
            style={styles.menuItem}
            android_ripple={{ color: "#1A1D24" }}
          >
            <Text style={styles.menuLabel}>✍️ 공지 작성</Text>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        </Card>

        <Card>
          <Pressable
            onPress={() => router.push("/admin/notices")}
            style={styles.menuItem}
            android_ripple={{ color: "#1A1D24" }}
          >
            <Text style={styles.menuLabel}>📋 공지 목록</Text>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        </Card>

        <Card>
          <Pressable
            onPress={() => router.push("/admin/board")}
            style={styles.menuItem}
            android_ripple={{ color: "#1A1D24" }}
          >
            <Text style={styles.menuLabel}>💬 게시판</Text>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        </Card>

        <Card>
          <Pressable
            onPress={() => router.push("/admin/approvals")}
            style={styles.menuItem}
            android_ripple={{ color: "#1A1D24" }}
          >
            <Text style={styles.menuLabel}>📝 결재</Text>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        </Card>

        <Card>
          <Pressable
            onPress={() => router.push("/admin/inventory")}
            style={styles.menuItem}
            android_ripple={{ color: "#1A1D24" }}
          >
            <Text style={styles.menuLabel}>📦 매장재고</Text>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        </Card>

        <Card>
          <Pressable
            onPress={() => router.push("/admin/sales")}
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
            onPress={() => router.push("/admin")}
            style={styles.navButton}
          >
            <Text style={[styles.navIcon, styles.navActive]}>🏠</Text>
            <Text style={[styles.navText, styles.navActive]}>홈</Text>
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
  menuLabel: {
    color: "#E6E7EB",
    fontSize: 16,
    fontWeight: "600",
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
  navActive: {
    opacity: 1,
    color: "#1E5BFF",
  },
});
