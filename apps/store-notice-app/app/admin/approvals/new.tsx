// app/admin/approvals/new.tsx
// 새 결재 문서 작성 (서류 타입별 입력 폼) - PostgreSQL 버전

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
  Modal,
  FlatList,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth } from "../../../firebaseConfig";
import Card from "../../../components/ui/Card";
import {
  ApprovalType,
  APPROVAL_TYPE_LABELS,
  VacationDetails,
  ExpenseDetails,
  ReportDetails,
  ApprovalAttachment,
} from "../../../lib/approvalTypes";
import {
  getEmployees,
  authenticateWithCoreApi,
  createApproval,
  ApproverInput,
  ApprovalAttachmentInput,
  EmployeeInfo,
} from "../../../lib/authApi";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { uploadFile } from "../../../lib/uploadFile";

interface UserOption {
  id: string;
  name: string;
  department: string;
  role: string;
}

interface LocalApprover {
  order: number;
  employeeId: string;
  name: string;
  department?: string;
}

export default function NewApproval() {
  const router = useRouter();

  // 사용자 정보
  const [myEmployee, setMyEmployee] = useState<EmployeeInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // 서류 정보
  const [type, setType] = useState<ApprovalType>("GENERAL");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  // 휴가 신청서
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [days, setDays] = useState("");

  // 지출 결의서
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [purpose, setPurpose] = useState("");

  // 업무 보고서
  const [project, setProject] = useState("");
  const [period, setPeriod] = useState("");

  // 첨부파일 (업무 보고서)
  const [attachments, setAttachments] = useState<ApprovalAttachment[]>([]);
  const [uploading, setUploading] = useState(false);

  // 승인자 목록
  const [approvers, setApprovers] = useState<LocalApprover[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");

  const [submitting, setSubmitting] = useState(false);

  // 내 정보 가져오기
  useEffect(() => {
    const loadMyInfo = async () => {
      try {
        const result = await authenticateWithCoreApi();
        if (result.success && result.employee) {
          setMyEmployee(result.employee);
        }
      } catch (error) {
        console.error("Error loading my info:", error);
      } finally {
        setLoading(false);
      }
    };

    loadMyInfo();
  }, []);

  // 회사 사용자 목록 가져오기
  useEffect(() => {
    const fetchUsers = async () => {
      setUsersLoading(true);
      try {
        const employees = await getEmployees("ACTIVE");
        const uid = auth.currentUser?.uid;

        const userList: UserOption[] = employees
          .filter((e) => e.firebaseUid !== uid) // 본인 제외
          .map((e) => ({
            id: e.id,
            name: e.name,
            department: e.departmentName || "",
            role: e.role,
          }));

        setUsers(userList);
      } catch (error) {
        console.error("Error fetching users:", error);
      } finally {
        setUsersLoading(false);
      }
    };

    fetchUsers();
  }, []);

  // 서류 타입 변경 시 필드 초기화
  useEffect(() => {
    setTitle("");
    setContent("");
    setStartDate("");
    setEndDate("");
    setDays("");
    setAmount("");
    setCategory("");
    setPurpose("");
    setProject("");
    setPeriod("");
    setAttachments([]);
  }, [type]);

  // 승인자 추가
  const addApprover = (user: UserOption) => {
    if (approvers.find((a) => a.employeeId === user.id)) {
      Alert.alert("알림", "이미 추가된 승인자입니다.");
      return;
    }

    const newApprover: LocalApprover = {
      order: approvers.length + 1,
      employeeId: user.id,
      name: user.name,
      department: user.department,
    };

    setApprovers([...approvers, newApprover]);
    setUserModalOpen(false);
    setUserSearch("");
  };

  // 승인자 삭제
  const removeApprover = (employeeId: string) => {
    const newApprovers = approvers
      .filter((a) => a.employeeId !== employeeId)
      .map((a, index) => ({ ...a, order: index + 1 }));
    setApprovers(newApprovers);
  };

  // 승인자 순서 변경
  const moveApprover = (fromIndex: number, direction: "up" | "down") => {
    if (direction === "up" && fromIndex === 0) return;
    if (direction === "down" && fromIndex === approvers.length - 1) return;

    const newApprovers = [...approvers];
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;

    [newApprovers[fromIndex], newApprovers[toIndex]] = [
      newApprovers[toIndex],
      newApprovers[fromIndex],
    ];

    newApprovers.forEach((a, index) => {
      a.order = index + 1;
    });

    setApprovers(newApprovers);
  };

  // 이미지 선택
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsMultipleSelection: false,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadAttachment(result.assets[0].uri, "image");
      }
    } catch (error) {
      console.error("이미지 선택 오류:", error);
      Alert.alert("오류", "이미지를 선택할 수 없습니다.");
    }
  };

  // 파일 선택
  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadAttachment(result.assets[0].uri, "file");
      }
    } catch (error) {
      console.error("파일 선택 오류:", error);
      Alert.alert("오류", "파일을 선택할 수 없습니다.");
    }
  };

  // 파일 업로드
  const uploadAttachment = async (uri: string, typeHint: "image" | "file") => {
    setUploading(true);
    try {
      const fileName = uri.split("/").pop() || `file_${Date.now()}`;
      const folder = `approvals/${typeHint}`;

      const result = await uploadFile(uri, folder, fileName);

      const attachment: ApprovalAttachment = {
        name: fileName,
        url: result.url,
        type: typeHint,
        size: result.fileSize,
      };

      setAttachments([...attachments, attachment]);
    } catch (error) {
      console.error("업로드 오류:", error);
      Alert.alert("오류", "파일 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  };

  // 첨부파일 삭제
  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  // 검색된 사용자 목록
  const filteredUsers = users.filter((user) => {
    const searchLower = userSearch.toLowerCase();
    return (
      user.name.toLowerCase().includes(searchLower) ||
      user.department.toLowerCase().includes(searchLower)
    );
  });

  // 제출 데이터 생성
  const buildDetails = () => {
    if (type === "VACATION") {
      if (!startDate || !endDate || !days) {
        throw new Error("휴가 정보를 모두 입력해주세요.");
      }
      const vacationDetails: VacationDetails = {
        startDate,
        endDate,
        days: parseFloat(days),
      };
      return vacationDetails;
    } else if (type === "EXPENSE") {
      if (!amount || !category || !purpose) {
        throw new Error("지출 정보를 모두 입력해주세요.");
      }
      const expenseDetails: ExpenseDetails = {
        amount: parseFloat(amount),
        category,
        purpose,
      };
      return expenseDetails;
    } else if (type === "REPORT") {
      if (!project || !period) {
        throw new Error("업무 보고서 정보를 모두 입력해주세요.");
      }
      const reportDetails: ReportDetails = {
        project,
        period,
      };
      return reportDetails;
    }
    return null;
  };

  // 제출
  const handleSubmit = async () => {
    try {
      if (!title.trim()) {
        Alert.alert("확인", "제목을 입력해주세요.");
        return;
      }

      if (!content.trim()) {
        Alert.alert("확인", "내용을 입력해주세요.");
        return;
      }

      if (approvers.length === 0) {
        Alert.alert("확인", "승인자를 1명 이상 선택해주세요.");
        return;
      }

      const uid = auth.currentUser?.uid;
      if (!uid) {
        Alert.alert("오류", "로그인 정보를 확인해주세요.");
        return;
      }

      // 서류별 상세 정보 생성
      const details = buildDetails();

      setSubmitting(true);

      // API 호출용 승인자 데이터 변환
      const approverInputs: ApproverInput[] = approvers.map((a) => ({
        order: a.order,
        employeeId: a.employeeId,
        name: a.name,
        department: a.department,
      }));

      // 첨부파일 데이터 변환
      const attachmentInputs: ApprovalAttachmentInput[] | undefined =
        type === "REPORT" && attachments.length > 0
          ? attachments.map((a) => ({
              name: a.name,
              url: a.url,
              type: a.type,
              size: a.size,
            }))
          : undefined;

      const result = await createApproval({
        type,
        title: title.trim(),
        content: content.trim(),
        details,
        approvers: approverInputs,
        attachments: attachmentInputs,
      });

      if (result.success) {
        Alert.alert("완료", "결재 문서가 제출되었습니다.", [
          {
            text: "확인",
            onPress: () => router.push("/admin/approvals"),
          },
        ]);
      } else {
        Alert.alert("오류", result.error || "문서 제출에 실패했습니다.");
      }
    } catch (error: any) {
      console.error("Submit error:", error);
      Alert.alert("오류", error.message || "문서 제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.root}>
        <View style={styles.center}>
          <ActivityIndicator color="#1E5BFF" />
          <Text style={styles.muted}>정보를 불러오는 중...</Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable
          onPress={() => router.push("/admin/approvals")}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>← 결재 목록</Text>
        </Pressable>

        <Text style={styles.title}>새 결재 문서</Text>

        {/* 서류 종류 선택 */}
        <Text style={styles.label}>서류 종류</Text>
        <View style={styles.typeRow}>
          {(Object.keys(APPROVAL_TYPE_LABELS) as ApprovalType[]).map((t) => (
            <Pressable
              key={t}
              onPress={() => setType(t)}
              style={[
                styles.typeButton,
                type === t ? styles.typeButtonActive : styles.typeButtonInactive,
              ]}
            >
              <Text
                style={[
                  styles.typeButtonText,
                  type === t && styles.typeButtonTextActive,
                ]}
              >
                {APPROVAL_TYPE_LABELS[t]}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* 제목 */}
        <Text style={styles.label}>제목</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="예) 2024년 3월 연차 휴가 신청"
          placeholderTextColor="#A9AFBC"
          style={styles.input}
          editable={!submitting}
        />

        {/* 서류별 상세 정보 입력 */}
        {type === "VACATION" && (
          <Card style={styles.detailsCard}>
            <Text style={styles.sectionTitle}>휴가 정보</Text>

            <Text style={styles.label}>시작일 (예: 2024-03-01)</Text>
            <TextInput
              value={startDate}
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#A9AFBC"
              style={styles.input}
              editable={!submitting}
            />

            <Text style={styles.label}>종료일 (예: 2024-03-03)</Text>
            <TextInput
              value={endDate}
              onChangeText={setEndDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#A9AFBC"
              style={styles.input}
              editable={!submitting}
            />

            <Text style={styles.label}>일수</Text>
            <TextInput
              value={days}
              onChangeText={setDays}
              placeholder="예) 3"
              placeholderTextColor="#A9AFBC"
              keyboardType="numeric"
              style={styles.input}
              editable={!submitting}
            />
          </Card>
        )}

        {type === "EXPENSE" && (
          <Card style={styles.detailsCard}>
            <Text style={styles.sectionTitle}>지출 정보</Text>

            <Text style={styles.label}>금액 (원)</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="예) 50000"
              placeholderTextColor="#A9AFBC"
              keyboardType="numeric"
              style={styles.input}
              editable={!submitting}
            />

            <Text style={styles.label}>항목</Text>
            <TextInput
              value={category}
              onChangeText={setCategory}
              placeholder="예) 교통비"
              placeholderTextColor="#A9AFBC"
              style={styles.input}
              editable={!submitting}
            />

            <Text style={styles.label}>용도</Text>
            <TextInput
              value={purpose}
              onChangeText={setPurpose}
              placeholder="예) 출장 교통비"
              placeholderTextColor="#A9AFBC"
              style={styles.input}
              editable={!submitting}
            />
          </Card>
        )}

        {type === "REPORT" && (
          <Card style={styles.detailsCard}>
            <Text style={styles.sectionTitle}>업무 보고서 정보</Text>

            <Text style={styles.label}>프로젝트</Text>
            <TextInput
              value={project}
              onChangeText={setProject}
              placeholder="예) 2024년 1분기 매출 분석"
              placeholderTextColor="#A9AFBC"
              style={styles.input}
              editable={!submitting}
            />

            <Text style={styles.label}>기간</Text>
            <TextInput
              value={period}
              onChangeText={setPeriod}
              placeholder="예) 2024-01 ~ 2024-03"
              placeholderTextColor="#A9AFBC"
              style={styles.input}
              editable={!submitting}
            />

            {/* 첨부파일 */}
            <Text style={styles.label}>첨부 파일</Text>
            <View style={styles.attachmentButtonRow}>
              <Pressable
                onPress={pickImage}
                style={styles.attachButton}
                disabled={uploading || submitting}
              >
                <Text style={styles.attachButtonText}>📷 이미지 추가</Text>
              </Pressable>
              <Pressable
                onPress={pickDocument}
                style={styles.attachButton}
                disabled={uploading || submitting}
              >
                <Text style={styles.attachButtonText}>📎 파일 추가</Text>
              </Pressable>
            </View>

            {uploading && (
              <View style={styles.uploadingRow}>
                <ActivityIndicator size="small" color="#1E5BFF" />
                <Text style={styles.uploadingText}>업로드 중...</Text>
              </View>
            )}

            {attachments.map((file, index) => (
              <View key={index} style={styles.attachmentItem}>
                <Text style={styles.attachmentName}>{file.name}</Text>
                <Pressable
                  onPress={() => removeAttachment(index)}
                  style={styles.attachmentRemove}
                >
                  <Text style={styles.attachmentRemoveText}>✕</Text>
                </Pressable>
              </View>
            ))}
          </Card>
        )}

        {/* 내용 */}
        <Text style={styles.label}>내용</Text>
        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder="결재 내용을 입력하세요"
          placeholderTextColor="#A9AFBC"
          multiline
          style={[styles.input, styles.textarea]}
          editable={!submitting}
        />

        {/* 승인자 선택 */}
        <Card>
          <View style={styles.approverHeader}>
            <Text style={styles.sectionTitle}>승인자</Text>
            <Pressable
              onPress={() => setUserModalOpen(true)}
              style={styles.addButton}
              disabled={submitting}
            >
              <Text style={styles.addButtonText}>+ 추가</Text>
            </Pressable>
          </View>

          {approvers.length === 0 && (
            <Text style={styles.emptyText}>승인자를 추가해주세요</Text>
          )}

          {approvers.map((approver, index) => (
            <View key={approver.employeeId} style={styles.approverItem}>
              <View style={styles.approverInfo}>
                <Text style={styles.approverOrder}>{approver.order}단계</Text>
                <View style={styles.approverDetails}>
                  <Text style={styles.approverName}>{approver.name}</Text>
                  {approver.department && (
                    <Text style={styles.approverDepartment}>
                      {approver.department}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.approverActions}>
                {index > 0 && (
                  <Pressable
                    onPress={() => moveApprover(index, "up")}
                    style={styles.moveButton}
                  >
                    <Text style={styles.moveButtonText}>↑</Text>
                  </Pressable>
                )}
                {index < approvers.length - 1 && (
                  <Pressable
                    onPress={() => moveApprover(index, "down")}
                    style={styles.moveButton}
                  >
                    <Text style={styles.moveButtonText}>↓</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => removeApprover(approver.employeeId)}
                  style={styles.removeButton}
                >
                  <Text style={styles.removeButtonText}>✕</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </Card>

        {/* 제출 버튼 */}
        <Pressable
          onPress={handleSubmit}
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          disabled={submitting}
        >
          <Text style={styles.submitButtonText}>
            {submitting ? "제출 중..." : "결재 요청"}
          </Text>
        </Pressable>
      </ScrollView>

      {/* 승인자 선택 모달 */}
      <Modal
        visible={userModalOpen}
        animationType="slide"
        onRequestClose={() => setUserModalOpen(false)}
      >
        <SafeAreaView style={styles.modalRoot} edges={["top", "bottom"]}>
          <Text style={styles.modalTitle}>승인자 선택</Text>

          <TextInput
            value={userSearch}
            onChangeText={setUserSearch}
            placeholder="이름 또는 부서로 검색"
            placeholderTextColor="#A9AFBC"
            autoFocus
            style={styles.modalInput}
          />

          {usersLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color="#1E5BFF" />
            </View>
          ) : (
            <FlatList
              data={filteredUsers}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 16 }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => addApprover(item)}
                  style={styles.userItem}
                >
                  <View>
                    <Text style={styles.userName}>{item.name}</Text>
                    <Text style={styles.userDepartment}>{item.department}</Text>
                  </View>
                  <Text style={styles.userRole}>{item.role}</Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={{ padding: 12 }}>
                  <Text style={{ color: "#A9AFBC" }}>검색 결과가 없습니다.</Text>
                </View>
              }
            />
          )}

          <Pressable
            onPress={() => setUserModalOpen(false)}
            style={styles.closeButton}
          >
            <Text style={styles.closeButtonText}>닫기</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>

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
            <Text style={styles.navIcon}>⚙️</Text>
            <Text style={styles.navText}>설정</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B0C10" },
  safe: { flex: 1, backgroundColor: "#0B0C10" },
  container: { padding: 16, paddingBottom: 100 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  muted: { color: "#A9AFBC", fontSize: 14 },

  backButton: { marginBottom: 12 },
  backButtonText: { color: "#1E5BFF", fontSize: 16, fontWeight: "600" },

  title: {
    color: "#E6E7EB",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 20,
  },

  label: {
    color: "#E6E7EB",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 6,
  },

  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  typeButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  typeButtonActive: {
    backgroundColor: "#1E5BFF",
    borderColor: "#1E5BFF",
  },
  typeButtonInactive: {
    backgroundColor: "#1A1D24",
    borderColor: "#2A2F3A",
  },
  typeButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#A9AFBC",
  },
  typeButtonTextActive: {
    color: "#FFFFFF",
  },

  input: {
    backgroundColor: "#1A1D24",
    color: "#E6E7EB",
    fontSize: 15,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2F3A",
  },
  textarea: {
    minHeight: 100,
    textAlignVertical: "top",
  },

  detailsCard: {
    marginBottom: 16,
  },

  sectionTitle: {
    color: "#E6E7EB",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 12,
  },

  attachmentButtonRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  attachButton: {
    flex: 1,
    backgroundColor: "#1E5BFF",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  attachButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },

  uploadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  uploadingText: {
    color: "#A9AFBC",
    fontSize: 13,
  },

  attachmentItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1A1D24",
    padding: 10,
    borderRadius: 6,
    marginBottom: 6,
  },
  attachmentName: {
    color: "#E6E7EB",
    fontSize: 13,
    flex: 1,
  },
  attachmentRemove: {
    padding: 4,
  },
  attachmentRemoveText: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "bold",
  },

  approverHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  addButton: {
    backgroundColor: "#1E5BFF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },

  emptyText: {
    color: "#A9AFBC",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 16,
  },

  approverItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2F3A",
  },
  approverInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  approverOrder: {
    color: "#1E5BFF",
    fontSize: 12,
    fontWeight: "bold",
    marginRight: 10,
    width: 40,
  },
  approverDetails: {
    flex: 1,
  },
  approverName: {
    color: "#E6E7EB",
    fontSize: 15,
    fontWeight: "600",
  },
  approverDepartment: {
    color: "#A9AFBC",
    fontSize: 12,
    marginTop: 2,
  },
  approverActions: {
    flexDirection: "row",
    gap: 6,
  },
  moveButton: {
    width: 32,
    height: 32,
    backgroundColor: "#2A2F3A",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  moveButtonText: {
    color: "#E6E7EB",
    fontSize: 16,
  },
  removeButton: {
    width: 32,
    height: 32,
    backgroundColor: "#EF4444",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  removeButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },

  submitButton: {
    backgroundColor: "#1E5BFF",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
  },
  submitButtonDisabled: {
    backgroundColor: "#2A2F3A",
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },

  modalRoot: {
    flex: 1,
    backgroundColor: "#0B0C10",
    padding: 16,
  },
  modalTitle: {
    color: "#E6E7EB",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: "#1A1D24",
    color: "#E6E7EB",
    fontSize: 15,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2F3A",
    marginBottom: 16,
  },

  userItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1A1D24",
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
  },
  userName: {
    color: "#E6E7EB",
    fontSize: 15,
    fontWeight: "600",
  },
  userDepartment: {
    color: "#A9AFBC",
    fontSize: 12,
    marginTop: 2,
  },
  userRole: {
    color: "#1E5BFF",
    fontSize: 13,
    fontWeight: "600",
  },

  closeButton: {
    backgroundColor: "#2A2F3A",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 12,
  },
  closeButtonText: {
    color: "#E6E7EB",
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
