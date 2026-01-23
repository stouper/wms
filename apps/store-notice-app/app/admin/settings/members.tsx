// app/admin/settings/members.tsx
// 회사 회원 관리 (삭제, 수정 기능)

import React, { useEffect, useState } from "react";
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
  onSnapshot,
} from "firebase/firestore";
import { auth, db } from "../../../firebaseConfig";
import Card from "../../../components/ui/Card";
import { approveEmployee, rejectEmployee, getEmployees } from "../../../lib/authApi";

interface Member {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  department?: string;
  storeId?: string;
  status: string;
}

export default function MembersManagement() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  // 확장된 회원 ID 추적
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);

  // 수정 모달
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editDepartment, setEditDepartment] = useState("");
  const [saving, setSaving] = useState(false);

  // 내 companyId 가져오기 + pendingCount
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    let unsubPending: (() => void) | undefined;

    const unsub = onSnapshot(doc(db, "users", uid), (snap) => {
      if (snap.exists()) {
        const companyId = (snap.data() as any)?.companyId;
        setMyCompanyId(companyId || null);

        if (companyId) {
          const pendingQuery = query(
            collection(db, "users"),
            where("companyId", "==", companyId),
            where("status", "==", "PENDING")
          );
          unsubPending = onSnapshot(pendingQuery, (snapshot) => {
            setPendingCount(snapshot.size);
          });
        }
      }
    });

    return () => {
      unsub();
      unsubPending?.();
    };
  }, []);

  // 회원 목록 가져오기
  useEffect(() => {
    if (!myCompanyId) return;
    loadMembers();
  }, [myCompanyId]);

  const loadMembers = async () => {
    if (!myCompanyId) return;

    setLoading(true);
    try {
      const q = query(
        collection(db, "users"),
        where("companyId", "==", myCompanyId)
      );
      const snapshot = await getDocs(q);
      const memberList: Member[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        memberList.push({
          id: doc.id,
          name: data.name || data.email?.split('@')[0] || "이름 없음",
          email: data.email || "",
          phone: data.phone || "",
          role: data.role || "",
          department: data.department || "",
          storeId: data.storeId || "",
          status: data.status || "ACTIVE",
        });
      });

      // OWNER를 최상단에 정렬
      memberList.sort((a, b) => {
        if (a.role === "OWNER") return -1;
        if (b.role === "OWNER") return 1;
        return 0;
      });

      setMembers(memberList);
    } catch (error) {
      console.error("회원 목록 로드 실패:", error);
      Alert.alert("오류", "회원 목록을 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 회원 확장/축소 토글
  const toggleMemberExpand = (memberId: string) => {
    setExpandedMemberId(expandedMemberId === memberId ? null : memberId);
  };

  // 승인
  const handleApprove = (member: Member) => {
    Alert.alert(
      "승인 확인",
      `"${member.name}" 회원을 승인하시겠습니까?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "승인",
          onPress: async () => {
            try {
              // 1. Firestore 업데이트
              await updateDoc(doc(db, "users", member.id), {
                status: "ACTIVE",
              });

              // 2. core-api Employee 업데이트 (firebaseUid = member.id)
              const employees = await getEmployees("PENDING");
              const employee = employees.find((e) => e.firebaseUid === member.id);
              if (employee) {
                await approveEmployee(employee.id);
              }

              Alert.alert("완료", "회원이 승인되었습니다.");
              loadMembers();
            } catch (error) {
              console.error("승인 실패:", error);
              Alert.alert("오류", "회원 승인에 실패했습니다.");
            }
          },
        },
      ]
    );
  };

  // 거부
  const handleReject = (member: Member) => {
    Alert.alert(
      "거부 확인",
      `"${member.name}" 회원의 가입을 거부하시겠습니까?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "거부",
          style: "destructive",
          onPress: async () => {
            try {
              // 1. Firestore 업데이트
              await updateDoc(doc(db, "users", member.id), {
                status: "REJECTED",
              });

              // 2. core-api Employee 업데이트
              const employees = await getEmployees("PENDING");
              const employee = employees.find((e) => e.firebaseUid === member.id);
              if (employee) {
                await rejectEmployee(employee.id);
              }

              Alert.alert("완료", "회원 가입이 거부되었습니다.");
              loadMembers();
            } catch (error) {
              console.error("거부 실패:", error);
              Alert.alert("오류", "회원 거부에 실패했습니다.");
            }
          },
        },
      ]
    );
  };

  // 삭제
  const handleDelete = (member: Member) => {
    // OWNER는 삭제 불가
    if (member.role === "OWNER") {
      Alert.alert("알림", "대표 계정은 삭제할 수 없습니다.");
      return;
    }

    Alert.alert(
      "삭제 확인",
      `"${member.name}" 회원을 삭제하시겠습니까?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "users", member.id));
              Alert.alert("완료", "회원이 삭제되었습니다.");
              loadMembers();
            } catch (error) {
              console.error("삭제 실패:", error);
              Alert.alert("오류", "회원 삭제에 실패했습니다.");
            }
          },
        },
      ]
    );
  };

  // 수정 모달 열기
  const openEditModal = (member: Member) => {
    // OWNER는 수정 불가
    if (member.role === "OWNER") {
      Alert.alert("알림", "대표 계정은 수정할 수 없습니다.");
      return;
    }

    setEditingMember(member);
    setEditName(member.name);
    setEditPhone(member.phone || "");
    setEditDepartment(member.department || "");
    setEditModalOpen(true);
  };

  // 수정 저장
  const handleSave = async () => {
    if (!editingMember) return;

    try {
      setSaving(true);
      await updateDoc(doc(db, "users", editingMember.id), {
        name: editName.trim(),
        phone: editPhone.trim() || null,
        department: editDepartment.trim() || null,
      });
      Alert.alert("완료", "회원 정보가 수정되었습니다.");
      setEditModalOpen(false);
      loadMembers();
    } catch (error) {
      console.error("수정 실패:", error);
      Alert.alert("오류", "회원 정보 수정에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      OWNER: "admin",
      EXEC: "임원",
      MANAGER: "관리자",
      SALES: "영업",
      STORE: "매장",
      ETC: "기타",
    };
    return labels[role] || role;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      ACTIVE: "활성",
      PENDING: "대기",
      INACTIVE: "비활성",
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    if (status === "ACTIVE") return "#10B981";
    if (status === "PENDING") return "#F59E0B";
    return "#64748b";
  };

  if (!myCompanyId) {
    return (
      <View style={styles.root}>
        <View style={styles.center}>
          <ActivityIndicator color="#1E5BFF" />
          <Text style={styles.muted}>회사 정보를 불러오는 중...</Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>회원 관리</Text>

        {loading && (
          <View style={styles.center}>
            <ActivityIndicator color="#1E5BFF" />
            <Text style={styles.muted}>회원 목록 불러오는 중...</Text>
          </View>
        )}

        {!loading && members.length === 0 && (
          <Card>
            <Text style={styles.emptyText}>등록된 회원이 없습니다.</Text>
          </Card>
        )}

        {!loading &&
          members.map((member) => {
            const isExpanded = expandedMemberId === member.id;
            const isOwner = member.role === "OWNER";

            return (
              <Card key={member.id}>
                <Pressable onPress={() => toggleMemberExpand(member.id)}>
                  <View style={styles.memberRow}>
                    <View style={styles.memberInfo}>
                      <View style={styles.memberHeader}>
                        <Text style={styles.memberName}>{member.name}</Text>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: getStatusColor(member.status) },
                          ]}
                        >
                          <Text style={styles.statusText}>
                            {getStatusLabel(member.status)}
                          </Text>
                        </View>
                        {isOwner && (
                          <View style={styles.ownerBadge}>
                            <Text style={styles.ownerText}>admin</Text>
                          </View>
                        )}
                      </View>

                      {/* 확장된 경우 상세 정보 표시 */}
                      {isExpanded && (
                        <View style={styles.detailsContainer}>
                          <Text style={styles.memberDetail}>
                            이메일: {member.email}
                          </Text>
                          <Text style={styles.memberDetail}>
                            역할: {getRoleLabel(member.role)}
                          </Text>
                          {member.department && (
                            <Text style={styles.memberDetail}>
                              부서: {member.department}
                            </Text>
                          )}
                          {member.phone && (
                            <Text style={styles.memberDetail}>
                              전화: {member.phone}
                            </Text>
                          )}

                          {/* PENDING 회원: 승인/거부 버튼 */}
                          {member.status === "PENDING" && (
                            <View style={styles.actionsInDetail}>
                              <Pressable
                                onPress={() => handleApprove(member)}
                                style={[styles.actionBtn, styles.approveBtn]}
                              >
                                <Text style={styles.actionBtnText}>승인</Text>
                              </Pressable>
                              <Pressable
                                onPress={() => handleReject(member)}
                                style={[styles.actionBtn, styles.rejectBtn]}
                              >
                                <Text style={styles.actionBtnText}>거부</Text>
                              </Pressable>
                            </View>
                          )}

                          {/* OWNER가 아니고 PENDING이 아닌 경우만 수정/삭제 버튼 표시 */}
                          {!isOwner && member.status !== "PENDING" && (
                            <View style={styles.actionsInDetail}>
                              <Pressable
                                onPress={() => openEditModal(member)}
                                style={[styles.actionBtn, styles.editBtn]}
                              >
                                <Text style={styles.actionBtnText}>수정</Text>
                              </Pressable>
                              <Pressable
                                onPress={() => handleDelete(member)}
                                style={[styles.actionBtn, styles.deleteBtn]}
                              >
                                <Text style={styles.actionBtnText}>삭제</Text>
                              </Pressable>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                </Pressable>
              </Card>
            );
          })}
      </ScrollView>

      {/* 수정 모달 */}
      <Modal
        visible={editModalOpen}
        animationType="slide"
        onRequestClose={() => setEditModalOpen(false)}
      >
        <SafeAreaView style={styles.modalRoot} edges={["top", "bottom"]}>
          <Text style={styles.modalTitle}>회원 정보 수정</Text>

          <Text style={styles.label}>이름</Text>
          <TextInput
            value={editName}
            onChangeText={setEditName}
            placeholder="이름"
            placeholderTextColor="#64748b"
            style={styles.input}
          />

          <Text style={styles.label}>전화번호</Text>
          <TextInput
            value={editPhone}
            onChangeText={setEditPhone}
            placeholder="010-1234-5678"
            placeholderTextColor="#64748b"
            style={styles.input}
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>부서</Text>
          <TextInput
            value={editDepartment}
            onChangeText={setEditDepartment}
            placeholder="부서명"
            placeholderTextColor="#64748b"
            style={styles.input}
          />

          <View style={{ height: 20 }} />

          <View style={styles.modalActions}>
            <Pressable
              onPress={() => setEditModalOpen(false)}
              style={[styles.modalBtn, styles.cancelBtn]}
              disabled={saving}
            >
              <Text style={styles.modalBtnText}>취소</Text>
            </Pressable>

            <Pressable
              onPress={handleSave}
              style={[styles.modalBtn, styles.saveBtn]}
              disabled={saving}
            >
              <Text style={styles.modalBtnText}>
                {saving ? "저장 중..." : "저장"}
              </Text>
            </Pressable>
          </View>
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
            <View style={styles.navIconContainer}>
              <Text style={[styles.navIcon, styles.navActive]}>⚙️</Text>
              {pendingCount > 0 && (
                <View style={styles.navBadge}>
                  <Text style={styles.navBadgeText}>{pendingCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.navText, styles.navActive]}>설정</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B0C10" },
  container: { paddingHorizontal: 16, paddingTop: 8, gap: 12, paddingBottom: 100 },
  center: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 40,
  },
  muted: { color: "#A9AFBC", fontSize: 14 },
  title: {
    color: "#E6E7EB",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 8,
  },
  emptyText: {
    color: "#A9AFBC",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 20,
  },

  memberRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  memberInfo: {
    flex: 1,
  },
  memberHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 0,
  },
  memberName: {
    color: "#E6E7EB",
    fontSize: 16,
    fontWeight: "700",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  ownerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#1E5BFF",
  },
  ownerText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  detailsContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#2A2F3A",
  },
  memberDetail: {
    color: "#A9AFBC",
    fontSize: 13,
    marginBottom: 4,
  },
  actions: {
    flexDirection: "row",
    gap: 4,
  },
  actionsInDetail: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  editBtn: {
    backgroundColor: "#1E5BFF",
  },
  deleteBtn: {
    backgroundColor: "#EF4444",
  },
  approveBtn: {
    backgroundColor: "#10B981",
  },
  rejectBtn: {
    backgroundColor: "#F59E0B",
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },

  modalRoot: {
    flex: 1,
    padding: 16,
    paddingTop: 24,
    backgroundColor: "#0B0C10",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 20,
    color: "#E6E7EB",
  },
  label: {
    color: "#A9AFBC",
    fontSize: 13,
    marginBottom: 8,
    marginTop: 12,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: "#2A2F3A",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#1A1D24",
    color: "#E6E7EB",
    fontSize: 14,
  },
  modalActions: { flexDirection: "row", gap: 12 },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  cancelBtn: { backgroundColor: "#374151" },
  saveBtn: { backgroundColor: "#10b981" },
  modalBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

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
  navActive: {
    opacity: 1,
    color: "#1E5BFF",
  },
});
