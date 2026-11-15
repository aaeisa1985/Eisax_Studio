import type { AIProvider, EditInput, GenerateInput, Outline } from "./types";

/**
 * Deterministic offline provider — no network calls, stable output for the same
 * input (hash-seeded). Clearly marked as demo everywhere it appears in the UI.
 */

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pick<T>(arr: readonly T[], seed: number, offset = 0): T {
  return arr[(seed + offset) % arr.length]!;
}

const EN_TOPIC_HINTS = [
  "Core concept and why it matters",
  "Key benefits and measurable impact",
  "How it works in practice",
  "Common mistakes to avoid",
  "Actionable roadmap to get started",
  "What success looks like",
  "Next steps & open discussion",
];
const AR_TOPIC_HINTS = [
  "المفهوم الأساسي وأهميته",
  "الفوائد الرئيسية والأثر العملي",
  "كيف يعمل على أرض الواقع",
  "أخطاء شائعة يجب تجنبها",
  "خطة عملية للبدء",
  "مؤشرات النجاح والنتائج",
  "الخطوات التالية والمناقشة",
];

const SLIDE_COUNT: Record<GenerateInput["length"], number> = { short: 3, medium: 5, long: 8 };

export class DemoProvider implements AIProvider {
  readonly name = "demo";
  readonly model = "demo-deterministic-v1";
  readonly isDemo = true;

  async generateOutline(
    input: GenerateInput,
    type: "presentation" | "document",
    language: "en" | "ar",
  ): Promise<Outline> {
    const seed = hashStr(
      `${input.prompt}|${input.audience ?? ""}|${type}|${language}|${input.tone}|${input.length}`,
    );
    const title = input.prompt.length <= 80 ? input.prompt : `${input.prompt.slice(0, 77)}…`;
    const hints = language === "ar" ? AR_TOPIC_HINTS : EN_TOPIC_HINTS;
    const audienceNote = input.audience?.trim()
      ? language === "ar"
        ? `موجّه إلى: ${input.audience.trim()}`
        : `Tailored for: ${input.audience.trim()}`
      : "";

    if (type === "presentation") {
      const count = SLIDE_COUNT[input.length];
      const slides = Array.from({ length: count }, (_, i) => {
        if (i === 0) {
          return {
            title,
            subtitle:
              language === "ar"
                ? `${audienceNote ? `${audienceNote} · ` : ""}${pick(hints, seed, i)}`
                : `${audienceNote ? `${audienceNote} · ` : ""}A ${input.tone} overview`,
            bullets: [],
            layout: "title" as const,
            accentShape: "badge" as const,
            notes:
              language === "ar"
                ? "ابدأ بسؤال يشدّ الجمهور ثم اعرض الفكرة الرئيسية."
                : "Open with a hook question, then state the core idea.",
          };
        }

        if (i === count - 1 && count >= 4) {
          return {
            title: language === "ar" ? "الخلاصة والخطوة التالية" : "Key takeaway",
            subtitle: audienceNote || (language === "ar" ? "التركيز على التنفيذ" : "Focus on execution"),
            bullets: [],
            layout: "quote" as const,
            accentShape: "card" as const,
            notes:
              language === "ar"
                ? "اختم بدعوة واضحة للخطوة القادمة."
                : "Close with one clear call to action.",
          };
        }

        const hint = hints[(i - 1) % hints.length]!;
        const layout = i % 3 === 0 ? ("two-col" as const) : ("title-body" as const);
        const bullets =
          language === "ar"
            ? [
                `تحديد الأولويات المرتبطة بـ «${title}» بوضوح.`,
                `تطبيق عملي يعكس ${hint}.`,
                `قياس التقدم عبر مؤشرات بسيطة ومحددة.`,
                ...(layout === "two-col" ? [`مراجعة المخاطر والبدائل قبل التوسع.`] : []),
              ]
            : [
                `Clarify priorities around "${title}".`,
                `Apply practical steps for ${hint.toLowerCase()}.`,
                `Measure progress with simple, trackable milestones.`,
                ...(layout === "two-col" ? [`Review trade-offs and mitigation steps early.`] : []),
              ];

        return {
          title: `${i + 1}. ${hint}`,
          subtitle: audienceNote,
          bullets,
          layout,
          accentShape: i % 2 === 0 ? ("card" as const) : ("bar" as const),
          notes:
            language === "ar"
              ? "اذكر مثالًا واقعيًا واحدًا على الأقل."
              : "Include at least one concrete example.",
        };
      });
      return { title, language, slides };
    }

    // Document outline: headings, paragraphs, list, table, quote
    const sectionCount = { short: 2, medium: 4, long: 6 }[input.length];
    const blocks: NonNullable<Outline["blocks"]> = [
      { kind: "heading", level: 1, text: title },
      {
        kind: "paragraph",
        level: 0,
        text:
          language === "ar"
            ? `**ملخص تمهيدي:** يقدّم هذا المستند نظرة منظّمة حول «${title}»${audienceNote ? ` (${audienceNote})` : ""} بأسلوب ${input.tone === "formal" ? "رسمي" : "واضح ومباشر"}.`
            : `**Overview:** This document provides a structured guide to "${title}"${audienceNote ? ` (${audienceNote})` : ""} in a ${input.tone} style.`,
      },
    ];

    for (let i = 0; i < sectionCount; i++) {
      const hint = hints[i % hints.length]!;
      blocks.push({ kind: "heading", level: 2, text: hint });
      blocks.push({
        kind: "paragraph",
        level: 0,
        text:
          language === "ar"
            ? `يتناول هذا القسم ${hint} بالنسبة إلى «${title}» مع خطوات واضحة قابلة للتنفيذ والتعديل.`
            : `This section covers ${hint.toLowerCase()} in relation to "${title}", highlighting actionable steps and clear trade-offs.`,
      });
      if (i === 0) {
        blocks.push({
          kind: "list",
          level: 0,
          text: "",
          ordered: false,
          items:
            language === "ar"
              ? [
                  `تحديد الهدف الرئيسي ونطاق العمل`,
                  `توزيع المسؤوليات والجدول الزمني`,
                  `اعتماد معايير المراجعة والجودة`,
                ]
              : [
                  "Define the core objective and scope",
                  "Align ownership and timeline milestones",
                  "Establish clear review and quality criteria",
                ],
        });
      }
      if (i === 1) {
        blocks.push({
          kind: "table",
          level: 0,
          text: "",
          rows:
            language === "ar"
              ? [
                  ["المرحلة", "المخرج الأساسي", "المؤشر"],
                  ["التأسيس", "هيكل واضح ومعتمد", "اكتمال المراجعة"],
                  ["التنفيذ", "نموذج قابل للتحرير والتصدير", "جاهزية التسليم"],
                ]
              : [
                  ["Phase", "Deliverable", "Success Metric"],
                  ["Foundation", "Approved structure", "Review sign-off"],
                  ["Execution", "Editable & export-ready draft", "Delivery readiness"],
                ],
        });
      }
    }

    blocks.push({
      kind: "quote",
      level: 0,
      text:
        language === "ar"
          ? "الوضوح في الهيكلة يجعل التحرير والمراجعة أسرع وأكثر دقة."
          : "Clear structure makes editing, alignment, and delivery faster.",
    });

    return { title, language, blocks };
  }

