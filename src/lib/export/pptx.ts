import PptxGenJS from "pptxgenjs";
import { presentationContentSchema } from "@/lib/validation/projects";

export type PptxResult = { fileName: string; data: Buffer };

/**
 * Build a real PPTX where every title/subtitle is native, editable text
 * (never flattened images). RTL slides use pptxgenjs rtlMode.
 */
export async function buildPptx(
  title: string,
  content: unknown,
): Promise<PptxResult | { error: "invalid_content" }> {
  const parsed = presentationContentSchema.safeParse(content);
  if (!parsed.success) return { error: "invalid_content" };

  const pptx = new PptxGenJS();
  pptx.author = "EISAX Studio";
  pptx.company = "EISAX";
  pptx.title = title;

  for (const slide of parsed.data.slides) {
    const s = pptx.addSlide();

    const hasTitle = slide.title.trim().length > 0;
    const hasSubtitle = slide.subtitle.trim().length > 0;

    if (hasTitle) {
      s.addText(slide.title, {
        x: 0.6,
        y: hasSubtitle ? 0.7 : 2.4,
        w: 8.8,
        h: 1.4,
        fontSize: hasSubtitle ? 36 : 44,
        bold: true,
        color: "17222E",
        rtlMode: slide.dir === "rtl",
        align: slide.dir === "rtl" ? "right" : "left",
      });
    }
    if (hasSubtitle) {
      s.addText(slide.subtitle, {
        x: 0.6,
        y: 2.1,
        w: 8.8,
        h: 1.2,
        fontSize: 20,
        color: "44586E",
        rtlMode: slide.dir === "rtl",
        align: slide.dir === "rtl" ? "right" : "left",
      });
    }
    if (!hasTitle && !hasSubtitle) {
      s.addText(" ", { x: 0.6, y: 2.4, w: 8.8, h: 1 });
    }
    if (slide.notes.trim().length > 0) {
      s.addNotes(slide.notes);
    }
  }

  const data = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  const safeTitle = title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "presentation";
  return { fileName: `${safeTitle.slice(0, 60)}.pptx`, data };
}
