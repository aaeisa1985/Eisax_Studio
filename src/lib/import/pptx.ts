import JSZip from "jszip";
import {
  presentationContentSchema,
  type InlineRun,
  type PresentationContent,
  type SlideElement,
  type SlideItem,
  type SlideShapeType,
  type TextAlign,
} from "@/lib/validation/projects";
import type { SaveAssetFn } from "./docx";
import {
  attr,
  child,
  childrenOf,
  descendants,
  firstDescendant,
  parseXml,
  textContent,
  type XmlNode,
} from "./xml";

export interface PptxImportResult {
  title: string;
  language: "en" | "ar";
  content: PresentationContent;
  warnings: string[];
}

function parseRelsMap(xml: string | null): Map<string, { type: string; target: string }> {
  const map = new Map<string, { type: string; target: string }>();
  if (!xml) return map;
  const doc = parseXml(xml);
  if (!doc) return map;
  for (const rel of childrenOf(doc, "Relationship")) {
    const id = attr(rel, "Id");
    const type = attr(rel, "Type") ?? "";
    const target = attr(rel, "Target") ?? "";
    if (id && target) map.set(id, { type, target });
  }
  return map;
}

function resolvePptPath(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = `${baseDir}/${target}`.split("/");
  const stack: string[] = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") stack.pop();
    else stack.push(p);
  }
  return stack.join("/");
}

function parseHexColor(node: XmlNode | undefined): string | undefined {
  if (!node) return undefined;
  const srgb = firstDescendant(node, "srgbClr");
  const val = attr(srgb, "val");
  if (val && /^[0-9a-fA-F]{6}$/.test(val)) return val.toUpperCase();
  return undefined;
}

function mapSlideShape(prst: string | undefined): SlideShapeType {
  switch (prst) {
    case "roundRect":
    case "snipRoundRect":
      return "roundRect";
    case "ellipse":
      return "ellipse";
    case "triangle":
    case "rtTriangle":
      return "triangle";
    case "line":
    case "straightConnector1":
      return "line";
    case "rightArrow":
    case "leftArrow":
    case "bentArrow":
      return "arrow";
    default:
      return "rect";
  }
}

function mapParaAlign(algn: string | undefined): TextAlign | undefined {
  switch (algn) {
    case "ctr":
      return "center";
    case "r":
      return "right";
    case "just":
      return "justify";
    case "l":
      return "left";
    default:
      return undefined;
  }
}

function parseXfrm(
  spPr: XmlNode | undefined,
  slideW: number,
  slideH: number,
  offsetX = 0,
  offsetY = 0,
): { x: number; y: number; w: number; h: number } | null {
  const xfrm = child(spPr, "xfrm");
  if (!xfrm) return null;
  const off = child(xfrm, "off");
  const ext = child(xfrm, "ext");
  const ox = Number.parseInt(attr(off, "x") ?? "0", 10) + offsetX;
  const oy = Number.parseInt(attr(off, "y") ?? "0", 10) + offsetY;
  const cx = Number.parseInt(attr(ext, "cx") ?? "0", 10);
  const cy = Number.parseInt(attr(ext, "cy") ?? "0", 10);
  if (cx <= 0 || cy <= 0) return null;

  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    x: Math.max(-25, Math.min(120, round2((ox / slideW) * 100))),
    y: Math.max(-25, Math.min(120, round2((oy / slideH) * 100))),
    w: Math.max(0.5, Math.min(140, round2((cx / slideW) * 100))),
    h: Math.max(0.5, Math.min(140, round2((cy / slideH) * 100))),
  };
}

