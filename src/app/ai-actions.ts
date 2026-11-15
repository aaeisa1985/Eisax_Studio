"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/actions";
import { getPrimaryWorkspaceId } from "@/lib/auth/session";
import { getAiProvider } from "@/lib/ai";
import {
  generateInputSchema,
  editInputSchema,
  outlineSchema,
  type AiOperation,
  type Outline,
} from "@/lib/ai/types";
import { createProject, getProject, updateProject } from "@/lib/projects/service";
import { checkAiQuota, recordAiUsage, recordJob, getMonthlyUsage } from "@/lib/billing/usage";
import { rateLimit } from "@/lib/security/rateLimit";
import { audit } from "@/lib/security/audit";
import {
  documentContentSchema,
  presentationContentSchema,
} from "@/lib/validation/projects";

export type AiGenerateResult =
  | { ok: true; content: unknown; used: number; limit: number; providerDemo: boolean }
  | {
      ok: false;
      error: "not_found" | "invalid_input" | "quota_exceeded" | "rate_limited" | "failed";
      used?: number;
      limit?: number;
    };

export async function getAiUsageAction(): Promise<{ used: number; limit: number; planId: string }> {
  const user = await requireUser();
  const workspaceId = await getPrimaryWorkspaceId(user.id);
  const usage = await getMonthlyUsage(user.id, workspaceId);
  return { used: usage.used, limit: usage.limit, planId: usage.planId };
}

function outlineToContent(
  type: "presentation" | "document",
  language: "en" | "ar",
  outline: Outline,
  theme = "default",
) {
  const dir = language === "ar" ? ("rtl" as const) : ("ltr" as const);
  if (type === "presentation") {
    return presentationContentSchema.parse({
      schemaVersion: 1,
      theme,
      slides: (outline.slides ?? []).map((s, i) => ({
        id: `s${Date.now().toString(36)}${i}`,
        title: s.title,
        subtitle: s.subtitle ?? "",
        bullets: s.bullets ?? [],
        layout: s.layout ?? "title-body",
        accentShape: s.accentShape ?? "bar",
        chart: s.chart,
        notes: s.notes ?? "",
        dir,
      })),
    });
  }
  return documentContentSchema.parse({
    schemaVersion: 1,
    blocks: (outline.blocks ?? []).map((b, i) => ({
      id: `b${Date.now().toString(36)}${i}`,
      kind: b.kind,
      level: b.kind === "heading" ? Math.min(6, Math.max(1, b.level || 2)) : undefined,
      text: b.text ?? "",
      ordered: b.kind === "list" ? Boolean(b.ordered) : undefined,
      items: b.kind === "list" ? (b.items ?? []) : undefined,
      rows: b.kind === "table" ? (b.rows ?? [["", ""]]) : undefined,
      chart: b.kind === "chart" ? b.chart : undefined,
      dir,
    })),
  });
}

