// app/staff/board/[id].tsx
// 직원용 게시판 상세 페이지 - PostgreSQL 기반

import React, { useEffect, useState } from "react";
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth } from "../../../firebaseConfig";
import Card from "../../../components/ui/Card";
import { getBoardPost, deleteBoardPost, BoardPostDetailInfo, authenticateWithCoreApi } from "../../../lib/authApi";

export default function StaffBoardDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [post, setPost] = useState<BoardPostDetailInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    loadMyInfo();
  }, []);

  useEffect(() => {
    if (!id || typeof id !== "string") return;

    loadPost(id);
  }, [id]);

  const loadMyInfo = async () => {
    try {
      const result = await authenticateWithCoreApi();
      if (result.success && result.employee) {
        setMyEmployeeId(result.employee.id);
      }
    } catch (error) {
      console.error("Failed to load employee info:", error);
    }
  };

  const loadPost = async (postId: string) => {
    setLoading(true);
    try {
      const result = await getBoardPost(postId);
      if (!result) {
        Alert.alert("오류", "게시글을 찾을 수 없습니다.", [
          {
            text: "확인",
            onPress: () => router.push("/staff/board"),
          },
        ]);
        return;
      }

      setPost(result);
    } catch (error) {
      console.error("Error fetching post:", error);
      Alert.alert("오류", "게시글을 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!id || typeof id !== "string") return;

    if (post?.authorId !== myEmployeeId) {
      Alert.alert("권한 없음", "본인이 작성한 글만 삭제할 수 있습니다.");
      return;
    }

    Alert.alert("삭제 확인", "이 게시글을 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          try {
            const result = await deleteBoardPost(id);
            if (result.success) {
              Alert.alert("완료", "게시글이 삭제되었습니다.", [
                {
                  text: "확인",
                  onPress: () => router.push("/staff/board"),
                },
              ]);
            } else {
              Alert.alert("오류", result.error ?? "게시글 삭제에 실패했습니다.");
            }
          } catch (error) {
            console.error("Delete error:", error);
            Alert.alert("오류", "게시글 삭제에 실패했습니다.");
          }
        },
      },
    ]);
  };

  const openFile = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert("오류", "파일을 열 수 없습니다.");
      }
    } catch (error) {
      console.error("Error opening file:", error);
      Alert.alert("오류", "파일을 여는 중 문제가 발생했습니다.");
    }
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.push("/staff/board")}>
            <Text style={styles.backButton}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>게시글 상세</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#1E5BFF" size="large" />
          <Text style={styles.loadingText}>불러오는 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!post) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.push("/staff/board")}>
            <Text style={styles.backButton}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>게시글 상세</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>게시글을 찾을 수 없습니다.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isMyPost = post.authorId === myEmployeeId;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.push("/staff/board")}>
          <Text style={styles.backButton}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>게시글 상세</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {/* 게시글 정보 */}
        <Card>
          <Text style={styles.title}>{post.title}</Text>
          <View style={styles.meta}>
            <Text style={styles.author}>{post.authorName}</Text>
            <Text style={styles.date}>{formatDate(post.createdAt)}</Text>
          </View>
        </Card>

        {/* 게시글 내용 */}
        <Card>
          <Text style={styles.content}>{post.content}</Text>
        </Card>

        {/* 이미지 첨부 */}
        {post.images && post.images.length > 0 && (
          <Card>
            <Text style={styles.sectionTitle}>첨부 이미지</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.imageGrid}>
                {post.images.map((imageUrl, index) => (
                  <Pressable
                    key={index}
                    onPress={() => openFile(imageUrl)}
                  >
                    <Image
                      source={{ uri: imageUrl }}
                      style={styles.attachedImage}
                      resizeMode="cover"
                    />
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </Card>
        )}

        {/* 파일 첨부 */}
        {post.files && post.files.length > 0 && (
          <Card>
            <Text style={styles.sectionTitle}>첨부 파일</Text>
            <View style={styles.fileList}>
              {post.files.map((file, index) => (
                <Pressable
                  key={index}
                  onPress={() => openFile(file.url)}
                  style={styles.fileItem}
                >
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      📎 {file.name}
                    </Text>
                    <Text style={styles.fileSize}>
                      {formatFileSize(file.size)}
                    </Text>
                  </View>
                  <Text style={styles.downloadIcon}>⬇</Text>
                </Pressable>
              ))}
            </View>
          </Card>
        )}

        {/* 본인 글일 경우만 삭제 버튼 표시 */}
        {isMyPost && (
          <Pressable onPress={handleDelete} style={styles.deleteButton}>
            <Text style={styles.deleteButtonText}>게시글 삭제</Text>
          </Pressable>
        )}
      </ScrollView>

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
  container: { padding: 16, gap: 12, paddingBottom: 100 },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#A9AFBC",
    fontSize: 14,
  },
  errorText: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "600",
  },
  title: {
    color: "#E6E7EB",
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 12,
    lineHeight: 30,
  },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#2A2F3A",
  },
  author: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "600",
  },
  date: {
    color: "#64748b",
    fontSize: 13,
  },
  content: {
    color: "#E6E7EB",
    fontSize: 16,
    lineHeight: 24,
  },
  sectionTitle: {
    color: "#E6E7EB",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  imageGrid: {
    flexDirection: "row",
    gap: 12,
  },
  attachedImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    backgroundColor: "#1A1D24",
  },
  fileList: {
    gap: 8,
  },
  fileItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#13151B",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2F3A",
  },
  fileInfo: {
    flex: 1,
    gap: 4,
  },
  fileName: {
    color: "#E6E7EB",
    fontSize: 14,
    fontWeight: "600",
  },
  fileSize: {
    color: "#A9AFBC",
    fontSize: 12,
  },
  downloadIcon: {
    fontSize: 20,
    color: "#1E5BFF",
  },
  deleteButton: {
    backgroundColor: "#EF4444",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  deleteButtonText: {
    color: "#fff",
    fontSize: 16,
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
