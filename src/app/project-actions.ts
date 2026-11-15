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

export async function createProjectAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const workspaceId = await getPrimaryWorkspaceId(user.id);
  if (!workspaceId) redirect("/dashboard?error=noworkspace");
  const result = await createProject(user.id, workspaceId!, {
    title: formData.get("title"),
    type: formData.get("type"),
    language: formData.get("language") ?? "en",
  });
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
  return updateProject(user.id, projectId, { content });
}

export async function updateProjectMetaAction(
  projectId: string,
  meta: { title?: string; language?: string },
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
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
