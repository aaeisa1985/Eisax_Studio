import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usageLedger, generationJobs, workspaces } from "@/lib/db/schema";
import { BILLING_ENABLED, currentPeriod, planForWorkspace } from "@/lib/billing/plans";
import type { PlanEntitlements } from "@/lib/billing/plans";

export type QuotaCheck =
  | { allowed: true; plan: PlanEntitlements; used: number }
  | { allowed: false; reason: "quota_exceeded"; plan: PlanEntitlements; used: number; limit: number };

/** Server-side entitlement check for one AI operation. */
export async function checkAiQuota(userId: string, workspaceId: string): Promise<QuotaCheck> {
  const db = await getDb();
  const ws = await db
    .select({ plan: workspaces.plan })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  const plan = planForWorkspace(ws[0]?.plan);
  const period = currentPeriod();
  const rows = await db
    .select({ used: sql<number>`coalesce(sum(${usageLedger.units}), 0)` })
    .from(usageLedger)
    .where(and(eq(usageLedger.userId, userId), eq(usageLedger.period, period), eq(usageLedger.kind, "ai_operation")));
  const used = Number(rows[0]?.used ?? 0);
  if (used >= plan.aiOperationsPerMonth) {
    return { allowed: false, reason: "quota_exceeded", plan, used, limit: plan.aiOperationsPerMonth };
  }
  return { allowed: true, plan, used };
}

/**
 * Check whether the workspace's active plan allows the requested export format.
 * When BILLING_ENABLED is false (pre-billing launch state), exports remain
 * accessible for V1 evaluation while rate limits and audit logging still apply.
 */
export async function checkExportAllowed(
  workspaceId: string,
  format: "pdf" | "docx" | "pptx",
): Promise<{ allowed: boolean; plan: PlanEntitlements }> {
  const db = await getDb();
  const ws = await db
    .select({ plan: workspaces.plan })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  const plan = planForWorkspace(ws[0]?.plan);
  if (!BILLING_ENABLED) {
    return { allowed: true, plan };
  }
  return { allowed: plan.exports.includes(format), plan };
}

/** Record one AI operation (1 unit). Idempotent via key when provided. */
export async function recordAiUsage(userId: string, idempotencyKey?: string): Promise<void> {
  const db = await getDb();
  if (idempotencyKey) {
    await db
      .insert(usageLedger)
      .values({ userId, kind: "ai_operation", units: 1, period: currentPeriod(), idempotencyKey })
      .onConflictDoNothing({ target: usageLedger.idempotencyKey });
  } else {
    await db.insert(usageLedger).values({ userId, kind: "ai_operation", units: 1, period: currentPeriod() });
  }
}

export async function recordJob(args: {
  userId: string;
  projectId?: string | null;
  operation: "generate_outline" | "generate_content" | "edit_block";
  provider: string;
  model: string;
  status: "succeeded" | "failed";
  error?: string;
}): Promise<void> {
  const db = await getDb();
  await db.insert(generationJobs).values({
    userId: args.userId,
    projectId: args.projectId ?? null,
    operation: args.operation,
    provider: args.provider,
    model: args.model,
    status: args.status,
    error: args.error,
    units: 1,
  });
}

export async function getMonthlyUsage(
  userId: string,
  workspaceId?: string | null,
): Promise<{ used: number; limit: number; period: string; planId: string }> {
  const db = await getDb();
  const period = currentPeriod();
  const rows = await db
    .select({ used: sql<number>`coalesce(sum(${usageLedger.units}), 0)` })
    .from(usageLedger)
    .where(and(eq(usageLedger.userId, userId), eq(usageLedger.period, period), eq(usageLedger.kind, "ai_operation")));

  let workspacePlan: string | null = null;
  if (workspaceId) {
    const ws = await db
      .select({ plan: workspaces.plan })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    workspacePlan = ws[0]?.plan ?? null;
  }
  const plan = planForWorkspace(workspacePlan);
  return { used: Number(rows[0]?.used ?? 0), limit: plan.aiOperationsPerMonth, period, planId: plan.id };
}
