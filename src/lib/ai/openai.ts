import { outlineSchema, type AIProvider, type EditInput, type GenerateInput, type Outline } from "./types";

/**
 * OpenAI-compatible HTTP adapter. Only instantiated when the user explicitly
 * sets AI_PROVIDER=openai-compatible, AI_BASE_URL, and AI_API_KEY in server env.
 * All model responses are parsed and strictly validated with Zod.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly name = "openai-compatible";
  readonly isDemo = false;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  private async callChat(system: string, user: string, jsonMode: boolean): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    const endpoint = `${this.baseUrl.replace(/\/+$/, "")}/chat/completions`;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.4,
          ...(/^glm-5/i.test(this.model) ? { reasoning_effort: "low" } : {}),
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) {
        throw new Error(`ai_http_${res.status}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("ai_empty_response");
      return content;
    } finally {
      clearTimeout(timer);
    }
  }

  async generateOutline(
    input: GenerateInput,
    type: "presentation" | "document",
    language: "en" | "ar",
  ): Promise<Outline> {
    const langName = language === "ar" ? "Arabic (Modern Standard Arabic)" : "English";
    const system =
      type === "presentation"
        ? `You generate structured, executive-grade presentation outlines in JSON only. Return an object with keys: title (string), language ("en"|"ar"), slides (array of { title, subtitle, bullets (string[]), layout ("title"|"title-body"|"two-col"|"quote"), accentShape ("none"|"bar"|"card"|"badge"), chart (optional { kind ("bar"|"line"|"pie"), title, categories (string[]), values (number[]), unit (optional string) }), notes }). If the user requests a specific slide count (e.g. 12 slides), generate that exact count. Include realistic non-repetitive content and add chart objects on quantitative slides when metrics or charts are requested. Write all content in ${langName}.`
        : `You generate structured document outlines in JSON only. Return an object with keys: title (string), language ("en"|"ar"), blocks (array of { kind ("heading"|"paragraph"|"list"|"table"|"quote"|"chart"), level (1-3 for heading, 0 otherwise), text, ordered (boolean for list), items (string[] for list), rows (string[][] for table), chart (optional { kind ("bar"|"line"|"pie"), title, categories (string[]), values (number[]), unit (optional string) }) }). Write all content in ${langName}.`;

    const explicitMatch = input.prompt.match(/\b(\d{1,2})\s*[-–]?\s*slides?\b/i) ?? input.prompt.match(/(\d{1,2})\s*(?:شرائح|شريحة)/);
    const explicitSlides = explicitMatch?.[1]
      ? `${Math.min(15, Math.max(2, Number.parseInt(explicitMatch[1], 10)))} slides`
      : null;

    const countHint =
      type === "presentation"
        ? explicitSlides ?? { short: "3 slides", medium: "5 slides", long: "8 slides" }[input.length]
        : { short: "2 sections", medium: "4 sections", long: "6 sections" }[input.length];

    const userPrompt = [
      `Topic/Prompt: ${input.prompt}`,
      input.audience ? `Audience: ${input.audience}` : "",
      `Tone: ${input.tone}`,
      `Target length: ${countHint}`,
      `Language: ${language}`,
    ]
      .filter(Boolean)
      .join("\n");

    const raw = await this.callChat(system, userPrompt, true);
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    const parsedJson = JSON.parse(jsonMatch ? jsonMatch[0] : stripped) as Record<string, unknown>;

    const sanitizeChart = (rawChart: unknown) => {
      if (!rawChart || typeof rawChart !== "object") return undefined;
      const c = rawChart as Record<string, unknown>;
      const kind = c.kind === "line" || c.kind === "pie" || c.kind === "bar" ? c.kind : "bar";
      const cats = Array.isArray(c.categories) ? c.categories.map((x) => String(x).slice(0, 60)) : [];
      const vals = Array.isArray(c.values) ? c.values.map((x) => Number(x)).filter(Number.isFinite) : [];
      const n = Math.min(cats.length, vals.length, 10);
      if (n < 2) return undefined;
      return {
        kind,
        title: String(c.title ?? "Metrics").slice(0, 200),
        categories: cats.slice(0, n),
        values: vals.slice(0, n),
        unit: typeof c.unit === "string" && c.unit.trim() ? c.unit.trim().slice(0, 20) : undefined,
      };
    };

    const normalizeLayout = (rawLayout: unknown): "title" | "title-body" | "two-col" | "quote" => {
      const v = typeof rawLayout === "string" ? rawLayout.toLowerCase().trim() : "";
      if (v === "title" || v === "cover" || v === "closing" || v === "hero") return "title";
      if (v === "two-col" || v === "two_col" || v === "two-column" || v === "split" || v === "comparison") {
        return "two-col";
      }
      if (v === "quote" || v === "testimonial") return "quote";
      return "title-body";
    };

    const normalizeShape = (rawShape: unknown): "none" | "bar" | "card" | "badge" => {
      const v = typeof rawShape === "string" ? rawShape.toLowerCase().trim() : "";
      if (v === "none" || v === "bar" || v === "card" || v === "badge") return v;
      if (v === "pill" || v === "tag") return "badge";
      if (v === "box" || v === "frame") return "card";
      return "bar";
    };

    if (typeof parsedJson.title !== "string" || !parsedJson.title.trim()) {
      parsedJson.title = input.prompt.trim().slice(0, 120) || "Untitled Project";
    } else {
      parsedJson.title = parsedJson.title.trim().slice(0, 200);
    }

    if (Array.isArray(parsedJson.slides)) {
      parsedJson.slides = parsedJson.slides.map((sl, idx) => {
        if (!sl || typeof sl !== "object") {
          return { title: `Slide ${idx + 1}`, subtitle: "", bullets: [], layout: "title-body", accentShape: "bar", notes: "" };
        }
        const rawSlide = sl as Record<string, unknown>;
        const bullets = Array.isArray(rawSlide.bullets)
          ? rawSlide.bullets
              .filter((b) => b != null && String(b).trim().length > 0)
              .slice(0, 12)
              .map((b) => String(b).slice(0, 500))
          : [];
        return {
          title: typeof rawSlide.title === "string" && rawSlide.title.trim() ? rawSlide.title.slice(0, 500) : `Slide ${idx + 1}`,
          subtitle: typeof rawSlide.subtitle === "string" ? rawSlide.subtitle.slice(0, 1000) : "",
          bullets,
          layout: normalizeLayout(rawSlide.layout),
          accentShape: normalizeShape(rawSlide.accentShape),
          chart: sanitizeChart(rawSlide.chart),
          notes: typeof rawSlide.notes === "string" ? rawSlide.notes.slice(0, 5000) : "",
        };
      });
    }
    if (Array.isArray(parsedJson.blocks)) {
      const allowedKinds = new Set(["heading", "paragraph", "list", "table", "quote", "chart"]);
      parsedJson.blocks = parsedJson.blocks.map((bl) => {
        if (!bl || typeof bl !== "object") {
          return { kind: "paragraph", level: 0, text: "" };
        }
        const rawBlock = bl as Record<string, unknown>;
        let kind = typeof rawBlock.kind === "string" && allowedKinds.has(rawBlock.kind) ? rawBlock.kind : "paragraph";
        const chart = kind === "chart" ? sanitizeChart(rawBlock.chart) : undefined;
        if (kind === "chart" && !chart) kind = "paragraph";
        const rawLevel = Number(rawBlock.level);
        const level = Number.isInteger(rawLevel) ? Math.min(6, Math.max(0, rawLevel)) : kind === "heading" ? 2 : 0;
        const items =
          kind === "list" && Array.isArray(rawBlock.items)
            ? rawBlock.items.slice(0, 100).map((it) => String(it ?? "").slice(0, 2000))
            : undefined;
        const rows =
          kind === "table" && Array.isArray(rawBlock.rows)
            ? rawBlock.rows
                .slice(0, 50)
                .map((r) => (Array.isArray(r) ? r.slice(0, 12).map((c) => String(c ?? "").slice(0, 1000)) : []))
            : undefined;
        return {
          kind,
          level,
          text: typeof rawBlock.text === "string" ? rawBlock.text.slice(0, 20_000) : "",
          ordered: kind === "list" ? Boolean(rawBlock.ordered) : undefined,
          items,
          rows,
          chart,
        };
      });
    }
    if (parsedJson.language !== "en" && parsedJson.language !== "ar") {
      parsedJson.language = language;
    }

    return outlineSchema.parse(parsedJson);
  }

  async editText(input: EditInput): Promise<{ text: string }> {
    const opInstruction: Record<EditInput["operation"], string> = {
      rewrite: "Rewrite the text clearly while preserving its meaning and language.",
      shorten: "Shorten the text concisely while keeping key facts and the original language.",
      expand: "Expand the text with helpful detail and one concrete example in the same language.",
      translate: `Translate the text accurately to ${input.targetLang === "ar" ? "Arabic" : "English"}.`,
      tone: "Polish the tone to sound clear, confident, and professional in the same language.",
    };

    const out = await this.callChat(
      `${opInstruction[input.operation]} Return only the edited text with no extra commentary.`,
      input.text,
      false,
    );
    return { text: out.slice(0, 20_000) };
  }
}
