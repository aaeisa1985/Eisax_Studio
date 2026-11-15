import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildPptx } from "@/lib/export/pptx";
import { buildDocx } from "@/lib/export/docx";
import { getDb } from "@/lib/db";
import { users, workspaces, workspaceMembers, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createProject } from "@/lib/projects/service";

const suffix = Date.now().toString(36);

async function seedProject(type: "presentation" | "document", content: unknown, title: string): Promise<string> {
  const db = await getDb();
  const email = `export-${type}-${suffix}@test.dev`;
  const u = (await db.insert(users).values({ email, passwordHash: "x", displayName: "E" }).returning())[0]!;
  const w = (await db.insert(workspaces).values({ name: "ws", ownerId: u.id }).returning())[0]!;
  await db.insert(workspaceMembers).values({ workspaceId: w.id, userId: u.id, role: "owner" });
  const p = (
    await db
      .insert(projects)
      .values({ workspaceId: w.id, ownerId: u.id, type, title, content })
      .returning()
  )[0]!;
  return p.id;
}

describe("PPTX export (real OOXML inspection)", () => {
  it("contains ordered slides with editable text runs", async () => {
    const res = await buildPptx("Solar Overview", {
      schemaVersion: 1,
      theme: "default",
      slides: [
        { id: "s1", title: "First Slide Title", subtitle: "First subtitle", notes: "Speaker note one", dir: "ltr" },
        { id: "s2", title: "عنوان الشريحة الثانية", subtitle: "نص عربي", notes: "", dir: "rtl" },
        { id: "s3", title: "Third", subtitle: "", notes: "", dir: "ltr" },
      ],
    });
    expect("error" in res).toBe(false);
    const { data, fileName } = res as { fileName: string; data: Buffer };
    expect(fileName.endsWith(".pptx")).toBe(true);
    expect(data.length).toBeGreaterThan(5000);

    const zip = await JSZip.loadAsync(data);
    // Structure: exactly 3 slide parts + presentation rels referencing them in order
    const slideNames = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    expect(slideNames.length).toBe(3);
    const presXml = await zip.file("ppt/presentation.xml")!.async("string");
    const idList = presXml.match(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/)?.[0] ?? "";
    expect((idList.match(/<p:sldId /g) ?? []).length).toBe(3);

    const s1 = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(s1).toContain("<a:t>First Slide Title</a:t>"); // editable text run
    expect(s1).toContain("<a:t>First subtitle</a:t>");
    const notes = Object.keys(zip.files).filter((n) => n.startsWith("ppt/notesSlides/notesSlide"));
    expect(notes.length).toBeGreaterThanOrEqual(1);
    const n1 = await zip.file("ppt/notesSlides/notesSlide1.xml")!.async("string");
    expect(n1).toContain("Speaker note one");

    const s2 = await zip.file("ppt/slides/slide2.xml")!.async("string");
    expect(s2).toContain("<a:t>عنوان الشريحة الثانية</a:t>");
    expect(s2).toContain('rtl="1"'); // RTL mode persisted
  });

  it("rejects invalid slide content", async () => {
    const res = await buildPptx("Bad", { slides: "nope" });
    expect(res).toEqual({ error: "invalid_content" });
  });
});

describe("DOCX export (real OOXML inspection)", () => {
  it("contains semantic headings, paragraphs and bidi text", async () => {
    const res = await buildDocx("التقرير السنوي", {
      schemaVersion: 1,
      blocks: [
        { id: "b1", kind: "heading", level: 1, text: "Annual Report", dir: "ltr" },
        { id: "b2", kind: "paragraph", text: "Mixed English داخل فقرة عربية.", dir: "rtl" },
        { id: "b3", kind: "heading", level: 2, text: "ملخص تنفيذي", dir: "rtl" },
        { id: "b4", kind: "paragraph", text: "Plain paragraph.", dir: "ltr" },
      ],
    });
    expect("error" in res).toBe(false);
    const { data, fileName } = res as { fileName: string; data: Buffer };
    expect(fileName.endsWith(".docx")).toBe(true);

    const zip = await JSZip.loadAsync(data);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Annual Report");
    expect(xml).toContain("Plain paragraph.");
    expect(xml).toContain("ملخص تنفيذي");
    expect((xml.match(/<w:pStyle w:val="Heading[12]"\/>/g) ?? []).length).toBe(2);
    // bidi paragraphs present for RTL blocks
    expect(xml).toContain("<w:bidi/>");
    expect(xml).toContain("Mixed English");
  });

  it("rejects invalid block content", async () => {
    const res = await buildDocx("Bad", { blocks: [{ kind: 42 }] });
    expect(res).toEqual({ error: "invalid_content" });
  });
});

describe("export tenancy via project service", () => {
  it("a stranger cannot reach the project that would feed an export", async () => {
    const id = await seedProject("presentation", {
      schemaVersion: 1,
      theme: "default",
      slides: [{ id: "s1", title: "Secret", subtitle: "", notes: "", dir: "ltr" }],
    }, "Secret Deck");
    const db = await getDb();
    const { getProject } = await import("@/lib/projects/service");
    const other = (
      await db
        .insert(users)
        .values({ email: `exporter-stranger-${suffix}@test.dev`, passwordHash: "x", displayName: "S" })
        .returning()
    )[0]!;
    const w2 = (await db.insert(workspaces).values({ name: "w2", ownerId: other.id }).returning())[0]!;
    await db.insert(workspaceMembers).values({ workspaceId: w2.id, userId: other.id, role: "owner" });
    expect(await getProject(other.id, id)).toBeNull();
    // cleanup stranger workspace keeps test data small
    await db.delete(workspaces).where(eq(workspaces.id, w2.id));
    void id;
  });
});
