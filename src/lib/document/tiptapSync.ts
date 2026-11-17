import type { JSONContent } from "@tiptap/core";
import { detectFirstStrongDir, resolveParagraphDir } from "@/lib/utils/bidi";
import { parseInlineSegments } from "@/lib/utils/inlineFormat";
import { hasCrop, normalizeCrop } from "@/lib/utils/mediaStyle";
import type {
  ChartData,
  DocumentBlock,
  ImageCrop,
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
        if (run.color || run.fontSize || run.fontFamily) {
          marks.push({
            type: "textStyle",
            attrs: {
              ...(run.color ? { color: run.color.startsWith("#") ? run.color : `#${run.color}` } : {}),
              ...(run.fontSize ? { fontSize: `${run.fontSize}pt` } : {}),
              ...(run.fontFamily ? { fontFamily: run.fontFamily } : {}),
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
            if (Number.isFinite(pt) && pt >= 8 && pt <= 96) run.fontSize = pt;
          }
          if (typeof m.attrs.fontFamily === "string" && m.attrs.fontFamily.trim()) {
            run.fontFamily = m.attrs.fontFamily.trim().slice(0, 80);
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
  const explicit = attrDir === "rtl" || attrDir === "ltr" ? attrDir : null;
  return resolveParagraphDir(text, explicit, fallback);
}

/** Pick "auto" when natural first-strong matches stored dir (or paragraph is empty), keeping explicit overrides intact. */
function tiptapDirForBlock(storedDir: string | undefined, text: string): "auto" | "ltr" | "rtl" {
  const trimmed = text.trim();
  if (!trimmed) return storedDir === "rtl" ? "rtl" : "auto";
  const first = detectFirstStrongDir(trimmed);
  if (first && (storedDir === first || !storedDir)) return "auto";
  return storedDir === "rtl" ? "rtl" : storedDir === "ltr" ? "ltr" : "auto";
}

/** Convert EISAX DocumentBlock[] into a TipTap/ProseMirror JSON document. */
export function blocksToTiptapDoc(blocks: DocumentBlock[]): JSONContent {
  const content: JSONContent[] = [];

  for (const b of blocks) {
    const tDir = tiptapDirForBlock(b.dir, b.text || "");
    const baseAttrs: Record<string, unknown> = {
      ...(b.align ? { textAlign: b.align } : {}),
      dir: tDir,
      ...(b.lineHeight ? { lineHeight: b.lineHeight } : {}),
      ...(b.indent ? { indent: b.indent } : {}),
    };

    if (b.kind === "pageBreak") {
      content.push({ type: "pageBreak" });
    } else if (b.kind === "heading") {
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
        attrs: { dir: tDir },
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
      const listDir = items.some((x) => x.trim().length > 0)
        ? resolveParagraphDir(items.join(" "), b.dir, "ltr")
        : b.dir === "rtl"
          ? "rtl"
          : "auto";
      const listItems: JSONContent[] = items.map((itemText, idx) => {
        const inline = inlineRunsToTiptapNodes(b.listRuns?.[idx], itemText);
        return {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              attrs: { dir: tiptapDirForBlock(b.dir, itemText) },
              ...(inline.length > 0 ? { content: inline } : {}),
            },
          ],
        };
      });
      content.push({
        type: b.ordered ? "orderedList" : "bulletList",
        attrs: {
          dir: listDir,
          ...(b.listStyle ? { listStyle: b.listStyle } : {}),
        },
        content: listItems,
      });
    } else if (b.kind === "table") {
      const rows = b.rows && b.rows.length > 0 ? b.rows : [["Column 1", "Column 2"], ["", ""]];
      const baseTablePx = 640 * ((b.widthPct ?? 100) / 100);
      const colTotal = b.colWidths && b.colWidths.length > 0
        ? b.colWidths.reduce((acc, v) => acc + v, 0)
        : 0;
      content.push({
        type: "table",
        attrs: {
          dir: b.dir === "rtl" ? "rtl" : b.dir === "ltr" ? "ltr" : "auto",
          ...(b.widthPct ? { widthPct: b.widthPct } : {}),
        },
        content: rows.map((row, rIdx) => {
          const covered = (r: number, c: number) => (b.cellSpans ?? []).some(span => r >= span.row && r < span.row + span.rowspan && c >= span.col && c < span.col + span.colspan && (r !== span.row || c !== span.col));
          const rowH = b.rowHeights?.[rIdx];
          return {
            type: "tableRow",
            ...(typeof rowH === "number" && rowH >= 20 ? { attrs: { height: Math.round(rowH) } } : {}),
            content: row.flatMap((cell, cIdx) => {
              if (covered(rIdx, cIdx)) return [];
              const span = b.cellSpans?.find(s => s.row === rIdx && s.col === cIdx);
              const colPct = b.colWidths?.[cIdx];
              const colPx =
                typeof colPct === "number" && colTotal > 0
                  ? Math.max(36, Math.round((colPct / colTotal) * baseTablePx))
                  : null;
              return [{
                type: rIdx === 0 ? "tableHeader" : "tableCell",
                attrs: { ...(colPx ? { colwidth: Array(span?.colspan ?? 1).fill(colPx) } : {}), colspan: span?.colspan ?? 1, rowspan: span?.rowspan ?? 1 },
                content: [
                  {
                    type: "paragraph",
                    attrs: { dir: tiptapDirForBlock(b.dir, cell) },
                    ...(cell ? { content: [{ type: "text", text: cell }] } : {}),
                  },
                ],
              }];
            }),
          };
        }),
      });
    } else if (b.kind === "image" && b.assetId) {
      content.push({
        type: "image",
        attrs: {
          src: `/api/assets/${b.assetId}`,
          alt: b.text || "",
          widthPct: b.widthPct ?? 72,
          heightPx: b.heightPx ?? null,
          align: b.align ?? "center",
          crop: hasCrop(b.crop) ? normalizeCrop(b.crop) : null,
          rotation: b.rotation ?? 0,
        },
      });
    } else if (b.kind === "chart" && b.chart) {
      content.push({
        type: "eisaxChart",
        attrs: {
          chart: b.chart,
          dir: b.dir || "ltr",
          widthPct: b.widthPct ?? 100,
          heightPx: b.heightPx ?? 260,
          align: b.align ?? "center",
        },
      });
    }
  }

  if (content.length === 0) {
    content.push({ type: "paragraph", attrs: { dir: "auto" } });
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
    if (node.type === "pageBreak") {
      blocks.push({ id: nextId("break"), kind: "pageBreak", text: "", dir: defaultDir });
    } else if (node.type === "heading") {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 2)));
      const { runs, text } = tiptapInlineToRuns(node.content);
      blocks.push({
        id: nextId("h"),
        kind: "heading",
        level,
        text,
        runs: runs.length > 0 ? runs : undefined,
        ...(Number(node.attrs?.lineHeight) >= 1 ? { lineHeight: Number(node.attrs?.lineHeight) } : {}),
        ...(Number(node.attrs?.indent) > 0 ? { indent: Number(node.attrs?.indent) } : {}),
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
        ...(Number(node.attrs?.lineHeight) >= 1 ? { lineHeight: Number(node.attrs?.lineHeight) } : {}),
        ...(Number(node.attrs?.indent) > 0 ? { indent: Number(node.attrs?.indent) } : {}),
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
      const listStyle =
        typeof node.attrs?.listStyle === "string" && node.attrs.listStyle.trim()
          ? node.attrs.listStyle.trim().slice(0, 30)
          : undefined;
      blocks.push({
        id: nextId("l"),
        kind: "list",
        ordered: node.type === "orderedList",
        ...(listStyle ? { listStyle } : {}),
        text: "",
        items: items.slice(0, 100),
        listRuns: listRuns.slice(0, 100),
        dir: inferDir(node.attrs?.dir, joined, defaultDir),
      });
    } else if (node.type === "table") {
      const rows: string[][] = [];
      const rowHeights: number[] = [];
      const cellSpans: Array<{row: number; col: number; rowspan: number; colspan: number}> = [];
      const occupied = new Set<string>();
      let rawColPx: number[] = [];
      let hasAnyRowHeight = false;
      for (const tr of node.content ?? []) {
        if (tr.type !== "tableRow") continue;
        const hAttr = Number(tr.attrs?.height);
        if (Number.isFinite(hAttr) && hAttr >= 20 && hAttr <= 500) {
          rowHeights.push(Math.round(hAttr));
          hasAnyRowHeight = true;
        } else {
          rowHeights.push(0);
        }
        const cells: string[] = [];
        const rowColPx: number[] = [];
        const rIdx = rows.length;
        let col = 0;
        for (const tc of tr.content ?? []) {
          while (occupied.has(`${rIdx}:${col}`)) { cells[col] = ""; col++; }
          const colspan = Math.max(1, Number(tc.attrs?.colspan) || 1);
          const rowspan = Math.max(1, Number(tc.attrs?.rowspan) || 1);
          if (colspan > 1 || rowspan > 1) cellSpans.push({ row: rIdx, col, rowspan, colspan });
          for (let r = rIdx; r < rIdx + rowspan; r++) for (let c = col; c < col + colspan; c++) if (r !== rIdx || c !== col) occupied.add(`${r}:${c}`);
          const val = (tc.content ?? []).map(collectNodeText).join("\n").trim().slice(0, 1000);
          cells[col] = val;
          for (let c = 1; c < colspan; c++) cells[col + c] = "";
          col += colspan;
          const cw = tc.attrs?.colwidth;
          const px = Array.isArray(cw) && typeof cw[0] === "number" && cw[0] > 0 ? cw[0] : 0;
          rowColPx.push(px);
        }
        while (occupied.has(`${rIdx}:${col}`)) { cells[col] = ""; col++; }
        if (cells.length > 0) {
          rows.push(cells);
          if (rawColPx.length === 0 && rowColPx.some((p) => p > 0)) {
            rawColPx = rowColPx;
          }
        }
      }
      let colWidths: number[] | undefined;
      if (rawColPx.length > 0) {
        const avgFallback = Math.round(640 / rawColPx.length);
        const filled = rawColPx.map((p) => (p > 0 ? p : avgFallback));
        const sum = filled.reduce((a, b) => a + b, 0);
        if (sum > 0) {
          colWidths = filled.map((p) =>
            Math.max(3, Math.min(95, Math.round((p / sum) * 1000) / 10)),
          );
        }
      }
      const widthPctAttr = Number(node.attrs?.widthPct);
      const widthPct =
        Number.isFinite(widthPctAttr) && widthPctAttr >= 15 && widthPctAttr <= 100
          ? Math.round(widthPctAttr)
          : undefined;
      const tableText = rows.flat().join(" ");
      if (rows.length > 0) {
        blocks.push({
          id: nextId("t"),
          kind: "table",
          text: "",
          rows: rows.slice(0, 50),
          ...(cellSpans.length ? { cellSpans } : {}),
          ...(colWidths ? { colWidths } : {}),
          ...(hasAnyRowHeight ? { rowHeights: rowHeights.slice(0, 50).map((h) => (h >= 20 ? h : 36)) } : {}),
          ...(widthPct ? { widthPct } : {}),
          dir: inferDir(node.attrs?.dir, tableText, defaultDir),
        });
      }
    } else if (node.type === "image") {
      const src = String(node.attrs?.src ?? "");
      const m = src.match(/\/api\/assets\/([0-9a-f-]{36})/i);
      if (m?.[1]) {
        const alt = String(node.attrs?.alt ?? "").slice(0, 300);
        const wPct = Number(node.attrs?.widthPct);
        const hPx = Number(node.attrs?.heightPx);
        const rot = Number(node.attrs?.rotation);
        const rawCrop = node.attrs?.crop as Partial<ImageCrop> | null | undefined;
        const alignVal = normalizeAlign(node.attrs?.align);
        blocks.push({
          id: nextId("img"),
          kind: "image",
          assetId: m[1],
          text: alt,
          ...(Number.isFinite(wPct) && wPct >= 15 && wPct <= 100 ? { widthPct: Math.round(wPct) } : {}),
          ...(Number.isFinite(hPx) && hPx >= 60 && hPx <= 900 ? { heightPx: Math.round(hPx) } : {}),
          ...(alignVal ? { align: alignVal } : {}),
          ...(rawCrop && hasCrop(normalizeCrop(rawCrop)) ? { crop: normalizeCrop(rawCrop) } : {}),
          ...(Number.isFinite(rot) && rot !== 0 ? { rotation: Math.max(-360, Math.min(360, Math.round(rot))) } : {}),
          dir: inferDir(undefined, alt, defaultDir),
        });
      }
    } else if (node.type === "eisaxChart" && node.attrs?.chart) {
      const ch = node.attrs.chart as ChartData;
      const wPct = Number(node.attrs?.widthPct);
      const hPx = Number(node.attrs?.heightPx);
      const alignVal = normalizeAlign(node.attrs?.align);
      blocks.push({
        id: nextId("ch"),
        kind: "chart",
        text: "",
        chart: ch,
        ...(Number.isFinite(wPct) && wPct >= 15 && wPct <= 100 ? { widthPct: Math.round(wPct) } : {}),
        ...(Number.isFinite(hPx) && hPx >= 60 && hPx <= 900 ? { heightPx: Math.round(hPx) } : {}),
        ...(alignVal ? { align: alignVal } : {}),
        dir: inferDir(node.attrs?.dir, ch.title, defaultDir),
      });
    }
  }

  return blocks;
}
