"use client";

import { useState } from "react";
import { aiGenerateAction, aiEditAction } from "@/app/ai-actions";
import { type Locale } from "@/lib/i18n";

type AiResult = {
  ok: boolean;
  error?: string;
  text?: string;
  used?: number;
  limit?: number;
};

const OPS = ["rewrite", "shorten", "expand", "translate", "tone"] as const;
type Op = (typeof OPS)[number];

export function opLabel(op: Op, locale: Locale): string {
  const ar: Record<Op, string> = {
    rewrite: "إعادة صياغة",
    shorten: "اختصار",
    expand: "توسيع",
    translate: "ترجمة",
    tone: "تغيير النبرة",
  };
  const en: Record<Op, string> = {
    rewrite: "Rewrite",
    shorten: "Shorten",
    expand: "Expand",
    translate: "Translate",
    tone: "Change tone",
  };
  return locale === "ar" ? ar[op] : en[op];
}

export function errorLabel(error: string | undefined, locale: Locale): string {
  const ar: Record<string, string> = {
    quota_exceeded: "انتهت حصة الخطة المجانية لهذا الشهر.",
    rate_limited: "طلبات كثيرة جدًا — انتظر قليلًا.",
    failed: "تعذّر تنفيذ العملية. لم يتغير المحتوى.",
    invalid_input: "إدخال غير صالح.",
    not_found: "المشروع غير موجود.",
  };
  const en: Record<string, string> = {
    quota_exceeded: "Free-plan AI quota exhausted for this month.",
    rate_limited: "Too many requests — wait a moment.",
    failed: "Operation failed. Your content was not changed.",
    invalid_input: "Invalid input.",
    not_found: "Project not found.",
  };
  const map = locale === "ar" ? ar : en;
  return map[error ?? "failed"] ?? error ?? "Error";
}

export function ErrorNote({ error, locale }: { error: string | undefined; locale: Locale }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="mt-2 rounded-lg border p-2.5 text-xs"
      style={{ borderColor: "#4a2430", background: "rgba(90,22,38,0.22)", color: "#ff9b9b" }}
    >
      {errorLabel(error, locale)}
      {error === "quota_exceeded" && (
        <span className="ms-1" style={{ color: "var(--text-dim)" }}>
          {locale === "ar"
            ? "الترقية تُفعَّل لاحقًا بعد اعتماد الفوترة."
            : "Upgrades become available once billing is approved."}
        </span>
      )}
    </p>
  );
}

