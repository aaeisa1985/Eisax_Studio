import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  WidthType,
} from "docx";
import PptxGenJS from "pptxgenjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, ".data", "office-fixtures");
await mkdir(outDir, { recursive: true });

async function saveDocx(name, children, opts = {}) {
  const doc = new Document({
    creator: "EISAX Studio synthetic acceptance fixture",
    title: name.replace(/\.docx$/, ""),
    sections: [{ properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } }, children }],
    ...opts,
  });
  await writeFile(path.join(outDir, name), await Packer.toBuffer(doc));
}

const rtlLine = (text, options = {}) => new Paragraph({ text, bidirectional: true, alignment: AlignmentType.RIGHT, ...options });

await saveDocx("01-arabic-letter.docx", [
  rtlLine("التاريخ: ١٦ نوفمبر ٢٠٢٦", { alignment: AlignmentType.LEFT }),
  rtlLine("السادة / إدارة الخدمات المحترمين،", { spacing: { before: 500, after: 240 } }),
  rtlLine("السلام عليكم ورحمة الله وبركاته،"),
  rtlLine("الموضوع: طلب مراجعة خطة تحسين الخدمات", { heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 240 } }),
  rtlLine("نرجو التكرم بمراجعة الخطة المرفقة وإفادتنا بالملاحظات قبل نهاية الأسبوع. يتضمن المقترح ثلاثة محاور: جودة الخدمة، سرعة الاستجابة، وقياس رضا المستفيدين."),
  rtlLine("شاكرين لكم تعاونكم،", { spacing: { before: 300 } }),
  rtlLine("وتفضلوا بقبول فائق الاحترام،"),
  rtlLine("أحمد العيسا — مدير العمليات", { spacing: { before: 280 } }),
]);

await saveDocx("02-cv.docx", [
  new Paragraph({ text: "سارة المنصوري | Sara Al Mansoori", heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
  new Paragraph({ text: "مديرة مشاريع | Project Manager — Dubai, UAE", alignment: AlignmentType.CENTER }),
  new Paragraph({ text: "الخبرة المهنية | EXPERIENCE", heading: HeadingLevel.HEADING_1, spacing: { before: 300 } }),
  new Paragraph({ text: "2022–2026  Senior Project Manager — Northstar Services" }),
  new Paragraph({ text: "Led a cross-functional team of 12; improved on-time delivery from 78% to 93%." }),
  new Paragraph({ text: "2019–2022  محللة أعمال — شركة المدار" }),
  new Paragraph({ text: "وثّقت المتطلبات وأدارت اختبارات قبول المستخدم بالتعاون مع فرق التقنية والعمليات." }),
  new Paragraph({ text: "المهارات | SKILLS", heading: HeadingLevel.HEADING_1, spacing: { before: 300 } }),
  ...["Stakeholder management", "تحليل الأعمال", "Roadmapping and delivery", "التواصل باللغتين العربية والإنجليزية"].map((text) => new Paragraph({ text, bullet: { indent: 360 } })),
  new Paragraph({ text: "التعليم | EDUCATION", heading: HeadingLevel.HEADING_1, spacing: { before: 300 } }),
  new Paragraph({ text: "BSc, Business Information Systems — Gulf University, 2019" }),
]);

const border = { style: BorderStyle.SINGLE, size: 1, color: "AAB5C0" };
const cell = (text, header = false) => new TableCell({
  children: [new Paragraph({ text, bold: header })],
  width: { size: 20, type: WidthType.PERCENTAGE },
  borders: { top: border, bottom: border, left: border, right: border },
  shading: header ? { fill: "E8EEF4" } : undefined,
});
const rows = [new TableRow({ children: ["الشهر / Month", "الطلبات / Requests", "المنجَز / Completed", "النسبة / Rate", "ملاحظات / Notes"].map((v) => cell(v, true)), tableHeader: true })];
for (let i = 1; i <= 84; i++) {
  rows.push(new TableRow({ children: [cell(`شهر ${i} / Month ${i}`), cell(String(120 + i * 3)), cell(String(105 + i * 3)), cell(`${Math.min(99, 82 + (i % 17))}%`), cell(i % 3 === 0 ? "مراجعة دورية / routine review" : "ضمن الخطة / on track")] }));
}
await saveDocx("03-long-table-report.docx", [
  new Paragraph({ text: "تقرير متابعة الخدمات | Service Operations Report", heading: HeadingLevel.TITLE }),
  new Paragraph({ text: "بيانات اصطناعية للاختبار — Synthetic sample data. Review all pages and table continuation." }),
  new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: [2200, 1500, 1500, 1200, 3600] }),
]);