function extractTxBody(txBody: XmlNode | undefined): {
  text: string;
  runs: InlineRun[];
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  align?: TextAlign;
  dir: "ltr" | "rtl";
} {
  if (!txBody) {
    return { text: "", runs: [], dir: "ltr" };
  }
  const paragraphs = childrenOf(txBody, "p");
  const lines: string[] = [];
  const allRuns: InlineRun[] = [];
  let firstAlign: TextAlign | undefined;
  let rtl = false;
  let firstFontSize: number | undefined;
  let firstColor: string | undefined;
  let allBold = true;
  let hasRun = false;

  paragraphs.forEach((pNode, pIdx) => {
    const pPr = child(pNode, "pPr");
    if (!firstAlign) firstAlign = mapParaAlign(attr(pPr, "algn"));
    if (attr(pPr, "rtl") === "1" || attr(pPr, "rtl") === "true") rtl = true;

    const buChar = child(pPr, "buChar");
    const buAuto = child(pPr, "buAutoNum");
    const buNone = child(pPr, "buNone");
    const bulletPrefix = !buNone && (buChar || buAuto) ? "• " : "";

    let pText = bulletPrefix;
    if (bulletPrefix) {
      allRuns.push({ text: bulletPrefix });
    }

    for (const ch of pNode.children) {
      if (ch.localName === "r") {
        const rPr = child(ch, "rPr");
        const szRaw = Number.parseInt(attr(rPr, "sz") ?? "", 10);
        const fontSize =
          Number.isFinite(szRaw) && szRaw >= 600 && szRaw <= 12000
            ? Math.round((szRaw / 100) * 10) / 10
            : undefined;
        const b = attr(rPr, "b") === "1" || attr(rPr, "b") === "true";
        const i = attr(rPr, "i") === "1" || attr(rPr, "i") === "true";
        const uAttr = attr(rPr, "u");
        const u = Boolean(uAttr && uAttr !== "none");
        const solid = child(rPr, "solidFill");
        const color = parseHexColor(solid);

        const tNode = child(ch, "t");
        const t = textContent(tNode);
        if (t) {
          hasRun = true;
          if (!b) allBold = false;
          if (!firstFontSize && fontSize) firstFontSize = fontSize;
          if (!firstColor && color) firstColor = color;
          pText += t;
          allRuns.push({
            text: t,
            ...(b ? { bold: true } : {}),
            ...(i ? { italic: true } : {}),
            ...(u ? { underline: true } : {}),
            ...(color ? { color } : {}),
            ...(fontSize && fontSize <= 72 ? { fontSize } : {}),
          });
        }
      } else if (ch.localName === "br") {
        pText += "\n";
        allRuns.push({ text: "\n" });
      }
    }

    lines.push(pText);
    if (pIdx < paragraphs.length - 1) {
      allRuns.push({ text: "\n" });
    }
  });

  const text = lines.join("\n").trim();
  if (/[\u0600-\u06FF]/.test(text)) rtl = true;

  return {
    text: text.slice(0, 20000),
    runs: allRuns.slice(0, 200),
    fontSize: firstFontSize,
    bold: hasRun ? allBold : undefined,
    color: firstColor,
    align: firstAlign,
    dir: rtl ? "rtl" : "ltr",
  };
}

/**
 * Import an OOXML .pptx archive into EISAX PresentationContent with editable
 * positioned elements (text boxes, shapes, images, speaker notes, RTL) and
 * explicit fidelity warnings for any unsupported OOXML constructs.
 */
