import type { PageLayout } from "@/lib/validation/projects";

/** Physical CSS pixels at 96 dpi; shared by editing and printing. */
export function getPageGeometry(layout: PageLayout) {
  const portrait = layout.size === "letter"
    ? { widthPx: 816, heightPx: 1056 }
    : { widthPx: 210 * 96 / 25.4, heightPx: 297 * 96 / 25.4 };
  const { widthPx, heightPx } = layout.orientation === "landscape"
    ? { widthPx: portrait.heightPx, heightPx: portrait.widthPx }
    : portrait;
  const marginPx = layout.margins === "narrow" ? 48 : layout.margins === "wide" ? 144 : 96;
  return { widthPx, heightPx, marginPx, contentWidthPx: widthPx - 2 * marginPx, contentHeightPx: heightPx - 2 * marginPx };
}
