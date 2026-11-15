import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
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
