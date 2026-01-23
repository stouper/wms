// lib/noticeTargets.ts
// ✅ Multi-tenant: Dynamic types, no hardcoded stores/departments

// ============================================================
// Multi-tenant Role & Status Types
// ============================================================

export type UserRole = "OWNER" | "MANAGER" | "SALES";
export type UserStatus = "PENDING" | "ACTIVE" | "REJECTED" | "DISABLED";

// ✅ Multi-tenant: Dynamic (no hardcoded values)
export type DeptCode = string;
export type StoreId = string;

// ============================================================
// Target Types
// ============================================================

export type TargetType = "ALL" | "STORE" | "HQ_DEPT";

export type MessageTarget = {
  targetType: TargetType;
  targetStoreIds: string[] | null;
  targetDeptCodes: string[] | null;
};

// ============================================================
// Document Types
// ============================================================

export type CompanyDoc = {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: any;
  createdBy: string;
};

export type UserDoc = {
  id: string; // uid
  companyId: string; // ✅ Multi-tenant: REQUIRED
  role: UserRole;
  status: UserStatus; // ✅ Multi-tenant: Replaces old 'active' boolean
  email?: string;
  name?: string;

  // ✅ Multi-tenant: Dynamic references (no hardcoded types)
  storeId?: string | null;
  department?: string | null;

  // Push notification fields
  expoPushToken?: string;
  pushPlatform?: string;

  // Audit fields
  createdAt?: any;
  approvedAt?: any;
  approvedBy?: string;

  // ⚠️ DEPRECATED (keep for backwards compatibility during migration)
  active?: boolean;
};

export type MessageDoc = {
  id: string;
  companyId: string; // ✅ Multi-tenant: REQUIRED
  title: string;
  body: string;
  createdAt: any;
  createdBy: string;
  updatedAt?: any;
  dispatchStatus?: string;
  dispatchedAt?: any;

  // Target fields (existing)
  targetType?: TargetType;
  targetStoreIds?: string[] | null;
  targetDeptCodes?: string[] | null;
};

export type ReceiptDoc = {
  id: string;
  messageId: string;
  userId: string;
  companyId: string; // ✅ Multi-tenant: REQUIRED
  read: boolean;
  readAt?: any;
  createdAt: any;
  expoPushTokenAtSend?: string;
  pushPlatformAtSend?: string;
  pushStatus?: string;
};

export type StoreDoc = {
  id: string;
  companyId: string; // ✅ Multi-tenant: REQUIRED
  name: string;
  code?: string;
  address?: string;
  createdAt?: any;
};

// ============================================================
// Helper Functions
// ============================================================

export function normalizeTarget(m: Partial<MessageDoc>): Required<MessageTarget> {
  const t: TargetType = (m.targetType ?? "ALL") as TargetType;

  const storeIds = (m.targetStoreIds ?? null) as string[] | null;
  const deptCodes = (m.targetDeptCodes ?? null) as string[] | null;

  if (t === "ALL") {
    return { targetType: "ALL", targetStoreIds: null, targetDeptCodes: null };
  }
  if (t === "STORE") {
    return { targetType: "STORE", targetStoreIds: storeIds ?? [], targetDeptCodes: null };
  }
  return { targetType: "HQ_DEPT", targetStoreIds: null, targetDeptCodes: deptCodes ?? [] };
}

export function buildTarget(input: {
  targetType: TargetType;
  storeIds?: string[];
  deptCodes?: string[];
}): Required<MessageTarget> {
  if (input.targetType === "ALL") {
    return { targetType: "ALL", targetStoreIds: null, targetDeptCodes: null };
  }
  if (input.targetType === "STORE") {
    const storeIds = (input.storeIds ?? []).filter(Boolean);
    return { targetType: "STORE", targetStoreIds: storeIds, targetDeptCodes: null };
  }
  const deptCodes = (input.deptCodes ?? []).filter(Boolean);
  return { targetType: "HQ_DEPT", targetStoreIds: null, targetDeptCodes: deptCodes };
}

export function isMessageVisibleToUser(message: MessageDoc, user: UserDoc): boolean {
  const t = normalizeTarget(message);

  // ✅ Multi-tenant: Must be same company
  if (message.companyId !== user.companyId) return false;

  // 전체 공지
  if (t.targetType === "ALL") return true;

  // 매장 타겟
  if (t.targetType === "STORE") {
    const myStore = (user.storeId ?? null) as string | null;
    if (!myStore) return false;
    return (t.targetStoreIds ?? []).includes(myStore);
  }

  // 본사 부서 타겟
  const myDept = (user.department ?? null) as string | null;
  if (!myDept) return false;
  return (t.targetDeptCodes ?? []).includes(myDept);
}

// ============================================================
// Role Helper Functions
// ============================================================

export function isAdmin(role?: UserRole): boolean {
  return role ? ["OWNER", "MANAGER"].includes(role) : false;
}

export function isActiveUser(status?: UserStatus): boolean {
  return status === "ACTIVE";
}
