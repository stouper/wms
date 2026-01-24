// app/admin/notices/[id].tsx
// ✅ PostgreSQL 연동: 공지 상세 (Firebase → PostgreSQL 마이그레이션 완료)

import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Card from "../../../components/ui/Card";
import {
  getMessage,
  updateMessage,
  deleteMessage,
  getUnreadRecipients,
  MessageInfo,
  ReceiptInfo,
  MessageTargetType,
} from "../../../lib/authApi";

export default function AdminNoticeDetail() {
  const params = useLocalSearchParams();
  const messageId = useMemo(() => {
    const rawId = params.id;
    return typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : "";
  }, [params.id]);

  const router = useRouter();

  // --- States ---
  const [loading, setLoading] = useState(true);
  const [isDeleted, setIsDeleted] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  // 타겟 표시용 상태
  const [targetType, setTargetType] = useState<MessageTargetType>("ALL");
  const [targetStoreIds, setTargetStoreIds] = useState<string[] | null>(null);
  const [targetDeptCodes, setTargetDeptCodes] = useState<string[] | null>(null);

  const [reads, setReads] = useState<ReceiptInfo[]>([]);
  const [unreads, setUnreads] = useState<ReceiptInfo[]>([]);
  const [opLoading, setOpLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");

  const listData = useMemo(() => [...reads, ...unreads], [reads, unreads]);

  // 동적 매장/부서 레이블
  const targetSummary = useMemo(() => {
    const t: MessageTargetType =
      targetType === "STORE" || targetType === "HQ_DEPT" ? targetType : "ALL";

    if (t === "ALL") return "대상: 전체";

    if (t === "STORE") {
      const ids = targetStoreIds ?? [];
      if (ids.length === 0) return "대상: 매장(미지정)";
      const names = ids.join(", ");
      return `대상: 매장 · ${names}`;
    }

    // HQ_DEPT
    const codes = targetDeptCodes ?? [];
    if (codes.length === 0) return "대상: 본사부서(미지정)";
    const names = codes.join(", ");
    return `대상: 본사부서 · ${names}`;
  }, [targetType, targetStoreIds, targetDeptCodes]);

  // --- Data Loading ---
  useEffect(() => {
    if (!messageId) return;

    async function load() {
      try {
        setLoading(true);

        // 메시지 상세 조회 (receipts 포함)
        const msg = await getMessage(messageId);

        if (!msg) {
          setIsDeleted(true);
          Alert.alert("안내", "삭제된 공지입니다.", [
            { text: "확인", onPress: () => router.replace("/admin") },
          ]);
          return;
        }

        setTitle(msg.title);
        setBody(msg.body);
        setEditTitle(msg.title);
        setEditBody(msg.body);

        // 타겟 필드 로드
        setTargetType(msg.targetType ?? "ALL");
        setTargetStoreIds(msg.targetStoreIds ?? null);
        setTargetDeptCodes(msg.targetDeptCodes ?? null);

        // 읽음/미읽음 분류
        setReads(msg.reads || []);
        setUnreads(msg.unreads || []);
      } catch (e: any) {
        console.error("[AdminNoticeDetail] load error:", e);
        Alert.alert("오류", e?.message ?? "데이터를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [messageId, router]);

  // --- Handlers ---
  const toggleEdit = useCallback(() => {
    if (isEditing) {
      setEditTitle(title);
      setEditBody(body);
    }
    setIsEditing((prev) => !prev);
  }, [isEditing, title, body]);

  const handleSave = useCallback(async () => {
    if (!editTitle.trim() || !editBody.trim()) {
      Alert.alert("확인", "제목과 내용을 모두 입력해 주세요.");
      return;
    }
    try {
      setOpLoading(true);
      const result = await updateMessage(messageId, {
        title: editTitle.trim(),
        body: editBody.trim(),
      });

      if (result.success) {
        setTitle(editTitle.trim());
        setBody(editBody.trim());
        setIsEditing(false);
        Alert.alert("완료", "공지가 수정되었습니다.");
      } else {
        Alert.alert("오류", result.error || "수정 실패");
      }
    } catch (e: any) {
      Alert.alert("오류", e?.message ?? "수정 실패");
    } finally {
      setOpLoading(false);
    }
  }, [editTitle, editBody, messageId]);

  const handleDelete = useCallback(async () => {
    Alert.alert("삭제 확인", "이 공지와 모든 확인 기록을 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          try {
            setOpLoading(true);
            const result = await deleteMessage(messageId);
            if (result.success) {
              router.replace("/admin");
            } else {
              Alert.alert("오류", result.error || "삭제 실패");
            }
          } catch (e: any) {
            Alert.alert("오류", e?.message ?? "삭제 실패");
          } finally {
            setOpLoading(false);
          }
        },
      },
    ]);
  }, [messageId, router]);

  const resendToUnreads = useCallback(async () => {
    try {
      setOpLoading(true);

      // 미읽음 수신자 목록 조회
      const result = await getUnreadRecipients(messageId);
      if (!result.success || !result.recipients) {
        Alert.alert("오류", "미읽음 수신자 조회 실패");
        return;
      }

      // ACTIVE 상태이고 STAFF 역할인 경우만 (OWNER, MANAGER 제외)
      const targetTokens: string[] = result.recipients
        .filter((r) => r.pushToken && !["HQ_ADMIN", "HQ_WMS", "STORE_MANAGER"].includes(r.role || ""))
        .map((r) => r.pushToken!)
        .filter(Boolean);

      if (targetTokens.length === 0) {
        Alert.alert("안내", "재알림 대상이 없습니다.");
        return;
      }

      const CHUNK = 90;
      for (let i = 0; i < targetTokens.length; i += CHUNK) {
        const bundle = targetTokens.slice(i, i + CHUNK);
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            bundle.map((to) => ({
              to,
              title: `[미 수신자 재알림] ${title}`,
              body: body,
              data: { messageId },
              channelId: "alerts",
              sound: "default",
            }))
          ),
        });
      }
      Alert.alert("완료", `미확인자 ${targetTokens.length}명에게 재알림 완료`);
    } catch (e: any) {
      Alert.alert("오류", "재알림 실패");
    } finally {
      setOpLoading(false);
    }
  }, [messageId, title, body]);

  // --- Render Helpers ---
  const Header = useMemo(
    () => (
      <View style={styles.headerWrap}>
        <Card>
          {isEditing ? (
            <View>
              <Text style={styles.label}>제목</Text>
              <TextInput value={editTitle} onChangeText={setEditTitle} style={styles.editInput} />
              <Text style={[styles.label, { marginTop: 12 }]}>내용</Text>
              <TextInput
                value={editBody}
                onChangeText={setEditBody}
                multiline
                style={[styles.editInput, styles.editTextarea]}
              />
            </View>
          ) : (
            <View>
              <Text style={styles.title}>{title}</Text>

              {/* 대상 표시 */}
              <Text style={styles.targetText}>{targetSummary}</Text>

              <Text style={styles.body}>{body}</Text>
            </View>
          )}

          <View style={styles.badgeRow}>
            <View style={[styles.badge, styles.badgeRead]}>
              <Text style={styles.badgeText}>읽음 {reads.length}</Text>
            </View>
            <View style={[styles.badge, styles.badgeUnread]}>
              <Text style={styles.badgeText}>미확인 {unreads.length}</Text>
            </View>
          </View>

          <View style={styles.actionWrap}>
            {isEditing ? (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  onPress={toggleEdit}
                  disabled={opLoading}
                  style={[styles.cancelBtn, styles.halfBtn]}
                >
                  <Text style={styles.btnText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSave}
                  disabled={opLoading}
                  style={[styles.saveBtn, styles.halfBtn]}
                >
                  <Text style={styles.btnText}>{opLoading ? "중..." : "저장"}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    onPress={toggleEdit}
                    disabled={opLoading}
                    style={[styles.editBtn, styles.halfBtn]}
                  >
                    <Text style={styles.btnText}>수정</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleDelete}
                    disabled={opLoading}
                    style={[styles.dangerBtn, styles.halfBtn]}
                  >
                    <Text style={styles.btnText}>삭제</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={resendToUnreads}
                  disabled={opLoading}
                  style={[styles.successBtn, styles.fullBtn]}
                >
                  <Text style={styles.btnText}>미 수신자 재알림</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Card>

        <Text style={styles.sectionTitle}>수신 확인 현황</Text>
      </View>
    ),
    [
      isEditing,
      editTitle,
      editBody,
      title,
      body,
      reads.length,
      unreads.length,
      opLoading,
      router,
      toggleEdit,
      handleSave,
      handleDelete,
      resendToUnreads,
      targetSummary,
    ]
  );

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#1E5BFF" />
        <Text style={styles.muted}>공지 정보를 불러오는 중...</Text>
      </View>
    );
  }

  if (isDeleted) return null;

  return (
    <View style={styles.root}>
      <FlatList
        data={listData}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={Header}
        renderItem={({ item }) => {
          const isRead = !!item.readAt;
          return (
            <View style={[styles.rowItem, isRead ? styles.rowReadBg : styles.rowUnreadBg]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.employeeName || "알 수 없음"}</Text>
                <Text style={styles.rowSub}>
                  {item.storeName ? `매장: ${item.storeName}` : ""}
                  {item.departmentName ? `부서: ${item.departmentName}` : ""}
                  {!item.storeName && !item.departmentName ? "-" : ""}
                </Text>
              </View>
              <Text style={styles.rowTime}>
                {isRead
                  ? new Date(item.readAt!).toLocaleString("ko-KR", { hour12: false }).slice(0, -3)
                  : "미확인"}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ color: "#94a3b8" }}>확인 대상자가 없습니다.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B0C10" },
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  muted: { color: "#A9AFBC", fontSize: 14 },
  headerWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },

  title: { color: "#E6E7EB", fontSize: 18, fontWeight: "900" },
  targetText: { color: "#A9AFBC", marginTop: 8, fontWeight: "700", fontSize: 13 },
  body: { color: "#E6E7EB", marginTop: 10, lineHeight: 22 },

  label: { color: "#A9AFBC", fontSize: 13, fontWeight: "600", marginBottom: 5 },
  editInput: {
    backgroundColor: "#1A1D24",
    color: "#E6E7EB",
    borderWidth: 1,
    borderColor: "#2A2F3A",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  editTextarea: { minHeight: 120, textAlignVertical: "top" },

  badgeRow: { flexDirection: "row", marginTop: 16, gap: 8 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  badgeRead: { backgroundColor: "#334155" },
  badgeUnread: { backgroundColor: "#7f1d1d" },
  badgeText: { color: "#E6E7EB", fontWeight: "700", fontSize: 12 },

  actionWrap: { marginTop: 24, gap: 10 },
  actionRow: { flexDirection: "row", gap: 8 },
  halfBtn: {
    flex: 1,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  fullBtn: {
    width: "100%",
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  editBtn: { backgroundColor: "#1E5BFF" },
  saveBtn: { backgroundColor: "#16a34a" },
  cancelBtn: { backgroundColor: "#64748b" },
  dangerBtn: { backgroundColor: "#dc2626" },
  successBtn: { backgroundColor: "#0f766e" },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },

  sectionTitle: {
    color: "#E6E7EB",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 24,
    marginBottom: 10,
    paddingLeft: 4,
  },

  rowItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2025",
  },
  rowReadBg: { backgroundColor: "#0f172a" },
  rowUnreadBg: { backgroundColor: "#0B0C10" },
  rowName: { color: "#E6E7EB", fontWeight: "700", fontSize: 14 },
  rowSub: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
  rowTime: { color: "#64748b", fontSize: 11 },
  empty: { alignItems: "center", marginTop: 60 },
});
