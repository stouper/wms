// app/admin/stores/index.tsx
// ✅ PostgreSQL 연동: 매장 관리

import React, { useEffect, useState, useCallback } from "react";
import {
  Alert,
  ActivityIndicator,
  ScrollView,
  Text,
  View,
  StyleSheet,
  Pressable,
  TextInput,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import {
  getStores,
  createStore,
  updateStore,
  deleteStore,
  getEmployeesByStoreId,
  StoreInfo,
  EmployeeInfo,
} from "../../../lib/authApi";

export default function AdminStores() {
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<StoreInfo[]>([]);

  // 추가/수정 모달
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStore, setEditingStore] = useState<StoreInfo | null>(null);
  const [storeCode, setStoreCode] = useState("");
  const [storeName, setStoreName] = useState("");
  const [saving, setSaving] = useState(false);

  // 매장 클릭시 직원 목록 확장/축소
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);
  const [storeEmployees, setStoreEmployees] = useState<Record<string, EmployeeInfo[]>>({});
  const [loadingEmployees, setLoadingEmployees] = useState<Record<string, boolean>>({});

  // 매장 목록 가져오기
  const loadStores = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getStores();
      // 본사(isHq=true) 제외하고 일반 매장만 표시
      const regularStores = data.filter((s) => !s.isHq);
      setStores(regularStores);
    } catch (e: any) {
      Alert.alert("오류", e?.message ?? "매장 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  // 추가 모달 열기
  const openAddModal = () => {
    setEditingStore(null);
    setStoreCode("");
    setStoreName("");
    setModalVisible(true);
  };

  // 수정 모달 열기
  const openEditModal = (store: StoreInfo) => {
    setEditingStore(store);
    setStoreCode(store.code);
    setStoreName(store.name || "");
    setModalVisible(true);
  };

  // 저장 (추가 또는 수정)
  const handleSave = async () => {
    if (!storeCode.trim()) {
      Alert.alert("확인", "매장 코드를 입력해 주세요.");
      return;
    }

    try {
      setSaving(true);

      if (editingStore) {
        // 수정
        const result = await updateStore(editingStore.id, {
          code: storeCode.trim(),
          name: storeName.trim() || undefined,
        });
        if (result.success) {
          Alert.alert("완료", "매장 정보가 수정되었습니다.");
        } else {
          Alert.alert("오류", result.error || "수정에 실패했습니다.");
          return;
        }
      } else {
        // 추가
        const result = await createStore(storeCode.trim(), storeName.trim() || undefined, false);
        if (result.success) {
          Alert.alert("완료", "매장이 추가되었습니다.");
        } else {
          Alert.alert("오류", result.error || "추가에 실패했습니다.");
          return;
        }
      }

      setModalVisible(false);
      loadStores();
    } catch (e: any) {
      Alert.alert("오류", e?.message ?? "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  // 삭제
  const handleDelete = (store: StoreInfo) => {
    Alert.alert("삭제 확인", `"${store.name || store.code}" 매장을 삭제하시겠습니까?`, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          try {
            const result = await deleteStore(store.id);
            if (result.success) {
              Alert.alert("완료", "매장이 삭제되었습니다.");
              loadStores();
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

  // 매장 클릭 시 직원 목록 로드
  const toggleStoreExpand = async (store: StoreInfo) => {
    if (expandedStoreId === store.id) {
      setExpandedStoreId(null);
      return;
    }

    setExpandedStoreId(store.id);

    // 이미 로드된 경우 스킵
    if (storeEmployees[store.id]) return;

    try {
      setLoadingEmployees((prev) => ({ ...prev, [store.id]: true }));
      const employees = await getEmployeesByStoreId(store.id);
      setStoreEmployees((prev) => ({ ...prev, [store.id]: employees }));
    } catch (e: any) {
      Alert.alert("오류", e?.message ?? "직원 목록을 불러오지 못했습니다.");
    } finally {
      setLoadingEmployees((prev) => ({ ...prev, [store.id]: false }));
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>매장 관리</Text>
          <Pressable onPress={openAddModal} style={styles.addBtn}>
            <Text style={styles.addBtnText}>+ 추가</Text>
          </Pressable>
        </View>

        {loading && (
          <View style={styles.center}>
            <ActivityIndicator color="#1E5BFF" />
            <Text style={styles.muted}>매장 목록 불러오는 중...</Text>
          </View>
        )}

        {!loading && stores.length === 0 && (
          <Card>
            <EmptyState
              title="등록된 매장이 없습니다"
              subtitle="'+ 추가' 버튼을 눌러 매장을 추가하세요"
            />
          </Card>
        )}

        {!loading &&
          stores.map((store) => {
            const isExpanded = expandedStoreId === store.id;
            const employees = storeEmployees[store.id];
            const isLoadingEmps = loadingEmployees[store.id];

            return (
              <Card key={store.id}>
                <Pressable onPress={() => toggleStoreExpand(store)}>
                  <View style={styles.storeRow}>
                    <View style={styles.storeNameContainer}>
                      <Text style={styles.storeCode}>[{store.code}]</Text>
                      <Text style={styles.storeName}>{store.name || "(이름 없음)"}</Text>
                    </View>
                    <View style={styles.inlineActions}>
                      <Pressable
                        onPress={() => openEditModal(store)}
                        style={styles.inlineBtn}
                      >
                        <Text style={styles.inlineBtnText}>수정</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleDelete(store)}
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
                      <Text style={styles.noEmployees}>이 매장에 소속된 직원이 없습니다</Text>
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

      {/* 추가/수정 모달 */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <SafeAreaView style={styles.modalRoot} edges={["top", "bottom"]}>
          <Text style={styles.modalTitle}>
            {editingStore ? "매장 수정" : "매장 추가"}
          </Text>

          <Text style={styles.label}>매장 코드 (필수)</Text>
          <TextInput
            value={storeCode}
            onChangeText={setStoreCode}
            placeholder="예: GN001, HD002"
            placeholderTextColor="#64748b"
            style={styles.input}
            autoFocus
            autoCapitalize="characters"
          />

          <Text style={styles.label}>매장 이름 (선택사항)</Text>
          <TextInput
            value={storeName}
            onChangeText={setStoreName}
            placeholder="예: 강남점, 홍대점"
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
  container: { paddingHorizontal: 16, paddingTop: 8, gap: 8, paddingBottom: 100 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
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

  storeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    gap: 6,
  },
  storeNameContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 6,
  },
  storeCode: {
    color: "#1E5BFF",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  storeName: {
    color: "#E6E7EB",
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
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
