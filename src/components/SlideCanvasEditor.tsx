"use client";

import { useEffect, useRef, useState } from "react";
import { AiGeneratePanel, AiMenu } from "@/components/AiAssist";
import { SlideChart } from "@/components/SlideChart";
import { SLIDE_THEMES, resolveSlideTheme } from "@/lib/projects/themes";
import { slideToCanvasElements } from "@/lib/presentation/elements";
import type {
  ChartData,
  SlideElement,
  SlideItem,
  SlideShapeType,
  TextAlign,
} from "@/lib/validation/projects";
import type { Locale } from "@/lib/i18n";

interface SlideCanvasEditorProps {
  projectId: string;
  locale: Locale;
  language: string;
  theme: string;
  slides: SlideItem[];
  fidelityWarnings?: string[];
  usage: { used: number; limit: number };
  onThemeChange: (nextTheme: string) => void;
  onSlidesChange: (nextSlides: SlideItem[]) => void;
  onAiGenerated: (content: unknown) => void;
  onUsageChange: (u: { used: number; limit: number }) => void;
  onUploadImage: (file: File) => Promise<string | null>;
}

function elUid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function stripHash(hex: string | undefined): string {
  if (!hex) return "";
  return hex.replace(/^#/, "").trim();
}

function asCssHex(hex: string | undefined, fallback = "transparent"): string {
  const c = stripHash(hex);
  return /^[0-9a-fA-F]{6}$/.test(c) ? `#${c}` : fallback;
}

function ShapeVisual({ el, borderWidth }: { el: SlideElement; borderWidth: number }) {
  const fill = asCssHex(el.fillColor, "transparent");
  const stroke = asCssHex(el.borderColor, fill === "transparent" ? "#00A89E" : "transparent");
  const sw = el.borderWidth ?? borderWidth;
  const shape = el.shape ?? "rect";

  if (shape === "ellipse") {
    return (
      <div
        className="h-full w-full rounded-full"
        style={{
          backgroundColor: fill,
          border: stroke !== "transparent" ? `${sw}px solid ${stroke}` : undefined,
        }}
      />
    );
  }
  if (shape === "triangle") {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
        <polygon
          points="50,3 97,97 3,97"
          fill={fill}
          stroke={stroke}
          strokeWidth={stroke === "transparent" ? 0 : sw * 2}
        />
      </svg>
    );
  }
  if (shape === "line") {
    return (
      <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="h-full w-full">
        <line
          x1="0"
          y1="10"
          x2="100"
          y2="10"
          stroke={stroke !== "transparent" ? stroke : fill !== "transparent" ? fill : "#00A89E"}
          strokeWidth={Math.max(2, sw * 2)}
        />
      </svg>
    );
  }
  if (shape === "arrow") {
    const color = fill !== "transparent" ? fill : stroke !== "transparent" ? stroke : "#00A89E";
    return (
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-full w-full">
        <polygon
          points="0,12 72,12 72,2 100,20 72,38 72,28 0,28"
          fill={color}
          stroke={stroke === "transparent" ? "none" : stroke}
          strokeWidth={sw}
        />
      </svg>
    );
  }
  return (
    <div
      className="h-full w-full"
      style={{
        backgroundColor: fill,
        borderRadius: shape === "roundRect" ? "12px" : "2px",
        border: stroke !== "transparent" ? `${sw}px solid ${stroke}` : undefined,
      }}
    />
  );
}

