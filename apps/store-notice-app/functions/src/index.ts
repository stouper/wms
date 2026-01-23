// functions/src/index.ts
import * as admin from "firebase-admin";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { MemoryOption } from "firebase-functions/v2/options";

admin.initializeApp();
const db = admin.firestore();

// ✅ Multi-tenant migration (one-time use)
export { migrateToMultiTenant } from "./migrate";

/** ===== 성능 옵션 (minInstances 제거, 비용 최소화) ===== */
const PERF_HTTP = {
  region: "us-central1",
  memory: "512MiB" as MemoryOption,
  cpu: 1 as const,
  timeoutSeconds: 30,
  concurrency: 80,
};
const PERF_BG = {
  region: "us-central1",
  memory: "512MiB" as MemoryOption,
  cpu: 1 as const,
  timeoutSeconds: 60,
  // 트리거는 concurrency 옵션 사용 불가
};

/** ===== 유틸 ===== */
const chunk = <T,>(arr: T[], size = 90) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  );

async function sendExpoPush(tokens: string[], payload: any) {
  let success = 0,
    fail = 0;

  for (const batch of chunk(tokens, 90)) {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch.map((t) => ({ to: t, ...payload }))),
    });

    const json: any = await res.json().catch(() => null);
    const receipts = Array.isArray(json?.data) ? json.data : [];
    for (const r of receipts) r?.status === "ok" ? success++ : fail++;
  }

  return { success, fail };
}

async function assertAdmin(uid?: string | null) {
  if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const s = await db.doc(`users/${uid}`).get();
  const data = s.exists ? (s.data() as any) : null;

  // ✅ Multi-tenant: Check role hierarchy + ACTIVE status
  if (!data ||
      !["OWNER", "MANAGER"].includes(data?.role) ||
      data?.status !== "ACTIVE") {
    throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
  }
}

type TargetType = "ALL" | "STORE" | "HQ_DEPT";

function normTargetType(v: any): TargetType {
  if (v === "STORE" || v === "HQ_DEPT") return v;
  return "ALL";
}

function normStringArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
}

/**
 * ✅ 타겟 정규화(하위호환 포함)
 * - targetType 없고 targetStoreIds만 있으면 STORE로 간주
 * - 아무것도 없으면 ALL
 */
function normalizeTargets(data: any): {
  targetType: TargetType;
  targetStoreIds: string[] | null;
  targetDeptCodes: string[] | null;
} {
  const inputTargetType = data?.targetType;
  const storeIds = normStringArray(data?.targetStoreIds);
  const deptCodes = normStringArray(data?.targetDeptCodes);

  // 하위호환: 예전 데이터( targetType 없음, targetStoreIds만 존재 )
  if (!inputTargetType && storeIds.length > 0) {
    return { targetType: "STORE", targetStoreIds: storeIds, targetDeptCodes: null };
  }

  const targetType = normTargetType(inputTargetType);

  if (targetType === "STORE") {
    return {
      targetType,
      targetStoreIds: storeIds.length ? storeIds : null,
      targetDeptCodes: null,
    };
  }

  if (targetType === "HQ_DEPT") {
    return {
      targetType,
      targetStoreIds: null,
      targetDeptCodes: deptCodes.length ? deptCodes : null,
    };
  }

  // ALL
  return { targetType: "ALL", targetStoreIds: null, targetDeptCodes: null };
}

/** =========================================================
 * ✅ NEW: 회사 생성 + 생성자를 OWNER로 설정
 * ======================================================= */
