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

type EmployeeRole = "ADMIN" | "STAFF";

export default function AdminPending() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
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
        // 모든 신규 직원은 STAFF로 시작
        roleInit[emp.id] = "STAFF";
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
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const approve = async (employeeId: string) => {
    try {
      const role = roleInputs[employeeId];
      const user = list.find(u => u.id === employeeId);
      if (!user) return;

      const storeId = storeInputs[employeeId] || undefined;
      const departmentId = deptInputs[employeeId] || undefined;

      // 본사(isHq=true)면 부서 필수 선택
      if (user.isHq && !departmentId) {
        Alert.alert("입력 오류", "부서를 선택해 주세요.");
        return;
      }

      // 매장(isHq=false)면 매장 필수 선택
      if (!user.isHq && !storeId) {
        Alert.alert("입력 오류", "매장을 선택해 주세요.");
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

  const getRoleLabel = (role: EmployeeRole) => {
    switch (role) {
      case "ADMIN": return "관리자";
      case "STAFF": return "직원";
      default: return role;
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>승인 대기 사용자</Text>
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
            const role = roleInputs[user.id] || "STORE_MANAGER";
            const storeId = storeInputs[user.id] || "";
            const departmentId = deptInputs[user.id] || "";
            const userIsHq = user.isHq;

            return (
              <Card key={user.id}>
                <View style={styles.userHeader}>
                  <Text style={styles.userName}>{user.name || "(이름 없음)"}</Text>
                  <Text style={styles.userEmail}>{user.email}</Text>
                  {user.phone && (
                    <Text style={styles.userInfo}>{user.phone}</Text>
                  )}
                  <View style={[styles.badge, { backgroundColor: userIsHq ? "#1E5BFF" : "#10B981" }]}>
                    <Text style={styles.badgeText}>
                      {userIsHq ? "본사" : "매장"}
                    </Text>
                  </View>
                </View>

                {/* Role 선택 */}
                <View style={{ marginBottom: 12 }}>
                  <Text style={styles.label}>역할</Text>
                  <View style={styles.roleGrid}>
                    {(["STAFF", "ADMIN"] as EmployeeRole[]).map((r) => (
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
                  </View>
                </View>

                {/* 본사 직원: 부서 선택 필수 */}
                {userIsHq && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={styles.label}>부서 선택</Text>
                    <View style={styles.optionGrid}>
                      {departments.map((dept) => (
                        <Pressable
                          key={dept.id}
                          onPress={() => setDeptInputs((p) => ({ ...p, [user.id]: dept.id }))}
                          style={[
                            styles.optionCard,
                            departmentId === dept.id && styles.optionCardActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.optionCardText,
                              departmentId === dept.id && styles.optionCardTextActive,
                            ]}
                            numberOfLines={1}
                          >
                            {dept.name}
                          </Text>
                          {dept.employeeCount !== undefined && (
                            <Text style={[
                              styles.optionCardCount,
                              departmentId === dept.id && styles.optionCardCountActive,
                            ]}>
                              {dept.employeeCount}명
                            </Text>
                          )}
                        </Pressable>
                      ))}
                      {departments.length === 0 && (
                        <Text style={styles.emptyOptionText}>등록된 부서가 없습니다</Text>
                      )}
                    </View>
                  </View>
                )}

                {/* 매장 직원: 매장 선택 필수 */}
                {!userIsHq && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={styles.label}>매장 선택</Text>
                    <View style={styles.optionGrid}>
                      {stores.map((st) => (
                        <Pressable
                          key={st.id}
                          onPress={() => setStoreInputs((p) => ({ ...p, [user.id]: st.id }))}
                          style={[
                            styles.optionCard,
                            storeId === st.id && styles.optionCardActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.optionCardText,
                              storeId === st.id && styles.optionCardTextActive,
                            ]}
                            numberOfLines={1}
                          >
                            {st.name || st.code}
                          </Text>
                          {st.employeeCount !== undefined && (
                            <Text style={[
                              styles.optionCardCount,
                              storeId === st.id && styles.optionCardCountActive,
                            ]}>
                              {st.employeeCount}명
                            </Text>
                          )}
                        </Pressable>
                      ))}
                      {stores.length === 0 && (
                        <Text style={styles.emptyOptionText}>등록된 매장이 없습니다</Text>
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
                    <Text style={styles.approveBtnText}>승인</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => reject(user.id)}
                    style={styles.rejectBtn}
                    android_ripple={{ color: "#6b7280" }}
                  >
                    <Text style={styles.rejectBtnText}>거부</Text>
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
    marginBottom: 8,
  },
  title: { color: "#E6E7EB", fontSize: 20, fontWeight: "700" },

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

  label: { color: "#E6E7EB", fontSize: 14, marginBottom: 10, fontWeight: "700" },

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

  // 2열 그리드 스타일
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  optionCard: {
    width: "48%",
    backgroundColor: "#1A1D24",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2A2F3A",
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  optionCardActive: {
    backgroundColor: "#1E5BFF",
    borderColor: "#1E5BFF",
  },
  optionCardText: {
    color: "#E6E7EB",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  optionCardTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  optionCardCount: {
    color: "#64748b",
    fontSize: 12,
  },
  optionCardCountActive: {
    color: "#B8D0FF",
  },
  emptyOptionText: {
    color: "#64748b",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 20,
    width: "100%",
  },

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
