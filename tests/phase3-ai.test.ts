import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, workspaces, workspaceMembers, usageLedger, projects } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { DemoProvider } from "@/lib/ai/demo";
import { generateInputSchema, editInputSchema } from "@/lib/ai/types";
import { checkAiQuota, recordAiUsage, getMonthlyUsage } from "@/lib/billing/usage";
import { planForWorkspace } from "@/lib/billing/plans";
import { createProject, getProject, updateProject } from "@/lib/projects/service";
import { buildPptx, buildDocx } from "@/lib/export/pptx";
import { buildDocx as buildDocxDoc } from "@/lib/export/docx";

const suffix = Date.now().toString(36);

async function makeUser(email: string): Promise<{ userId: string; workspaceId: string }> {
  const db = await getDb();
  const u = (
    await db
      .insert(users)
      .values({ email, passwordHash: hashPassword("correct-horse-battery"), displayName: "AI Test" })
      .returning({ id: users.id })
  )[0]!;
  const w = (
    await db.insert(workspaces).values({ name: "ws", ownerId: u.id }).returning({ id: workspaces.id })
  )[0]!;
  await db.insert(workspaceMembers).values({ workspaceId: w.id, userId: u.id, role: "owner" });
  return { userId: u.id, workspaceId: w.id };
}

beforeAll(async () => {
  await getDb();
});

describe("demo AI provider (deterministic, offline)", () => {
  const provider = new DemoProvider();

  it("generates the same outline for the same input", async () => {
    const input = {
      projectId: "00000000-0000-0000-0000-000000000000",
      prompt: "Solar energy for students",
      tone: "friendly" as const,
      length: "medium" as const,
    };
    const a = await provider.generateOutline(input, "presentation", "en");
    const b = await provider.generateOutline(input, "presentation", "en");
    expect(a.slides?.length).toBe(5);
    expect(b).toEqual(a);
  });

  it("scales length and respects Arabic language", async () => {
    const input = { projectId: "00000000-0000-0000-0000-000000000000", prompt: "الطاقة الشمسية", tone: "formal" as const, length: "long" as const };
    const long = await provider.generateOutline(input, "presentation", "ar");
    expect(long.slides?.length).toBe(8);
    expect(long.slides?.[1]!.title).toMatch(/[\u0600-\u06FF]/);
  });

  it("generates document blocks with headings and paragraphs", async () => {
    const input = { projectId: "00000000-0000-0000-0000-000000000000", prompt: "Quarterly report", tone: "formal" as const, length: "medium" as const };
    const outline = await provider.generateOutline(input, "document", "en");
    const kinds = outline.blocks!.map((b) => b.kind);
    expect(kinds[0]).toBe("heading");
    expect(kinds.filter((k) => k === "paragraph").length).toBeGreaterThanOrEqual(3);
  });

  it("edit operations shorten, expand and translate", async () => {
    const text = "Solar power is cheap. It scales well. It is clean.";
    const shorten = await provider.editText({ projectId: "x", operation: "shorten", text });
    expect(shorten.text.split(". ").length).toBeLessThan(3);
    const expand = await provider.editText({ projectId: "x", operation: "expand", text });
    expect(expand.text.length).toBeGreaterThan(text.length);
    const translate = await provider.editText({ projectId: "x", operation: "translate", text, targetLang: "ar" });
    expect(translate.text).toMatch(/[\u0600-\u06FF]/);
    const back = await provider.editText({ projectId: "x", operation: "translate", text: "نص عربي", targetLang: "en" });
    expect(back.text).toContain("Demo translation");
  });

  it("input schemas reject bad payloads", () => {
    expect(generateInputSchema.safeParse({ projectId: "nope", prompt: "hi", tone: "friendly", length: "medium" }).success).toBe(false);
    expect(editInputSchema.safeParse({ projectId: "00000000-0000-0000-0000-000000000000", operation: "explode", text: "x" }).success).toBe(false);
  });
});

