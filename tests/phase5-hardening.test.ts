import { describe, expect, it, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { auditLog, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { audit } from "@/lib/security/audit";
import { planForWorkspace, BILLING_ENABLED } from "@/lib/billing/plans";
import { hashPassword } from "@/lib/auth/password";

const suffix = Date.now().toString(36);

beforeAll(async () => {
  await getDb();
});

describe("audit log", () => {
  it("writes security-critical events without content", async () => {
    const db = await getDb();
    const u = (
      await db
        .insert(users)
        .values({ email: `audit-${suffix}@test.dev`, passwordHash: hashPassword("x".repeat(12)), displayName: "A" })
        .returning()
    )[0]!;
    await audit(u.id, "project.delete", { projectId: "00000000-0000-0000-0000-000000000000" });
    await audit(null, "user.sign_out");
    const rows = await db.select().from(auditLog).where(eq(auditLog.actorId, u.id));
    expect(rows.length).toBe(1);
    expect(rows[0]!.action).toBe("project.delete");
  });
});

describe("plan entitlements", () => {
  it("billing disabled => every workspace is free, regardless of stored plan", () => {
    expect(BILLING_ENABLED).toBe(false); // feature flag default
    expect(planForWorkspace("pro").id).toBe("free");
    expect(planForWorkspace("personal").id).toBe("free");
    expect(planForWorkspace(null).id).toBe("free");
  });

  it("free plan has hard caps configured", () => {
    const free = planForWorkspace(null);
    expect(free.aiOperationsPerMonth).toBeGreaterThan(0);
    expect(free.aiOperationsPerMonth).toBeLessThanOrEqual(20);
    expect(free.exports).toContain("pdf");
    expect(free.exports).not.toContain("pptx"); // paid export per draft pricing
  });
});
