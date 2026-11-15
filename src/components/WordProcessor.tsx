"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type Editor } from "@tiptap/react";
import { Extension, Node, mergeAttributes, type NodeViewProps } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { SlideChart } from "@/components/SlideChart";
import { AiGeneratePanel, AiMenu } from "@/components/AiAssist";
import { ChartDataEditor, CropControlsBar } from "@/components/MediaControls";
import { blocksToTiptapDoc, tiptapDocToBlocks } from "@/lib/document/tiptapSync";
import {
  DOC_FONT_SIZES,
  LIST_STYLE_OPTIONS,
  OFFICE_FONT_FAMILIES,
  croppedImageCss,
  normalizeCrop,
  toggleDigitsScript,
} from "@/lib/utils/mediaStyle";
import type { ChartData, DocumentBlock, ImageCrop, PageLayout, TextAlign as AlignVal } from "@/lib/validation/projects";
import type { Locale } from "@/lib/i18n";

/** Global per-block `dir` + list style attributes cleanly layered over StarterKit. */
const BlockFormattingExtension = Extension.create({
  name: "blockDirectionAndLists",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading", "blockquote", "bulletList", "orderedList"],
        attributes: {
          dir: {
            default: "auto",
            keepOnSplit: false,
            parseHTML: (element) => element.getAttribute("dir") || "auto",
            renderHTML: (attributes) => ({ dir: attributes.dir || "auto" }),
          },
        },
      },
      {
        types: ["bulletList", "orderedList"],
        attributes: {
          listStyle: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-list-style") || null,
            renderHTML: (attributes) =>
              attributes.listStyle ? { "data-list-style": String(attributes.listStyle) } : {},
          },
        },
      },
    ];
  },
});

/** Swap a top-level block node up (-1) or down (+1) in the ProseMirror document. */
function moveTopLevelNode(editor: Editor, nodePos: number | undefined, delta: -1 | 1): boolean {
  if (typeof nodePos !== "number" || nodePos < 0) return false;
  return editor.commands.command(({ tr, state }) => {
    const doc = state.doc;
    const $pos = doc.resolve(nodePos);
    const idx = $pos.index(0);
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= doc.childCount) return false;
    const node = doc.child(idx);
    if (delta === -1) {
      const prevNode = doc.child(idx - 1);
      const prevStart = nodePos - prevNode.nodeSize;
      tr.delete(nodePos, nodePos + node.nodeSize);
      tr.insert(prevStart, node);
    } else {
      const nextNode = doc.child(idx + 1);
      const insertAt = nodePos + node.nodeSize + nextNode.nodeSize;
      tr.insert(insertAt, node);
      tr.delete(nodePos, nodePos + node.nodeSize);
    }
    return true;
  });
}

