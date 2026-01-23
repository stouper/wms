// app/admin/departments/index.tsx
// ✅ Multi-tenant: 부서 관리 (같은 회사만)

import React, { useEffect, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Text,
  View,
  StyleSheet,
  Pressable,
  TextInput,
  Modal,
} from "react-native";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../../../firebaseConfig";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import DraggableFlatList, {
  ScaleDecorator,
  RenderItemParams,
} from "react-native-draggable-flatlist";
import { GestureHandlerRootView } from "react-native-gesture-handler";

type Department = {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  order?: number;
  createdAt?: any;
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

export default function AdminDepartments() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);

  // 추가/수정 모달
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptName, setDeptName] = useState("");
  const [deptDescription, setDeptDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // 부서 클릭시 직원 목록 확장/축소
  const [expandedDeptId, setExpandedDeptId] = useState<string | null>(null);
  const [deptEmployees, setDeptEmployees] = useState<Record<string, Employee[]>>({});

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

  // 부서 목록 가져오기
  const loadDepartments = async () => {
    if (!myCompanyId) return;

    try {
      setLoading(true);
      const q = query(
        collection(db, "departments"),
        where("companyId", "==", myCompanyId)
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
          createdAt: data?.createdAt,
        });
      });

      // order 필드로 정렬
      rows.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      setDepartments(rows);
    } catch (e: any) {
      Alert.alert("오류", e?.message ?? "부서 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDepartments();
  }, [myCompanyId]);

  // 추가 모달 열기
  const openAddModal = () => {
    setEditingDept(null);
    setDeptName("");
    setDeptDescription("");
    setModalVisible(true);
  };

  // 수정 모달 열기
  const openEditModal = (dept: Department) => {
    setEditingDept(dept);
    setDeptName(dept.name);
    setDeptDescription(dept.description || "");
    setModalVisible(true);
  };

  // 저장 (추가 또는 수정)
  const handleSave = async () => {
    if (!deptName.trim()) {
      Alert.alert("확인", "부서 이름을 입력해 주세요.");
      return;
    }

    if (!myCompanyId) {
      Alert.alert("오류", "회사 정보를 불러오는 중입니다.");
      return;
    }

    try {
      setSaving(true);

      if (editingDept) {
        // 수정
        await updateDoc(doc(db, "departments", editingDept.id), {
          name: deptName.trim(),
          description: deptDescription.trim() || null,
          updatedAt: serverTimestamp(),
        });
        Alert.alert("완료", "부서 정보가 수정되었습니다.");
      } else {
        // 추가 - 맨 마지막 order 값으로 설정
        const maxOrder = departments.length > 0
          ? Math.max(...departments.map(d => d.order ?? 0))
          : 0;
        await addDoc(collection(db, "departments"), {
          companyId: myCompanyId,
          name: deptName.trim(),
          description: deptDescription.trim() || null,
          active: true,
          order: maxOrder + 1,
          createdAt: serverTimestamp(),
        });
        Alert.alert("완료", "부서가 추가되었습니다.");
      }

      setModalVisible(false);
      loadDepartments();
    } catch (e: any) {
      Alert.alert("오류", e?.message ?? "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  // 활성화/비활성화 토글
  const toggleActive = async (dept: Department) => {
    try {
      await updateDoc(doc(db, "departments", dept.id), {
        active: !dept.active,
        updatedAt: serverTimestamp(),
      });
      loadDepartments();
    } catch (e: any) {
      Alert.alert("오류", e?.message ?? "상태 변경에 실패했습니다.");
    }
  };

  // 삭제
  const handleDelete = (dept: Department) => {
    Alert.alert("삭제 확인", `"${dept.name}" 부서를 삭제하시겠습니까?`, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "departments", dept.id));
            Alert.alert("완료", "부서가 삭제되었습니다.");
            loadDepartments();
          } catch (e: any) {
            Alert.alert("오류", e?.message ?? "삭제에 실패했습니다.");
          }
        },
      },
    ]);
  };

  // 드래그 앤 드롭으로 부서 순서 변경
  const onDragEnd = async ({ data }: { data: Department[] }) => {
    setDepartments(data);

    // Firestore에 새로운 order 값 일괄 업데이트
    try {
      const batch = writeBatch(db);
      data.forEach((dept, index) => {
        const deptRef = doc(db, "departments", dept.id);
        batch.update(deptRef, { order: index });
      });
      await batch.commit();
    } catch (e: any) {
      Alert.alert("오류", e?.message ?? "순서 변경에 실패했습니다.");
      loadDepartments(); // 실패 시 다시 로드
    }
  };

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
      Alert.alert("오류", e?.message ?? "직원 목록을 불러오지 못했습니다.");
    }
  };

  if (!myCompanyId) {
    return (
      <View style={styles.root}>
        <View style={styles.center}>
          <ActivityIndicator color="#1E5BFF" />
          <Text style={styles.muted}>회사 정보를 불러오는 중...</Text>
        </View>
      </View>
    );
  }

  // 부서 카드 렌더링
  const renderDeptItem = ({ item: dept, drag, isActive }: RenderItemParams<Department>) => {
    return (
      <ScaleDecorator>
        <Card style={[isActive && styles.draggingCard]}>
          <View>
            <Pressable onPress={() => toggleDeptExpand(dept)}>
              <View style={styles.deptRow}>
                <Pressable onLongPress={drag} disabled={isActive} style={styles.dragHandle}>
                  <Text style={styles.dragIcon}>☰</Text>
                </Pressable>
                <Text style={styles.deptName}>{dept.name}</Text>
                <View style={styles.inlineActions}>
                  <Pressable
                    onPress={() => openEditModal(dept)}
                    style={styles.inlineBtn}
                  >
                    <Text style={styles.inlineBtnText}>수정</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => toggleActive(dept)}
                    style={styles.inlineBtn}
                  >
                    <Text style={styles.inlineBtnText}>
                      {dept.active ? "비활성화" : "활성화"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDelete(dept)}
                    style={[styles.inlineBtn, styles.deleteInlineBtn]}
                  >
                    <Text style={[styles.inlineBtnText, styles.deleteInlineBtnText]}>삭제</Text>
                  </Pressable>
                </View>
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
          </View>
        </Card>
      </ScaleDecorator>
    );
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaView style={styles.root} edges={["bottom"]}>
        <View style={styles.headerContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>부서 상세 관리</Text>
            <Pressable onPress={openAddModal} style={styles.addBtn}>
              <Text style={styles.addBtnText}>+ 추가</Text>
            </Pressable>
          </View>
        </View>

        {loading && (
          <View style={styles.center}>
            <ActivityIndicator color="#1E5BFF" />
            <Text style={styles.muted}>부서 목록 불러오는 중...</Text>
          </View>
        )}

        {!loading && departments.length === 0 && (
          <View style={styles.container}>
            <Card>
              <EmptyState
                title="등록된 부서가 없습니다"
                subtitle="'+ 추가' 버튼을 눌러 부서를 추가하세요"
              />
            </Card>
          </View>
        )}

        {!loading && departments.length > 0 && (
          <DraggableFlatList
            data={departments}
            onDragEnd={onDragEnd}
            keyExtractor={(item) => item.id}
            renderItem={renderDeptItem}
            contentContainerStyle={styles.listContainer}
          />
        )}

      {/* 추가/수정 모달 */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <SafeAreaView style={styles.modalRoot} edges={["top", "bottom"]}>
          <Text style={styles.modalTitle}>
            {editingDept ? "부서 수정" : "부서 추가"}
          </Text>

          <Text style={styles.label}>부서 이름 (필수)</Text>
          <TextInput
            value={deptName}
            onChangeText={setDeptName}
            placeholder="예: 영업팀, 물류팀, 회계팀"
            placeholderTextColor="#64748b"
            style={styles.input}
            autoFocus
          />

          <Text style={styles.label}>설명 (선택사항)</Text>
          <TextInput
            value={deptDescription}
            onChangeText={setDeptDescription}
            placeholder="예: 영업 업무 담당"
            placeholderTextColor="#64748b"
            style={[styles.input, styles.textarea]}
            multiline
          />

          <View style={{ height: 20 }} />

          <View style={styles.modalActions}>
            <Pressable
              onPress={() => setModalVisible(false)}
              style={[styles.modalBtn, styles.cancelBtn]}
              disabled={saving}
            >
              <Text style={styles.modalBtnText}>취소</Text>
            </Pressable>

            <Pressable
              onPress={handleSave}
              style={[styles.modalBtn, styles.saveBtn]}
              disabled={saving}
            >
              <Text style={styles.modalBtnText}>
                {saving ? "저장 중..." : "저장"}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B0C10" },
  container: { padding: 16, gap: 8, paddingBottom: 100 },
  listContainer: {
    padding: 16,
    gap: 8,
    paddingBottom: 100,
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 0,
    backgroundColor: "#0B0C10",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: { color: "#E6E7EB", fontSize: 20, fontWeight: "700" },
  addBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#10b981",
  },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  center: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 40,
  },
  muted: { color: "#A9AFBC", fontSize: 14 },

  deptRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    gap: 6,
  },
  dragHandle: {
    padding: 6,
    marginLeft: -6,
    marginRight: 2,
  },
  dragIcon: {
    color: "#64748b",
    fontSize: 18,
  },
  deptName: {
    color: "#E6E7EB",
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  draggingCard: {
    opacity: 0.7,
    transform: [{ scale: 1.05 }],
  },
  deptInfo: {
    color: "#A9AFBC",
    fontSize: 11,
    marginTop: 2,
  },

  inlineActions: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  inlineBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: "#1E5BFF",
  },
  deleteInlineBtn: {
    backgroundColor: "#ef4444",
  },
  inlineBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 10,
  },
  deleteInlineBtnText: {
    color: "#fff",
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

  modalRoot: {
    flex: 1,
    padding: 16,
    paddingTop: 24,
    backgroundColor: "#0B0C10",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 20,
    color: "#E6E7EB",
  },
  label: {
    color: "#A9AFBC",
    fontSize: 13,
    marginBottom: 8,
    marginTop: 12,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: "#2A2F3A",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#1A1D24",
    color: "#E6E7EB",
    fontSize: 14,
  },
  textarea: {
    height: 80,
    textAlignVertical: "top",
  },

  modalActions: { flexDirection: "row", gap: 12 },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  cancelBtn: { backgroundColor: "#374151" },
  saveBtn: { backgroundColor: "#10b981" },
  modalBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
