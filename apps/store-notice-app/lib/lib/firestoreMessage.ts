// lib/firestoreMessage.ts
// ✅ Multi-tenant: Query messages filtered by companyId

import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import {
  buildTarget,
  isMessageVisibleToUser,
  MessageDoc,
  TargetType,
  UserDoc,
} from "./noticeTargets";

export async function createMessage(params: {
  title: string;
  body: string;
  createdBy: string;
  companyId: string; // ✅ Multi-tenant: REQUIRED
  targetType: TargetType;
  storeIds?: string[];
  deptCodes?: string[];
}) {
  const target = buildTarget({
    targetType: params.targetType,
    storeIds: params.storeIds,
    deptCodes: params.deptCodes,
  });

  const payload = {
    title: params.title,
    body: params.body,
    createdBy: params.createdBy,
    companyId: params.companyId, // ✅ Multi-tenant
    createdAt: serverTimestamp(),

    // Target fields
    targetType: target.targetType,
    targetStoreIds: target.targetStoreIds,
    targetDeptCodes: target.targetDeptCodes,
  };

  return await addDoc(collection(db, "messages"), payload);
}

export async function fetchMessagesAndFilter(params: {
  user: UserDoc;
  max?: number;
}) {
  const max = params.max ?? 200;

  // ✅ Multi-tenant: Filter by companyId
  const q = query(
    collection(db, "messages"),
    where("companyId", "==", params.user.companyId),
    orderBy("createdAt", "desc"),
    limit(max)
  );

  const snap = await getDocs(q);

  const list: MessageDoc[] = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as any),
  }));

  // Client-side filter by target (ALL/STORE/HQ_DEPT)
  return list.filter((m) => isMessageVisibleToUser(m, params.user));
}
