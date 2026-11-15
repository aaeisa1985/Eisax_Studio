"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  updateProjectContentAction,
  updateProjectMetaAction,
  restoreRevisionAction,
} from "@/app/project-actions";
import { AiGeneratePanel, AiMenu } from "@/components/AiAssist";
import {
  SLIDE_THEMES,
  resolveSlideTheme,
  type SlideThemeId,
} from "@/lib/projects/themes";
import type {
  DocumentBlockKind,
  SlideAccentShape,
  SlideLayout,
} from "@/lib/validation/projects";
import { t, type Locale } from "@/lib/i18n";

export type EditorSlide = {
  id: string;
  title: string;
  subtitle: string;
  bullets?: string[];
  layout?: SlideLayout;
  accentShape?: SlideAccentShape;
  notes: string;
  dir: string;
};

export type EditorBlock = {
  id: string;
  kind: DocumentBlockKind;
  level?: number;
  text: string;
  ordered?: boolean;
  items?: string[];
  rows?: string[][];
  url?: string;
  dir: string;
};

export type EditorProject = {
  id: string;
  type: "presentation" | "document";
  title: string;
  language: string;
  content: {
    schemaVersion?: number;
    theme?: string;
    slides?: EditorSlide[];
    blocks?: EditorBlock[];
  };
};

type SaveState = "idle" | "saving" | "saved" | "error";

type Snapshot = {
  theme: string;
  slides: EditorSlide[];
  blocks: EditorBlock[];
};

const MAX_HISTORY = 40;

