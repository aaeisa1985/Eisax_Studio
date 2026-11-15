/**
 * Plan entitlements — configuration-driven, NOT final pricing.
 * Free plan has hard server-enforced limits. Billing itself stays disabled
 * until explicitly approved (FEATURE_BILLING=false).
 */
export type PlanId = "free" | "personal" | "pro" | "teams";

export interface PlanEntitlements {
  id: PlanId;
  /** Hard cap of AI operations per calendar month. */
  aiOperationsPerMonth: number;
  /** Export formats allowed. */
  exports: Array<"pdf" | "docx" | "pptx">;
  /** Concurrency cap per user for AI jobs. */
  aiConcurrency: number;
}

export const PLANS: Record<PlanId, PlanEntitlements> = {
  free: { id: "free", aiOperationsPerMonth: 20, exports: ["pdf"], aiConcurrency: 1 },
  personal: { id: "personal", aiOperationsPerMonth: 300, exports: ["pdf", "docx", "pptx"], aiConcurrency: 2 },
  pro: { id: "pro", aiOperationsPerMonth: 1000, exports: ["pdf", "docx", "pptx"], aiConcurrency: 3 },
  teams: { id: "teams", aiOperationsPerMonth: 1000, exports: ["pdf", "docx", "pptx"], aiConcurrency: 3 },
};

export const BILLING_ENABLED = process.env.FEATURE_BILLING === "true";

/** The plan a workspace is on. Until billing is enabled every workspace is free. */
export function planForWorkspace(workspacePlan: string | null | undefined): PlanEntitlements {
  if (BILLING_ENABLED && workspacePlan && workspacePlan in PLANS) {
    return PLANS[workspacePlan as PlanId];
  }
  return PLANS.free;
}

export function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
