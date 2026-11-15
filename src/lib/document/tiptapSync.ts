import type { JSONContent } from "@tiptap/core";
import { parseInlineSegments } from "@/lib/utils/inlineFormat";
import type {
  ChartData,
  DocumentBlock,
  InlineRun,
  TextAlign,
} from "@/lib/validation/projects";

type PMMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

function inlineRunsToTiptapNodes(
  runs: InlineRun[] | undefined,
  fallbackText: string,
  linkUrl?: string,
): JSONContent[] {
  const effectiveRuns: InlineRun[] =
    runs && runs.length > 0
      ? runs
      : parseInlineSegments(fallbackText || "").map((s) => ({
          text: s.text,
          ...(s.bold ? { bold: true } : {}),
          ...(s.italic ? { italic: true } : {}),
          ...(linkUrl ? { href: linkUrl } : {}),
        }));

  const nodes: JSONContent[] = [];
  for (const run of effectiveRuns) {
    if (!run.text) continue;
    const parts = run.text.split("\n");
    parts.forEach((part, idx) => {
      if (part.length > 0) {
        const marks: PMMark[] = [];
        if (run.bold) marks.push({ type: "bold" });
        if (run.italic) marks.push({ type: "italic" });
        if (run.underline) marks.push({ type: "underline" });
        if (run.strike) marks.push({ type: "strike" });
        if (run.color || run.fontSize) {
          marks.push({
            type: "textStyle",
            attrs: {
              ...(run.color ? { color: run.color.startsWith("#") ? run.color : `#${run.color}` } : {}),
              ...(run.fontSize ? { fontSize: `${run.fontSize}pt` } : {}),
            },
          });
        }
        if (run.href && /^https?:\/\//i.test(run.href)) {
          marks.push({ type: "link", attrs: { href: run.href } });
        }
        nodes.push({
          type: "text",
          text: part,
          ...(marks.length > 0 ? { marks } : {}),
        });
      }
      if (idx < parts.length - 1) {
        nodes.push({ type: "hardBreak" });
      }
    });
  }
  return nodes;
}