export function ProjectEditor({
  project,
  locale,
  revisions,
  initialUsage,
}: {
  project: EditorProject;
  locale: Locale;
  revisions: Array<{ revisionNo: number; createdAt: string }>;
  initialUsage: { used: number; limit: number };
}) {
  const ar = locale === "ar";
  const tr = (k: Parameters<typeof t>[1]) => t(locale, k);

  const [title, setTitle] = useState(project.title);
  const [theme, setTheme] = useState<string>(project.content.theme ?? "default");
  const [slides, setSlides] = useState<EditorSlide[]>(() =>
    (project.content.slides ?? []).map((s) => ({
      ...s,
      bullets: s.bullets ?? [],
      layout: s.layout ?? "title-body",
      accentShape: s.accentShape ?? "bar",
    })),
  );
  const [blocks, setBlocks] = useState<EditorBlock[]>(() => project.content.blocks ?? []);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [selectedSlide, setSelectedSlide] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState(initialUsage);

  // Undo / Redo history
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  const [redoStack, setRedoStack] = useState<Snapshot[]>([]);
  const lastCommittedRef = useRef<Snapshot>({
    theme: project.content.theme ?? "default",
    slides: (project.content.slides ?? []).map((s) => ({
      ...s,
      bullets: s.bullets ?? [],
      layout: s.layout ?? "title-body",
      accentShape: s.accentShape ?? "bar",
    })),
    blocks: project.content.blocks ?? [],
  });
  const applyingHistoryRef = useRef(false);
  const skipNextPush = useRef(true);

  const commitChange = useCallback(
    (nextTheme: string, nextSlides: EditorSlide[], nextBlocks: EditorBlock[]) => {
      if (!applyingHistoryRef.current) {
        const prev = lastCommittedRef.current;
        setUndoStack((u) => [...u.slice(-(MAX_HISTORY - 1)), prev]);
        setRedoStack([]);
      }
      lastCommittedRef.current = {
        theme: nextTheme,
        slides: nextSlides,
        blocks: nextBlocks,
      };
      setTheme(nextTheme);
      setSlides(nextSlides);
      setBlocks(nextBlocks);
    },
    [],
  );

  const undo = useCallback(() => {
    setUndoStack((u) => {
      if (u.length === 0) return u;
      const target = u[u.length - 1]!;
      const current = lastCommittedRef.current;
      setRedoStack((r) => [...r.slice(-(MAX_HISTORY - 1)), current]);
      applyingHistoryRef.current = true;
      lastCommittedRef.current = target;
      setTheme(target.theme);
      setSlides(target.slides);
      setBlocks(target.blocks);
      setSelectedSlide((sel) => Math.max(0, Math.min(sel, Math.max(0, target.slides.length - 1))));
      applyingHistoryRef.current = false;
      return u.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const target = r[r.length - 1]!;
      const current = lastCommittedRef.current;
      setUndoStack((u) => [...u.slice(-(MAX_HISTORY - 1)), current]);
      applyingHistoryRef.current = true;
      lastCommittedRef.current = target;
      setTheme(target.theme);
      setSlides(target.slides);
      setBlocks(target.blocks);
      setSelectedSlide((sel) => Math.max(0, Math.min(sel, Math.max(0, target.slides.length - 1))));
      applyingHistoryRef.current = false;
      return r.slice(0, -1);
    });
  }, []);

  // Keyboard shortcuts for Undo / Redo when not focused inside native input text editing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      const target = e.target as HTMLElement | null;
      const isTextInput =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (isTextInput) return;

      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const contentPayload = () =>
    project.type === "presentation"
      ? { schemaVersion: 1, theme, slides }
      : { schemaVersion: 1, blocks };

  // Debounced autosave
  useEffect(() => {
    if (skipNextPush.current) {
      skipNextPush.current = false;
      return;
    }
    setSaveState("saving");
    const timer = setTimeout(async () => {
      try {
        const res = await updateProjectContentAction(project.id, contentPayload());
        if (!res.ok) {
          setSaveState("error");
          setError(res.error ?? "save_failed");
          return;
        }
        setSaveState("saved");
        setError(null);
      } catch {
        setSaveState("error");
      }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, slides, blocks]);

  async function saveMeta(patch: { title?: string; language?: string }) {
    const res = await updateProjectMetaAction(project.id, patch);
    if (!res.ok) setError(res.error ?? "save_failed");
  }

  const uid = () => `id${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const textDirFor = (txt: string): "ltr" | "rtl" =>
    project.language === "ar" || /[\u0600-\u06FF]/.test(txt) ? "rtl" : "ltr";

  // --- Slide ops ---
  function updateSlide(i: number, patch: Partial<EditorSlide>) {
    const next = slides.map((sl, idx) => (idx === i ? { ...sl, ...patch } : sl));
    commitChange(theme, next, blocks);
  }
  function addSlide() {
    const next: EditorSlide[] = [
      ...slides,
      {
        id: uid(),
        title: "",
        subtitle: "",
        bullets: [],
        layout: "title-body",
        accentShape: "bar",
        notes: "",
        dir: project.language === "ar" ? "rtl" : "ltr",
      },
    ];
    commitChange(theme, next, blocks);
    setSelectedSlide(next.length - 1);
  }
  function duplicateSlide(i: number) {
    const src = slides[i];
    if (!src) return;
    const copy: EditorSlide = {
      ...src,
      id: uid(),
      bullets: [...(src.bullets ?? [])],
    };
    const next = [...slides];
    next.splice(i + 1, 0, copy);
    commitChange(theme, next, blocks);
    setSelectedSlide(i + 1);
  }
  function deleteSlide(i: number) {
    if (slides.length <= 1) return;
    const next = slides.filter((_, idx) => idx !== i);
    commitChange(theme, next, blocks);
    setSelectedSlide((sel) => Math.max(0, Math.min(sel, next.length - 1)));
  }
  function moveSlide(i: number, delta: -1 | 1) {
    const j = i + delta;
    if (j < 0 || j >= slides.length) return;
    const copy = [...slides];
    const [item] = copy.splice(i, 1);
    if (item) copy.splice(j, 0, item);
    commitChange(theme, copy, blocks);
    setSelectedSlide(j);
  }

  // --- Block ops ---
  function updateBlock(i: number, patch: Partial<EditorBlock>) {
    const next = blocks.map((bl, idx) => (idx === i ? { ...bl, ...patch } : bl));
    commitChange(theme, slides, next);
  }
  function addBlock(kind: DocumentBlockKind) {
    const dir = project.language === "ar" ? "rtl" : "ltr";
    const base: EditorBlock = {
      id: uid(),
      kind,
      text: "",
      dir,
    };
    if (kind === "heading") base.level = 2;
    if (kind === "list") {
      base.ordered = false;
      base.items = [""];
    }
    if (kind === "table") {
      base.rows = [
        [ar ? "العمود ١" : "Column 1", ar ? "العمود ٢" : "Column 2"],
        ["", ""],
      ];
    }
    if (kind === "link") {
      base.url = "https://";
    }
    commitChange(theme, slides, [...blocks, base]);
  }
  function moveBlock(i: number, delta: -1 | 1) {
    const j = i + delta;
    if (j < 0 || j >= blocks.length) return;
    const copy = [...blocks];
    const [item] = copy.splice(i, 1);
    if (item) copy.splice(j, 0, item);
    commitChange(theme, slides, copy);
  }
  function duplicateBlock(i: number) {
    const src = blocks[i];
    if (!src) return;
    const copy: EditorBlock = {
      ...src,
      id: uid(),
      items: src.items ? [...src.items] : undefined,
      rows: src.rows ? src.rows.map((r) => [...r]) : undefined,
    };
    const copyList = [...blocks];
    copyList.splice(i + 1, 0, copy);
    commitChange(theme, slides, copyList);
  }
  function deleteBlock(i: number) {
    commitChange(
      theme,
      slides,
      blocks.filter((_, idx) => idx !== i),
    );
  }

  function handleAiGenerated(generated: unknown) {
    const g = generated as {
      theme?: string;
      slides?: EditorSlide[];
      blocks?: EditorBlock[];
    };
    if (project.type === "presentation" && Array.isArray(g.slides)) {
      commitChange(g.theme ?? theme, g.slides, blocks);
      setSelectedSlide(0);
    } else if (project.type === "document" && Array.isArray(g.blocks)) {
      commitChange(theme, slides, g.blocks);
    }
  }

  const saveLabel =
    saveState === "saving"
      ? tr("saving")
      : saveState === "saved"
        ? tr("saved")
        : saveState === "error"
          ? ar
            ? "فشل الحفظ — سيُعاد المحاولة مع التعديل القادم"
            : "Save failed — will retry on next change"
          : "";

  const activeTheme = resolveSlideTheme(theme);
  const currentSlide = slides[selectedSlide];

  return (
    <div className="min-h-dvh">
      <header className="border-b" style={{ background: "var(--obsidian-2)", borderColor: "var(--border)" }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2.5 px-5 py-3">
          <Link href="/dashboard" className="text-sm no-underline" style={{ color: "var(--text-dim)" }}>
            ← {tr("backToDashboard")}
          </Link>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title !== project.title) void saveMeta({ title });
            }}
            className="input !w-auto min-w-44 flex-1 font-semibold"
            aria-label={tr("title")}
            maxLength={200}
            dir="auto"
          />
          <select
            defaultValue={project.language}
            onChange={(e) => void saveMeta({ language: e.target.value })}
            className="input !w-auto !py-1.5 text-sm"
            aria-label={tr("language")}
          >
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>

          {project.type === "presentation" && (
            <select
              value={theme}
              onChange={(e) => commitChange(e.target.value, slides, blocks)}
              className="input !w-auto !py-1.5 text-sm"
              aria-label={ar ? "السمة" : "Theme"}
            >
              {Object.values(SLIDE_THEMES).map((th) => (
                <option key={th.id} value={th.id}>
                  {ar ? th.labelAr : th.labelEn}
                </option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={undo}
              disabled={undoStack.length === 0}
              className="btn btn-ghost !px-2.5 !py-1 text-xs"
              title={ar ? "تراجع" : "Undo"}
              aria-label={ar ? "تراجع" : "Undo"}
            >
              ↶ {ar ? "تراجع" : "Undo"}
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={redoStack.length === 0}
              className="btn btn-ghost !px-2.5 !py-1 text-xs"
              title={ar ? "إعادة" : "Redo"}
              aria-label={ar ? "إعادة" : "Redo"}
            >
              ↷ {ar ? "إعادة" : "Redo"}
            </button>
          </div>

          <span aria-live="polite" className="text-xs" style={{ color: "var(--text-dim)" }}>
            {saveLabel}
          </span>

          <div className="flex items-center gap-2">
            {project.type === "presentation" ? (
              <a href={`/api/projects/${project.id}/export/pptx`} className="btn btn-ghost !py-1.5 text-xs no-underline">
                ⬇ PPTX
              </a>
            ) : (
              <a href={`/api/projects/${project.id}/export/docx`} className="btn btn-ghost !py-1.5 text-xs no-underline">
                ⬇ DOCX
              </a>
            )}
            <Link href={`/projects/${project.id}/print`} className="btn btn-ghost !py-1.5 text-xs no-underline">
              ⬇ PDF
            </Link>
          </div>
        </div>
      </header>

      {error && (
        <p role="alert" className="mx-auto mt-3 max-w-6xl rounded-lg border p-3 text-sm" style={{ borderColor: "#4a2430", color: "#ff8b8b" }}>
          {tr("errorGeneric")} ({error})
        </p>
      )}

      <main className="mx-auto grid max-w-6xl gap-5 px-5 py-8 lg:grid-cols-[290px_1fr]">
        {project.type === "presentation" ? (
          <>
            <aside>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>
                  {tr("slideshowTitle")} ({slides.length})
                </h2>
                <button type="button" className="btn btn-ghost !px-2.5 !py-1 text-xs" onClick={addSlide}>
                  + {tr("addSlide")}
                </button>
              </div>
              <AiGeneratePanel
                projectId={project.id}
                locale={locale}
                usage={usage}
                theme={theme}
                onGenerated={handleAiGenerated}
                onUsageChange={setUsage}
              />
              {/* Visual Slide Thumbnails */}
              <ol className="space-y-2.5">
                {slides.map((s, i) => {
                  const selected = i === selectedSlide;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedSlide(i)}
                        className="w-full rounded-xl border p-2 text-start transition-all"
                        style={{
                          background: selected ? "rgba(0,212,200,0.10)" : "var(--surface)",
                          borderColor: selected ? "var(--turquoise)" : "var(--border)",
                        }}
                      >
                        <div className="mb-1.5 flex items-center justify-between text-[11px]" style={{ color: "var(--text-dim)" }}>
                          <span>#{i + 1}</span>
                          <span>{s.layout ?? "title-body"}</span>
                        </div>
                        <div
                          className="relative overflow-hidden rounded-lg border p-2.5"
                          style={{
                            background: `#${activeTheme.bgHex}`,
                            color: `#${activeTheme.titleHex}`,
                            borderColor: `#${activeTheme.borderHex}`,
                            minHeight: "64px",
                          }}
                          dir={s.dir}
                        >
                          {(s.accentShape ?? "bar") === "bar" && (
                            <span
                              aria-hidden
                              className="absolute top-2 bottom-2 w-1 rounded-full"
                              style={{
                                background: `#${activeTheme.accentHex}`,
                                insetInlineStart: "6px",
                              }}
                            />
                          )}
                          {(s.accentShape ?? "bar") === "badge" && (
                            <span
                              aria-hidden
                              className="mb-1 block h-1.5 w-8 rounded-full"
                              style={{ background: `#${activeTheme.accentHex}` }}
                            />
                          )}
                          <p className="truncate ps-2 text-xs font-bold">{s.title || tr("untitled")}</p>
                          {(s.bullets?.length ?? 0) > 0 ? (
                            <p className="mt-1 truncate ps-2 text-[10px]" style={{ color: `#${activeTheme.subtitleHex}` }}>
                              • {s.bullets![0]}
                            </p>
                          ) : (
                            s.subtitle && (
                              <p className="mt-1 truncate ps-2 text-[10px]" style={{ color: `#${activeTheme.subtitleHex}` }}>
                                {s.subtitle}
                              </p>
                            )
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </aside>

            <section className="space-y-4">
              {currentSlide && (
                <>
                  {/* Slide toolbar */}
                  <div className="card flex flex-wrap items-center gap-2 p-3">
                    <button
                      type="button"
                      className="btn btn-ghost !px-2.5 !py-1 text-xs"
                      onClick={() => moveSlide(selectedSlide, -1)}
                      disabled={selectedSlide === 0}
                    >
                      ↑ {tr("moveUp")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost !px-2.5 !py-1 text-xs"
                      onClick={() => moveSlide(selectedSlide, 1)}
                      disabled={selectedSlide >= slides.length - 1}
                    >
                      ↓ {tr("moveDown")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost !px-2.5 !py-1 text-xs"
                      onClick={() => duplicateSlide(selectedSlide)}
                    >
                      ⧉ {tr("duplicate")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost !px-2.5 !py-1 text-xs"
                      style={{ color: "#ff8b8b" }}
                      onClick={() => deleteSlide(selectedSlide)}
                      disabled={slides.length <= 1}
                    >
                      {tr("deleteSlide")}
                    </button>

                    <div className="ms-auto flex flex-wrap items-center gap-2">
                      <select
                        value={currentSlide.layout ?? "title-body"}
                        onChange={(e) =>
                          updateSlide(selectedSlide, { layout: e.target.value as SlideLayout })
                        }
                        className="input !w-auto !py-1 text-xs"
                        aria-label={ar ? "التخطيط" : "Layout"}
                      >
                        <option value="title">{ar ? "شريحة عنوان" : "Title slide"}</option>
                        <option value="title-body">{ar ? "عنوان ونقاط" : "Title + bullets"}</option>
                        <option value="two-col">{ar ? "عمودان" : "Two columns"}</option>
                        <option value="quote">{ar ? "اقتباس" : "Quote"}</option>
                      </select>
                      <select
                        value={currentSlide.accentShape ?? "bar"}
                        onChange={(e) =>
                          updateSlide(selectedSlide, {
                            accentShape: e.target.value as SlideAccentShape,
                          })
                        }
                        className="input !w-auto !py-1 text-xs"
                        aria-label={ar ? "الشكل الهندسي" : "Shape"}
                      >
                        <option value="bar">{ar ? "شريط جانبي" : "Accent bar"}</option>
                        <option value="card">{ar ? "إطار بطاقة" : "Card frame"}</option>
                        <option value="badge">{ar ? "شارة علوية" : "Top pill"}</option>
                        <option value="none">{ar ? "بدون شكل" : "No shape"}</option>
                      </select>
                      <button
                        type="button"
                        className="btn btn-ghost !px-2 !py-1 text-xs"
                        onClick={() =>
                          updateSlide(selectedSlide, {
                            dir: currentSlide.dir === "rtl" ? "ltr" : "rtl",
                          })
                        }
                      >
                        {currentSlide.dir === "rtl" ? "RTL" : "LTR"}
                      </button>
                    </div>
                  </div>

                  {/* Themed 16:9 Slide Canvas */}
                  <div
                    className="relative rounded-2xl border p-8 shadow-lg transition-colors"
                    style={{
                      background:
                        (currentSlide.accentShape ?? "bar") === "card"
                          ? `#${activeTheme.cardBgHex}`
                          : `#${activeTheme.bgHex}`,
                      color: `#${activeTheme.titleHex}`,
                      borderColor: `#${activeTheme.borderHex}`,
                      minHeight: "380px",
                    }}
                    dir={currentSlide.dir}
                  >
                    {(currentSlide.accentShape ?? "bar") === "bar" && (
                      <span
                        aria-hidden
                        className="absolute top-7 bottom-7 w-1.5 rounded-full"
                        style={{
                          background: `#${activeTheme.accentHex}`,
                          insetInlineStart: "18px",
                        }}
                      />
                    )}
                    {(currentSlide.accentShape ?? "bar") === "badge" && (
                      <span
                        aria-hidden
                        className="mb-4 block h-2 w-20 rounded-full"
                        style={{ background: `#${activeTheme.accentHex}` }}
                      />
                    )}

                    <div className="ps-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <AiMenu
                          projectId={project.id}
                          locale={locale}
                          label={ar ? "العنوان" : "Title"}
                          text={currentSlide.title}
                          onUsageChange={setUsage}
                          onApply={(next) =>
                            updateSlide(selectedSlide, { title: next, dir: textDirFor(next) })
                          }
                        />
                        <AiMenu
                          projectId={project.id}
                          locale={locale}
                          label={ar ? "الفرعي" : "Subtitle"}
                          text={currentSlide.subtitle}
                          onUsageChange={setUsage}
                          onApply={(next) => updateSlide(selectedSlide, { subtitle: next })}
                        />
                        <AiMenu
                          projectId={project.id}
                          locale={locale}
                          label={ar ? "الملاحظات" : "Notes"}
                          text={currentSlide.notes}
                          onUsageChange={setUsage}
                          onApply={(next) => updateSlide(selectedSlide, { notes: next })}
                        />
                      </div>

                      <input
                        value={currentSlide.title}
                        onChange={(e) =>
                          updateSlide(selectedSlide, {
                            title: e.target.value,
                            dir: textDirFor(e.target.value),
                          })
                        }
                        placeholder={tr("slideTitleLabel")}
                        className={`mb-2 w-full border-0 bg-transparent font-extrabold outline-none ${
                          currentSlide.layout === "quote" ? "text-center text-2xl italic" : "text-3xl"
                        }`}
                        style={{ color: `#${activeTheme.titleHex}` }}
                        dir="auto"
                        maxLength={500}
                      />

                      <input
                        value={currentSlide.subtitle}
                        onChange={(e) => updateSlide(selectedSlide, { subtitle: e.target.value })}
                        placeholder={tr("slideSubtitleLabel")}
                        className={`w-full border-0 bg-transparent text-lg outline-none ${
                          currentSlide.layout === "quote" ? "text-center" : ""
                        }`}
                        style={{ color: `#${activeTheme.subtitleHex}` }}
                        dir="auto"
                        maxLength={1000}
                      />

                      {currentSlide.layout !== "title" && currentSlide.layout !== "quote" && (
                        <div className="mt-5">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: `#${activeTheme.subtitleHex}` }}>
                              {ar ? "نقاط الشريحة" : "Slide bullets"}
                            </span>
                            <button
                              type="button"
                              className="rounded border px-2 py-0.5 text-xs font-semibold"
                              style={{
                                borderColor: `#${activeTheme.borderHex}`,
                                color: `#${activeTheme.titleHex}`,
                              }}
                              onClick={() =>
                                updateSlide(selectedSlide, {
                                  bullets: [...(currentSlide.bullets ?? []), ""],
                                })
                              }
                            >
                              + {ar ? "نقطة" : "Add bullet"}
                            </button>
                          </div>
                          <ul
                            className={
                              currentSlide.layout === "two-col"
                                ? "grid gap-2.5 sm:grid-cols-2"
                                : "space-y-2"
                            }
                          >
                            {(currentSlide.bullets ?? []).map((bullet, bIdx) => (
                              <li key={bIdx} className="flex items-center gap-2">
                                <span
                                  aria-hidden
                                  className="h-2 w-2 flex-none rounded-full"
                                  style={{ background: `#${activeTheme.accentHex}` }}
                                />
                                <input
                                  value={bullet}
                                  dir="auto"
                                  maxLength={500}
                                  placeholder={ar ? `نقطة ${bIdx + 1}` : `Bullet ${bIdx + 1}`}
                                  onChange={(e) => {
                                    const nextBullets = [...(currentSlide.bullets ?? [])];
                                    nextBullets[bIdx] = e.target.value;
                                    updateSlide(selectedSlide, { bullets: nextBullets });
                                  }}
                                  className="w-full rounded border bg-transparent px-2 py-1 text-sm outline-none"
                                  style={{
                                    borderColor: `#${activeTheme.borderHex}`,
                                    color: `#${activeTheme.bodyHex}`,
                                  }}
                                />
                                <button
                                  type="button"
                                  aria-label={ar ? "حذف النقطة" : "Remove bullet"}
                                  className="text-xs opacity-60 hover:opacity-100"
                                  onClick={() => {
                                    const nextBullets = (currentSlide.bullets ?? []).filter(
                                      (_, idx) => idx !== bIdx,
                                    );
                                    updateSlide(selectedSlide, { bullets: nextBullets });
                                  }}
                                >
                                  ✕
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Speaker notes */}
                  <div className="card p-4">
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>
                      {ar ? "ملاحظات المتحدث" : "Speaker notes"}
                    </label>
                    <textarea
                      value={currentSlide.notes}
                      onChange={(e) => updateSlide(selectedSlide, { notes: e.target.value })}
                      placeholder={ar ? "ملاحظات المتحدث…" : "Speaker notes…"}
                      className="input text-sm"
                      dir="auto"
                      rows={3}
                      maxLength={5000}
                    />
                  </div>
                </>
              )}
            </section>
          </>
        ) : (
          <>
            <aside>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>
                  {tr("docBlocksTitle")} ({blocks.length})
                </h2>
              </div>
              <AiGeneratePanel
                projectId={project.id}
                locale={locale}
                usage={usage}
                onGenerated={handleAiGenerated}
                onUsageChange={setUsage}
              />
              <div className="mb-3 grid grid-cols-2 gap-1.5">
                <button type="button" className="btn btn-ghost justify-center !px-2 !py-1.5 text-xs" onClick={() => addBlock("heading")}>
                  + {tr("heading")}
                </button>
                <button type="button" className="btn btn-ghost justify-center !px-2 !py-1.5 text-xs" onClick={() => addBlock("paragraph")}>
                  + {tr("paragraph")}
                </button>
                <button type="button" className="btn btn-ghost justify-center !px-2 !py-1.5 text-xs" onClick={() => addBlock("list")}>
                  + {ar ? "قائمة" : "List"}
                </button>
                <button type="button" className="btn btn-ghost justify-center !px-2 !py-1.5 text-xs" onClick={() => addBlock("table")}>
                  + {ar ? "جدول" : "Table"}
                </button>
                <button type="button" className="btn btn-ghost justify-center !px-2 !py-1.5 text-xs" onClick={() => addBlock("quote")}>
                  + {ar ? "اقتباس" : "Quote"}
                </button>
                <button type="button" className="btn btn-ghost justify-center !px-2 !py-1.5 text-xs" onClick={() => addBlock("link")}>
                  + {ar ? "رابط" : "Link"}
                </button>
              </div>
              <ol className="space-y-1.5">
                {blocks.map((b) => (
                  <li key={b.id}>
                    <a
                      href={`#block-${b.id}`}
                      className="block truncate rounded-md px-2 py-1 text-sm no-underline"
                      style={{ color: "var(--text-dim)" }}
                    >
                      <span dir={b.dir}>
                        {b.kind === "heading"
                          ? `H${b.level ?? 2}`
                          : b.kind === "list"
                            ? "•"
                            : b.kind === "table"
                              ? "▦"
                              : b.kind === "quote"
                                ? "❝"
                                : b.kind === "link"
                                  ? "🔗"
                                  : "¶"}{" "}
                        {(b.text || b.items?.[0] || b.url || "…").slice(0, 38)}
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            </aside>

            <section className="editor-surface rounded-2xl border p-8 shadow" style={{ borderColor: "var(--border)" }}>
              <article style={{ maxWidth: "52rem" }}>
                <p className="mb-4 text-[11px]" style={{ color: "#64748b" }}>
                  {ar
                    ? "تلميح التنسيق: استخدم **نص غامق** أو *نص مائل* داخل الفقرات والقوائم."
                    : "Formatting tip: use **bold** or *italic* inside paragraphs and lists."}
                </p>

                {blocks.map((b, i) => (
                  <div
                    key={b.id}
                    id={`block-${b.id}`}
                    className="group mb-4 rounded-xl border border-transparent p-2 transition-colors hover:border-slate-200 focus-within:border-slate-300"
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#64748b" }}>
                        {b.kind === "heading" ? `H${b.level ?? 2}` : b.kind}
                      </span>

                      {b.kind === "heading" && (
                        <select
                          value={b.level ?? 2}
                          onChange={(e) => updateBlock(i, { level: Number(e.target.value) })}
                          className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-700"
                          aria-label={ar ? "مستوى العنوان" : "Heading level"}
                        >
                          <option value={1}>H1</option>
                          <option value={2}>H2</option>
                          <option value={3}>H3</option>
                        </select>
                      )}

                      {b.kind === "list" && (
                        <button
                          type="button"
                          className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-700"
                          onClick={() => updateBlock(i, { ordered: !b.ordered })}
                        >
                          {b.ordered ? (ar ? "مرقّمة" : "Numbered") : ar ? "نقطية" : "Bulleted"}
                        </button>
                      )}

                      <button
                        type="button"
                        className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-700"
                        onClick={() => updateBlock(i, { dir: b.dir === "rtl" ? "ltr" : "rtl" })}
                      >
                        {b.dir.toUpperCase()}
                      </button>

                      {(b.kind === "heading" || b.kind === "paragraph" || b.kind === "quote") && (
                        <AiMenu
                          projectId={project.id}
                          locale={locale}
                          text={b.text}
                          targetLang={project.language === "ar" ? "ar" : "en"}
                          onUsageChange={setUsage}
                          onApply={(next) => updateBlock(i, { text: next, dir: textDirFor(next) })}
                        />
                      )}

                      <div className="ms-auto flex items-center gap-1 opacity-70 group-hover:opacity-100">
                        <button
                          type="button"
                          className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-700"
                          disabled={i === 0}
                          onClick={() => moveBlock(i, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-700"
                          disabled={i >= blocks.length - 1}
                          onClick={() => moveBlock(i, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-700"
                          onClick={() => duplicateBlock(i)}
                        >
                          ⧉
                        </button>
                        <button
                          type="button"
                          className="rounded border border-rose-200 px-1.5 py-0.5 text-[11px] text-rose-700"
                          onClick={() => deleteBlock(i)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {b.kind === "heading" && (
                      <input
                        value={b.text}
                        onChange={(e) =>
                          updateBlock(i, { text: e.target.value, dir: textDirFor(e.target.value) })
                        }
                        placeholder={tr("heading")}
                        className={`w-full border-0 bg-transparent font-bold outline-none ${
                          b.level === 1 ? "text-3xl" : b.level === 3 ? "text-xl" : "text-2xl"
                        }`}
                        style={{ color: "inherit" }}
                        dir="auto"
                        maxLength={20000}
                      />
                    )}

                    {b.kind === "paragraph" && (
                      <textarea
                        value={b.text}
                        onChange={(e) =>
                          updateBlock(i, { text: e.target.value, dir: textDirFor(e.target.value) })
                        }
                        placeholder={tr("paragraph")}
                        className="w-full resize-y border-0 bg-transparent leading-8 outline-none"
                        style={{ color: "inherit" }}
                        dir="auto"
                        rows={Math.max(2, Math.ceil(b.text.length / 80))}
                        maxLength={20000}
                      />
                    )}

                    {b.kind === "quote" && (
                      <textarea
                        value={b.text}
                        onChange={(e) =>
                          updateBlock(i, { text: e.target.value, dir: textDirFor(e.target.value) })
                        }
                        placeholder={ar ? "اقتباس أو ملاحظة مميزة…" : "Quote or callout…"}
                        className="w-full resize-y border-s-4 border-teal-500 bg-slate-50 px-4 py-2 italic leading-7 outline-none"
                        style={{ color: "#334155" }}
                        dir="auto"
                        rows={2}
                        maxLength={20000}
                      />
                    )}

                    {b.kind === "list" && (
                      <div className="space-y-1.5" dir={b.dir}>
                        {(b.items ?? []).map((item, itemIdx) => (
                          <div key={itemIdx} className="flex items-center gap-2">
                            <span className="w-5 text-xs font-bold text-slate-500">
                              {b.ordered ? `${itemIdx + 1}.` : "•"}
                            </span>
                            <input
                              value={item}
                              dir="auto"
                              maxLength={2000}
                              placeholder={ar ? "عنصر…" : "List item…"}
                              onChange={(e) => {
                                const nextItems = [...(b.items ?? [])];
                                nextItems[itemIdx] = e.target.value;
                                updateBlock(i, { items: nextItems, dir: textDirFor(e.target.value) });
                              }}
                              className="w-full rounded border border-slate-200 bg-white px-2.5 py-1 text-sm outline-none"
                            />
                            <button
                              type="button"
                              className="text-xs text-slate-400 hover:text-rose-600"
                              onClick={() => {
                                const nextItems = (b.items ?? []).filter((_, idx) => idx !== itemIdx);
                                updateBlock(i, { items: nextItems });
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700"
                          onClick={() => updateBlock(i, { items: [...(b.items ?? []), ""] })}
                        >
                          + {ar ? "عنصر" : "Add item"}
                        </button>
                      </div>
                    )}

                    {b.kind === "table" && (
                      <div className="space-y-2 overflow-x-auto" dir={b.dir}>
                        <table className="w-full border-collapse text-sm">
                          <tbody>
                            {(b.rows ?? []).map((row, rIdx) => (
                              <tr key={rIdx} className={rIdx === 0 ? "bg-slate-100 font-semibold" : ""}>
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="border border-slate-300 p-1">
                                    <input
                                      value={cell}
                                      dir="auto"
                                      maxLength={1000}
                                      onChange={(e) => {
                                        const nextRows = (b.rows ?? []).map((r, ri) =>
                                          ri === rIdx
                                            ? r.map((c, ci) => (ci === cIdx ? e.target.value : c))
                                            : r,
                                        );
                                        updateBlock(i, { rows: nextRows });
                                      }}
                                      className="w-full bg-transparent px-1.5 py-0.5 text-sm outline-none"
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700"
                            onClick={() => {
                              const cols = Math.max(1, b.rows?.[0]?.length ?? 2);
                              updateBlock(i, {
                                rows: [...(b.rows ?? []), Array.from({ length: cols }, () => "")],
                              });
                            }}
                          >
                            + {ar ? "صف" : "Row"}
                          </button>
                          <button
                            type="button"
                            className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700"
                            disabled={(b.rows?.length ?? 0) <= 1}
                            onClick={() =>
                              updateBlock(i, { rows: (b.rows ?? []).slice(0, -1) })
                            }
                          >
                            - {ar ? "صف" : "Row"}
                          </button>
                          <button
                            type="button"
                            className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700"
                            disabled={(b.rows?.[0]?.length ?? 0) >= 8}
                            onClick={() =>
                              updateBlock(i, {
                                rows: (b.rows ?? []).map((r) => [...r, ""]),
                              })
                            }
                          >
                            + {ar ? "عمود" : "Column"}
                          </button>
                          <button
                            type="button"
                            className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700"
                            disabled={(b.rows?.[0]?.length ?? 0) <= 1}
                            onClick={() =>
                              updateBlock(i, {
                                rows: (b.rows ?? []).map((r) => r.slice(0, -1)),
                              })
                            }
                          >
                            - {ar ? "عمود" : "Column"}
                          </button>
                        </div>
                      </div>
                    )}

                    {b.kind === "link" && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          value={b.text}
                          dir="auto"
                          maxLength={300}
                          placeholder={ar ? "نص الرابط" : "Link label"}
                          onChange={(e) =>
                            updateBlock(i, { text: e.target.value, dir: textDirFor(e.target.value) })
                          }
                          className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none"
                        />
                        <input
                          value={b.url ?? ""}
                          type="url"
                          dir="ltr"
                          maxLength={2000}
                          placeholder="https://example.com"
                          onChange={(e) => updateBlock(i, { url: e.target.value })}
                          className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none"
                        />
                      </div>
                    )}
                  </div>
                ))}
                {blocks.length === 0 && (
                  <p style={{ color: "#8a99a9" }}>
                    {ar ? "أضف عنوانًا أو فقرة أو جدولًا للبدء." : "Add a heading, paragraph, or table to start."}
                  </p>
                )}
              </article>
            </section>
          </>
        )}
      </main>

      <footer className="mx-auto max-w-6xl px-5 pb-10">
        <details className="card p-4 text-sm">
          <summary className="cursor-pointer font-semibold">
            {tr("revisions")} ({revisions.length})
          </summary>
          <ul className="mt-3 space-y-1.5">
            {revisions.map((r) => (
              <li key={r.revisionNo} className="flex items-center justify-between gap-3">
                <span style={{ color: "var(--text-dim)" }}>
                  #{r.revisionNo} · {new Date(r.createdAt).toLocaleString(ar ? "ar" : "en-GB")}
                </span>
                <form action={restoreRevisionAction}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="revisionNo" value={r.revisionNo} />
                  <button type="submit" className="btn btn-ghost !px-2.5 !py-1 text-xs">
                    {tr("restore")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs" style={{ color: "var(--text-dim)" }}>
            {ar
              ? "تُحفظ نسخة عند كل تغيير فعلي للمحتوى (آخر 20 نسخة)."
              : "A revision is stored on each real content change (last 20 kept)."}
          </p>
        </details>
      </footer>
    </div>
  );
}
