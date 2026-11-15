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
  "definition and why it matters",
  "key benefits",
  "how it works in practice",
  "common mistakes to avoid",
  "a simple plan to get started",
  "what success looks like",
];
const AR_TOPIC_HINTS = [
  "التعريف وأهميته",
  "الفوائد الرئيسية",
  "كيف يعمل عمليًا",
  "أخطاء شائعة يجب تجنبها",
  "خطة بسيطة للبدء",
  "كيف يبدو النجاح",
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
    const seed = hashStr(`${input.prompt}|${type}|${language}|${input.tone}|${input.length}`);
    const title = input.prompt.length <= 80 ? input.prompt : `${input.prompt.slice(0, 77)}…`;
    const hints = language === "ar" ? AR_TOPIC_HINTS : EN_TOPIC_HINTS;

    if (type === "presentation") {
      const count = SLIDE_COUNT[input.length];
      const slides = Array.from({ length: count }, (_, i) => {
        if (i === 0) {
          return {
            title: title,
            subtitle:
              language === "ar"
                ? `${pick(hints, seed, i)} · ${input.tone === "formal" ? "عرض رسمي" : "عرض ودّي"}`
                : `A ${input.tone} overview · ${pick(hints, seed, i)}`,
            notes:
              language === "ar"
                ? "ابدأ بسؤال يشدّ الجمهور ثم اعرض الفكرة الرئيسية."
                : "Open with a hook question, then state the core idea.",
          };
        }
        return {
          title: `${i + 1}. ${hints[i % hints.length]}`,
          subtitle: "",
          notes:
            language === "ar"
              ? "اذكر مثالًا واقعيًا واحدًا على الأقل."
              : "Include at least one concrete example.",
        };
      });
      return { title, language, slides };
    }

    // Document outline
    const count = { short: 3, medium: 5, long: 7 }[input.length];
    const blocks: Outline["blocks"] = [
      { kind: "heading", level: 1, text: title },
    ];
    for (let i = 0; i < count - 1; i++) {
      blocks.push({ kind: "heading", level: 2, text: hints[i % hints.length]! });
      blocks.push({
        kind: "paragraph",
        level: 0,
        text:
          language === "ar"
            ? `يتناول هذا القسم ${hints[i % hints.length]} بالنسبة إلى «${title}» بأسلوب ${input.tone === "formal" ? "رسمي" : "ودّي"} ومقروء، مع أمثلة توضيحية قصيرة وخاتمة موجزة.`
            : `This section covers ${hints[i % hints.length]} in relation to “${title}”, in a ${input.tone} readable style, with short illustrative examples and a brief wrap-up.`,
      });
    }
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
        return { text: (sentences.slice(0, Math.max(1, Math.ceil(sentences.length / 2))).join(" ") || text).trim() };
      }
      case "expand": {
        const extra =
          seed % 2 === 0
            ? " In other words: the same idea, said more fully, with one concrete example."
            : " To put it differently: the point matters most when applied in practice.";
        return { text: `${text}${text.endsWith(".") ? "" : "."}${extra}` };
      }
      case "translate": {
        const target = input.targetLang ?? "en";
        if (target === "ar") {
          if (/[\u0600-\u06FF]/.test(text)) return { text }; // already Arabic
          return { text: `ترجمة تجريبية: ${text}` };
        }
        if (!/[\u0600-\u06FF]/.test(text)) return { text }; // already Latin
        return { text: `Demo translation: ${text}` };
      }
      case "tone": {
        return { text: polish(text) };
      }
    }
  }
}

/** Deterministic light rewrite: collapses spacing, fixes punctuation gaps, ensures capital start (Latin). */
function polish(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").replace(/\s([,.!?؟])/g, "$1").trim();
  if (cleaned.length === 0) return cleaned;
  return cleaned.charAt(0).toLocaleUpperCase() + cleaned.slice(1);
}
