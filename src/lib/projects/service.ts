import { and, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workspaceMembers, projectRevisions, projects } from "@/lib/db/schema";
import { stableEqual } from "@/lib/utils/stableStringify";
import {
  createProjectSchema,
  documentContentSchema,
  presentationContentSchema,
  updateProjectSchema,
  projectSearchSchema,
} from "@/lib/validation/projects";
import type { WorkspaceIdPair } from "./types";

const REVISION_KEEP = 20;

export type ProjectRow = {
  id: string;
  workspaceId: string;
  ownerId: string;
  type: "presentation" | "document";
  title: string;
  language: string;
  content: unknown;
  updatedAt: Date;
};

/** Tenancy guard: user must be a member of the project's workspace. */
export async function assertProjectAccess(
  userId: string,
  projectId: string,
): Promise<WorkspaceIdPair | null> {
  const db = await getDb();
  const rows = await db
    .select({ workspaceId: projects.workspaceId, ownerId: projects.ownerId })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.archivedAt)))
    .limit(1);
  const project = rows[0];
  if (!project) return null;
  const membership = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, project.workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .limit(1);
  if (membership.length === 0) return null;
  return { workspaceId: project.workspaceId, ownerId: project.ownerId };
}

export async function listProjects(
  userId: string,
  workspaceId: string,
  search: { q?: string; type?: "presentation" | "document" } = {},
): Promise<ProjectRow[]> {
  const parsed = projectSearchSchema.safeParse(search);
  if (!parsed.success) return [];
  const db = await getDb();
  const conditions = [
    eq(projects.workspaceId, workspaceId),
    eq(projects.ownerId, userId),
    isNull(projects.archivedAt),
  ] as const;
  if (parsed.data.q) {
    const q = parsed.data.q;
    const matching = await db
      .select({ id: projects.id, workspaceId: projects.workspaceId, ownerId: projects.ownerId, type: projects.type, title: projects.title, language: projects.language, content: projects.content, updatedAt: projects.updatedAt })
      .from(projects)
      .where(and(...conditions, ilike(projects.title, `%${q}%`)))
      .orderBy(desc(projects.updatedAt))
      .limit(100);
    return matching as ProjectRow[];
  }
  const withType = parsed.data.type ? [...conditions, eq(projects.type, parsed.data.type)] : conditions;
  const rows = await db
    .select({
      id: projects.id,
      workspaceId: projects.workspaceId,
      ownerId: projects.ownerId,
      type: projects.type,
      title: projects.title,
      language: projects.language,
      content: projects.content,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(and(...withType))
    .orderBy(desc(projects.updatedAt))
    .limit(100);
  return rows as ProjectRow[];
}

export async function getProject(
  userId: string,
  projectId: string,
): Promise<ProjectRow | null> {
  const access = await assertProjectAccess(userId, projectId);
  if (!access) return null;
  const db = await getDb();
  const rows = await db
    .select({
      id: projects.id,
      workspaceId: projects.workspaceId,
      ownerId: projects.ownerId,
      type: projects.type,
      title: projects.title,
      language: projects.language,
      content: projects.content,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return (rows[0] as ProjectRow | undefined) ?? null;
}

export async function createProject(
  userId: string,
  workspaceId: string,
  input: unknown,
  opts?: { blank?: boolean },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const dir = parsed.data.language === "ar" ? "rtl" : "ltr";
  const content =
    parsed.data.type === "presentation"
      ? presentationContentSchema.parse({
          slides: [
            {
              id: crypto.randomUUID(),
              title: opts?.blank ? "" : parsed.data.title,
              subtitle: "",
              elements: opts?.blank ? [] : undefined,
              notes: "",
              dir,
            },
          ],
        })
      : documentContentSchema.parse({
          blocks: [
            {
              id: crypto.randomUUID(),
              kind: opts?.blank ? "paragraph" : "heading",
              ...(opts?.blank ? {} : { level: 1 }),
              text: opts?.blank ? "" : parsed.data.title,
              dir,
            },
          ],
        });

  const db = await getDb();
  const rows = await db
    .insert(projects)
    .values({
      workspaceId,
      ownerId: userId,
      type: parsed.data.type,
      title: parsed.data.title,
      language: parsed.data.language,
      content,
    })
    .returning({ id: projects.id });
  const row = rows[0];
  if (!row) return { ok: false, error: "insert_failed" };
  await db.insert(projectRevisions).values({
    projectId: row.id,
    revisionNo: 1,
    title: parsed.data.title,
    content,
    createdBy: userId,
  });
  return { ok: true, id: row.id };
}

export async function updateProject(
  userId: string,
  projectId: string,
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const access = await assertProjectAccess(userId, projectId);
  if (!access) return { ok: false, error: "not_found" };

  const parsed = updateProjectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const db = await getDb();
  const existing = await db
    .select({ id: projects.id, type: projects.type, title: projects.title, content: projects.content })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const current = existing[0];
  if (!current) return { ok: false, error: "not_found" };

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.language !== undefined) updates.language = parsed.data.language;

  if (parsed.data.content !== undefined) {
    // Validate content against the schema for the project type.
    let content: unknown;
    if (current.type === "presentation") {
      const p = presentationContentSchema.safeParse(parsed.data.content);
      if (!p.success) return { ok: false, error: "invalid_content" };
      content = p.data;
    } else {
      const p = documentContentSchema.safeParse(parsed.data.content);
      if (!p.success) return { ok: false, error: "invalid_content" };
      content = p.data;
    }
    // Skip no-op saves (autosave writes identical content often).
    // Compare canonically: Postgres jsonb reorders keys, so raw stringify lies.
    if (!stableEqual(content, current.content)) {
      updates.content = content;
      const last = await db
        .select({ revisionNo: projectRevisions.revisionNo })
        .from(projectRevisions)
        .where(eq(projectRevisions.projectId, projectId))
        .orderBy(desc(projectRevisions.revisionNo))
        .limit(1);
      const nextNo = (last[0]?.revisionNo ?? 0) + 1;
      const title = (updates.title as string | undefined) ?? current.title;
      await db.insert(projectRevisions).values({
        projectId,
        revisionNo: nextNo,
        title,
        content,
        createdBy: userId,
      });
      // Retention: keep last REVISION_KEEP revisions.
      await db.execute(sql`
        DELETE FROM project_revisions
        WHERE project_id = ${projectId}
          AND revision_no <= (
            SELECT max(revision_no) - ${REVISION_KEEP} FROM project_revisions WHERE project_id = ${projectId}
          )
      `);
    }
  }

  await db.update(projects).set(updates).where(eq(projects.id, projectId));
  return { ok: true };
}

export async function listRevisions(userId: string, projectId: string) {
  const access = await assertProjectAccess(userId, projectId);
  if (!access) return [];
  const db = await getDb();
  return db
    .select({
      id: projectRevisions.id,
      revisionNo: projectRevisions.revisionNo,
      title: projectRevisions.title,
      createdAt: projectRevisions.createdAt,
    })
    .from(projectRevisions)
    .where(eq(projectRevisions.projectId, projectId))
    .orderBy(desc(projectRevisions.revisionNo))
    .limit(REVISION_KEEP);
}

export async function restoreRevision(
  userId: string,
  projectId: string,
  revisionNo: number,
): Promise<{ ok: boolean; error?: string }> {
  const access = await assertProjectAccess(userId, projectId);
  if (!access) return { ok: false, error: "not_found" };
  const db = await getDb();
  const rows = await db
    .select({ content: projectRevisions.content })
    .from(projectRevisions)
    .where(and(eq(projectRevisions.projectId, projectId), eq(projectRevisions.revisionNo, revisionNo)))
    .limit(1);
  const rev = rows[0];
  if (!rev) return { ok: false, error: "not_found" };
  return updateProject(userId, projectId, { content: rev.content });
}

export async function deleteProject(userId: string, projectId: string): Promise<boolean> {
  const access = await assertProjectAccess(userId, projectId);
  if (!access) return false;
  const db = await getDb();
  await db
    .update(projects)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  return true;
}

export async function duplicateProject(
  userId: string,
  projectId: string,
): Promise<{ ok: true; id: string } | { ok: false }> {
  const access = await assertProjectAccess(userId, projectId);
  if (!access) return { ok: false };
  const db = await getDb();
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const src = rows[0];
  if (!src) return { ok: false };
  const copy = await db
    .insert(projects)
    .values({
      workspaceId: src.workspaceId,
      ownerId: src.ownerId,
      type: src.type,
      title: `${src.title} (copy)`,
      language: src.language,
      content: src.content,
      schemaVersion: src.schemaVersion,
    })
    .returning({ id: projects.id });
  const id = copy[0]?.id;
  if (!id) return { ok: false };
  await db.insert(projectRevisions).values({
    projectId: id,
    revisionNo: 1,
    title: `${src.title} (copy)`,
    content: src.content,
    createdBy: userId,
  });
  return { ok: true, id };
}
