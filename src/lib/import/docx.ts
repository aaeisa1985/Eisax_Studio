import JSZip from "jszip";
import {
  documentContentSchema,
  type DocumentBlock,
  type DocumentContent,
  type InlineRun,
  type PageLayout,
  type TextAlign,
} from "@/lib/validation/projects";
import { attr, child, childrenOf, descendants, firstDescendant, parseXml, textContent, type XmlNode } from "./xml";

export type SaveAssetFn = (args: {
  bytes: Buffer;
  originalName?: string;
}) => Promise<string | null>;

export interface DocxImportResult {
  title: string;
  language: "en" | "ar";
  content: DocumentContent;
  warnings: string[];
}

function normalizeHex(raw: string | undefined): string | undefined {
  if (!raw || raw === "auto") return undefined;
  const clean = raw.replace(/^#/, "").trim();
  return /^[0-9a-fA-F]{6}$/.test(clean) ? clean.toUpperCase() : undefined;
}

function mapAlignment(raw: string | undefined, rtl = false): TextAlign | undefined {
  switch (raw?.toLowerCase()) {
    case "start":
      return rtl ? "right" : "left";
    case "end":
      return rtl ? "left" : "right";
    case "left":
      return "left";
    case "center":
      return "center";
    case "right":
      return "right";
    case "both":
    case "distribute":
      return "justify";
    default:
      return undefined;
  }
}

function parseNumberingMap(
  xml: string | null,
): Map<string, { ordered: boolean; listStyle?: string }> {
  // numId -> { ordered, listStyle }
  const out = new Map<string, { ordered: boolean; listStyle?: string }>();
  if (!xml) return out;
  const doc = parseXml(xml);
  if (!doc) return out;

  const mapNumFmt = (rawFmt: string, lvlText: string): { ordered: boolean; listStyle?: string } => {
    const f = rawFmt.toLowerCase();
    if (f === "bullet") {
      if (lvlText.includes("▪") || lvlText.includes("■")) return { ordered: false, listStyle: "square" };
      if (lvlText.includes("○") || lvlText.includes("o")) return { ordered: false, listStyle: "circle" };
      return { ordered: false, listStyle: "disc" };
    }
    if (f === "hindinumbers" || f === "hindi_numbers") return { ordered: true, listStyle: "arabic-indic" };
    if (f === "arabicalpha" || f === "arabicabjad") return { ordered: true, listStyle: "arabic" };
    if (f === "upperletter") return { ordered: true, listStyle: "upper-alpha" };
    if (f === "lowerletter") return { ordered: true, listStyle: "lower-alpha" };
    if (f === "upperroman") return { ordered: true, listStyle: "upper-roman" };
    if (f === "lowerroman") return { ordered: true, listStyle: "lower-roman" };
    return { ordered: true, listStyle: "decimal" };
  };

  const abstractMap = new Map<string, { ordered: boolean; listStyle?: string }>();
  for (const abs of childrenOf(doc, "abstractNum")) {
    const absId = attr(abs, "abstractNumId");
    if (!absId) continue;
    const lvl0 = child(abs, "lvl");
    const numFmt = child(lvl0, "numFmt");
    const lvlText = attr(child(lvl0, "lvlText"), "val") ?? "";
    const val = attr(numFmt, "val") ?? "bullet";
    abstractMap.set(absId, mapNumFmt(val, lvlText));
  }

  for (const num of childrenOf(doc, "num")) {
    const numId = attr(num, "numId");
    const absRef = child(num, "abstractNumId");
    const absId = attr(absRef, "val");
    if (numId && absId && abstractMap.has(absId)) {
      out.set(numId, abstractMap.get(absId)!);
    }
  }
  return out;
}

function parseRels(xml: string | null): Map<string, { type: string; target: string; mode: string }> {
  const map = new Map<string, { type: string; target: string; mode: string }>();
  if (!xml) return map;
  const doc = parseXml(xml);
  if (!doc) return map;
  for (const rel of childrenOf(doc, "Relationship")) {
    const id = attr(rel, "Id");
    const type = attr(rel, "Type") ?? "";
    const target = attr(rel, "Target") ?? "";
    const mode = attr(rel, "TargetMode") ?? "";
    if (id && target) map.set(id, { type, target, mode });
  }
  return map;
}

function parseRunFormatting(rPr: XmlNode | undefined): Omit<InlineRun, "text"> {
  if (!rPr) return {};
  const bNode = child(rPr, "b");
  const iNode = child(rPr, "i");
  const uNode = child(rPr, "u");
  const sNode = child(rPr, "strike") ?? child(rPr, "dstrike");
  const colorNode = child(rPr, "color");
  const szNode = child(rPr, "sz");
  const rFonts = child(rPr, "rFonts");
  const fontFamily = attr(rFonts, "ascii") || attr(rFonts, "cs") || attr(rFonts, "hAnsi");

  const boolOn = (n: XmlNode | undefined) => {
    if (!n) return false;
    const v = attr(n, "val");
    return v !== "0" && v !== "false";
  };

  const uVal = attr(uNode, "val");
  const underline = Boolean(uNode && uVal !== "none" && uVal !== "0" && uVal !== "false");

  const halfPts = Number.parseInt(attr(szNode, "val") ?? "", 10);
  const fontSize =
    Number.isFinite(halfPts) && halfPts >= 16 && halfPts <= 144
      ? Math.round((halfPts / 2) * 10) / 10
      : undefined;

  return {
    ...(boolOn(bNode) ? { bold: true } : {}),
    ...(boolOn(iNode) ? { italic: true } : {}),
    ...(underline ? { underline: true } : {}),
    ...(boolOn(sNode) ? { strike: true } : {}),
    ...(normalizeHex(attr(colorNode, "val")) ? { color: normalizeHex(attr(colorNode, "val")) } : {}),
    ...(fontSize ? { fontSize } : {}),
    ...(fontFamily ? { fontFamily: fontFamily.slice(0, 80) } : {}),
  };
}

function detectHeadingLevel(styleVal: string | undefined, outlineVal: string | undefined): number | undefined {
  if (styleVal) {
    const s = styleVal.trim();
    if (/^Title$/i.test(s)) return 1;
    const m = s.match(/^Heading\s*([1-6])$/i) ?? s.match(/^heading\s*([1-6])$/i);
    if (m?.[1]) return Number.parseInt(m[1], 10);
  }
  if (outlineVal !== undefined) {
    const n = Number.parseInt(outlineVal, 10);
    if (Number.isInteger(n) && n >= 0 && n <= 5) return n + 1;
  }
  return undefined;
}

function extractPageLayout(sectPr: XmlNode | undefined): PageLayout | undefined {
  if (!sectPr) return undefined;
  const pgSz = child(sectPr, "pgSz");
  const pgMar = child(sectPr, "pgMar");
  const w = Number.parseInt(attr(pgSz, "w") ?? "", 10);
  const h = Number.parseInt(attr(pgSz, "h") ?? "", 10);
  const orient = attr(pgSz, "orient");
  const left = Number.parseInt(attr(pgMar, "left") ?? "", 10);

  const longSide = Math.max(w || 0, h || 0);
  const size: "a4" | "letter" = longSide > 0 && longSide < 16300 ? "letter" : "a4";
  const orientation: "portrait" | "landscape" =
    orient === "landscape" || (w > 0 && h > 0 && w > h) ? "landscape" : "portrait";
  const margins: "normal" | "narrow" | "wide" =
    left > 0 && left <= 950 ? "narrow" : left >= 1900 ? "wide" : "normal";

  return { size, orientation, margins };
}

function uid(prefix: string, idx: number): string {
  return `${prefix}${idx}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Import an OOXML .docx archive into EISAX DocumentContent, preserving formatting,
 * lists, tables, hyperlinks, RTL bidi, page layout, and embedded images, while
 * recording explicit fidelity warnings for any unsupported OOXML constructs.
 */
export async function importDocx(
  bytes: Buffer,
  saveAsset?: SaveAssetFn,
): Promise<DocxImportResult> {
  const zip = await JSZip.loadAsync(bytes);
  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new Error("invalid_docx_missing_document_xml");
  }

  const docXmlStr = await docFile.async("string");
  const docRoot = parseXml(docXmlStr);
  const body = child(docRoot, "body") ?? firstDescendant(docRoot, "body");
  if (!body) {
    throw new Error("invalid_docx_missing_body");
  }

  const relsXml = (await zip.file("word/_rels/document.xml.rels")?.async("string")) ?? null;
  const rels = parseRels(relsXml);

  const numberingXml = (await zip.file("word/numbering.xml")?.async("string")) ?? null;
  const numberingMap = parseNumberingMap(numberingXml);

  const warnings = new Set<string>();
  const zipNames = Object.keys(zip.files);
  if (zipNames.some((n) => /^word\/header\d+\.xml$/i.test(n) || /^word\/footer\d+\.xml$/i.test(n))) {
    warnings.add("Headers and footers in this DOCX were not imported into editable body blocks.");
  }
  if (zip.file("word/footnotes.xml") || zip.file("word/endnotes.xml")) {
    warnings.add("Footnotes/endnotes were detected; references may not be preserved in full.");
  }
  if (zip.file("word/comments.xml")) {
    warnings.add("Review comments in this DOCX are not imported.");
  }

  const blocks: DocumentBlock[] = [];
  let seq = 0;

  const pushParagraphRuns = async (
    pNode: XmlNode,
  ): Promise<{ runs: InlineRun[]; text: string; imageBlocks: DocumentBlock[] }> => {
    const runs: InlineRun[] = [];
    const imageBlocks: DocumentBlock[] = [];

    const readRun = async (rNode: XmlNode, href?: string) => {
      const rPr = child(rNode, "rPr");
      const fmt = parseRunFormatting(rPr);

      for (const ch of rNode.children) {
        if (ch.localName === "t" || ch.localName === "delText") {
          const t = textContent(ch);
          if (t) {
            runs.push({ text: t, ...fmt, ...(href ? { href } : {}) });
          }
        } else if (ch.localName === "br" || ch.localName === "cr") {
          runs.push({ text: "\n" });
        } else if (ch.localName === "tab") {
          runs.push({ text: "  " });
        } else if (ch.localName === "drawing" || ch.localName === "pict") {
          const blip = firstDescendant(ch, "blip");
          const embedId = attr(blip, "embed") ?? attr(blip, "link");
          const rel = embedId ? rels.get(embedId) : undefined;
          if (rel && saveAsset) {
            const mediaPath = rel.target.startsWith("/")
              ? rel.target.slice(1)
              : rel.target.startsWith("word/")
                ? rel.target
                : `word/${rel.target.replace(/^\.\//, "")}`;
            const mediaEntry = zip.file(mediaPath);
            if (mediaEntry) {
              const mediaBytes = Buffer.from(await mediaEntry.async("nodebuffer"));
              const assetId = await saveAsset({
                bytes: mediaBytes,
                originalName: mediaPath.split("/").pop(),
              });
              if (assetId) {
                const docPr = firstDescendant(ch, "docPr");
                const alt = attr(docPr, "descr") || attr(docPr, "name") || "";
                const srcRect = firstDescendant(ch, "srcRect");
                const parseCropPct = (raw: string | undefined) => {
                  const v = Number.parseInt(raw ?? "", 10);
                  if (!Number.isFinite(v) || v <= 0) return 0;
                  return Math.round(Math.min(85, Math.max(0, v / 1000)) * 10) / 10;
                };
                const cropObj = srcRect
                  ? {
                      top: parseCropPct(attr(srcRect, "t")),
                      right: parseCropPct(attr(srcRect, "r")),
                      bottom: parseCropPct(attr(srcRect, "b")),
                      left: parseCropPct(attr(srcRect, "l")),
                    }
                  : undefined;
                const hasAnyCrop = Boolean(
                  cropObj && (cropObj.top > 0 || cropObj.right > 0 || cropObj.bottom > 0 || cropObj.left > 0),
                );
                const xfrm = firstDescendant(ch, "xfrm");
                const rotRaw = Number.parseInt(attr(xfrm, "rot") ?? "", 10);
                const rotDeg = Number.isFinite(rotRaw) ? Math.round((rotRaw / 60000) % 360) : 0;
                imageBlocks.push({
                  id: uid("img", ++seq),
                  kind: "image",
                  assetId,
                  text: alt.slice(0, 300),
                  dir: /[\u0600-\u06FF]/.test(alt) ? "rtl" : "ltr",
                  ...(hasAnyCrop && cropObj ? { crop: cropObj } : {}),
                  ...(rotDeg > 0 ? { rotation: rotDeg } : {}),
                });
              } else {
                warnings.add(`Image "${rel.target}" uses an unsupported vector/legacy format (only PNG/JPEG/WebP are imported).`);
              }
            }
          } else if (embedId) {
            warnings.add("An embedded/linked image could not be resolved during import.");
          }
        }
      }
    };

    for (const ch of pNode.children) {
      if (ch.localName === "r") {
        await readRun(ch);
      } else if (ch.localName === "hyperlink") {
        const rid = attr(ch, "id");
        const rel = rid ? rels.get(rid) : undefined;
        const href = rel && /^https?:\/\//i.test(rel.target) ? rel.target : undefined;
        for (const hr of childrenOf(ch, "r")) {
          await readRun(hr, href);
        }
      } else if (ch.localName === "ins") {
        warnings.add("Tracked insertions (w:ins) were flattened as accepted text.");
        for (const ir of childrenOf(ch, "r")) {
          await readRun(ir);
        }
      } else if (ch.localName === "del") {
        warnings.add("Tracked deletions (w:del) were skipped.");
      } else if (ch.localName === "oMath" || ch.localName === "oMathPara") {
        warnings.add("Office math equations (OMML) are not natively editable yet and were skipped.");
      } else if (ch.localName === "sdt") {
        warnings.add("Structured document controls (w:sdt) were simplified during import.");
        for (const sr of descendants(ch, "r")) {
          await readRun(sr);
        }
      }
    }

    const text = runs.map((r) => r.text).join("");
    return { runs, text, imageBlocks };
  };

  let pendingList: {
    ordered: boolean;
    listStyle?: string;
    items: string[];
    listRuns: InlineRun[][];
    dir: "ltr" | "rtl";
  } | null = null;
  const flushList = () => {
    if (!pendingList || pendingList.items.length === 0) {
      pendingList = null;
      return;
    }
    blocks.push({
      id: uid("lst", ++seq),
      kind: "list",
      ordered: pendingList.ordered,
      ...(pendingList.listStyle ? { listStyle: pendingList.listStyle as DocumentBlock["listStyle"] } : {}),
      text: "",
      items: pendingList.items,
      listRuns: pendingList.listRuns,
      dir: pendingList.dir,
    });
    pendingList = null;
  };

  for (const node of body.children) {
    if (node.localName === "p") {
      const pPr = child(node, "pPr");
      const pStyle = attr(child(pPr, "pStyle"), "val");
      const outlineLvl = attr(child(pPr, "outlineLvl"), "val");
      const bidiNode = child(pPr, "bidi");
      const explicitRtl = Boolean(bidiNode && attr(bidiNode, "val") !== "0" && attr(bidiNode, "val") !== "false");
      const align = mapAlignment(attr(child(pPr, "jc"), "val"), explicitRtl);
      const numPr = child(pPr, "numPr");
      const numId = attr(child(numPr, "numId"), "val");

      const { runs, text, imageBlocks } = await pushParagraphRuns(node);
      const isRtl = explicitRtl || /[\u0600-\u06FF]/.test(text);
      const dir: "ltr" | "rtl" = isRtl ? "rtl" : "ltr";

      const headingLvl = detectHeadingLevel(pStyle, outlineLvl);
      const isQuote = Boolean(pStyle && /quote/i.test(pStyle));
      const isList = Boolean(numId && numId !== "0");

      if (isList && numId) {
        flushListIfMismatch: {
          const info = numberingMap.get(numId) ?? { ordered: false };
          if (
            pendingList &&
            (pendingList.ordered !== info.ordered || pendingList.listStyle !== info.listStyle)
          ) {
            flushList();
          }
          if (!pendingList) {
            pendingList = {
              ordered: info.ordered,
              listStyle: info.listStyle,
              items: [],
              listRuns: [],
              dir,
            };
          }
          if (text.trim().length > 0 || runs.length > 0) {
            pendingList.items.push(text.slice(0, 2000));
            pendingList.listRuns.push(runs.slice(0, 200));
          }
          break flushListIfMismatch;
        }
        for (const img of imageBlocks) blocks.push(img);
        continue;
      }

      flushList();

      if (text.trim().length > 0) {
        if (headingLvl) {
          blocks.push({
            id: uid("hd", ++seq),
            kind: "heading",
            level: Math.min(6, Math.max(1, headingLvl)),
            text: text.slice(0, 20000),
            runs: runs.slice(0, 500),
            align,
            dir,
          });
        } else if (isQuote) {
          blocks.push({
            id: uid("qt", ++seq),
            kind: "quote",
            text: text.slice(0, 20000),
            runs: runs.slice(0, 500),
            align,
            dir,
          });
        } else {
          blocks.push({
            id: uid("p", ++seq),
            kind: "paragraph",
            text: text.slice(0, 20000),
            runs: runs.slice(0, 500),
            align,
            dir,
          });
        }
      }

      for (const img of imageBlocks) {
        blocks.push(img);
      }
    } else if (node.localName === "tbl") {
      flushList();
      const tblPr = child(node, "tblPr");
      const bidiVisual = Boolean(child(tblPr, "bidiVisual"));
      const tblW = child(tblPr, "tblW");
      const tblWType = attr(tblW, "type");
      const tblWVal = Number.parseInt(attr(tblW, "w") ?? "", 10);
      const widthPct =
        tblWType === "pct" && Number.isFinite(tblWVal) && tblWVal >= 1250 && tblWVal <= 5000
          ? Math.round(tblWVal / 50)
          : undefined;

      const tblGrid = child(node, "tblGrid");
      const rawGridCols = childrenOf(tblGrid, "gridCol")
        .map((c) => Number.parseInt(attr(c, "w") ?? "", 10))
        .filter((n) => Number.isFinite(n) && n > 0);

      const rows: string[][] = [];
      const rowHeights: Array<number | undefined> = [];
      let rtlCells = bidiVisual;

      for (const tr of childrenOf(node, "tr").slice(0, 50)) {
        const trPr = child(tr, "trPr");
        const trHeight = child(trPr, "trHeight");
        const hTwips = Number.parseInt(attr(trHeight, "val") ?? "", 10);
        rowHeights.push(
          Number.isFinite(hTwips) && hTwips >= 180
            ? Math.max(24, Math.min(480, Math.round(hTwips / 15)))
            : undefined,
        );

        const cells: string[] = [];
        for (const tc of childrenOf(tr, "tc").slice(0, 12)) {
          const paras = childrenOf(tc, "p").map((p) => {
            const ts = descendants(p, "t").map((t) => textContent(t)).join("");
            return ts;
          });
          const cellVal = paras.join(" ").trim().slice(0, 1000);
          if (/[\u0600-\u06FF]/.test(cellVal)) rtlCells = true;
          cells.push(cellVal);
        }
        if (cells.length > 0) rows.push(cells);
      }
      if (rows.length > 0) {
        const colCount = Math.max(...rows.map((r) => r.length), 1);
        let colWidths: number[] | undefined;
        if (rawGridCols.length === colCount) {
          const sum = rawGridCols.reduce((a, b) => a + b, 0);
          if (sum > 0) {
            colWidths = rawGridCols.map((w) => Math.max(5, Math.round((w / sum) * 1000) / 10));
          }
        }
        const cleanedRowHeights = rowHeights.some((h) => h !== undefined)
          ? rowHeights.map((h) => h ?? 32)
          : undefined;
        blocks.push({
          id: uid("tbl", ++seq),
          kind: "table",
          text: "",
          rows,
          ...(colWidths ? { colWidths } : {}),
          ...(cleanedRowHeights ? { rowHeights: cleanedRowHeights } : {}),
          ...(widthPct && widthPct < 100 ? { widthPct } : {}),
          dir: rtlCells ? "rtl" : "ltr",
        });
      }
    } else if (node.localName === "sdt") {
      flushList();
      warnings.add("Top-level content controls (w:sdt) were simplified into paragraphs.");
      for (const p of descendants(node, "p")) {
        const { runs, text } = await pushParagraphRuns(p);
        if (text.trim()) {
          blocks.push({
            id: uid("p", ++seq),
            kind: "paragraph",
            text: text.slice(0, 20000),
            runs: runs.slice(0, 500),
            dir: /[\u0600-\u06FF]/.test(text) ? "rtl" : "ltr",
          });
        }
      }
    }
  }
  flushList();

  const sectPr = child(body, "sectPr");
  const pageLayout = extractPageLayout(sectPr);
  const allText = blocks.map((b) => b.text || (b.items ?? []).join(" ")).join(" ");
  const arChars = (allText.match(/[\u0600-\u06FF]/g) ?? []).length;
  const language: "en" | "ar" = arChars > allText.length * 0.2 ? "ar" : "en";

  const firstHeading = blocks.find((b) => b.kind === "heading" && b.text.trim());
  const firstPara = blocks.find((b) => b.text.trim());
  const derivedTitle = (firstHeading?.text || firstPara?.text || "Imported Document")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);

  const fidelityWarnings = Array.from(warnings).slice(0, 50);
  const content = documentContentSchema.parse({
    schemaVersion: 1,
    blocks,
    ...(pageLayout ? { pageLayout } : {}),
    ...(fidelityWarnings.length > 0 ? { fidelityWarnings } : {}),
  });

  return {
    title: derivedTitle,
    language,
    content,
    warnings: fidelityWarnings,
  };
}
