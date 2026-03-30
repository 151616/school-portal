import { ref, set, push } from "firebase/database";
import { db, auth } from "@/firebase";

/**
 * Write an audit log entry to the database.
 */
export const logAudit = async (
  action: string,
  details: Record<string, unknown> = {}
): Promise<void> => {
  if (!auth.currentUser) return;
  try {
    const entry = {
      action,
      createdAt: Date.now(),
      actorUid: auth.currentUser.uid,
      actorEmail: auth.currentUser.email || "",
      ...details,
    };
    await set(push(ref(db, "auditLogs")), entry);
  } catch (err) {
    console.error("Audit log error:", err);
  }
};
