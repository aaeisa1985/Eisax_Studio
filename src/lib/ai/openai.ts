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

    const countHint =
      type === "presentation"
        ? { short: "3 slides", medium: "5 slides", long: "8 slides" }[input.length]
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

    if (Array.isArray(parsedJson.slides)) {
      parsedJson.slides = parsedJson.slides.map((sl) => {
        if (!sl || typeof sl !== "object") return sl;
        const s = { ...(sl as Record<string, unknown>) };
        if (Array.isArray(s.bullets)) {
          s.bullets = s.bullets.slice(0, 12).map((b) => String(b).slice(0, 500));
        }
        s.chart = sanitizeChart(s.chart);
        return s;
      });
    }
    if (Array.isArray(parsedJson.blocks)) {
      parsedJson.blocks = parsedJson.blocks.map((bl) => {
        if (!bl || typeof bl !== "object") return bl;
        const b = { ...(bl as Record<string, unknown>) };
        if (b.kind === "chart") {
          const clean = sanitizeChart(b.chart);
          if (!clean) b.kind = "paragraph";
          b.chart = clean;
        } else {
          delete b.chart;
        }
        return b;
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
