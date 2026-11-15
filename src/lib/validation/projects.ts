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

/** Placeholder content shells; full per-type schemas land in Phases 2/4. */
export const presentationContentSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  theme: z.string().default("default"),
  slides: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().max(500),
        subtitle: z.string().max(1000).default(""),
        notes: z.string().max(5000).default(""),
        dir: z.enum(["ltr", "rtl"]).default("ltr"),
      }),
    )
    .default([]),
});

export const documentContentSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  blocks: z
    .array(
      z.object({
        id: z.string().min(1),
        kind: z.enum(["heading", "paragraph"]),
        level: z.number().int().min(1).max(6).optional(),
        text: z.string().max(20000).default(""),
        dir: z.enum(["ltr", "rtl"]).default("ltr"),
      }),
    )
    .default([]),
});
