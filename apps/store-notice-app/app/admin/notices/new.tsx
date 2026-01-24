// app/admin/notices/new.tsx
// ✅ PostgreSQL 연동: stores/departments는 core-api에서 가져옴

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Alert,
  Button,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { auth } from "../../../firebaseConfig";
import Card from "../../../components/ui/Card";

// Callable
import { getFunctions, httpsCallable } from "firebase/functions";

// PostgreSQL API
import {
  getStores,
  getDepartments,
  getEmployees,
  StoreInfo,
  DepartmentInfo,
} from "../../../lib/authApi";

// 안전영역
import { SafeAreaView } from "react-native-safe-area-context";

type TargetType = "ALL" | "STORE" | "HQ_DEPT";

export default function AdminNew() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  // ✅ pendingCount
  const [pendingCount, setPendingCount] = useState(0);

  // ✅ 타겟 타입
  const [targetType, setTargetType] = useState<TargetType>("ALL");

  // ✅ stores from PostgreSQL
  const [storesLoading, setStoresLoading] = useState(true);
  const [stores, setStores] = useState<StoreInfo[]>([]);

  // 매장 선택 관련
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [storeSearch, setStoreSearch] = useState("");

  // ✅ departments from PostgreSQL
  const [departmentsLoading, setDepartmentsLoading] = useState(true);
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);

  // 부서 선택 관련
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([]);
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [deptSearch, setDeptSearch] = useState("");

  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  // -------------------------
  // 초기 데이터 로드 (PostgreSQL)
  // -------------------------
  const loadInitialData = useCallback(async () => {
    try {
      // PENDING 직원 수
      const pendingEmployees = await getEmployees('PENDING');
      setPendingCount(pendingEmployees.length);

      // 매장/부서 로드
      await Promise.all([fetchStores(), fetchDepartments()]);
      setDataLoaded(true);
    } catch (e: any) {
      console.error("초기 데이터 로드 실패:", e);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // -------------------------
  // stores fetch (PostgreSQL)
  // -------------------------
  const fetchStores = async () => {
    try {
      setStoresLoading(true);
      const data = await getStores();
      // 본사(isHq=true) 제외
      const regularStores = data.filter((s) => !s.isHq);
      setStores(regularStores);
    } catch (e: any) {
      console.log("[NEW] fetchStores error:", e);
      Alert.alert("매장 목록 오류", e?.message ?? "매장 목록을 불러오지 못했습니다.");
    } finally {
      setStoresLoading(false);
    }
  };

  // -------------------------
  // departments fetch (PostgreSQL)
  // -------------------------
  const fetchDepartments = async () => {
    try {
      setDepartmentsLoading(true);
      const data = await getDepartments(true); // 활성화된 부서만
      setDepartments(data);
    } catch (e: any) {
      console.log("[NEW] fetchDepartments error:", e);
      Alert.alert("부서 목록 오류", e?.message ?? "부서 목록을 불러오지 못했습니다.");
    } finally {
      setDepartmentsLoading(false);
    }
  };

  // 매장/부서는 이미 활성화된 것만 가져옴
  const activeStores = stores;
  const activeDepartments = departments;

  // 🔹 타겟타입 변경 시 불필요한 선택값 정리
  const changeTargetType = (t: TargetType) => {
    setTargetType(t);
    if (t !== "STORE") setSelectedStoreIds([]);
    if (t !== "HQ_DEPT") setSelectedDeptIds([]);
  };

  // 🔹 매장 검색 필터
  const filteredStores = useMemo(() => {
    const key = storeSearch.trim().toLowerCase();
    const base = activeStores;

    if (!key) return base;

    return base.filter((s) => {
      const hay = `${s.id} ${s.code} ${s.name || ""}`.toLowerCase();
      return hay.includes(key);
    });
  }, [storeSearch, activeStores]);

  const toggleSelectStore = (sid: string) => {
    setSelectedStoreIds((prev) =>
      prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]
    );
  };

  const clearStores = () => setSelectedStoreIds([]);

  // 🔹 부서 검색 필터
  const filteredDepartments = useMemo(() => {
    const key = deptSearch.trim().toLowerCase();
    const base = activeDepartments;

    if (!key) return base;

    return base.filter((d) => {
      const hay = `${d.id} ${d.name}`.toLowerCase();
      return hay.includes(key);
    });
  }, [deptSearch, activeDepartments]);

  const toggleSelectDept = (did: string) => {
    setSelectedDeptIds((prev) =>
      prev.includes(did) ? prev.filter((x) => x !== did) : [...prev, did]
    );
  };

  const clearDepts = () => setSelectedDeptIds([]);

  const targetSummary = useMemo(() => {
    if (targetType === "ALL") return "전체";
    if (targetType === "STORE") {
      if (selectedStoreIds.length === 0) return "매장 선택 필요";
      const names = selectedStoreIds
        .map((id) => activeStores.find((s) => s.id === id)?.name || activeStores.find((s) => s.id === id)?.code || id)
        .join(", ");
      return `매장: ${names}`;
    }
    // HQ_DEPT
    if (selectedDeptIds.length === 0) return "부서 선택 필요";
    const names = selectedDeptIds
      .map((id) => activeDepartments.find((d) => d.id === id)?.name ?? id)
      .join(", ");
    return `본사부서: ${names}`;
  }, [targetType, selectedStoreIds, selectedDeptIds, activeStores, activeDepartments]);

  // =========================================================
  // 저장하기 → dispatchNoticeFast Callable 호출
  // =========================================================
  const onSave = async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert("확인", "제목/내용을 입력해 주세요.");
      return;
    }

    const adminUid = auth.currentUser?.uid;
    if (!adminUid) {
      Alert.alert("오류", "관리자 인증 정보를 확인해 주세요.");
      return;
    }

    if (targetType === "STORE" && selectedStoreIds.length === 0) {
      Alert.alert("확인", "대상 매장을 1개 이상 선택해 주세요.");
      return;
    }
    if (targetType === "HQ_DEPT" && selectedDeptIds.length === 0) {
      Alert.alert("확인", "대상 부서를 1개 이상 선택해 주세요.");
      return;
    }

    setLoading(true);
    try {
      const functions = getFunctions();
      const dispatchNotice = httpsCallable(functions, "dispatchNoticeFast");

      // targetDeptCodes: 선택된 부서명을 배열로
      const deptCodes = targetType === "HQ_DEPT"
        ? selectedDeptIds.map((id) => activeDepartments.find((d) => d.id === id)?.name ?? id)
        : null;

      const payload: any = {
        title: title.trim(),
        body: body.trim(),

        targetType,
        targetStoreIds: targetType === "STORE" ? selectedStoreIds : null,
        targetDeptCodes: deptCodes,
      };

      const res = await dispatchNotice(payload);
      console.log("dispatchNotice result:", res?.data);

      Alert.alert("완료", "공지 저장 완료! (서버 자동 발송 중)");
      setTitle("");
      setBody("");
      changeTargetType("ALL");
      setStoreSearch("");
      setDeptSearch("");
    } catch (e: any) {
      console.log("[NEW] Callable error:", e);
      Alert.alert("오류", e?.message ?? "저장 실패");
    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // UI
  // =========================================================

  if (!dataLoaded) {
    return (
      <View style={styles.root}>
        <View style={styles.center}>
          <ActivityIndicator color="#1E5BFF" />
          <Text style={styles.muted}>데이터를 불러오는 중...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>새 공지 작성</Text>

        {/* 제목 */}
        <Text style={styles.label}>제목</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="예) 12월 매장 운영 공지"
          placeholderTextColor="#A9AFBC"
          style={styles.input}
        />

        {/* 내용 */}
        <Text style={styles.label}>내용</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="공지 내용을 입력하세요"
          placeholderTextColor="#A9AFBC"
          multiline
          style={[styles.input, styles.textarea]}
        />

        {/* 타겟 선택 */}
        <Card>
          <Text style={{ color: "#E6E7EB", fontWeight: "700", marginBottom: 8 }}>
            대상 선택
          </Text>

          <View style={styles.row}>
            <Pressable
              onPress={() => changeTargetType("ALL")}
              style={[
                styles.segBtn,
                targetType === "ALL" ? styles.segBtnActive : styles.segBtnInactive,
              ]}
            >
              <Text style={styles.segText}>전체</Text>
            </Pressable>

            <Pressable
              onPress={() => changeTargetType("STORE")}
              style={[
                styles.segBtn,
                targetType === "STORE" ? styles.segBtnActive : styles.segBtnInactive,
              ]}
            >
              <Text style={styles.segText}>매장</Text>
            </Pressable>

            <Pressable
              onPress={() => changeTargetType("HQ_DEPT")}
              style={[
                styles.segBtn,
                targetType === "HQ_DEPT" ? styles.segBtnActive : styles.segBtnInactive,
              ]}
            >
              <Text style={styles.segText}>본사부서</Text>
            </Pressable>
          </View>

          <Text style={{ color: "#A9AFBC", marginTop: 8 }}>{targetSummary}</Text>

          {/* 매장 선택 UI */}
          {targetType === "STORE" && (
            <View style={{ marginTop: 12 }}>
              {storesLoading ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <ActivityIndicator />
                  <Text style={{ color: "#A9AFBC" }}>매장 목록 불러오는 중...</Text>
                </View>
              ) : (
                <>
                  <View style={styles.row}>
                    <Pressable
                      onPress={() => setStoreModalOpen(true)}
                      style={[styles.btn, styles.btnSurface, { flex: 1 }]}
                    >
                      <Text style={styles.btnText} numberOfLines={1}>
                        {selectedStoreIds.length > 0
                          ? `선택 ${selectedStoreIds.length}개`
                          : "매장 선택…"}
                      </Text>
                    </Pressable>

                    <Pressable onPress={clearStores} style={[styles.btn, styles.btnOutline]}>
                      <Text style={styles.btnText}>비우기</Text>
                    </Pressable>

                    <Pressable onPress={fetchStores} style={[styles.btn, styles.btnOutline]}>
                      <Text style={styles.btnText}>새로고침</Text>
                    </Pressable>
                  </View>

                  {selectedStoreIds.length > 0 && (
                    <Text style={{ color: "#A9AFBC", marginTop: 6 }} numberOfLines={2}>
                      {selectedStoreIds
                        .map((id) => activeStores.find((s) => s.id === id)?.name || activeStores.find((s) => s.id === id)?.code || id)
                        .join(", ")}
                    </Text>
                  )}
                </>
              )}
            </View>
          )}

          {/* 본사 부서 선택 UI */}
          {targetType === "HQ_DEPT" && (
            <View style={{ marginTop: 12 }}>
              {departmentsLoading ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <ActivityIndicator />
                  <Text style={{ color: "#A9AFBC" }}>부서 목록 불러오는 중...</Text>
                </View>
              ) : (
                <>
                  <View style={styles.row}>
                    <Pressable
                      onPress={() => setDeptModalOpen(true)}
                      style={[styles.btn, styles.btnSurface, { flex: 1 }]}
                    >
                      <Text style={styles.btnText} numberOfLines={1}>
                        {selectedDeptIds.length > 0
                          ? `선택 ${selectedDeptIds.length}개`
                          : "부서 선택…"}
                      </Text>
                    </Pressable>

                    <Pressable onPress={clearDepts} style={[styles.btn, styles.btnOutline]}>
                      <Text style={styles.btnText}>비우기</Text>
                    </Pressable>

                    <Pressable onPress={fetchDepartments} style={[styles.btn, styles.btnOutline]}>
                      <Text style={styles.btnText}>새로고침</Text>
                    </Pressable>
                  </View>

                  {selectedDeptIds.length > 0 && (
                    <Text style={{ color: "#A9AFBC", marginTop: 6 }} numberOfLines={2}>
                      {selectedDeptIds
                        .map((id) => activeDepartments.find((d) => d.id === id)?.name ?? id)
                        .join(", ")}
                    </Text>
                  )}
                </>
              )}
            </View>
          )}
        </Card>

        <View style={{ height: 8 }} />
        <Button
          title={loading ? "저장 중..." : "저장하기"}
          onPress={onSave}
          disabled={loading}
        />
      </ScrollView>

      {/* ---- 매장 선택 모달 ---- */}
      <Modal
        visible={storeModalOpen}
        animationType="slide"
        onRequestClose={() => setStoreModalOpen(false)}
      >
        <SafeAreaView style={styles.modalRoot} edges={["top", "bottom"]}>
          <Text style={styles.modalTitle}>매장 선택</Text>

          <TextInput
            value={storeSearch}
            onChangeText={setStoreSearch}
            placeholder="검색: 매장ID 또는 이름"
            placeholderTextColor="#A9AFBC"
            autoFocus
            style={styles.modalInput}
          />

          <FlatList
            data={filteredStores}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 16 }}
            renderItem={({ item }) => {
              const checked = selectedStoreIds.includes(item.id);
              return (
                <Pressable onPress={() => toggleSelectStore(item.id)} style={styles.listItem}>
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: checked ? "#1E5BFF" : "#666",
                        backgroundColor: checked ? "#1E5BFF" : "transparent",
                      },
                    ]}
                  />
                  <Text style={{ color: "#E6E7EB" }}>
                    {item.name || item.code}
                  </Text>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={{ padding: 12 }}>
                <Text style={{ color: "#A9AFBC" }}>검색 결과가 없습니다.</Text>
              </View>
            }
          />

          <View style={{ height: 12 }} />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Button title="모두 해제" onPress={clearStores} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="선택 완료" onPress={() => setStoreModalOpen(false)} />
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ---- 부서 선택 모달 ---- */}
      <Modal
        visible={deptModalOpen}
        animationType="slide"
        onRequestClose={() => setDeptModalOpen(false)}
      >
        <SafeAreaView style={styles.modalRoot} edges={["top", "bottom"]}>
          <Text style={styles.modalTitle}>부서 선택</Text>

          <TextInput
            value={deptSearch}
            onChangeText={setDeptSearch}
            placeholder="검색: 부서ID 또는 이름"
            placeholderTextColor="#A9AFBC"
            autoFocus
            style={styles.modalInput}
          />

          <FlatList
            data={filteredDepartments}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 16 }}
            renderItem={({ item }) => {
              const checked = selectedDeptIds.includes(item.id);
              return (
                <Pressable onPress={() => toggleSelectDept(item.id)} style={styles.listItem}>
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: checked ? "#1E5BFF" : "#666",
                        backgroundColor: checked ? "#1E5BFF" : "transparent",
                      },
                    ]}
                  />
                  <Text style={{ color: "#E6E7EB" }}>
                    {item.name}
                  </Text>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={{ padding: 12 }}>
                <Text style={{ color: "#A9AFBC" }}>검색 결과가 없습니다.</Text>
              </View>
            }
          />

          <View style={{ height: 12 }} />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Button title="모두 해제" onPress={clearDepts} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="선택 완료" onPress={() => setDeptModalOpen(false)} />
            </View>
          </View>
        </SafeAreaView>
      </Modal>

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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B0C10" },
  container: { paddingHorizontal: 16, paddingTop: 8, gap: 12, paddingBottom: 100 },
  title: { color: "#E6E7EB", fontSize: 20, fontWeight: "700", marginBottom: 6 },
  label: { color: "#A9AFBC", marginBottom: 6, fontSize: 13, fontWeight: "600" },
  input: {
    backgroundColor: "#1A1D24",
    color: "#E6E7EB",
    borderWidth: 1,
    borderColor: "#2A2F3A",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  textarea: { height: 140, textAlignVertical: "top" },

  center: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 40,
  },
  muted: { color: "#A9AFBC", fontSize: 14 },

  row: { flexDirection: "row", alignItems: "center", gap: 8 },

  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  segBtnActive: { backgroundColor: "#1E5BFF", borderColor: "#1E5BFF" },
  segBtnInactive: { backgroundColor: "transparent", borderColor: "#2A2F3A" },
  segText: { color: "#E6E7EB", fontWeight: "700" },

  btn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  btnSurface: { backgroundColor: "#13151B", borderColor: "#2A2F3A" },
  btnOutline: { backgroundColor: "transparent", borderColor: "#2A2F3A" },
  btnText: { color: "#E6E7EB", fontWeight: "600", fontSize: 12 },

  modalRoot: { flex: 1, padding: 16, paddingTop: 24, backgroundColor: "#0B0C10" },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 12, color: "#E6E7EB" },
  modalInput: {
    borderWidth: 1,
    borderColor: "#2A2F3A",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    color: "#E6E7EB",
    backgroundColor: "#13151B",
  },
  listItem: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2F3A",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5 },

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
});
