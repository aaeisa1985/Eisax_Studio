"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
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
import { blocksToTiptapDoc, tiptapDocToBlocks } from "@/lib/document/tiptapSync";
import type { ChartData, DocumentBlock, PageLayout } from "@/lib/validation/projects";
import type { Locale } from "@/lib/i18n";

/** Global per-block `dir` attribute defaulting to `"auto"` (UAX #9 first-strong Bidi). */
const DirectionExtension = Extension.create({
  name: "blockDirection",
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
    ];
  },
});

function ChartBlockView({ node, deleteNode, updateAttributes }: NodeViewProps) {
  const chart = node.attrs.chart as ChartData | undefined;
  const dir = (node.attrs.dir as "ltr" | "rtl" | undefined) ?? "ltr";
  if (!chart) return null;

  return (
    <NodeViewWrapper className="my-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3 select-none">
      <SlideChart chart={chart} rtl={dir === "rtl"} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={chart.kind}
          onChange={(e) =>
            updateAttributes({ chart: { ...chart, kind: e.target.value as ChartData["kind"] } })
          }
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
        >
          <option value="bar">Bar</option>
          <option value="line">Line</option>
          <option value="pie">Pie</option>
        </select>
        <input
          value={chart.title}
          onChange={(e) => updateAttributes({ chart: { ...chart, title: e.target.value } })}
          className="min-w-40 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
          placeholder="Chart title"
        />
        <button
          type="button"
          onClick={deleteNode}
          className="rounded border border-rose-200 bg-white px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
        >
          Remove
        </button>
      </div>
    </NodeViewWrapper>
  );
}

const EisaxChartNode = Node.create({
  name: "eisaxChart",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      chart: { default: null },
      dir: { default: "ltr" },
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

const FONT_SIZES = ["10pt", "11pt", "12pt", "14pt", "16pt", "18pt", "22pt", "28pt", "36pt"];

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
  const [, setTick] = useState(0);

  const lastExternalVersionRef = useRef(externalVersion);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      DirectionExtension,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyleKit,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { class: "text-sky-600 underline" },
      }),
      Image.configure({
        HTMLAttributes: { class: "mx-auto my-3 max-h-96 rounded-lg border border-slate-200 object-contain" },
      }),
      Table.configure({ resizable: true }),
      TableRow,
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
    // Clear forced opposite text alignment so Arabic aligns right and English aligns left cleanly
    if (dir === "rtl" && editor.isActive({ textAlign: "left" })) {
      chain.unsetTextAlign();
    } else if (dir === "ltr" && editor.isActive({ textAlign: "right" })) {
      chain.unsetTextAlign();
    } else if (dir === "auto" && (editor.isActive({ textAlign: "left" }) || editor.isActive({ textAlign: "right" }))) {
      chain.unsetTextAlign();
    }
    chain.run();
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
      editor.chain().focus().setImage({ src: `/api/assets/${id}`, alt: file.name }).run();
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
          <div className="flex items-center justify-between gap-2 font-bold" style={{ color: "#e9c46a" }}>
            <span>
              {ar
                ? "ملاحظات التوافق عند استيراد ملف DOCX:"
                : "DOCX Import Fidelity Notices:"}
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

      {/* Sticky Office Formatting Ribbon */}
      <div
        className="sticky top-2 z-20 rounded-xl border p-2.5 shadow-lg backdrop-blur"
        style={{ background: "rgba(17, 25, 36, 0.94)", borderColor: "var(--border)" }}
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

          {/* Font Size */}
          <select
            value={(editor?.getAttributes("textStyle").fontSize as string | undefined) || "12pt"}
            onChange={(e) => editor?.chain().focus().setFontSize(e.target.value).run()}
            className="input !w-auto !py-1 text-xs"
            aria-label={ar ? "حجم الخط" : "Font size"}
          >
            {FONT_SIZES.map((sz) => (
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
            title={ar ? "من اليمين لليسار (عربي)" : "Paragraph Right-to-Left (Arabic)"}
          >
            RTL
          </button>
          <button
            type="button"
            className={`btn !px-2 !py-1 text-xs ${getActiveBlockDir() === "ltr" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setBlockDir("ltr")}
            title={ar ? "من اليسار لليمين (إنجليزي)" : "Paragraph Left-to-Right"}
          >
            LTR
          </button>

          <span className="mx-1 h-5 w-px" style={{ background: "var(--border)" }} />

          {/* Lists & Insert Controls */}
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
              {ar ? "أدوات الجدول:" : "Table:"}
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

      {/* Continuous Paper Document Surface */}
      <div className="overflow-x-auto py-4">
        <div
          className="mx-auto rounded-lg border bg-white text-slate-900 shadow-xl transition-all"
          style={{
            width: "100%",
            maxWidth: paperMaxWidth,
            padding: paperPadding,
            borderColor: "#cbd5e1",
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
