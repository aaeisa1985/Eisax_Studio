import { getDb } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

/** Security-critical events only; never log raw user content or prompts. */
export async function audit(
  actorId: string | null,
  action:
    | "user.sign_up"
    | "user.sign_in"
    | "user.sign_out"
    | "project.delete"
    | "project.duplicate"
    | "ai.quota_denied"
    | "export.pptx"
    | "export.docx"
    | "billing.subscription_updated"
    | "billing.subscription_canceled",
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(auditLog).values({ actorId, action, detail });
  } catch {
    // Audit failures must not break the user flow.
  }
}
