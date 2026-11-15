import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { blocksToTiptapDoc, tiptapDocToBlocks } from "@/lib/document/tiptapSync";
import { buildDocx } from "@/lib/export/docx";
import { buildPptx } from "@/lib/export/pptx";
import { importDocx } from "@/lib/import/docx";
import { importPptx } from "@/lib/import/pptx";
import { slideToCanvasElements } from "@/lib/presentation/elements";
import { resolveSlideTheme } from "@/lib/projects/themes";
import {
  detectFirstStrongDir,
  resolveParagraphDir,
  splitBidiRunChunks,
} from "@/lib/utils/bidi";
import {
  buildOoxmlSrcRect,
  croppedImageCss,
  formatDisplayNumber,
  toArabicIndicDigits,
  toWesternDigits,
  toggleDigitsScript,
} from "@/lib/utils/mediaStyle";
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

  it("handles Arabic + mixed English Bidi cleanly in TipTap, DOCX runs, and PPTX text boxes", async () => {
    const mixedSentence = "عاوز تظبيط العربيه - الكتابه بتتكتب من اليمين للشمال are you got it ?؟";
    expect(detectFirstStrongDir(mixedSentence)).toBe("rtl");
    expect(detectFirstStrongDir("123 - مرحبا hello")).toBe("rtl");
    expect(detectFirstStrongDir("English first مع عربي")).toBe("ltr");
    expect(resolveParagraphDir("English first مع عربي", "rtl", "ltr")).toBe("rtl");

    // 1. Blank EN document paragraph loads as dir="auto", allowing instant Arabic RTL typing
    const blankDoc = blocksToTiptapDoc([
      { id: "blank-p", kind: "paragraph", text: "", dir: "ltr" },
    ]);
    expect(blankDoc.content?.[0]?.attrs?.dir).toBe("auto");

    // Simulated user typing Arabic + English into that dir="auto" paragraph
    const typedDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { dir: "auto" },
          content: [{ type: "text", text: mixedSentence }],
        },
        {
          type: "bulletList",
          attrs: { dir: "auto" },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { dir: "auto" },
                  content: [{ type: "text", text: "البند الأول with English phrase" }],
                },
              ],
            },
          ],
        },
      ],
    };
    const savedBlocks = tiptapDocToBlocks(typedDoc, "ltr");
    expect(savedBlocks[0]?.dir).toBe("rtl");
    expect(savedBlocks[1]?.kind).toBe("list");
    expect(savedBlocks[1]?.dir).toBe("rtl");

    // 2. DOCX splits mixed RTL paragraph into <w:rtl/> Arabic runs and LTR English runs inside <w:bidi/>
    const chunks = splitBidiRunChunks(mixedSentence, true);
    expect(chunks.some((c) => c.rtl === false && c.text.includes("are you got it"))).toBe(true);
    expect(chunks.some((c) => c.rtl === true && c.text.includes("عاوز تظبيط العربيه"))).toBe(true);

    const docxOut = await buildDocx("Arabic Mixed Test", {
      schemaVersion: 1,
      blocks: savedBlocks,
    });
    expect("data" in docxOut).toBe(true);
    const docxZip = await JSZip.loadAsync((docxOut as { data: Buffer }).data);
    const docXml = await docxZip.file("word/document.xml")!.async("string");
    expect(docXml).toContain("<w:bidi/>");
    expect(docXml).toContain('<w:jc w:val="start"/>');
    // English phrase inside RTL paragraph explicitly marks w:rtl="false" while Arabic runs carry <w:rtl/>
    const engRunMatch = docXml.match(/<w:r>(?:(?!<\/w:r>)[\s\S])*?are you got it(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/);
    expect(engRunMatch).not.toBeNull();
    expect(engRunMatch![0]).toContain('w:val="false"');

    // 3. Slide text box without explicit dir auto-resolves Arabic + English text to native PowerPoint RTL
    const pptxOut = await buildPptx("Arabic Slide Test", {
      schemaVersion: 1,
      theme: "light",
      slides: [
        {
          id: "s-bidi",
          title: "Arabic Slide",
          subtitle: "",
          bullets: [],
          layout: "title-body",
          accentShape: "none",
          notes: "",
          dir: "ltr",
          elements: [
            {
              id: "tb-auto",
              kind: "text",
              x: 10,
              y: 20,
              w: 80,
              h: 20,
              zIndex: 1,
              text: mixedSentence,
            },
          ],
        },
      ],
    });
    expect("data" in pptxOut).toBe(true);
    const pptxZip = await JSZip.loadAsync((pptxOut as { data: Buffer }).data);
    const slideXml = await pptxZip.file("ppt/slides/slide1.xml")!.async("string");
    expect(slideXml).toContain('rtl="1"');
    expect(slideXml).toContain('algn="r"');
  });

  it("exposes valid standalone full-screen PWA manifest and service worker assets", () => {
    const m = manifest();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/dashboard");
    const icons = m.icons ?? [];
    expect(icons.some((i) => i.sizes === "192x192" && i.src === "/icons/icon-192.png")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.src === "/icons/icon-512.png")).toBe(true);
    expect(icons.some((i) => i.purpose === "maskable" && i.src === "/icons/icon-maskable-512.png")).toBe(true);

    const root = process.cwd();
    expect(fs.existsSync(path.join(root, "public", "icons", "icon-192.png"))).toBe(true);
    expect(fs.existsSync(path.join(root, "public", "icons", "icon-512.png"))).toBe(true);
    expect(fs.existsSync(path.join(root, "public", "icons", "icon-maskable-512.png"))).toBe(true);
    expect(fs.existsSync(path.join(root, "public", "sw.js"))).toBe(true);
  });

  it("round-trips DOCX table colWidths/rowHeights, image crop/rotation, Arabic-Indic numbering, and fontFamily", async () => {
    const assets = makeMemoryAssets();
    const imgId = assets.seed("image/png", SAMPLE_PNG);

    const blocks: DocumentBlock[] = [
      {
        id: "p-font",
        kind: "paragraph",
        text: "تقرير Cairo السنوي",
        dir: "rtl",
        runs: [
          { text: "تقرير ", fontFamily: "Cairo", fontSize: 16, bold: true },
          { text: "Cairo", fontFamily: "Calibri", fontSize: 16 },
          { text: " السنوي", fontFamily: "Amiri", fontSize: 16 },
        ],
      },
      {
        id: "lst-ar",
        kind: "list",
        ordered: true,
        listStyle: "arabic-indic",
        text: "",
        items: ["البند الأول", "البند الثاني"],
        dir: "rtl",
      },
      {
        id: "tbl-sized",
        kind: "table",
        text: "",
        widthPct: 80,
        colWidths: [65, 35],
        rowHeights: [44, 68],
        rows: [
          ["العنصر", "النسبة"],
          ["التنفيذ", "92%"],
        ],
        dir: "rtl",
      },
      {
        id: "img-crop",
        kind: "image",
        assetId: imgId,
        text: "Cropped banner",
        widthPct: 70,
        heightPx: 220,
        align: "right",
        rotation: 90,
        crop: { top: 10, right: 15, bottom: 20, left: 5 },
        dir: "ltr",
      },
      {
        id: "ch-resized",
        kind: "chart",
        text: "",
        widthPct: 85,
        heightPx: 300,
        align: "center",
        chart: {
          kind: "bar",
          title: "الأداء",
          categories: ["Q1", "Q2"],
          values: [40, 85],
        },
        dir: "rtl",
      },
    ];

    // TipTap round-trip preserves crop, rotation, fontFamily, listStyle, colWidths, rowHeights, and chart size
    const docJson = blocksToTiptapDoc(blocks);
    const syncedBack = tiptapDocToBlocks(docJson);

    const syncedPara = syncedBack.find((b) => b.kind === "paragraph");
    expect(syncedPara?.runs?.some((r) => r.fontFamily === "Cairo")).toBe(true);
    expect(syncedPara?.runs?.some((r) => r.fontFamily === "Amiri")).toBe(true);

    const syncedList = syncedBack.find((b) => b.kind === "list");
    expect(syncedList?.listStyle).toBe("arabic-indic");

    const syncedTable = syncedBack.find((b) => b.kind === "table");
    expect(syncedTable?.colWidths).toEqual([65, 35]);
    expect(syncedTable?.rowHeights).toEqual([44, 68]);
    expect(syncedTable?.widthPct).toBe(80);

    const syncedImg = syncedBack.find((b) => b.kind === "image");
    expect(syncedImg?.crop).toEqual({ top: 10, right: 15, bottom: 20, left: 5 });
    expect(syncedImg?.rotation).toBe(90);
    expect(syncedImg?.widthPct).toBe(70);
    expect(syncedImg?.align).toBe("right");

    const syncedChart = syncedBack.find((b) => b.kind === "chart");
    expect(syncedChart?.widthPct).toBe(85);
    expect(syncedChart?.heightPx).toBe(300);

    // DOCX export emits real OOXML structures for all new features
    const docxOut = await buildDocx(
      "تقرير متقدم",
      {
        schemaVersion: 1,
        blocks: syncedBack,
        pageLayout: { size: "a4", orientation: "portrait", margins: "normal", showPageNumbers: true },
      },
      assets.resolveAsset,
    );
    expect("data" in docxOut).toBe(true);
    const buf = (docxOut as { data: Buffer }).data;
    const zip = await JSZip.loadAsync(buf);
    const docXml = await zip.file("word/document.xml")!.async("string");
    const numXml = await zip.file("word/numbering.xml")!.async("string");

    expect(numXml).toContain("hindiNumbers");
    expect(docXml).toContain("<a:srcRect");
    expect(docXml).toContain('l="5000"');
    expect(docXml).toContain('t="10000"');
    expect(docXml).toContain("<w:trHeight");
    expect(docXml).toContain("Cairo");

    // Re-import DOCX and verify table grid, row height, crop, rotation, listStyle, and fontFamily survive
    const imported = await importDocx(buf, assets.saveAsset);
    const impList = imported.content.blocks.find((b) => b.kind === "list");
    expect(impList?.listStyle).toBe("arabic-indic");
    const impTable = imported.content.blocks.find((b) => b.kind === "table");
    expect(impTable?.colWidths?.length).toBe(2);
    expect(impTable?.colWidths?.[0]).toBeGreaterThan(impTable?.colWidths?.[1] ?? 100);
    expect(impTable?.rowHeights?.length).toBe(2);
    const impImg = imported.content.blocks.find((b) => b.kind === "image");
    expect(impImg?.crop?.top).toBe(10);
    expect(impImg?.crop?.left).toBe(5);
    expect(impImg?.rotation).toBe(90);
  });

  it("exports PPTX slide table elements, image crop srcRect, fontFace, rotation, and slide numbers", async () => {
    const assets = makeMemoryAssets();
    const imgId = assets.seed("image/png", SAMPLE_PNG);

    const out = await buildPptx(
      "Deck Controls",
      {
        schemaVersion: 1,
        theme: "default",
        showSlideNumbers: true,
        slides: [
          {
            id: "s-1",
            title: "شريحة الجداول والقص",
            subtitle: "",
            bullets: [],
            layout: "title-body",
            accentShape: "none",
            notes: "",
            dir: "rtl",
            elements: [
              {
                id: "el-txt",
                kind: "text",
                x: 8,
                y: 6,
                w: 84,
                h: 14,
                zIndex: 1,
                text: "عنوان Cairo",
                fontFamily: "Cairo",
                fontSize: 22,
                bold: true,
                rotation: 15,
              },
              {
                id: "el-tbl",
                kind: "table",
                x: 8,
                y: 25,
                w: 44,
                h: 45,
                zIndex: 2,
                rows: [
                  ["البند", "القيمة"],
                  ["المبيعات", "١٢٠"],
                ],
                colWidths: [60, 40],
                rowHeights: [36, 48],
                fontFamily: "Tajawal",
              },
              {
                id: "el-img",
                kind: "image",
                x: 56,
                y: 25,
                w: 36,
                h: 48,
                zIndex: 3,
                assetId: imgId,
                crop: { top: 12, right: 8, bottom: 12, left: 8 },
                objectFit: "cover",
                rotation: 30,
              },
            ],
          },
        ],
      },
      assets.resolveAsset,
    );

    expect("data" in out).toBe(true);
    const pptxBuf = (out as { data: Buffer }).data;
    const zip = await JSZip.loadAsync(pptxBuf);
    const slideXml = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(slideXml).toContain("<a:tbl");
    expect(slideXml).toContain("المبيعات");
    expect(slideXml).toContain('typeface="Cairo"');
    expect(slideXml).toContain("<a:srcRect");
    expect(slideXml).toContain('l="8000"');
    expect(slideXml).toContain('t="12000"');
    expect(slideXml).toContain('type="sldNum"');

    // Re-import PPTX and verify native table, image crop, rotation, fontFamily, and showSlideNumbers round-trip
    const reimported = await importPptx(pptxBuf, assets.saveAsset);
    expect(reimported.content.showSlideNumbers).toBe(true);
    const els = reimported.content.slides[0]?.elements ?? [];
    const impTxt = els.find((e) => e.kind === "text");
    expect(impTxt?.fontFamily).toBe("Cairo");
    expect(impTxt?.rotation).toBe(15);

    const impTbl = els.find((e) => e.kind === "table");
    expect(impTbl?.rows).toEqual([
      ["البند", "القيمة"],
      ["المبيعات", "١٢٠"],
    ]);
    expect(impTbl?.colWidths?.length).toBe(2);
    expect(impTbl?.colWidths?.[0]).toBeGreaterThan(impTbl?.colWidths?.[1] ?? 100);
    expect(impTbl?.fontFamily).toBe("Tajawal");

    const impImg = els.find((e) => e.kind === "image");
    expect(impImg?.crop).toEqual({ top: 12, right: 8, bottom: 12, left: 8 });
    expect(impImg?.rotation).toBe(30);
  });

  it("rejects zip archives with excessive entries (zip-bomb guard)", async () => {
    const zip = new JSZip();
    for (let i = 0; i < 605; i++) {
      zip.file(`word/part-${i}.xml`, "<x/>");
    }
    const bombBuf = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    await expect(importDocx(bombBuf)).rejects.toThrow("zip_archive_too_many_entries");
  });

  it("handles Arabic-Indic numeral conversion, script toggling, and crop CSS math", () => {
    expect(toArabicIndicDigits("Page 2026: 45%")).toBe("Page ٢٠٢٦: ٤٥%");
    expect(toWesternDigits("صفحة ٢٠٢٦: ٤٥%")).toBe("صفحة 2026: 45%");
    expect(toggleDigitsScript("Q1: 2026")).toBe("Q١: ٢٠٢٦");
    expect(toggleDigitsScript("سنة ٢٠٢٦ - ١٤")).toBe("سنة 2026 - 14");
    expect(formatDisplayNumber(12, true)).toBe("١٢");
    expect(formatDisplayNumber(12, false)).toBe("12");

    expect(buildOoxmlSrcRect({ top: 10, right: 20, bottom: 10, left: 0 })).toBe(
      '<a:srcRect l="0" t="10000" r="20000" b="10000"/>',
    );
    const css = croppedImageCss({ top: 10, right: 10, bottom: 10, left: 10 }, "cover");
    expect(css.width).toBe("125.000%");
    expect(css.height).toBe("125.000%");
    expect(css.left).toBe("-12.5%");
    expect(css.top).toBe("-12.5%");
  });
});
