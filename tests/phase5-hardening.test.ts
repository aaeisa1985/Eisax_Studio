import { describe, expect, it, beforeAll } from "vitest";
import { createHmac } from "node:crypto";
import path from "node:path";
import { rmSync } from "node:fs";
import { getDb } from "@/lib/db";
import { auditLog, users, workspaces, workspaceMembers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { audit } from "@/lib/security/audit";
import { planForWorkspace, BILLING_ENABLED } from "@/lib/billing/plans";
import { verifyStripeSignature } from "@/lib/billing/stripe";
import { LocalStorageAdapter } from "@/lib/storage";
import { getWorkspaceAsset, saveWorkspaceAsset, sniffRasterImageMime } from "@/lib/storage/assets";
import { STARTER_TEMPLATES } from "@/lib/projects/templates";
import { documentContentSchema, presentationContentSchema } from "@/lib/validation/projects";
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

describe("plan entitlements & Stripe webhook verification", () => {
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
    expect(free.exports).not.toContain("pptx");
  });

  it("verifies valid Stripe webhook signatures and rejects forged or expired ones", () => {
    const secret = "whsec_test_secret";
    const payload = JSON.stringify({ id: "evt_1", type: "customer.subscription.updated" });
    const ts = 1_700_000_000;
    const sig = createHmac("sha256", secret).update(`${ts}.${payload}`, "utf8").digest("hex");

    expect(verifyStripeSignature(payload, `t=${ts},v1=${sig}`, secret, ts + 10)).toBe(true);
    expect(verifyStripeSignature(payload, `t=${ts},v1=${sig}`, secret, ts + 600)).toBe(false);
    expect(verifyStripeSignature(payload, `t=${ts},v1=deadbeef`, secret, ts + 10)).toBe(false);
    expect(verifyStripeSignature(payload, null, secret, ts + 10)).toBe(false);
  });
});

describe("local storage adapter", () => {
  it("enforces MIME allowlist and persists/reads/removes valid images", async () => {
    const root = path.resolve(process.cwd(), ".data", `test-storage-${suffix}`);
    const adapter = new LocalStorageAdapter(root);
    try {
      await expect(
        adapter.put({ workspaceId: "ws1", mimeType: "application/x-msdownload", bytes: Buffer.from("MZ") }),
      ).rejects.toThrow("unsupported_mime_type");

      const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const { key } = await adapter.put({ workspaceId: "ws1", mimeType: "image/png", bytes });
      expect(key.startsWith("ws1/")).toBe(true);
      expect(await adapter.get(key)).toEqual(bytes);
      await adapter.remove(key);
      expect(await adapter.get(key)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("sniffs magic bytes, rejects SVG/HTML/executables, and enforces workspace tenancy on assets", async () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const jpgHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const svgBytes = Buffer.from("<svg onload=alert(1)></svg>");

    expect(sniffRasterImageMime(pngHeader)).toBe("image/png");
    expect(sniffRasterImageMime(jpgHeader)).toBe("image/jpeg");
    expect(sniffRasterImageMime(svgBytes)).toBeNull();

    const db = await getDb();
    const owner = (
      await db.insert(users).values({ email: `asset-o-${suffix}@test.dev`, passwordHash: "x", displayName: "O" }).returning()
    )[0]!;
    const stranger = (
      await db.insert(users).values({ email: `asset-s-${suffix}@test.dev`, passwordHash: "x", displayName: "S" }).returning()
    )[0]!;
    const ws = (await db.insert(workspaces).values({ name: "ws", ownerId: owner.id }).returning())[0]!;
    await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: owner.id, role: "owner" });

    const rejected = await saveWorkspaceAsset({ userId: owner.id, workspaceId: ws.id, bytes: svgBytes });
    expect(rejected).toEqual({ ok: false, error: "unsupported_file_type" });

    const saved = await saveWorkspaceAsset({ userId: owner.id, workspaceId: ws.id, bytes: pngHeader });
    expect(saved.ok).toBe(true);
    if (saved.ok) {
      expect((await getWorkspaceAsset({ userId: owner.id, assetId: saved.id }))?.mimeType).toBe("image/png");
      expect(await getWorkspaceAsset({ userId: stranger.id, assetId: saved.id })).toBeNull();
    }
  });

  it("all starter templates validate against presentation/document schemas", () => {
    expect(STARTER_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    for (const tpl of STARTER_TEMPLATES) {
      if (tpl.type === "presentation") {
        expect(presentationContentSchema.safeParse(tpl.content).success).toBe(true);
      } else {
        expect(documentContentSchema.safeParse(tpl.content).success).toBe(true);
      }
    }
  });
});