/** Per-element AI edit with explicit preview + apply/undo and inline error reporting. */
export function AiMenu({
  projectId,
  text,
  targetLang,
  locale,
  label,
  onApply,
  onUsageChange,
}: {
  projectId: string;
  text: string;
  targetLang?: "en" | "ar";
  locale: Locale;
  label?: string;
  onApply: (next: string) => void;
  onUsageChange?: (usage: { used: number; limit: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Op | null>(null);
  const [preview, setPreview] = useState<{ op: Op; original: string; next: string } | null>(null);
  const [error, setError] = useState<string | undefined>();

  async function run(op: Op) {
    setBusy(op);
    setError(undefined);
    const inferredTarget =
      targetLang ?? (/[\u0600-\u06FF]/.test(text) ? "en" : "ar");
    const res: AiResult = await aiEditAction({
      projectId,
      operation: op,
      text,
      targetLang: op === "translate" ? inferredTarget : undefined,
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (typeof res.used === "number" && typeof res.limit === "number") {
      onUsageChange?.({ used: res.used, limit: res.limit });
    }
    setPreview({ op, original: text, next: res.text! });
  }

  return (
    <span className="relative inline-flex flex-col items-start">
      <button
        type="button"
        className="btn btn-ghost !px-2 !py-0.5 text-xs"
        aria-haspopup="menu"
        aria-expanded={open}
        title={locale === "ar" ? "مساعد الذكاء الاصطناعي" : "AI assist"}
        onClick={() => {
          setError(undefined);
          setOpen((v) => !v);
        }}
      >
        ✨ {label ?? "AI"}
      </button>
      {open && (
        <span
          role="menu"
          className="absolute top-8 z-30 flex min-w-40 flex-col overflow-hidden rounded-lg border shadow-xl"
          style={{ background: "var(--obsidian-2)", borderColor: "var(--border)" }}
          onMouseLeave={() => setOpen(false)}
        >
          {OPS.map((op) => (
            <button
              key={op}
              type="button"
              role="menuitem"
              disabled={busy !== null || text.trim().length === 0}
              className="block w-full px-3 py-2 text-start text-xs hover:bg-white/5 disabled:opacity-40"
              style={{ color: "var(--text)" }}
              onClick={() => {
                setOpen(false);
                void run(op);
              }}
            >
              {opLabel(op, locale)}
              {busy === op && " …"}
            </button>
          ))}
        </span>
      )}

      {error && !preview && (
        <div className="mt-1 max-w-xs">
          <ErrorNote error={error} locale={locale} />
        </div>
      )}

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(2,6,12,0.72)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreview(null);
          }}
        >
          <div className="card w-full max-w-lg p-5" style={{ color: "var(--text)" }}>
            <h3 className="text-sm font-bold">
              {opLabel(preview.op, locale)}
            </h3>
            <div className="mt-3 max-h-72 space-y-3 overflow-auto text-sm">
              <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                <p className="mb-1 text-xs font-bold" style={{ color: "var(--text-dim)" }}>
                  {locale === "ar" ? "قبل" : "Before"}
                </p>
                <p dir="auto" style={{ color: "var(--text-dim)" }}>
                  {preview.original || "—"}
                </p>
              </div>
              <div className="rounded-lg border p-3" style={{ borderColor: "rgba(0,212,200,0.4)" }}>
                <p className="mb-1 text-xs font-bold" style={{ color: "var(--turquoise)" }}>
                  {locale === "ar" ? "بعد" : "After"}
                </p>
                <p dir="auto">{preview.next || "—"}</p>
              </div>
            </div>
            <ErrorNote error={error} locale={locale} />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost text-sm" onClick={() => setPreview(null)}>
                {locale === "ar" ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="button"
                className="btn btn-primary text-sm"
                onClick={() => {
                  onApply(preview.next);
                  setPreview(null);
                }}
              >
                {locale === "ar" ? "تطبيق" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

/** Generate full content from a prompt via configured AI provider (or deterministic demo fallback). */
export function AiGeneratePanel({
  projectId,
  locale,
  usage,
  theme,
  onGenerated,
  onUsageChange,
}: {
  projectId: string;
  locale: Locale;
  usage: { used: number; limit: number };
  theme?: string;
  onGenerated: (content: unknown) => void;
  onUsageChange?: (usage: { used: number; limit: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [statusNote, setStatusNote] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setBusy(true);
    setError(undefined);
    setStatusNote(null);
    const res = await aiGenerateAction({
      projectId,
      prompt: String(formData.get("prompt") ?? ""),
      audience: String(formData.get("audience") ?? "").trim() || undefined,
      tone: String(formData.get("tone") ?? "friendly"),
      length: String(formData.get("length") ?? "medium"),
      theme,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      if (typeof res.used === "number" && typeof res.limit === "number") {
        onUsageChange?.({ used: res.used, limit: res.limit });
      }
      return;
    }
    onUsageChange?.({ used: res.used, limit: res.limit });
    onGenerated(res.content);
    setStatusNote(
      res.providerDemo
        ? locale === "ar"
          ? "تم التوليد عبر الوضع التجريبي المحلي (لتشغيل نموذج حقيقي أضف AI_API_KEY في .env.local)."
          : "Generated with Offline Demo mode (configure AI_API_KEY in .env.local for live LLM generation)."
        : locale === "ar"
          ? "تم التوليد عبر نموذج الذكاء الاصطناعي المباشر."
          : "Generated with Live AI provider.",
    );
    setOpen(false);
  }

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="btn btn-primary w-full justify-center !py-1.5 text-xs"
          onClick={() => setOpen((v) => !v)}
        >
          ✨ {locale === "ar" ? "توليد بالذكاء الاصطناعي" : "Generate with AI"}
        </button>
      </div>
      {statusNote && (
        <p className="mt-1.5 text-[11px]" style={{ color: "var(--turquoise)" }}>
          {statusNote}
        </p>
      )}
      {open && (
        <form action={submit} className="card mt-2 space-y-2.5 p-3">
          <p className="text-xs" style={{ color: "var(--text-dim)" }} dir="auto">
            {locale === "ar" ? "الحصة الشهرية: " : "Monthly quota: "}
            <strong>
              {usage.used}/{usage.limit}
            </strong>
          </p>
          <textarea
            name="prompt"
            required
            minLength={3}
            maxLength={2000}
            rows={3}
            dir="auto"
            className="input text-sm"
            placeholder={
              locale === "ar"
                ? "مثال: عرض عن فوائد الطاقة الشمسية لطلاب الجامعة…"
                : "e.g. A presentation about solar energy benefits for students…"
            }
          />
          <input
            name="audience"
            maxLength={200}
            dir="auto"
            className="input !py-1.5 text-xs"
            placeholder={locale === "ar" ? "الجمهور المستهدف (اختياري)" : "Target audience (optional)"}
          />
          <div className="flex gap-2">
            <select
              name="tone"
              defaultValue="friendly"
              className="input !py-1.5 text-xs"
              aria-label={locale === "ar" ? "النبرة" : "Tone"}
            >
              {(["friendly", "formal", "persuasive", "educational"] as const).map((tone) => (
                <option key={tone} value={tone}>
                  {locale === "ar"
                    ? { friendly: "ودّية", formal: "رسمية", persuasive: "إقناعية", educational: "تعليمية" }[tone]
                    : { friendly: "Friendly", formal: "Formal", persuasive: "Persuasive", educational: "Educational" }[tone]}
                </option>
              ))}
            </select>
            <select
              name="length"
              defaultValue="medium"
              className="input !py-1.5 text-xs"
              aria-label={locale === "ar" ? "الطول" : "Length"}
            >
              {(["short", "medium", "long"] as const).map((len) => (
                <option key={len} value={len}>
                  {locale === "ar"
                    ? { short: "قصير", medium: "متوسط", long: "طويل" }[len]
                    : { short: "Short", medium: "Medium", long: "Long" }[len]}
                </option>
              ))}
            </select>
          </div>
          <ErrorNote error={error} locale={locale} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost text-xs" onClick={() => setOpen(false)}>
              {locale === "ar" ? "إغلاق" : "Close"}
            </button>
            <button type="submit" disabled={busy} className="btn btn-primary text-xs">
              {busy ? (locale === "ar" ? "جارٍ التوليد…" : "Generating…") : locale === "ar" ? "توليد" : "Generate"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
