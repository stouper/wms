// app/admin/approvals/index.tsx
// 결재 문서 목록 페이지 (3개 탭) - PostgreSQL 버전

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { auth } from "../../../firebaseConfig";
import { Card } from "../../../components/ui/Card";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  APPROVAL_TYPE_LABELS,
  APPROVAL_STATUS_LABELS,
  APPROVAL_STATUS_COLORS,
} from "../../../lib/approvalTypes";
import {
  getMyDrafts,
  getPendingApprovals,
  getProcessedApprovals,
  ApprovalInfo,
} from "../../../lib/authApi";

type TabType = "MY_DRAFTS" | "PENDING_APPROVAL" | "PROCESSED";

export default function ApprovalsIndexPage() {
  const router = useRouter();
  const [currentTab, setCurrentTab] = useState<TabType>("MY_DRAFTS");
  const [approvals, setApprovals] = useState<ApprovalInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const uid = auth.currentUser?.uid;

  const loadApprovals = useCallback(async () => {
    if (!uid) return;

    setLoading(true);
    try {
      let result;

      if (currentTab === "MY_DRAFTS") {
        result = await getMyDrafts();
      } else if (currentTab === "PENDING_APPROVAL") {
        result = await getPendingApprovals();
      } else {
        result = await getProcessedApprovals();
      }

      if (result.success) {
        setApprovals(result.rows);
      } else {
        console.error("결재 문서 로드 실패:", result.error);
        setApprovals([]);
      }
    } catch (error) {
      console.error("결재 문서 로드 실패:", error);
      setApprovals([]);
    } finally {
      setLoading(false);
    }
  }, [uid, currentTab]);

  useEffect(() => {
    loadApprovals();
  }, [loadApprovals]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadApprovals();
    setRefreshing(false);
  };

  const handlePressApproval = (approvalId: string) => {
    router.push(`/admin/approvals/${approvalId}`);
  };

  const renderApprovalCard = ({ item }: { item: ApprovalInfo }) => {
    return (
      <TouchableOpacity
        style={styles.cardContainer}
        onPress={() => handlePressApproval(item.id)}
        activeOpacity={0.7}
      >
        <Card>
          <View style={styles.cardHeader}>
            <View style={styles.typeContainer}>
              <Text style={styles.typeText}>
                {APPROVAL_TYPE_LABELS[item.type] || item.type}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: APPROVAL_STATUS_COLORS[item.status] || "#6B7280" },
              ]}
            >
              <Text style={styles.statusText}>
                {APPROVAL_STATUS_LABELS[item.status] || item.status}
              </Text>
            </View>
          </View>

          <Text style={styles.title}>{item.title}</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>기안자:</Text>
            <Text style={styles.infoValue}>
              {item.authorName} {item.department ? `(${item.department})` : ""}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>작성일:</Text>
            <Text style={styles.infoValue}>
              {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "-"}
            </Text>
          </View>

          {item.status === "PENDING" && item.currentApproverName && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>현재 승인자:</Text>
              <Text style={styles.infoValue}>
                {item.currentApproverName} ({item.currentStep}/{item.totalSteps})
              </Text>
            </View>
          )}

          {item.myStatus && currentTab !== "MY_DRAFTS" && (
            <View style={styles.myStatusContainer}>
              <Text style={styles.myStatusLabel}>내 처리 상태:</Text>
              <View
                style={[
                  styles.myStatusBadge,
                  {
                    backgroundColor:
                      item.myStatus === "APPROVED"
                        ? "#10B981"
                        : item.myStatus === "REJECTED"
                        ? "#EF4444"
                        : "#F59E0B",
                  },
                ]}
              >
                <Text style={styles.myStatusText}>
                  {item.myStatus === "APPROVED"
                    ? "승인함"
                    : item.myStatus === "REJECTED"
                    ? "반려함"
                    : "대기 중"}
                </Text>
              </View>
            </View>
          )}
        </Card>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => {
    let message = "";
    if (currentTab === "MY_DRAFTS") {
      message = "작성한 결재 문서가 없습니다.";
    } else if (currentTab === "PENDING_APPROVAL") {
      message = "승인 대기 중인 문서가 없습니다.";
    } else {
      message = "처리한 문서가 없습니다.";
    }

    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{message}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>결재 문서</Text>
          <TouchableOpacity
            style={styles.newButton}
            onPress={() => router.push("/admin/approvals/new")}
          >
            <Text style={styles.newButtonText}>+ 새 결재</Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, currentTab === "MY_DRAFTS" && styles.activeTab]}
            onPress={() => setCurrentTab("MY_DRAFTS")}
          >
            <Text
              style={[
                styles.tabText,
                currentTab === "MY_DRAFTS" && styles.activeTabText,
              ]}
            >
              내가 올린 문서
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tab,
              currentTab === "PENDING_APPROVAL" && styles.activeTab,
            ]}
            onPress={() => setCurrentTab("PENDING_APPROVAL")}
          >
            <Text
              style={[
                styles.tabText,
                currentTab === "PENDING_APPROVAL" && styles.activeTabText,
              ]}
            >
              내가 승인할 문서
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, currentTab === "PROCESSED" && styles.activeTab]}
            onPress={() => setCurrentTab("PROCESSED")}
          >
            <Text
              style={[
                styles.tabText,
                currentTab === "PROCESSED" && styles.activeTabText,
              ]}
            >
              내가 처리한 문서
            </Text>
          </TouchableOpacity>
        </View>

        {/* List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1E5BFF" />
          </View>
        ) : (
          <FlatList
            data={approvals}
            renderItem={renderApprovalCard}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={renderEmptyState}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          />
        )}
      </View>

      {/* 하단 네비게이션 바 */}
      <SafeAreaView edges={["bottom"]} style={styles.bottomNavContainer}>
        <View style={styles.bottomNav}>
          <TouchableOpacity
            onPress={() => router.push("/admin")}
            style={styles.navButton}
          >
            <Text style={styles.navIcon}>🏠</Text>
            <Text style={styles.navText}>홈</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/admin/organization")}
            style={styles.navButton}
          >
            <Text style={styles.navIcon}>📊</Text>
            <Text style={styles.navText}>조직도</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/admin/settings")}
            style={styles.navButton}
          >
            <Text style={styles.navIcon}>⚙️</Text>
            <Text style={styles.navText}>설정</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0C10",
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#1A1D24",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2F3A",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#E6E7EB",
  },
  newButton: {
    backgroundColor: "#1E5BFF",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  newButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#1A1D24",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2F3A",
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: {
    borderBottomColor: "#1E5BFF",
  },
  tabText: {
    fontSize: 14,
    color: "#A9AFBC",
  },
  activeTabText: {
    color: "#1E5BFF",
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0B0C10",
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  cardContainer: {
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  typeContainer: {
    backgroundColor: "#2A2F3A",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  typeText: {
    fontSize: 12,
    color: "#A9AFBC",
    fontWeight: "500",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#E6E7EB",
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 13,
    color: "#A9AFBC",
    width: 80,
  },
  infoValue: {
    fontSize: 13,
    color: "#E6E7EB",
    flex: 1,
  },
  myStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#2A2F3A",
  },
  myStatusLabel: {
    fontSize: 13,
    color: "#A9AFBC",
    marginRight: 8,
  },
  myStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  myStatusText: {
    fontSize: 12,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#A9AFBC",
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