export async function aiGenerateAction(input: {
  projectId: string;
  prompt: string;
  audience?: string;
  tone: string;
  length: string;
  theme?: string;
}): Promise<AiGenerateResult> {
  const user = await requireUser();
  const rl = rateLimit(`ai:${user.id}`, 10, 60_000);
  if (!rl.ok) return { ok: false, error: "rate_limited" };

  const workspaceId = await getPrimaryWorkspaceId(user.id);
  if (!workspaceId) return { ok: false, error: "not_found" };

  const parsed = generateInputSchema.safeParse({
    ...input,
    tone: input.tone || "friendly",
    length: input.length || "medium",
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const project = await getProject(user.id, parsed.data.projectId);
  if (!project) return { ok: false, error: "not_found" };

  const quota = await checkAiQuota(user.id, workspaceId);
  if (!quota.allowed) {
    await audit(user.id, "ai.quota_denied", { projectId: parsed.data.projectId });
    return { ok: false, error: "quota_exceeded", used: quota.used, limit: quota.limit };
  }

  const language = project.language === "ar" ? "ar" : "en";
  const provider = getAiProvider();

  try {
    const outline = await provider.generateOutline(parsed.data, project.type, language);
    const idem = `gen:${parsed.data.projectId}:${user.id}:${Math.floor(Date.now() / 1000)}`;

    const current = (project.content ?? {}) as { theme?: string };
    const theme = parsed.data.theme || current.theme || "default";
    const content = outlineToContent(project.type, language, outline, theme);

    const res = await updateProject(user.id, project.id, { content });
    if (!res.ok) return { ok: false, error: "failed" };

    await recordJob({
      userId: user.id,
      projectId: project.id,
      operation: project.type === "presentation" ? "generate_content" : "generate_outline",
      provider: provider.name,
      model: provider.model,
      status: "succeeded",
    });
    await recordAiUsage(user.id, idem);
    const usage = await getMonthlyUsage(user.id, workspaceId);
    revalidatePath(`/projects/${project.id}`);
    return { ok: true, content, used: usage.used, limit: usage.limit, providerDemo: provider.isDemo };
  } catch (e) {
    await recordJob({
      userId: user.id,
      projectId: project.id,
      operation: "generate_content",
      provider: provider.name,
      model: provider.model,
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: "failed" };
  }
}

export type AiPreviewOutlineResult =
  | { ok: true; outline: Outline; providerDemo: boolean; used: number; limit: number }
  | {
      ok: false;
      error: "not_found" | "invalid_input" | "quota_exceeded" | "rate_limited" | "failed";
      used?: number;
      limit?: number;
    };

/** Step 1 of the AI-first creation wizard: preview an editable outline before creating. */
export async function aiPreviewOutlineAction(input: {
  type: "presentation" | "document";
  language: "en" | "ar";
  prompt: string;
  audience?: string;
  tone: string;
  length: string;
  theme?: string;
}): Promise<AiPreviewOutlineResult> {
  const user = await requireUser();
  const rl = rateLimit(`ai:${user.id}`, 10, 60_000);
  if (!rl.ok) return { ok: false, error: "rate_limited" };

  const workspaceId = await getPrimaryWorkspaceId(user.id);
  if (!workspaceId) return { ok: false, error: "not_found" };

  const parsed = generateInputSchema.safeParse({
    projectId: "00000000-0000-0000-0000-000000000000",
    prompt: input.prompt,
    audience: input.audience,
    tone: input.tone || "friendly",
    length: input.length || "medium",
    theme: input.theme,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const quota = await checkAiQuota(user.id, workspaceId);
  if (!quota.allowed) {
    await audit(user.id, "ai.quota_denied", { action: "preview_outline" });
    return { ok: false, error: "quota_exceeded", used: quota.used, limit: quota.limit };
  }

  const provider = getAiProvider();
  try {
    const outline = await provider.generateOutline(
      parsed.data,
      input.type,
      input.language === "ar" ? "ar" : "en",
    );
    await recordJob({
      userId: user.id,
      operation: "generate_outline",
      provider: provider.name,
      model: provider.model,
      status: "succeeded",
    });
    await recordAiUsage(user.id);
    const usage = await getMonthlyUsage(user.id, workspaceId);
    return {
      ok: true,
      outline,
      providerDemo: provider.isDemo,
      used: usage.used,
      limit: usage.limit,
    };
  } catch (e) {
    await recordJob({
      userId: user.id,
      operation: "generate_outline",
      provider: provider.name,
      model: provider.model,
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: "failed" };
  }
}

/** Step 2 of the AI-first creation wizard: persist reviewed outline as a new project. */
export async function aiCreateProjectFromOutlineAction(input: {
  title: string;
  type: "presentation" | "document";
  language: "en" | "ar";
  theme?: string;
  outline: Outline;
}): Promise<{ ok: true; projectId: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const workspaceId = await getPrimaryWorkspaceId(user.id);
  if (!workspaceId) return { ok: false, error: "not_found" };

  const parsedOutline = outlineSchema.safeParse(input.outline);
  if (!parsedOutline.success) return { ok: false, error: "invalid_input" };

  const title = input.title.trim() || parsedOutline.data.title;
  const created = await createProject(user.id, workspaceId, {
    title: title.slice(0, 200),
    type: input.type,
    language: input.language,
  });
  if (!created.ok) return { ok: false, error: created.error };

  const content = outlineToContent(
    input.type,
    input.language,
    parsedOutline.data,
    input.theme || "default",
  );
  const updated = await updateProject(user.id, created.id, { content });
  if (!updated.ok) return { ok: false, error: updated.error ?? "failed" };

  revalidatePath("/dashboard");
  return { ok: true, projectId: created.id };
}

export type AiEditResult =
  | { ok: true; text: string; used: number; limit: number }
  | {
      ok: false;
      error: "invalid_input" | "quota_exceeded" | "not_found" | "rate_limited" | "failed";
      used?: number;
      limit?: number;
    };

/** Runs an AI text operation; the CLIENT applies the result and can undo (editor keeps prior content). */
export async function aiEditAction(input: {
  projectId: string;
  operation: string;
  text: string;
  targetLang?: string;
}): Promise<AiEditResult> {
  const user = await requireUser();
  const rl = rateLimit(`ai-edit:${user.id}`, 20, 60_000);
  if (!rl.ok) return { ok: false, error: "rate_limited" };

  const workspaceId = await getPrimaryWorkspaceId(user.id);
  if (!workspaceId) return { ok: false, error: "not_found" };

  const opEnum = ["rewrite", "shorten", "expand", "translate", "tone"] as const;
  if (!opEnum.includes(input.operation as AiOperation)) return { ok: false, error: "invalid_input" };

  const parsed = editInputSchema.safeParse({
    ...input,
    operation: input.operation,
    targetLang: input.targetLang ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const project = await getProject(user.id, parsed.data.projectId);
  if (!project) return { ok: false, error: "not_found" };

  const quota = await checkAiQuota(user.id, workspaceId);
  if (!quota.allowed) return { ok: false, error: "quota_exceeded", used: quota.used, limit: quota.limit };

  const provider = getAiProvider();
  try {
    const res = await provider.editText(parsed.data);
    await recordJob({
      userId: user.id,
      projectId: project.id,
      operation: "edit_block",
      provider: provider.name,
      model: provider.model,
      status: "succeeded",
    });
    await recordAiUsage(user.id);
    const usage = await getMonthlyUsage(user.id, workspaceId);
    return { ok: true, text: res.text, used: usage.used, limit: usage.limit };
  } catch (e) {
    await recordJob({
      userId: user.id,
      projectId: project.id,
      operation: "edit_block",
      provider: provider.name,
      model: provider.model,
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: "failed" };
  }
}