await saveDocx("04-mixed-language.docx", [
  rtlLine("ملخص تنفيذي | Executive Summary", { heading: HeadingLevel.TITLE }),
  rtlLine("توضح هذه الوثيقة طريقة تنسيق نص عربي مع English terms وأرقام مثل 2026/11/16 ورمز (A-17)، مع الحفاظ على اتجاه القراءة الصحيح."),
  new Paragraph({ text: "The English paragraph includes Arabic text: (مراجعة الجودة), mixed punctuation—such as this—and a date: 16 November 2026." }),
  rtlLine("تبدأ الفقرة بالعربية ثم تُدرج العبارة التالية: Service Level Agreement (SLA) — 99.5% — وتعود إلى العربية في السطر نفسه."),
  new Paragraph({ text: "Checklist: confirm cursor movement, selection, punctuation placement, and edits after reopening in Microsoft Word." }),
]);

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "EISAX Studio synthetic acceptance fixture";
pptx.subject = "Synthetic picture and chart acceptance fixture";
pptx.title = "Service Review — Synthetic Fixture";
pptx.theme = { headFontFace: "Aptos Display", bodyFontFace: "Aptos", lang: "en-US" };
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#e8eef4"/><circle cx="320" cy="155" r="90" fill="#2d6a8a"/><path d="M80 310h480" stroke="#10283f" stroke-width="8"/><text x="320" y="330" text-anchor="middle" font-family="Arial" font-size="24" fill="#10283f">Synthetic service illustration</text></svg>');
let slide = pptx.addSlide();
slide.background = { color: "F6F8FA" };
slide.addText("Service Review | مراجعة الخدمات", { x: 0.65, y: 0.55, w: 11.8, h: 0.55, fontFace: "Aptos Display", fontSize: 26, bold: true, color: "10283F" });
slide.addText("Synthetic acceptance fixture — sample metrics only", { x: 0.68, y: 1.25, w: 10, h: 0.35, fontSize: 14, color: "526577" });
slide.addImage({ data: `data:image/svg+xml;base64,${svg.toString("base64")}`, x: 0.75, y: 2, w: 5.2, h: 2.92 });
slide.addText("Editable picture asset", { x: 0.75, y: 5.12, w: 5.2, h: 0.3, fontSize: 11, color: "526577", align: "center" });
slide.addChart(pptx.ChartType.bar, [{ name: "Completed", labels: ["Jan", "Feb", "Mar", "Apr", "May"], values: [82, 86, 84, 91, 94] }, { name: "Target", labels: ["Jan", "Feb", "Mar", "Apr", "May"], values: [90, 90, 90, 90, 90] }], {
  x: 6.3, y: 2, w: 6.1, h: 3.45, catAxisLabelFontFace: "Aptos", valAxisLabelFontFace: "Aptos",
  showLegend: true, showTitle: true, title: "Completion rate (%)", showValue: false, showCatName: false,
  chartColors: ["2D6A8A", "C5CFD8"], showCatName: false,
});
slide.addText("Illustration and chart should remain selectable and editable.", { x: 6.35, y: 5.63, w: 5.95, h: 0.3, fontSize: 11, color: "526577" });
slide = pptx.addSlide();
slide.addText("Review checklist", { x: 0.75, y: 0.7, w: 11, h: 0.6, fontSize: 28, bold: true, color: "10283F" });
slide.addText([{ text: "1. Confirm picture renders without clipping\n" }, { text: "2. Inspect native chart labels and legend\n" }, { text: "3. Reorder slides in Slide Sorter\n" }, { text: "4. Edit a chart value, save, and reopen", options: { breakLine: false } }], { x: 0.9, y: 1.8, w: 10.8, h: 3, fontSize: 22, breakLine: false, color: "263D50", valign: "mid", paraSpaceAfterPt: 14 });
await pptx.writeFile({ fileName: path.join(outDir, "05-picture-chart-presentation.pptx") });
console.log(`Created 5 synthetic Office fixtures in ${outDir}`);
