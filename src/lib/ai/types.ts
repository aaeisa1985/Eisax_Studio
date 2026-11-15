import { z } from "zod";

export const aiOperationSchema = z.enum(["rewrite", "shorten", "expand", "translate", "tone"]);
export type AiOperation = z.infer<typeof aiOperationSchema>;

export const generateInputSchema = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().trim().min(3).max(2000),
  tone: z.enum(["friendly", "formal", "persuasive", "educational"]).default("friendly"),
  length: z.enum(["short", "medium", "long"]).default("medium"),
});
export type GenerateInput = z.infer<typeof generateInputSchema>;

export const editInputSchema = z.object({
  projectId: z.string().uuid(),
  operation: aiOperationSchema,
  text: z.string().trim().min(1).max(20000),
  targetLang: z.enum(["en", "ar"]).optional(),
});
export type EditInput = z.infer<typeof editInputSchema>;

export type OutlineSlide = { title: string; subtitle: string; notes: string };
export type OutlineBlock = { kind: "heading" | "paragraph"; level: number; text: string };
export type Outline = { title: string; language: "en" | "ar"; slides?: OutlineSlide[]; blocks?: OutlineBlock[] };

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  /** Human-readable label for the UI; demo provider must self-identify. */
  readonly isDemo: boolean;
  generateOutline(input: GenerateInput, type: "presentation" | "document", language: "en" | "ar"): Promise<Outline>;
  editText(input: EditInput): Promise<{ text: string }>;
}
