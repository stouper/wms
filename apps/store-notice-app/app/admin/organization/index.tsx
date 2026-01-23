// app/admin/organization/index.tsx
// 조직도 화면 - 부서별 직원 목록 표시

import React, { useEffect, useState } from "react";
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "../../../firebaseConfig";
import Card from "../../../components/ui/Card";

type Department = {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  order?: number;
};

type Employee = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role?: string;
  department?: string;
  storeId?: string;
};

export default function AdminOrganization() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptEmployees, setDeptEmployees] = useState<Record<string, Employee[]>>({});
  const [expandedDeptId, setExpandedDeptId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  // 내 companyId 가져오기 + pending count
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

  // 부서 목록 가져오기
  useEffect(() => {
    if (!myCompanyId) return;

    const loadDepartments = async () => {
      try {
        setLoading(true);
        const q = query(
          collection(db, "departments"),
          where("companyId", "==", myCompanyId),
          where("active", "==", true)
        );
        const snap = await getDocs(q);

        const rows: Department[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          rows.push({
            id: d.id,
            name: data?.name ?? "",
            description: data?.description ?? "",
            active: data?.active !== false,
            order: data?.order ?? 999,
          });
        });

        // order 필드로 정렬
        rows.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        setDepartments(rows);
      } catch (e: any) {
        console.error("조직도 로드 실패:", e);
      } finally {
        setLoading(false);
      }
    };

    loadDepartments();
  }, [myCompanyId]);

  // 부서 클릭 시 직원 목록 로드
  const toggleDeptExpand = async (dept: Department) => {
    if (expandedDeptId === dept.id) {
      setExpandedDeptId(null);
      return;
    }

    setExpandedDeptId(dept.id);

    // 이미 로드된 경우 스킵
    if (deptEmployees[dept.id]) return;

    try {
      const q = query(
        collection(db, "users"),
        where("companyId", "==", myCompanyId),
        where("department", "==", dept.name),
        where("status", "==", "ACTIVE")
      );
      const snap = await getDocs(q);

      const employees: Employee[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        employees.push({
          id: d.id,
          name: data?.name ?? "",
          email: data?.email ?? "",
          phone: data?.phone ?? "",
          role: data?.role ?? "",
          department: data?.department ?? "",
          storeId: data?.storeId ?? "",
        });
      });

      setDeptEmployees((prev) => ({ ...prev, [dept.id]: employees }));
    } catch (e: any) {
      console.error("직원 목록 로드 실패:", e);
    }
  };

  if (!myCompanyId) {
    return (
      <View style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color="#1E5BFF" />
          <Text style={styles.muted}>회사 정보를 불러오는 중...</Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>조직도</Text>

        {loading && (
          <View style={styles.center}>
            <ActivityIndicator color="#1E5BFF" />
            <Text style={styles.muted}>조직도 불러오는 중...</Text>
          </View>
        )}

        {!loading && departments.length === 0 && (
          <Card>
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📊</Text>
              <Text style={styles.emptyText}>등록된 부서가 없습니다</Text>
              <Text style={styles.emptyText}>설정에서 부서를 추가해 주세요</Text>
            </View>
          </Card>
        )}

        {!loading &&
          departments.map((dept) => (
            <Card key={dept.id}>
              <Pressable onPress={() => toggleDeptExpand(dept)}>
                <View style={styles.deptRow}>
                  <Text style={styles.deptName}>{dept.name}</Text>
                </View>
                {dept.description && (
                  <Text style={styles.deptInfo}>{dept.description}</Text>
                )}
              </Pressable>

              {/* 직원 목록 */}
              {expandedDeptId === dept.id && (
                <View style={styles.employeeList}>
                  {!deptEmployees[dept.id] && (
                    <View style={styles.employeeLoading}>
                      <ActivityIndicator size="small" color="#1E5BFF" />
                      <Text style={styles.employeeLoadingText}>직원 목록 불러오는 중...</Text>
                    </View>
                  )}
                  {deptEmployees[dept.id] && deptEmployees[dept.id].length === 0 && (
                    <Text style={styles.noEmployees}>이 부서에 소속된 직원이 없습니다</Text>
                  )}
                  {deptEmployees[dept.id] && deptEmployees[dept.id].length > 0 && (
                    <>
                      <Text style={styles.employeeHeader}>소속 직원 ({deptEmployees[dept.id].length}명)</Text>
                      {deptEmployees[dept.id].map((emp) => (
                        <View key={emp.id} style={styles.employeeItem}>
                          <View style={styles.employeeRow}>
                            <Text style={styles.employeeName}>{emp.name}</Text>
                            <Text style={styles.employeeSeparator}>|</Text>
                            <Text style={styles.employeeEmail}>{emp.email}</Text>
                            {emp.phone && (
                              <>
                                <Text style={styles.employeeSeparator}>|</Text>
                                <Text style={styles.employeePhone}>{emp.phone}</Text>
                              </>
                            )}
                          </View>
                        </View>
                      ))}
                    </>
                  )}
                </View>
              )}
            </Card>
          ))}
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
            <Text style={[styles.navIcon, styles.navActive]}>📊</Text>
            <Text style={[styles.navText, styles.navActive]}>조직도</Text>
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
  container: { paddingHorizontal: 16, paddingTop: 8, gap: 8, paddingBottom: 100 },
  title: {
    color: "#E6E7EB",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },

  center: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 40,
  },
  muted: { color: "#A9AFBC", fontSize: 14 },

  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    color: "#A9AFBC",
    fontSize: 14,
    marginBottom: 4,
  },

  deptRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    gap: 6,
  },
  deptName: {
    color: "#E6E7EB",
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  deptInfo: {
    color: "#A9AFBC",
    fontSize: 11,
    marginTop: 2,
  },

  employeeList: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#2A2F3A",
  },
  employeeLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  employeeLoadingText: {
    color: "#A9AFBC",
    fontSize: 12,
  },
  noEmployees: {
    color: "#64748b",
    fontSize: 12,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 8,
  },
  employeeHeader: {
    color: "#E6E7EB",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  employeeItem: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#1A1D24",
    borderRadius: 6,
    marginBottom: 4,
  },
  employeeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  employeeName: {
    color: "#E6E7EB",
    fontSize: 12,
    fontWeight: "600",
  },
  employeeSeparator: {
    color: "#64748b",
    fontSize: 12,
  },
  employeeEmail: {
    color: "#A9AFBC",
    fontSize: 12,
  },
  employeePhone: {
    color: "#A9AFBC",
    fontSize: 12,
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
