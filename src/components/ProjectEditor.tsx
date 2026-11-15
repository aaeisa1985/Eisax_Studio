"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { updateProjectContentAction, updateProjectMetaAction, restoreRevisionAction } from "@/app/project-actions";
import { t, type Locale } from "@/lib/i18n";

export type EditorProject = {
  id: string;
  type: "presentation" | "document";
  title: string;
  language: string;
  content: {
    schemaVersion?: number;
    theme?: string;
    slides?: Array<{ id: string; title: string; subtitle: string; notes: string; dir: string }>;
    blocks?: Array<{ id: string; kind: "heading" | "paragraph"; level?: number; text: string; dir: string }>;
  };
};

type SaveState = "idle" | "saving" | "saved" | "error";

export function ProjectEditor({
  project,
  locale,
  revisions,
}: {
  project: EditorProject;
  locale: Locale;
  revisions: Array<{ revisionNo: number; createdAt: string }>;
}) {
  const tr = (k: Parameters<typeof t>[1]) => t(locale, k);
  const [title, setTitle] = useState(project.title);
  const [slides, setSlides] = useState(project.content.slides ?? []);
  const [blocks, setBlocks] = useState(project.content.blocks ?? []);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [selectedSlide, setSelectedSlide] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef(false);
  const skipNextPush = useRef(true);

  const contentPayload = () =>
    project.type === "presentation"
      ? { schemaVersion: 1, theme: project.content.theme ?? "default", slides }
      : { schemaVersion: 1, blocks };

  // Debounced autosave
  useEffect(() => {
    if (skipNextPush.current) {
      skipNextPush.current = false;
      return;
    }
    dirty.current = true;
    setSaveState("saving");
    const timer = setTimeout(async () => {
      try {
        const res = await updateProjectContentAction(project.id, contentPayload());
        if (!res.ok) {
          setSaveState("error");
          setError(res.error ?? "save_failed");
          return;
        }
        dirty.current = false;
        setSaveState("saved");
        setError(null);
      } catch {
        setSaveState("error");
      }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides, blocks]);

  async function saveMeta(patch: { title?: string; language?: string }) {
    const res = await updateProjectMetaAction(project.id, patch);
    if (!res.ok) setError(res.error ?? "save_failed");
  }

  const uid = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const textDirFor = (txt: string): string =>
    project.language === "ar" || /[\u0600-\u06FF]/.test(txt) ? "rtl" : "ltr";

  // --- Slide ops ---
  function updateSlide(i: number, patch: Partial<(typeof slides)[number]>) {
    setSlides((s) => s.map((sl, idx) => (idx === i ? { ...sl, ...patch } : sl)));
  }
  function addSlide() {
    setSlides((s) => [
      ...s,
      { id: uid(), title: "", subtitle: "", notes: "", dir: project.language === "ar" ? "rtl" : "ltr" },
    ]);
    setSelectedSlide(slides.length);
  }
  function deleteSlide(i: number) {
    if (slides.length <= 1) return;
    setSlides((s) => s.filter((_, idx) => idx !== i));
    setSelectedSlide((sel) => Math.max(0, Math.min(sel, slides.length - 2)));
  }
  function moveSlide(i: number, delta: -1 | 1) {
    const j = i + delta;
    if (j < 0 || j >= slides.length) return;
    setSlides((s) => {
      const copy = [...s];
      const [item] = copy.splice(i, 1);
      if (item) copy.splice(j, 0, item);
      return copy;
    });
    setSelectedSlide(j);
  }

  // --- Block ops ---
  function updateBlock(i: number, patch: Partial<(typeof blocks)[number]>) {
    setBlocks((b) => b.map((bl, idx) => (idx === i ? { ...bl, ...patch } : bl)));
  }
  function addBlock(kind: "heading" | "paragraph") {
    setBlocks((b) => [
      ...b,
      {
        id: uid(),
        kind,
        level: kind === "heading" ? 2 : undefined,
        text: "",
        dir: project.language === "ar" ? "rtl" : "ltr",
      },
    ]);
  }

  const saveLabel = saveState === "saving" ? tr("saving") : saveState === "saved" ? tr("saved") : saveState === "error" ? (locale === "ar" ? "فشل الحفظ — سيُعاد المحاولة مع التعديل القادم" : "Save failed — will retry on next change") : "";

  return (
    <div className="min-h-dvh">
      <header className="border-b" style={{ background: "var(--obsidian-2)", borderColor: "var(--border)" }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-3">
          <Link href="/dashboard" className="text-sm no-underline" style={{ color: "var(--text-dim)" }}>
            ← {tr("backToDashboard")}
          </Link>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
            onBlur={() => {
              if (title !== project.title) void saveMeta({ title });
            }}
            className="input !w-auto min-w-48 flex-1 font-semibold"
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
          <span aria-live="polite" className="text-xs" style={{ color: "var(--text-dim)" }}>
            {saveLabel}
          </span>
        </div>
      </header>

      {error && (
        <p role="alert" className="mx-auto mt-3 max-w-6xl rounded-lg border p-3 text-sm" style={{ borderColor: "#4a2430", color: "#ff8b8b" }}>
          {tr("errorGeneric")} ({error})
        </p>
      )}

      <main className="mx-auto grid max-w-6xl gap-5 px-5 py-8 lg:grid-cols-[280px_1fr]">
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
              <ol className="space-y-2">
                {slides.map((s, i) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedSlide(i)}
                      className="w-full rounded-lg border p-3 text-start text-sm"
                      style={{
                        background: i === selectedSlide ? "var(--surface)" : "transparent",
                        borderColor: i === selectedSlide ? "var(--turquoise)" : "var(--border)",
                      }}
                    >
                      <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                        {i + 1}.{" "}
                      </span>
                      <span dir={s.dir}>{s.title || tr("untitled")}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </aside>

            <section className="editor-surface rounded-2xl border p-8 shadow" style={{ borderColor: "var(--border)" }}>
              {slides[selectedSlide] && (
                <div style={{ maxWidth: "56rem" }}>
                  <div className="mb-4 flex flex-wrap gap-2">
                    <button type="button" className="btn btn-ghost !px-2.5 !py-1 text-xs" onClick={() => moveSlide(selectedSlide, -1)}>
                      ↑ {tr("moveUp")}
                    </button>
                    <button type="button" className="btn btn-ghost !px-2.5 !py-1 text-xs" onClick={() => moveSlide(selectedSlide, 1)}>
                      ↓ {tr("moveDown")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger !px-2.5 !py-1 text-xs"
                      onClick={() => deleteSlide(selectedSlide)}
                      disabled={slides.length <= 1}
                    >
                      {tr("deleteSlide")}
                    </button>
                  </div>
                  <input
                    value={slides[selectedSlide]!.title}
                    onChange={(e) => updateSlide(selectedSlide, { title: e.target.value })}
                    placeholder={tr("slideTitleLabel")}
                    className="mb-3 w-full border-0 bg-transparent text-3xl font-extrabold outline-none"
                    style={{ color: "inherit" }}
                    dir="auto"
                    maxLength={500}
                  />
                  <input
                    value={slides[selectedSlide]!.subtitle}
                    onChange={(e) => updateSlide(selectedSlide, { subtitle: e.target.value })}
                    placeholder={tr("slideSubtitleLabel")}
                    className="w-full border-0 bg-transparent text-lg outline-none"
                    style={{ color: "#5a6a7a" }}
                    dir="auto"
                    maxLength={1000}
                  />
                  <textarea
                    value={slides[selectedSlide]!.notes}
                    onChange={(e) => updateSlide(selectedSlide, { notes: e.target.value })}
                    placeholder={locale === "ar" ? "ملاحظات المتحدث…" : "Speaker notes…"}
                    className="mt-6 w-full rounded-lg border p-3 text-sm outline-none"
                    style={{ borderColor: "var(--border)", background: "#f2f5f9" }}
                    dir="auto"
                    rows={4}
                    maxLength={5000}
                  />
                </div>
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
                <div className="flex gap-1">
                  <button type="button" className="btn btn-ghost !px-2.5 !py-1 text-xs" onClick={() => addBlock("heading")}>
                    + {tr("heading")}
                  </button>
                  <button type="button" className="btn btn-ghost !px-2.5 !py-1 text-xs" onClick={() => addBlock("paragraph")}>
                    + {tr("paragraph")}
                  </button>
                </div>
              </div>
              <ol className="space-y-1.5">
                {blocks.map((b, i) => (
                  <li key={b.id}>
                    <a
                      href={`#block-${b.id}`}
                      className="block truncate rounded-md px-2 py-1 text-sm no-underline"
                      style={{ color: "var(--text-dim)" }}
                    >
                      <span dir={b.dir}>
                        {b.kind === "heading" ? `H${b.level ?? 2}` : "¶"} {b.text.slice(0, 40) || "…"}
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            </aside>

            <section className="editor-surface rounded-2xl border p-8 shadow" style={{ borderColor: "var(--border)" }}>
              <article style={{ maxWidth: "52rem" }}>
                {blocks.map((b, i) => (
                  <div key={b.id} id={`block-${b.id}`} className="mb-3">
                    {b.kind === "heading" ? (
                      <input
                        value={b.text}
                        onChange={(e) => {
                          updateBlock(i, {
                            text: e.target.value,
                            dir: textDirFor(e.target.value),
                          });
                        }}
                        placeholder={tr("heading")}
                        className="w-full border-0 bg-transparent text-2xl font-bold outline-none"
                        style={{ color: "inherit" }}
                        dir="auto"
                        maxLength={20000}
                      />
                    ) : (
                      <textarea
                        value={b.text}
                        onChange={(e) => {
                          updateBlock(i, {
                            text: e.target.value,
                            dir: textDirFor(e.target.value),
                          });
                        }}
                        placeholder={tr("paragraph")}
                        className="w-full resize-y border-0 bg-transparent leading-8 outline-none"
                        style={{ color: "inherit" }}
                        dir="auto"
                        rows={Math.max(2, Math.ceil(b.text.length / 80))}
                        maxLength={20000}
                      />
                    )}
                  </div>
                ))}
                {blocks.length === 0 && (
                  <p style={{ color: "#8a99a9" }}>{locale === "ar" ? "أضف عنوانًا أو فقرة للبدء." : "Add a heading or paragraph to start."}</p>
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
                  #{r.revisionNo} · {new Date(r.createdAt).toLocaleString(locale === "ar" ? "ar" : "en-GB")}
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
            {locale === "ar" ? "تُحفظ نسخة عند كل تغيير فعلي للمحتوى (آخر 20 نسخة)." : "A revision is stored on each real content change (last 20 kept)."}
          </p>
        </details>
      </footer>
    </div>
  );
}
