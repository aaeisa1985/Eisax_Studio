import crypto from "node:crypto";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { blocksToTiptapDoc, tiptapDocToBlocks } from "@/lib/document/tiptapSync";
import { buildDocx } from "@/lib/export/docx";
import { buildPptx } from "@/lib/export/pptx";
import { importDocx } from "@/lib/import/docx";
import { importPptx } from "@/lib/import/pptx";
import { slideToCanvasElements } from "@/lib/presentation/elements";
import { resolveSlideTheme } from "@/lib/projects/themes";
import type { AssetResolver } from "@/lib/storage/assets";
import type { DocumentBlock, DocumentContent, PresentationContent } from "@/lib/validation/projects";

// Minimal valid 1x1 transparent PNG
const SAMPLE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN9sAAAAASUVORK5CYII=",
  "base64",
);

function makeMemoryAssets() {
  const store = new Map<string, { mimeType: string; data: Buffer }>();
  const seed = (mimeType: string, data: Buffer): string => {
    const id = crypto.randomUUID();
    store.set(id, { mimeType, data });
    return id;
  };
  const saveAsset = async ({ bytes }: { bytes: Buffer; originalName?: string }) => {
    const id = crypto.randomUUID();
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const isWebp =
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP";
    if (!isPng && !isJpeg && !isWebp) return null;
    store.set(id, {
      mimeType: isPng ? "image/png" : isJpeg ? "image/jpeg" : "image/webp",
      data: bytes,
    });
    return id;
  };
  const resolveAsset: AssetResolver = async (id) => store.get(id) ?? null;
  return { store, seed, saveAsset, resolveAsset };
}

