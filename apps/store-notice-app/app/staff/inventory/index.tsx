// app/staff/inventory/index.tsx
// 직원용 매장재고 관리 페이지

import React, { useEffect, useState } from "react";
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

interface InventoryItem {
  id: string;
  companyId: string;
  storeId: string;
  storeName: string;
  productName: string;
  quantity: number;
  unit: string;
  minQuantity?: number;
  maxQuantity?: number;
  lastUpdated?: string;
  updatedBy?: string;
  createdAt: any;
  updatedAt: any;
}

export default function StaffInventoryPage() {
  const router = useRouter();
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [filteredInventory, setFilteredInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  // Form fields
  const [selectedStore, setSelectedStore] = useState("");
  const [productName, setProductName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("개");
  const [minQuantity, setMinQuantity] = useState("");
  const [stores, setStores] = useState<any[]>([]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    let unsubCompany: (() => void) | undefined;
    let unsubInventory: (() => void) | undefined;
    let unsubStores: (() => void) | undefined;

    const unsubUser = onSnapshot(doc(db, "users", uid), async (userSnap) => {
      if (userSnap.exists()) {
        const companyId = (userSnap.data() as any)?.companyId;
        if (!companyId) return;

        setMyCompanyId(companyId);

        unsubCompany = onSnapshot(doc(db, "companies", companyId), (companySnap) => {
          if (companySnap.exists()) {
            setCompanyName((companySnap.data() as any)?.name || "");
          }
        });

        const storesQuery = query(
          collection(db, "stores"),
          where("companyId", "==", companyId)
        );
        unsubStores = onSnapshot(storesQuery, (snapshot) => {
          const storeList: any[] = [];
          snapshot.forEach((doc) => {
            storeList.push({ id: doc.id, ...doc.data() });
          });
          setStores(storeList);
          if (!selectedStore && storeList.length > 0) {
            setSelectedStore(storeList[0].id);
          }
        });

        const inventoryQuery = query(
          collection(db, "inventory"),
          where("companyId", "==", companyId)
        );
        unsubInventory = onSnapshot(inventoryQuery, (snapshot) => {
          const items: InventoryItem[] = [];
          snapshot.forEach((doc) => {
            items.push({ id: doc.id, ...doc.data() } as InventoryItem);
          });
          setInventory(items);
          setLoading(false);
        });
      }
    });

    return () => {
      unsubUser();
      unsubCompany?.();
      unsubInventory?.();
      unsubStores?.();
    };
  }, []);

  useEffect(() => {
    if (!searchText) {
      setFilteredInventory(inventory);
    } else {
      const filtered = inventory.filter(
        (item) =>
          item.productName.toLowerCase().includes(searchText.toLowerCase()) ||
          item.storeName.toLowerCase().includes(searchText.toLowerCase())
      );
      setFilteredInventory(filtered);
    }
  }, [searchText, inventory]);

  const handleSave = async () => {
    if (!myCompanyId || !selectedStore || !productName || !quantity) {
      alert("필수 정보를 모두 입력하세요");
      return;
    }

    const storeName =
      stores.find((s) => s.id === selectedStore)?.name || "";
    const uid = auth.currentUser?.uid;

    try {
      if (editingItem) {
        await updateDoc(doc(db, "inventory", editingItem.id), {
          storeId: selectedStore,
          storeName,
          productName,
          quantity: parseInt(quantity),
          unit,
          minQuantity: minQuantity ? parseInt(minQuantity) : undefined,
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        });
      } else {
        await addDoc(collection(db, "inventory"), {
          companyId: myCompanyId,
          storeId: selectedStore,
          storeName,
          productName,
          quantity: parseInt(quantity),
          unit,
          minQuantity: minQuantity ? parseInt(minQuantity) : undefined,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        });
      }

      setShowAddModal(false);
      setEditingItem(null);
      setProductName("");
      setQuantity("");
      setUnit("개");
      setMinQuantity("");
      if (stores.length > 0 && !selectedStore) {
        setSelectedStore(stores[0].id);
      }
    } catch (error) {
      console.error("저장 실패:", error);
      alert("저장에 실패했습니다");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("정말 삭제하시겠습니까?")) {
      try {
        await deleteDoc(doc(db, "inventory", id));
      } catch (error) {
        console.error("삭제 실패:", error);
        alert("삭제에 실패했습니다");
      }
    }
  };

  const handleEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setSelectedStore(item.storeId);
    setProductName(item.productName);
    setQuantity(item.quantity.toString());
    setUnit(item.unit);
    setMinQuantity(item.minQuantity?.toString() || "");
    setShowAddModal(true);
  };

  const handleOpenAdd = () => {
    setEditingItem(null);
    setProductName("");
    setQuantity("");
    setUnit("개");
    setMinQuantity("");
    if (stores.length > 0) {
      setSelectedStore(stores[0].id);
    }
    setShowAddModal(true);
  };

  const isLowStock = (item: InventoryItem) => {
    if (item.minQuantity && item.quantity < item.minQuantity) {
      return true;
    }
    return false;
  };

  const InventoryCard = ({ item }: { item: InventoryItem }) => (
    <Pressable
      onPress={() => handleEdit(item)}
      style={[styles.inventoryCard, isLowStock(item) && styles.lowStockCard]}
    >
      <View style={styles.inventoryHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.storeName}>{item.storeName}</Text>
          <Text style={styles.productName}>{item.productName}</Text>
        </View>
        <Pressable
          onPress={() => handleDelete(item.id)}
          style={styles.deleteBtn}
        >
          <Text style={styles.deleteBtnText}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.inventoryInfo}>
        <View style={styles.quantityBox}>
          <Text style={styles.quantityLabel}>재고</Text>
          <Text
            style={[
              styles.quantityValue,
              isLowStock(item) && styles.lowStockText,
            ]}
          >
            {item.quantity} {item.unit}
          </Text>
        </View>
        {item.minQuantity && (
          <View style={styles.minBox}>
            <Text style={styles.minLabel}>최소</Text>
            <Text style={styles.minValue}>
              {item.minQuantity} {item.unit}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.push("/staff")}>
          <Text style={styles.backButton}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>매장재고</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="상품명 또는 매장명 검색..."
          placeholderTextColor="#64748b"
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>총 상품</Text>
          <Text style={styles.statValue}>{inventory.length}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>낮은 재고</Text>
          <Text style={[styles.statValue, styles.warningText]}>
            {inventory.filter(isLowStock).length}
          </Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>매장 수</Text>
          <Text style={styles.statValue}>{stores.length}</Text>
        </View>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 100 }}>
        {loading ? (
          <Text style={styles.loadingText}>로딩 중...</Text>
        ) : filteredInventory.length === 0 ? (
          <Text style={styles.emptyText}>
            {searchText
              ? "검색 결과가 없습니다"
              : "등록된 재고가 없습니다"}
          </Text>
        ) : (
          <FlatList
            data={filteredInventory}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <InventoryCard item={item} />}
            scrollEnabled={false}
            contentContainerStyle={{ gap: 8 }}
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
              {editingItem ? "재고 수정" : "재고 추가"}
            </Text>
            <Pressable onPress={handleSave}>
              <Text style={styles.modalSaveBtn}>저장</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
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
                      {store.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Card>

            <Card>
              <Text style={styles.formLabel}>상품명</Text>
              <TextInput
                style={styles.formInput}
                placeholder="상품명 입력"
                placeholderTextColor="#64748b"
                value={productName}
                onChangeText={setProductName}
              />
            </Card>

            <Card>
              <Text style={styles.formLabel}>재고량</Text>
              <View style={styles.quantityInputRow}>
                <TextInput
                  style={[styles.formInput, { flex: 1 }]}
                  placeholder="수량"
                  placeholderTextColor="#64748b"
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="number-pad"
                />
                <View style={styles.unitSelect}>
                  {["개", "박스", "팩", "병", "kg", "L"].map((u) => (
                    <Pressable
                      key={u}
                      onPress={() => setUnit(u)}
                      style={[
                        styles.unitOption,
                        unit === u && styles.unitOptionSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.unitOptionText,
                          unit === u && styles.unitOptionTextSelected,
                        ]}
                      >
                        {u}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </Card>

            <Card>
              <Text style={styles.formLabel}>최소 재고 (선택사항)</Text>
              <TextInput
                style={styles.formInput}
                placeholder="최소 재고량 입력"
                placeholderTextColor="#64748b"
                value={minQuantity}
                onChangeText={setMinQuantity}
                keyboardType="number-pad"
              />
              <Text style={styles.formHint}>
                이 값 이하로 내려가면 경고가 표시됩니다
              </Text>
            </Card>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* 하단 네비게이션 바 */}
      <SafeAreaView edges={["bottom"]} style={styles.bottomNavContainer}>
        <View style={styles.bottomNav}>
          <Pressable
            onPress={() => router.push("/staff")}
            style={styles.navButton}
          >
            <Text style={styles.navIcon}>🏠</Text>
            <Text style={styles.navText}>홈</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/staff/settings")}
            style={styles.navButton}
          >
            <Text style={styles.navIcon}>⚙️</Text>
            <Text style={styles.navText}>설정</Text>
          </Pressable>
        </View>
      </SafeAreaView>
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
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
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
    fontSize: 11,
    fontWeight: "500",
    marginBottom: 4,
  },
  statValue: {
    color: "#1E5BFF",
    fontSize: 18,
    fontWeight: "700",
  },
  warningText: {
    color: "#F59E0B",
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
  inventoryCard: {
    backgroundColor: "#1A1D24",
    borderWidth: 1,
    borderColor: "#2A2F3A",
    borderRadius: 10,
    padding: 12,
    marginVertical: 4,
  },
  lowStockCard: {
    borderColor: "#F59E0B",
    backgroundColor: "#1A1D2408",
  },
  inventoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  storeName: {
    color: "#A9AFBC",
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 2,
  },
  productName: {
    color: "#E6E7EB",
    fontSize: 14,
    fontWeight: "600",
  },
  deleteBtn: {
    padding: 4,
  },
  deleteBtnText: {
    color: "#EF4444",
    fontSize: 18,
  },
  inventoryInfo: {
    flexDirection: "row",
    gap: 12,
  },
  quantityBox: {
    flex: 1,
    backgroundColor: "#0B0C10",
    borderRadius: 6,
    padding: 8,
  },
  quantityLabel: {
    color: "#A9AFBC",
    fontSize: 10,
    fontWeight: "500",
    marginBottom: 2,
  },
  quantityValue: {
    color: "#1E5BFF",
    fontSize: 14,
    fontWeight: "700",
  },
  lowStockText: {
    color: "#F59E0B",
  },
  minBox: {
    backgroundColor: "#0B0C10",
    borderRadius: 6,
    padding: 8,
    minWidth: 80,
  },
  minLabel: {
    color: "#A9AFBC",
    fontSize: 10,
    fontWeight: "500",
    marginBottom: 2,
  },
  minValue: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "600",
  },
  fab: {
    position: "absolute",
    bottom: 80,
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
  formHint: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 6,
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
  quantityInputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  unitSelect: {
    flexDirection: "row",
    gap: 4,
  },
  unitOption: {
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: "#0B0C10",
    borderWidth: 1,
    borderColor: "#2A2F3A",
  },
  unitOptionSelected: {
    backgroundColor: "#1E5BFF",
    borderColor: "#1E5BFF",
  },
  unitOptionText: {
    color: "#A9AFBC",
    fontSize: 12,
    fontWeight: "500",
  },
  unitOptionTextSelected: {
    color: "#fff",
  },

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
  navIcon: {
    fontSize: 16,
    marginBottom: 2,
    opacity: 0.5,
  },
  navText: {
    color: "#A9AFBC",
    fontSize: 9,
    fontWeight: "600",
    opacity: 0.5,
  },
});