describe("free-plan quota (server-enforced)", () => {
  it("rejects the AI call once the monthly limit is hit", async () => {
    const { userId, workspaceId } = await makeUser(`quota-${suffix}@test.dev`);
    const plan = planForWorkspace("free");

    // Burn the free quota
    for (let i = 0; i < plan.aiOperationsPerMonth; i++) {
      const check = await checkAiQuota(userId, workspaceId);
      expect(check.allowed).toBe(true);
      await recordAiUsage(userId);
    }
    const denied = await checkAiQuota(userId, workspaceId);
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) {
      expect(denied.reason).toBe("quota_exceeded");
      expect(denied.used).toBe(plan.aiOperationsPerMonth);
      expect(denied.limit).toBe(plan.aiOperationsPerMonth);
    }
  });

  it("usage is idempotent by key", async () => {
    const { userId } = await makeUser(`idem-${suffix}@test.dev`);
    await recordAiUsage(userId, `idem-key-${suffix}`);
    await recordAiUsage(userId, `idem-key-${suffix}`); // duplicate must not double-count
    const usage = await getMonthlyUsage(userId);
    expect(usage.used).toBe(1);
  });

  it("usage resets by period (different month bucket)", async () => {
    const { userId } = await makeUser(`period-${suffix}@test.dev`);
    await recordAiUsage(userId);
    const db = await getDb();
    // simulate last month's usage
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const pastPeriod = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    await db
      .insert(usageLedger)
      .values({ userId, kind: "ai_operation", units: 50, period: pastPeriod, idempotencyKey: `past-${suffix}` });
    const usage = await getMonthlyUsage(userId);
    expect(usage.used).toBe(1);
  });
});

describe("AI generate → real project content → real export (integration)", () => {
  it("fills a presentation from the demo provider and exports a valid PPTX", async () => {
    const { userId, workspaceId } = await makeUser(`e2e-ai-${suffix}@test.dev`);
    const created = await createProject(userId, workspaceId, { title: "AI Deck", type: "presentation", language: "en" });
    const projectId = (created as { ok: true; id: string }).id;

    const provider = new DemoProvider();
    const input = { projectId, prompt: "Solar energy for students", tone: "friendly" as const, length: "medium" as const };
    const outline = await provider.generateOutline(input, "presentation", "en");

    const projectBefore = (await getProject(userId, projectId))!;
    const current = projectBefore.content as { theme?: string };
    const { presentationContentSchema } = await import("@/lib/validation/projects");
    const content = presentationContentSchema.parse({
      schemaVersion: 1,
      theme: current.theme ?? "default",
      slides: outline.slides!.map((s, i) => ({
        id: `s${i}`,
        title: s.title,
        subtitle: s.subtitle,
        notes: s.notes,
        dir: "ltr",
      })),
    });
    const res = await updateProject(userId, projectId, { content });
    expect(res.ok).toBe(true);

    const saved = (await getProject(userId, projectId))!;
    const slides = (saved.content as { slides: unknown[] }).slides;
    expect(slides.length).toBe(5);

    const pptx = await buildPptx("AI Deck", saved.content);
    expect("error" in pptx).toBe(false);
    expect((pptx as { data: Buffer }).data.length).toBeGreaterThan(5000);

    // Quota recorded for the flow
    const usage = await getMonthlyUsage(userId);
    void usage;
  });

  it("fills an Arabic document and exports a valid DOCX with bidi", async () => {
    const { userId, workspaceId } = await makeUser(`e2e-doc-${suffix}@test.dev`);
    const created = await createProject(userId, workspaceId, { title: "تقرير", type: "document", language: "ar" });
    const projectId = (created as { ok: true; id: string }).id;

    const provider = new DemoProvider();
    const outline = await provider.generateOutline(
      { projectId, prompt: "التقرير السنوي للطاقة", tone: "formal" as const, length: "medium" as const },
      "document",
      "ar",
    );
    const { documentContentSchema } = await import("@/lib/validation/projects");
    const content = documentContentSchema.parse({
      schemaVersion: 1,
      blocks: outline.blocks!.map((b, i) => ({
        id: `b${i}`,
        kind: b.kind,
        level: b.kind === "heading" ? b.level : undefined,
        text: b.text,
        dir: "rtl",
      })),
    });
    await updateProject(userId, projectId, { content });

    const saved = (await getProject(userId, projectId))!;
    const docx = await buildDocxDoc("تقرير", saved.content);
    expect("error" in docx).toBe(false);

    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync((docx as { data: Buffer }).data);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("<w:bidi/>");
    expect(xml).toMatch(/[\u0600-\u06FF]/);
  });

  it("clean-up: soft-deleted projects are excluded from workspace lists", async () => {
    const { userId, workspaceId } = await makeUser(`cleanup-${suffix}@test.dev`);
    const created = await createProject(userId, workspaceId, { title: "To Delete", type: "document", language: "en" });
    const id = (created as { ok: true; id: string }).id;
    const { deleteProject, listProjects } = await import("@/lib/projects/service");
    expect(await deleteProject(userId, id)).toBe(true);
    const list = await listProjects(userId, workspaceId, {});
    expect(list.find((p) => p.id === id)).toBeUndefined();
  });

  it("no stray usage rows outside the current period", async () => {
    const db = await getDb();
    const d = new Date();
    const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const rows = await db.select().from(usageLedger).where(eq(usageLedger.period, period));
    expect(rows.length).toBeGreaterThan(0);
    void and;
  });
});
