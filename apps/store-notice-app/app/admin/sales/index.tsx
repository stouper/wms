// app/admin/sales/index.tsx
// ✅ PostgreSQL 연동: 매장 목록은 core-api에서 가져옴
// 매출등록 페이지

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { doc, onSnapshot, collection, query, where, addDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../../../firebaseConfig";
import Card from "../../../components/ui/Card";
import { SafeAreaView } from "react-native-safe-area-context";
import { getStores, StoreInfo } from "../../../lib/authApi";

interface SalesRecord {
  id: string;
  companyId: string;
  storeId: string;
  storeName: string;
  date: string;
  amount: number;
  category?: string;
  description?: string;
  registeredBy?: string;
  createdAt: any;
  updatedAt: any;
}

export default function SalesPage() {
  const router = useRouter();
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [salesRecords, setSalesRecords] = useState<SalesRecord[]>([]);
  const [filteredSalesRecords, setFilteredSalesRecords] = useState<SalesRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<SalesRecord | null>(null);

  // Form fields
  const [selectedStore, setSelectedStore] = useState("");
  const [saleDate, setSaleDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("일반");
  const [description, setDescription] = useState("");
  const [stores, setStores] = useState<StoreInfo[]>([]);

  // PostgreSQL에서 매장 목록 가져오기
  const loadStores = useCallback(async () => {
    try {
      const data = await getStores();
      // 본사(isHq=true) 제외
      const regularStores = data.filter((s) => !s.isHq);
      setStores(regularStores);
      if (regularStores.length > 0 && !selectedStore) {
        setSelectedStore(regularStores[0].id);
      }
    } catch (e: any) {
      console.error("매장 목록 로드 실패:", e);
    }
  }, [selectedStore]);

  useEffect(() => {
    loadStores();
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    let unsubCompany: (() => void) | undefined;
    let unsubSales: (() => void) | undefined;

    // 내 user 정보 가져와서 companyId 확인
    const unsubUser = onSnapshot(doc(db, "users", uid), async (userSnap) => {
      if (userSnap.exists()) {
        const companyId = (userSnap.data() as any)?.companyId;
        if (!companyId) return;

        setMyCompanyId(companyId);

        // 회사 정보 가져오기
        unsubCompany = onSnapshot(doc(db, "companies", companyId), (companySnap) => {
          if (companySnap.exists()) {
            setCompanyName((companySnap.data() as any)?.name || "");
          }
        });

        // 매출 목록 실시간 가져오기
        const salesQuery = query(
          collection(db, "sales"),
          where("companyId", "==", companyId)
        );
        unsubSales = onSnapshot(salesQuery, (snapshot) => {
          const records: SalesRecord[] = [];
          snapshot.forEach((doc) => {
            records.push({ id: doc.id, ...doc.data() } as SalesRecord);
          });
          setSalesRecords(records);
          setLoading(false);
        });
      }
    });

    return () => {
      unsubUser();
      unsubCompany?.();
      unsubSales?.();
    };
  }, []);

  // 검색 및 필터링
  useEffect(() => {
    let filtered = salesRecords;

    // 날짜 필터
    if (selectedDate) {
      filtered = filtered.filter((record) => record.date === selectedDate);
    }

    // 검색어 필터
    if (searchText) {
      filtered = filtered.filter(
        (record) =>
          record.storeName.toLowerCase().includes(searchText.toLowerCase()) ||
          record.category?.toLowerCase().includes(searchText.toLowerCase())
      );
    }

    setFilteredSalesRecords(filtered);
  }, [searchText, salesRecords, selectedDate]);

  // 매출 추가/수정
  const handleSave = async () => {
    if (!myCompanyId || !selectedStore || !amount || !saleDate) {
      alert("필수 정보를 모두 입력하세요");
      return;
    }

    const store = stores.find((s) => s.id === selectedStore);
    const storeName = store?.name || store?.code || "";
    const uid = auth.currentUser?.uid;

    try {
      if (editingRecord) {
        // 기존 항목 수정
        await updateDoc(doc(db, "sales", editingRecord.id), {
          storeId: selectedStore,
          storeName,
          date: saleDate,
          amount: parseInt(amount),
          category,
          description,
          updatedAt: serverTimestamp(),
        });
      } else {
        // 새 항목 추가
        await addDoc(collection(db, "sales"), {
          companyId: myCompanyId,
          storeId: selectedStore,
          storeName,
          date: saleDate,
          amount: parseInt(amount),
          category,
          description,
          registeredBy: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // 폼 초기화
      setShowAddModal(false);
      setEditingRecord(null);
      setAmount("");
      setCategory("일반");
      setDescription("");
      setSaleDate(new Date().toISOString().split("T")[0]);
      if (stores.length > 0 && !selectedStore) {
        setSelectedStore(stores[0].id);
      }
    } catch (error) {
      console.error("저장 실패:", error);
      alert("저장에 실패했습니다");
    }
  };

  // 매출 삭제
  const handleDelete = async (id: string) => {
    if (confirm("정말 삭제하시겠습니까?")) {
      try {
        await deleteDoc(doc(db, "sales", id));
      } catch (error) {
        console.error("삭제 실패:", error);
        alert("삭제에 실패했습니다");
      }
    }
  };

  // 수정 모드 열기
  const handleEdit = (record: SalesRecord) => {
    setEditingRecord(record);
    setSelectedStore(record.storeId);
    setAmount(record.amount.toString());
    setSaleDate(record.date);
    setCategory(record.category || "일반");
    setDescription(record.description || "");
    setShowAddModal(true);
  };

  // 추가 모드 열기
  const handleOpenAdd = () => {
    setEditingRecord(null);
    setAmount("");
    setCategory("일반");
    setDescription("");
    setSaleDate(new Date().toISOString().split("T")[0]);
    if (stores.length > 0) {
      setSelectedStore(stores[0].id);
    }
    setShowAddModal(true);
  };

  // 날짜 표시 형식
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("ko-KR", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
    });
  };

  // 금액 포맷팅
  const formatAmount = (num: number) => {
    return num.toLocaleString("ko-KR");
  };

  // 일별 매출합계 계산
  const getDailySalesTotal = (date: string) => {
    return filteredSalesRecords
      .filter((r) => r.date === date)
      .reduce((sum, r) => sum + r.amount, 0);
  };

  const SalesCard = ({ record }: { record: SalesRecord }) => (
    <Pressable
      onPress={() => handleEdit(record)}
      style={styles.salesCard}
    >
      <View style={styles.salesHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.storeName}>{record.storeName}</Text>
          {record.description && (
            <Text style={styles.description} numberOfLines={1}>
              {record.description}
            </Text>
          )}
          {record.category && record.category !== "일반" && (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{record.category}</Text>
            </View>
          )}
        </View>
        <Pressable
          onPress={() => handleDelete(record.id)}
          style={styles.deleteBtn}
        >
          <Text style={styles.deleteBtnText}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.salesFooter}>
        <Text style={styles.amountLabel}>매출액</Text>
        <Text style={styles.amountValue}>₩{formatAmount(record.amount)}</Text>
      </View>
    </Pressable>
  );

  // 일별 그룹화
  const groupedByDate = new Map<string, SalesRecord[]>();
  filteredSalesRecords.forEach((record) => {
    if (!groupedByDate.has(record.date)) {
      groupedByDate.set(record.date, []);
    }
    groupedByDate.get(record.date)!.push(record);
  });
  const sortedDates = Array.from(groupedByDate.keys()).sort().reverse();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backButton}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>매출등록</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.filterContainer}>
        <TextInput
          style={styles.dateInput}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#64748b"
          value={selectedDate}
          onChangeText={setSelectedDate}
        />
        <TextInput
          style={[styles.dateInput, { flex: 1 }]}
          placeholder="매장 또는 카테고리 검색..."
          placeholderTextColor="#64748b"
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>총 매출</Text>
          <Text style={styles.statValue}>
            ₩{formatAmount(
              filteredSalesRecords.reduce((sum, r) => sum + r.amount, 0)
            )}
          </Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>거래 수</Text>
          <Text style={styles.statValue}>{filteredSalesRecords.length}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>평균</Text>
          <Text style={styles.statValue}>
            {filteredSalesRecords.length > 0
              ? `₩${formatAmount(
                  Math.floor(
                    filteredSalesRecords.reduce((sum, r) => sum + r.amount, 0) /
                      filteredSalesRecords.length
                  )
                )}`
              : "₩0"}
          </Text>
        </View>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 20 }}>
        {loading ? (
          <Text style={styles.loadingText}>로딩 중...</Text>
        ) : filteredSalesRecords.length === 0 ? (
          <Text style={styles.emptyText}>
            {searchText || selectedDate
              ? "조건에 맞는 거래가 없습니다"
              : "등록된 매출이 없습니다"}
          </Text>
        ) : (
          <FlatList
            data={sortedDates}
            keyExtractor={(date) => date}
            renderItem={({ item: date }) => (
              <View key={date} style={styles.dateGroup}>
                <View style={styles.dateHeader}>
                  <Text style={styles.dateText}>{formatDate(date)}</Text>
                  <Text style={styles.dateTotal}>
                    합계: ₩{formatAmount(getDailySalesTotal(date))}
                  </Text>
                </View>
                {groupedByDate.get(date)!.map((record) => (
                  <SalesCard key={record.id} record={record} />
                ))}
              </View>
            )}
            scrollEnabled={false}
            contentContainerStyle={{ gap: 12 }}
          />
        )}
      </View>

      {/* 추가 버튼 */}
      <Pressable style={styles.fab} onPress={handleOpenAdd}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      {/* 추가/수정 모달 */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowAddModal(false)}>
              <Text style={styles.modalCloseBtn}>‹</Text>
            </Pressable>
            <Text style={styles.modalTitle}>
              {editingRecord ? "매출 수정" : "매출 등록"}
            </Text>
            <Pressable onPress={handleSave}>
              <Text style={styles.modalSaveBtn}>저장</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* 매장 선택 */}
            <Card>
              <Text style={styles.formLabel}>매장</Text>
              <View style={styles.storeSelect}>
                {stores.map((store) => (
                  <Pressable
                    key={store.id}
                    onPress={() => setSelectedStore(store.id)}
                    style={[
                      styles.storeOption,
                      selectedStore === store.id &&
                        styles.storeOptionSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.storeOptionText,
                        selectedStore === store.id &&
                          styles.storeOptionTextSelected,
                      ]}
                    >
                      {store.name || store.code}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Card>

            {/* 날짜 */}
            <Card>
              <Text style={styles.formLabel}>날짜</Text>
              <TextInput
                style={styles.formInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#64748b"
                value={saleDate}
                onChangeText={setSaleDate}
              />
            </Card>

            {/* 매출액 */}
            <Card>
              <Text style={styles.formLabel}>매출액</Text>
              <View style={styles.amountInputContainer}>
                <TextInput
                  style={styles.formInput}
                  placeholder="금액 입력"
                  placeholderTextColor="#64748b"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="number-pad"
                />
                <Text style={styles.currencySymbol}>₩</Text>
              </View>
            </Card>

            {/* 카테고리 */}
            <Card>
              <Text style={styles.formLabel}>카테고리</Text>
              <View style={styles.categorySelect}>
                {["일반", "온라인", "배달", "주문", "기타"].map((cat) => (
                  <Pressable
                    key={cat}
                    onPress={() => setCategory(cat)}
                    style={[
                      styles.categoryOption,
                      category === cat && styles.categoryOptionSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryOptionText,
                        category === cat && styles.categoryOptionTextSelected,
                      ]}
                    >
                      {cat}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Card>

            {/* 설명 */}
            <Card>
              <Text style={styles.formLabel}>설명 (선택사항)</Text>
              <TextInput
                style={[styles.formInput, styles.textArea]}
                placeholder="추가 설명"
                placeholderTextColor="#64748b"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />
            </Card>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B0C10" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2F3A",
  },
  backButton: {
    color: "#E6E7EB",
    fontSize: 28,
    fontWeight: "300",
  },
  headerTitle: {
    color: "#E6E7EB",
    fontSize: 18,
    fontWeight: "700",
  },
  filterContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  dateInput: {
    backgroundColor: "#1A1D24",
    borderWidth: 1,
    borderColor: "#2A2F3A",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#E6E7EB",
    fontSize: 12,
    minWidth: 110,
  },
  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  statItem: {
    flex: 1,
    backgroundColor: "#1A1D24",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2F3A",
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  statLabel: {
    color: "#A9AFBC",
    fontSize: 10,
    fontWeight: "500",
    marginBottom: 4,
  },
  statValue: {
    color: "#1E5BFF",
    fontSize: 14,
    fontWeight: "700",
  },
  loadingText: {
    color: "#64748b",
    fontSize: 14,
    textAlign: "center",
    marginTop: 20,
  },
  emptyText: {
    color: "#64748b",
    fontSize: 14,
    textAlign: "center",
    marginTop: 20,
  },
  dateGroup: {
    marginBottom: 12,
  },
  dateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  dateText: {
    color: "#E6E7EB",
    fontSize: 14,
    fontWeight: "700",
  },
  dateTotal: {
    color: "#1E5BFF",
    fontSize: 12,
    fontWeight: "600",
  },
  salesCard: {
    backgroundColor: "#1A1D24",
    borderWidth: 1,
    borderColor: "#2A2F3A",
    borderRadius: 10,
    padding: 12,
    marginVertical: 4,
  },
  salesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  storeName: {
    color: "#E6E7EB",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  description: {
    color: "#A9AFBC",
    fontSize: 12,
    fontWeight: "400",
    marginBottom: 4,
  },
  categoryBadge: {
    backgroundColor: "#1E5BFF20",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  categoryText: {
    color: "#1E5BFF",
    fontSize: 10,
    fontWeight: "600",
  },
  deleteBtn: {
    padding: 4,
  },
  deleteBtnText: {
    color: "#EF4444",
    fontSize: 18,
  },
  salesFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#2A2F3A",
  },
  amountLabel: {
    color: "#A9AFBC",
    fontSize: 12,
    fontWeight: "500",
  },
  amountValue: {
    color: "#1E5BFF",
    fontSize: 16,
    fontWeight: "700",
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#1E5BFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  fabText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "600",
  },
  modalSafe: {
    flex: 1,
    backgroundColor: "#0B0C10",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2F3A",
  },
  modalCloseBtn: {
    color: "#E6E7EB",
    fontSize: 28,
    fontWeight: "300",
  },
  modalTitle: {
    color: "#E6E7EB",
    fontSize: 16,
    fontWeight: "700",
  },
  modalSaveBtn: {
    color: "#1E5BFF",
    fontSize: 16,
    fontWeight: "600",
  },
  modalContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  formLabel: {
    color: "#E6E7EB",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: "#0B0C10",
    borderWidth: 1,
    borderColor: "#2A2F3A",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#E6E7EB",
    fontSize: 14,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
    paddingTop: 10,
  },
  storeSelect: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  storeOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#0B0C10",
    borderWidth: 1,
    borderColor: "#2A2F3A",
  },
  storeOptionSelected: {
    backgroundColor: "#1E5BFF",
    borderColor: "#1E5BFF",
  },
  storeOptionText: {
    color: "#A9AFBC",
    fontSize: 12,
    fontWeight: "500",
  },
  storeOptionTextSelected: {
    color: "#fff",
  },
  amountInputContainer: {
    position: "relative",
  },
  currencySymbol: {
    position: "absolute",
    right: 12,
    top: 11,
    color: "#64748b",
    fontSize: 14,
    fontWeight: "600",
  },
  categorySelect: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  categoryOption: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#0B0C10",
    borderWidth: 1,
    borderColor: "#2A2F3A",
  },
  categoryOptionSelected: {
    backgroundColor: "#1E5BFF",
    borderColor: "#1E5BFF",
  },
  categoryOptionText: {
    color: "#A9AFBC",
    fontSize: 12,
    fontWeight: "500",
  },
  categoryOptionTextSelected: {
    color: "#fff",
  },
});
