// app/admin/departments/index.tsx
// ✅ PostgreSQL 연동: 부서 관리

import React, { useEffect, useState, useCallback } from "react";
import {
  Alert,
  ActivityIndicator,
  Text,
  View,
  StyleSheet,
  Pressable,
  TextInput,
  Modal,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getEmployeesByDepartmentId,
  DepartmentInfo,
  EmployeeInfo,
} from "../../../lib/authApi";

export default function AdminDepartments() {
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);

  // 추가/수정 모달
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentInfo | null>(null);
  const [deptCode, setDeptCode] = useState("");
  const [deptName, setDeptName] = useState("");
  const [saving, setSaving] = useState(false);

  // 부서 클릭시 직원 목록 확장/축소
  const [expandedDeptId, setExpandedDeptId] = useState<string | null>(null);
  const [deptEmployees, setDeptEmployees] = useState<Record<string, EmployeeInfo[]>>({});
  const [loadingEmployees, setLoadingEmployees] = useState<Record<string, boolean>>({});

  // 부서 목록 가져오기
  const loadDepartments = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getDepartments();
      setDepartments(data);
    } catch (e: any) {
      Alert.alert("오류", e?.message ?? "부서 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  // 추가 모달 열기
  const openAddModal = () => {
    setEditingDept(null);
    setDeptCode("");
    setDeptName("");
    setModalVisible(true);
  };

  // 수정 모달 열기
  const openEditModal = (dept: DepartmentInfo) => {
    setEditingDept(dept);
    setDeptCode(dept.code);
    setDeptName(dept.name);
    setModalVisible(true);
  };

  // 저장 (추가 또는 수정)
  const handleSave = async () => {
    if (!deptCode.trim()) {
      Alert.alert("확인", "부서 코드를 입력해 주세요.");
      return;
    }

    if (!deptName.trim()) {
      Alert.alert("확인", "부서 이름을 입력해 주세요.");
      return;
    }

    try {
      setSaving(true);

      if (editingDept) {
        // 수정
        const result = await updateDepartment(editingDept.id, {
          code: deptCode.trim(),
          name: deptName.trim(),
        });
        if (result.success) {
          Alert.alert("완료", "부서 정보가 수정되었습니다.");
        } else {
          Alert.alert("오류", result.error || "수정에 실패했습니다.");
          return;
        }
      } else {
        // 추가
        const result = await createDepartment(deptCode.trim(), deptName.trim());
        if (result.success) {
          Alert.alert("완료", "부서가 추가되었습니다.");
        } else {
          Alert.alert("오류", result.error || "추가에 실패했습니다.");
          return;
        }
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
  const toggleActive = async (dept: DepartmentInfo) => {
    try {
      const result = await updateDepartment(dept.id, { isActive: !dept.isActive });
      if (result.success) {
        loadDepartments();
      } else {
        Alert.alert("오류", result.error || "상태 변경에 실패했습니다.");
      }
    } catch (e: any) {
      Alert.alert("오류", e?.message ?? "상태 변경에 실패했습니다.");
    }
  };

  // 삭제
  const handleDelete = (dept: DepartmentInfo) => {
    Alert.alert("삭제 확인", `"${dept.name}" 부서를 삭제하시겠습니까?`, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          try {
            const result = await deleteDepartment(dept.id);
            if (result.success) {
              Alert.alert("완료", "부서가 삭제되었습니다.");
              loadDepartments();
            } else {
              Alert.alert("오류", result.error || "삭제에 실패했습니다.");
            }
          } catch (e: any) {
            Alert.alert("오류", e?.message ?? "삭제에 실패했습니다.");
          }
        },
      },
    ]);
  };

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
      Alert.alert("오류", e?.message ?? "직원 목록을 불러오지 못했습니다.");
    } finally {
      setLoadingEmployees((prev) => ({ ...prev, [dept.id]: false }));
    }
  };

  // 부서 카드 렌더링
  const renderDeptItem = ({ item: dept }: { item: DepartmentInfo }) => {
    const isExpanded = expandedDeptId === dept.id;
    const employees = deptEmployees[dept.id];
    const isLoadingEmps = loadingEmployees[dept.id];

    return (
      <Card>
        <Pressable onPress={() => toggleDeptExpand(dept)}>
          <View style={styles.deptRow}>
            <View style={styles.deptNameContainer}>
              <Text style={styles.deptCode}>[{dept.code}]</Text>
              <Text style={styles.deptName}>{dept.name}</Text>
              {!dept.isActive && <Text style={styles.inactiveTag}>비활성</Text>}
              {dept.employeeCount !== undefined && (
                <Text style={styles.employeeCount}>({dept.employeeCount}명)</Text>
              )}
            </View>
            <View style={styles.inlineActions}>
              <Pressable onPress={() => openEditModal(dept)} style={styles.inlineBtn}>
                <Text style={styles.inlineBtnText}>수정</Text>
              </Pressable>
              <Pressable onPress={() => toggleActive(dept)} style={styles.inlineBtn}>
                <Text style={styles.inlineBtnText}>
                  {dept.isActive ? "비활성화" : "활성화"}
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
  };

  return (
    <SafeAreaView style={styles.root} edges={["bottom"]}>
      <View style={styles.headerContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>부서 관리</Text>
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
        <FlatList
          data={departments}
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

          <Text style={styles.label}>부서 코드 (필수)</Text>
          <TextInput
            value={deptCode}
            onChangeText={setDeptCode}
            placeholder="예: SALES, HR, DEV"
            placeholderTextColor="#64748b"
            style={styles.input}
            autoFocus
            autoCapitalize="characters"
          />

          <Text style={styles.label}>부서 이름 (필수)</Text>
          <TextInput
            value={deptName}
            onChangeText={setDeptName}
            placeholder="예: 영업팀, 인사팀, 개발팀"
            placeholderTextColor="#64748b"
            style={styles.input}
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
  deptNameContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 6,
  },
  deptCode: {
    color: "#1E5BFF",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  deptName: {
    color: "#E6E7EB",
    fontSize: 15,
    fontWeight: "700",
    flexShrink: 1,
  },
  inactiveTag: {
    color: "#ef4444",
    fontSize: 10,
    fontWeight: "600",
    backgroundColor: "#1A1D24",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  employeeCount: {
    color: "#A9AFBC",
    fontSize: 12,
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
