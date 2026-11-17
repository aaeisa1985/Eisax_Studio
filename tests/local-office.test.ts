import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { getLocalUser } from "@/lib/auth/local";
import { getPrimaryWorkspaceId } from "@/lib/auth/session";
import { createProject, updateProject, getProject, listRevisions } from "@/lib/projects/service";
import { hasOriginal, saveOriginal, readOriginal } from "@/lib/storage/originals";

describe("local Office workspace", () => {
  it("reuses one personal profile and saves simultaneous changes with unique revisions", async () => {
    const profiles = await Promise.all([getLocalUser(), getLocalUser(), getLocalUser()]);
    expect(new Set(profiles.map((p) => p.id)).size).toBe(1);
    const user = profiles[0]!;
    const workspaceId = await getPrimaryWorkspaceId(user.id);
    expect(workspaceId).toBeTruthy();
    const project = await createProject(user.id, workspaceId!, { type: "document", language: "ar", title: "Local test" }, { blank: true });
    if (!project.ok) throw new Error(project.error);
    const results = await Promise.all(["first", "second"].map((text) => updateProject(user.id, project.id, {
      content: { blocks: [{ id: randomUUID(), kind: "paragraph", text, dir: "rtl" }] },
    })));
    expect(results.every((r) => r.ok)).toBe(true);
    expect((await listRevisions(user.id, project.id)).map((r) => r.revisionNo)).toEqual([3, 2, 1]);
    expect(await getProject(user.id, project.id)).not.toBeNull();
    const before = (await getProject(user.id, project.id))!;
    const saved = await updateProject(user.id, project.id, { title: "first window" }, before.updatedAt.toISOString());
    expect(saved.ok).toBe(true);
    const conflict = await updateProject(user.id, project.id, { title: "stale second window" }, before.updatedAt.toISOString());
    expect(conflict).toEqual({ ok: false, error: "conflict" });
    expect((await getProject(user.id, project.id))!.title).toBe("first window");
  });

  it("retains original bytes without overwriting them and rejects traversal", async () => {
    const id = randomUUID();
    const bytes = Buffer.from("original Office archive bytes");
    try {
      expect(await hasOriginal(id)).toBe(false);
      await saveOriginal(id, bytes);
      expect(await readOriginal(id)).toEqual(bytes);
      await expect(saveOriginal(id, Buffer.from("replacement"))).rejects.toThrow();
      expect(await readOriginal(id)).toEqual(bytes);
      await expect(readOriginal("../outside")).rejects.toThrow("invalid_project_id");
    } finally {
      await rm(path.resolve(".data", "originals", id), { force: true });
    }
  });
});