  async editText(input: EditInput): Promise<{ text: string }> {
    const text = input.text;
    const seed = hashStr(text);
    switch (input.operation) {
      case "rewrite":
        return { text: polish(text) };
      case "shorten": {
        const sentences = text.split(/(?<=[.!?؟])\s+/).filter(Boolean);
        return {
          text: (sentences.slice(0, Math.max(1, Math.ceil(sentences.length / 2))).join(" ") || text).trim(),
        };
      }
      case "expand": {
        const isArabic = /[\u0600-\u06FF]/.test(text);
        const extra = isArabic
          ? " وبعبارة أخرى، يظهر أثر هذه النقطة بوضوح عند تطبيقها مع مثال عملي محدد."
          : seed % 2 === 0
            ? " In other words: the same idea, said more fully, with one concrete example."
            : " To put it differently: the point matters most when applied in practice.";
        return { text: `${text}${/[.!?؟]$/.test(text) ? "" : "."}${extra}` };
      }
      case "translate": {
        const target = input.targetLang ?? "en";
        if (target === "ar") {
          if (/[\u0600-\u06FF]/.test(text)) return { text };
          return { text: `ترجمة تجريبية: ${text}` };
        }
        if (!/[\u0600-\u06FF]/.test(text)) return { text };
        return { text: `Demo translation: ${text}` };
      }
      case "tone":
        return { text: polish(text) };
    }
  }
}

/** Deterministic light rewrite: collapses spacing, fixes punctuation gaps, ensures capital start (Latin). */
function polish(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").replace(/\s([,.!?؟])/g, "$1").trim();
  if (cleaned.length === 0) return cleaned;
  return cleaned.charAt(0).toLocaleUpperCase() + cleaned.slice(1);
}
