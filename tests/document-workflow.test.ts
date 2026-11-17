import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { blocksToTiptapDoc, tiptapDocToBlocks } from "@/lib/document/tiptapSync";
import { buildDocx } from "@/lib/export/docx";
import { importDocx } from "@/lib/import/docx";
import type { DocumentContent } from "@/lib/validation/projects";

describe("document workflow persistence", () => {
  it("preserves a manual break and paragraph formatting through editing and DOCX", async () => {
    const content: DocumentContent = { schemaVersion: 1, pageLayout: { size: "a4", orientation: "portrait", margins: "normal", headerText: "Private", footerText: "Draft", showPageNumbers: true }, blocks: [
      { id: "p", kind: "paragraph", text: "First", dir: "ltr", lineHeight: 1.5, indent: 24 },
      { id: "b", kind: "pageBreak", text: "", dir: "ltr" },
      { id: "q", kind: "paragraph", text: "Second", dir: "ltr" },
    ] };
    const blocks = tiptapDocToBlocks(blocksToTiptapDoc(content.blocks));
    expect(blocks.map(b => b.kind)).toEqual(["paragraph", "pageBreak", "paragraph"]);
    expect(blocks[0]).toMatchObject({ lineHeight: 1.5, indent: 24 });
    const result = await buildDocx("Test", { ...content, blocks });
    if ("error" in result) throw new Error(result.error);
    const zip = await JSZip.loadAsync(result.data);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain('w:type="page"');
    expect(await zip.file("word/header1.xml")!.async("string")).toContain("Private");
    expect(await zip.file("word/footer1.xml")!.async("string")).toContain("Draft");
    const imported = await importDocx(result.data);
    expect(imported.content.blocks.map(b => b.kind)).toContain("pageBreak");
    expect(imported.content.pageLayout).toMatchObject({ headerText: "Private", footerText: "Draft", showPageNumbers: true });
    expect(imported.content.blocks.find(b => b.text === "First")).toMatchObject({ lineHeight: 1.5, indent: 24 });
  });
});

