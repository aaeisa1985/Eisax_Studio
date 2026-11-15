"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/actions";
import { getPrimaryWorkspaceId } from "@/lib/auth/session";
import { getAiProvider } from "@/lib/ai";
import { generateInputSchema, editInputSchema } from "@/lib/ai/types";
import { getProject, updateProject } from "@/lib/projects/service";
import { checkAiQuota, recordAiUsage, recordJob, getMonthlyUsage } from "@/lib/billing/usage";
import { rateLimit } from "@/lib/security/rateLimit";
import { audit } from "@/lib/security/audit";
import {
  documentContentSchema,
  presentationContentSchema,
} from "@/lib/validation/projects";
import type { AiOperation } from "@/lib/ai/types";

export type AiGenerateResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "invalid_input" | "quota_exceeded" | "rate_limited" | "failed"; used?: number; limit?: number };

export async function getAiUsageAction(): Promise<{ used: number; limit: number }> {
  const user = await requireUser();
  const usage = await getMonthlyUsage(user.id);
  return { used: usage.used, limit: usage.limit };
}

export async function aiGenerateAction(input: {
  projectId: string;
  prompt: string;
  tone: string;
  length: string;
}): Promise<AiGenerateResult> {
  const user = await requireUser();
  const rl = rateLimit(`ai:${user.id}`, 10, 60_000);
  if (!rl.ok) return { ok: false, error: "rate_limited" };

  const workspaceId = await getPrimaryWorkspaceId(user.id);
  if (!workspaceId) return { ok: false, error: "not_found" };

  const parsed = generateInputSchema.safeParse({ ...input, tone: input.tone || "friendly", length: input.length || "medium" });
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

    let content: unknown;
    if (project.type === "presentation") {
      const current = (project.content ?? {}) as { theme?: string };
      content = presentationContentSchema.parse({
        schemaVersion: 1,
        theme: current.theme ?? "default",
        slides: (outline.slides ?? []).map((s, i) => ({
          id: `s${Date.now().toString(36)}${i}`,
          title: s.title,
          subtitle: s.subtitle,
          notes: s.notes,
          dir: language === "ar" ? "rtl" : "ltr",
        })),
      });
    } else {
      content = documentContentSchema.parse({
        schemaVersion: 1,
        blocks: (outline.blocks ?? []).map((b, i) => ({
          id: `b${Date.now().toString(36)}${i}`,
          kind: b.kind,
          level: b.kind === "heading" ? b.level : undefined,
          text: b.text,
          dir: language === "ar" ? "rtl" : "ltr",
        })),
      });
    }

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
    revalidatePath(`/projects/${project.id}`);
    return { ok: true };
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

export type AiEditResult =
  | { ok: true; text: string }
  | { ok: false; error: "invalid_input" | "quota_exceeded" | "not_found" | "rate_limited" | "failed"; used?: number; limit?: number };

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

  const parsed = editInputSchema.safeParse({ ...input, operation: input.operation, targetLang: input.targetLang ?? undefined });
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
    return { ok: true, text: res.text };
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
