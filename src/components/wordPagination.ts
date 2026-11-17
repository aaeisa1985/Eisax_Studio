import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import type { PageLayout } from "@/lib/validation/projects";
import { getPageGeometry } from "@/lib/document/pageGeometry";

const key = new PluginKey<DecorationSet>("eisaxPagination");
const GAP = 24;

/** View-only spacers: never alter document content or its undo history. */
export function paginationExtension(getLayout: () => PageLayout) {
  return Extension.create({
    name: "eisaxPagination",
    addProseMirrorPlugins() {
      return [new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const next = tr.getMeta(key) as DecorationSet | undefined;
            return next ?? old.map(tr.mapping, tr.doc);
          },
        },
        props: { decorations: (state) => key.getState(state) },
        view(view) {
          let frame = 0;
          let destroyed = false;
          let lastWidth = view.dom.getBoundingClientRect().width;
          const measure = () => {
            if (destroyed || !view.dom.isConnected) return;
            const layout = getLayout();
            const { marginPx, contentHeightPx, heightPx } = getPageGeometry(layout);
            const origin = view.dom.getBoundingClientRect().top;
            const paperForScale = view.dom.closest<HTMLElement>("[data-eisax-paper]");
            const scale = paperForScale ? paperForScale.getBoundingClientRect().width / getPageGeometry(layout).widthPx : 1;
            const unscale = (value: number) => value / (scale || 1);
            const breaks: Array<{ pos: number; height: number }> = [];
            let shift = 0;
            let page = 1;
            let lastLineTop = -Infinity;
            const breakBefore = (pos: number, top: number) => {
              const projected = top + shift;
              const bottom = page * contentHeightPx + (page - 1) * (2 * marginPx + GAP);
              const height = Math.max(0, bottom - projected) + 2 * marginPx + GAP;
              breaks.push({ pos, height });
              shift += height;
              page++;
            };
            const checkLine = (pos: number, top: number, bottom: number) => {
              if (Math.abs(top - lastLineTop) < 1) return;
              lastLineTop = top;
              const limit = page * contentHeightPx + (page - 1) * (2 * marginPx + GAP);
              if (bottom + shift > limit && top + shift > (page - 1) * (contentHeightPx + 2 * marginPx + GAP) + 1) breakBefore(pos, top);
            };
            view.state.doc.descendants((node, pos, parent) => {
              if (node.type.name === "pageBreak" && parent?.type.name === "doc") {
                const dom = view.nodeDOM(pos) as HTMLElement | null;
                if (dom) breakBefore(pos, unscale(dom.getBoundingClientRect().top - origin));
                return false;
              }
              // Tables retain valid HTML and editable cells. Oversized tables stay in flow.
              if (node.type.name === "table") {
                const dom = view.nodeDOM(pos) as HTMLElement | null;
                const rect = dom?.getBoundingClientRect();
                if (rect && unscale(rect.height) <= contentHeightPx) {
                  const top = unscale(rect.top - origin);
                  const limit = page * contentHeightPx + (page - 1) * (2 * marginPx + GAP);
                  if (unscale(rect.bottom - origin) + shift > limit && top + shift < limit) breakBefore(pos, top);
                }
                return false;
              }
              if (node.isTextblock) {
                const blockDom = view.nodeDOM(pos) as HTMLElement | null;
                const rect = blockDom?.getBoundingClientRect();
                const limit = page * contentHeightPx + (page - 1) * (2 * marginPx + GAP);
                // Most paragraphs fit. Only inspect characters in paragraphs that
                // actually straddle a boundary, avoiding a full-document scan per key.
                if (rect && unscale(rect.bottom - origin) + shift <= limit) return false;
                lastLineTop = -Infinity;
                // Character coordinates identify wrapped visual lines, including long paragraphs.
                for (let offset = 0; offset < Math.max(1, node.content.size); offset++) {
                  try {
                    const coords = view.coordsAtPos(Math.min(pos + 1 + offset, pos + node.nodeSize - 1));
                    checkLine(pos + 1 + offset, unscale(coords.top - origin), unscale(coords.bottom - origin));
                  } catch { /* Detached node views are measured on the next update. */ }
                }
                return false;
              }
              if (node.isBlock && node.isAtom && parent?.type.name === "doc") {
                const dom = view.nodeDOM(pos) as HTMLElement | null;
                const rect = dom?.getBoundingClientRect();
                if (rect && unscale(rect.height) <= contentHeightPx) {
                  const top = unscale(rect.top - origin);
                  const limit = page * contentHeightPx + (page - 1) * (2 * marginPx + GAP);
                  if (unscale(rect.bottom - origin) + shift > limit && top + shift < limit) breakBefore(pos, top);
                }
              }
              return true;
            });
            const widgets = breaks.map(({ pos, height }, index) => Decoration.widget(pos, () => {
              const el = document.createElement("span");
              el.className = "eisax-page-break";
              el.contentEditable = "false";
              el.setAttribute("aria-hidden", "true");
              Object.assign(el.style, {
                display: "block", height: `${height}px`, marginInline: `-${marginPx}px`,
                width: `calc(100% + ${2 * marginPx}px)`, pointerEvents: "none",
                background: `linear-gradient(to bottom, white 0, white ${Math.max(0, height - marginPx - GAP)}px, #dbe2e8 ${Math.max(0, height - marginPx - GAP)}px, #dbe2e8 ${height - marginPx}px, white ${height - marginPx}px)`,
              });
              if (layout.showPageNumbers) {
                const label = document.createElement("span");
                label.textContent = String(index + 1);
                Object.assign(label.style, { display: "block", position: "relative", top: `${Math.max(0, height - marginPx - GAP - 24)}px`, textAlign: "center", color: "#94a3b8", fontSize: "12px" });
                el.appendChild(label);
              }
              return el;
            }, { side: -1, key: `page-${index}-${height}` }));
            const paper = view.dom.closest<HTMLElement>("[data-eisax-paper]");
            if (paper) {
              paper.style.minHeight = `${page * heightPx + (page - 1) * GAP}px`;
              const lastNumber = paper.querySelector("[data-page-number-last]");
              if (lastNumber) lastNumber.textContent = String(page);
            }
            view.dispatch(view.state.tr.setMeta(key, DecorationSet.create(view.state.doc, widgets)).setMeta("addToHistory", false));
          };
          const schedule = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
              if (destroyed) return;
              // Clear old spacers before measuring the document's natural line positions.
              if (key.getState(view.state)?.find().length) view.dispatch(view.state.tr.setMeta(key, DecorationSet.empty).setMeta("addToHistory", false));
              frame = requestAnimationFrame(measure);
            });
          };
          const resize = new ResizeObserver(() => {
            const width = view.dom.getBoundingClientRect().width;
            if (Math.abs(width - lastWidth) > 0.5) { lastWidth = width; schedule(); }
          });
          resize.observe(view.dom);
          const onLayout = () => schedule();
          const onLoad = () => schedule();
          view.dom.addEventListener("eisax-layout-change", onLayout);
          view.dom.addEventListener("load", onLoad, true);
          document.fonts.ready.then(() => { if (!destroyed) schedule(); });
          document.fonts.addEventListener("loadingdone", onLoad);
          schedule();
          return {
            update(updated: EditorView, previous) { if (!updated.state.doc.eq(previous.doc)) schedule(); },
            destroy() { destroyed = true; cancelAnimationFrame(frame); resize.disconnect(); document.fonts.removeEventListener("loadingdone", onLoad); view.dom.removeEventListener("eisax-layout-change", onLayout); view.dom.removeEventListener("load", onLoad, true); },
          };
        },
      })];
    },
  });
}
