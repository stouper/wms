// app/staff/sales/index.tsx
// ✅ PostgreSQL 연동: 매출 등록 (자기 소속 매장만)

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
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Card from "../../../components/ui/Card";
import {
  getSalesList,
  createSale,
  updateSale,
  deleteSale,
  SalesRecordInfo,
  authenticateWithCoreApi,
  EmployeeInfo,
} from "../../../lib/authApi";

export default function StaffSalesPage() {
  const router = useRouter();
  const [myEmployee, setMyEmployee] = useState<EmployeeInfo | null>(null);
  const [salesRecords, setSalesRecords] = useState<SalesRecordInfo[]>([]);
  const [filteredSalesRecords, setFilteredSalesRecords] = useState<SalesRecordInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<SalesRecordInfo | null>(null);

  // Form fields
  const [saleDate, setSaleDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("일반");
  const [description, setDescription] = useState("");

  // 내 직원 정보 가져오기
  useEffect(() => {
    const loadMyInfo = async () => {
      try {
        const result = await authenticateWithCoreApi();
        if (result.success && result.employee) {
          setMyEmployee(result.employee);

          // 본사 직원이면 매출 등록 불가
          if (result.employee.isHq) {
            Alert.alert("안내", "매장 직원만 매출을 등록할 수 있습니다.");
          }
        }
      } catch (error) {
        console.error("직원 정보 로드 실패:", error);
      }
    };
    loadMyInfo();
  }, []);

  // PostgreSQL에서 매출 목록 가져오기 (내 매장만)
  const loadSales = useCallback(async () => {
    if (!myEmployee?.storeCode) return;

    setLoading(true);
    try {
      // 내 매장 매출만 조회
      const data = await getSalesList(myEmployee.storeCode);
      setSalesRecords(data);
    } catch (error) {
      console.error("매출 목록 로드 실패:", error);
      Alert.alert("오류", "매출 목록을 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [myEmployee?.storeCode]);

  useEffect(() => {
    if (myEmployee?.storeCode) {
      loadSales();
    }
  }, [myEmployee?.storeCode]);

  // 검색 및 필터링
  useEffect(() => {
    let filtered = salesRecords;

    // 날짜 필터 (saleDate를 YYYY-MM-DD로 변환)
    if (selectedDate) {
      filtered = filtered.filter((record) => {
        const recordDate = new Date(record.saleDate).toISOString().split("T")[0];
        return recordDate === selectedDate;
      });
    }

    // 검색어 필터
    if (searchText) {
      filtered = filtered.filter(
        (record) =>
          record.productType?.toLowerCase().includes(searchText.toLowerCase()) ||
          record.codeName?.toLowerCase().includes(searchText.toLowerCase())
      );
    }

    setFilteredSalesRecords(filtered);
  }, [searchText, salesRecords, selectedDate]);

  // 매출 추가/수정
  const handleSave = async () => {
    if (!myEmployee?.storeCode) {
      Alert.alert("오류", "직원 정보를 확인해주세요.");
      return;
    }

    if (myEmployee.isHq) {
      Alert.alert("권한 없음", "본사 직원은 매출을 등록할 수 없습니다.");
      return;
    }

    if (!amount || !saleDate) {
      Alert.alert("확인", "필수 정보를 모두 입력하세요");
      return;
    }

    try {
      if (editingRecord) {
        // 기존 항목 수정
        await updateSale(editingRecord.id, {
          storeCode: myEmployee.storeCode,
          storeName: myEmployee.storeName || undefined,
          saleDate,
          amount: parseInt(amount),
          productType: category !== "일반" ? category : undefined,
          codeName: description || undefined,
          qty: 1,
        });
        Alert.alert("완료", "매출이 수정되었습니다.");
      } else {
        // 새 항목 추가
        await createSale({
          storeCode: myEmployee.storeCode,
          storeName: myEmployee.storeName || undefined,
          saleDate,
          amount: parseInt(amount),
          productType: category !== "일반" ? category : undefined,
          codeName: description || undefined,
          qty: 1,
        });
        Alert.alert("완료", "매출이 등록되었습니다.");
      }

      // 폼 초기화 및 목록 새로고침
      setShowAddModal(false);
      setEditingRecord(null);
      setAmount("");
      setCategory("일반");
      setDescription("");
      setSaleDate(new Date().toISOString().split("T")[0]);
      loadSales();
    } catch (error) {
      console.error("저장 실패:", error);
      Alert.alert("오류", "저장에 실패했습니다");
    }
  };

  // 매출 삭제
  const handleDelete = async (id: string) => {
    Alert.alert("삭제 확인", "정말 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteSale(id);
            Alert.alert("완료", "매출이 삭제되었습니다.");
            loadSales();
          } catch (error) {
            console.error("삭제 실패:", error);
            Alert.alert("오류", "삭제에 실패했습니다");
          }
        },
      },
    ]);
  };

  // 수정 모드 열기
  const handleEdit = (record: SalesRecordInfo) => {
    setEditingRecord(record);
    setAmount(record.amount.toString());
    setSaleDate(new Date(record.saleDate).toISOString().split("T")[0]);
    setCategory(record.productType || "일반");
    setDescription(record.codeName || "");
    setShowAddModal(true);
  };

  // 추가 모드 열기
  const handleOpenAdd = () => {
    if (myEmployee?.isHq) {
      Alert.alert("권한 없음", "본사 직원은 매출을 등록할 수 없습니다.");
      return;
    }

    if (!myEmployee?.storeCode) {
      Alert.alert("오류", "소속 매장 정보가 없습니다.");
      return;
    }

    setEditingRecord(null);
    setAmount("");
    setCategory("일반");
    setDescription("");
    setSaleDate(new Date().toISOString().split("T")[0]);
    setShowAddModal(true);
  };

  // 날짜 표시 형식
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
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
      .filter((r) => {
        const recordDate = new Date(r.saleDate).toISOString().split("T")[0];
        return recordDate === date;
      })
      .reduce((sum, r) => sum + r.amount, 0);
  };

  const SalesCard = ({ record }: { record: SalesRecordInfo }) => (
    <Pressable
      onPress={() => handleEdit(record)}
      style={styles.salesCard}
    >
      <View style={styles.salesHeader}>
        <View style={{ flex: 1 }}>
          {record.codeName && (
            <Text style={styles.description} numberOfLines={1}>
              {record.codeName}
            </Text>
          )}
          {record.productType && record.productType !== "일반" && (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{record.productType}</Text>
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
  const groupedByDate = new Map<string, SalesRecordInfo[]>();
  filteredSalesRecords.forEach((record) => {
    const recordDate = new Date(record.saleDate).toISOString().split("T")[0];
    if (!groupedByDate.has(recordDate)) {
      groupedByDate.set(recordDate, []);
    }
    groupedByDate.get(recordDate)!.push(record);
  });
  const sortedDates = Array.from(groupedByDate.keys()).sort().reverse();

  // 본사 직원이거나 매장 정보 없으면 안내 표시
  if (!myEmployee) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backButton}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>매출등록</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#1E5BFF" />
          <Text style={styles.loadingText}>직원 정보 불러오는 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (myEmployee.isHq || !myEmployee.storeCode) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backButton}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>매출등록</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingBox}>
          <Text style={styles.errorText}>
            {myEmployee.isHq
              ? "본사 직원은 매출을 등록할 수 없습니다."
              : "소속 매장 정보가 없습니다."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backButton}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>매출등록 - {myEmployee.storeName}</Text>
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
          placeholder="카테고리 또는 설명 검색..."
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
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#1E5BFF" />
            <Text style={styles.loadingText}>로딩 중...</Text>
          </View>
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
            {/* 매장 정보 표시 (변경 불가) */}
            <Card>
              <Text style={styles.formLabel}>매장</Text>
              <View style={styles.storeInfoBox}>
                <Text style={styles.storeInfoText}>{myEmployee.storeName}</Text>
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
  loadingBox: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 40,
  },
  loadingText: {
    color: "#64748b",
    fontSize: 14,
    textAlign: "center",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
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
  description: {
    color: "#E6E7EB",
    fontSize: 14,
    fontWeight: "600",
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
  storeInfoBox: {
    backgroundColor: "#1A1D24",
    borderWidth: 1,
    borderColor: "#2A2F3A",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  storeInfoText: {
    color: "#A9AFBC",
    fontSize: 14,
    fontWeight: "600",
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
