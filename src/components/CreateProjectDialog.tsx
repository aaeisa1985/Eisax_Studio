"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProjectAction, createProjectFromTemplateAction } from "@/app/project-actions";
import { aiCreateProjectFromOutlineAction, aiPreviewOutlineAction } from "@/app/ai-actions";
import { ErrorNote } from "@/components/AiAssist";
import { SLIDE_THEMES, type SlideThemeId } from "@/lib/projects/themes";
import { STARTER_TEMPLATES } from "@/lib/projects/templates";
import type { Outline } from "@/lib/ai/types";
import { t, type Locale } from "@/lib/i18n";

export function CreateProjectDialog({
  locale,
  initialUsage,
}: {
  locale: Locale;
  initialUsage?: { used: number; limit: number };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"ai" | "templates" | "blank">("ai");
  const [type, setType] = useState<"presentation" | "document">("presentation");
  const [language, setLanguage] = useState<"en" | "ar">(locale === "ar" ? "ar" : "en");
  const [prompt, setPrompt] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState<"friendly" | "formal" | "persuasive" | "educational">("friendly");
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [theme, setTheme] = useState<SlideThemeId>("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [outline, setOutline] = useState<Outline | null>(null);
  const [outlineTitle, setOutlineTitle] = useState("");
  const [providerDemo, setProviderDemo] = useState(true);
  const [usage, setUsage] = useState(initialUsage ?? { used: 0, limit: 20 });

  const tr = (k: Parameters<typeof t>[1]) => t(locale, k);
  const ar = locale === "ar";

  function resetWizard() {
    setOutline(null);
    setError(undefined);
    setBusy(false);
  }

  async function handleGenerateOutline(e: React.FormEvent) {
    e.preventDefault();
    if (prompt.trim().length < 3) return;
    setBusy(true);
    setError(undefined);
    const res = await aiPreviewOutlineAction({
      type,
      language,
      prompt: prompt.trim(),
      audience: audience.trim() || undefined,
      tone,
      length,
      theme,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      if (typeof res.used === "number" && typeof res.limit === "number") {
        setUsage({ used: res.used, limit: res.limit });
      }
      return;
    }
    setUsage({ used: res.used, limit: res.limit });
    setProviderDemo(res.providerDemo);
    setOutline(res.outline);
    setOutlineTitle(res.outline.title);
  }

  async function handleCreateFromOutline() {
    if (!outline) return;
    setBusy(true);
    setError(undefined);
    const res = await aiCreateProjectFromOutlineAction({
      title: outlineTitle.trim() || outline.title,
      type,
      language,
      theme,
      outline: { ...outline, title: outlineTitle.trim() || outline.title },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    resetWizard();
    router.push(`/projects/${res.projectId}`);
  }

  async function handleSelectTemplate(templateId: string) {
    setBusy(true);
    setError(undefined);
    const res = await createProjectFromTemplateAction(templateId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    resetWizard();
    router.push(`/projects/${res.projectId}`);
  }

  return (
    <>
      <button type="button" className="btn btn-primary text-sm" onClick={() => setOpen(true)}>
        + {tr("newProject")}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={tr("newProject")}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(2,6,12,0.75)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setOpen(false);
              resetWizard();
            }
          }}
        >
          <div
            className="card max-h-[90dvh] w-full max-w-xl overflow-y-auto p-6"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                resetWizard();
              }
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{tr("newProject")}</h2>
              <button
                type="button"
                className="btn btn-ghost !px-2.5 !py-1 text-sm"
                aria-label="Close"
                onClick={() => {
                  setOpen(false);
                  resetWizard();
                }}
              >
                ✕
              </button>
            </div>

            <div className="mb-5 grid grid-cols-3 gap-1.5 rounded-xl border p-1" style={{ borderColor: "var(--border)" }}>
              <button
                type="button"
                className={`rounded-lg py-2 text-xs font-semibold transition-colors ${mode === "ai" ? "btn-primary" : ""}`}
                style={mode === "ai" ? undefined : { color: "var(--text-dim)" }}
                onClick={() => {
                  setMode("ai");
                  setError(undefined);
                }}
              >
                ✨ {ar ? "بالذكاء الاصطناعي" : "Create with AI"}
              </button>
              <button
                type="button"
                className={`rounded-lg py-2 text-xs font-semibold transition-colors ${mode === "templates" ? "btn-primary" : ""}`}
                style={mode === "templates" ? undefined : { color: "var(--text-dim)" }}
                onClick={() => {
                  setMode("templates");
                  setError(undefined);
                }}
              >
                ▤ {ar ? "القوالب" : "Templates"}
              </button>
              <button
                type="button"
                className={`rounded-lg py-2 text-xs font-semibold transition-colors ${mode === "blank" ? "btn-primary" : ""}`}
                style={mode === "blank" ? undefined : { color: "var(--text-dim)" }}
                onClick={() => {
                  setMode("blank");
                  setError(undefined);
                }}
              >
                + {ar ? "فارغ" : "Blank"}
              </button>
            </div>

            {mode === "templates" ? (
              <div className="space-y-3">
                <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                  {ar ? "ابدأ فورًا من قالب منظم قابل للتعديل والتصدير:" : "Start immediately from a structured, editable template:"}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {STARTER_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      disabled={busy}
                      onClick={() => void handleSelectTemplate(tpl.id)}
                      className="card card-hover p-4 text-start"
                    >
                      <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--turquoise)" }}>
                        {tpl.type === "presentation" ? `▦ ${tr("presentation")}` : `📄 ${tr("document")}`} · {tpl.language.toUpperCase()}
                      </span>
                      <p className="mt-1.5 text-sm font-bold" dir="auto">
                        {ar ? tpl.nameAr : tpl.nameEn}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-dim)" }} dir="auto">
                        {ar ? tpl.descAr : tpl.descEn}
                      </p>
                    </button>
                  ))}
                </div>
                <ErrorNote error={error} locale={locale} />
              </div>
            ) : mode === "blank" ? (
              <form action={createProjectAction} className="space-y-4">
                <div>
                  <label htmlFor="np-title" className="mb-1 block text-sm font-medium">
                    {tr("title")}
                  </label>
                  <input
                    id="np-title"
                    name="title"
                    required
                    maxLength={200}
                    dir="auto"
                    className="input"
                    placeholder={ar ? "عنوان المشروع" : "Project title"}
                  />
                </div>
                <div>
                  <span className="mb-1 block text-sm font-medium">{ar ? "النوع" : "Type"}</span>
                  <div className="flex gap-2">
                    <label className="card flex flex-1 cursor-pointer items-center gap-2 p-3 text-sm">
                      <input type="radio" name="type" value="presentation" defaultChecked />
                      ▦ {tr("presentation")}
                    </label>
                    <label className="card flex flex-1 cursor-pointer items-center gap-2 p-3 text-sm">
                      <input type="radio" name="type" value="document" />
                      📄 {tr("document")}
                    </label>
                  </div>
                </div>
                <div>
                  <label htmlFor="np-language" className="mb-1 block text-sm font-medium">
                    {tr("language")}
                  </label>
                  <select id="np-language" name="language" defaultValue={language} className="input">
                    <option value="en">English</option>
                    <option value="ar">العربية</option>
                  </select>
                </div>
                <button type="submit" className="btn btn-primary w-full justify-center">
                  {tr("createProject")}
                </button>
              </form>
            ) : !outline ? (
              <form onSubmit={handleGenerateOutline} className="space-y-4">
                <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-dim)" }}>
                  <span>{ar ? "الخطوة ١ من ٢: صف مشروعك" : "Step 1 of 2: Describe your project"}</span>
                  <span>
                    {ar ? "الحصة: " : "Quota: "}
                    {usage.used}/{usage.limit}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="card flex items-center justify-center gap-2 p-3 text-sm font-medium"
                    style={{
                      borderColor: type === "presentation" ? "var(--turquoise)" : "var(--border)",
                      background: type === "presentation" ? "rgba(0,212,200,0.08)" : undefined,
                    }}
                    onClick={() => setType("presentation")}
                  >
                    ▦ {tr("presentation")}
                  </button>
                  <button
                    type="button"
                    className="card flex items-center justify-center gap-2 p-3 text-sm font-medium"
                    style={{
                      borderColor: type === "document" ? "var(--turquoise)" : "var(--border)",
                      background: type === "document" ? "rgba(0,212,200,0.08)" : undefined,
                    }}
                    onClick={() => setType("document")}
                  >
                    📄 {tr("document")}
                  </button>
                </div>

                <div>
                  <label htmlFor="ai-prompt" className="mb-1 block text-sm font-medium">
                    {ar ? "ماذا تريد أن تنشئ؟" : "What do you want to create?"}
                  </label>
                  <textarea
                    id="ai-prompt"
                    required
                    minLength={3}
                    maxLength={2000}
                    rows={3}
                    dir="auto"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="input text-sm"
                    placeholder={
                      ar
                        ? "مثال: عرض تقديمي عن استراتيجية الطاقة المتجددة في الخليج لعام 2026"
                        : "e.g. A 5-slide pitch on solar energy adoption in GCC universities"
                    }
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="ai-lang" className="mb-1 block text-xs font-medium">
                      {tr("language")}
                    </label>
                    <select
                      id="ai-lang"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as "en" | "ar")}
                      className="input !py-1.5 text-sm"
                    >
                      <option value="en">English</option>
                      <option value="ar">العربية</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ai-audience" className="mb-1 block text-xs font-medium">
                      {ar ? "الجمهور (اختياري)" : "Audience (optional)"}
                    </label>
                    <input
                      id="ai-audience"
                      value={audience}
                      onChange={(e) => setAudience(e.target.value)}
                      maxLength={200}
                      dir="auto"
                      className="input !py-1.5 text-sm"
                      placeholder={ar ? "طلاب، مستثمرون، فريق العمل…" : "Students, founders, leadership…"}
                    />
                  </div>
                  <div>
                    <label htmlFor="ai-tone" className="mb-1 block text-xs font-medium">
                      {ar ? "النبرة" : "Tone"}
                    </label>
                    <select
                      id="ai-tone"
                      value={tone}
                      onChange={(e) => setTone(e.target.value as typeof tone)}
                      className="input !py-1.5 text-sm"
                    >
                      <option value="friendly">{ar ? "ودّية" : "Friendly"}</option>
                      <option value="formal">{ar ? "رسمية" : "Formal"}</option>
                      <option value="persuasive">{ar ? "إقناعية" : "Persuasive"}</option>
                      <option value="educational">{ar ? "تعليمية" : "Educational"}</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ai-length" className="mb-1 block text-xs font-medium">
                      {ar ? "الطول" : "Length"}
                    </label>
                    <select
                      id="ai-length"
                      value={length}
                      onChange={(e) => setLength(e.target.value as typeof length)}
                      className="input !py-1.5 text-sm"
                    >
                      <option value="short">{ar ? "قصير" : "Short"}</option>
                      <option value="medium">{ar ? "متوسط" : "Medium"}</option>
                      <option value="long">{ar ? "طويل" : "Long"}</option>
                    </select>
                  </div>
                </div>

                {type === "presentation" && (
                  <div>
                    <label htmlFor="ai-theme" className="mb-1 block text-xs font-medium">
                      {ar ? "السمة البصرية" : "Theme"}
                    </label>
                    <select
                      id="ai-theme"
                      value={theme}
                      onChange={(e) => setTheme(e.target.value as SlideThemeId)}
                      className="input !py-1.5 text-sm"
                    >
                      {Object.values(SLIDE_THEMES).map((th) => (
                        <option key={th.id} value={th.id}>
                          {ar ? th.labelAr : th.labelEn}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <ErrorNote error={error} locale={locale} />
                <button type="submit" disabled={busy || prompt.trim().length < 3} className="btn btn-primary w-full justify-center">
                  {busy
                    ? ar
                      ? "جارٍ إعداد المخطط…"
                      : "Generating outline…"
                    : ar
                      ? "توليد المخطط والمراجعة →"
                      : "Generate outline →"}
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-dim)" }}>
                  <span>{ar ? "الخطوة ٢ من ٢: راجع المخطط وعدّله" : "Step 2 of 2: Review & edit outline"}</span>
                  <span>
                    {providerDemo
                      ? ar
                        ? "مشغّل تجريبي محلي"
                        : "Local demo provider"
                      : "AI"}
                  </span>
                </div>

                <div>
                  <label htmlFor="outline-title" className="mb-1 block text-xs font-medium">
                    {tr("title")}
                  </label>
                  <input
                    id="outline-title"
                    value={outlineTitle}
                    onChange={(e) => setOutlineTitle(e.target.value)}
                    dir="auto"
                    maxLength={200}
                    className="input font-semibold"
                  />
                </div>

                <div className="max-h-64 space-y-2 overflow-y-auto pe-1">
                  {type === "presentation"
                    ? (outline.slides ?? []).map((sl, i) => (
                        <div key={i} className="rounded-lg border p-2.5" style={{ borderColor: "var(--border)" }}>
                          <span className="text-[11px] font-bold" style={{ color: "var(--turquoise)" }}>
                            {ar ? `شريحة ${i + 1}` : `Slide ${i + 1}`}
                          </span>
                          <input
                            value={sl.title}
                            dir="auto"
                            onChange={(e) => {
                              const nextSlides = [...(outline.slides ?? [])];
                              nextSlides[i] = { ...sl, title: e.target.value };
                              setOutline({ ...outline, slides: nextSlides });
                            }}
                            className="input mt-1 !py-1 text-sm"
                          />
                        </div>
                      ))
                    : (outline.blocks ?? []).map((blk, i) => (
                        <div key={i} className="rounded-lg border p-2.5" style={{ borderColor: "var(--border)" }}>
                          <span className="text-[11px] font-bold uppercase" style={{ color: "var(--turquoise)" }}>
                            {blk.kind}
                          </span>
                          {blk.kind === "heading" || blk.kind === "paragraph" || blk.kind === "quote" ? (
                            <input
                              value={blk.text}
                              dir="auto"
                              onChange={(e) => {
                                const nextBlocks = [...(outline.blocks ?? [])];
                                nextBlocks[i] = { ...blk, text: e.target.value };
                                setOutline({ ...outline, blocks: nextBlocks });
                              }}
                              className="input mt-1 !py-1 text-sm"
                            />
                          ) : blk.kind === "list" ? (
                            <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }} dir="auto">
                              {(blk.items ?? []).join(" · ")}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
                              {ar ? `جدول (${blk.rows?.length ?? 0} صفوف)` : `Table (${blk.rows?.length ?? 0} rows)`}
                            </p>
                          )}
                        </div>
                      ))}
                </div>

                <ErrorNote error={error} locale={locale} />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost flex-1 justify-center text-sm"
                    onClick={() => setOutline(null)}
                    disabled={busy}
                  >
                    ← {ar ? "تعديل الوصف" : "Back"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary flex-1 justify-center text-sm"
                    onClick={handleCreateFromOutline}
                    disabled={busy}
                  >
                    {busy
                      ? ar
                        ? "جارٍ الإنشاء…"
                        : "Creating…"
                      : ar
                        ? "إنشاء وفتح المحرر"
                        : "Create & open editor"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
