// app/admin/organization/index.tsx
// ✅ PostgreSQL 연동: 조직도 화면 - 부서별 직원 목록 표시

import React, { useEffect, useState, useCallback } from "react";
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
import Card from "../../../components/ui/Card";
import {
  getDepartments,
  getEmployeesByDepartmentId,
  getEmployees,
  DepartmentInfo,
  EmployeeInfo,
} from "../../../lib/authApi";

export default function AdminOrganization() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const [deptEmployees, setDeptEmployees] = useState<Record<string, EmployeeInfo[]>>({});
  const [expandedDeptId, setExpandedDeptId] = useState<string | null>(null);
  const [loadingEmployees, setLoadingEmployees] = useState<Record<string, boolean>>({});
  const [pendingCount, setPendingCount] = useState(0);

  // 부서 목록 + pending count 가져오기
  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // 부서 목록 (활성화된 것만)
      const deptData = await getDepartments(true);
      setDepartments(deptData);

      // PENDING 직원 수
      const allEmployees = await getEmployees('PENDING');
      setPendingCount(allEmployees.length);
    } catch (e: any) {
      console.error("조직도 로드 실패:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 부서 클릭 시 직원 목록 로드
  const toggleDeptExpand = async (dept: DepartmentInfo) => {
    if (expandedDeptId === dept.id) {
      setExpandedDeptId(null);
      return;
    }

    setExpandedDeptId(dept.id);

    // 이미 로드된 경우 스킵
    if (deptEmployees[dept.id]) return;

    try {
      setLoadingEmployees((prev) => ({ ...prev, [dept.id]: true }));
      const employees = await getEmployeesByDepartmentId(dept.id);
      setDeptEmployees((prev) => ({ ...prev, [dept.id]: employees }));
    } catch (e: any) {
      console.error("직원 목록 로드 실패:", e);
    } finally {
      setLoadingEmployees((prev) => ({ ...prev, [dept.id]: false }));
    }
  };

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
          departments.map((dept) => {
            const isExpanded = expandedDeptId === dept.id;
            const employees = deptEmployees[dept.id];
            const isLoadingEmps = loadingEmployees[dept.id];

            return (
              <Card key={dept.id}>
                <Pressable onPress={() => toggleDeptExpand(dept)}>
                  <View style={styles.deptRow}>
                    <Text style={styles.deptName}>{dept.name}</Text>
                    {dept.employeeCount !== undefined && (
                      <Text style={styles.employeeCount}>({dept.employeeCount}명)</Text>
                    )}
                  </View>
                </Pressable>

                {/* 직원 목록 */}
                {isExpanded && (
                  <View style={styles.employeeList}>
                    {isLoadingEmps && (
                      <View style={styles.employeeLoading}>
                        <ActivityIndicator size="small" color="#1E5BFF" />
                        <Text style={styles.employeeLoadingText}>직원 목록 불러오는 중...</Text>
                      </View>
                    )}
                    {!isLoadingEmps && employees && employees.length === 0 && (
                      <Text style={styles.noEmployees}>이 부서에 소속된 직원이 없습니다</Text>
                    )}
                    {!isLoadingEmps && employees && employees.length > 0 && (
                      <>
                        <Text style={styles.employeeHeader}>소속 직원 ({employees.length}명)</Text>
                        {employees.map((emp) => (
                          <View key={emp.id} style={styles.employeeItem}>
                            <View style={styles.employeeRow}>
                              <Text style={styles.employeeName}>{emp.name}</Text>
                              {emp.email && (
                                <>
                                  <Text style={styles.employeeSeparator}>|</Text>
                                  <Text style={styles.employeeEmail}>{emp.email}</Text>
                                </>
                              )}
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
            );
          })}
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
  employeeCount: {
    color: "#A9AFBC",
    fontSize: 12,
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
