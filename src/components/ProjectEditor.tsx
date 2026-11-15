"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  updateProjectContentAction,
  updateProjectMetaAction,
  restoreRevisionAction,
} from "@/app/project-actions";
import { WordProcessor } from "@/components/WordProcessor";
import { SlideCanvasEditor } from "@/components/SlideCanvasEditor";
import { SLIDE_THEMES } from "@/lib/projects/themes";
import type {
  DocumentBlock,
  PageLayout,
  SlideItem,
} from "@/lib/validation/projects";
import { t, type Locale } from "@/lib/i18n";

export type EditorSlide = SlideItem;
export type EditorBlock = DocumentBlock;

export type EditorProject = {
  id: string;
  type: "presentation" | "document";
  title: string;
  language: string;
  content: {
    schemaVersion?: number;
    theme?: string;
    slides?: SlideItem[];
    blocks?: DocumentBlock[];
    pageLayout?: PageLayout;
    fidelityWarnings?: string[];
  };
};

type SaveState = "idle" | "saving" | "saved" | "error";

type Snapshot = {
  theme: string;
  slides: SlideItem[];
  blocks: DocumentBlock[];
  pageLayout: PageLayout;
};

const MAX_HISTORY = 40;

const DEFAULT_PAGE_LAYOUT: PageLayout = {
  size: "a4",
  orientation: "portrait",
  margins: "normal",
};

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
  const [language, setLanguage] = useState(project.language);
  const [theme, setTheme] = useState<string>(project.content.theme ?? "default");
  const [slides, setSlides] = useState<SlideItem[]>(() =>
    (project.content.slides ?? []).map((s) => ({
      ...s,
      bullets: s.bullets ?? [],
      layout: s.layout ?? "title-body",
      accentShape: s.accentShape ?? "bar",
    })),
  );
  const [blocks, setBlocks] = useState<DocumentBlock[]>(() => project.content.blocks ?? []);
  const [pageLayout, setPageLayout] = useState<PageLayout>(
    () => project.content.pageLayout ?? DEFAULT_PAGE_LAYOUT,
  );
  const [fidelityWarnings] = useState<string[]>(() => project.content.fidelityWarnings ?? []);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState(initialUsage);
  const [externalVersion, setExternalVersion] = useState(0);

  async function uploadImageAsset(file: File): Promise<string | null> {
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/assets", { method: "POST", body: fd });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "upload_failed");
        return null;
      }
      return data.id;
    } catch {
      setError("upload_failed");
      return null;
    }
  }

  // Parent Undo / Redo history (primarily drives presentation canvas + pageLayout + AI replace)
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
    pageLayout: project.content.pageLayout ?? DEFAULT_PAGE_LAYOUT,
  });
  const applyingHistoryRef = useRef(false);
  const skipNextPush = useRef(true);

  const commitChange = useCallback(
    (
      nextTheme: string,
      nextSlides: SlideItem[],
      nextBlocks: DocumentBlock[],
      nextLayout: PageLayout,
      bumpExternalDoc = false,
    ) => {
      if (!applyingHistoryRef.current) {
        const prev = lastCommittedRef.current;
        setUndoStack((u) => [...u.slice(-(MAX_HISTORY - 1)), prev]);
        setRedoStack([]);
      }
      lastCommittedRef.current = {
        theme: nextTheme,
        slides: nextSlides,
        blocks: nextBlocks,
        pageLayout: nextLayout,
      };
      setTheme(nextTheme);
      setSlides(nextSlides);
      setBlocks(nextBlocks);
      setPageLayout(nextLayout);
      if (bumpExternalDoc) {
        setExternalVersion((v) => v + 1);
      }
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
      setPageLayout(target.pageLayout);
      if (project.type === "document") {
        setExternalVersion((v) => v + 1);
      }
      applyingHistoryRef.current = false;
      return u.slice(0, -1);
    });
  }, [project.type]);

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
      setPageLayout(target.pageLayout);
      if (project.type === "document") {
        setExternalVersion((v) => v + 1);
      }
      applyingHistoryRef.current = false;
      return r.slice(0, -1);
    });
  }, [project.type]);

  // Global keyboard Undo/Redo outside native inputs and rich contentEditable surfaces
  // (Inside TipTap WordProcessor, ProseMirror natively handles Ctrl+Z / Ctrl+Y at character level.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      const target = e.target as HTMLElement | null;
      const isTextSurface =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (isTextSurface) return;

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
      ? {
          schemaVersion: 1,
          theme,
          slides,
          ...(fidelityWarnings.length > 0 ? { fidelityWarnings } : {}),
        }
      : {
          schemaVersion: 1,
          blocks,
          pageLayout,
          ...(fidelityWarnings.length > 0 ? { fidelityWarnings } : {}),
        };

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
  }, [theme, slides, blocks, pageLayout]);

  async function saveMeta(patch: { title?: string; language?: string }) {
    if (patch.language) setLanguage(patch.language);
    const res = await updateProjectMetaAction(project.id, patch);
    if (!res.ok) setError(res.error ?? "save_failed");
  }

  function handleAiGenerated(generated: unknown) {
    const g = generated as {
      theme?: string;
      slides?: SlideItem[];
      blocks?: DocumentBlock[];
    };
    if (project.type === "presentation" && Array.isArray(g.slides)) {
      commitChange(g.theme ?? theme, g.slides, blocks, pageLayout, false);
    } else if (project.type === "document" && Array.isArray(g.blocks)) {
      commitChange(theme, slides, g.blocks, pageLayout, true);
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

  return (
    <div className="min-h-dvh">
      <header className="border-b" style={{ background: "var(--obsidian-2)", borderColor: "var(--border)" }}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2.5 px-5 py-3">
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
            value={language}
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
              onChange={(e) => commitChange(e.target.value, slides, blocks, pageLayout)}
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

          {project.type === "presentation" && (
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
          )}

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

      {project.type === "presentation" ? (
        <SlideCanvasEditor
          projectId={project.id}
          locale={locale}
          language={language}
          theme={theme}
          slides={slides}
          fidelityWarnings={fidelityWarnings}
          usage={usage}
          onThemeChange={(nextTheme) => commitChange(nextTheme, slides, blocks, pageLayout)}
          onSlidesChange={(nextSlides) => commitChange(theme, nextSlides, blocks, pageLayout)}
          onAiGenerated={handleAiGenerated}
          onUsageChange={setUsage}
          onUploadImage={uploadImageAsset}
        />
      ) : (
        <WordProcessor
          projectId={project.id}
          locale={locale}
          language={language}
          blocks={blocks}
          pageLayout={pageLayout}
          fidelityWarnings={fidelityWarnings}
          externalVersion={externalVersion}
          usage={usage}
          onBlocksChange={(nextBlocks) => commitChange(theme, slides, nextBlocks, pageLayout)}
          onPageLayoutChange={(nextLayout) => commitChange(theme, slides, blocks, nextLayout)}
          onAiGenerated={handleAiGenerated}
          onUsageChange={setUsage}
          onUploadImage={uploadImageAsset}
        />
      )}

      <footer className="mx-auto max-w-7xl px-5 pb-10">
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
