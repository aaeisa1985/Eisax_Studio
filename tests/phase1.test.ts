import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sessions, users, workspaceMembers, workspaces } from "@/lib/db/schema";
import { hashPassword, verifyPassword, hashSessionToken, newSessionToken } from "@/lib/auth/password";
import { rateLimit } from "@/lib/security/rateLimit";
import {
  createProject,
  deleteProject,
  duplicateProject,
  getProject,
  listProjects,
  listRevisions,
  restoreRevision,
  updateProject,
} from "@/lib/projects/service";
import {
  documentContentSchema,
  presentationContentSchema,
  signUpSchema,
} from "@/lib/validation/projects";
import { stableEqual } from "@/lib/utils/stableStringify";

describe("stableStringify", () => {
  it("treats key-reordered objects as equal (jsonb normalization)", () => {
    expect(stableEqual({ a: 1, b: [2, { c: 3, d: 4 }] }, { b: [2, { d: 4, c: 3 }], a: 1 })).toBe(true);
    expect(stableEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(stableEqual({ a: undefined }, {})).toBe(true);
    expect(stableEqual([1, 2], [2, 1])).toBe(false); // array order matters
  });
});

// Integration tests run against the real local PGlite database.
const suffix = Date.now().toString(36);

async function makeUser(email: string): Promise<{ userId: string; workspaceId: string }> {
  const db = await getDb();
  const u = (
    await db
      .insert(users)
      .values({ email, passwordHash: hashPassword("correct-horse-battery"), displayName: `Test ${email}` })
      .returning({ id: users.id })
  )[0]!;
  const w = (
    await db.insert(workspaces).values({ name: `${email} ws`, ownerId: u.id }).returning({ id: workspaces.id })
  )[0]!;
  await db.insert(workspaceMembers).values({ workspaceId: w.id, userId: u.id, role: "owner" });
  return { userId: u.id, workspaceId: w.id };
}

beforeAll(async () => {
  await getDb();
});

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", () => {
    const stored = hashPassword("S3cure-Passphrase!");
    expect(verifyPassword("S3cure-Passphrase!", stored)).toBe(true);
    expect(verifyPassword("wrong", stored)).toBe(false);
    expect(verifyPassword("S3cure-Passphrase!", "scrypt$16384$deadbeef$deadbeef")).toBe(false);
    expect(verifyPassword("x", "not-a-format")).toBe(false);
  });
});

describe("rate limiter", () => {
  it("blocks beyond the limit within the window", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 1000).ok).toBe(true);
    const blocked = rateLimit(key, 3, 1000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });
});

describe("auth data layer", () => {
  it("creates session rows hashed, and expiry filtering works", async () => {
    const { userId } = await makeUser(`sess-${suffix}@test.dev`);
    const db = await getDb();
    const token = newSessionToken();
    const expires = new Date(Date.now() + 60_000);
    await db.insert(sessions).values({ id: hashSessionToken(token), userId, expiresAt: expires });
    const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(rows.length).toBe(1);
    // Stored value must not contain the raw token
    expect(JSON.stringify(rows[0]!.id)).not.toContain(token);
    expect(rows[0]!.id).toBe(hashSessionToken(token));
  });
});

describe("validation schemas", () => {
  it("signUp enforces password length and email format", () => {
    expect(signUpSchema.safeParse({ email: "a@b.com", password: "short", displayName: "A" }).success).toBe(false);
    expect(signUpSchema.safeParse({ email: "not-an-email", password: "long-enough-pass", displayName: "A" }).success).toBe(false);
    expect(signUpSchema.safeParse({ email: " A@B.com ", password: "long-enough-pass", displayName: "A" }).success).toBe(true);
  });

  it("presentation content requires valid slides", () => {
    const ok = presentationContentSchema.safeParse({
      slides: [{ id: "s1", title: "T", subtitle: "", notes: "", dir: "ltr" }],
    });
    expect(ok.success).toBe(true);
    expect(documentContentSchema.safeParse({ blocks: [{ id: "b1", kind: "nope", text: "" }] }).success).toBe(false);
  });
});

