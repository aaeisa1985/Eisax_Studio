import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { subscriptions, workspaces } from "@/lib/db/schema";
import { PLANS, type PlanId } from "@/lib/billing/plans";
import { audit } from "@/lib/security/audit";

/**
 * Verify Stripe webhook signature (`Stripe-Signature: t=...,v1=...`) without
 * needing external SDK calls. Uses constant-time comparison and 5-minute tolerance.
 */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!signatureHeader || !webhookSecret) return false;
  const parts = signatureHeader.split(",").map((p) => p.trim());
  const timestampPart = parts.find((p) => p.startsWith("t="));
  const v1Parts = parts.filter((p) => p.startsWith("v1="));
  if (!timestampPart || v1Parts.length === 0) return false;

  const ts = Number(timestampPart.slice(2));
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > 300) {
    return false;
  }

  const signedPayload = `${ts}.${rawBody}`;
  const expected = createHmac("sha256", webhookSecret).update(signedPayload, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");

  return v1Parts.some((entry) => {
    const sigHex = entry.slice(3);
    if (sigHex.length !== expected.length) return false;
    try {
      return timingSafeEqual(expectedBuf, Buffer.from(sigHex, "hex"));
    } catch {
      return false;
    }
  });
}

export type StripeWebhookEvent = {
  id: string;
  type: string;
  data: {
    object: {
      id?: string;
      customer?: string;
      status?: string;
      current_period_end?: number;
      metadata?: { workspaceId?: string; planId?: string };
    };
  };
};

/** Apply an already-verified Stripe subscription event idempotently. */
export async function applyStripeEvent(event: StripeWebhookEvent): Promise<{ applied: boolean }> {
  const obj = event.data?.object ?? {};
  const workspaceId = obj.metadata?.workspaceId;
  const rawPlan = obj.metadata?.planId;
  if (!workspaceId) return { applied: false };

  const plan: PlanId = rawPlan && rawPlan in PLANS ? (rawPlan as PlanId) : "free";
  const db = await getDb();

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    const subId = obj.id ?? event.id;
    const active = obj.status === "active" || obj.status === "trialing";
    const effectivePlan: PlanId = active ? plan : "free";
    const periodEnd = obj.current_period_end ? new Date(obj.current_period_end * 1000) : null;

    await db
      .insert(subscriptions)
      .values({
        workspaceId,
        plan: effectivePlan,
        status: obj.status ?? "active",
        provider: "stripe",
        providerCustomerId: obj.customer ?? null,
        providerSubscriptionId: subId,
        currentPeriodEnd: periodEnd,
      })
      .onConflictDoUpdate({
        target: subscriptions.providerSubscriptionId,
        set: {
          plan: effectivePlan,
          status: obj.status ?? "active",
          currentPeriodEnd: periodEnd,
          updatedAt: new Date(),
        },
      });

    await db.update(workspaces).set({ plan: effectivePlan }).where(eq(workspaces.id, workspaceId));
    await audit(null, "billing.subscription_updated", { workspaceId, plan: effectivePlan, status: obj.status });
    return { applied: true };
  }

  if (event.type === "customer.subscription.deleted") {
    if (obj.id) {
      await db
        .update(subscriptions)
        .set({ plan: "free", status: "canceled", updatedAt: new Date() })
        .where(eq(subscriptions.providerSubscriptionId, obj.id));
    }
    await db.update(workspaces).set({ plan: "free" }).where(eq(workspaces.id, workspaceId));
    await audit(null, "billing.subscription_canceled", { workspaceId });
    return { applied: true };
  }

  return { applied: false };
}
