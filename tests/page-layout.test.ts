import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { getPageGeometry } from "@/lib/document/pageGeometry";
import { buildDocx } from "@/lib/export/docx";

describe("physical page layout", () => {
  it.each(["a4", "letter"] as const)("swaps %s dimensions without changing margins", (size) => {
    const portrait = getPageGeometry({ size, orientation: "portrait", margins: "normal" });
    const landscape = getPageGeometry({ size, orientation: "landscape", margins: "normal" });
    expect(landscape.widthPx).toBe(portrait.heightPx);
    expect(landscape.heightPx).toBe(portrait.widthPx);
    expect(portrait.contentWidthPx).toBe(portrait.widthPx - 192);
  });

  it.each(["narrow", "normal", "wide"] as const)("uses the same %s margin in editing and DOCX", async (margins) => {
    const layout = { size: "a4", orientation: "portrait", margins } as const;
    const geometry = getPageGeometry(layout);
    const out = await buildDocx("", { pageLayout: layout, blocks: [{ id: "p", kind: "paragraph", text: "Page content" }] });
    if ("error" in out) throw new Error(out.error);
    const xml = await (await JSZip.loadAsync(out.data)).file("word/document.xml")!.async("string");
    // OOXML twips: 1440/in; CSS pixels: 96/in.
    expect(xml).toContain(`w:top="${geometry.marginPx * 15}"`);
    expect(xml).toContain(`w:left="${geometry.marginPx * 15}"`);
    expect(geometry.contentHeightPx).toBeGreaterThan(0);
  });
});