describe("project service (tenancy + CRUD + revisions)", () => {
  let owner: { userId: string; workspaceId: string };
  let stranger: { userId: string; workspaceId: string };
  let projectId: string;

  it("creates a project with seeded content and revision 1", async () => {
    owner = await makeUser(`owner-${suffix}@test.dev`);
    const res = await createProject(owner.userId, owner.workspaceId, {
      title: "Solar Energy",
      type: "presentation",
      language: "en",
    });
    expect(res.ok).toBe(true);
    projectId = (res as { ok: true; id: string }).id;

    const p = await getProject(owner.userId, projectId);
    expect(p?.title).toBe("Solar Energy");
    expect(p?.type).toBe("presentation");
    const slides = (p?.content as { slides: unknown[] }).slides;
    expect(Array.isArray(slides)).toBe(true);
    expect(slides.length).toBe(1);

    const revs = await listRevisions(owner.userId, projectId);
    expect(revs.length).toBe(1);
    expect(revs[0]!.revisionNo).toBe(1);
  });

  it("denies access to users outside the workspace", async () => {
    stranger = await makeUser(`stranger-${suffix}@test.dev`);
    expect(await getProject(stranger.userId, projectId)).toBeNull();
    expect(await listRevisions(stranger.userId, projectId)).toEqual([]);
    expect(
      await updateProject(stranger.userId, projectId, { title: "Hacked" }),
    ).toMatchObject({ ok: false });
    expect(await deleteProject(stranger.userId, projectId)).toBe(false);
    // Owner still sees it
    expect(await getProject(owner.userId, projectId)).not.toBeNull();
  });

  it("updates content, writing a new revision and filtering no-op saves", async () => {
    const p1 = await getProject(owner.userId, projectId);
    const content1 = p1!.content as { slides: Array<{ id: string; title: string; subtitle: string; notes: string; dir: string }> };
    content1.slides.push({ id: "s2", title: "Second slide", subtitle: "", notes: "", dir: "ltr" });

    const res = await updateProject(owner.userId, projectId, { content: content1 });
    expect(res.ok).toBe(true);

    // No-op save must not create a revision
    const res2 = await updateProject(owner.userId, projectId, { content: content1 });
    expect(res2.ok).toBe(true);
    expect(await listRevisions(owner.userId, projectId)).toHaveLength(2);

    const revs = await listRevisions(owner.userId, projectId);
    expect(revs[0]!.revisionNo).toBe(2);
    expect(revs[1]!.revisionNo).toBe(1);
  });

  it("rejects invalid content payloads", async () => {
    const res = await updateProject(owner.userId, projectId, { content: { slides: "nope" } });
    expect(res).toMatchObject({ ok: false, error: "invalid_content" });
  });

  it("restores a previous revision", async () => {
    const res = await restoreRevision(owner.userId, projectId, 1);
    expect(res.ok).toBe(true);
    const p = await getProject(owner.userId, projectId);
    expect(((p!.content as { slides: unknown[] }).slides as unknown[]).length).toBe(1);
  });

  it("lists only the owner's projects and supports search", async () => {
    const mine = await listProjects(owner.userId, owner.workspaceId, {});
    expect(mine.length).toBe(1);
    const hit = await listProjects(owner.userId, owner.workspaceId, { q: "Solar" });
    expect(hit.length).toBe(1);
    const miss = await listProjects(owner.userId, owner.workspaceId, { q: "zzz-nope" });
    expect(miss.length).toBe(0);
    const asStranger = await listProjects(stranger.userId, stranger.workspaceId, {});
    expect(asStranger.length).toBe(0);
  });

  it("duplicates and soft-deletes a project", async () => {
    const dup = await duplicateProject(owner.userId, projectId);
    expect(dup.ok).toBe(true);
    const dupId = (dup as { ok: true; id: string }).id;
    const dupProject = await getProject(owner.userId, dupId);
    expect(dupProject!.title).toBe("Solar Energy (copy)");

    expect(await deleteProject(owner.userId, projectId)).toBe(true);
    expect(await getProject(owner.userId, projectId)).toBeNull();
    const remaining = await listProjects(owner.userId, owner.workspaceId, {});
    expect(remaining.map((p) => p.id)).toEqual([dupId]);
  });

  it("creates Arabic document with rtl direction", async () => {
    const res = await createProject(owner.userId, owner.workspaceId, {
      title: "الطاقة الشمسية",
      type: "document",
      language: "ar",
    });
    expect(res.ok).toBe(true);
    const p = await getProject(owner.userId, (res as { ok: true; id: string }).id);
    const blocks = (p!.content as { blocks: Array<{ dir: string }> }).blocks;
    expect(blocks[0]!.dir).toBe("rtl");
  });
});
