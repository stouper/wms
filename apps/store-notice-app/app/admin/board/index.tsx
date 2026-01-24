// app/admin/board/index.tsx
// ✅ PostgreSQL 연동: 게시판 목록 (Firebase → PostgreSQL 마이그레이션 완료)

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Card from "../../../components/ui/Card";
import {
  getBoardPosts,
  deleteBoardPost,
  getEmployees,
  BoardPostInfo,
} from "../../../lib/authApi";

export default function BoardList() {
  const router = useRouter();
  const [posts, setPosts] = useState<BoardPostInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  // PENDING 사용자 수 로드
  const loadPendingCount = useCallback(async () => {
    try {
      const employees = await getEmployees("PENDING");
      setPendingCount(employees.length);
    } catch (error) {
      console.error("loadPendingCount error:", error);
    }
  }, []);

  useEffect(() => {
    loadPendingCount();
  }, [loadPendingCount]);

  // 게시글 목록 로드
  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getBoardPosts(50, 0);
      setPosts(result.rows);
    } catch (error) {
      console.error("Error fetching posts:", error);
      Alert.alert("오류", "게시글 목록을 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const handleDelete = async (postId: string) => {
    Alert.alert("삭제 확인", "이 게시글을 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          try {
            const result = await deleteBoardPost(postId);
            if (result.success) {
              Alert.alert("완료", "게시글이 삭제되었습니다.");
              loadPosts();
            } else {
              Alert.alert("오류", result.error || "게시글 삭제에 실패했습니다.");
            }
          } catch (error) {
            console.error("Delete error:", error);
            Alert.alert("오류", "게시글 삭제에 실패했습니다.");
          }
        },
      },
    ]);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>게시판</Text>
          <Pressable
            onPress={() => router.push("/admin/board/new")}
            style={styles.newButton}
          >
            <Text style={styles.newButtonText}>+ 새 글 작성</Text>
          </Pressable>
        </View>

        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#1E5BFF" />
            <Text style={styles.muted}>게시글 불러오는 중...</Text>
          </View>
        )}

        {!loading && posts.length === 0 && (
          <Card>
            <Text style={styles.emptyText}>
              게시글이 없습니다. 첫 게시글을 작성해보세요!
            </Text>
          </Card>
        )}

        {!loading &&
          posts.map((post) => (
            <Card key={post.id}>
              <Pressable
                onPress={() => router.push(`/admin/board/${post.id}`)}
                style={styles.postItem}
              >
                <View style={styles.postHeader}>
                  <Text style={styles.postTitle} numberOfLines={2}>
                    {post.title}
                  </Text>
                  <View style={styles.attachmentBadges}>
                    {post.images && post.images.length > 0 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                          📷 {post.images.length}
                        </Text>
                      </View>
                    )}
                    {post.files && post.files.length > 0 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                          📎 {post.files.length}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text style={styles.postContent} numberOfLines={2}>
                  {post.content}
                </Text>
                <View style={styles.postMeta}>
                  <Text style={styles.postAuthor}>{post.authorName}</Text>
                  <Text style={styles.postDate}>{formatDate(post.createdAt)}</Text>
                </View>
              </Pressable>
              <View style={styles.postActions}>
                <Pressable
                  onPress={() => router.push(`/admin/board/${post.id}`)}
                  style={styles.viewButton}
                >
                  <Text style={styles.viewButtonText}>상세보기</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleDelete(post.id)}
                  style={styles.deleteButton}
                >
                  <Text style={styles.deleteButtonText}>삭제</Text>
                </Pressable>
              </View>
            </Card>
          ))}
      </ScrollView>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B0C10" },
  container: { paddingHorizontal: 16, paddingTop: 8, gap: 12, paddingBottom: 100 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    color: "#E6E7EB",
    fontSize: 24,
    fontWeight: "900",
  },
  newButton: {
    backgroundColor: "#1E5BFF",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  newButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  loadingBox: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 40,
  },
  muted: { color: "#A9AFBC", fontSize: 14 },
  emptyText: {
    color: "#A9AFBC",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 20,
  },
  postItem: {
    gap: 8,
  },
  postHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  postTitle: {
    flex: 1,
    color: "#E6E7EB",
    fontSize: 18,
    fontWeight: "700",
  },
  attachmentBadges: {
    flexDirection: "row",
    gap: 4,
  },
  badge: {
    backgroundColor: "#1E5BFF",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  postContent: {
    color: "#A9AFBC",
    fontSize: 14,
    lineHeight: 20,
  },
  postMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  postAuthor: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "600",
  },
  postDate: {
    color: "#64748b",
    fontSize: 12,
  },
  postActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#2A2F3A",
  },
  viewButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#1E5BFF",
    alignItems: "center",
  },
  viewButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  deleteButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#EF4444",
    alignItems: "center",
  },
  deleteButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
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
