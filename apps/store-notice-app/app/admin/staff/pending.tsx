// app/admin/staff/pending.tsx
// ✅ Multi-tenant: 같은 회사의 PENDING 사용자 승인
// ✅ 매장/부서는 관리 화면에서 등록한 목록에서 선택

import React, { useEffect, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  ScrollView,
  Text,
  View,
  StyleSheet,
  Pressable,
} from "react-native";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { auth, db } from "../../../firebaseConfig";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import { useRouter } from "expo-router";
import { getFunctions, httpsCallable } from "firebase/functions";

type UserRole = "OWNER" | "MANAGER" | "SALES";

type PendingUser = {
  id: string;
  email?: string;
  name?: string;
  role?: UserRole;
  storeId?: string | null;
  department?: string | null;
  phone?: string | null;
  requestedDepartment?: string | null;
  createdAt?: any;
};

type StoreRow = { id: string; name: string };
type DepartmentRow = { id: string; name: string };

export default function AdminPending() {
  const router = useRouter();
  const functions = getFunctions();

  const [loading, setLoading] = useState(true);
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null);
  const [list, setList] = useState<PendingUser[]>([]);

  // 매장/부서 목록
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);

  // 각 사용자별 승인 입력 상태
  const [roleInputs, setRoleInputs] = useState<Record<string, UserRole>>({});
  // 부서/매장 중 하나만 선택 (필수)
  const [assignmentType, setAssignmentType] = useState<Record<string, 'department' | 'store'>>({});
  const [assignmentValue, setAssignmentValue] = useState<Record<string, string>>({});

  // 내 companyId 가져오기
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

  // 매장 목록 가져오기
  useEffect(() => {
    if (!myCompanyId) return;

    const fetchStores = async () => {
      try {
        const q = query(
          collection(db, "stores"),
          where("companyId", "==", myCompanyId),
          where("active", "==", true),
          orderBy("name", "asc")
        );
        const snap = await getDocs(q);

        const rows: StoreRow[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          rows.push({
            id: d.id,
            name: data?.name ?? d.id,
          });
        });

        setStores(rows);
      } catch (e: any) {
        console.error("Store fetch error:", e);
      }
    };

    fetchStores();
  }, [myCompanyId]);

  // 부서 목록 가져오기
  useEffect(() => {
    if (!myCompanyId) return;

    const fetchDepartments = async () => {
      try {
        const q = query(
          collection(db, "departments"),
          where("companyId", "==", myCompanyId),
          where("active", "==", true),
          orderBy("name", "asc")
        );
        const snap = await getDocs(q);

        const rows: DepartmentRow[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          rows.push({
            id: d.id,
            name: data?.name ?? d.id,
          });
        });

        setDepartments(rows);
      } catch (e: any) {
        console.error("Department fetch error:", e);
      }
    };

    fetchDepartments();
  }, [myCompanyId]);

  // PENDING 사용자 가져오기 (같은 회사)
  useEffect(() => {
    if (!myCompanyId) return;

    const fetchPending = async () => {
      try {
        setLoading(true);
        const q = query(
          collection(db, "users"),
          where("companyId", "==", myCompanyId),
          where("status", "==", "PENDING")
        );
        const snap = await getDocs(q);

        const rows: PendingUser[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          rows.push({
            id: d.id,
            email: data?.email ?? "",
            name: data?.name ?? "",
            role: data?.role ?? "SALES",
            storeId: data?.storeId ?? null,
            department: data?.department ?? null,
            phone: data?.phone ?? null,
            requestedDepartment: data?.requestedDepartment ?? null,
            createdAt: data?.createdAt,
          });
        });
        setList(rows);

        // 초기값 세팅
        const roleInit: Record<string, UserRole> = {};
        const assignTypeInit: Record<string, 'department' | 'store'> = {};
        const assignValueInit: Record<string, string> = {};

        rows.forEach((r) => {
          roleInit[r.id] = r.role || "SALES";
          // 부서가 있으면 부서, 없으면 매장, 둘 다 없으면 부서로 기본값
          if (r.department) {
            assignTypeInit[r.id] = 'department';
            assignValueInit[r.id] = r.department;
          } else if (r.storeId) {
            assignTypeInit[r.id] = 'store';
            assignValueInit[r.id] = r.storeId;
          } else {
            assignTypeInit[r.id] = 'department';
            assignValueInit[r.id] = '';
          }
        });

        setRoleInputs(roleInit);
        setAssignmentType(assignTypeInit);
        setAssignmentValue(assignValueInit);
      } catch (e: any) {
        Alert.alert("오류", e?.message ?? "대기 목록을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchPending();
  }, [myCompanyId]);

  const approve = async (userId: string) => {
    try {
      const role = roleInputs[userId] || "SALES";
      const assignType = assignmentType[userId];
      const assignValue = (assignmentValue[userId] || "").trim();

      // 부서/매장 필수 체크
      if (!assignValue) {
        Alert.alert("입력 오류", "부서 또는 매장을 선택해 주세요.");
        return;
      }

      // assignType에 따라 storeId 또는 department 설정
      const storeId = assignType === 'store' ? assignValue : null;
      const department = assignType === 'department' ? assignValue : null;

      // Cloud Function 호출
      const approveUserFn = httpsCallable(functions, "approveUser");
      await approveUserFn({
        userId,
        status: "ACTIVE",
        role,
        storeId,
        department,
      });

      Alert.alert("완료", "사용자가 승인되었습니다.");

      // 목록 새로고침
      setList((prev) => prev.filter((u) => u.id !== userId));
    } catch (e: any) {
      Alert.alert("승인 실패", e?.message ?? "잠시 후 다시 시도해 주세요.");
    }
  };

  const reject = async (userId: string) => {
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
              const approveUserFn = httpsCallable(functions, "approveUser");
              await approveUserFn({
                userId,
                status: "REJECTED",
              });

              Alert.alert("완료", "사용자가 거부되었습니다.");
              setList((prev) => prev.filter((u) => u.id !== userId));
            } catch (e: any) {
              Alert.alert("오류", e?.message ?? "잠시 후 다시 시도해 주세요.");
            }
          },
        },
      ]
    );
  };

  if (!myCompanyId) {
    return (
      <View style={styles.root}>
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.muted}>회사 정보를 불러오는 중...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>승인 대기 사용자</Text>
          <Pressable
            onPress={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 100);
            }}
            style={styles.refreshBtn}
          >
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
            const role = roleInputs[user.id] || "SALES";
            const assignType = assignmentType[user.id] || 'department';
            const assignValue = assignmentValue[user.id] || '';

            return (
              <Card key={user.id}>
                <View style={styles.userHeader}>
                  <Text style={styles.userName}>{user.name || "(이름 없음)"}</Text>
                  <Text style={styles.userEmail}>{user.email}</Text>
                  {user.phone && (
                    <Text style={styles.userInfo}>📞 {user.phone}</Text>
                  )}
                  {user.requestedDepartment && (
                    <Text style={styles.userInfo}>🏢 희망 부서: {user.requestedDepartment}</Text>
                  )}
                </View>

                {/* Role 선택 */}
                <View style={{ marginBottom: 12 }}>
                  <Text style={styles.label}>구분</Text>
                  <View style={styles.roleGrid}>
                    {(["MANAGER", "SALES"] as UserRole[]).map((r) => (
                      <Pressable
                        key={r}
                        onPress={() => {
                          setRoleInputs((p) => ({ ...p, [user.id]: r }));
                          // 구분 변경 시 부서/매장 선택 초기화
                          setAssignmentType((p) => ({ ...p, [user.id]: r === "MANAGER" ? 'department' : 'store' }));
                          setAssignmentValue((p) => ({ ...p, [user.id]: '' }));
                        }}
                        style={[styles.roleChip, role === r && styles.roleChipActive]}
                      >
                        <Text style={[styles.roleText, role === r && styles.roleTextActive]}>
                          {r === "MANAGER" ? "본사 직원" : "매장 직원"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* 부서/매장 선택 (필수, 하나만 선택) */}
                <View style={{ marginBottom: 16 }}>
                  <Text style={styles.label}>
                    {role === "MANAGER" ? "부서 (필수)" : "매장 (필수)"}
                  </Text>
                  <View style={styles.optionWrap}>
                    {/* 본사직원이면 부서만 */}
                    {role === "MANAGER" && departments.map((dept) => (
                      <Pressable
                        key={`dept-${dept.id}`}
                        onPress={() => {
                          setAssignmentType((p) => ({ ...p, [user.id]: 'department' }));
                          setAssignmentValue((p) => ({ ...p, [user.id]: dept.name }));
                        }}
                        style={[
                          styles.optionChip,
                          assignType === 'department' && assignValue === dept.name && styles.optionChipActive
                        ]}
                      >
                        <Text style={[
                          styles.optionText,
                          assignType === 'department' && assignValue === dept.name && styles.optionTextActive
                        ]}>
                          🏢 {dept.name}
                        </Text>
                      </Pressable>
                    ))}
                    {/* 매장직원이면 매장만 */}
                    {role === "SALES" && stores.map((st) => (
                      <Pressable
                        key={`store-${st.id}`}
                        onPress={() => {
                          setAssignmentType((p) => ({ ...p, [user.id]: 'store' }));
                          setAssignmentValue((p) => ({ ...p, [user.id]: st.name }));
                        }}
                        style={[
                          styles.optionChip,
                          assignType === 'store' && assignValue === st.name && styles.optionChipActive
                        ]}
                      >
                        <Text style={[
                          styles.optionText,
                          assignType === 'store' && assignValue === st.name && styles.optionTextActive
                        ]}>
                          🏪 {st.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

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
  container: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },

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
