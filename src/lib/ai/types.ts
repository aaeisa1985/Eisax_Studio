import { z } from "zod";
import { slideAccentShapeSchema, slideLayoutSchema } from "@/lib/validation/projects";

export const aiOperationSchema = z.enum(["rewrite", "shorten", "expand", "translate", "tone"]);
export type AiOperation = z.infer<typeof aiOperationSchema>;

export const generateInputSchema = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().trim().min(3).max(2000),
  audience: z.string().trim().max(200).optional(),
  tone: z.enum(["friendly", "formal", "persuasive", "educational"]).default("friendly"),
  length: z.enum(["short", "medium", "long"]).default("medium"),
  theme: z.string().trim().max(40).optional(),
});
export type GenerateInput = z.infer<typeof generateInputSchema>;

export const editInputSchema = z.object({
  projectId: z.string().uuid(),
  operation: aiOperationSchema,
  text: z.string().trim().min(1).max(20000),
  targetLang: z.enum(["en", "ar"]).optional(),
});
export type EditInput = z.infer<typeof editInputSchema>;

export const outlineSlideSchema = z.object({
  title: z.string().max(500),
  subtitle: z.string().max(1000).default(""),
  bullets: z.array(z.string().max(500)).max(12).default([]),
  layout: slideLayoutSchema.default("title-body"),
  accentShape: slideAccentShapeSchema.default("bar"),
  chart: z
    .object({
      kind: z.enum(["bar", "line", "pie"]),
      title: z.string().max(200),
      categories: z.array(z.string().max(60)).min(2).max(10),
      values: z.array(z.number().finite()).min(2).max(10),
      unit: z.string().max(20).optional(),
    })
    .refine((d) => d.categories.length === d.values.length)
    .optional(),
  notes: z.string().max(5000).default(""),
});
export type OutlineSlide = z.infer<typeof outlineSlideSchema>;

export const outlineBlockSchema = z.object({
  kind: z.enum(["heading", "paragraph", "list", "table", "quote", "chart"]),
  level: z.number().int().min(0).max(6).default(0),
  text: z.string().max(20000).default(""),
  ordered: z.boolean().optional(),
  items: z.array(z.string().max(2000)).max(100).optional(),
  rows: z.array(z.array(z.string().max(1000)).max(12)).max(50).optional(),
  chart: z
    .object({
      kind: z.enum(["bar", "line", "pie"]),
      title: z.string().max(200),
      categories: z.array(z.string().max(60)).min(2).max(10),
      values: z.array(z.number().finite()).min(2).max(10),
      unit: z.string().max(20).optional(),
    })
    .refine((d) => d.categories.length === d.values.length)
    .optional(),
});
export type OutlineBlock = z.infer<typeof outlineBlockSchema>;

export const outlineSchema = z.object({
  title: z.string().min(1).max(200),
  language: z.enum(["en", "ar"]),
  slides: z.array(outlineSlideSchema).optional(),
  blocks: z.array(outlineBlockSchema).optional(),
});
export type Outline = z.infer<typeof outlineSchema>;

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  /** Human-readable label for the UI; demo provider must self-identify. */
  readonly isDemo: boolean;
  generateOutline(
    input: GenerateInput,
    type: "presentation" | "document",
    language: "en" | "ar",
  ): Promise<Outline>;
  editText(input: EditInput): Promise<{ text: string }>;
}
