// app/admin/approvals/[id].tsx
// 결재 문서 상세 및 승인/반려 페이지

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../../../firebaseConfig";
import { Card } from "../../../components/ui/Card";
import {
  Approval,
  Approver,
  APPROVAL_TYPE_LABELS,
  APPROVAL_STATUS_LABELS,
  APPROVAL_STATUS_COLORS,
} from "../../../lib/approvalTypes";

export default function ApprovalDetailPage() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [approval, setApproval] = useState<Approval | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // 승인/반려 모달
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalAction, setApprovalAction] = useState<"APPROVED" | "REJECTED">(
    "APPROVED"
  );
  const [comment, setComment] = useState("");

  const uid = auth.currentUser?.uid;

  useEffect(() => {
    loadApproval();
  }, [id]);

  const loadApproval = async () => {
    if (!id) return;

    setLoading(true);
    try {
      const docRef = doc(db, "approvals", id);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        setApproval({ id: docSnap.id, ...docSnap.data() } as Approval);
      } else {
        Alert.alert("오류", "결재 문서를 찾을 수 없습니다.");
        router.back();
      }
    } catch (error) {
      console.error("결재 문서 로드 실패:", error);
      Alert.alert("오류", "결재 문서를 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = () => {
    setApprovalAction("APPROVED");
    setShowApprovalModal(true);
  };

  const handleReject = () => {
    setApprovalAction("REJECTED");
    setShowApprovalModal(true);
  };

  const submitApproval = async () => {
    if (!approval || !uid) return;

    const myApprover = approval.approvers.find((a) => a.userId === uid);
    if (!myApprover) {
      Alert.alert("오류", "승인 권한이 없습니다.");
      return;
    }

    if (myApprover.order !== approval.currentStep) {
      Alert.alert("오류", "현재 승인 순서가 아닙니다.");
      return;
    }

    setProcessing(true);
    try {
      const docRef = doc(db, "approvals", approval.id);

      // 승인자 목록 업데이트
      const updatedApprovers = approval.approvers.map((approver) => {
        if (approver.userId === uid) {
          return {
            ...approver,
            status: approvalAction,
            comment: comment.trim() || null,
            approvedAt: new Date(),
          };
        }
        return approver;
      });

      // 전체 문서 상태 결정
      let newStatus = approval.status;
      let newCurrentStep = approval.currentStep;

      if (approvalAction === "REJECTED") {
        // 반려 시 전체 문서 반려
        newStatus = "REJECTED";
      } else if (approvalAction === "APPROVED") {
        // 승인 시
        if (approval.currentStep >= approval.approvers.length) {
          // 마지막 승인자가 승인 -> 문서 승인 완료
          newStatus = "APPROVED";
        } else {
          // 다음 승인자로 이동
          newCurrentStep = approval.currentStep + 1;
        }
      }

      await updateDoc(docRef, {
        approvers: updatedApprovers,
        status: newStatus,
        currentStep: newCurrentStep,
        updatedAt: serverTimestamp(),
      });

      setShowApprovalModal(false);
      setComment("");

      Alert.alert(
        "완료",
        approvalAction === "APPROVED" ? "승인되었습니다." : "반려되었습니다.",
        [
          {
            text: "확인",
            onPress: () => {
              router.back();
            },
          },
        ]
      );
    } catch (error) {
      console.error("결재 처리 실패:", error);
      Alert.alert("오류", "결재 처리 중 오류가 발생했습니다.");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!approval) {
    return (
      <View style={styles.loadingContainer}>
        <Text>결재 문서를 찾을 수 없습니다.</Text>
      </View>
    );
  }

  const myApprover = approval.approvers.find((a) => a.userId === uid);
  const isMyTurn =
    myApprover &&
    myApprover.order === approval.currentStep &&
    myApprover.status === "PENDING" &&
    approval.status === "PENDING";

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* 문서 기본 정보 */}
        <Card style={styles.section}>
          <View style={styles.headerRow}>
            <View style={styles.typeContainer}>
              <Text style={styles.typeText}>
                {APPROVAL_TYPE_LABELS[approval.type]}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: APPROVAL_STATUS_COLORS[approval.status] },
              ]}
            >
              <Text style={styles.statusText}>
                {APPROVAL_STATUS_LABELS[approval.status]}
              </Text>
            </View>
          </View>

          <Text style={styles.title}>{approval.title}</Text>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>기안자</Text>
            <Text style={styles.infoValue}>
              {approval.authorName} ({approval.department})
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>작성일</Text>
            <Text style={styles.infoValue}>
              {approval.createdAt?.toDate?.()?.toLocaleString?.() || "-"}
            </Text>
          </View>

          <View style={styles.divider} />

          <Text style={styles.contentLabel}>내용</Text>
          <Text style={styles.contentText}>{approval.content}</Text>
        </Card>

        {/* 결재선 */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>결재선</Text>

          {approval.approvers.map((approver, index) => (
            <View key={index} style={styles.approverRow}>
              <View style={styles.approverOrder}>
                <Text style={styles.approverOrderText}>{approver.order}</Text>
              </View>

              <View style={styles.approverInfo}>
                <Text style={styles.approverName}>{approver.name}</Text>
                {approver.department && (
                  <Text style={styles.approverDept}>({approver.department})</Text>
                )}
              </View>

              <View
                style={[
                  styles.approverStatusBadge,
                  {
                    backgroundColor:
                      approver.status === "APPROVED"
                        ? "#10B981"
                        : approver.status === "REJECTED"
                        ? "#EF4444"
                        : "#F59E0B",
                  },
                ]}
              >
                <Text style={styles.approverStatusText}>
                  {approver.status === "APPROVED"
                    ? "승인"
                    : approver.status === "REJECTED"
                    ? "반려"
                    : "대기"}
                </Text>
              </View>

              {approver.approvedAt && (
                <Text style={styles.approverDate}>
                  {approver.approvedAt.toDate?.()?.toLocaleDateString?.() || ""}
                </Text>
              )}

              {approver.comment && (
                <View style={styles.commentContainer}>
                  <Text style={styles.commentLabel}>의견:</Text>
                  <Text style={styles.commentText}>{approver.comment}</Text>
                </View>
              )}
            </View>
          ))}
        </Card>

        {/* 첨부파일 (현재는 없음) */}
        {approval.attachments && approval.attachments.length > 0 && (
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>첨부파일</Text>
            {approval.attachments.map((file, index) => (
              <View key={index} style={styles.fileRow}>
                <Text style={styles.fileName}>{file.name}</Text>
                <Text style={styles.fileSize}>
                  {(file.size / 1024).toFixed(1)} KB
                </Text>
              </View>
            ))}
          </Card>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* 승인/반려 버튼 (본인 차례일 때만) */}
      {isMyTurn && (
        <View style={styles.actionButtonContainer}>
          <TouchableOpacity
            style={[styles.actionButton, styles.rejectButton]}
            onPress={handleReject}
          >
            <Text style={styles.actionButtonText}>반려</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.approveButton]}
            onPress={handleApprove}
          >
            <Text style={styles.actionButtonText}>승인</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 승인/반려 모달 */}
      <Modal
        visible={showApprovalModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowApprovalModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {approvalAction === "APPROVED" ? "승인" : "반려"}
            </Text>

            <Text style={styles.modalLabel}>의견 (선택사항)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="의견을 입력하세요"
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => {
                  setShowApprovalModal(false);
                  setComment("");
                }}
              >
                <Text style={styles.modalCancelButtonText}>취소</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalButton,
                  approvalAction === "APPROVED"
                    ? styles.modalApproveButton
                    : styles.modalRejectButton,
                ]}
                onPress={submitApproval}
                disabled={processing}
              >
                {processing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmButtonText}>
                    {approvalAction === "APPROVED" ? "승인" : "반려"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  section: {
    margin: 16,
    marginBottom: 0,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  typeContainer: {
    backgroundColor: "#F0F0F0",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  typeText: {
    fontSize: 13,
    color: "#666666",
    fontWeight: "500",
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#000000",
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E5E5",
    marginVertical: 12,
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: "#666666",
    width: 70,
  },
  infoValue: {
    fontSize: 14,
    color: "#000000",
    flex: 1,
  },
  contentLabel: {
    fontSize: 14,
    color: "#666666",
    marginBottom: 8,
  },
  contentText: {
    fontSize: 15,
    color: "#000000",
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#000000",
    marginBottom: 16,
  },
  approverRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    flexWrap: "wrap",
  },
  approverOrder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  approverOrderText: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  approverInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  approverName: {
    fontSize: 15,
    color: "#000000",
    fontWeight: "500",
    marginRight: 4,
  },
  approverDept: {
    fontSize: 13,
    color: "#666666",
  },
  approverStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  approverStatusText: {
    fontSize: 12,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  approverDate: {
    fontSize: 12,
    color: "#999999",
    marginLeft: 8,
  },
  commentContainer: {
    width: "100%",
    marginTop: 8,
    marginLeft: 44,
    backgroundColor: "#F9F9F9",
    padding: 10,
    borderRadius: 4,
  },
  commentLabel: {
    fontSize: 12,
    color: "#666666",
    marginBottom: 4,
  },
  commentText: {
    fontSize: 13,
    color: "#000000",
  },
  fileRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  fileName: {
    fontSize: 14,
    color: "#000000",
    flex: 1,
  },
  fileSize: {
    fontSize: 12,
    color: "#999999",
  },
  actionButtonContainer: {
    flexDirection: "row",
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E5E5",
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  approveButton: {
    backgroundColor: "#10B981",
    marginLeft: 8,
  },
  rejectButton: {
    backgroundColor: "#EF4444",
    marginRight: 8,
  },
  actionButtonText: {
    fontSize: 16,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    width: "85%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#000000",
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 14,
    color: "#666666",
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#E5E5E5",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#000000",
    minHeight: 100,
    marginBottom: 16,
  },
  modalButtonRow: {
    flexDirection: "row",
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelButton: {
    backgroundColor: "#F0F0F0",
    marginRight: 8,
  },
  modalApproveButton: {
    backgroundColor: "#10B981",
    marginLeft: 8,
  },
  modalRejectButton: {
    backgroundColor: "#EF4444",
    marginLeft: 8,
  },
  modalCancelButtonText: {
    fontSize: 15,
    color: "#666666",
    fontWeight: "600",
  },
  modalConfirmButtonText: {
    fontSize: 15,
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
