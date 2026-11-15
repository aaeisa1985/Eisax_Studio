import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(320);

export const passwordSchema = z.string().min(10).max(200);

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(80),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().max(200),
});

export const projectTypeSchema = z.enum(["presentation", "document"]);

export const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(200),
  type: projectTypeSchema,
  language: z.enum(["en", "ar"]).default("en"),
});

export const updateProjectSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  language: z.enum(["en", "ar"]).optional(),
  content: z.unknown().optional(), // validated per type below
});

export const projectSearchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  type: projectTypeSchema.optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const slideLayoutSchema = z.enum(["title", "title-body", "two-col", "quote"]);
export type SlideLayout = z.infer<typeof slideLayoutSchema>;

export const slideAccentShapeSchema = z.enum(["none", "bar", "card", "badge"]);
export type SlideAccentShape = z.infer<typeof slideAccentShapeSchema>;

export const slideThemeSchema = z.enum(["default", "obsidian", "sky", "gold", "light"]);

export const slideItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(500),
  subtitle: z.string().max(1000).default(""),
  bullets: z.array(z.string().max(500)).max(12).default([]),
  layout: slideLayoutSchema.default("title-body"),
  accentShape: slideAccentShapeSchema.default("bar"),
  imageAssetId: z.string().uuid().optional(),
  imageCaption: z.string().max(300).optional(),
  notes: z.string().max(5000).default(""),
  dir: z.enum(["ltr", "rtl"]).default("ltr"),
});

export type SlideItem = z.infer<typeof slideItemSchema>;

export const presentationContentSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  theme: z.string().default("default"),
  slides: z.array(slideItemSchema).max(60).default([]),
});

export type PresentationContent = z.infer<typeof presentationContentSchema>;

export const documentBlockKindSchema = z.enum([
  "heading",
  "paragraph",
  "list",
  "table",
  "quote",
  "link",
  "image",
]);
export type DocumentBlockKind = z.infer<typeof documentBlockKindSchema>;

export const safeUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (val) => val === "" || /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(val),
    "URL must start with http:// or https://",
  );

export const documentBlockSchema = z.object({
  id: z.string().min(1),
  kind: documentBlockKindSchema,
  level: z.number().int().min(1).max(6).optional(),
  text: z.string().max(20000).default(""),
  ordered: z.boolean().optional(),
  items: z.array(z.string().max(2000)).max(100).optional(),
  rows: z.array(z.array(z.string().max(1000)).max(12)).max(50).optional(),
  url: safeUrlSchema.optional(),
  assetId: z.string().uuid().optional(),
  dir: z.enum(["ltr", "rtl"]).default("ltr"),
});

export type DocumentBlock = z.infer<typeof documentBlockSchema>;

export const documentContentSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  blocks: z.array(documentBlockSchema).max(200).default([]),
});

export type DocumentContent = z.infer<typeof documentContentSchema>;
