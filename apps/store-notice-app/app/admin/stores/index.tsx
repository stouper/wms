// app/admin/stores/index.tsx
// ✅ Multi-tenant: 매장 관리 (같은 회사만)

import React, { useEffect, useState } from "react";
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
} from "firebase/firestore";
import { auth, db } from "../../../firebaseConfig";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

type Store = {
  id: string;
  code: string;      // 매장코드 (WMS 연동용)
  name: string;
  phone?: string;
  active: boolean;
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

export default function AdminStores() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);

  // 추가/수정 모달
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [storeCode, setStoreCode] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [saving, setSaving] = useState(false);

  // 매장 클릭시 직원 목록 확장/축소
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);
  const [storeEmployees, setStoreEmployees] = useState<Record<string, Employee[]>>({});

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
  const loadStores = async () => {
    if (!myCompanyId) return;

    try {
      setLoading(true);
      const q = query(
        collection(db, "stores"),
        where("companyId", "==", myCompanyId),
        orderBy("name", "asc")
      );
      const snap = await getDocs(q);

      const rows: Store[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        rows.push({
          id: d.id,
          code: data?.code ?? "",
          name: data?.name ?? "",
          phone: data?.phone ?? "",
          active: data?.active !== false,
          createdAt: data?.createdAt,
        });
      });
      setStores(rows);
    } catch (e: any) {
      Alert.alert("오류", e?.message ?? "매장 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStores();
  }, [myCompanyId]);

  // 추가 모달 열기
  const openAddModal = () => {
    setEditingStore(null);
    setStoreCode("");
    setStoreName("");
    setStorePhone("");
    setModalVisible(true);
  };

  // 수정 모달 열기
  const openEditModal = (store: Store) => {
    setEditingStore(store);
    setStoreCode(store.code || "");
    setStoreName(store.name);
    setStorePhone(store.phone || "");
    setModalVisible(true);
  };

  // 저장 (추가 또는 수정)
  const handleSave = async () => {
    if (!storeCode.trim()) {
      Alert.alert("확인", "매장 코드를 입력해 주세요.");
      return;
    }

    if (!storeName.trim()) {
      Alert.alert("확인", "매장 이름을 입력해 주세요.");
      return;
    }

    if (!myCompanyId) {
      Alert.alert("오류", "회사 정보를 불러오는 중입니다.");
      return;
    }

    try {
      setSaving(true);

      if (editingStore) {
        // 수정
        await updateDoc(doc(db, "stores", editingStore.id), {
          code: storeCode.trim(),
          name: storeName.trim(),
          phone: storePhone.trim() || null,
          updatedAt: serverTimestamp(),
        });
        Alert.alert("완료", "매장 정보가 수정되었습니다.");
      } else {
        // 추가
        await addDoc(collection(db, "stores"), {
          companyId: myCompanyId,
          code: storeCode.trim(),
          name: storeName.trim(),
          phone: storePhone.trim() || null,
          active: true,
          createdAt: serverTimestamp(),
        });
        Alert.alert("완료", "매장이 추가되었습니다.");
      }

      setModalVisible(false);
      loadStores();
    } catch (e: any) {
      Alert.alert("오류", e?.message ?? "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  // 활성화/비활성화 토글
  const toggleActive = async (store: Store) => {
    try {
      await updateDoc(doc(db, "stores", store.id), {
        active: !store.active,
        updatedAt: serverTimestamp(),
      });
      loadStores();
    } catch (e: any) {
      Alert.alert("오류", e?.message ?? "상태 변경에 실패했습니다.");
    }
  };

  // 삭제
  const handleDelete = (store: Store) => {
    Alert.alert("삭제 확인", `"${store.name}" 매장을 삭제하시겠습니까?`, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "stores", store.id));
            Alert.alert("완료", "매장이 삭제되었습니다.");
            loadStores();
          } catch (e: any) {
            Alert.alert("오류", e?.message ?? "삭제에 실패했습니다.");
          }
        },
      },
    ]);
  };

  // 매장 클릭 시 직원 목록 로드
  const toggleStoreExpand = async (store: Store) => {
    if (expandedStoreId === store.id) {
      setExpandedStoreId(null);
      return;
    }

    setExpandedStoreId(store.id);

    // 이미 로드된 경우 스킵
    if (storeEmployees[store.id]) return;

    try {
      const q = query(
        collection(db, "users"),
        where("companyId", "==", myCompanyId),
        where("storeId", "==", store.name),
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

      setStoreEmployees((prev) => ({ ...prev, [store.id]: employees }));
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

  return (
    <SafeAreaView style={styles.root} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>매장 상세 관리</Text>
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
          stores.map((store) => (
            <Card key={store.id}>
              <Pressable onPress={() => toggleStoreExpand(store)}>
                <View style={styles.storeRow}>
                  <View style={styles.storeNameContainer}>
                    <Text style={styles.storeCode}>[{store.code}]</Text>
                    <Text style={styles.storeName}>{store.name}</Text>
                  </View>
                  <View style={styles.inlineActions}>
                    <Pressable
                      onPress={() => openEditModal(store)}
                      style={styles.inlineBtn}
                    >
                      <Text style={styles.inlineBtnText}>수정</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => toggleActive(store)}
                      style={styles.inlineBtn}
                    >
                      <Text style={styles.inlineBtnText}>
                        {store.active ? "비활성화" : "활성화"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleDelete(store)}
                      style={[styles.inlineBtn, styles.deleteInlineBtn]}
                    >
                      <Text style={[styles.inlineBtnText, styles.deleteInlineBtnText]}>삭제</Text>
                    </Pressable>
                  </View>
                </View>
                {store.phone && <Text style={styles.storeInfo}>📞 {store.phone}</Text>}
              </Pressable>

              {/* 직원 목록 */}
              {expandedStoreId === store.id && (
                <View style={styles.employeeList}>
                  {!storeEmployees[store.id] && (
                    <View style={styles.employeeLoading}>
                      <ActivityIndicator size="small" color="#1E5BFF" />
                      <Text style={styles.employeeLoadingText}>직원 목록 불러오는 중...</Text>
                    </View>
                  )}
                  {storeEmployees[store.id] && storeEmployees[store.id].length === 0 && (
                    <Text style={styles.noEmployees}>이 매장에 소속된 직원이 없습니다</Text>
                  )}
                  {storeEmployees[store.id] && storeEmployees[store.id].length > 0 && (
                    <>
                      <Text style={styles.employeeHeader}>소속 직원 ({storeEmployees[store.id].length}명)</Text>
                      {storeEmployees[store.id].map((emp) => (
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

          <Text style={styles.label}>매장 이름 (필수)</Text>
          <TextInput
            value={storeName}
            onChangeText={setStoreName}
            placeholder="예: 강남점, 홍대점"
            placeholderTextColor="#64748b"
            style={styles.input}
          />

          <Text style={styles.label}>전화번호 (선택사항)</Text>
          <TextInput
            value={storePhone}
            onChangeText={setStorePhone}
            placeholder="예: 02-1234-5678"
            placeholderTextColor="#64748b"
            style={styles.input}
            keyboardType="phone-pad"
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
  storeInfo: {
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
