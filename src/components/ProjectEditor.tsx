"use client";
import "@/lib/desktop";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  restoreRevisionAction,
} from "@/app/project-actions";
import { useProjectSave } from "@/components/useProjectSave";
import { WordProcessor } from "@/components/WordProcessor";
import { SlideCanvasEditor } from "@/components/SlideCanvasEditor";
import { ThemeSwitcher, type UiTheme } from "@/components/ThemeSwitcher";
import { FullscreenButton } from "@/components/PwaManager";
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
  updatedAt?: string;
  content: {
    schemaVersion?: number;
    theme?: string;
    slides?: SlideItem[];
    blocks?: DocumentBlock[];
    pageLayout?: PageLayout;
    showSlideNumbers?: boolean;
    fidelityWarnings?: string[];
  };
};


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
  initialTheme = "dark",
  revisions,
  initialUsage,
  originalAvailable = false,
}: {
  project: EditorProject;
  locale: Locale;
  initialTheme?: UiTheme;
  revisions: Array<{ revisionNo: number; createdAt: string }>;
  initialUsage: { used: number; limit: number };
  originalAvailable?: boolean;
}) {
  const ar = locale === "ar";
  const tr = (k: Parameters<typeof t>[1]) => t(locale, k);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
  const [showSlideNumbers, setShowSlideNumbers] = useState<boolean>(() =>
    Boolean(project.content.showSlideNumbers),
  );
  const [fidelityWarnings] = useState<string[]>(() => project.content.fidelityWarnings ?? []);

  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState(initialUsage);
  const [externalVersion, setExternalVersion] = useState(0);
  const restoringRef = useRef(false);

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
          ...(showSlideNumbers ? { showSlideNumbers: true } : {}),
          ...(fidelityWarnings.length > 0 ? { fidelityWarnings } : {}),
        }
      : {
          schemaVersion: 1,
          blocks,
          pageLayout,
          ...(fidelityWarnings.length > 0 ? { fidelityWarnings } : {}),
        };

  const { state: saveState, error: saveError, flush, recovery, resolveRecovery } = useProjectSave(project.id, {
    title, language, content: contentPayload(),
  }, project.updatedAt);
  const [desktop, setDesktop] = useState(false);
  const [fileStatus, setFileStatus] = useState("");
  useEffect(() => { setDesktop(Boolean(window.eisaxDesktop)); }, []);

  async function saveFile(saveAs = false, format: "docx" | "pptx" | "pdf" = project.type === "document" ? "docx" : "pptx") {
    if (!(await flush())) return;
    if (window.eisaxDesktop) {
      const result = await window.eisaxDesktop.save(project.id, format, title, saveAs);
      if (result.error) setError(result.error);
      else if (result.ok) setFileStatus(`${ar ? "تم حفظ الملف:" : "File saved:"} ${result.name}`);
    } else if (saveAs) window.location.assign(`/api/projects/${project.id}/export/${format}`);
  }

  function recoverDraft() {
    if (!recovery) return;
    const content = recovery.content as EditorProject["content"];
    setTitle(recovery.title);
    setLanguage(recovery.language);
    commitChange(content.theme ?? theme, content.slides ?? slides, content.blocks ?? blocks, content.pageLayout ?? pageLayout, true);
    setShowSlideNumbers(Boolean(content.showSlideNumbers));
    resolveRecovery();
  }

  useEffect(() => {
    const save = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveFile(event.shiftKey);
      }
    };
    window.addEventListener("keydown", save);
    return () => window.removeEventListener("keydown", save);
  });

  async function saveThenNavigate(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const href = event.currentTarget.href;
    if (await flush()) window.location.assign(href);
  }

  useEffect(() => {
    const print = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        void flush().then((saved) => {
          if (saved) window.location.assign(`/projects/${project.id}/print?autoprint=1`);
        });
      }
    };
    window.addEventListener("keydown", print);
    return () => window.removeEventListener("keydown", print);
  }, [flush, project.id]);

  async function saveThenRestore(event: React.FormEvent<HTMLFormElement>) {
    if (restoringRef.current) return;
    event.preventDefault();
    const form = event.currentTarget;
    if (await flush()) {
      restoringRef.current = true;
      form.requestSubmit();
    }
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
    <div
      className={isFullscreen ? "fixed inset-0 z-40 overflow-y-auto" : "min-h-dvh"}
      style={isFullscreen ? { background: "var(--obsidian)" } : undefined}
    >
      <header className="sticky top-0 z-30 border-b" style={{ background: "var(--obsidian-2)", borderColor: "var(--border)" }}>
        <div className={`mx-auto flex flex-wrap items-center gap-2.5 px-5 py-3 ${isFullscreen ? "max-w-full" : "max-w-7xl"}`}>
          <Link href="/dashboard" onClick={saveThenNavigate} className="text-sm no-underline" style={{ color: "var(--text-dim)" }}>
            ← {tr("backToDashboard")}
          </Link>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input !w-auto min-w-44 flex-1 font-semibold"
            aria-label={tr("title")}
            maxLength={200}
            dir="auto"
          />
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
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

          <button type="button" onClick={() => void saveFile()} className="btn btn-primary !py-1.5 text-xs" title="Ctrl+S">
            {ar ? "حفظ" : "Save"}
          </button>
          <button type="button" onClick={() => void saveFile(true)} className="btn btn-ghost !py-1.5 text-xs" title="Ctrl+Shift+S">{ar ? "حفظ باسم" : "Save as"}</button>
          {desktop && <button type="button" onClick={() => void saveFile(true, "pdf")} className="btn btn-ghost !py-1.5 text-xs">{ar ? "تنزيل PDF" : "Download PDF"}</button>}
          <span aria-live="polite" className="text-xs" style={{ color: "var(--text-dim)" }}>
            {saveLabel}
          </span>

          <div className="flex items-center gap-2">
            {project.type === "presentation" ? (
              <a onClick={saveThenNavigate} href={`/api/projects/${project.id}/export/pptx`} className="btn btn-ghost !py-1.5 text-xs no-underline">
                ⬇ PPTX
              </a>
            ) : (
              <a onClick={saveThenNavigate} href={`/api/projects/${project.id}/export/docx`} className="btn btn-ghost !py-1.5 text-xs no-underline">
                ⬇ DOCX
              </a>
            )}
            <Link onClick={saveThenNavigate} href={`/projects/${project.id}/print`} className="btn btn-ghost !py-1.5 text-xs no-underline">
              ⬇ PDF
            </Link>
            <ThemeSwitcher initialTheme={initialTheme} locale={locale} />
            <FullscreenButton locale={locale} onFullscreenChange={setIsFullscreen} />
          </div>
        </div>
      </header>

      {recovery && <div role="alert" className="card mx-auto mt-3 max-w-6xl p-4">
        <p>{ar ? "وجدنا مسودة لم تُحفظ من الجلسة السابقة. استعدها أو احتفظ بالنسخة المحفوظة." : "An unsaved draft from the previous session is available. Recover it or keep the saved version."}</p>
        <button className="btn btn-primary mt-2" onClick={recoverDraft}>{ar ? "استعادة المسودة" : "Recover draft"}</button>
        <button className="btn btn-ghost mt-2" onClick={resolveRecovery}>{ar ? "استخدام النسخة المحفوظة" : "Keep saved version"}</button>
      </div>}
      {saveError === "conflict" && <p role="alert" className="card mx-auto mt-3 max-w-6xl p-3">{ar ? "الملف تغير في نافذة أخرى. مسودتك محفوظة على الجهاز؛ أعد تحميل الصفحة لمراجعة النسخة الأحدث قبل الاستعادة." : "This file changed in another window. Your draft is retained on this device; reload to review the latest version before recovering it."}</p>}
      {fileStatus && <p role="status" className="mx-auto max-w-6xl p-2 text-sm">{fileStatus}</p>}

      {(error || saveError) && (
        <p role="alert" className="mx-auto mt-3 max-w-6xl rounded-lg border p-3 text-sm" style={{ borderColor: "var(--danger-border)", color: "var(--danger)" }}>
          {tr("errorGeneric")} ({error || saveError})
        </p>
      )}

      {originalAvailable && (
        <p className="mx-auto mt-3 max-w-6xl px-5 text-xs" style={{ color: "var(--text-dim)" }}>
          {ar
            ? "الملف الأصلي محفوظ بشكل منفصل؛ قد لا يتضمن التصدير الميزات غير المدعومة. "
            : "The original file is retained separately; exports may omit unsupported features. "}
          <a href={`/api/projects/${project.id}/original`}>
            {ar ? "تنزيل الملف الأصلي" : "Download original"}
          </a>
        </p>
      )}

      {project.type === "presentation" ? (
        <SlideCanvasEditor
          projectId={project.id}
          locale={locale}
          language={language}
          theme={theme}
          slides={slides}
          showSlideNumbers={showSlideNumbers}
          fidelityWarnings={fidelityWarnings}
          usage={usage}
          onThemeChange={(nextTheme) => commitChange(nextTheme, slides, blocks, pageLayout)}
          onSlidesChange={(nextSlides) => commitChange(theme, nextSlides, blocks, pageLayout)}
          onShowSlideNumbersChange={setShowSlideNumbers}
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

      {!isFullscreen && (
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
                  <form action={restoreRevisionAction} onSubmit={saveThenRestore}>
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
      )}
    </div>
  );
}