function tiptapInlineToRuns(content: JSONContent[] | undefined): {
  runs: InlineRun[];
  text: string;
} {
  const runs: InlineRun[] = [];
  if (!content) return { runs, text: "" };

  for (const node of content) {
    if (node.type === "hardBreak") {
      runs.push({ text: "\n" });
      continue;
    }
    if (node.type === "text" && typeof node.text === "string") {
      const marks = (node.marks ?? []) as PMMark[];
      const run: InlineRun = { text: node.text };
      for (const m of marks) {
        if (m.type === "bold") run.bold = true;
        else if (m.type === "italic") run.italic = true;
        else if (m.type === "underline") run.underline = true;
        else if (m.type === "strike") run.strike = true;
        else if (m.type === "link" && typeof m.attrs?.href === "string") {
          const href = m.attrs.href.trim();
          if (/^https?:\/\//i.test(href)) run.href = href;
        } else if (m.type === "textStyle" && m.attrs) {
          if (typeof m.attrs.color === "string" && m.attrs.color.trim()) {
            const hex = m.attrs.color.replace(/^#/, "").trim();
            if (/^[0-9a-fA-F]{6}$/.test(hex)) run.color = hex.toUpperCase();
          }
          if (typeof m.attrs.fontSize === "string") {
            const pt = Number.parseFloat(m.attrs.fontSize);
            if (Number.isFinite(pt) && pt >= 8 && pt <= 72) run.fontSize = pt;
          }
        }
      }
      runs.push(run);
    }
  }

  const text = runs.map((r) => r.text).join("");
  return { runs, text };
}

function normalizeAlign(raw: unknown): TextAlign | undefined {
  if (raw === "left" || raw === "center" || raw === "right" || raw === "justify") {
    return raw;
  }
  return undefined;
}

function inferDir(attrDir: unknown, text: string, fallback: "ltr" | "rtl"): "ltr" | "rtl" {
  if (attrDir === "rtl" || attrDir === "ltr") return attrDir;
  if (/[\u0600-\u06FF]/.test(text)) return "rtl";
  return fallback;
}

/** Convert EISAX DocumentBlock[] into a TipTap/ProseMirror JSON document. */
export function blocksToTiptapDoc(blocks: DocumentBlock[]): JSONContent {
  const content: JSONContent[] = [];

  for (const b of blocks) {
    const baseAttrs: Record<string, unknown> = {
      ...(b.align ? { textAlign: b.align } : {}),
      dir: b.dir || "ltr",
    };

    if (b.kind === "heading") {
      const level = Math.min(6, Math.max(1, b.level ?? 2));
      const inline = inlineRunsToTiptapNodes(b.runs, b.text);
      content.push({
        type: "heading",
        attrs: { ...baseAttrs, level },
        ...(inline.length > 0 ? { content: inline } : {}),
      });
    } else if (b.kind === "paragraph") {
      const inline = inlineRunsToTiptapNodes(b.runs, b.text);
      content.push({
        type: "paragraph",
        attrs: baseAttrs,
        ...(inline.length > 0 ? { content: inline } : {}),
      });
    } else if (b.kind === "link") {
      const label = b.text.trim() || b.url || "Link";
      const inline = inlineRunsToTiptapNodes(
        b.runs,
        label,
        b.url && /^https?:\/\//i.test(b.url) ? b.url : undefined,
      );
      content.push({
        type: "paragraph",
        attrs: baseAttrs,
        ...(inline.length > 0 ? { content: inline } : {}),
      });
    } else if (b.kind === "quote") {
      const inline = inlineRunsToTiptapNodes(b.runs, b.text);
      content.push({
        type: "blockquote",
        attrs: { dir: b.dir || "ltr" },
        content: [
          {
            type: "paragraph",
            attrs: baseAttrs,
            ...(inline.length > 0 ? { content: inline } : {}),
          },
        ],
      });
    } else if (b.kind === "list") {
      const items = b.items && b.items.length > 0 ? b.items : [b.text || ""];
      const listItems: JSONContent[] = items.map((itemText, idx) => {
        const inline = inlineRunsToTiptapNodes(b.listRuns?.[idx], itemText);
        return {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              attrs: { dir: b.dir || "ltr" },
              ...(inline.length > 0 ? { content: inline } : {}),
            },
          ],
        };
      });
      content.push({
        type: b.ordered ? "orderedList" : "bulletList",
        attrs: { dir: b.dir || "ltr" },
        content: listItems,
      });
    } else if (b.kind === "table") {
      const rows = b.rows && b.rows.length > 0 ? b.rows : [["Column 1", "Column 2"], ["", ""]];
      content.push({
        type: "table",
        content: rows.map((row, rIdx) => ({
          type: "tableRow",
          content: row.map((cell) => ({
            type: rIdx === 0 ? "tableHeader" : "tableCell",
            content: [
              {
                type: "paragraph",
                attrs: { dir: /[\u0600-\u06FF]/.test(cell) ? "rtl" : b.dir || "ltr" },
                ...(cell ? { content: [{ type: "text", text: cell }] } : {}),
              },
            ],
          })),
        })),
      });
    } else if (b.kind === "image" && b.assetId) {
      content.push({
        type: "image",
        attrs: {
          src: `/api/assets/${b.assetId}`,
          alt: b.text || "",
        },
      });
    } else if (b.kind === "chart" && b.chart) {
      content.push({
        type: "eisaxChart",
        attrs: {
          chart: b.chart,
          dir: b.dir || "ltr",
        },
      });
    }
  }

  if (content.length === 0) {
    content.push({ type: "paragraph", attrs: { dir: "ltr" } });
  }
  return { type: "doc", content };
}

function collectNodeText(node: JSONContent): string {
  if (node.type === "text" && typeof node.text === "string") return node.text;
  if (node.type === "hardBreak") return "\n";
  if (!node.content) return "";
  return node.content.map(collectNodeText).join(node.type === "paragraph" ? "\n" : "");
}

