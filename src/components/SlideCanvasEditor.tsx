"use client";

import { useEffect, useRef, useState } from "react";
import { AiGeneratePanel, AiMenu } from "@/components/AiAssist";
import { SlideChart } from "@/components/SlideChart";
import { ChartDataEditor, CropControlsBar } from "@/components/MediaControls";
import { SLIDE_THEMES, resolveSlideTheme } from "@/lib/projects/themes";
import { slideToCanvasElements } from "@/lib/presentation/elements";
import { detectFirstStrongDir } from "@/lib/utils/bidi";
import {
  OFFICE_FONT_FAMILIES,
  SLIDE_FONT_SIZES,
  croppedImageCss,
  formatDisplayNumber,
  normalizeCrop,
  toggleDigitsScript,
} from "@/lib/utils/mediaStyle";
import type {
  ChartData,
  ImageCrop,
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
  showSlideNumbers?: boolean;
  fidelityWarnings?: string[];
  usage: { used: number; limit: number };
  onThemeChange: (nextTheme: string) => void;
  onSlidesChange: (nextSlides: SlideItem[]) => void;
  onShowSlideNumbersChange?: (next: boolean) => void;
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

function SlideTableElementView({
  el,
  activeTheme,
  isEditing,
  onStartEdit,
  onUpdate,
}: {
  el: SlideElement;
  activeTheme: ReturnType<typeof resolveSlideTheme>;
  isEditing: boolean;
  onStartEdit: () => void;
  onUpdate: (patch: Partial<SlideElement>) => void;
}) {
  const rows = el.rows && el.rows.length > 0 ? el.rows : [["A", "B"], ["", ""]];
  const colCount = Math.max(...rows.map((r) => r.length), 1);
  const defaultW = Math.round((100 / colCount) * 10) / 10;
  const rawCols =
    el.colWidths && el.colWidths.length === colCount
      ? el.colWidths
      : Array.from({ length: colCount }, () => defaultW);
  const colSum = rawCols.reduce((a, b) => a + b, 0) || 100;
  const colPcts = rawCols.map((w) => (w / colSum) * 100);
  const tableRef = useRef<HTMLTableElement | null>(null);

  function startColDrag(e: React.PointerEvent, colIdx: number) {
    e.preventDefault();
    e.stopPropagation();
    const tbl = tableRef.current;
    if (!tbl || colIdx >= colCount - 1) return;
    const tblW = Math.max(120, tbl.getBoundingClientRect().width);
    const startX = e.clientX;
    const base = [...colPcts];

    const onMove = (me: PointerEvent) => {
      const dxPct = ((me.clientX - startX) / tblW) * 100;
      const sign = el.dir === "rtl" ? -1 : 1;
      const d = dxPct * sign;
      const a = Math.max(8, Math.min(base[colIdx]! + base[colIdx + 1]! - 8, base[colIdx]! + d));
      const b = base[colIdx]! + base[colIdx + 1]! - a;
      const next = [...base];
      next[colIdx] = Math.round(a * 10) / 10;
      next[colIdx + 1] = Math.round(b * 10) / 10;
      onUpdate({ colWidths: next });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function startRowDrag(e: React.PointerEvent, rowIdx: number) {
    e.preventDefault();
    e.stopPropagation();
    const rowEl = (e.currentTarget as HTMLElement).closest("tr");
    if (!rowEl) return;
    const startY = e.clientY;
    const baseHeights = rows.map((_, i) => el.rowHeights?.[i] ?? 32);
    const origH = baseHeights[rowIdx] ?? Math.round(rowEl.getBoundingClientRect().height);

    const onMove = (me: PointerEvent) => {
      const nextH = Math.max(20, Math.min(260, Math.round(origH + (me.clientY - startY))));
      const next = [...baseHeights];
      next[rowIdx] = nextH;
      onUpdate({ rowHeights: next });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const borderClr = asCssHex(el.borderColor, `#${activeTheme.borderHex}`);
  const headerBg = asCssHex(el.fillColor, `#${activeTheme.cardBgHex}`);
  const textClr = asCssHex(el.color, `#${activeTheme.bodyHex}`);

  return (
    <div
      className="h-full w-full overflow-hidden rounded"
      dir={el.dir === "rtl" ? "rtl" : "ltr"}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onStartEdit();
      }}
    >
      <table
        ref={tableRef}
        className="h-full w-full border-collapse table-fixed"
        style={{
          fontSize: `${Math.max(9, Math.round((el.fontSize ?? 13) * 0.9))}px`,
          fontFamily: el.fontFamily || undefined,
          color: textClr,
        }}
      >
        <colgroup>
          {colPcts.map((w, ci) => (
            <col key={ci} style={{ width: `${w}%` }} />
          ))}
        </colgroup>
        <tbody>
          {rows.map((row, rIdx) => {
            const rH = el.rowHeights?.[rIdx];
            return (
              <tr key={rIdx} style={rH ? { height: `${rH}px` } : undefined}>
                {Array.from({ length: colCount }, (_, cIdx) => {
                  const val = row[cIdx] ?? "";
                  const CellTag = rIdx === 0 ? "th" : "td";
                  return (
                    <CellTag
                      key={cIdx}
                      className="relative px-1.5 py-1 align-middle"
                      style={{
                        border: `1px solid ${borderClr}`,
                        background: rIdx === 0 ? headerBg : "transparent",
                        fontWeight: rIdx === 0 ? 700 : 400,
                      }}
                    >
                      {isEditing ? (
                        <input
                          value={val}
                          dir="auto"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const nextRows = rows.map((rr, ri) =>
                              ri === rIdx
                                ? Array.from({ length: colCount }, (__, ci) =>
                                    ci === cIdx ? e.target.value : (rr[ci] ?? ""),
                                  )
                                : rr,
                            );
                            onUpdate({ rows: nextRows });
                          }}
                          className="w-full bg-transparent outline-none"
                          style={{ color: textClr }}
                        />
                      ) : (
                        <div className="truncate" dir="auto">
                          {val}
                        </div>
                      )}

                      {cIdx < colCount - 1 && (
                        <span
                          onPointerDown={(e) => startColDrag(e, cIdx)}
                          title="Drag to resize column"
                          style={{
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                            [el.dir === "rtl" ? "left" : "right"]: -3,
                            width: 6,
                            cursor: "col-resize",
                            zIndex: 20,
                          }}
                        />
                      )}
                      <span
                        onPointerDown={(e) => startRowDrag(e, rIdx)}
                        title="Drag to resize row"
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          bottom: -3,
                          height: 6,
                          cursor: "row-resize",
                          zIndex: 20,
                        }}
                      />
                    </CellTag>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SlideCanvasEditor({
  projectId,
  locale,
  language,
  theme,
  slides,
  showSlideNumbers = false,
  fidelityWarnings,
  usage,
  onThemeChange,
  onSlidesChange,
  onShowSlideNumbersChange,
  onAiGenerated,
  onUsageChange,
  onUploadImage,
}: SlideCanvasEditorProps) {
  const ar = locale === "ar";
  const activeTheme = resolveSlideTheme(theme);

  const [selectedSlideIdx, setSelectedSlideIdx] = useState(0);
  const [selectedElId, setSelectedElId] = useState<string | null>(null);
  const [editingElId, setEditingElId] = useState<string | null>(null);
  const [croppingElId, setCroppingElId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showWarnings, setShowWarnings] = useState(true);
  const [showAiDrawer, setShowAiDrawer] = useState(false);
  const [dragPreview, setDragPreview] = useState<Record<string, { x: number; y: number; w: number; h: number }>>({});
  const [cropPreview, setCropPreview] = useState<Record<string, ImageCrop>>({});

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    elId: string;
    mode:
      | "move"
      | "nw"
      | "n"
      | "ne"
      | "e"
      | "se"
      | "s"
      | "sw"
      | "w"
      | "crop-t"
      | "crop-r"
      | "crop-b"
      | "crop-l";
    startX: number;
    startY: number;
    orig: { x: number; y: number; w: number; h: number };
    origCrop: ImageCrop;
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
    const isSlideRtl = currentSlide?.dir === "rtl";
    const el: SlideElement = {
      id: elUid("txt"),
      kind: "text",
      x: 15,
      y: 35,
      w: 50,
      h: 22,
      zIndex: nextZ(),
      text: "",
      fontSize: 18,
      color: activeTheme.bodyHex,
      ...(isSlideRtl ? { align: "right" as const, dir: "rtl" as const } : {}),
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

  function addTableElement() {
    const rtlSlide = currentSlide?.dir === "rtl";
    const rows = rtlSlide
      ? [
          ["البند", "القيمة", "ملاحظات"],
          ["عنصر ١", "١٠٠", ""],
          ["عنصر ٢", "٢٠٠", ""],
        ]
      : [
          ["Item", "Value", "Notes"],
          ["Row 1", "100", ""],
          ["Row 2", "200", ""],
        ];
    const el: SlideElement = {
      id: elUid("tbl"),
      kind: "table",
      x: 10,
      y: 25,
      w: 80,
      h: 36,
      zIndex: nextZ(),
      rows,
      colWidths: [34, 33, 33],
      rowHeights: [36, 36, 36],
      fontSize: 13,
      color: activeTheme.bodyHex,
      fillColor: activeTheme.cardBgHex,
      borderColor: activeTheme.borderHex,
      dir: rtlSlide ? "rtl" : "ltr",
    };
    commitElements([...elements, el]);
    setSelectedElId(el.id);
    setEditingElId(null);
    setCroppingElId(null);
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
    mode:
      | "move"
      | "nw"
      | "n"
      | "ne"
      | "e"
      | "se"
      | "s"
      | "sw"
      | "w"
      | "crop-t"
      | "crop-r"
      | "crop-b"
      | "crop-l",
  ) {
    if (editingElId === el.id) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedElId(el.id);
    setEditingElId(null);
    if (croppingElId && croppingElId !== el.id) setCroppingElId(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStateRef.current = {
      elId: el.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      orig: { x: el.x, y: el.y, w: el.w, h: el.h },
      origCrop: normalizeCrop(el.crop),
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const st = dragStateRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!st || !rect || rect.width <= 0 || rect.height <= 0) return;

    if (st.mode.startsWith("crop-")) {
      const elWpx = Math.max(24, (st.orig.w / 100) * rect.width);
      const elHpx = Math.max(24, (st.orig.h / 100) * rect.height);
      const dxElPct = ((e.clientX - st.startX) / elWpx) * 100;
      const dyElPct = ((e.clientY - st.startY) / elHpx) * 100;
      const c = { ...st.origCrop };
      const clampCrop = (v: number, opp: number) =>
        Math.round(Math.max(0, Math.min(80 - opp, v)) * 10) / 10;
      if (st.mode === "crop-t") c.top = clampCrop(st.origCrop.top + dyElPct, c.bottom);
      if (st.mode === "crop-b") c.bottom = clampCrop(st.origCrop.bottom - dyElPct, c.top);
      if (st.mode === "crop-l") c.left = clampCrop(st.origCrop.left + dxElPct, c.right);
      if (st.mode === "crop-r") c.right = clampCrop(st.origCrop.right - dxElPct, c.left);
      setCropPreview({ [st.elId]: c });
      return;
    }

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
        const nextW = Math.max(3, Math.min(120, st.orig.w - dxPct));
        x = st.orig.x + (st.orig.w - nextW);
        w = nextW;
      }
      if (st.mode.includes("n")) {
        const nextH = Math.max(3, Math.min(120, st.orig.h - dyPct));
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
    if (st.mode.startsWith("crop-")) {
      const finalCrop = cropPreview[st.elId];
      setCropPreview({});
      if (finalCrop) {
        updateElement(st.elId, { crop: finalCrop });
      }
      return;
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
            <div className="flex items-center justify-between gap-2 font-bold" style={{ color: "var(--gold)" }}>
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
              <button type="button" className="btn btn-ghost !px-2 !py-1 text-xs" onClick={addTableElement}>
                ▦ {ar ? "جدول" : "Table"}
              </button>
              <button
                type="button"
                className={`btn !px-2 !py-1 text-xs ${showSlideNumbers ? "btn-primary" : "btn-ghost"}`}
                onClick={() => onShowSlideNumbersChange?.(!showSlideNumbers)}
                title={ar ? "إظهار/إخفاء أرقام الشرائح" : "Toggle slide numbering"}
              >
                # {ar ? "ترقيم" : "Slide #"}
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
                  style={{ color: "var(--danger)" }}
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
                {(selectedEl.kind === "text" || selectedEl.kind === "shape" || selectedEl.kind === "table") && (
                  <>
                    <select
                      value={selectedEl.fontFamily || ""}
                      onChange={(e) =>
                        updateElement(selectedEl.id, { fontFamily: e.target.value || undefined })
                      }
                      className="input !w-auto max-w-36 !py-0.5 text-xs"
                      aria-label={ar ? "نوع الخط" : "Font family"}
                    >
                      {OFFICE_FONT_FAMILIES.map((f) => (
                        <option key={f.value || "default"} value={f.value}>
                          {ar ? f.labelAr : f.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={String(selectedEl.fontSize ?? 18)}
                      onChange={(e) =>
                        updateElement(selectedEl.id, { fontSize: Number.parseInt(e.target.value, 10) })
                      }
                      className="input !w-auto !py-0.5 text-xs"
                    >
                      {SLIDE_FONT_SIZES.map((sz) => (
                        <option key={sz} value={sz}>
                          {sz}px
                        </option>
                      ))}
                    </select>
                    {selectedEl.kind !== "table" && (
                      <>
                        <button
                          type="button"
                          className={`btn !px-2 !py-0.5 text-xs font-bold ${selectedEl.bold ? "btn-primary" : "btn-ghost"}`}
                          onClick={() => updateElement(selectedEl.id, { bold: !selectedEl.bold })}
                        >
                          B
                        </button>
                      </>
                    )}
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
                    {(["auto", "rtl", "ltr"] as const).map((d) => {
                      const active = (selectedEl.dir ?? "auto") === d;
                      return (
                        <button
                          key={d}
                          type="button"
                          className={`btn !px-1.5 !py-0.5 text-xs ${active ? "btn-primary" : "btn-ghost"}`}
                          onClick={() => {
                            const alignPatch =
                              selectedEl.align === "center" || selectedEl.align === "justify"
                                ? {}
                                : { align: d === "rtl" ? ("right" as const) : d === "ltr" ? ("left" as const) : undefined };
                            updateElement(selectedEl.id, {
                              dir: d === "auto" ? undefined : d,
                              ...alignPatch,
                            });
                          }}
                          title={d === "auto" ? "Auto direction (Arabic RTL / English LTR)" : `Force ${d.toUpperCase()}`}
                        >
                          {d === "auto" ? (ar ? "تلقائي" : "Auto") : d.toUpperCase()}
                        </button>
                      );
                    })}
                    {selectedEl.text && (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost !px-1.5 !py-0.5 text-xs font-semibold"
                          onClick={() =>
                            updateElement(selectedEl.id, {
                              text: toggleDigitsScript(selectedEl.text || ""),
                              runs: undefined,
                            })
                          }
                          title={ar ? "تحويل الأرقام (١٢٣ ↔ 123)" : "Toggle digits (١٢٣ ↔ 123)"}
                        >
                          ١٢٣↔123
                        </button>
                        <AiMenu
                          projectId={projectId}
                          locale={locale}
                          label="AI"
                          text={selectedEl.text}
                          onUsageChange={onUsageChange}
                          onApply={(next) => updateElement(selectedEl.id, { text: next, runs: undefined })}
                        />
                      </>
                    )}
                  </>
                )}

                {selectedEl.kind === "image" && (
                  <>
                    <button
                      type="button"
                      className={`btn !px-2 !py-0.5 text-xs ${croppingElId === selectedEl.id ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => setCroppingElId((v) => (v === selectedEl.id ? null : selectedEl.id))}
                    >
                      ✂ {ar ? "قص" : "Crop"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost !px-2 !py-0.5 text-xs"
                      onClick={() =>
                        updateElement(selectedEl.id, {
                          objectFit: selectedEl.objectFit === "cover" ? "contain" : "cover",
                        })
                      }
                      title="Toggle Contain / Cover fit"
                    >
                      {selectedEl.objectFit === "cover" ? "Cover" : "Contain"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost !px-2 !py-0.5 text-xs"
                      onClick={() =>
                        updateElement(selectedEl.id, {
                          crop: { top: 0, right: 0, bottom: 0, left: 0 },
                          rotation: 0,
                        })
                      }
                    >
                      ⟲ {ar ? "إعادة ضبط" : "Reset"}
                    </button>
                  </>
                )}

                {selectedEl.kind === "table" && selectedEl.rows && (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost !px-1.5 !py-0.5 text-xs"
                      onClick={() => {
                        const cols = Math.max(...selectedEl.rows!.map((r) => r.length), 1);
                        updateElement(selectedEl.id, {
                          rows: [...selectedEl.rows!, Array.from({ length: cols }, () => "")],
                          rowHeights: [...(selectedEl.rowHeights ?? selectedEl.rows!.map(() => 36)), 36],
                        });
                      }}
                    >
                      + {ar ? "صف" : "Row"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost !px-1.5 !py-0.5 text-xs"
                      onClick={() => {
                        if (selectedEl.rows!.length <= 1) return;
                        updateElement(selectedEl.id, {
                          rows: selectedEl.rows!.slice(0, -1),
                          rowHeights: selectedEl.rowHeights?.slice(0, -1),
                        });
                      }}
                    >
                      − {ar ? "صف" : "Row"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost !px-1.5 !py-0.5 text-xs"
                      onClick={() => {
                        const nextCols = selectedEl.rows![0]!.length + 1;
                        const eq = Math.round((100 / nextCols) * 10) / 10;
                        updateElement(selectedEl.id, {
                          rows: selectedEl.rows!.map((r) => [...r, ""]),
                          colWidths: Array.from({ length: nextCols }, () => eq),
                        });
                      }}
                    >
                      + {ar ? "عمود" : "Col"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost !px-1.5 !py-0.5 text-xs"
                      onClick={() => {
                        const cols = selectedEl.rows![0]!.length;
                        if (cols <= 1) return;
                        const nextCols = cols - 1;
                        const eq = Math.round((100 / nextCols) * 10) / 10;
                        updateElement(selectedEl.id, {
                          rows: selectedEl.rows!.map((r) => r.slice(0, -1)),
                          colWidths: Array.from({ length: nextCols }, () => eq),
                        });
                      }}
                    >
                      − {ar ? "عمود" : "Col"}
                    </button>
                  </>
                )}

                {/* Quick Align, Rotation & Layering controls for ANY element */}
                <span className="mx-1 h-4 w-px" style={{ background: "var(--border)" }} />
                <button type="button" className="btn btn-ghost !px-1.5 !py-0.5 text-[11px]" onClick={() => updateElement(selectedEl.id, { x: 4 })} title="Align Left on Slide">
                  ⫷
                </button>
                <button type="button" className="btn btn-ghost !px-1.5 !py-0.5 text-[11px]" onClick={() => updateElement(selectedEl.id, { x: Math.round((50 - selectedEl.w / 2) * 10) / 10 })} title="Center Horizontally">
                  ⫶
                </button>
                <button type="button" className="btn btn-ghost !px-1.5 !py-0.5 text-[11px]" onClick={() => updateElement(selectedEl.id, { x: Math.round((96 - selectedEl.w) * 10) / 10 })} title="Align Right on Slide">
                  ⫸
                </button>
                <button type="button" className="btn btn-ghost !px-1.5 !py-0.5 text-[11px]" onClick={() => updateElement(selectedEl.id, { y: Math.round((50 - selectedEl.h / 2) * 10) / 10 })} title="Center Vertically">
                  ⫼
                </button>
                <button type="button" className="btn btn-ghost !px-1.5 !py-0.5 text-[11px]" onClick={() => updateElement(selectedEl.id, { rotation: ((selectedEl.rotation ?? 0) + 15) % 360 })} title="Rotate +15°">
                  ↻ {selectedEl.rotation ? `${Math.round(selectedEl.rotation)}°` : "0°"}
                </button>
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
                  style={{ color: "var(--danger)" }}
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
              setCroppingElId(null);
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
                const isCropping = croppingElId === el.id && el.kind === "image";
                const borderClr = asCssHex(el.borderColor, "transparent");
                const fillClr = asCssHex(el.fillColor, "transparent");
                const activeCrop = cropPreview[el.id] ?? el.crop;

                return (
                  <div
                    key={el.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedElId(el.id);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (el.kind === "text" || el.kind === "shape" || el.kind === "table") {
                        setSelectedElId(el.id);
                        setEditingElId(el.id);
                      } else if (el.kind === "image") {
                        setSelectedElId(el.id);
                        setCroppingElId((c) => (c === el.id ? null : el.id));
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
                      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                      cursor: isEditing ? "text" : "move",
                      outline: isCropping
                        ? "2px dashed #D9A441"
                        : isSelected
                          ? "2px solid #00D4C8"
                          : undefined,
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
                                placeholder={ar ? "اكتب هنا…" : "Type text…"}
                                dir={el.dir ?? detectFirstStrongDir(el.text ?? "") ?? "auto"}
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
                                  fontFamily: el.fontFamily || undefined,
                                  fontWeight: el.bold ? 700 : 400,
                                  unicodeBidi: el.dir ? "isolate" : "plaintext",
                                }}
                              />
                            ) : (
                              <div
                                dir={el.dir ?? detectFirstStrongDir(el.text ?? "") ?? "auto"}
                                className="w-full whitespace-pre-wrap break-words px-1"
                                style={{
                                  color: asCssHex(el.color, "#FFFFFF"),
                                  fontSize: `${el.fontSize ?? 16}px`,
                                  fontFamily: el.fontFamily || undefined,
                                  fontWeight: el.bold ? 700 : 400,
                                  fontStyle: el.italic ? "italic" : undefined,
                                  textDecoration: el.underline ? "underline" : undefined,
                                  textAlign: el.align ?? "center",
                                  unicodeBidi: el.dir ? "isolate" : "plaintext",
                                }}
                              >
                                {el.text}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : el.kind === "image" && el.assetId ? (
                      <div
                        dir="ltr"
                        className="relative h-full w-full overflow-hidden rounded pointer-events-none"
                        style={{
                          backgroundColor:
                            fillClr !== "transparent" ? fillClr : undefined,
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/assets/${el.assetId}`}
                          alt=""
                          draggable={false}
                          style={croppedImageCss(activeCrop, el.objectFit ?? "contain")}
                        />
                      </div>
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
                    ) : el.kind === "table" ? (
                      <SlideTableElementView
                        el={el}
                        activeTheme={activeTheme}
                        isEditing={isEditing}
                        onStartEdit={() => {
                          setSelectedElId(el.id);
                          setEditingElId(el.id);
                        }}
                        onUpdate={(patch) => updateElement(el.id, patch)}
                      />
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
                        {(() => {
                          const resolvedDir =
                            el.dir ??
                            detectFirstStrongDir(el.text ?? "") ??
                            (currentSlide.dir === "rtl" ? "rtl" : "auto");
                          const resolvedAlign: React.CSSProperties["textAlign"] =
                            el.align ??
                            (resolvedDir === "rtl" ? "right" : resolvedDir === "ltr" ? "left" : "start");
                          const bidiStyle = {
                            color: asCssHex(el.color, `#${activeTheme.bodyHex}`),
                            fontSize: `${Math.max(11, Math.round((el.fontSize ?? 18) * 0.92))}px`,
                            fontFamily: el.fontFamily || undefined,
                            fontWeight: el.bold ? 700 : 400,
                            fontStyle: el.italic ? "italic" : undefined,
                            textDecoration: el.underline ? "underline" : undefined,
                            textAlign: resolvedAlign,
                            unicodeBidi: (el.dir ? "isolate" : "plaintext") as "isolate" | "plaintext",
                          };
                          return isEditing ? (
                            <textarea
                              autoFocus
                              value={el.text ?? ""}
                              placeholder={ar ? "اكتب النص هنا…" : "Type text…"}
                              dir={resolvedDir}
                              onClick={(e) => e.stopPropagation()}
                              onPointerDown={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                updateElement(el.id, {
                                  text: e.target.value,
                                  runs: undefined,
                                })
                              }
                              onBlur={() => setEditingElId(null)}
                              className="h-full w-full resize-none bg-transparent outline-none"
                              style={bidiStyle}
                            />
                          ) : (
                            <div
                              dir={resolvedDir}
                              className="h-full w-full whitespace-pre-wrap break-words leading-snug"
                              style={bidiStyle}
                            >
                              {el.text || (ar ? "انقر مرتين للكتابة…" : "Double-click to type…")}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* 8-Point Resize Handles OR Edge Crop Bars when Selected */}
                    {isSelected && !isEditing && !isCropping && (
                      <>
                        {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((handle) => {
                          const isTop = handle.startsWith("n");
                          const isBottom = handle.startsWith("s");
                          const isLeft = handle.endsWith("w");
                          const isRight = handle.endsWith("e");
                          const isMidH = handle === "n" || handle === "s";
                          const isMidV = handle === "e" || handle === "w";
                          return (
                            <span
                              key={handle}
                              onPointerDown={(e) => beginPointer(e, el, handle)}
                              style={{
                                position: "absolute",
                                width: isMidH ? 16 : 10,
                                height: isMidV ? 16 : 10,
                                background: "#00D4C8",
                                border: "1.5px solid #0B131C",
                                borderRadius: "2px",
                                top: isTop ? -5 : isMidV ? "calc(50% - 8px)" : undefined,
                                bottom: isBottom ? -5 : undefined,
                                left: isLeft ? -5 : isMidH ? "calc(50% - 8px)" : undefined,
                                right: isRight ? -5 : undefined,
                                cursor: `${handle}-resize`,
                                zIndex: 999,
                              }}
                            />
                          );
                        })}
                      </>
                    )}

                    {isCropping && (
                      <>
                        <span
                          onPointerDown={(e) => beginPointer(e, el, "crop-t")}
                          title={ar ? "قص من الأعلى" : "Crop top"}
                          style={{
                            position: "absolute",
                            top: `${normalizeCrop(activeCrop).top}%`,
                            left: "25%",
                            width: "50%",
                            height: 6,
                            marginTop: -3,
                            background: "#D9A441",
                            border: "1px solid #0B131C",
                            borderRadius: 3,
                            cursor: "ns-resize",
                            zIndex: 1000,
                          }}
                        />
                        <span
                          onPointerDown={(e) => beginPointer(e, el, "crop-b")}
                          title={ar ? "قص من الأسفل" : "Crop bottom"}
                          style={{
                            position: "absolute",
                            bottom: `${normalizeCrop(activeCrop).bottom}%`,
                            left: "25%",
                            width: "50%",
                            height: 6,
                            marginBottom: -3,
                            background: "#D9A441",
                            border: "1px solid #0B131C",
                            borderRadius: 3,
                            cursor: "ns-resize",
                            zIndex: 1000,
                          }}
                        />
                        <span
                          onPointerDown={(e) => beginPointer(e, el, "crop-l")}
                          title={ar ? "قص من اليسار" : "Crop left"}
                          style={{
                            position: "absolute",
                            left: `${normalizeCrop(activeCrop).left}%`,
                            top: "25%",
                            height: "50%",
                            width: 6,
                            marginLeft: -3,
                            background: "#D9A441",
                            border: "1px solid #0B131C",
                            borderRadius: 3,
                            cursor: "ew-resize",
                            zIndex: 1000,
                          }}
                        />
                        <span
                          onPointerDown={(e) => beginPointer(e, el, "crop-r")}
                          title={ar ? "قص من اليمين" : "Crop right"}
                          style={{
                            position: "absolute",
                            right: `${normalizeCrop(activeCrop).right}%`,
                            top: "25%",
                            height: "50%",
                            width: 6,
                            marginRight: -3,
                            background: "#D9A441",
                            border: "1px solid #0B131C",
                            borderRadius: 3,
                            cursor: "ew-resize",
                            zIndex: 1000,
                          }}
                        />
                      </>
                    )}
                  </div>
                );
              })}

            {showSlideNumbers && (
              <div
                className="pointer-events-none absolute bottom-2.5 right-3.5 rounded px-2 py-0.5 text-xs font-semibold"
                style={{
                  color: `#${activeTheme.subtitleHex}`,
                  backgroundColor: "rgba(0,0,0,0.18)",
                }}
              >
                {formatDisplayNumber(safeIdx + 1, currentSlide.dir === "rtl" || ar)}
              </div>
            )}
          </div>
        )}

        {/* Chart Series Data Editor when a Chart Element is Selected */}
        {selectedEl?.kind === "chart" && selectedEl.chart && (
          <ChartDataEditor
            chart={selectedEl.chart}
            ar={ar}
            onChange={(next) => updateElement(selectedEl.id, { chart: next })}
          />
        )}

        {/* Numeric Crop Controls when Cropping an Image Element */}
        {selectedEl?.kind === "image" && croppingElId === selectedEl.id && (
          <CropControlsBar
            crop={cropPreview[selectedEl.id] ?? selectedEl.crop}
            ar={ar}
            onChange={(next) => updateElement(selectedEl.id, { crop: next })}
            onDone={() => setCroppingElId(null)}
          />
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
