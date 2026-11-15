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

export const chartKindSchema = z.enum(["bar", "line", "pie"]);
export type ChartKind = z.infer<typeof chartKindSchema>;

export const chartDataSchema = z
  .object({
    kind: chartKindSchema,
    title: z.string().max(200),
    categories: z.array(z.string().max(60)).min(2).max(10),
    values: z.array(z.number().finite()).min(2).max(10),
    unit: z.string().max(20).optional(),
  })
  .refine((d) => d.categories.length === d.values.length, {
    message: "Chart categories and values must have the same length",
  });
export type ChartData = z.infer<typeof chartDataSchema>;

export const safeUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (val) => val === "" || /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(val),
    "URL must start with http:// or https://",
  );

export const textAlignSchema = z.enum(["left", "center", "right", "justify"]);
export type TextAlign = z.infer<typeof textAlignSchema>;

export const inlineRunSchema = z.object({
  text: z.string().max(20000),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strike: z.boolean().optional(),
  color: z.string().max(20).optional(),
  fontSize: z.number().min(8).max(72).optional(),
  href: safeUrlSchema.optional(),
});
export type InlineRun = z.infer<typeof inlineRunSchema>;

export const slideElementKindSchema = z.enum(["text", "shape", "image", "chart"]);
export type SlideElementKind = z.infer<typeof slideElementKindSchema>;

export const slideShapeTypeSchema = z.enum([
  "rect",
  "roundRect",
  "ellipse",
  "triangle",
  "line",
  "arrow",
]);
export type SlideShapeType = z.infer<typeof slideShapeTypeSchema>;

export const slideElementSchema = z.object({
  id: z.string().min(1),
  kind: slideElementKindSchema,
  x: z.number().min(-25).max(125),
  y: z.number().min(-25).max(125),
  w: z.number().min(0.5).max(150),
  h: z.number().min(0.5).max(150),
  zIndex: z.number().int().min(0).max(1000).default(1),
  rotation: z.number().min(-360).max(360).optional(),
  text: z.string().max(20000).optional(),
  runs: z.array(inlineRunSchema).max(200).optional(),
  fontSize: z.number().min(8).max(120).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  color: z.string().max(20).optional(),
  align: textAlignSchema.optional(),
  valign: z.enum(["top", "middle", "bottom"]).optional(),
  dir: z.enum(["ltr", "rtl", "auto"]).optional(),
  shape: slideShapeTypeSchema.optional(),
  fillColor: z.string().max(20).optional(),
  borderColor: z.string().max(20).optional(),
  borderWidth: z.number().min(0).max(20).optional(),
  assetId: z.string().uuid().optional(),
  chart: chartDataSchema.optional(),
});
export type SlideElement = z.infer<typeof slideElementSchema>;

export const slideItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(500).default(""),
  subtitle: z.string().max(1000).default(""),
  bullets: z.array(z.string().max(500)).max(12).default([]),
  layout: slideLayoutSchema.default("title-body"),
  accentShape: slideAccentShapeSchema.default("bar"),
  imageAssetId: z.string().uuid().optional(),
  imageCaption: z.string().max(300).optional(),
  chart: chartDataSchema.optional(),
  bgColor: z.string().max(20).optional(),
  elements: z.array(slideElementSchema).max(100).optional(),
  notes: z.string().max(5000).default(""),
  dir: z.enum(["ltr", "rtl"]).default("ltr"),
});

export type SlideItem = z.infer<typeof slideItemSchema>;

export const presentationContentSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  theme: z.string().default("default"),
  slides: z.array(slideItemSchema).max(60).default([]),
  fidelityWarnings: z.array(z.string().max(500)).max(50).optional(),
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
  "chart",
]);
export type DocumentBlockKind = z.infer<typeof documentBlockKindSchema>;

export const pageLayoutSchema = z.object({
  size: z.enum(["a4", "letter"]).default("a4"),
  orientation: z.enum(["portrait", "landscape"]).default("portrait"),
  margins: z.enum(["normal", "narrow", "wide"]).default("normal"),
});
export type PageLayout = z.infer<typeof pageLayoutSchema>;

export const documentBlockSchema = z.object({
  id: z.string().min(1),
  kind: documentBlockKindSchema,
  level: z.number().int().min(1).max(6).optional(),
  text: z.string().max(20000).default(""),
  runs: z.array(inlineRunSchema).max(500).optional(),
  align: textAlignSchema.optional(),
  ordered: z.boolean().optional(),
  items: z.array(z.string().max(2000)).max(100).optional(),
  listRuns: z.array(z.array(inlineRunSchema).max(200)).max(100).optional(),
  rows: z.array(z.array(z.string().max(1000)).max(12)).max(50).optional(),
  url: safeUrlSchema.optional(),
  assetId: z.string().uuid().optional(),
  chart: chartDataSchema.optional(),
  dir: z.enum(["ltr", "rtl"]).default("ltr"),
});

export type DocumentBlock = z.infer<typeof documentBlockSchema>;

export const documentContentSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  blocks: z.array(documentBlockSchema).max(500).default([]),
  pageLayout: pageLayoutSchema.optional(),
  fidelityWarnings: z.array(z.string().max(500)).max(50).optional(),
});

export type DocumentContent = z.infer<typeof documentContentSchema>;
