import JSZip from "jszip";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  HeightRule,
  ImageRun,
  LevelFormat,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
} from "docx";
import {
  documentContentSchema,
  type ImageCrop,
  type InlineRun,
  type TextAlign,
} from "@/lib/validation/projects";
import { parseInlineSegments } from "@/lib/utils/inlineFormat";
import { splitBidiRunChunks } from "@/lib/utils/bidi";
import { buildOoxmlSrcRect, hasCrop } from "@/lib/utils/mediaStyle";
import type { AssetResolver } from "@/lib/storage/assets";

export type DocxResult = { fileName: string; data: Buffer };

type DocxRunChild = TextRun | ExternalHyperlink;

function toAlignment(align: TextAlign | undefined, rtl: boolean) {
  switch (align) {
    case "center":
      return AlignmentType.CENTER;
    case "justify":
      return AlignmentType.JUSTIFIED;
    case "right":
      return rtl ? AlignmentType.START : AlignmentType.RIGHT;
    case "left":
      return rtl ? AlignmentType.END : AlignmentType.LEFT;
    default:
      return rtl ? AlignmentType.START : AlignmentType.LEFT;
  }
}

function cleanColor(hex: string | undefined): string | undefined {
  if (!hex) return undefined;
  const c = hex.replace(/^#/, "").trim();
  return /^[0-9a-fA-F]{6}$/.test(c) ? c.toUpperCase() : undefined;
}

function makeTextRuns(run: InlineRun, rtl: boolean, fallbackColor?: string): TextRun[] {
  const raw = run.text || " ";
  const chunks = splitBidiRunChunks(raw, rtl);
  const safeChunks = chunks.length > 0 ? chunks : [{ text: raw, rtl }];
  return safeChunks.map(
    (ch) =>
      new TextRun({
        text: ch.text,
        bold: run.bold,
        italics: run.italic,
        underline: run.underline ? { type: UnderlineType.SINGLE } : undefined,
        strike: run.strike,
        color: cleanColor(run.color) ?? fallbackColor,
        size: run.fontSize ? Math.round(run.fontSize * 2) : undefined,
        font: run.fontFamily || undefined,
        rightToLeft: ch.rtl,
      }),
  );
}

function blockRunsToChildren(
  runs: InlineRun[] | undefined,
  fallbackText: string,
  rtl: boolean,
  fallbackColor?: string,
): DocxRunChild[] {
  if (runs && runs.length > 0) {
    const out: DocxRunChild[] = [];
    for (const r of runs) {
      if (r.href && /^https?:\/\//i.test(r.href)) {
        out.push(
          new ExternalHyperlink({
            link: r.href,
            children: makeTextRuns(
              { ...r, text: r.text || r.href },
              rtl,
              cleanColor(r.color) ?? "0284C7",
            ),
          }),
        );
      } else {
        out.push(...makeTextRuns(r, rtl, fallbackColor));
      }
    }
    return out;
  }

  const segments = parseInlineSegments(fallbackText || " ");
  if (segments.length === 0) {
    return [new TextRun({ text: " ", rightToLeft: rtl, color: fallbackColor })];
  }
  const out: DocxRunChild[] = [];
  for (const seg of segments) {
    out.push(
      ...makeTextRuns(
        { text: seg.text, bold: seg.bold, italic: seg.italic },
        rtl,
        fallbackColor,
      ),
    );
  }
  return out;
}

/**
 * Build a real DOCX with semantic headings, rich inline runs, lists, tables,
 * quotes, images, links, page layout, and charts. RTL blocks emit <w:bidi/>.
 */
export async function buildDocx(
  title: string,
  content: unknown,
  resolveAsset?: AssetResolver,
): Promise<DocxResult | { error: "invalid_content" }> {
  const parsed = documentContentSchema.safeParse(content);
  if (!parsed.success) return { error: "invalid_content" };

  const blocks = parsed.data.blocks;
  const pageLayout = parsed.data.pageLayout;

  const baseW = pageLayout?.size === "letter" ? 12240 : 11906;
  const baseH = pageLayout?.size === "letter" ? 15840 : 16838;
  const landscape = pageLayout?.orientation === "landscape";
  const marginTwips =
    pageLayout?.margins === "narrow" ? 720 : pageLayout?.margins === "wide" ? 2160 : 1440;
  const contentWidthTwips = Math.max(2400, (landscape ? baseH : baseW) - marginTwips * 2);

  const numberingRefForStyle = (ordered: boolean | undefined, listStyle: string | undefined) => {
    switch (listStyle) {
      case "arabic-indic":
        return "eisax-arabic-indic";
      case "arabic":
        return "eisax-arabic";
      case "upper-alpha":
        return "eisax-upper-alpha";
      case "lower-alpha":
        return "eisax-lower-alpha";
      case "upper-roman":
        return "eisax-upper-roman";
      case "lower-roman":
        return "eisax-lower-roman";
      case "circle":
        return "eisax-bullet-circle";
      case "square":
        return "eisax-bullet-square";
      case "decimal":
        return "eisax-ordered";
      default:
        return ordered ? "eisax-ordered" : null;
    }
  };

  const imageCrops: Array<ImageCrop | undefined> = [];

  // Include document title header paragraph only when the document does not already start with Heading 1
  const firstBlock = blocks[0];
  const startsWithH1 = firstBlock?.kind === "heading" && (firstBlock.level ?? 2) === 1;
  const titleRtl = /[\u0600-\u06FF]/.test(title);
  const children: Array<Paragraph | Table> = startsWithH1
    ? []
    : [
        new Paragraph({
          text: title,
          heading: HeadingLevel.TITLE,
          bidirectional: titleRtl,
          alignment: titleRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
        }),
      ];

  for (const block of blocks) {
    const rtl = block.dir === "rtl";
    const alignment = toAlignment(block.align, rtl);

    if (block.kind === "heading") {
      const level =
        block.level === 1
          ? HeadingLevel.HEADING_1
          : block.level === 3
            ? HeadingLevel.HEADING_3
            : block.level === 4
              ? HeadingLevel.HEADING_4
              : block.level === 5
                ? HeadingLevel.HEADING_5
                : block.level === 6
                  ? HeadingLevel.HEADING_6
                  : HeadingLevel.HEADING_2;
      children.push(
        new Paragraph({
          children: blockRunsToChildren(block.runs, block.text, rtl),
          heading: level,
          bidirectional: rtl,
          alignment,
        }),
      );
    } else if (block.kind === "list") {
      const items = (block.items ?? []).filter((item) => item.trim().length > 0);
      const effectiveItems = items.length > 0 ? items : [block.text || " "];
      const numRef = numberingRefForStyle(block.ordered, block.listStyle);
      effectiveItems.forEach((item, idx) => {
        const itemRuns = block.listRuns?.[idx];
        children.push(
          new Paragraph({
            children: blockRunsToChildren(itemRuns, item, rtl),
            ...(numRef
              ? { numbering: { reference: numRef, level: 0 } }
              : { bullet: { level: 0 } }),
            bidirectional: rtl,
            alignment,
          }),
        );
      });
    } else if (block.kind === "table") {
      const rows = (block.rows ?? []).filter((r) => r.length > 0);
      if (rows.length > 0) {
        const colCount = Math.max(...rows.map((r) => r.length), 1);
        const tblPct = Math.max(25, Math.min(100, block.widthPct ?? 100));
        const tblTwips = Math.round((contentWidthTwips * tblPct) / 100);
        const colPcts =
          block.colWidths && block.colWidths.length === colCount
            ? (() => {
                const sum = block.colWidths.reduce((a, b) => a + b, 0) || 100;
                return block.colWidths.map((w) => (w / sum) * 100);
              })()
            : Array.from({ length: colCount }, () => 100 / colCount);
        const colTwips = colPcts.map((p) => Math.max(360, Math.round((tblTwips * p) / 100)));

        const tableRows = rows.map((row, rIdx) => {
          const cells = Array.from({ length: colCount }, (_, cIdx) => {
            const cellText = row[cIdx] ?? "";
            const cellRtl = rtl || /[\u0600-\u06FF]/.test(cellText);
            return new TableCell({
              width: { size: colTwips[cIdx] ?? Math.round(tblTwips / colCount), type: WidthType.DXA },
              shading:
                rIdx === 0
                  ? { type: ShadingType.CLEAR, color: "auto", fill: "EAF6F8" }
                  : undefined,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: cellText || " ",
                      bold: rIdx === 0,
                      rightToLeft: cellRtl,
                    }),
                  ],
                  bidirectional: cellRtl,
                  alignment: cellRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                }),
              ],
            });
          });
          const rowHpx = block.rowHeights?.[rIdx];
          return new TableRow({
            children: cells,
            ...(rowHpx && rowHpx > 12
              ? { height: { value: Math.round(rowHpx * 15), rule: HeightRule.ATLEAST } }
              : {}),
          });
        });
        children.push(
          new Table({
            width: { size: tblPct, type: WidthType.PERCENTAGE },
            columnWidths: colTwips,
            visuallyRightToLeft: rtl,
            rows: tableRows,
          }),
        );
        children.push(new Paragraph({ text: "" }));
      }
    } else if (block.kind === "quote") {
      children.push(
        new Paragraph({
          children: blockRunsToChildren(block.runs, block.text || " ", rtl, "44586E"),
          bidirectional: rtl,
          alignment,
          indent: rtl ? { right: 420 } : { left: 420 },
          border: rtl
            ? { right: { color: "00A89E", space: 10, style: BorderStyle.SINGLE, size: 18 } }
            : { left: { color: "00A89E", space: 10, style: BorderStyle.SINGLE, size: 18 } },
        }),
      );
    } else if (block.kind === "image") {
      const asset = block.assetId && resolveAsset ? await resolveAsset(block.assetId) : null;
      if (asset && (asset.mimeType === "image/png" || asset.mimeType === "image/jpeg")) {
        const imgType = asset.mimeType === "image/png" ? "png" : "jpg";
        const widthPx = block.widthPct
          ? Math.max(80, Math.min(620, Math.round((560 * block.widthPct) / 100)))
          : 420;
        const heightPx = block.heightPx
          ? Math.max(60, Math.min(720, Math.round(block.heightPx)))
          : Math.round(widthPx * 0.62);
        const imgAlign =
          block.align === "left"
            ? AlignmentType.LEFT
            : block.align === "right"
              ? AlignmentType.RIGHT
              : AlignmentType.CENTER;
        imageCrops.push(block.crop);
        children.push(
          new Paragraph({
            alignment: imgAlign,
            children: [
              new ImageRun({
                data: asset.data,
                type: imgType,
                transformation: {
                  width: widthPx,
                  height: heightPx,
                  ...(block.rotation ? { rotation: block.rotation } : {}),
                },
              }),
            ],
          }),
        );
      }
      if (block.text.trim()) {
        children.push(
          new Paragraph({
            children: blockRunsToChildren(block.runs, block.text, rtl, "5A6A7A"),
            bidirectional: rtl,
            alignment:
              block.align === "left"
                ? AlignmentType.LEFT
                : block.align === "right"
                  ? AlignmentType.RIGHT
                  : AlignmentType.CENTER,
          }),
        );
      }
    } else if (block.kind === "chart" && block.chart) {
      const ch = block.chart;
      const headingLabel = ch.unit ? `${ch.title} (${ch.unit})` : ch.title;
      children.push(
        new Paragraph({
          text: headingLabel || "Chart",
          heading: HeadingLevel.HEADING_3,
          bidirectional: rtl,
          alignment,
        }),
      );
      const rows: string[][] = [
        [rtl ? "الفئة" : "Category", ch.unit ? `${rtl ? "القيمة" : "Value"} (${ch.unit})` : rtl ? "القيمة" : "Value"],
        ...ch.categories.map((cat, idx) => [cat, String(ch.values[idx] ?? 0)]),
      ];
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          visuallyRightToLeft: rtl,
          rows: rows.map((row, rIdx) => {
            const cells = row.map((cellText) => {
              const cellRtl = rtl || /[\u0600-\u06FF]/.test(cellText);
              return new TableCell({
                shading:
                  rIdx === 0
                    ? { type: ShadingType.CLEAR, color: "auto", fill: "EAF6F8" }
                    : undefined,
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: cellText || " ",
                        bold: rIdx === 0,
                        rightToLeft: cellRtl,
                      }),
                    ],
                    bidirectional: cellRtl,
                    alignment: cellRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                  }),
                ],
              });
            });
            return new TableRow({ children: cells });
          }),
        }),
      );
      children.push(new Paragraph({ text: "" }));
    } else if (block.kind === "link") {
      const label = block.text.trim() || block.url || "Link";
      if (block.url && /^https?:\/\//i.test(block.url)) {
        children.push(
          new Paragraph({
            bidirectional: rtl,
            alignment,
            children: [
              new ExternalHyperlink({
                link: block.url,
                children: [
                  new TextRun({
                    text: label,
                    style: "Hyperlink",
                    rightToLeft: rtl,
                  }),
                ],
              }),
            ],
          }),
        );
      } else {
        children.push(
          new Paragraph({
            children: blockRunsToChildren(block.runs, label, rtl),
            bidirectional: rtl,
            alignment,
          }),
        );
      }
    } else {
      children.push(
        new Paragraph({
          children: blockRunsToChildren(block.runs, block.text || " ", rtl),
          bidirectional: rtl,
          alignment,
        }),
      );
    }
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "eisax-ordered",
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START }],
        },
        {
          reference: "eisax-arabic-indic",
          levels: [{ level: 0, format: LevelFormat.HINDI_NUMBERS, text: "%1.", alignment: AlignmentType.START }],
        },
        {
          reference: "eisax-arabic",
          levels: [{ level: 0, format: LevelFormat.ARABIC_ALPHA, text: "%1.", alignment: AlignmentType.START }],
        },
        {
          reference: "eisax-upper-alpha",
          levels: [{ level: 0, format: LevelFormat.UPPER_LETTER, text: "%1.", alignment: AlignmentType.START }],
        },
        {
          reference: "eisax-lower-alpha",
          levels: [{ level: 0, format: LevelFormat.LOWER_LETTER, text: "%1.", alignment: AlignmentType.START }],
        },
        {
          reference: "eisax-upper-roman",
          levels: [{ level: 0, format: LevelFormat.UPPER_ROMAN, text: "%1.", alignment: AlignmentType.START }],
        },
        {
          reference: "eisax-lower-roman",
          levels: [{ level: 0, format: LevelFormat.LOWER_ROMAN, text: "%1.", alignment: AlignmentType.START }],
        },
        {
          reference: "eisax-bullet-circle",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "○", alignment: AlignmentType.START }],
        },
        {
          reference: "eisax-bullet-square",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "▪", alignment: AlignmentType.START }],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: landscape ? baseH : baseW,
              height: landscape ? baseW : baseH,
              orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: {
              top: marginTwips,
              bottom: marginTwips,
              left: marginTwips,
              right: marginTwips,
            },
          },
        },
        ...(pageLayout?.showPageNumbers
          ? {
              footers: {
                default: new Footer({
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new TextRun({
                          children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES],
                        }),
                      ],
                    }),
                  ],
                }),
              },
            }
          : {}),
        children,
      },
    ],
  });

  let outBuffer = Buffer.from(await Packer.toBuffer(doc));
  if (imageCrops.some((c) => hasCrop(c))) {
    const zip = await JSZip.loadAsync(outBuffer);
    const docXml = await zip.file("word/document.xml")?.async("string");
    if (docXml) {
      let idx = 0;
      const patched = docXml.replace(
        /(<pic:blipFill[^>]*>[\s\S]*?<a:blip\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/a:blip>))([\s\S]*?<\/pic:blipFill>)/g,
        (full, head: string, tail: string) => {
          const crop = imageCrops[idx++];
          const srcRectXml = buildOoxmlSrcRect(crop);
          if (!srcRectXml) return full;
          const cleanedTail = tail.replace(/<a:srcRect\b[^>]*\/?>/g, "");
          return `${head}${srcRectXml}${cleanedTail}`;
        },
      );
      zip.file("word/document.xml", patched);
      outBuffer = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    }
  }

  const safeTitle = title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "document";
  return { fileName: `${safeTitle.slice(0, 60)}.docx`, data: outBuffer };
}
