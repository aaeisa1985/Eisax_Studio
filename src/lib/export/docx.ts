import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { documentContentSchema } from "@/lib/validation/projects";

export type DocxResult = { fileName: string; data: Buffer };

/**
 * Build a real DOCX with semantic headings and paragraphs (native, editable).
 * RTL blocks use bidi so Office renders them correctly.
 */
export async function buildDocx(
  title: string,
  content: unknown,
): Promise<DocxResult | { error: "invalid_content" }> {
  const parsed = documentContentSchema.safeParse(content);
  if (!parsed.success) return { error: "invalid_content" };

  const children: Paragraph[] = [
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      bidirectional: false,
    }),
  ];

  for (const block of parsed.data.blocks) {
    const rtl = block.dir === "rtl";
    if (block.kind === "heading") {
      const level =
        block.level === 1 ? HeadingLevel.HEADING_1
        : block.level === 3 ? HeadingLevel.HEADING_3
        : HeadingLevel.HEADING_2;
      children.push(
        new Paragraph({
          text: block.text || " ",
          heading: level,
          bidirectional: rtl,
          alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
        }),
      );
    } else {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: block.text || " ", rightToLeft: rtl })],
          bidirectional: rtl,
          alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
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