export async function importPptx(
  bytes: Buffer,
  saveAsset?: SaveAssetFn,
): Promise<PptxImportResult> {
  const zip = await JSZip.loadAsync(bytes);
  const presXmlStr = await zip.file("ppt/presentation.xml")?.async("string");
  if (!presXmlStr) {
    throw new Error("invalid_pptx_missing_presentation_xml");
  }

  const presDoc = parseXml(presXmlStr);
  const sldSz = firstDescendant(presDoc, "sldSz");
  const slideW = Number.parseInt(attr(sldSz, "cx") ?? "", 10) || 9144000;
  const slideH = Number.parseInt(attr(sldSz, "cy") ?? "", 10) || 5143500;

  const presRelsStr = (await zip.file("ppt/_rels/presentation.xml.rels")?.async("string")) ?? null;
  const presRels = parseRelsMap(presRelsStr);

  const orderedPaths: string[] = [];
  const sldIdLst = firstDescendant(presDoc, "sldIdLst");
  for (const sldId of childrenOf(sldIdLst, "sldId")) {
    const rid = attr(sldId, "id");
    const rel = rid ? presRels.get(rid) : undefined;
    if (rel) {
      orderedPaths.push(resolvePptPath("ppt", rel.target));
    }
  }
  if (orderedPaths.length === 0) {
    for (const name of Object.keys(zip.files).sort()) {
      if (/^ppt\/slides\/slide\d+\.xml$/i.test(name)) orderedPaths.push(name);
    }
  }

  const warnings = new Set<string>();
  const slides: SlideItem[] = [];
  let elSeq = 0;

  for (let idx = 0; idx < Math.min(orderedPaths.length, 60); idx++) {
    const slidePath = orderedPaths[idx]!;
    const slideXmlStr = await zip.file(slidePath)?.async("string");
    if (!slideXmlStr) continue;
    const slideDoc = parseXml(slideXmlStr);

    if (firstDescendant(slideDoc, "timing")) {
      warnings.add("Slide animations (p:timing) are not executed or edited in EISAX Studio.");
    }
    if (firstDescendant(slideDoc, "transition")) {
      warnings.add("Slide transitions (p:transition) are omitted when re-exporting.");
    }
    if (descendants(slideDoc, "graphicFrame").length > 0) {
      warnings.add("Embedded SmartArt/complex graphic frames may require manual recreation if not represented as standard shapes/images.");
    }

    const slideFile = slidePath.split("/").pop()!;
    const slideRelsPath = `ppt/slides/_rels/${slideFile}.rels`;
    const slideRels = parseRelsMap((await zip.file(slideRelsPath)?.async("string")) ?? null);

    // Slide background color
    const bg = firstDescendant(slideDoc, "bg");
    const bgColor = parseHexColor(bg);

    const elements: SlideElement[] = [];
    let slideTitle = "";
    let slideSubtitle = "";
    const slideBullets: string[] = [];
    let slideRtl = false;

    const spTree = firstDescendant(slideDoc, "spTree");
    const processShapeContainer = async (container: XmlNode | undefined, offX = 0, offY = 0) => {
      if (!container) return;
      for (const node of container.children) {
        if (node.localName === "sp") {
          const nvSpPr = child(node, "nvSpPr");
          const cNvPr = child(nvSpPr, "cNvPr");
          const cNvSpPr = child(nvSpPr, "cNvSpPr");
          const nvPr = child(nvSpPr, "nvPr");
          const ph = child(nvPr, "ph");
          const phType = attr(ph, "type");
          const spPr = child(node, "spPr");
          const box = parseXfrm(spPr, slideW, slideH, offX, offY);
          if (!box) continue;

          const prstGeom = child(spPr, "prstGeom");
          const prst = attr(prstGeom, "prst");
          const isTxBox = attr(cNvSpPr, "txBox") === "1" || attr(cNvSpPr, "txBox") === "true";
          const solidFill = child(spPr, "solidFill");
          const fillColor = parseHexColor(solidFill);
          const ln = child(spPr, "ln");
          const borderColor = parseHexColor(child(ln, "solidFill"));

          const txBody = child(node, "txBody");
          const parsedTx = extractTxBody(txBody);
          if (parsedTx.dir === "rtl") slideRtl = true;

          if (phType === "ctrTitle" || phType === "title") {
            if (!slideTitle && parsedTx.text) slideTitle = parsedTx.text.slice(0, 500);
          } else if (phType === "subTitle") {
            if (!slideSubtitle && parsedTx.text) slideSubtitle = parsedTx.text.slice(0, 1000);
          } else if (parsedTx.text && slideBullets.length < 12) {
            const firstLine = parsedTx.text.split("\n")[0]?.trim();
            if (firstLine && firstLine !== slideTitle) slideBullets.push(firstLine.slice(0, 500));
          }

          const hasVisualShape = !isTxBox && Boolean(fillColor || borderColor || (prst && prst !== "rect"));
          if (hasVisualShape && !parsedTx.text) {
            elements.push({
              id: `el${++elSeq}`,
              kind: "shape",
              shape: mapSlideShape(prst),
              x: box.x,
              y: box.y,
              w: box.w,
              h: box.h,
              zIndex: elements.length + 1,
              fillColor,
              borderColor,
              borderWidth: borderColor ? 2 : 0,
            });
          } else if (parsedTx.text || fillColor || borderColor) {
            elements.push({
              id: `el${++elSeq}`,
              kind: hasVisualShape ? "shape" : "text",
              ...(hasVisualShape ? { shape: mapSlideShape(prst) } : {}),
              x: box.x,
              y: box.y,
              w: box.w,
              h: box.h,
              zIndex: elements.length + 1,
              text: parsedTx.text,
              runs: parsedTx.runs.length > 0 ? parsedTx.runs : undefined,
              fontSize: parsedTx.fontSize ?? (phType === "title" || phType === "ctrTitle" ? 28 : 16),
              bold: parsedTx.bold ?? (phType === "title" || phType === "ctrTitle"),
              color: parsedTx.color ?? (bgColor && Number.parseInt(bgColor.slice(0, 2), 16) < 90 ? "F1F5F9" : "17222E"),
              align: parsedTx.align ?? (parsedTx.dir === "rtl" ? "right" : "left"),
              dir: parsedTx.dir,
              fillColor,
              borderColor,
              borderWidth: borderColor ? 1 : 0,
            });
          }
          void cNvPr;
        } else if (node.localName === "pic") {
          const spPr = child(node, "spPr");
          const box = parseXfrm(spPr, slideW, slideH, offX, offY);
          const blipFill = child(node, "blipFill");
          const blip = firstDescendant(blipFill, "blip");
          const embedId = attr(blip, "embed");
          const rel = embedId ? slideRels.get(embedId) : undefined;
          if (box && rel && saveAsset) {
            const mediaPath = resolvePptPath("ppt/slides", rel.target);
            const entry = zip.file(mediaPath);
            if (entry) {
              const imgBytes = Buffer.from(await entry.async("nodebuffer"));
              const assetId = await saveAsset({
                bytes: imgBytes,
                originalName: mediaPath.split("/").pop(),
              });
              if (assetId) {
                elements.push({
                  id: `el${++elSeq}`,
                  kind: "image",
                  x: box.x,
                  y: box.y,
                  w: box.w,
                  h: box.h,
                  zIndex: elements.length + 1,
                  assetId,
                });
              } else {
                warnings.add(`Slide ${idx + 1} picture "${rel.target}" uses an unsupported format (only PNG/JPEG/WebP supported).`);
              }
            }
          }
        } else if (node.localName === "grpSp") {
          const grpSpPr = child(node, "grpSpPr");
          const xfrm = child(grpSpPr, "xfrm");
          const chOff = child(xfrm, "chOff");
          const off = child(xfrm, "off");
          const dx =
            (Number.parseInt(attr(off, "x") ?? "0", 10) -
              Number.parseInt(attr(chOff, "x") ?? "0", 10)) +
            offX;
          const dy =
            (Number.parseInt(attr(off, "y") ?? "0", 10) -
              Number.parseInt(attr(chOff, "y") ?? "0", 10)) +
            offY;
          await processShapeContainer(node, dx, dy);
        }
      }
    };

    await processShapeContainer(spTree);

    // Speaker notes via slide relationships
    let notes = "";
    for (const rel of slideRels.values()) {
      if (rel.type.toLowerCase().includes("notesslide")) {
        const notesPath = resolvePptPath("ppt/slides", rel.target);
        const notesXmlStr = await zip.file(notesPath)?.async("string");
        if (notesXmlStr) {
          const notesDoc = parseXml(notesXmlStr);
          const noteParas = descendants(notesDoc, "p")
            .map((p) => descendants(p, "t").map((t) => textContent(t)).join(""))
            .filter((s) => s.trim().length > 0);
          notes = noteParas.join("\n").slice(0, 5000);
        }
        break;
      }
    }

    slides.push({
      id: `s-${idx + 1}-${Math.random().toString(36).slice(2, 6)}`,
      title: slideTitle || `Slide ${idx + 1}`,
      subtitle: slideSubtitle,
      bullets: slideBullets,
      layout: elements.length > 0 ? "title-body" : "title",
      accentShape: "none",
      bgColor,
      elements,
      notes,
      dir: slideRtl ? "rtl" : "ltr",
    });
  }

  const allText = slides
    .flatMap((s) => [s.title, s.subtitle, ...(s.elements ?? []).map((e) => e.text ?? "")])
    .join(" ");
  const arChars = (allText.match(/[\u0600-\u06FF]/g) ?? []).length;
  const language: "en" | "ar" = arChars > allText.length * 0.2 ? "ar" : "en";
  const deckTitle = (slides[0]?.title || "Imported Presentation").slice(0, 140);

  const fidelityWarnings = Array.from(warnings).slice(0, 50);
  const content = presentationContentSchema.parse({
    schemaVersion: 1,
    theme: "light",
    slides,
    ...(fidelityWarnings.length > 0 ? { fidelityWarnings } : {}),
  });

  return {
    title: deckTitle,
    language,
    content,
    warnings: fidelityWarnings,
  };
}
