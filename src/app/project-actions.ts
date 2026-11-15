"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/actions";
import { getPrimaryWorkspaceId } from "@/lib/auth/session";
import {
  createProject,
  deleteProject,
  duplicateProject,
  restoreRevision,
  updateProject,
} from "@/lib/projects/service";
import { audit } from "@/lib/security/audit";
import { rateLimit } from "@/lib/security/rateLimit";
import { STARTER_TEMPLATES } from "@/lib/projects/templates";

export async function createProjectFromTemplateAction(
  templateId: string,
): Promise<{ ok: true; projectId: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const workspaceId = await getPrimaryWorkspaceId(user.id);
  if (!workspaceId) return { ok: false, error: "noworkspace" };
  const tpl = STARTER_TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) return { ok: false, error: "invalid_template" };

  const created = await createProject(user.id, workspaceId, {
    title: tpl.language === "ar" ? tpl.nameAr : tpl.nameEn,
    type: tpl.type,
    language: tpl.language,
  });
  if (!created.ok) return { ok: false, error: created.error };

  const updated = await updateProject(user.id, created.id, { content: tpl.content });
  if (!updated.ok) return { ok: false, error: updated.error ?? "failed" };

  revalidatePath("/dashboard");
  return { ok: true, projectId: created.id };
}

export async function createProjectAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const workspaceId = await getPrimaryWorkspaceId(user.id);
  if (!workspaceId) redirect("/dashboard?error=noworkspace");
  const type = formData.get("type") === "document" ? "document" : "presentation";
  const language = formData.get("language") === "ar" ? "ar" : "en";
  const rawTitle = String(formData.get("title") ?? "").trim();
  const defaultTitle =
    type === "document"
      ? language === "ar"
        ? "مستند بدون عنوان"
        : "Untitled Document"
      : language === "ar"
        ? "عرض تقديمي بدون عنوان"
        : "Untitled Presentation";
  const isBlank = formData.get("blank") === "1" || rawTitle === "";
  const result = await createProject(
    user.id,
    workspaceId!,
    {
      title: rawTitle || defaultTitle,
      type,
      language,
    },
    { blank: isBlank },
  );
  if (!result.ok) redirect("/dashboard?error=create");
  revalidatePath("/dashboard");
  redirect(`/projects/${result.id}`);
}

export async function renameProjectAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const projectId = String(formData.get("projectId") ?? "");
  const title = String(formData.get("title") ?? "");
  await updateProject(user.id, projectId, { title });
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const projectId = String(formData.get("projectId") ?? "");
  await deleteProject(user.id, projectId);
  await audit(user.id, "project.delete", { projectId });
  revalidatePath("/dashboard");
}

export async function duplicateProjectAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const projectId = String(formData.get("projectId") ?? "");
  const result = await duplicateProject(user.id, projectId);
  revalidatePath("/dashboard");
  if (result.ok) redirect(`/projects/${result.id}`);
}

export async function updateProjectContentAction(
  projectId: string,
  content: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const rl = rateLimit(`save:${user.id}`, 120, 60_000);
  if (!rl.ok) return { ok: false, error: "rate_limited" };
  return updateProject(user.id, projectId, { content });
}

export async function updateProjectMetaAction(
  projectId: string,
  meta: { title?: string; language?: string },
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const rl = rateLimit(`meta:${user.id}`, 60, 60_000);
  if (!rl.ok) return { ok: false, error: "rate_limited" };
  return updateProject(user.id, projectId, meta);
}

export async function restoreRevisionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const projectId = String(formData.get("projectId") ?? "");
  const revisionNo = Number(formData.get("revisionNo") ?? "0");
  const result = await restoreRevision(user.id, projectId, revisionNo);
  revalidatePath(`/projects/${projectId}`);
  if (!result.ok) redirect(`/projects/${projectId}?error=restore`);
  redirect(`/projects/${projectId}`);
}
