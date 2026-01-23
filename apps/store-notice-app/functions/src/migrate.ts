// functions/src/migrate.ts
// ⚠️ ONE-TIME USE ONLY: Migrate existing data to multi-tenant schema

import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";

const db = admin.firestore();

export const migrateToMultiTenant = onRequest(async (req, res) => {
  // ⚠️ Security: Require secret key
  const SECRET_KEY = process.env.MIGRATE_SECRET || "CHANGE_ME_IN_ENV";
  if (req.query.key !== SECRET_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    // Step 1: Create default company
    const defaultCompanyRef = await db.collection("companies").add({
      name: "Default Company (Migration)",
      inviteCode: "MIGRATE01",
      createdBy: "SYSTEM",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const defaultCompanyId = defaultCompanyRef.id;

    // Step 2: Migrate users
    const usersSnap = await db.collection("users").get();
    let migratedUsers = 0;

    for (const doc of usersSnap.docs) {
      const data = doc.data();

      // Convert old role/active to new schema
      let role = "ETC";
      if (data.role === "admin") role = "OWNER";

      let status = "ACTIVE";
      if (data.active === false) status = "PENDING";

      await doc.ref.update({
        companyId: defaultCompanyId,
        role,
        status,
        department: data.deptCode || null, // Old field → new field
        // Keep old fields for backwards compat
        role_old: data.role,
        active_old: data.active,
      });

      migratedUsers++;
    }

    // Step 3: Migrate messages
    const messagesSnap = await db.collection("messages").get();
    let migratedMessages = 0;

    for (const doc of messagesSnap.docs) {
      await doc.ref.update({ companyId: defaultCompanyId });
      migratedMessages++;
    }

    // Step 4: Migrate receipts
    const receiptsSnap = await db.collection("receipts").get();
    let migratedReceipts = 0;

    for (const doc of receiptsSnap.docs) {
      await doc.ref.update({ companyId: defaultCompanyId });
      migratedReceipts++;
    }

    // Step 5: Migrate pushLogs (if any)
    const logsSnap = await db.collection("pushLogs").get();
    let migratedLogs = 0;

    for (const doc of logsSnap.docs) {
      await doc.ref.update({ companyId: defaultCompanyId });
      migratedLogs++;
    }

    res.json({
      ok: true,
      defaultCompanyId,
      migratedUsers,
      migratedMessages,
      migratedReceipts,
      migratedLogs,
    });
  } catch (error: any) {
    console.error("Migration error:", error);
    res.status(500).json({ error: error.message });
  }
});
