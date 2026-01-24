// app/admin/staff/pending.tsx
// PostgreSQL Employee 기반 승인대기 관리

import React, { useEffect, useState, useCallback } from "react";
import {
  Alert,
  ActivityIndicator,
  ScrollView,
  Text,
  View,
  StyleSheet,
  Pressable,
  RefreshControl,
} from "react-native";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import { useRouter } from "expo-router";
import {
  getEmployees,
  approveEmployee,
  rejectEmployee,
  getStores,
  getDepartments,
  EmployeeInfo,
  StoreInfo,
  DepartmentInfo,
} from "../../../lib/authApi";

type EmployeeRole = "HQ_ADMIN" | "HQ_WMS" | "SALES" | "STORE_MANAGER" | "STORE_STAFF";

export default function AdminPending() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [list, setList] = useState<EmployeeInfo[]>([]);
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);

  // 각 사용자별 승인 입력 상태
  const [roleInputs, setRoleInputs] = useState<Record<string, EmployeeRole>>({});
  const [storeInputs, setStoreInputs] = useState<Record<string, string>>({});
  const [deptInputs, setDeptInputs] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    try {
      const [employees, storeList, deptList] = await Promise.all([
        getEmployees("PENDING"),
        getStores(),
        getDepartments(true), // activeOnly
      ]);

      setList(employees);
      setStores(storeList.filter(s => !s.isHq)); // 본사 제외
      setDepartments(deptList);

      // 초기값 세팅
      const roleInit: Record<string, EmployeeRole> = {};
      const storeInit: Record<string, string> = {};
      const deptInit: Record<string, string> = {};

      employees.forEach((emp) => {
        // isHq 기반으로 기본 역할 설정
        if (emp.isHq) {
          roleInit[emp.id] = "HQ_WMS";
        } else {
          roleInit[emp.id] = "STORE_STAFF";
        }
        storeInit[emp.id] = emp.storeId || "";
        deptInit[emp.id] = emp.departmentId || "";
      });

      setRoleInputs(roleInit);
      setStoreInputs(storeInit);
      setDeptInputs(deptInit);
    } catch (e: any) {
      Alert.alert("오류", e?.message ?? "대기 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const approve = async (employeeId: string) => {
    try {
      const role = roleInputs[employeeId];
      const storeId = storeInputs[employeeId] || undefined;
      const departmentId = deptInputs[employeeId] || undefined;

      // 매장 직원인데 매장 미선택
      if ((role === "STORE_MANAGER" || role === "STORE_STAFF") && !storeId) {
        Alert.alert("입력 오류", "매장을 선택해 주세요.");
        return;
      }

      // 본사 직원인데 부서 미선택
      if ((role === "HQ_ADMIN" || role === "HQ_WMS" || role === "SALES") && !departmentId) {
        Alert.alert("입력 오류", "부서를 선택해 주세요.");
        return;
      }

      const success = await approveEmployee(employeeId, role, storeId, departmentId);

      if (success) {
        Alert.alert("완료", "사용자가 승인되었습니다.");
        setList((prev) => prev.filter((u) => u.id !== employeeId));
      } else {
        Alert.alert("실패", "승인 처리에 실패했습니다.");
      }
    } catch (e: any) {
      Alert.alert("승인 실패", e?.message ?? "잠시 후 다시 시도해 주세요.");
    }
  };

  const reject = async (employeeId: string) => {
    Alert.alert(
      "확인",
      "이 사용자를 거부하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "거부",
          style: "destructive",
          onPress: async () => {
            try {
              const success = await rejectEmployee(employeeId);

              if (success) {
                Alert.alert("완료", "사용자가 거부되었습니다.");
                setList((prev) => prev.filter((u) => u.id !== employeeId));
              } else {
                Alert.alert("실패", "거부 처리에 실패했습니다.");
              }
            } catch (e: any) {
              Alert.alert("오류", e?.message ?? "잠시 후 다시 시도해 주세요.");
            }
          },
        },
      ]
    );
  };

  const isHqRole = (role: EmployeeRole) => {
    return role === "HQ_ADMIN" || role === "HQ_WMS" || role === "SALES";
  };

  const getRoleLabel = (role: EmployeeRole) => {
    switch (role) {
      case "HQ_ADMIN": return "본사 관리자";
      case "HQ_WMS": return "본사 물류팀";
      case "SALES": return "영업직";
      case "STORE_MANAGER": return "매장 관리자";
      case "STORE_STAFF": return "매장 직원";
      default: return role;
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1E5BFF" />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>승인 대기 사용자</Text>
          <Pressable onPress={onRefresh} style={styles.refreshBtn}>
            <Text style={styles.refreshText}>새로고침</Text>
          </Pressable>
        </View>

        {loading && (
          <View style={styles.center}>
            <ActivityIndicator color="#1E5BFF" />
            <Text style={styles.muted}>대기 목록 불러오는 중...</Text>
          </View>
        )}

        {!loading && list.length === 0 && (
          <Card>
            <EmptyState
              title="승인 대기 중인 사용자가 없습니다"
              subtitle="신규 가입이 들어오면 여기에 표시됩니다"
            />
          </Card>
        )}

        {!loading &&
          list.map((user) => {
            const role = roleInputs[user.id] || "STORE_STAFF";
            const storeId = storeInputs[user.id] || "";
            const departmentId = deptInputs[user.id] || "";
            const userIsHq = user.isHq;

            return (
              <Card key={user.id}>
                <View style={styles.userHeader}>
                  <Text style={styles.userName}>{user.name || "(이름 없음)"}</Text>
                  <Text style={styles.userEmail}>{user.email}</Text>
                  {user.phone && (
                    <Text style={styles.userInfo}>📞 {user.phone}</Text>
                  )}
                  <View style={[styles.badge, { backgroundColor: userIsHq ? "#1E5BFF" : "#10B981" }]}>
                    <Text style={styles.badgeText}>
                      {userIsHq ? "🏢 본사" : "🏪 매장"}
                    </Text>
                  </View>
                </View>

                {/* Role 선택 */}
                <View style={{ marginBottom: 12 }}>
                  <Text style={styles.label}>역할</Text>
                  <View style={styles.roleGrid}>
                    {userIsHq ? (
                      // 본사 직원용 역할
                      <>
                        {(["HQ_WMS", "SALES", "HQ_ADMIN"] as EmployeeRole[]).map((r) => (
                          <Pressable
                            key={r}
                            onPress={() => setRoleInputs((p) => ({ ...p, [user.id]: r }))}
                            style={[styles.roleChip, role === r && styles.roleChipActive]}
                          >
                            <Text style={[styles.roleText, role === r && styles.roleTextActive]}>
                              {getRoleLabel(r)}
                            </Text>
                          </Pressable>
                        ))}
                      </>
                    ) : (
                      // 매장 직원용 역할
                      <>
                        {(["STORE_STAFF", "STORE_MANAGER"] as EmployeeRole[]).map((r) => (
                          <Pressable
                            key={r}
                            onPress={() => setRoleInputs((p) => ({ ...p, [user.id]: r }))}
                            style={[styles.roleChip, role === r && styles.roleChipActive]}
                          >
                            <Text style={[styles.roleText, role === r && styles.roleTextActive]}>
                              {getRoleLabel(r)}
                            </Text>
                          </Pressable>
                        ))}
                      </>
                    )}
                  </View>
                </View>

                {/* 부서 선택 (본사 직원인 경우만) */}
                {userIsHq && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={styles.label}>부서 (필수)</Text>
                    <View style={styles.optionWrap}>
                      {departments.map((dept) => (
                        <Pressable
                          key={dept.id}
                          onPress={() => setDeptInputs((p) => ({ ...p, [user.id]: dept.id }))}
                          style={[
                            styles.optionChip,
                            departmentId === dept.id && styles.optionChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.optionText,
                              departmentId === dept.id && styles.optionTextActive,
                            ]}
                          >
                            🏢 {dept.name}
                          </Text>
                        </Pressable>
                      ))}
                      {departments.length === 0 && (
                        <Text style={styles.muted}>등록된 부서가 없습니다</Text>
                      )}
                    </View>
                  </View>
                )}

                {/* 매장 선택 (매장 직원인 경우만) */}
                {!userIsHq && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={styles.label}>매장 (필수)</Text>
                    <View style={styles.optionWrap}>
                      {stores.map((st) => (
                        <Pressable
                          key={st.id}
                          onPress={() => setStoreInputs((p) => ({ ...p, [user.id]: st.id }))}
                          style={[
                            styles.optionChip,
                            storeId === st.id && styles.optionChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.optionText,
                              storeId === st.id && styles.optionTextActive,
                            ]}
                          >
                            🏪 {st.name || st.code}
                          </Text>
                        </Pressable>
                      ))}
                      {stores.length === 0 && (
                        <Text style={styles.muted}>등록된 매장이 없습니다</Text>
                      )}
                    </View>
                  </View>
                )}

                {/* 버튼 */}
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => approve(user.id)}
                    style={styles.approveBtn}
                    android_ripple={{ color: "#0ea5e9" }}
                  >
                    <Text style={styles.approveBtnText}>✓ 승인</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => reject(user.id)}
                    style={styles.rejectBtn}
                    android_ripple={{ color: "#6b7280" }}
                  >
                    <Text style={styles.rejectBtnText}>✕ 거부</Text>
                  </Pressable>
                </View>
              </Card>
            );
          })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B0C10" },
  container: { paddingHorizontal: 16, paddingTop: 8, gap: 12, paddingBottom: 40 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: { color: "#E6E7EB", fontSize: 20, fontWeight: "700" },
  refreshBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#1A1D24",
    borderWidth: 1,
    borderColor: "#2A2F3A",
  },
  refreshText: { color: "#E6E7EB", fontWeight: "700", fontSize: 12 },

  center: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 40,
  },
  muted: { color: "#A9AFBC", fontSize: 14 },

  userHeader: { marginBottom: 16 },
  userName: { color: "#E6E7EB", fontSize: 18, fontWeight: "700", marginBottom: 4 },
  userEmail: { color: "#A9AFBC", fontSize: 14, marginBottom: 2 },
  userInfo: { color: "#A9AFBC", fontSize: 13, marginTop: 4 },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  label: { color: "#A9AFBC", fontSize: 13, marginBottom: 8, fontWeight: "600" },

  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  roleChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#1A1D24",
    borderWidth: 1,
    borderColor: "#2A2F3A",
  },
  roleChipActive: { backgroundColor: "#1E5BFF", borderColor: "#1E5BFF" },
  roleText: { color: "#A9AFBC", fontWeight: "700", fontSize: 13 },
  roleTextActive: { color: "#fff" },

  optionWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "#1A1D24",
    borderWidth: 1,
    borderColor: "#2A2F3A",
  },
  optionChipActive: { backgroundColor: "#10b981", borderColor: "#10b981" },
  optionText: { color: "#A9AFBC", fontWeight: "700", fontSize: 12 },
  optionTextActive: { color: "#fff" },

  actions: { flexDirection: "row", gap: 10 },
  approveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#10b981",
    alignItems: "center",
  },
  approveBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  rejectBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#374151",
    alignItems: "center",
  },
  rejectBtnText: { color: "#9ca3af", fontWeight: "800", fontSize: 15 },
});
