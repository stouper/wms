// app/admin/board/[id].tsx
// ✅ PostgreSQL 연동: 게시판 상세 (Firebase → PostgreSQL 마이그레이션 완료)

import React, { useEffect, useState, useCallback } from "react";
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
import Card from "../../../components/ui/Card";
import {
  getBoardPost,
  deleteBoardPost,
  BoardPostInfo,
  FileAttachment,
} from "../../../lib/authApi";

export default function BoardDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [post, setPost] = useState<BoardPostInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPost = useCallback(async () => {
    if (!id || typeof id !== "string") return;

    setLoading(true);
    try {
      const data = await getBoardPost(id);
      if (data) {
        setPost(data);
      } else {
        Alert.alert("오류", "게시글을 찾을 수 없습니다.", [
          {
            text: "확인",
            onPress: () => router.push("/admin/board"),
          },
        ]);
      }
    } catch (error) {
      console.error("Error fetching post:", error);
      Alert.alert("오류", "게시글을 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    loadPost();
  }, [loadPost]);

  const handleDelete = async () => {
    if (!id || typeof id !== "string") return;

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
                  onPress: () => router.push("/admin/board"),
                },
              ]);
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

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
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
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>게시글을 찾을 수 없습니다.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable
          onPress={() => router.push("/admin/board")}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>← 게시판 목록</Text>
        </Pressable>

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
              {post.files.map((file: FileAttachment, index: number) => (
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

        {/* 삭제 버튼 */}
        <Pressable onPress={handleDelete} style={styles.deleteButton}>
          <Text style={styles.deleteButtonText}>게시글 삭제</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B0C10" },
  container: { padding: 16, gap: 12, paddingBottom: 40 },
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
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#1A1D24",
    marginBottom: 8,
  },
  backButtonText: {
    color: "#E6E7EB",
    fontSize: 14,
    fontWeight: "700",
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
});