export function SlideCanvasEditor({
  projectId,
  locale,
  language,
  theme,
  slides,
  fidelityWarnings,
  usage,
  onThemeChange,
  onSlidesChange,
  onAiGenerated,
  onUsageChange,
  onUploadImage,
}: SlideCanvasEditorProps) {
  const ar = locale === "ar";
  const activeTheme = resolveSlideTheme(theme);

  const [selectedSlideIdx, setSelectedSlideIdx] = useState(0);
  const [selectedElId, setSelectedElId] = useState<string | null>(null);
  const [editingElId, setEditingElId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showWarnings, setShowWarnings] = useState(true);
  const [showAiDrawer, setShowAiDrawer] = useState(false);
  const [dragPreview, setDragPreview] = useState<Record<string, { x: number; y: number; w: number; h: number }>>({});

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    elId: string;
    mode: "move" | "nw" | "ne" | "sw" | "se";
    startX: number;
    startY: number;
    orig: { x: number; y: number; w: number; h: number };
  } | null>(null);

  const safeIdx = Math.min(selectedSlideIdx, Math.max(0, slides.length - 1));
  const currentSlide = slides[safeIdx];
  const elements: SlideElement[] = currentSlide
    ? slideToCanvasElements(currentSlide, activeTheme)
    : [];
  const selectedEl = elements.find((e) => e.id === selectedElId) ?? null;

  // Delete selected element via Delete key when not editing text
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!selectedElId || editingElId) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteElement(selectedElId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function updateSlideAt(idx: number, patch: Partial<SlideItem>) {
    onSlidesChange(slides.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function commitElements(nextElements: SlideElement[]) {
    if (!currentSlide) return;
    // Keep slide.title synced to the highest/largest text element for sidebar previews
    const primaryText = nextElements
      .filter((e) => e.kind === "text" && e.text?.trim())
      .sort((a, b) => (a.y ?? 0) - (b.y ?? 0))[0]?.text;
    updateSlideAt(safeIdx, {
      elements: nextElements,
      ...(primaryText ? { title: primaryText.split("\n")[0]?.slice(0, 500) ?? currentSlide.title } : {}),
    });
  }

  function updateElement(elId: string, patch: Partial<SlideElement>) {
    const next = elements.map((el) => (el.id === elId ? { ...el, ...patch } : el));
    commitElements(next);
  }

  function deleteElement(elId: string) {
    commitElements(elements.filter((el) => el.id !== elId));
    if (selectedElId === elId) setSelectedElId(null);
    if (editingElId === elId) setEditingElId(null);
  }

  function addBlankSlide() {
    const id = elUid("s");
    const newSlide: SlideItem = {
      id,
      title: "",
      subtitle: "",
      bullets: [],
      layout: "title-body",
      accentShape: "none",
      elements: [
        {
          id: elUid("txt"),
          kind: "text",
          x: 8,
          y: 12,
          w: 84,
          h: 16,
          zIndex: 1,
          text: ar ? "انقر مرتين لإضافة عنوان" : "Double-click to edit title",
          fontSize: 28,
          bold: true,
          color: activeTheme.titleHex,
          align: language === "ar" ? "right" : "left",
          dir: language === "ar" ? "rtl" : "ltr",
        },
      ],
      notes: "",
      dir: language === "ar" ? "rtl" : "ltr",
    };
    onSlidesChange([...slides, newSlide]);
    setSelectedSlideIdx(slides.length);
    setSelectedElId(null);
    setEditingElId(null);
  }

  function duplicateCurrentSlide() {
    if (!currentSlide) return;
    const clonedElements = elements.map((el) => ({ ...el, id: elUid("el") }));
    const copy: SlideItem = {
      ...currentSlide,
      id: elUid("s"),
      elements: clonedElements,
    };
    const next = [...slides];
    next.splice(safeIdx + 1, 0, copy);
    onSlidesChange(next);
    setSelectedSlideIdx(safeIdx + 1);
  }

  function moveCurrentSlide(delta: -1 | 1) {
    const target = safeIdx + delta;
    if (target < 0 || target >= slides.length) return;
    const copy = [...slides];
    const [item] = copy.splice(safeIdx, 1);
    if (item) copy.splice(target, 0, item);
    onSlidesChange(copy);
    setSelectedSlideIdx(target);
  }

  function deleteCurrentSlide() {
    if (slides.length <= 1) return;
    onSlidesChange(slides.filter((_, idx) => idx !== safeIdx));
    setSelectedSlideIdx(Math.max(0, safeIdx - 1));
    setSelectedElId(null);
  }

  function nextZ(): number {
    return elements.reduce((m, e) => Math.max(m, e.zIndex ?? 0), 0) + 1;
  }

  function addTextBox() {
    const el: SlideElement = {
      id: elUid("txt"),
      kind: "text",
      x: 15,
      y: 35,
      w: 50,
      h: 22,
      zIndex: nextZ(),
      text: ar ? "مربع نص جديد" : "New text box",
      fontSize: 18,
      color: activeTheme.bodyHex,
      align: currentSlide?.dir === "rtl" ? "right" : "left",
      dir: currentSlide?.dir ?? "ltr",
    };
    commitElements([...elements, el]);
    setSelectedElId(el.id);
    setEditingElId(el.id);
  }

  function addShape(shape: SlideShapeType) {
    const isLine = shape === "line";
    const el: SlideElement = {
      id: elUid("shp"),
      kind: "shape",
      shape,
      x: 25,
      y: isLine ? 48 : 30,
      w: isLine ? 50 : 28,
      h: isLine ? 4 : 26,
      zIndex: nextZ(),
      fillColor: isLine ? undefined : activeTheme.accentHex,
      borderColor: activeTheme.accentHex,
      borderWidth: 2,
      color: "FFFFFF",
      fontSize: 16,
      align: "center",
      valign: "middle",
    };
    commitElements([...elements, el]);
    setSelectedElId(el.id);
    setEditingElId(null);
  }

  function addChartElement() {
    const el: SlideElement = {
      id: elUid("cht"),
      kind: "chart",
      x: 50,
      y: 20,
      w: 42,
      h: 62,
      zIndex: nextZ(),
      chart: {
        kind: "bar",
        title: ar ? "البيانات" : "Metrics Overview",
        categories: ["Q1", "Q2", "Q3", "Q4"],
        values: [25, 48, 72, 110],
        unit: "",
      },
    };
    commitElements([...elements, el]);
    setSelectedElId(el.id);
    setEditingElId(null);
  }

  async function handleAddImage(file: File) {
    setUploading(true);
    const assetId = await onUploadImage(file);
    setUploading(false);
    if (!assetId) return;
    const el: SlideElement = {
      id: elUid("img"),
      kind: "image",
      x: 54,
      y: 22,
      w: 36,
      h: 52,
      zIndex: nextZ(),
      assetId,
    };
    commitElements([...elements, el]);
    setSelectedElId(el.id);
    setEditingElId(null);
  }

  function changeLayer(elId: string, action: "front" | "forward" | "backward" | "back") {
    const ordered = [...elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    const idx = ordered.findIndex((e) => e.id === elId);
    if (idx === -1) return;
    const [item] = ordered.splice(idx, 1);
    if (!item) return;
    if (action === "front") ordered.push(item);
    else if (action === "back") ordered.unshift(item);
    else if (action === "forward") ordered.splice(Math.min(ordered.length, idx + 1), 0, item);
    else ordered.splice(Math.max(0, idx - 1), 0, item);
    commitElements(ordered.map((el, i) => ({ ...el, zIndex: i + 1 })));
  }

  function duplicateElement(el: SlideElement) {
    const copy: SlideElement = {
      ...el,
      id: elUid("el"),
      x: Math.min(80, el.x + 3),
      y: Math.min(80, el.y + 4),
      zIndex: nextZ(),
    };
    commitElements([...elements, copy]);
    setSelectedElId(copy.id);
  }

  function beginPointer(
    e: React.PointerEvent,
    el: SlideElement,
    mode: "move" | "nw" | "ne" | "sw" | "se",
  ) {
    if (editingElId === el.id) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedElId(el.id);
    setEditingElId(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStateRef.current = {
      elId: el.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      orig: { x: el.x, y: el.y, w: el.w, h: el.h },
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const st = dragStateRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!st || !rect || rect.width <= 0 || rect.height <= 0) return;

    const dxPct = ((e.clientX - st.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - st.startY) / rect.height) * 100;
    const round2 = (n: number) => Math.round(n * 10) / 10;

    let { x, y, w, h } = st.orig;
    if (st.mode === "move") {
      x = Math.max(-10, Math.min(96, x + dxPct));
      y = Math.max(-10, Math.min(96, y + dyPct));
    } else {
      if (st.mode.includes("e")) w = Math.max(3, Math.min(120, st.orig.w + dxPct));
      if (st.mode.includes("s")) h = Math.max(3, Math.min(120, st.orig.h + dyPct));
      if (st.mode.includes("w")) {
        const nextW = Math.max(3, st.orig.w - dxPct);
        x = st.orig.x + (st.orig.w - nextW);
        w = nextW;
      }
      if (st.mode.includes("n")) {
        const nextH = Math.max(3, st.orig.h - dyPct);
        y = st.orig.y + (st.orig.h - nextH);
        h = nextH;
      }
    }

    setDragPreview({
      [st.elId]: { x: round2(x), y: round2(y), w: round2(w), h: round2(h) },
    });
  }

  function onPointerUp(e: React.PointerEvent) {
    const st = dragStateRef.current;
    if (!st) return;
    dragStateRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore if not captured
    }
    const finalBox = dragPreview[st.elId];
    setDragPreview({});
    if (finalBox) {
      updateElement(st.elId, finalBox);
    }
  }

  const slideBgHex = currentSlide?.bgColor
    ? asCssHex(currentSlide.bgColor, `#${activeTheme.bgHex}`)
    : `#${activeTheme.bgHex}`;

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      {/* Left Slide Management Rail */}
      <aside className="card h-fit p-3.5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>
            {ar ? `الشرائح (${slides.length})` : `Slides (${slides.length})`}
          </h2>
          <button type="button" onClick={addBlankSlide} className="btn btn-primary !px-2.5 !py-1 text-xs">
            + {ar ? "شريحة فارغة" : "Blank slide"}
          </button>
        </div>

        <ol className="max-h-[68vh] space-y-2.5 overflow-y-auto pe-1">
          {slides.map((s, i) => {
            const selected = i === safeIdx;
            const els = slideToCanvasElements(s, activeTheme);
            const thumbBg = s.bgColor ? asCssHex(s.bgColor, `#${activeTheme.bgHex}`) : `#${activeTheme.bgHex}`;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSlideIdx(i);
                    setSelectedElId(null);
                    setEditingElId(null);
                  }}
                  className="w-full rounded-xl border p-1.5 text-start transition-all"
                  style={{
                    background: selected ? "rgba(0,212,200,0.12)" : "var(--surface)",
                    borderColor: selected ? "var(--turquoise)" : "var(--border)",
                  }}
                >
                  <div className="mb-1 flex items-center justify-between px-1 text-[10px]" style={{ color: "var(--text-dim)" }}>
                    <span>#{i + 1}</span>
                    <span className="truncate ps-2">{s.title || (ar ? "شريحة" : "Slide")}</span>
                  </div>
                  <div
                    className="relative aspect-video w-full overflow-hidden rounded-lg border"
                    style={{ background: thumbBg, borderColor: `#${activeTheme.borderHex}` }}
                  >
                    {[...els]
                      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
                      .slice(0, 8)
                      .map((el) => (
                        <div
                          key={el.id}
                          style={{
                            position: "absolute",
                            left: `${el.x}%`,
                            top: `${el.y}%`,
                            width: `${el.w}%`,
                            height: `${el.h}%`,
                            zIndex: el.zIndex ?? 1,
                            overflow: "hidden",
                            background: el.kind === "shape" ? asCssHex(el.fillColor, "transparent") : undefined,
                            border: el.kind === "chart" ? `1px solid #${activeTheme.accentHex}` : undefined,
                            color: asCssHex(el.color, `#${activeTheme.titleHex}`),
                            fontSize: "5px",
                            lineHeight: 1.15,
                          }}
                          dir={el.dir ?? s.dir}
                        >
                          {el.kind === "image" && el.assetId ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`/api/assets/${el.assetId}`} alt="" className="h-full w-full object-contain" />
                          ) : el.kind === "chart" ? (
                            <span className="block p-0.5 font-bold">📊</span>
                          ) : (
                            <span className="block truncate font-semibold">{el.text}</span>
                          )}
                        </div>
                      ))}
                  </div>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          <button
            type="button"
            className="btn btn-ghost w-full justify-center !py-1.5 text-xs"
            onClick={() => setShowAiDrawer((v) => !v)}
          >
            ✨ {ar ? "مساعد AI (اختياري)" : "AI Assistant (Optional)"}
          </button>
          {showAiDrawer && (
            <div className="mt-2">
              <AiGeneratePanel
                projectId={projectId}
                locale={locale}
                usage={usage}
                theme={theme}
                onGenerated={(c) => {
                  onAiGenerated(c);
                  setShowAiDrawer(false);
                }}
                onUsageChange={onUsageChange}
              />
            </div>
          )}
        </div>
      </aside>

      {/* Main PowerPoint Stage & Toolbars */}
      <section className="space-y-3">
        {showWarnings && fidelityWarnings && fidelityWarnings.length > 0 && (
          <div
            className="rounded-xl border px-4 py-3 text-xs"
            style={{
              borderColor: "rgba(217,164,65,0.45)",
              background: "rgba(217,164,65,0.08)",
              color: "var(--text)",
            }}
          >
            <div className="flex items-center justify-between gap-2 font-bold" style={{ color: "#e9c46a" }}>
              <span>{ar ? "ملاحظات استيراد PPTX:" : "PPTX Import Fidelity Notices:"}</span>
              <button type="button" className="underline" onClick={() => setShowWarnings(false)}>
                {ar ? "إخفاء" : "Dismiss"}
              </button>
            </div>
            <ul className="mt-1.5 list-disc space-y-0.5 ps-5" style={{ color: "var(--text-dim)" }}>
              {fidelityWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Insert & Slide Controls Ribbon */}
        {currentSlide && (
          <div className="card space-y-2 p-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" className="btn btn-ghost !px-2 !py-1 text-xs" onClick={addTextBox}>
                + {ar ? "مربع نص" : "Text Box"}
              </button>
              <button type="button" className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => addShape("rect")}>
                ▭ {ar ? "مستطيل" : "Rect"}
              </button>
              <button type="button" className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => addShape("roundRect")}>
                ▢ {ar ? "مستدير" : "Round"}
              </button>
              <button type="button" className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => addShape("ellipse")}>
                ◯ {ar ? "دائرة" : "Circle"}
              </button>
              <button type="button" className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => addShape("triangle")}>
                △ {ar ? "مثلث" : "Triangle"}
              </button>
              <button type="button" className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => addShape("arrow")}>
                ➔ {ar ? "سهم" : "Arrow"}
              </button>
              <button type="button" className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => addShape("line")}>
                — {ar ? "خط" : "Line"}
              </button>
              <label className="btn btn-ghost cursor-pointer !px-2 !py-1 text-xs">
                {uploading ? "…" : ar ? "🖼 صورة" : "🖼 Image"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void handleAddImage(f);
                  }}
                />
              </label>
              <button type="button" className="btn btn-ghost !px-2 !py-1 text-xs" onClick={addChartElement}>
                📊 {ar ? "رسم" : "Chart"}
              </button>

              <div className="ms-auto flex flex-wrap items-center gap-1.5">
                <select
                  value={theme}
                  onChange={(e) => onThemeChange(e.target.value)}
                  className="input !w-auto !py-1 text-xs"
                  aria-label={ar ? "السمة" : "Theme"}
                >
                  {Object.values(SLIDE_THEMES).map((th) => (
                    <option key={th.id} value={th.id}>
                      {ar ? th.labelAr : th.labelEn}
                    </option>
                  ))}
                </select>
                <label className="btn btn-ghost cursor-pointer !px-2 !py-1 text-xs" title={ar ? "خلفية الشريحة" : "Slide Background"}>
                  {ar ? "خلفية" : "BG"}
                  <input
                    type="color"
                    value={slideBgHex}
                    onChange={(e) => updateSlideAt(safeIdx, { bgColor: stripHash(e.target.value) })}
                    className="ms-1 h-4 w-5 cursor-pointer border-0 bg-transparent p-0"
                  />
                </label>
                {currentSlide.bgColor && (
                  <button
                    type="button"
                    className="btn btn-ghost !px-1.5 !py-1 text-[11px]"
                    onClick={() => updateSlideAt(safeIdx, { bgColor: undefined })}
                  >
                    ✕ BG
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost !px-2 !py-1 text-xs"
                  onClick={() =>
                    updateSlideAt(safeIdx, { dir: currentSlide.dir === "rtl" ? "ltr" : "rtl" })
                  }
                >
                  {currentSlide.dir.toUpperCase()}
                </button>
                <button type="button" className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => moveCurrentSlide(-1)} disabled={safeIdx === 0}>
                  ↑
                </button>
                <button type="button" className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => moveCurrentSlide(1)} disabled={safeIdx === slides.length - 1}>
                  ↓
                </button>
                <button type="button" className="btn btn-ghost !px-2 !py-1 text-xs" onClick={duplicateCurrentSlide}>
                  ⧉
                </button>
                <button
                  type="button"
                  className="btn btn-ghost !px-2 !py-1 text-xs"
                  style={{ color: "#ff8b8b" }}
                  onClick={deleteCurrentSlide}
                  disabled={slides.length <= 1}
                >
                  🗑
                </button>
              </div>
            </div>

            {/* Selected Element Inspector Ribbon */}
            {selectedEl && (
              <div
                className="flex flex-wrap items-center gap-1.5 border-t pt-2 text-xs"
                style={{ borderColor: "var(--border)" }}
              >
                <span className="font-bold uppercase" style={{ color: "var(--turquoise)" }}>
                  {selectedEl.kind}
                </span>
                {(selectedEl.kind === "text" || selectedEl.kind === "shape") && (
                  <>
                    <select
                      value={String(selectedEl.fontSize ?? 18)}
                      onChange={(e) =>
                        updateElement(selectedEl.id, { fontSize: Number.parseInt(e.target.value, 10) })
                      }
                      className="input !w-auto !py-0.5 text-xs"
                    >
                      {[12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 60].map((sz) => (
                        <option key={sz} value={sz}>
                          {sz}px
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={`btn !px-2 !py-0.5 text-xs font-bold ${selectedEl.bold ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => updateElement(selectedEl.id, { bold: !selectedEl.bold })}
                    >
                      B
                    </button>
                    <button
                      type="button"
                      className={`btn !px-2 !py-0.5 text-xs italic ${selectedEl.italic ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => updateElement(selectedEl.id, { italic: !selectedEl.italic })}
                    >
                      I
                    </button>
                    <button
                      type="button"
                      className={`btn !px-2 !py-0.5 text-xs underline ${selectedEl.underline ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => updateElement(selectedEl.id, { underline: !selectedEl.underline })}
                    >
                      U
                    </button>
                    <label className="btn btn-ghost cursor-pointer !px-1.5 !py-0.5 text-xs" title="Text color">
                      A
                      <input
                        type="color"
                        value={asCssHex(selectedEl.color, `#${activeTheme.bodyHex}`)}
                        onChange={(e) => updateElement(selectedEl.id, { color: stripHash(e.target.value) })}
                        className="ms-1 h-4 w-4 border-0 bg-transparent p-0"
                      />
                    </label>
                    <label className="btn btn-ghost cursor-pointer !px-1.5 !py-0.5 text-xs" title="Fill color">
                      Fill
                      <input
                        type="color"
                        value={asCssHex(selectedEl.fillColor, `#${activeTheme.cardBgHex}`)}
                        onChange={(e) => updateElement(selectedEl.id, { fillColor: stripHash(e.target.value) })}
                        className="ms-1 h-4 w-4 border-0 bg-transparent p-0"
                      />
                    </label>
                    {selectedEl.fillColor && (
                      <button
                        type="button"
                        className="btn btn-ghost !px-1.5 !py-0.5 text-[11px]"
                        onClick={() => updateElement(selectedEl.id, { fillColor: undefined })}
                      >
                        No Fill
                      </button>
                    )}
                    <label className="btn btn-ghost cursor-pointer !px-1.5 !py-0.5 text-xs" title="Border color">
                      Border
                      <input
                        type="color"
                        value={asCssHex(selectedEl.borderColor, `#${activeTheme.accentHex}`)}
                        onChange={(e) =>
                          updateElement(selectedEl.id, {
                            borderColor: stripHash(e.target.value),
                            borderWidth: selectedEl.borderWidth || 2,
                          })
                        }
                        className="ms-1 h-4 w-4 border-0 bg-transparent p-0"
                      />
                    </label>
                    {(["left", "center", "right"] as TextAlign[]).map((al) => (
                      <button
                        key={al}
                        type="button"
                        className={`btn !px-1.5 !py-0.5 text-xs ${selectedEl.align === al ? "btn-primary" : "btn-ghost"}`}
                        onClick={() => updateElement(selectedEl.id, { align: al })}
                      >
                        {al[0]!.toUpperCase()}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="btn btn-ghost !px-1.5 !py-0.5 text-xs"
                      onClick={() =>
                        updateElement(selectedEl.id, { dir: selectedEl.dir === "rtl" ? "ltr" : "rtl" })
                      }
                    >
                      {(selectedEl.dir ?? "ltr").toUpperCase()}
                    </button>
                    {selectedEl.text && (
                      <AiMenu
                        projectId={projectId}
                        locale={locale}
                        label="AI"
                        text={selectedEl.text}
                        onUsageChange={onUsageChange}
                        onApply={(next) => updateElement(selectedEl.id, { text: next, runs: undefined })}
                      />
                    )}
                  </>
                )}

                {/* Layering controls for ANY element */}
                <span className="mx-1 h-4 w-px" style={{ background: "var(--border)" }} />
                <button type="button" className="btn btn-ghost !px-1.5 !py-0.5 text-[11px]" onClick={() => changeLayer(selectedEl.id, "front")} title="Bring to front">
                  ⤒ Front
                </button>
                <button type="button" className="btn btn-ghost !px-1.5 !py-0.5 text-[11px]" onClick={() => changeLayer(selectedEl.id, "forward")} title="Bring forward">
                  ↑ Fwd
                </button>
                <button type="button" className="btn btn-ghost !px-1.5 !py-0.5 text-[11px]" onClick={() => changeLayer(selectedEl.id, "backward")} title="Send backward">
                  ↓ Back
                </button>
                <button type="button" className="btn btn-ghost !px-1.5 !py-0.5 text-[11px]" onClick={() => changeLayer(selectedEl.id, "back")} title="Send to back">
                  ⤓ Bottom
                </button>
                <button type="button" className="btn btn-ghost !px-1.5 !py-0.5 text-xs" onClick={() => duplicateElement(selectedEl)}>
                  ⧉
                </button>
                <button
                  type="button"
                  className="btn btn-ghost !px-1.5 !py-0.5 text-xs"
                  style={{ color: "#ff8b8b" }}
                  onClick={() => deleteElement(selectedEl.id)}
                >
                  🗑
                </button>
              </div>
            )}
          </div>
        )}

        {/* Interactive 16:9 Slide Canvas */}
        {currentSlide && (
          <div
            ref={canvasRef}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={() => {
              setSelectedElId(null);
              setEditingElId(null);
            }}
            className="relative aspect-video w-full overflow-hidden rounded-2xl border shadow-2xl select-none"
            style={{
              background: slideBgHex,
              borderColor: `#${activeTheme.borderHex}`,
            }}
          >
            {[...elements]
              .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
              .map((el) => {
                const box = dragPreview[el.id] ?? { x: el.x, y: el.y, w: el.w, h: el.h };
                const isSelected = selectedElId === el.id;
                const isEditing = editingElId === el.id;
                const borderClr = asCssHex(el.borderColor, "transparent");
                const fillClr = asCssHex(el.fillColor, "transparent");

                return (
                  <div
                    key={el.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedElId(el.id);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (el.kind === "text" || el.kind === "shape") {
                        setSelectedElId(el.id);
                        setEditingElId(el.id);
                      }
                    }}
                    onPointerDown={(e) => beginPointer(e, el, "move")}
                    style={{
                      position: "absolute",
                      left: `${box.x}%`,
                      top: `${box.y}%`,
                      width: `${box.w}%`,
                      height: `${box.h}%`,
                      zIndex: el.zIndex ?? 1,
                      cursor: isEditing ? "text" : "move",
                      outline: isSelected ? "2px solid #00D4C8" : undefined,
                      outlineOffset: "1px",
                    }}
                  >
                    {el.kind === "shape" ? (
                      <div className="relative h-full w-full">
                        <ShapeVisual el={el} borderWidth={2} />
                        {(el.text || isEditing) && el.shape !== "line" && (
                          <div className="absolute inset-0 flex items-center justify-center p-2">
                            {isEditing ? (
                              <textarea
                                autoFocus
                                value={el.text ?? ""}
                                dir={el.dir ?? "auto"}
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  updateElement(el.id, { text: e.target.value, runs: undefined })
                                }
                                onBlur={() => setEditingElId(null)}
                                className="h-full w-full resize-none bg-transparent text-center outline-none"
                                style={{
                                  color: asCssHex(el.color, `#${activeTheme.titleHex}`),
                                  fontSize: `${el.fontSize ?? 16}px`,
                                  fontWeight: el.bold ? 700 : 400,
                                }}
                              />
                            ) : (
                              <div
                                dir={el.dir ?? "auto"}
                                className="w-full whitespace-pre-wrap break-words px-1"
                                style={{
                                  color: asCssHex(el.color, "#FFFFFF"),
                                  fontSize: `${el.fontSize ?? 16}px`,
                                  fontWeight: el.bold ? 700 : 400,
                                  fontStyle: el.italic ? "italic" : undefined,
                                  textDecoration: el.underline ? "underline" : undefined,
                                  textAlign: el.align ?? "center",
                                }}
                              >
                                {el.text}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : el.kind === "image" && el.assetId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/assets/${el.assetId}`}
                        alt=""
                        draggable={false}
                        className="h-full w-full object-contain pointer-events-none"
                      />
                    ) : el.kind === "chart" && el.chart ? (
                      <div className="h-full w-full pointer-events-none">
                        <SlideChart
                          chart={el.chart}
                          accentHex={`#${activeTheme.accentHex}`}
                          goldHex="#D9A441"
                          titleColor={`#${activeTheme.titleHex}`}
                          textColor={`#${activeTheme.bodyHex}`}
                          mutedColor={`#${activeTheme.subtitleHex}`}
                          surfaceBg={`#${activeTheme.cardBgHex}`}
                          borderColor={`#${activeTheme.borderHex}`}
                          rtl={currentSlide.dir === "rtl"}
                        />
                      </div>
                    ) : (
                      <div
                        className="h-full w-full overflow-hidden rounded p-1.5"
                        style={{
                          backgroundColor: fillClr,
                          border:
                            borderClr !== "transparent"
                              ? `${el.borderWidth ?? 1}px solid ${borderClr}`
                              : isSelected
                                ? "1px dashed rgba(148,163,184,0.45)"
                                : undefined,
                        }}
                      >
                        {isEditing ? (
                          <textarea
                            autoFocus
                            value={el.text ?? ""}
                            dir={el.dir ?? "auto"}
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              updateElement(el.id, {
                                text: e.target.value,
                                runs: undefined,
                                dir: /[\u0600-\u06FF]/.test(e.target.value)
                                  ? el.dir ?? "rtl"
                                  : el.dir ?? "ltr",
                              })
                            }
                            onBlur={() => setEditingElId(null)}
                            className="h-full w-full resize-none bg-transparent outline-none"
                            style={{
                              color: asCssHex(el.color, `#${activeTheme.bodyHex}`),
                              fontSize: `${Math.max(11, Math.round((el.fontSize ?? 18) * 0.92))}px`,
                              fontWeight: el.bold ? 700 : 400,
                              fontStyle: el.italic ? "italic" : undefined,
                              textDecoration: el.underline ? "underline" : undefined,
                              textAlign: el.align ?? (el.dir === "rtl" ? "right" : "left"),
                            }}
                          />
                        ) : (
                          <div
                            dir={el.dir ?? "auto"}
                            className="h-full w-full whitespace-pre-wrap break-words leading-snug"
                            style={{
                              color: asCssHex(el.color, `#${activeTheme.bodyHex}`),
                              fontSize: `${Math.max(11, Math.round((el.fontSize ?? 18) * 0.92))}px`,
                              fontWeight: el.bold ? 700 : 400,
                              fontStyle: el.italic ? "italic" : undefined,
                              textDecoration: el.underline ? "underline" : undefined,
                              textAlign: el.align ?? (el.dir === "rtl" ? "right" : "left"),
                            }}
                          >
                            {el.text || (ar ? "انقر مرتين للكتابة…" : "Double-click to type…")}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Corner Resize Handles when Selected */}
                    {isSelected && !isEditing && (
                      <>
                        {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                          <span
                            key={corner}
                            onPointerDown={(e) => beginPointer(e, el, corner)}
                            style={{
                              position: "absolute",
                              width: 10,
                              height: 10,
                              background: "#00D4C8",
                              border: "1.5px solid #0B131C",
                              borderRadius: "2px",
                              top: corner.startsWith("n") ? -5 : undefined,
                              bottom: corner.startsWith("s") ? -5 : undefined,
                              left: corner.endsWith("w") ? -5 : undefined,
                              right: corner.endsWith("e") ? -5 : undefined,
                              cursor: `${corner}-resize`,
                              zIndex: 999,
                            }}
                          />
                        ))}
                      </>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        {/* Chart Series Data Editor when a Chart Element is Selected */}
        {selectedEl?.kind === "chart" && selectedEl.chart && (
          <div className="card space-y-2.5 p-3.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold uppercase" style={{ color: "var(--turquoise)" }}>
                {ar ? "تعديل بيانات الرسم البياني" : "Chart Data Editor"}
              </span>
              <div className="flex items-center gap-2">
                <select
                  value={selectedEl.chart.kind}
                  onChange={(e) =>
                    updateElement(selectedEl.id, {
                      chart: { ...selectedEl.chart!, kind: e.target.value as ChartData["kind"] },
                    })
                  }
                  className="input !w-auto !py-1 text-xs"
                >
                  <option value="bar">Bar</option>
                  <option value="line">Line</option>
                  <option value="pie">Pie</option>
                </select>
                <input
                  value={selectedEl.chart.unit ?? ""}
                  onChange={(e) =>
                    updateElement(selectedEl.id, {
                      chart: { ...selectedEl.chart!, unit: e.target.value || undefined },
                    })
                  }
                  placeholder="Unit ($M / %)"
                  className="input !w-24 !py-1 text-xs"
                />
              </div>
            </div>
            <input
              value={selectedEl.chart.title}
              onChange={(e) =>
                updateElement(selectedEl.id, {
                  chart: { ...selectedEl.chart!, title: e.target.value },
                })
              }
              className="input !py-1 text-xs"
              placeholder="Chart title"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              {selectedEl.chart.categories.map((cat, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <input
                    value={cat}
                    onChange={(e) => {
                      const cats = [...selectedEl.chart!.categories];
                      cats[idx] = e.target.value;
                      updateElement(selectedEl.id, { chart: { ...selectedEl.chart!, categories: cats } });
                    }}
                    className="input !py-1 text-xs"
                  />
                  <input
                    type="number"
                    step="any"
                    value={selectedEl.chart!.values[idx] ?? 0}
                    onChange={(e) => {
                      const vals = [...selectedEl.chart!.values];
                      const p = Number.parseFloat(e.target.value);
                      vals[idx] = Number.isFinite(p) ? p : 0;
                      updateElement(selectedEl.id, { chart: { ...selectedEl.chart!, values: vals } });
                    }}
                    className="input !w-24 !py-1 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Speaker Notes */}
        {currentSlide && (
          <div className="card p-3.5">
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>
              {ar ? "ملاحظات المتحدث" : "Speaker notes"}
            </label>
            <textarea
              value={currentSlide.notes}
              onChange={(e) => updateSlideAt(safeIdx, { notes: e.target.value })}
              placeholder={ar ? "ملاحظات المتحدث…" : "Speaker notes…"}
              className="input text-sm"
              dir="auto"
              rows={2}
              maxLength={5000}
            />
          </div>
        )}
      </section>
    </div>
  );
}