/** Convert TipTap JSONContent back to EISAX DocumentBlock[] preserving rich formatting. */
export function tiptapDocToBlocks(
  doc: JSONContent,
  defaultDir: "ltr" | "rtl" = "ltr",
): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  let seq = 0;
  const nextId = (p: string) => `${p}-${++seq}`;

  for (const node of doc.content ?? []) {
    if (node.type === "heading") {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 2)));
      const { runs, text } = tiptapInlineToRuns(node.content);
      blocks.push({
        id: nextId("h"),
        kind: "heading",
        level,
        text,
        runs: runs.length > 0 ? runs : undefined,
        align: normalizeAlign(node.attrs?.textAlign),
        dir: inferDir(node.attrs?.dir, text, defaultDir),
      });
    } else if (node.type === "paragraph") {
      // Check if paragraph contains a single standalone image
      const onlyImg =
        node.content?.length === 1 && node.content[0]?.type === "image"
          ? node.content[0]
          : null;
      if (onlyImg) {
        const src = String(onlyImg.attrs?.src ?? "");
        const m = src.match(/\/api\/assets\/([0-9a-f-]{36})/i);
        if (m?.[1]) {
          const alt = String(onlyImg.attrs?.alt ?? "").slice(0, 300);
          blocks.push({
            id: nextId("img"),
            kind: "image",
            assetId: m[1],
            text: alt,
            dir: inferDir(undefined, alt, defaultDir),
          });
          continue;
        }
      }
      const { runs, text } = tiptapInlineToRuns(node.content);
      blocks.push({
        id: nextId("p"),
        kind: "paragraph",
        text,
        runs: runs.length > 0 ? runs : undefined,
        align: normalizeAlign(node.attrs?.textAlign),
        dir: inferDir(node.attrs?.dir, text, defaultDir),
      });
    } else if (node.type === "blockquote") {
      const firstPara = node.content?.find((c) => c.type === "paragraph");
      const { runs, text } = firstPara
        ? tiptapInlineToRuns(firstPara.content)
        : { runs: [], text: collectNodeText(node).trim() };
      blocks.push({
        id: nextId("q"),
        kind: "quote",
        text,
        runs: runs.length > 0 ? runs : undefined,
        align: normalizeAlign(firstPara?.attrs?.textAlign),
        dir: inferDir(firstPara?.attrs?.dir ?? node.attrs?.dir, text, defaultDir),
      });
    } else if (node.type === "bulletList" || node.type === "orderedList") {
      const items: string[] = [];
      const listRuns: InlineRun[][] = [];
      for (const li of node.content ?? []) {
        if (li.type !== "listItem") continue;
        const p = li.content?.find((c) => c.type === "paragraph");
        const { runs, text } = p
          ? tiptapInlineToRuns(p.content)
          : { runs: [{ text: collectNodeText(li).trim() }], text: collectNodeText(li).trim() };
        items.push(text.slice(0, 2000));
        listRuns.push(runs.slice(0, 200));
      }
      const joined = items.join(" ");
      blocks.push({
        id: nextId("l"),
        kind: "list",
        ordered: node.type === "orderedList",
        text: "",
        items: items.slice(0, 100),
        listRuns: listRuns.slice(0, 100),
        dir: inferDir(node.attrs?.dir, joined, defaultDir),
      });
    } else if (node.type === "table") {
      const rows: string[][] = [];
      for (const tr of node.content ?? []) {
        if (tr.type !== "tableRow") continue;
        const cells: string[] = [];
        for (const tc of tr.content ?? []) {
          const val = (tc.content ?? []).map(collectNodeText).join("\n").trim().slice(0, 1000);
          cells.push(val);
        }
        if (cells.length > 0) rows.push(cells);
      }
      const tableText = rows.flat().join(" ");
      if (rows.length > 0) {
        blocks.push({
          id: nextId("t"),
          kind: "table",
          text: "",
          rows: rows.slice(0, 50),
          dir: inferDir(node.attrs?.dir, tableText, defaultDir),
        });
      }
    } else if (node.type === "image") {
      const src = String(node.attrs?.src ?? "");
      const m = src.match(/\/api\/assets\/([0-9a-f-]{36})/i);
      if (m?.[1]) {
        const alt = String(node.attrs?.alt ?? "").slice(0, 300);
        blocks.push({
          id: nextId("img"),
          kind: "image",
          assetId: m[1],
          text: alt,
          dir: inferDir(undefined, alt, defaultDir),
        });
      }
    } else if (node.type === "eisaxChart" && node.attrs?.chart) {
      const ch = node.attrs.chart as ChartData;
      blocks.push({
        id: nextId("ch"),
        kind: "chart",
        text: "",
        chart: ch,
        dir: inferDir(node.attrs?.dir, ch.title, defaultDir),
      });
    }
  }

  return blocks;
}
