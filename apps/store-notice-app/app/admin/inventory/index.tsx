// app/admin/inventory/index.tsx
// WMS 재고 조회 - 왼쪽 매장 목록, 오른쪽 재고 표시

import React, { useEffect, useState } from "react";
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { auth, db } from "../../../firebaseConfig";
import { SafeAreaView } from "react-native-safe-area-context";

interface InventoryItem {
  id: string;
  productName: string;
  quantity: number;
  unit: string;
  skuCode?: string;
  makerCode?: string;
  locationCode?: string;
  locationName?: string;
}

interface WmsStore {
  storeCode: string;
  storeName: string;
  skuCount: number;
  totalQty: number;
}

export default function InventoryPage() {
  const router = useRouter();
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null);

  // 매장 목록
  const [stores, setStores] = useState<WmsStore[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [selectedStoreCode, setSelectedStoreCode] = useState<string | null>(null);

  // 재고 목록
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [filteredInventory, setFilteredInventory] = useState<InventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [searchText, setSearchText] = useState("");

  // 내 companyId 가져오기
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const unsubUser = onSnapshot(doc(db, "users", uid), async (userSnap) => {
      if (userSnap.exists()) {
        const companyId = (userSnap.data() as any)?.companyId;
        if (companyId) {
          setMyCompanyId(companyId);
        }
      }
    });

    return () => unsubUser();
  }, []);

  // 매장 목록 불러오기
  useEffect(() => {
    if (!myCompanyId) return;
    loadStores();
  }, [myCompanyId]);

  const loadStores = async () => {
    try {
      setStoresLoading(true);
      const functions = getFunctions();
      const getWmsStoresList = httpsCallable(functions, "getWmsStoresList");
      const result = await getWmsStoresList({});
      const data = result.data as any;

      if (data?.ok && data?.stores) {
        setStores(data.stores);
        // 첫 번째 매장 자동 선택
        if (data.stores.length > 0 && !selectedStoreCode) {
          setSelectedStoreCode(data.stores[0].storeCode);
        }
      }
    } catch (error: any) {
      console.error("매장 목록 조회 실패:", error);
      Alert.alert("오류", "매장 목록을 불러올 수 없습니다");
    } finally {
      setStoresLoading(false);
    }
  };

  // 선택된 매장의 재고 불러오기
  useEffect(() => {
    if (selectedStoreCode) {
      loadInventory(selectedStoreCode);
    }
  }, [selectedStoreCode]);

  const loadInventory = async (storeCode: string) => {
    try {
      setInventoryLoading(true);
      const functions = getFunctions();
      const getWmsStoreInventory = httpsCallable(functions, "getWmsStoreInventory");
      const result = await getWmsStoreInventory({ storeCode });
      const data = result.data as any;

      if (data?.ok && data?.inventory) {
        const items = (data.inventory.items || []).map((item: any, index: number) => ({
          id: `wms-${index}`,
          productName: item.skuName || item.skuCode || "알 수 없음",
          quantity: item.onHand || 0,
          unit: "개",
          skuCode: item.skuCode,
          makerCode: item.makerCode,
          locationCode: item.locationCode,
          locationName: item.locationName,
        }));
        setInventory(items);
      } else {
        setInventory([]);
      }
    } catch (error: any) {
      console.error("재고 조회 실패:", error);
      setInventory([]);
    } finally {
      setInventoryLoading(false);
    }
  };

  // 검색 기능
  useEffect(() => {
    if (!searchText) {
      setFilteredInventory(inventory);
    } else {
      const filtered = inventory.filter(
        (item) =>
          item.productName?.toLowerCase().includes(searchText.toLowerCase()) ||
          item.skuCode?.toLowerCase().includes(searchText.toLowerCase()) ||
          item.makerCode?.toLowerCase().includes(searchText.toLowerCase()) ||
          item.locationName?.toLowerCase().includes(searchText.toLowerCase())
      );
      setFilteredInventory(filtered);
    }
  }, [searchText, inventory]);

  const InventoryCard = ({ item }: { item: InventoryItem }) => (
    <View style={styles.inventoryCard}>
      <View style={styles.inventoryHeader}>
        <View style={{ flex: 1 }}>
          {item.locationName && (
            <Text style={styles.locationName}>📍 {item.locationName}</Text>
          )}
          <Text style={styles.productName}>{item.productName}</Text>
          {item.skuCode && (
            <Text style={styles.skuCode}>SKU: {item.skuCode}</Text>
          )}
          {item.makerCode && (
            <Text style={styles.skuCode}>제조사: {item.makerCode}</Text>
          )}
        </View>
        <View style={styles.quantityBox}>
          <Text style={styles.quantityLabel}>재고</Text>
          <Text style={styles.quantityValue}>
            {item.quantity}
          </Text>
        </View>
      </View>
    </View>
  );

  const selectedStore = stores.find((s) => s.storeCode === selectedStoreCode);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backButton}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>WMS 재고</Text>
        <Pressable onPress={loadStores}>
          <Text style={styles.refreshButton}>🔄</Text>
        </Pressable>
      </View>

      <View style={styles.container}>
        {/* 왼쪽: 매장 목록 */}
        <View style={styles.storeListContainer}>
          <Text style={styles.storeListTitle}>매장 목록</Text>
          {storesLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#1E5BFF" />
              <Text style={styles.loadingText}>불러오는 중...</Text>
            </View>
          ) : (
            <ScrollView style={styles.storeList} contentContainerStyle={{ gap: 8 }}>
              {stores.map((store) => (
                <Pressable
                  key={store.storeCode}
                  onPress={() => setSelectedStoreCode(store.storeCode)}
                  style={[
                    styles.storeCard,
                    selectedStoreCode === store.storeCode && styles.storeCardActive,
                  ]}
                >
                  <Text style={[
                    styles.storeCardName,
                    selectedStoreCode === store.storeCode && styles.storeCardNameActive,
                  ]}>
                    {store.storeName}
                  </Text>
                  <Text style={styles.storeCardCode}>{store.storeCode}</Text>
                  <View style={styles.storeCardStats}>
                    <Text style={styles.storeCardStat}>상품 {store.skuCount}</Text>
                    <Text style={styles.storeCardStat}>수량 {store.totalQty}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>

        {/* 오른쪽: 재고 목록 */}
        <View style={styles.inventoryContainer}>
          {selectedStore && (
            <View style={styles.inventoryHeader2}>
              <View>
                <Text style={styles.inventoryTitle}>{selectedStore.storeName}</Text>
                <Text style={styles.inventorySubtitle}>
                  상품 {inventory.length}개 · 총 {inventory.reduce((sum, item) => sum + item.quantity, 0)}개
                </Text>
              </View>
            </View>
          )}

          {/* 검색 */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="SKU코드, 상품명 검색..."
              placeholderTextColor="#64748b"
              value={searchText}
              onChangeText={setSearchText}
            />
          </View>

          {/* 재고 목록 */}
          {inventoryLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#1E5BFF" />
              <Text style={styles.loadingText}>재고 불러오는 중...</Text>
            </View>
          ) : !selectedStoreCode ? (
            <Text style={styles.emptyText}>왼쪽에서 매장을 선택해주세요</Text>
          ) : filteredInventory.length === 0 ? (
            <Text style={styles.emptyText}>
              {searchText ? "검색 결과가 없습니다" : "재고가 없습니다"}
            </Text>
          ) : (
            <FlatList
              data={filteredInventory}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <InventoryCard item={item} />}
              contentContainerStyle={styles.inventoryList}
            />
          )}
        </View>
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
  refreshButton: {
    fontSize: 20,
  },
  container: {
    flex: 1,
    flexDirection: "row",
  },

  // 왼쪽: 매장 목록
  storeListContainer: {
    width: 200,
    borderRightWidth: 1,
    borderRightColor: "#2A2F3A",
    backgroundColor: "#0B0C10",
  },
  storeListTitle: {
    color: "#E6E7EB",
    fontSize: 14,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2F3A",
  },
  storeList: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  storeCard: {
    backgroundColor: "#1A1D24",
    borderWidth: 1,
    borderColor: "#2A2F3A",
    borderRadius: 8,
    padding: 10,
  },
  storeCardActive: {
    backgroundColor: "#1E5BFF",
    borderColor: "#1E5BFF",
  },
  storeCardName: {
    color: "#E6E7EB",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
  },
  storeCardNameActive: {
    color: "#fff",
  },
  storeCardCode: {
    color: "#64748b",
    fontSize: 11,
    fontFamily: "monospace",
    marginBottom: 6,
  },
  storeCardStats: {
    flexDirection: "row",
    gap: 8,
  },
  storeCardStat: {
    color: "#A9AFBC",
    fontSize: 10,
  },

  // 오른쪽: 재고 목록
  inventoryContainer: {
    flex: 1,
    backgroundColor: "#0B0C10",
  },
  inventoryHeader2: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2F3A",
  },
  inventoryTitle: {
    color: "#E6E7EB",
    fontSize: 16,
    fontWeight: "700",
  },
  inventorySubtitle: {
    color: "#A9AFBC",
    fontSize: 12,
    marginTop: 2,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInput: {
    backgroundColor: "#1A1D24",
    borderWidth: 1,
    borderColor: "#2A2F3A",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#E6E7EB",
    fontSize: 14,
  },
  inventoryList: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 8,
  },
  inventoryCard: {
    backgroundColor: "#1A1D24",
    borderWidth: 1,
    borderColor: "#2A2F3A",
    borderRadius: 10,
    padding: 12,
  },
  inventoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  locationName: {
    color: "#A9AFBC",
    fontSize: 11,
    marginBottom: 4,
  },
  productName: {
    color: "#E6E7EB",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  skuCode: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 2,
    fontFamily: "monospace",
  },
  quantityBox: {
    backgroundColor: "#0B0C10",
    borderRadius: 6,
    padding: 8,
    minWidth: 70,
    alignItems: "center",
  },
  quantityLabel: {
    color: "#A9AFBC",
    fontSize: 10,
    fontWeight: "500",
    marginBottom: 2,
  },
  quantityValue: {
    color: "#1E5BFF",
    fontSize: 18,
    fontWeight: "700",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: {
    color: "#64748b",
    fontSize: 13,
  },
  emptyText: {
    color: "#64748b",
    fontSize: 14,
    textAlign: "center",
    marginTop: 40,
  },
});