function ImageBlockView({ node, editor, getPos, selected, deleteNode, updateAttributes }: NodeViewProps) {
  const src = String(node.attrs.src ?? "");
  const alt = String(node.attrs.alt ?? "");
  const widthPct = Number(node.attrs.widthPct ?? 72);
  const heightPx = typeof node.attrs.heightPx === "number" ? node.attrs.heightPx : null;
  const align = (node.attrs.align as AlignVal | undefined) ?? "center";
  const crop = (node.attrs.crop as ImageCrop | null | undefined) ?? null;
  const rotation = Number(node.attrs.rotation ?? 0);

  const [cropping, setCropping] = useState(false);
  const [liveDims, setLiveDims] = useState<{ wPct: number; hPx: number | null } | null>(null);
  const [liveCrop, setLiveCrop] = useState<ImageCrop | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  const activeW = liveDims?.wPct ?? widthPct;
  const activeH = liveDims ? liveDims.hPx : heightPx;
  const activeCrop = liveCrop ?? normalizeCrop(crop);

  function beginResize(e: React.PointerEvent, edge: "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w") {
    e.preventDefault();
    e.stopPropagation();
    const frame = frameRef.current;
    const parentEl = frame?.parentElement;
    if (!frame || !parentEl) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const parentW = Math.max(240, parentEl.getBoundingClientRect().width);
    const origRect = frame.getBoundingClientRect();
    const origW = widthPct;
    const origH = heightPx ?? Math.round(origRect.height);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let nextW = origW;
      let nextH: number | null = activeH;
      if (edge.includes("e")) nextW = Math.max(15, Math.min(100, Math.round(origW + (dx / parentW) * 100)));
      if (edge.includes("w")) nextW = Math.max(15, Math.min(100, Math.round(origW - (dx / parentW) * 100)));
      if (edge.includes("s")) nextH = Math.max(60, Math.min(820, Math.round(origH + dy)));
      if (edge.includes("n")) nextH = Math.max(60, Math.min(820, Math.round(origH - dy)));
      setLiveDims({ wPct: nextW, hPx: nextH });
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let nextW = origW;
      let nextH: number | null = heightPx;
      if (edge.includes("e")) nextW = Math.max(15, Math.min(100, Math.round(origW + (dx / parentW) * 100)));
      if (edge.includes("w")) nextW = Math.max(15, Math.min(100, Math.round(origW - (dx / parentW) * 100)));
      if (edge.includes("s")) nextH = Math.max(60, Math.min(820, Math.round(origH + dy)));
      if (edge.includes("n")) nextH = Math.max(60, Math.min(820, Math.round(origH - dy)));
      setLiveDims(null);
      updateAttributes({ widthPct: nextW, ...(nextH ? { heightPx: nextH } : {}) });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function beginCropEdge(e: React.PointerEvent, edge: "top" | "right" | "bottom" | "left") {
    e.preventDefault();
    e.stopPropagation();
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const base = normalizeCrop(crop);

    const calc = (ev: PointerEvent): ImageCrop => {
      const dxPct = ((ev.clientX - startX) / Math.max(60, rect.width)) * 100;
      const dyPct = ((ev.clientY - startY) / Math.max(60, rect.height)) * 100;
      if (edge === "top") return normalizeCrop({ ...base, top: base.top + dyPct });
      if (edge === "bottom") return normalizeCrop({ ...base, bottom: base.bottom - dyPct });
      if (edge === "left") return normalizeCrop({ ...base, left: base.left + dxPct });
      return normalizeCrop({ ...base, right: base.right - dxPct });
    };

    const onMove = (ev: PointerEvent) => setLiveCrop(calc(ev));
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const final = calc(ev);
      setLiveCrop(null);
      updateAttributes({ crop: final });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const justify = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";

  return (
    <NodeViewWrapper className="my-3 select-none" data-drag-handle="">
      <div className="flex w-full" style={{ justifyContent: justify }} dir="ltr">
        <div
          ref={frameRef}
          className="relative"
          style={{
            width: `${activeW}%`,
            height: activeH ? `${activeH}px` : undefined,
            transform: rotation ? `rotate(${rotation}deg)` : undefined,
            outline: selected || cropping ? "2px solid #0ea5e9" : "1px solid transparent",
            borderRadius: "0.5rem",
          }}
        >
          <div
            dir="ltr"
            className="h-full w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              draggable={false}
              style={croppedImageCss(activeCrop, activeH ? "cover" : "contain")}
            />
          </div>

          {/* 8 Corner & Edge Resize Handles */}
          {selected && !cropping && (
            <>
              {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((h) => (
                <span
                  key={h}
                  onPointerDown={(e) => beginResize(e, h)}
                  style={{
                    position: "absolute",
                    width: h === "n" || h === "s" ? 18 : 10,
                    height: h === "e" || h === "w" ? 18 : 10,
                    background: "#0ea5e9",
                    border: "1.5px solid #ffffff",
                    borderRadius: 3,
                    top: h.startsWith("n") ? -5 : h === "e" || h === "w" ? "calc(50% - 9px)" : undefined,
                    bottom: h.startsWith("s") ? -5 : undefined,
                    left: h.endsWith("w") ? -5 : h === "n" || h === "s" ? "calc(50% - 9px)" : undefined,
                    right: h.endsWith("e") ? -5 : undefined,
                    cursor: `${h}-resize`,
                    zIndex: 30,
                  }}
                />
              ))}
            </>
          )}

          {/* Direct Edge Crop Bars */}
          {cropping && (
            <>
              {(["top", "right", "bottom", "left"] as const).map((edge) => (
                <span
                  key={edge}
                  onPointerDown={(e) => beginCropEdge(e, edge)}
                  title={`Drag to crop ${edge}`}
                  style={{
                    position: "absolute",
                    background: "#0f172a",
                    border: "1.5px solid #00d4c8",
                    borderRadius: 2,
                    zIndex: 35,
                    ...(edge === "top" || edge === "bottom"
                      ? {
                          left: "calc(50% - 16px)",
                          width: 32,
                          height: 6,
                          cursor: "ns-resize",
                          [edge]: -3,
                        }
                      : {
                          top: "calc(50% - 16px)",
                          width: 6,
                          height: 32,
                          cursor: "ew-resize",
                          [edge]: -3,
                        }),
                  }}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Contextual Image Manipulation Toolbar */}
      {(selected || cropping) && (
        <div
          className="mt-2 flex flex-col gap-1.5"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            className="flex flex-wrap items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-sm"
            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <span className="font-semibold" style={{ color: "var(--turquoise)" }}>
              {activeW}%{activeH ? ` · ${activeH}px` : ""}
            </span>
            {(["left", "center", "right"] as const).map((al) => (
              <button
                key={al}
                type="button"
                className={`btn !px-1.5 !py-0.5 text-xs ${align === al ? "btn-primary" : "btn-ghost"}`}
                onClick={() => updateAttributes({ align: al })}
                title={`Align ${al}`}
              >
                {al === "left" ? "⫷" : al === "center" ? "☰" : "⫸"}
              </button>
            ))}
            <button
              type="button"
              className={`btn !px-2 !py-0.5 text-xs ${cropping ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setCropping((v) => !v)}
            >
              ✂ Crop / قص
            </button>
            <button
              type="button"
              className="btn btn-ghost !px-2 !py-0.5 text-xs"
              onClick={() => updateAttributes({ rotation: (rotation + 90) % 360 })}
              title="Rotate 90°"
            >
              ↻ 90°
            </button>
            <button
              type="button"
              className="btn btn-ghost !px-2 !py-0.5 text-xs"
              onClick={() => updateAttributes({ widthPct: 72, heightPx: null, rotation: 0 })}
              title="Reset size & rotation"
            >
              ⟲ Reset
            </button>
            <button
              type="button"
              className="btn btn-ghost !px-1.5 !py-0.5 text-xs"
              onClick={() => moveTopLevelNode(editor, getPos(), -1)}
              title="Move image up"
            >
              ↑
            </button>
            <button
              type="button"
              className="btn btn-ghost !px-1.5 !py-0.5 text-xs"
              onClick={() => moveTopLevelNode(editor, getPos(), 1)}
              title="Move image down"
            >
              ↓
            </button>
            <input
              value={alt}
              onChange={(e) => updateAttributes({ alt: e.target.value })}
              placeholder="Caption / Alt"
              className="input !w-auto min-w-28 flex-1 !py-0.5 text-xs"
              dir="auto"
            />
            <button
              type="button"
              className="btn btn-ghost !px-2 !py-0.5 text-xs"
              style={{ color: "var(--danger)" }}
              onClick={deleteNode}
            >
              🗑
            </button>
          </div>

          {cropping && (
            <CropControlsBar
              crop={activeCrop}
              ar={false}
              onChange={(next) => updateAttributes({ crop: next })}
              onDone={() => setCropping(false)}
            />
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
}

const EisaxImage = Image.extend({
  inline: false,
  group: "block",
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      widthPct: { default: 72 },
      heightPx: { default: null },
      align: { default: "center" },
      crop: { default: null },
      rotation: { default: 0 },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockView);
  },
});

function ChartBlockView({ node, editor, getPos, selected, deleteNode, updateAttributes }: NodeViewProps) {
  const chart = node.attrs.chart as ChartData | undefined;
  const dir = (node.attrs.dir as "ltr" | "rtl" | undefined) ?? "ltr";
  const widthPct = Number(node.attrs.widthPct ?? 100);
  const heightPx = Number(node.attrs.heightPx ?? 260);
  const align = (node.attrs.align as AlignVal | undefined) ?? "center";

  const [editingData, setEditingData] = useState(false);
  const [liveDims, setLiveDims] = useState<{ wPct: number; hPx: number } | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  if (!chart) return null;
  const activeW = liveDims?.wPct ?? widthPct;
  const activeH = liveDims?.hPx ?? heightPx;
  const justify = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";

  function beginResize(e: React.PointerEvent, edge: "e" | "s" | "se") {
    e.preventDefault();
    e.stopPropagation();
    const box = boxRef.current;
    const parentEl = box?.parentElement;
    if (!box || !parentEl) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const parentW = Math.max(260, parentEl.getBoundingClientRect().width);
    const origW = widthPct;
    const origH = heightPx;

    const calc = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const nextW = edge.includes("e")
        ? Math.max(35, Math.min(100, Math.round(origW + (dx / parentW) * 100)))
        : origW;
      const nextH = edge.includes("s")
        ? Math.max(160, Math.min(580, Math.round(origH + dy)))
        : origH;
      return { wPct: nextW, hPx: nextH };
    };

    const onMove = (ev: PointerEvent) => setLiveDims(calc(ev));
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const final = calc(ev);
      setLiveDims(null);
      updateAttributes({ widthPct: final.wPct, heightPx: final.hPx });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <NodeViewWrapper className="my-4 select-none" data-drag-handle="">
      <div className="flex w-full" style={{ justifyContent: justify }} dir="ltr">
        <div
          ref={boxRef}
          className="relative rounded-xl border border-slate-200 bg-slate-50/90 p-3"
          style={{
            width: `${activeW}%`,
            outline: selected || editingData ? "2px solid #0ea5e9" : undefined,
          }}
        >
          <div style={{ height: `${activeH}px` }}>
            <SlideChart chart={chart} rtl={dir === "rtl"} />
          </div>

          {/* Drag Handles on Chart (Right, Bottom, Bottom-Right) */}
          <span
            onPointerDown={(e) => beginResize(e, "e")}
            title="Drag to resize width"
            style={{
              position: "absolute",
              right: -4,
              top: "calc(50% - 14px)",
              width: 7,
              height: 28,
              borderRadius: 3,
              background: "#0ea5e9",
              border: "1.5px solid #fff",
              cursor: "ew-resize",
            }}
          />
          <span
            onPointerDown={(e) => beginResize(e, "s")}
            title="Drag to resize height"
            style={{
              position: "absolute",
              bottom: -4,
              left: "calc(50% - 14px)",
              width: 28,
              height: 7,
              borderRadius: 3,
              background: "#0ea5e9",
              border: "1.5px solid #fff",
              cursor: "ns-resize",
            }}
          />
          <span
            onPointerDown={(e) => beginResize(e, "se")}
            title="Drag corner to resize"
            style={{
              position: "absolute",
              right: -5,
              bottom: -5,
              width: 11,
              height: 11,
              borderRadius: 3,
              background: "#0ea5e9",
              border: "1.5px solid #fff",
              cursor: "nwse-resize",
            }}
          />
        </div>
      </div>

      <div
        className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs"
        style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <select
          value={chart.kind}
          onChange={(e) => updateAttributes({ chart: { ...chart, kind: e.target.value as ChartData["kind"] } })}
          className="input !w-auto !py-0.5 text-xs"
        >
          <option value="bar">Bar</option>
          <option value="line">Line</option>
          <option value="pie">Pie</option>
        </select>
        <input
          value={chart.title}
          onChange={(e) => updateAttributes({ chart: { ...chart, title: e.target.value } })}
          className="input !w-auto min-w-32 flex-1 !py-0.5 text-xs"
          placeholder="Chart title"
          dir="auto"
        />
        {(["left", "center", "right"] as const).map((al) => (
          <button
            key={al}
            type="button"
            className={`btn !px-1.5 !py-0.5 text-xs ${align === al ? "btn-primary" : "btn-ghost"}`}
            onClick={() => updateAttributes({ align: al })}
          >
            {al === "left" ? "⫷" : al === "center" ? "☰" : "⫸"}
          </button>
        ))}
        <button
          type="button"
          className={`btn !px-2 !py-0.5 text-xs ${editingData ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setEditingData((v) => !v)}
        >
          ✎ Data / الأرقام
        </button>
        <button
          type="button"
          className="btn btn-ghost !px-1.5 !py-0.5 text-xs"
          onClick={() => updateAttributes({ dir: dir === "rtl" ? "ltr" : "rtl" })}
        >
          {dir.toUpperCase()}
        </button>
        <button
          type="button"
          className="btn btn-ghost !px-1.5 !py-0.5 text-xs"
          onClick={() => moveTopLevelNode(editor, getPos(), -1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="btn btn-ghost !px-1.5 !py-0.5 text-xs"
          onClick={() => moveTopLevelNode(editor, getPos(), 1)}
        >
          ↓
        </button>
        <button
          type="button"
          onClick={deleteNode}
          className="btn btn-ghost !px-2 !py-0.5 text-xs"
          style={{ color: "var(--danger)" }}
        >
          🗑
        </button>
      </div>

      {editingData && (
        <ChartDataEditor
          chart={chart}
          ar={dir === "rtl"}
          onChange={(next) => updateAttributes({ chart: next })}
          onClose={() => setEditingData(false)}
        />
      )}
    </NodeViewWrapper>
  );
}

const EisaxChartNode = Node.create({
  name: "eisaxChart",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      chart: { default: null },
      dir: { default: "ltr" },
      widthPct: { default: 100 },
      heightPx: { default: 260 },
      align: { default: "center" },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-eisax-chart]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-eisax-chart": "true" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ChartBlockView);
  },
});

const EisaxTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      dir: {
        default: "auto",
        parseHTML: (el) => el.getAttribute("dir") || "auto",
        renderHTML: (attrs) => ({ dir: attrs.dir || "auto" }),
      },
      widthPct: {
        default: 100,
        parseHTML: (el) => {
          const w = el.getAttribute("data-width-pct");
          return w ? Number.parseFloat(w) : 100;
        },
        renderHTML: (attrs) =>
          attrs.widthPct && attrs.widthPct !== 100
            ? { "data-width-pct": String(attrs.widthPct), style: `width: ${attrs.widthPct}%` }
            : {},
      },
    };
  },
});

const EisaxTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      height: {
        default: null,
        parseHTML: (el) => {
          const raw = (el as HTMLElement).style?.height;
          if (!raw) return null;
          const n = Number.parseFloat(raw);
          return Number.isFinite(n) && n >= 20 ? Math.round(n) : null;
        },
        renderHTML: (attrs) =>
          typeof attrs.height === "number" && attrs.height >= 20
            ? { style: `height: ${Math.round(attrs.height)}px` }
            : {},
      },
    };
  },
});

interface WordProcessorProps {
  projectId: string;
  locale: Locale;
  language: string;
  blocks: DocumentBlock[];
  pageLayout?: PageLayout;
  fidelityWarnings?: string[];
  externalVersion: number;
  usage: { used: number; limit: number };
  onBlocksChange: (next: DocumentBlock[]) => void;
  onPageLayoutChange: (next: PageLayout) => void;
  onAiGenerated: (content: unknown) => void;
  onUsageChange: (u: { used: number; limit: number }) => void;
  onUploadImage: (file: File) => Promise<string | null>;
}

export function WordProcessor({
  projectId,
  locale,
  language,
  blocks,
  pageLayout,
  fidelityWarnings,
  externalVersion,
  usage,
  onBlocksChange,
  onPageLayoutChange,
  onAiGenerated,
  onUsageChange,
  onUploadImage,
}: WordProcessorProps) {
  const ar = locale === "ar";
  const defaultDir: "ltr" | "rtl" = language === "ar" ? "rtl" : "ltr";
  const layout: PageLayout = pageLayout ?? {
    size: "a4",
    orientation: "portrait",
    margins: "normal",
  };

  const [uploading, setUploading] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [showWarnings, setShowWarnings] = useState(true);
  const [showAiDrawer, setShowAiDrawer] = useState(false);
  const [rowGuideY, setRowGuideY] = useState<number | null>(null);
  const [, setTick] = useState(0);

  const lastExternalVersionRef = useRef(externalVersion);
  const paperRef = useRef<HTMLDivElement | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      BlockFormattingExtension,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyleKit,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { class: "text-sky-600 underline" },
      }),
      EisaxImage,
      EisaxTable.configure({ resizable: true, handleWidth: 6, cellMinWidth: 36 }),
      EisaxTableRow,
      TableHeader,
      TableCell,
      EisaxChartNode,
    ],
    content: blocksToTiptapDoc(blocks),
    editorProps: {
      attributes: {
        class: "eisax-word-prose outline-none min-h-[760px]",
        dir: language === "ar" ? "rtl" : "auto",
      },
    },
    onUpdate: ({ editor: ed }) => {
      const converted = tiptapDocToBlocks(ed.getJSON(), defaultDir);
      onBlocksChange(converted);
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const { from, to } = ed.state.selection;
      setSelectedText(from !== to ? ed.state.doc.textBetween(from, to, " ") : "");
      setTick((n) => n + 1);
    },
    onTransaction: () => {
      setTick((n) => n + 1);
    },
  });

  // Sync external mutations (revision restore, parent undo/redo, AI replace)
  useEffect(() => {
    if (!editor) return;
    if (externalVersion === lastExternalVersionRef.current) return;
    lastExternalVersionRef.current = externalVersion;
    editor.commands.setContent(blocksToTiptapDoc(blocks), { emitUpdate: false });
  }, [blocks, editor, externalVersion]);

  // Drag horizontal row borders inside .eisax-word-prose table to resize row heights smoothly
  useEffect(() => {
    const container = paperRef.current;
    if (!container || !editor) return;

    function findBottomBorderRow(ev: MouseEvent | PointerEvent): HTMLTableRowElement | null {
      const target = ev.target as HTMLElement | null;
      const cell = target?.closest?.(".eisax-word-prose td, .eisax-word-prose th") as HTMLElement | null;
      if (!cell) return null;
      const rect = cell.getBoundingClientRect();
      if (Math.abs(ev.clientY - rect.bottom) <= 5) {
        return cell.closest("tr") as HTMLTableRowElement | null;
      }
      return null;
    }

    const onPointerMoveHover = (ev: PointerEvent) => {
      const prose = container.querySelector(".eisax-word-prose");
      if (!prose) return;
      if (findBottomBorderRow(ev)) prose.classList.add("row-resize-cursor");
      else prose.classList.remove("row-resize-cursor");
    };

    const onPointerDown = (ev: PointerEvent) => {
      const trEl = findBottomBorderRow(ev);
      if (!trEl) return;
      ev.preventDefault();
      ev.stopPropagation();

      const startY = ev.clientY;
      const origHeight = trEl.getBoundingClientRect().height;
      const containerTop = container.getBoundingClientRect().top;
      setRowGuideY(ev.clientY - containerTop);

      const applyHeight = (h: number) => {
        const clamped = Math.max(24, Math.min(480, Math.round(h)));
        try {
          const domPos = editor.view.posAtDOM(trEl, 0);
          const $pos = editor.state.doc.resolve(domPos);
          for (let d = $pos.depth; d >= 0; d--) {
            if ($pos.node(d).type.name === "tableRow") {
              const rowPos = $pos.before(d);
              editor.commands.command(({ tr }) => {
                tr.setNodeMarkup(rowPos, undefined, { ...$pos.node(d).attrs, height: clamped });
                return true;
              });
              break;
            }
          }
        } catch {
          // ignore if DOM node detached mid-drag
        }
      };

      const onMove = (mev: PointerEvent) => {
        const nextH = origHeight + (mev.clientY - startY);
        trEl.style.height = `${Math.max(24, Math.min(480, Math.round(nextH)))}px`;
        setRowGuideY(mev.clientY - containerTop);
      };

      const onUp = (uev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setRowGuideY(null);
        applyHeight(origHeight + (uev.clientY - startY));
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };

    container.addEventListener("pointermove", onPointerMoveHover);
    container.addEventListener("pointerdown", onPointerDown);
    return () => {
      container.removeEventListener("pointermove", onPointerMoveHover);
      container.removeEventListener("pointerdown", onPointerDown);
    };
  }, [editor]);

  function getActiveBlockDir(): "auto" | "ltr" | "rtl" {
    if (!editor) return "auto";
    for (const typeName of ["heading", "paragraph", "blockquote", "bulletList", "orderedList"]) {
      if (editor.isActive(typeName)) {
        const d = editor.getAttributes(typeName).dir as string | undefined;
        if (d === "rtl" || d === "ltr" || d === "auto") return d;
      }
    }
    return "auto";
  }

  function setBlockDir(dir: "ltr" | "rtl" | "auto") {
    if (!editor) return;
    const types = ["paragraph", "heading", "blockquote", "bulletList", "orderedList"];
    const chain = editor.chain().focus();
    for (const typeName of types) {
      if (editor.isActive(typeName)) {
        chain.updateAttributes(typeName, { dir });
      }
    }
    if (dir === "rtl" && editor.isActive({ textAlign: "left" })) {
      chain.unsetTextAlign();
    } else if (dir === "ltr" && editor.isActive({ textAlign: "right" })) {
      chain.unsetTextAlign();
    } else if (dir === "auto" && (editor.isActive({ textAlign: "left" }) || editor.isActive({ textAlign: "right" }))) {
      chain.unsetTextAlign();
    }
    chain.run();
  }

  function applyListStyle(styleVal: string) {
    if (!editor) return;
    const opt = LIST_STYLE_OPTIONS.find((o) => o.value === styleVal);
    if (!opt) return;
    const chain = editor.chain().focus();
    if (opt.ordered) {
      if (!editor.isActive("orderedList")) chain.toggleOrderedList();
      chain.updateAttributes("orderedList", { listStyle: opt.value });
    } else {
      if (!editor.isActive("bulletList")) chain.toggleBulletList();
      chain.updateAttributes("bulletList", { listStyle: opt.value });
    }
    chain.run();
  }

  function toggleDigitsInSelectionOrBlock() {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (!empty) {
      const txt = editor.state.doc.textBetween(from, to, "\n");
      const converted = toggleDigitsScript(txt);
      if (converted !== txt) {
        editor.chain().focus().insertContentAt({ from, to }, converted).run();
      }
      return;
    }
    // No selection: toggle digits in current parent textblock
    const $from = editor.state.selection.$from;
    const start = $from.start($from.depth);
    const end = $from.end($from.depth);
    const txt = editor.state.doc.textBetween(start, end, "\n");
    const converted = toggleDigitsScript(txt);
    if (converted !== txt) {
      editor.chain().focus().insertContentAt({ from: start, to: end }, converted).run();
    }
  }

  function promptAndInsertLink() {
    if (!editor) return;
    const prevUrl = editor.getAttributes("link").href as string | undefined;
    const raw = window.prompt(ar ? "أدخل الرابط (https://...)" : "Enter URL (https://...)", prevUrl || "https://");
    if (raw === null) return;
    const trimmed = raw.trim();
    if (!trimmed) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      window.alert(ar ? "يجب أن يبدأ الرابط بـ http:// أو https://" : "URL must start with http:// or https://");
      return;
    }
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent(`<a href="${trimmed}">${trimmed}</a> `).run();
    } else {
      editor.chain().focus().setLink({ href: trimmed }).run();
    }
  }

  async function handleImagePick(file: File) {
    if (!editor) return;
    setUploading(true);
    const id = await onUploadImage(file);
    setUploading(false);
    if (id) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "image",
          attrs: { src: `/api/assets/${id}`, alt: file.name, widthPct: 72, align: "center" },
        })
        .run();
    }
  }

  function insertDefaultChart() {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertContent({
        type: "eisaxChart",
        attrs: {
          dir: defaultDir,
          widthPct: 100,
          heightPx: 260,
          align: "center",
          chart: {
            kind: "bar",
            title: ar ? "مؤشر الأداء" : "Quarterly Metrics",
            categories: ["Q1", "Q2", "Q3", "Q4"],
            values: [42, 68, 95, 130],
            unit: "pts",
          },
        },
      })
      .run();
  }

  function activeTablePos(): number | undefined {
    if (!editor || !editor.isActive("table")) return undefined;
    const $from = editor.state.selection.$from;
    for (let d = $from.depth; d >= 0; d--) {
      if ($from.node(d).type.name === "table") return $from.before(d);
    }
    return undefined;
  }

  const wordCount = editor
    ? editor.getText().trim().split(/\s+/).filter(Boolean).length
    : blocks.reduce((acc, b) => acc + (b.text?.split(/\s+/).filter(Boolean).length ?? 0), 0);

  const paperMaxWidth =
    layout.orientation === "landscape"
      ? layout.size === "letter"
        ? "1056px"
        : "1122px"
      : layout.size === "letter"
        ? "816px"
        : "794px";
  const paperPadding =
    layout.margins === "narrow"
      ? "28px 32px"
      : layout.margins === "wide"
        ? "72px 84px"
        : "54px 64px";

  const activeBlockStyle = !editor
    ? "paragraph"
    : editor.isActive("heading", { level: 1 })
      ? "h1"
      : editor.isActive("heading", { level: 2 })
        ? "h2"
        : editor.isActive("heading", { level: 3 })
          ? "h3"
          : editor.isActive("blockquote")
            ? "quote"
            : "paragraph";

  const activeListStyle =
    (editor?.isActive("orderedList")
      ? (editor.getAttributes("orderedList").listStyle as string | undefined) || "decimal"
      : editor?.isActive("bulletList")
        ? (editor.getAttributes("bulletList").listStyle as string | undefined) || "disc"
        : "");

  return (
    <div className="space-y-4">
      {/* Fidelity Warnings Banner from Imported DOCX */}
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
            <span>
              {ar ? "ملاحظات التوافق عند استيراد ملف DOCX:" : "DOCX Import Fidelity Notices:"}
            </span>
            <button type="button" className="underline opacity-80 hover:opacity-100" onClick={() => setShowWarnings(false)}>
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

      {/* Sticky Office Formatting Ribbon — adapts seamlessly to Dark & Light Mode via CSS tokens */}
      <div
        className="sticky top-2 z-20 rounded-xl border p-2.5 shadow-lg backdrop-blur-md"
        style={{ background: "var(--nav-bg)", borderColor: "var(--border)", color: "var(--text)" }}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {/* History */}
          <button
            type="button"
            className="btn btn-ghost !px-2 !py-1 text-xs"
            disabled={!editor?.can().undo()}
            onClick={() => editor?.chain().focus().undo().run()}
            title="Undo (Ctrl+Z)"
          >
            ↶ {ar ? "تراجع" : "Undo"}
          </button>
          <button
            type="button"
            className="btn btn-ghost !px-2 !py-1 text-xs"
            disabled={!editor?.can().redo()}
            onClick={() => editor?.chain().focus().redo().run()}
            title="Redo (Ctrl+Y)"
          >
            ↷ {ar ? "إعادة" : "Redo"}
          </button>

          <span className="mx-1 h-5 w-px" style={{ background: "var(--border)" }} />

          {/* Heading / Block Style */}
          <select
            value={activeBlockStyle}
            onChange={(e) => {
              if (!editor) return;
              const v = e.target.value;
              if (v === "paragraph") editor.chain().focus().setParagraph().run();
              else if (v === "h1") editor.chain().focus().toggleHeading({ level: 1 }).run();
              else if (v === "h2") editor.chain().focus().toggleHeading({ level: 2 }).run();
              else if (v === "h3") editor.chain().focus().toggleHeading({ level: 3 }).run();
              else if (v === "quote") editor.chain().focus().toggleBlockquote().run();
            }}
            className="input !w-auto !py-1 text-xs"
            aria-label={ar ? "نمط الفقرة" : "Block style"}
          >
            <option value="paragraph">{ar ? "نص عادي" : "Normal"}</option>
            <option value="h1">{ar ? "عنوان رئيسي ١" : "Heading 1"}</option>
            <option value="h2">{ar ? "عنوان فرعي ٢" : "Heading 2"}</option>
            <option value="h3">{ar ? "عنوان ٣" : "Heading 3"}</option>
            <option value="quote">{ar ? "اقتباس" : "Quote"}</option>
          </select>

          {/* Font Family */}
          <select
            value={(editor?.getAttributes("textStyle").fontFamily as string | undefined) || ""}
            onChange={(e) => {
              const v = e.target.value;
              if (!editor) return;
              if (!v) editor.chain().focus().unsetFontFamily().run();
              else editor.chain().focus().setFontFamily(v).run();
            }}
            className="input !w-auto max-w-40 !py-1 text-xs"
            aria-label={ar ? "نوع الخط" : "Font family"}
          >
            {OFFICE_FONT_FAMILIES.map((f) => (
              <option key={f.value || "default"} value={f.value}>
                {ar ? f.labelAr : f.label}
              </option>
            ))}
          </select>

          {/* Font Size */}
          <select
            value={(editor?.getAttributes("textStyle").fontSize as string | undefined) || "12pt"}
            onChange={(e) => editor?.chain().focus().setFontSize(e.target.value).run()}
            className="input !w-auto !py-1 text-xs"
            aria-label={ar ? "حجم الخط" : "Font size"}
          >
            {DOC_FONT_SIZES.map((sz) => (
              <option key={sz} value={sz}>
                {sz}
              </option>
            ))}
          </select>

          {/* Inline Marks */}
          <button
            type="button"
            className={`btn !px-2.5 !py-1 text-xs font-bold ${editor?.isActive("bold") ? "btn-primary" : "btn-ghost"}`}
            onClick={() => editor?.chain().focus().toggleBold().run()}
            title="Bold (Ctrl+B)"
          >
            B
          </button>
          <button
            type="button"
            className={`btn !px-2.5 !py-1 text-xs italic ${editor?.isActive("italic") ? "btn-primary" : "btn-ghost"}`}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            title="Italic (Ctrl+I)"
          >
            I
          </button>
          <button
            type="button"
            className={`btn !px-2.5 !py-1 text-xs underline ${editor?.isActive("underline") ? "btn-primary" : "btn-ghost"}`}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            title="Underline (Ctrl+U)"
          >
            U
          </button>
          <button
            type="button"
            className={`btn !px-2 !py-1 text-xs line-through ${editor?.isActive("strike") ? "btn-primary" : "btn-ghost"}`}
            onClick={() => editor?.chain().focus().toggleStrike().run()}
            title="Strikethrough"
          >
            S
          </button>
          <label className="btn btn-ghost cursor-pointer !px-2 !py-1 text-xs" title={ar ? "لون النص" : "Text color"}>
            <span>A</span>
            <input
              type="color"
              value={(editor?.getAttributes("textStyle").color as string | undefined) || "#1E293B"}
              onChange={(e) => editor?.chain().focus().setColor(e.target.value).run()}
              className="ms-1 h-4 w-5 cursor-pointer border-0 bg-transparent p-0"
            />
          </label>
          <button
            type="button"
            className="btn btn-ghost !px-2 !py-1 text-xs font-semibold"
            onClick={toggleDigitsInSelectionOrBlock}
            title={ar ? "تحويل الأرقام بين العربية والإنجليزية (١٢٣ ↔ 123)" : "Convert digits between Arabic-Indic & Western (١٢٣ ↔ 123)"}
          >
            ١٢٣↔123
          </button>

          <span className="mx-1 h-5 w-px" style={{ background: "var(--border)" }} />

          {/* Alignment & Direction */}
          {(["left", "center", "right", "justify"] as const).map((al) => (
            <button
              key={al}
              type="button"
              className={`btn !px-2 !py-1 text-xs ${editor?.isActive({ textAlign: al }) ? "btn-primary" : "btn-ghost"}`}
              onClick={() => editor?.chain().focus().setTextAlign(al).run()}
              title={`Align ${al}`}
            >
              {al === "left" ? "⫷" : al === "center" ? "☰" : al === "right" ? "⫸" : "≣"}
            </button>
          ))}
          <button
            type="button"
            className={`btn !px-2 !py-1 text-xs ${getActiveBlockDir() === "auto" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setBlockDir("auto")}
            title={ar ? "اتجاه تلقائي حسب اللغة (عربي يمين / إنجليزي يسار)" : "Auto direction (Arabic RTL / English LTR)"}
          >
            {ar ? "تلقائي" : "Auto"}
          </button>
          <button
            type="button"
            className={`btn !px-2 !py-1 text-xs ${getActiveBlockDir() === "rtl" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setBlockDir("rtl")}
          >
            RTL
          </button>
          <button
            type="button"
            className={`btn !px-2 !py-1 text-xs ${getActiveBlockDir() === "ltr" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setBlockDir("ltr")}
          >
            LTR
          </button>

          <span className="mx-1 h-5 w-px" style={{ background: "var(--border)" }} />

          {/* Lists, Numbering Styles & Insert Controls */}
          <button
            type="button"
            className={`btn !px-2 !py-1 text-xs ${editor?.isActive("bulletList") ? "btn-primary" : "btn-ghost"}`}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            • {ar ? "قائمة" : "Bullets"}
          </button>
          <button
            type="button"
            className={`btn !px-2 !py-1 text-xs ${editor?.isActive("orderedList") ? "btn-primary" : "btn-ghost"}`}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            1. {ar ? "مرقمة" : "Numbered"}
          </button>
          <select
            value={activeListStyle}
            onChange={(e) => {
              if (e.target.value) applyListStyle(e.target.value);
            }}
            className="input !w-auto !py-1 text-xs"
            aria-label={ar ? "نمط الترقيم" : "Numbering style"}
            title={ar ? "نمط الترقيم والقوائم" : "Numbering & Bullet Style"}
          >
            <option value="">{ar ? "نمط الترقيم…" : "List style…"}</option>
            {LIST_STYLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {ar ? opt.labelAr : opt.labelEn}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-ghost !px-2 !py-1 text-xs"
            onClick={() =>
              editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
          >
            ▦ {ar ? "جدول" : "Table"}
          </button>
          <button type="button" className="btn btn-ghost !px-2 !py-1 text-xs" onClick={promptAndInsertLink}>
            🔗 {ar ? "رابط" : "Link"}
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
                if (f) void handleImagePick(f);
              }}
            />
          </label>
          <button type="button" className="btn btn-ghost !px-2 !py-1 text-xs" onClick={insertDefaultChart}>
            📊 {ar ? "رسم" : "Chart"}
          </button>

          {/* Optional AI Selection Assist & AI Draft Drawer */}
          <div className="ms-auto flex items-center gap-1.5">
            {selectedText.trim().length > 0 && editor && (
              <AiMenu
                projectId={projectId}
                locale={locale}
                label={ar ? "تحسين المحدد" : "AI Selection"}
                text={selectedText}
                onUsageChange={onUsageChange}
                onApply={(next) => editor.chain().focus().insertContent(next).run()}
              />
            )}
            <button
              type="button"
              className={`btn !px-2.5 !py-1 text-xs ${showAiDrawer ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setShowAiDrawer((v) => !v)}
              title={ar ? "مساعد الذكاء الاصطناعي الاختياري" : "Optional AI Assistant"}
            >
              ✨ {ar ? "مساعد AI" : "AI Assist"}
            </button>
          </div>
        </div>

        {/* Contextual Table Toolbar when cursor inside table */}
        {editor?.isActive("table") && (
          <div
            className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2 text-xs"
            style={{ borderColor: "var(--border)" }}
          >
            <span className="font-semibold" style={{ color: "var(--turquoise)" }}>
              {ar ? "أدوات الجدول (اسحب الخطوط لتغيير الأبعاد):" : "Table (drag borders to resize):"}
            </span>
            <button type="button" className="btn btn-ghost !px-2 !py-0.5 text-xs" onClick={() => editor.chain().focus().addRowBefore().run()}>
              + {ar ? "صف أعلى" : "Row above"}
            </button>
            <button type="button" className="btn btn-ghost !px-2 !py-0.5 text-xs" onClick={() => editor.chain().focus().addRowAfter().run()}>
              + {ar ? "صف أسفل" : "Row below"}
            </button>
            <button type="button" className="btn btn-ghost !px-2 !py-0.5 text-xs" onClick={() => editor.chain().focus().deleteRow().run()}>
              − {ar ? "حذف صف" : "Del row"}
            </button>
            <button type="button" className="btn btn-ghost !px-2 !py-0.5 text-xs" onClick={() => editor.chain().focus().addColumnBefore().run()}>
              + {ar ? "عمود قبل" : "Col before"}
            </button>
            <button type="button" className="btn btn-ghost !px-2 !py-0.5 text-xs" onClick={() => editor.chain().focus().addColumnAfter().run()}>
              + {ar ? "عمود بعد" : "Col after"}
            </button>
            <button type="button" className="btn btn-ghost !px-2 !py-0.5 text-xs" onClick={() => editor.chain().focus().deleteColumn().run()}>
              − {ar ? "حذف عمود" : "Del col"}
            </button>
            <select
              value={String(editor.getAttributes("table").widthPct ?? 100)}
              onChange={(e) =>
                editor.chain().focus().updateAttributes("table", { widthPct: Number.parseInt(e.target.value, 10) }).run()
              }
              className="input !w-auto !py-0.5 text-xs"
              aria-label={ar ? "عرض الجدول" : "Table width"}
            >
              <option value="50">50%</option>
              <option value="75">75%</option>
              <option value="100">100%</option>
            </select>
            <select
              value={(editor.getAttributes("table").dir as string | undefined) || "auto"}
              onChange={(e) => editor.chain().focus().updateAttributes("table", { dir: e.target.value }).run()}
              className="input !w-auto !py-0.5 text-xs"
              aria-label={ar ? "اتجاه الجدول" : "Table direction"}
            >
              <option value="auto">{ar ? "اتجاه تلقائي" : "Auto"}</option>
              <option value="rtl">RTL</option>
              <option value="ltr">LTR</option>
            </select>
            <button
              type="button"
              className="btn btn-ghost !px-1.5 !py-0.5 text-xs"
              onClick={() => moveTopLevelNode(editor, activeTablePos(), -1)}
              title={ar ? "تحريك الجدول لأعلى" : "Move table up"}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn btn-ghost !px-1.5 !py-0.5 text-xs"
              onClick={() => moveTopLevelNode(editor, activeTablePos(), 1)}
              title={ar ? "تحريك الجدول لأسفل" : "Move table down"}
            >
              ↓
            </button>
            <button
              type="button"
              className="btn btn-ghost !px-2 !py-0.5 text-xs"
              style={{ color: "var(--danger)" }}
              onClick={() => editor.chain().focus().deleteTable().run()}
            >
              {ar ? "حذف الجدول" : "Delete table"}
            </button>
          </div>
        )}

        {/* Page Layout Controls + Word Count */}
        <div
          className="mt-2 flex flex-wrap items-center gap-3 border-t pt-2 text-xs"
          style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
        >
          <span className="font-semibold">{ar ? "تخطيط الصفحة:" : "Page layout:"}</span>
          <select
            value={layout.size}
            onChange={(e) => onPageLayoutChange({ ...layout, size: e.target.value as PageLayout["size"] })}
            className="input !w-auto !py-0.5 text-xs"
            aria-label={ar ? "حجم الورق" : "Page size"}
          >
            <option value="a4">A4</option>
            <option value="letter">Letter</option>
          </select>
          <select
            value={layout.orientation}
            onChange={(e) =>
              onPageLayoutChange({ ...layout, orientation: e.target.value as PageLayout["orientation"] })
            }
            className="input !w-auto !py-0.5 text-xs"
            aria-label={ar ? "الاتجاه" : "Orientation"}
          >
            <option value="portrait">{ar ? "عمودي" : "Portrait"}</option>
            <option value="landscape">{ar ? "أفقي" : "Landscape"}</option>
          </select>
          <select
            value={layout.margins}
            onChange={(e) => onPageLayoutChange({ ...layout, margins: e.target.value as PageLayout["margins"] })}
            className="input !w-auto !py-0.5 text-xs"
            aria-label={ar ? "الهوامش" : "Margins"}
          >
            <option value="normal">{ar ? "هوامش عادية" : "Normal margins"}</option>
            <option value="narrow">{ar ? "هوامش ضيقة" : "Narrow margins"}</option>
            <option value="wide">{ar ? "هوامش واسعة" : "Wide margins"}</option>
          </select>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={Boolean(layout.showPageNumbers)}
              onChange={(e) => onPageLayoutChange({ ...layout, showPageNumbers: e.target.checked })}
            />
            <span>{ar ? "ترقيم الصفحات" : "Page #"}</span>
          </label>
          <span className="ms-auto tabular-nums">
            {ar ? `${wordCount} كلمة` : `${wordCount} words`}
          </span>
        </div>
      </div>

      {/* Optional AI Assist Drawer */}
      {showAiDrawer && (
        <div className="mx-auto max-w-md">
          <AiGeneratePanel
            projectId={projectId}
            locale={locale}
            usage={usage}
            onGenerated={(content) => {
              onAiGenerated(content);
              setShowAiDrawer(false);
            }}
            onUsageChange={onUsageChange}
          />
        </div>
      )}

      {/* Continuous Paper Document Surface (Paper stays crisp white like MS Word) */}
      <div className="overflow-x-auto py-4">
        <div
          ref={paperRef}
          className="relative mx-auto rounded-lg border bg-white text-slate-900 shadow-xl transition-all"
          style={{
            width: "100%",
            maxWidth: paperMaxWidth,
            padding: paperPadding,
            borderColor: "#cbd5e1",
          }}
        >
          <EditorContent editor={editor} />
          {rowGuideY !== null && (
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: rowGuideY,
                height: 2,
                background: "#0ea5e9",
                pointerEvents: "none",
                zIndex: 40,
              }}
            />
          )}
          {layout.showPageNumbers && (
            <div className="mt-6 border-t border-slate-200 pt-2 text-center text-xs text-slate-400">
              {ar ? "صفحة ١" : "Page 1"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
