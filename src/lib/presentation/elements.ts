import type { SlideTheme } from "@/lib/projects/themes";
import type { SlideElement, SlideItem } from "@/lib/validation/projects";

/**
 * Convert legacy structured slide fields (`title`, `subtitle`, `bullets`, `chart`, `imageAssetId`)
 * into positioned free-form SlideElement[] so every slide can be directly dragged, resized,
 * layered, and edited on the 16:9 canvas.
 */
export function slideToCanvasElements(slide: SlideItem, theme: SlideTheme): SlideElement[] {
  if (slide.elements) {
    return slide.elements;
  }

  let sequence = 0;
  const elUid = (prefix: string) => `${slide.id}-${prefix}-${sequence++}`;
  const rtl = slide.dir === "rtl";
  const align = slide.layout === "quote" ? "center" : rtl ? "right" : "left";
  const hasVisual = Boolean(slide.chart || slide.imageAssetId);
  const textX = hasVisual && rtl ? 46 : 6;
  const textW = hasVisual ? 48 : 88;
  const visualX = rtl ? 6 : 56;
  const out: SlideElement[] = [];

  if (slide.accentShape === "bar") {
    out.push({
      id: elUid("acc"),
      kind: "shape",
      shape: "rect",
      x: rtl ? 95 : 3.5,
      y: 10,
      w: 1.4,
      h: 80,
      zIndex: 1,
      fillColor: theme.accentHex,
    });
  } else if (slide.accentShape === "badge") {
    out.push({
      id: elUid("acc"),
      kind: "shape",
      shape: "roundRect",
      x: rtl ? 76 : 6,
      y: 8,
      w: 18,
      h: 4.5,
      zIndex: 1,
      fillColor: theme.accentHex,
    });
  } else if (slide.accentShape === "card") {
    out.push({
      id: elUid("acc"),
      kind: "shape",
      shape: "roundRect",
      x: 4.5,
      y: 8,
      w: 91,
      h: 84,
      zIndex: 1,
      fillColor: theme.cardBgHex,
      borderColor: theme.borderHex,
      borderWidth: 1,
    });
  }

  if (slide.title.trim()) {
    out.push({
      id: elUid("ttl"),
      kind: "text",
      x: slide.layout === "quote" ? 9 : textX,
      y: slide.layout === "title" ? 26 : 14,
      w: slide.layout === "quote" ? 82 : textW,
      h: 16,
      zIndex: 2,
      text: slide.title,
      fontSize: slide.layout === "title" ? 32 : 26,
      bold: true,
      italic: slide.layout === "quote",
      color: theme.titleHex,
      align,
      dir: slide.dir,
    });
  }

  if (slide.subtitle.trim()) {
    out.push({
      id: elUid("sub"),
      kind: "text",
      x: slide.layout === "quote" ? 9 : textX,
      y: slide.layout === "title" ? 46 : 31,
      w: slide.layout === "quote" ? 82 : textW,
      h: 11,
      zIndex: 3,
      text: slide.subtitle,
      fontSize: 16,
      color: slide.layout === "quote" ? theme.accentHex : theme.subtitleHex,
      align,
      dir: slide.dir,
    });
  }

  const bullets = (slide.bullets ?? []).filter((b) => b.trim());
  if (bullets.length > 0 && slide.layout !== "quote") {
    out.push({
      id: elUid("bul"),
      kind: "text",
      x: textX,
      y: slide.subtitle.trim() ? 45 : 35,
      w: textW,
      h: 46,
      zIndex: 4,
      text: bullets.map((b) => `• ${b}`).join("\n"),
      fontSize: 15,
      color: theme.bodyHex,
      align,
      dir: slide.dir,
    });
  }

  if (slide.chart) {
    out.push({
      id: elUid("cht"),
      kind: "chart",
      x: visualX,
      y: slide.imageAssetId ? 44 : 18,
      w: 38,
      h: slide.imageAssetId ? 44 : 66,
      zIndex: 5,
      chart: slide.chart,
    });
  }

  if (slide.imageAssetId) {
    out.push({
      id: elUid("img"),
      kind: "image",
      x: visualX,
      y: 14,
      w: 38,
      h: slide.chart ? 28 : 58,
      zIndex: 6,
      assetId: slide.imageAssetId,
    });
  }

  return out;
}
