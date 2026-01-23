// app/staff/board/new.tsx
// 직원용 게시판 글 작성 페이지

import React, { useEffect, useState } from "react";
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { collection, addDoc, serverTimestamp, doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../../firebaseConfig";
import Card from "../../../components/ui/Card";
import { uploadFile } from "../../../lib/uploadFile";

interface AttachedFile {
  name: string;
  uri: string;
  type: string;
  size: number;
}

export default function StaffBoardNew() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null);
  const [myName, setMyName] = useState<string>("");

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const unsub = onSnapshot(doc(db, "users", uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMyCompanyId(data?.companyId || null);
        setMyName(data?.name || "익명");
      }
    });

    return () => {
      unsub();
    };
  }, []);

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("권한 필요", "갤러리 접근 권한이 필요합니다.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets) {
      const uris = result.assets.map((asset) => asset.uri);
      setImages((prev) => [...prev, ...uris]);
    }
  };

  const pickFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: true,
      });

      if (!result.canceled && result.assets) {
        const selectedFiles: AttachedFile[] = result.assets.map((asset) => ({
          name: asset.name,
          uri: asset.uri,
          type: asset.mimeType || "application/octet-stream",
          size: asset.size || 0,
        }));
        setFiles((prev) => [...prev, ...selectedFiles]);
      }
    } catch (error) {
      console.error("File picker error:", error);
      Alert.alert("오류", "파일 선택에 실패했습니다.");
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert("확인", "제목과 내용을 입력해주세요.");
      return;
    }

    if (!myCompanyId) {
      Alert.alert("오류", "회사 정보를 불러오는 중입니다.");
      return;
    }

    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert("오류", "로그인 정보를 확인해주세요.");
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const uploadedImageUrls: string[] = [];
      const uploadedFiles: Array<{ name: string; url: string; type: string; size: number }> = [];

      if (images.length > 0) {
        for (let i = 0; i < images.length; i++) {
          const imageUri = images[i];
          const fileName = `${Date.now()}_${i}.jpg`;
          const result = await uploadFile(
            imageUri,
            `board/${myCompanyId}/images`,
            fileName,
            (progress) => {
              const totalProgress =
                ((i + progress / 100) / (images.length + files.length)) * 100;
              setUploadProgress(Math.round(totalProgress));
            }
          );
          uploadedImageUrls.push(result.url);
        }
      }

      if (files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const fileName = `${Date.now()}_${file.name}`;
          const result = await uploadFile(
            file.uri,
            `board/${myCompanyId}/files`,
            fileName,
            (progress) => {
              const totalProgress =
                ((images.length + i + progress / 100) / (images.length + files.length)) * 100;
              setUploadProgress(Math.round(totalProgress));
            }
          );
          uploadedFiles.push({
            name: file.name,
            url: result.url,
            type: file.type,
            size: file.size,
          });
        }
      }

      await addDoc(collection(db, "boardPosts"), {
        title: title.trim(),
        content: content.trim(),
        authorId: uid,
        authorName: myName,
        companyId: myCompanyId,
        images: uploadedImageUrls,
        files: uploadedFiles,
        createdAt: serverTimestamp(),
      });

      Alert.alert("완료", "게시글이 작성되었습니다.", [
        {
          text: "확인",
          onPress: () => router.push("/staff/board"),
        },
      ]);
    } catch (error) {
      console.error("Save error:", error);
      Alert.alert("오류", "게시글 저장에 실패했습니다.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.push("/staff/board")}>
          <Text style={styles.backButton}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>새 게시글 작성</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.label}>제목</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="제목을 입력하세요"
          placeholderTextColor="#A9AFBC"
          style={styles.input}
          editable={!uploading}
        />

        <Text style={styles.label}>내용</Text>
        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder="내용을 입력하세요"
          placeholderTextColor="#A9AFBC"
          multiline
          style={[styles.input, styles.textarea]}
          editable={!uploading}
        />

        <Card>
          <View style={styles.attachmentHeader}>
            <Text style={styles.attachmentTitle}>이미지 첨부</Text>
            <Pressable
              onPress={pickImages}
              style={styles.addButton}
              disabled={uploading}
            >
              <Text style={styles.addButtonText}>+ 이미지 선택</Text>
            </Pressable>
          </View>

          {images.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.imageGrid}>
                {images.map((uri, index) => (
                  <View key={index} style={styles.imageContainer}>
                    <Image source={{ uri }} style={styles.imagePreview} />
                    <Pressable
                      onPress={() => removeImage(index)}
                      style={styles.removeButton}
                      disabled={uploading}
                    >
                      <Text style={styles.removeButtonText}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}

          {images.length === 0 && (
            <Text style={styles.emptyText}>첨부된 이미지가 없습니다.</Text>
          )}
        </Card>

        <Card>
          <View style={styles.attachmentHeader}>
            <Text style={styles.attachmentTitle}>파일 첨부</Text>
            <Pressable
              onPress={pickFiles}
              style={styles.addButton}
              disabled={uploading}
            >
              <Text style={styles.addButtonText}>+ 파일 선택</Text>
            </Pressable>
          </View>

          {files.length > 0 && (
            <View style={styles.fileList}>
              {files.map((file, index) => (
                <View key={index} style={styles.fileItem}>
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      📎 {file.name}
                    </Text>
                    <Text style={styles.fileSize}>{formatFileSize(file.size)}</Text>
                  </View>
                  <Pressable
                    onPress={() => removeFile(index)}
                    style={styles.removeFileButton}
                    disabled={uploading}
                  >
                    <Text style={styles.removeButtonText}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {files.length === 0 && (
            <Text style={styles.emptyText}>첨부된 파일이 없습니다.</Text>
          )}
        </Card>

        {uploading && (
          <Card>
            <View style={styles.uploadingBox}>
              <ActivityIndicator color="#1E5BFF" />
              <Text style={styles.uploadingText}>
                업로드 중... {uploadProgress}%
              </Text>
              <View style={styles.progressBar}>
                <View
                  style={[styles.progressFill, { width: `${uploadProgress}%` }]}
                />
              </View>
            </View>
          </Card>
        )}

        <Pressable
          onPress={handleSave}
          style={[styles.saveButton, uploading && styles.saveButtonDisabled]}
          disabled={uploading}
        >
          <Text style={styles.saveButtonText}>
            {uploading ? "저장 중..." : "게시글 작성"}
          </Text>
        </Pressable>
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
  label: {
    color: "#A9AFBC",
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "600",
  },
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
  textarea: { height: 200, textAlignVertical: "top" },
  attachmentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  attachmentTitle: {
    color: "#E6E7EB",
    fontSize: 16,
    fontWeight: "700",
  },
  addButton: {
    backgroundColor: "#1E5BFF",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  imageGrid: {
    flexDirection: "row",
    gap: 8,
  },
  imageContainer: {
    position: "relative",
  },
  imagePreview: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: "#1A1D24",
  },
  removeButton: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "#EF4444",
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  removeButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  emptyText: {
    color: "#A9AFBC",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 12,
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
  removeFileButton: {
    backgroundColor: "#EF4444",
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadingBox: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  uploadingText: {
    color: "#E6E7EB",
    fontSize: 14,
    fontWeight: "600",
  },
  progressBar: {
    width: "100%",
    height: 8,
    backgroundColor: "#1A1D24",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#1E5BFF",
  },
  saveButton: {
    backgroundColor: "#1E5BFF",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  saveButtonDisabled: {
    backgroundColor: "#64748b",
  },
  saveButtonText: {
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
