// app/admin/sales/index.tsx
// ✅ PostgreSQL 연동: 매출 조회 전용 (관리자)

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getSalesList,
  SalesRecordInfo,
} from "../../../lib/authApi";

export default function AdminSalesPage() {
  const router = useRouter();
  const [salesRecords, setSalesRecords] = useState<SalesRecordInfo[]>([]);
  const [filteredSalesRecords, setFilteredSalesRecords] = useState<SalesRecordInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  // PostgreSQL에서 매출 목록 가져오기
  const loadSales = useCallback(async () => {
    setLoading(true);
    try {
      // 관리자가 업로드한 매출만 조회 (매장별 매출전표)
      const data = await getSalesList(undefined, undefined, undefined, "매장별 매출전표");
      setSalesRecords(data);
    } catch (error) {
      console.error("매출 목록 로드 실패:", error);
      Alert.alert("오류", "매출 목록을 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSales();
  }, []);

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
          record.storeName?.toLowerCase().includes(searchText.toLowerCase()) ||
          record.productType?.toLowerCase().includes(searchText.toLowerCase())
      );
    }

    setFilteredSalesRecords(filtered);
  }, [searchText, salesRecords, selectedDate]);

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
    <View style={styles.salesCard}>
      <View style={styles.salesHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.storeName}>{record.storeName}</Text>
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
      </View>
      <View style={styles.salesFooter}>
        <Text style={styles.amountLabel}>매출액</Text>
        <Text style={styles.amountValue}>₩{formatAmount(record.amount)}</Text>
      </View>
    </View>
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

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backButton}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>매출 조회</Text>
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
});
