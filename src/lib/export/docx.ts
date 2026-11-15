import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { documentContentSchema } from "@/lib/validation/projects";
import { parseInlineSegments } from "@/lib/utils/inlineFormat";
import type { AssetResolver } from "@/lib/storage/assets";

export type DocxResult = { fileName: string; data: Buffer };

function inlineRuns(text: string, rtl: boolean, color?: string): TextRun[] {
  const segments = parseInlineSegments(text || " ");
  if (segments.length === 0) {
    return [new TextRun({ text: " ", rightToLeft: rtl, color })];
  }
  return segments.map(
    (seg) =>
      new TextRun({
        text: seg.text,
        bold: seg.bold,
        italics: seg.italic,
        rightToLeft: rtl,
        color,
      }),
  );
}

/**
 * Build a real DOCX with semantic headings, paragraphs, lists, tables, quotes,
 * and links (native, editable). RTL blocks use bidi so Office renders them correctly.
 */
export async function buildDocx(
  title: string,
  content: unknown,
  resolveAsset?: AssetResolver,
): Promise<DocxResult | { error: "invalid_content" }> {
  const parsed = documentContentSchema.safeParse(content);
  if (!parsed.success) return { error: "invalid_content" };

  const titleRtl = /[\u0600-\u06FF]/.test(title);
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      bidirectional: titleRtl,
      alignment: titleRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
    }),
  ];

  for (const block of parsed.data.blocks) {
    const rtl = block.dir === "rtl";
    const alignment = rtl ? AlignmentType.RIGHT : AlignmentType.LEFT;

    if (block.kind === "heading") {
      const level =
        block.level === 1
          ? HeadingLevel.HEADING_1
          : block.level === 3
            ? HeadingLevel.HEADING_3
            : HeadingLevel.HEADING_2;
      children.push(
        new Paragraph({
          text: block.text || " ",
          heading: level,
          bidirectional: rtl,
          alignment,
        }),
      );
    } else if (block.kind === "list") {
      const items = (block.items ?? []).filter((item) => item.trim().length > 0);
      const effectiveItems = items.length > 0 ? items : [block.text || " "];
      effectiveItems.forEach((item, idx) => {
        const prefix = block.ordered ? `${idx + 1}. ` : "";
        children.push(
          new Paragraph({
            children: inlineRuns(`${prefix}${item}`, rtl),
            bullet: block.ordered ? undefined : { level: 0 },
            bidirectional: rtl,
            alignment,
          }),
        );
      });
    } else if (block.kind === "table") {
      const rows = (block.rows ?? []).filter((r) => r.length > 0);
      if (rows.length > 0) {
        const colCount = Math.max(...rows.map((r) => r.length), 1);
        const tableRows = rows.map((row, rIdx) => {
          const cells = Array.from({ length: colCount }, (_, cIdx) => {
            const cellText = row[cIdx] ?? "";
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
        });
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            visuallyRightToLeft: rtl,
            rows: tableRows,
          }),
        );
        children.push(new Paragraph({ text: "" }));
      }
    } else if (block.kind === "quote") {
      children.push(
        new Paragraph({
          children: inlineRuns(block.text || " ", rtl, "44586E"),
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
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: asset.data,
                type: imgType,
                transformation: { width: 420, height: 260 },
              }),
            ],
          }),
        );
      }
      if (block.text.trim()) {
        children.push(
          new Paragraph({
            children: inlineRuns(block.text, rtl, "5A6A7A"),
            bidirectional: rtl,
            alignment: AlignmentType.CENTER,
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
            children: inlineRuns(label, rtl),
            bidirectional: rtl,
            alignment,
          }),
        );
      }
    } else {
      children.push(
        new Paragraph({
          children: inlineRuns(block.text || " ", rtl),
          bidirectional: rtl,
          alignment,
        }),
      );
    }
  }

  const doc = new Document({
    creator: "EISAX Studio",
    title,
    sections: [{ children }],
  });

  const data = await Packer.toBuffer(doc);
  const safeTitle = title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "document";
  return { fileName: `${safeTitle.slice(0, 60)}.docx`, data };
}