describe("Phase 6 Office Round-Trip Compatibility", () => {
  it("round-trips a real .docx with rich formatting, lists, tables, RTL Arabic, images, and page layout across import -> edit -> export -> reopen", async () => {
    const assets = makeMemoryAssets();
    const initialAssetId = assets.seed("image/png", SAMPLE_PNG);

    const initialDoc: DocumentContent = {
      schemaVersion: 1,
      pageLayout: {
        size: "letter",
        orientation: "landscape",
        margins: "narrow",
      },
      blocks: [
        { id: "h1", kind: "heading", level: 1, text: "Quarterly Engineering Review", align: "center", dir: "ltr" },
        {
          id: "p1",
          kind: "paragraph",
          text: "Status: Green and Accelerated",
          align: "left",
          dir: "ltr",
          runs: [
            { text: "Status: " },
            { text: "Green", bold: true, color: "0D9488", fontSize: 13 },
            { text: " and " },
            { text: "Accelerated", italic: true, underline: true },
          ],
        },
        {
          id: "p-ar",
          kind: "paragraph",
          text: "مرحباً بكم في EISAX Studio للمستندات",
          dir: "rtl",
          align: "right",
        },
        {
          id: "l-ord",
          kind: "list",
          ordered: true,
          text: "",
          items: ["First milestone", "Second milestone"],
          dir: "ltr",
        },
        {
          id: "l-bul",
          kind: "list",
          ordered: false,
          text: "",
          items: ["نقطة عربية أولى", "Mixed EN point"],
          dir: "rtl",
        },
        {
          id: "tbl-1",
          kind: "table",
          text: "",
          rows: [
            ["Region", "Active Teams"],
            ["MENA", "42"],
          ],
          dir: "ltr",
        },
        {
          id: "lnk-1",
          kind: "link",
          text: "EISAX Portal",
          url: "https://eisax.example.com/portal",
          dir: "ltr",
        },
        {
          id: "img-1",
          kind: "image",
          text: "Architecture diagram",
          assetId: initialAssetId,
          dir: "ltr",
        },
      ],
    };

    const built1 = await buildDocx("Quarterly Review", initialDoc, assets.resolveAsset);
    expect("data" in built1).toBe(true);
    const buf1 = (built1 as { data: Buffer }).data;

    // Step 1: Import generated DOCX
    const imported1 = await importDocx(buf1, assets.saveAsset);
    expect(imported1.content.blocks.length).toBeGreaterThanOrEqual(7);
    expect(imported1.content.pageLayout?.size).toBe("letter");
    expect(imported1.content.pageLayout?.orientation).toBe("landscape");
    expect(imported1.content.pageLayout?.margins).toBe("narrow");

    const h1 = imported1.content.blocks.find((b) => b.kind === "heading");
    expect(h1?.text).toContain("Quarterly Engineering Review");
    expect(h1?.align).toBe("center");

    const richP = imported1.content.blocks.find((b) => b.kind === "paragraph" && b.text.includes("Accelerated"));
    expect(richP).toBeDefined();
    expect(richP?.runs?.some((r) => r.bold && r.color === "0D9488")).toBe(true);
    expect(richP?.runs?.some((r) => r.italic && r.underline)).toBe(true);

    const arPara = imported1.content.blocks.find((b) => b.text.includes("مرحباً بكم"));
    expect(arPara?.dir).toBe("rtl");

    const orderedList = imported1.content.blocks.find((b) => b.kind === "list" && b.ordered);
    expect(orderedList?.items).toEqual(["First milestone", "Second milestone"]);

    const bulletList = imported1.content.blocks.find((b) => b.kind === "list" && !b.ordered);
    expect(bulletList?.items?.some((x) => x.includes("نقطة عربية"))).toBe(true);

    const table = imported1.content.blocks.find((b) => b.kind === "table");
    expect(table?.rows?.[1]).toEqual(["MENA", "42"]);

    const img = imported1.content.blocks.find((b) => b.kind === "image");
    expect(img?.assetId).toBeDefined();
    expect(img?.assetId).not.toBe(initialAssetId); // freshly extracted into workspace assets

    // Step 2: Simulate user editing imported DOCX content
    const editedBlocks: DocumentBlock[] = [
      ...imported1.content.blocks,
      {
        id: "edited-add",
        kind: "paragraph",
        text: "Post-import user edit",
        runs: [{ text: "Post-import user edit", bold: true, strike: true }],
        dir: "ltr",
      },
    ];
    const editedTable = editedBlocks.find((b) => b.kind === "table");
    if (editedTable?.rows) {
      editedTable.rows.push(["EU", "19"]);
    }

    const built2 = await buildDocx(
      imported1.title,
      { ...imported1.content, blocks: editedBlocks },
      assets.resolveAsset,
    );
    expect("data" in built2).toBe(true);
    const buf2 = (built2 as { data: Buffer }).data;

    // Step 3: Reopen edited DOCX and verify edits persisted
    const reopened = await importDocx(buf2, assets.saveAsset);
    expect(reopened.content.blocks.some((b) => b.text.includes("Post-import user edit"))).toBe(true);
    const addedPara = reopened.content.blocks.find((b) => b.text.includes("Post-import user edit"));
    expect(addedPara?.runs?.some((r) => r.bold && r.strike)).toBe(true);
    const reopenedTable = reopened.content.blocks.find((b) => b.kind === "table");
    expect(reopenedTable?.rows?.[2]).toEqual(["EU", "19"]);
  });

  it("reports explicit fidelityWarnings when importing .docx with headers, footnotes, and OMML formulas", async () => {
    const built = await buildDocx("Base", {
      schemaVersion: 1,
      blocks: [{ id: "p1", kind: "paragraph", text: "Core body text", dir: "ltr" }],
    });
    const zip = await JSZip.loadAsync((built as { data: Buffer }).data);
    zip.file("word/header1.xml", `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Confidential Header</w:t></w:r></w:p></w:hdr>`);
    zip.file("word/footnotes.xml", `<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:footnote w:id="1"><w:p><w:r><w:t>Fn</w:t></w:r></w:p></w:footnote></w:footnotes>`);
    const docXml = await zip.file("word/document.xml")!.async("string");
    zip.file(
      "word/document.xml",
      docXml.replace("</w:body>", `<w:p><m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:r><m:t>E=mc^2</m:t></m:r></m:oMath></w:p></w:body>`),
    );
    const mutatedBuf = await zip.generateAsync({ type: "nodebuffer" });

    const imported = await importDocx(mutatedBuf);
    expect(imported.warnings.some((w) => w.toLowerCase().includes("header"))).toBe(true);
    expect(imported.warnings.some((w) => w.toLowerCase().includes("footnote"))).toBe(true);
    expect(imported.warnings.some((w) => w.toLowerCase().includes("equation"))).toBe(true);
    expect(imported.content.fidelityWarnings).toEqual(imported.warnings);
  });

  it("round-trips a real .pptx with positioned shapes, formatted runs, images, notes, and RTL across import -> edit -> export -> reopen", async () => {
    const assets = makeMemoryAssets();
    const imgId = assets.seed("image/png", SAMPLE_PNG);

    const initialDeck: PresentationContent = {
      schemaVersion: 1,
      theme: "light",
      slides: [
        {
          id: "s1",
          title: "Product Roadmap",
          subtitle: "",
          bullets: [],
          layout: "title-body",
          accentShape: "none",
          notes: "Discuss Q3 launch timeline carefully.",
          bgColor: "F8FAFC",
          dir: "ltr",
          elements: [
            {
              id: "el-title",
              kind: "text",
              x: 6,
              y: 8,
              w: 60,
              h: 14,
              zIndex: 1,
              text: "Product Roadmap",
              runs: [{ text: "Product Roadmap", bold: true, fontSize: 28, color: "0F172A" }],
              align: "left",
              dir: "ltr",
            },
            {
              id: "el-shape",
              kind: "shape",
              shape: "roundRect",
              x: 8,
              y: 30,
              w: 35,
              h: 22,
              zIndex: 2,
              fillColor: "0EA5E9",
              borderColor: "0369A1",
              text: "Phase 1 Live",
              color: "FFFFFF",
              fontSize: 16,
              bold: true,
              align: "center",
              dir: "ltr",
            },
            {
              id: "el-img",
              kind: "image",
              x: 52,
              y: 26,
              w: 38,
              h: 50,
              zIndex: 3,
              assetId: imgId,
            },
          ],
        },
        {
          id: "s2",
          title: "خطة التوسع",
          subtitle: "",
          bullets: [],
          layout: "title-body",
          accentShape: "none",
          notes: "",
          bgColor: "0B1420",
          dir: "rtl",
          elements: [
            {
              id: "el-ar",
              kind: "text",
              x: 10,
              y: 20,
              w: 80,
              h: 20,
              zIndex: 1,
              text: "تغطية الشرق الأوسط وأوروبا",
              runs: [{ text: "تغطية الشرق الأوسط وأوروبا", bold: true, fontSize: 24, color: "E2E8F0" }],
              align: "right",
              dir: "rtl",
            },
          ],
        },
      ],
    };

    const built1 = await buildPptx("Roadmap", initialDeck, assets.resolveAsset);
    expect("data" in built1).toBe(true);
    const pptxBuf1 = (built1 as { data: Buffer }).data;

    // Step 1: Import generated PPTX
    const imported1 = await importPptx(pptxBuf1, assets.saveAsset);
    expect(imported1.content.slides.length).toBe(2);

    const s1 = imported1.content.slides[0]!;
    expect(s1.bgColor).toBe("F8FAFC");
    expect(s1.notes).toContain("Q3 launch timeline");
    expect(s1.elements?.some((e) => e.kind === "shape" && e.shape === "roundRect")).toBe(true);
    const impImg = s1.elements?.find((e) => e.kind === "image");
    expect(impImg?.assetId).toBeDefined();

    const s2 = imported1.content.slides[1]!;
    expect(s2.dir).toBe("rtl");
    expect(s2.bgColor).toBe("0B1420");
    expect(s2.elements?.some((e) => (e.text ?? "").includes("الشرق الأوسط"))).toBe(true);

    // Step 2: Edit imported deck (move box + add ellipse + update text + reorder zIndex)
    const editedSlides = imported1.content.slides.map((sl, idx) => {
      if (idx !== 0) return sl;
      const updatedEls = (sl.elements ?? []).map((el) =>
        el.text?.includes("Phase 1 Live")
          ? {
              ...el,
              x: 12,
              y: 55,
              zIndex: 10,
              text: "Phase 2 Shipped",
              runs: [{ text: "Phase 2 Shipped", bold: true, color: "FFFFFF", fontSize: 18 }],
            }
          : el,
      );
      updatedEls.push({
        id: "new-ellipse",
        kind: "shape",
        shape: "ellipse",
        x: 70,
        y: 10,
        w: 18,
        h: 18,
        zIndex: 4,
        fillColor: "D4AF37",
        borderColor: "B45309",
        text: "KPI",
        color: "0B1420",
        align: "center",
        dir: "ltr",
      });
      return { ...sl, elements: updatedEls };
    });

    const built2 = await buildPptx(
      imported1.title,
      { ...imported1.content, slides: editedSlides },
      assets.resolveAsset,
    );
    expect("data" in built2).toBe(true);
    const pptxBuf2 = (built2 as { data: Buffer }).data;

    // Step 3: Reopen edited PPTX and verify changes persisted
    const reopened = await importPptx(pptxBuf2, assets.saveAsset);
    const rs1 = reopened.content.slides[0]!;
    const movedShape = rs1.elements?.find((e) => (e.text ?? "").includes("Phase 2 Shipped"));
    expect(movedShape).toBeDefined();
    expect(movedShape!.y).toBeGreaterThan(45);
    expect(rs1.elements?.some((e) => e.shape === "ellipse" && (e.text ?? "").includes("KPI"))).toBe(true);
  });

  it("reports explicit fidelityWarnings for PPTX slides containing animations or SmartArt", async () => {
    const built = await buildPptx("Anim", {
      schemaVersion: 1,
      theme: "default",
      slides: [{ id: "s1", title: "Static Base", subtitle: "", notes: "", dir: "ltr" }],
    });
    const zip = await JSZip.loadAsync((built as { data: Buffer }).data);
    const s1Xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
    zip.file(
      "ppt/slides/slide1.xml",
      s1Xml
        .replace(
          "</p:spTree>",
          "<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id=\"9\" name=\"Diagram\"/></p:nvGraphicFramePr></p:graphicFrame></p:spTree>",
        )
        .replace("</p:sld>", "<p:timing><p:tnLst/></p:timing></p:sld>"),
    );
    const mutated = await zip.generateAsync({ type: "nodebuffer" });

    const imported = await importPptx(mutated);
    expect(imported.warnings.some((w) => w.toLowerCase().includes("animation"))).toBe(true);
    expect(imported.warnings.some((w) => w.toLowerCase().includes("smartart"))).toBe(true);
  });

  it("preserves rich inline marks, RTL/LTR paragraphs, ordered lists, tables, images, and charts across TipTap conversion", () => {
    const assetUuid = crypto.randomUUID();
    const source: DocumentBlock[] = [
      { id: "b1", kind: "heading", level: 2, text: "Overview", align: "center", dir: "ltr" },
      {
        id: "b2",
        kind: "paragraph",
        text: "Mixed العربي text",
        align: "right",
        dir: "rtl",
        runs: [
          { text: "Mixed ", bold: true, color: "00D4C8", fontSize: 14 },
          { text: "العربي", italic: true, underline: true },
          { text: " text", href: "https://eisax.example.com" },
        ],
      },
      {
        id: "b3",
        kind: "list",
        ordered: true,
        text: "",
        items: ["One", "Two"],
        dir: "ltr",
      },
      {
        id: "b4",
        kind: "table",
        text: "",
        rows: [
          ["Key", "Val"],
          ["Users", "100"],
        ],
        dir: "ltr",
      },
      { id: "b5", kind: "image", text: "Diagram", assetId: assetUuid, dir: "ltr" },
      {
        id: "b6",
        kind: "chart",
        text: "",
        chart: {
          kind: "bar",
          title: "Growth",
          categories: ["Q1", "Q2"],
          values: [10, 25],
          unit: "%",
        },
        dir: "ltr",
      },
    ];

    const doc = blocksToTiptapDoc(source);
    const roundTripped = tiptapDocToBlocks(doc, "ltr");

    expect(roundTripped[0]?.kind).toBe("heading");
    expect(roundTripped[0]?.align).toBe("center");

    const p = roundTripped[1]!;
    expect(p.dir).toBe("rtl");
    expect(p.align).toBe("right");
    expect(p.runs?.some((r) => r.bold && r.color === "00D4C8" && r.fontSize === 14)).toBe(true);
    expect(p.runs?.some((r) => r.italic && r.underline)).toBe(true);
    expect(p.runs?.some((r) => r.href === "https://eisax.example.com")).toBe(true);

    expect(roundTripped[2]?.kind).toBe("list");
    expect(roundTripped[2]?.ordered).toBe(true);
    expect(roundTripped[2]?.items).toEqual(["One", "Two"]);

    expect(roundTripped[3]?.kind).toBe("table");
    expect(roundTripped[3]?.rows?.[1]).toEqual(["Users", "100"]);

    expect(roundTripped[4]?.kind).toBe("image");
    expect(roundTripped[4]?.assetId).toBe(assetUuid);

    expect(roundTripped[5]?.kind).toBe("chart");
    expect(roundTripped[5]?.chart?.title).toBe("Growth");
  });

  it("converts legacy structured slides to positioned canvas elements cleanly", () => {
    const els = slideToCanvasElements(
      {
        id: "legacy-1",
        title: "Legacy Slide",
        subtitle: "Sub",
        bullets: ["A", "B"],
        layout: "title-body",
        accentShape: "bar",
        notes: "",
        dir: "ltr",
      },
      resolveSlideTheme("default"),
    );
    expect(els.length).toBeGreaterThanOrEqual(3);
    expect(els.some((e) => e.kind === "text" && e.text === "Legacy Slide")).toBe(true);
    expect(els.some((e) => e.kind === "shape")).toBe(true);
  });
});