export const createCompany = onCall(PERF_HTTP, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

  const { companyName } = req.data || {};
  if (!companyName || typeof companyName !== "string" || companyName.trim().length < 2) {
    throw new HttpsError("invalid-argument", "회사명은 2자 이상이어야 합니다.");
  }

  // Firebase Auth에서 이메일 가져오기
  const userAuth = await admin.auth().getUser(uid);
  const email = userAuth.email;
  const displayName = userAuth.displayName;

  // 이미 회사에 소속되어 있는지 확인
  const userDoc = await db.doc(`users/${uid}`).get();
  if (userDoc.exists && (userDoc.data() as any)?.companyId) {
    throw new HttpsError("already-exists", "이미 회사에 소속되어 있습니다.");
  }

  // 8자리 초대 코드 생성 (대문자 영숫자)
  const generateCode = () => Math.random().toString(36).substring(2, 10).toUpperCase();
  let inviteCode = generateCode();

  // 중복 확인 (최대 10회 재시도)
  let attempts = 0;
  while (attempts < 10) {
    const existing = await db.collection("companies")
      .where("inviteCode", "==", inviteCode)
      .limit(1)
      .get();
    if (existing.empty) break;
    inviteCode = generateCode();
    attempts++;
  }

  // 회사 생성
  const companyRef = await db.collection("companies").add({
    name: companyName.trim(),
    inviteCode,
    createdBy: uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 사용자를 OWNER + ACTIVE로 설정
  await db.doc(`users/${uid}`).set({
    email: email || null,
    name: displayName || null,
    companyId: companyRef.id,
    role: "OWNER",
    status: "ACTIVE",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    ok: true,
    companyId: companyRef.id,
    inviteCode,
  };
});

/** =========================================================
 * ✅ NEW: 초대 코드로 회사 가입
 * ======================================================= */
export const joinWithInvite = onCall(PERF_HTTP, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

  const { inviteCode, role, name, phone, requestedDepartment } = req.data || {};

  // Firebase Auth에서 이메일 가져오기
  const userAuth = await admin.auth().getUser(uid);
  const email = userAuth.email;

  if (!inviteCode || typeof inviteCode !== "string") {
    throw new HttpsError("invalid-argument", "초대 코드가 필요합니다.");
  }

  // 역할 검증 (OWNER는 불가, MANAGER/SALES만 가능)
  const validRoles = ["MANAGER", "SALES"];
  const userRole = validRoles.includes(role) ? role : "SALES";

  // 이미 회사에 소속되어 있는지 확인
  const userDoc = await db.doc(`users/${uid}`).get();
  if (userDoc.exists && (userDoc.data() as any)?.companyId) {
    throw new HttpsError("already-exists", "이미 회사에 소속되어 있습니다.");
  }

  // 초대 코드로 회사 찾기
  const companySnap = await db.collection("companies")
    .where("inviteCode", "==", inviteCode.trim().toUpperCase())
    .limit(1)
    .get();

  if (companySnap.empty) {
    throw new HttpsError("not-found", "유효하지 않은 초대 코드입니다.");
  }

  const companyDoc = companySnap.docs[0];
  const companyId = companyDoc.id;

  // 사용자를 PENDING 상태로 설정
  await db.doc(`users/${uid}`).set({
    email: email || null,
    companyId,
    role: userRole,
    status: "PENDING",
    name: name && typeof name === "string" ? name.trim() : null,
    phone: phone && typeof phone === "string" ? phone.trim() : null,
    requestedDepartment: requestedDepartment && typeof requestedDepartment === "string" ? requestedDepartment.trim() : null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    ok: true,
    companyId,
    companyName: (companyDoc.data() as any)?.name,
    status: "PENDING",
  };
});

/** =========================================================
 * ✅ NEW: 관리자가 사용자 승인
 * ======================================================= */
export const approveUser = onCall(PERF_HTTP, async (req) => {
  await assertAdmin(req.auth?.uid);

  const { userId, role, status, storeId, department } = req.data || {};

  if (!userId) {
    throw new HttpsError("invalid-argument", "userId가 필요합니다.");
  }

  // 관리자의 회사 ID 가져오기
  const adminDoc = await db.doc(`users/${req.auth!.uid}`).get();
  const adminCompanyId = (adminDoc.data() as any)?.companyId;
  if (!adminCompanyId) {
    throw new HttpsError("failed-precondition", "회사 정보가 없습니다.");
  }

  // 대상 사용자 조회
  const userDoc = await db.doc(`users/${userId}`).get();
  if (!userDoc.exists) {
    throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
  }

  const userData = userDoc.data() as any;

  // 보안: 같은 회사 사용자만 수정 가능
  if (userData.companyId !== adminCompanyId) {
    throw new HttpsError("permission-denied", "다른 회사의 사용자는 수정할 수 없습니다.");
  }

  // 업데이트 데이터 구성
  const updateData: any = {
    approvedBy: req.auth!.uid,
    approvedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (status && ["ACTIVE", "REJECTED", "DISABLED"].includes(status)) {
    updateData.status = status;
  }

  const validRoles = ["OWNER", "MANAGER", "SALES"];
  if (role && validRoles.includes(role)) {
    updateData.role = role;
  }

  if (storeId !== undefined) {
    updateData.storeId = storeId || null;
  }

  if (department !== undefined) {
    updateData.department = department || null;
  }

  await db.doc(`users/${userId}`).update(updateData);

  return { ok: true };
});

/** =========================================================
 * ✅ 1) 즉시 응답용: dispatchNoticeFast (Callable)
 *    - 이제 targetType/targetDeptCodes/targetStoreIds 저장함
 * ======================================================= */
export const dispatchNoticeFast = onCall(PERF_HTTP, async (req) => {
  await assertAdmin(req.auth?.uid);

  const { title, body } = req.data || {};
  if (!title || !body) {
    throw new HttpsError("invalid-argument", "title/body가 필요합니다.");
  }

  // ✅ Multi-tenant: 관리자의 companyId 가져오기
  const adminDoc = await db.doc(`users/${req.auth!.uid}`).get();
  const companyId = (adminDoc.data() as any)?.companyId;
  if (!companyId) {
    throw new HttpsError("failed-precondition", "회사 정보가 없습니다.");
  }

  const { targetType, targetStoreIds, targetDeptCodes } = normalizeTargets(req.data || {});

  const msgRef = await db.collection("messages").add({
    title,
    body,
    companyId,  // ✅ Multi-tenant: 회사 ID 첨부

    // ✅ 타겟 저장 (핵심)
    targetType, // "ALL" | "STORE" | "HQ_DEPT"
    targetStoreIds, // string[] | null
    targetDeptCodes, // string[] | null

    createdBy: req.auth!.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),

    // 트리거가 처리하도록 상태 플래그
    dispatchedAt: null,
    dispatchStatus: "queued",
  });

  return { ok: true, messageId: msgRef.id };
});

/** =========================================================
 * ✅ 2) 백그라운드 트리거: messages/{id} 생성 시 receipts/푸시 처리
 *    - ALL / STORE / HQ_DEPT 타겟 지원
 * ======================================================= */
export const onMessageCreated = onDocumentCreated(
  { ...PERF_BG, document: "messages/{messageId}" },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const docRef = snap.ref;
    const data = snap.data() as any;

    // 중복 처리 방지
    if (data?.dispatchedAt) return;

    const messageId = docRef.id;
    const title = data?.title ?? "새 공지";
    const body = data?.body ?? "";

    // ✅ Multi-tenant: companyId 가져오기
    const companyId = data?.companyId;
    if (!companyId) {
      console.error("Message missing companyId:", messageId);
      return;
    }

    const { targetType, targetStoreIds, targetDeptCodes } = normalizeTargets(data || {});

    // ✅ Multi-tenant: 대상 유저 조회 (companyId + status=ACTIVE 필터)
    // - STORE: companyId 일치 + status=ACTIVE + storeId in [...]
    // - ALL: companyId 일치 + status=ACTIVE 전체
    // - HQ_DEPT: companyId 일치 + status=ACTIVE + department in [...]
    let userDocs: admin.firestore.QueryDocumentSnapshot[] = [];

    if (targetType === "STORE" && Array.isArray(targetStoreIds) && targetStoreIds.length) {
      // Firestore 'in'은 최대 10개
      const parts = chunk<string>(targetStoreIds, 10);
      const results = await Promise.all(
        parts.map((ids) =>
          db
            .collection("users")
            .where("companyId", "==", companyId)  // ✅ Multi-tenant
            .where("status", "==", "ACTIVE")       // ✅ 상태 체크
            .where("storeId", "in", ids)
            .get()
        )
      );
      userDocs = results.flatMap((r) => r.docs);
    } else if (targetType === "HQ_DEPT" && Array.isArray(targetDeptCodes) && targetDeptCodes.length) {
      // department 필드로 필터링 (역할 무관, ACTIVE만)
      const parts = chunk<string>(targetDeptCodes, 10);
      const results = await Promise.all(
        parts.map(async (codes) => {
          const q = await db
            .collection("users")
            .where("companyId", "==", companyId)  // ✅ Multi-tenant
            .where("status", "==", "ACTIVE")       // ✅ 상태 체크
            .where("department", "in", codes)
            .get();
          return q.docs;
        })
      );
      userDocs = results.flatMap((arr) => arr);
    } else {
      // ALL: 해당 회사의 모든 ACTIVE 사용자
      const q = await db
        .collection("users")
        .where("companyId", "==", companyId)     // ✅ Multi-tenant
        .where("status", "==", "ACTIVE")          // ✅ 상태 체크
        .get();
      userDocs = q.docs;
    }

    // 중복 제거
    const uniqMap = new Map<string, admin.firestore.QueryDocumentSnapshot>();
    for (const d of userDocs) uniqMap.set(d.id, d);
    userDocs = Array.from(uniqMap.values());

    // ✅ receipts 생성 + 토큰 수집
    // 대량이면 batch 500 제한이 있으니 450개씩 쪼개자.
    const tokens: string[] = [];

    const allWrites: Array<{
      ref: admin.firestore.DocumentReference;
      data: any;
    }> = [];

    for (const d of userDocs) {
      const u = d.data() as any;
      const userId = d.id;

      const receiptId = `${messageId}_${userId}`;
      const ref = db.collection("receipts").doc(receiptId);

      allWrites.push({
        ref,
        data: {
          messageId,
          userId,
          companyId,  // ✅ Multi-tenant
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expoPushTokenAtSend: u?.expoPushToken ?? null,
          pushPlatformAtSend: u?.pushPlatform ?? null,
          pushStatus: u?.expoPushToken ? "queued" : "skipped",
        },
      });

      if (u?.expoPushToken) tokens.push(u.expoPushToken);
    }

    for (const group of chunk(allWrites, 450)) {
      const batch = db.batch();
      for (const w of group) {
        batch.set(w.ref, w.data, { merge: true });
      }
      await batch.commit();
    }

    // ✅ 푸시 발송
    const { success, fail } = await sendExpoPush(tokens, {
      title,
      body,
      sound: "default",
      priority: "high",
      data: { messageId },
    });

    // ✅ 로그 + 상태 업데이트
    await Promise.all([
      db.collection("pushLogs").add({
        messageId,
        companyId,  // ✅ Multi-tenant
        targetType,
        targetStoreIds: targetStoreIds ?? null,
        targetDeptCodes: targetDeptCodes ?? null,
        totalUsers: userDocs.length,
        tokenCount: tokens.length,
        success,
        fail,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
      docRef.update({
        targetType,
        targetStoreIds: targetStoreIds ?? null,
        targetDeptCodes: targetDeptCodes ?? null,
        dispatchStatus: "done",
        dispatchedAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
    ]);
  }
);

/** =========================================================
 * (선택) 미확인자 재알림: remindUnread (HTTP)
 * ======================================================= */
const REMIND_SECRET = process.env.REMIND_SECRET || "";
export const remindUnread = onRequest(PERF_HTTP, async (req, res) => {
  try {
    if (REMIND_SECRET && req.query.key !== REMIND_SECRET) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }

    const since = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 6 * 60 * 60 * 1000)
    );

    const rs = await db
      .collection("receipts")
      .where("read", "==", false)
      .where("createdAt", ">", since)
      .get();

    const byMessage: Record<string, string[]> = {};
    for (const r of rs.docs) {
      const { messageId, userId } = r.data() as any;
      const u = await db.doc(`users/${userId}`).get();
      const token = u.exists ? (u.data() as any)?.expoPushToken : null;
      if (!token) continue;
      (byMessage[messageId] ??= []).push(token);
    }

    for (const [mid, tokens] of Object.entries(byMessage)) {
      const ms = await db.doc(`messages/${mid}`).get();
      const m = ms.exists ? (ms.data() as any) : {};
      await sendExpoPush(tokens, {
        title: "미확인 공지 알림",
        body: `[재알림] ${m?.title ?? "새 공지"}`,
        sound: "default",
        priority: "high",
        data: { messageId: mid, remind: true },
      });
    }

    res.json({
      ok: true,
      checked: rs.size,
      groups: Object.keys(byMessage).length,
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ ok: false, error: e?.message ?? "internal error" });
  }
});

/** =========================================================
 * ✅ 3) 공지 삭제: deleteNotice (Callable)
 * ======================================================= */
export const deleteNotice = onCall(PERF_HTTP, async (req) => {
  await assertAdmin(req.auth?.uid);
  const { messageId } = req.data || {};
  if (!messageId) throw new HttpsError("invalid-argument", "messageId가 필요합니다.");

  // ✅ Multi-tenant: 같은 회사인지 확인
  const adminDoc = await db.doc(`users/${req.auth!.uid}`).get();
  const adminCompanyId = (adminDoc.data() as any)?.companyId;

  const msgDoc = await db.doc(`messages/${messageId}`).get();
  if (!msgDoc.exists) {
    throw new HttpsError("not-found", "공지를 찾을 수 없습니다.");
  }

  if ((msgDoc.data() as any)?.companyId !== adminCompanyId) {
    throw new HttpsError("permission-denied", "다른 회사의 공지는 삭제할 수 없습니다.");
  }

  // Receipts 삭제
  let deletedReceipts = 0;
  while (true) {
    const qs = await db
      .collection("receipts")
      .where("messageId", "==", messageId)
      .limit(300)
      .get();
    if (qs.empty) break;

    const batch = db.batch();
    qs.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deletedReceipts += qs.size;
  }

  await db.collection("messages").doc(messageId).delete();
  return { ok: true, deletedReceipts };
});

/** =========================================================
 * ✅ 결재 시스템: 새 결재 문서 생성 시 첫 번째 승인자에게 알림
 * ======================================================= */
export const onApprovalCreated = onDocumentCreated(
  { ...PERF_BG, document: "approvals/{approvalId}" },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data() as any;
    const approvalId = snap.ref.id;

    // 첫 번째 승인자 찾기
    const approvers = data?.approvers ?? [];
    if (!Array.isArray(approvers) || approvers.length === 0) return;

    const firstApprover = approvers.find((a: any) => a.order === 1);
    if (!firstApprover) return;

    // 승인자 정보 가져오기
    const approverDoc = await db.doc(`users/${firstApprover.userId}`).get();
    if (!approverDoc.exists) return;

    const approverData = approverDoc.data() as any;
    const token = approverData?.expoPushToken;
    if (!token) return;

    // 푸시 알림 발송
    const approvalTypeLabels: Record<string, string> = {
      VACATION: "휴가 신청서",
      EXPENSE: "지출 결의서",
      REPORT: "업무 보고서",
      GENERAL: "범용 서류",
    };

    const typeLabel = approvalTypeLabels[data?.type] || "결재 문서";

    await sendExpoPush([token], {
      title: "새 결재 요청",
      body: `${data?.authorName}님의 ${typeLabel} - ${data?.title}`,
      sound: "default",
      priority: "high",
      data: {
        type: "approval",
        approvalId,
        action: "new"
      },
    });

    console.log(`Approval ${approvalId}: Push sent to first approver ${firstApprover.userId}`);
  }
);

/** =========================================================
 * ✅ 결재 시스템: 승인/반려 시 알림
 * ======================================================= */
export const onApprovalUpdated = onDocumentUpdated(
  { ...PERF_BG, document: "approvals/{approvalId}" },
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (!before || !after) return;

    const beforeData = before.data() as any;
    const afterData = after.data() as any;
    const approvalId = after.ref.id;

    // 상태 변경 확인
    const statusChanged = beforeData?.status !== afterData?.status;
    const stepChanged = beforeData?.currentStep !== afterData?.currentStep;

    if (!statusChanged && !stepChanged) return;

    const approvalTypeLabels: Record<string, string> = {
      VACATION: "휴가 신청서",
      EXPENSE: "지출 결의서",
      REPORT: "업무 보고서",
      GENERAL: "범용 서류",
    };

    const typeLabel = approvalTypeLabels[afterData?.type] || "결재 문서";
    const tokensToNotify: string[] = [];

    // 1. 승인 완료 또는 반려 → 기안자에게 알림
    if (statusChanged && (afterData?.status === "APPROVED" || afterData?.status === "REJECTED")) {
      const authorDoc = await db.doc(`users/${afterData?.authorId}`).get();
      if (authorDoc.exists) {
        const authorToken = (authorDoc.data() as any)?.expoPushToken;
        if (authorToken) {
          const statusText = afterData.status === "APPROVED" ? "승인되었습니다" : "반려되었습니다";
          await sendExpoPush([authorToken], {
            title: "결재 처리 완료",
            body: `${typeLabel} - ${afterData?.title}이(가) ${statusText}`,
            sound: "default",
            priority: "high",
            data: {
              type: "approval",
              approvalId,
              action: afterData.status === "APPROVED" ? "approved" : "rejected"
            },
          });
          console.log(`Approval ${approvalId}: Status notification sent to author`);
        }
      }
    }

    // 2. 다음 승인자에게 알림 (승인 진행 중)
    if (stepChanged && afterData?.status === "PENDING") {
      const nextApprover = (afterData?.approvers ?? []).find((a: any) => a.order === afterData?.currentStep);
      if (nextApprover) {
        const nextApproverDoc = await db.doc(`users/${nextApprover.userId}`).get();
        if (nextApproverDoc.exists) {
          const nextToken = (nextApproverDoc.data() as any)?.expoPushToken;
          if (nextToken) {
            await sendExpoPush([nextToken], {
              title: "결재 요청",
              body: `${afterData?.authorName}님의 ${typeLabel} - ${afterData?.title}`,
              sound: "default",
              priority: "high",
              data: {
                type: "approval",
                approvalId,
                action: "pending"
              },
            });
            console.log(`Approval ${approvalId}: Push sent to next approver ${nextApprover.userId}`);
          }
        }
      }
    }
  }
);
