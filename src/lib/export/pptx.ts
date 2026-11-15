import PptxGenJS from "pptxgenjs";
import { presentationContentSchema } from "@/lib/validation/projects";
import { resolveSlideTheme } from "@/lib/projects/themes";
import type { AssetResolver } from "@/lib/storage/assets";

export type PptxResult = { fileName: string; data: Buffer };

/**
 * Build a real PPTX where every title, subtitle, bullet, shape, and embedded image
 * is native Office XML (never flattened slide screenshots). RTL slides use pptxgenjs rtlMode.
 */
export async function buildPptx(
  title: string,
  content: unknown,
  resolveAsset?: AssetResolver,
): Promise<PptxResult | { error: "invalid_content" }> {
  const parsed = presentationContentSchema.safeParse(content);
  if (!parsed.success) return { error: "invalid_content" };

  const theme = resolveSlideTheme(parsed.data.theme);
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = "EISAX Studio";
  pptx.company = "EISAX";
  pptx.title = title;

  for (const slide of parsed.data.slides) {
    const s = pptx.addSlide();
    s.background = { color: theme.bgHex };

    const rtl = slide.dir === "rtl";
    const align = rtl ? "right" : "left";
    const hasTitle = slide.title.trim().length > 0;
    const hasSubtitle = slide.subtitle.trim().length > 0;
    const bullets = (slide.bullets ?? []).map((b) => b.trim()).filter(Boolean);
    const hasBullets = bullets.length > 0;
    const layout = slide.layout ?? "title-body";
    const accentShape = slide.accentShape ?? "bar";

    // Native editable accent shape
    if (accentShape === "bar") {
      s.addShape(pptx.ShapeType.rect, {
        x: rtl ? 9.45 : 0.35,
        y: 0.55,
        w: 0.14,
        h: 4.5,
        fill: { color: theme.accentHex },
        line: { color: theme.accentHex, width: 0 },
      });
    } else if (accentShape === "card") {
      s.addShape(pptx.ShapeType.roundRect, {
        x: 0.45,
        y: 0.45,
        w: 9.1,
        h: 4.7,
        rectRadius: 0.08,
        fill: { color: theme.cardBgHex },
        line: { color: theme.borderHex, width: 1 },
      });
    } else if (accentShape === "badge") {
      s.addShape(pptx.ShapeType.roundRect, {
        x: rtl ? 7.6 : 0.65,
        y: 0.45,
        w: 1.75,
        h: 0.28,
        rectRadius: 0.14,
        fill: { color: theme.accentHex },
        line: { color: theme.accentHex, width: 0 },
      });
    }

    const asset =
      slide.imageAssetId && resolveAsset ? await resolveAsset(slide.imageAssetId) : null;
    const chart = slide.chart;
    const hasSideVisual = Boolean(asset || chart);
    const contentX = hasSideVisual && rtl ? 4.55 : 0.65;
    const contentW = hasSideVisual ? 4.75 : 8.7;
    const topY = accentShape === "badge" ? 0.9 : 0.65;
    const visualX = rtl ? 0.65 : 5.65;

    if (asset && chart) {
      const b64 = asset.data.toString("base64");
      s.addImage({
        data: `data:${asset.mimeType};base64,${b64}`,
        x: visualX,
        y: 0.75,
        w: 3.7,
        h: 1.55,
        sizing: { type: "contain", w: 3.7, h: 1.55 },
      });
    } else if (asset) {
      const b64 = asset.data.toString("base64");
      s.addImage({
        data: `data:${asset.mimeType};base64,${b64}`,
        x: visualX,
        y: 1.0,
        w: 3.7,
        h: 3.15,
        sizing: { type: "contain", w: 3.7, h: 3.15 },
      });
    }

    if (chart) {
      const chartType =
        chart.kind === "line"
          ? pptx.ChartType.line
          : chart.kind === "pie"
            ? pptx.ChartType.pie
            : pptx.ChartType.bar;
      const chartTitle = chart.unit ? `${chart.title} (${chart.unit})` : chart.title;
      s.addChart(
        chartType,
        [
          {
            name: chart.title,
            labels: chart.categories,
            values: chart.values,
          },
        ],
        {
          x: visualX,
          y: asset ? 2.45 : 1.05,
          w: 3.7,
          h: asset ? 2.45 : 3.55,
          showTitle: true,
          title: chartTitle,
          titleColor: theme.titleHex,
          titleFontSize: 11,
          chartColors: [theme.accentHex, "D9A441", theme.subtitleHex, "38BDF8", "10B981"],
          showLegend: chart.kind === "pie",
          legendPos: "b",
          legendColor: theme.bodyHex,
          legendFontSize: 9,
          catAxisLabelColor: theme.subtitleHex,
          catAxisLabelFontSize: 9,
          valAxisLabelColor: theme.subtitleHex,
          valAxisLabelFontSize: 9,
          dataLabelColor: theme.bodyHex,
          showValue: chart.kind !== "pie",
          showPercent: chart.kind === "pie",
        },
      );
    }

    if (layout === "quote") {
      if (hasTitle) {
        s.addText(`“${slide.title}”`, {
          x: 0.9,
          y: 1.35,
          w: 8.2,
          h: 2.0,
          fontSize: 28,
          italic: true,
          bold: true,
          color: theme.titleHex,
          rtlMode: rtl,
          align: "center",
          valign: "middle",
        });
      }
      if (hasSubtitle) {
        s.addText(`— ${slide.subtitle}`, {
          x: 0.9,
          y: 3.55,
          w: 8.2,
          h: 0.7,
          fontSize: 16,
          color: theme.accentHex,
          rtlMode: rtl,
          align: "center",
        });
      }
    } else if (layout === "title" || (!hasBullets && !hasSubtitle)) {
      if (hasTitle) {
        s.addText(slide.title, {
          x: contentX,
          y: hasSubtitle ? 1.55 : 2.1,
          w: contentW,
          h: 1.4,
          fontSize: hasSubtitle ? 36 : 42,
          bold: true,
          color: theme.titleHex,
          rtlMode: rtl,
          align,
        });
      }
      if (hasSubtitle) {
        s.addText(slide.subtitle, {
          x: contentX,
          y: 3.05,
          w: contentW,
          h: 1.1,
          fontSize: 20,
          color: theme.subtitleHex,
          rtlMode: rtl,
          align,
        });
      }
    } else if (layout === "two-col" && bullets.length >= 2) {
      if (hasTitle) {
        s.addText(slide.title, {
          x: contentX,
          y: topY,
          w: contentW,
          h: 0.85,
          fontSize: 30,
          bold: true,
          color: theme.titleHex,
          rtlMode: rtl,
          align,
        });
      }
      if (hasSubtitle) {
        s.addText(slide.subtitle, {
          x: contentX,
          y: topY + 0.85,
          w: contentW,
          h: 0.5,
          fontSize: 15,
          color: theme.subtitleHex,
          rtlMode: rtl,
          align,
        });
      }
      const mid = Math.ceil(bullets.length / 2);
      const col1 = bullets.slice(0, mid);
      const col2 = bullets.slice(mid);
      const colY = hasSubtitle ? topY + 1.45 : topY + 1.05;
      const colW = hasSideVisual ? 2.25 : 4.1;
      const gap = hasSideVisual ? 0.2 : 0.35;
      const leftX = rtl ? contentX + colW + gap : contentX;
      const rightX = rtl ? contentX : contentX + colW + gap;

      s.addText(
        col1.map((b) => ({
          text: b,
          options: { bullet: true, breakLine: true, fontSize: hasSideVisual ? 14 : 16, color: theme.bodyHex },
        })),
        { x: leftX, y: colY, w: colW, h: 3.0, rtlMode: rtl, align, valign: "top" },
      );
      if (col2.length > 0) {
        s.addText(
          col2.map((b) => ({
            text: b,
            options: { bullet: true, breakLine: true, fontSize: hasSideVisual ? 14 : 16, color: theme.bodyHex },
          })),
          { x: rightX, y: colY, w: colW, h: 3.0, rtlMode: rtl, align, valign: "top" },
        );
      }
    } else {
      // title-body
      if (hasTitle) {
        s.addText(slide.title, {
          x: contentX,
          y: topY,
          w: contentW,
          h: hasBullets || hasSubtitle ? 0.95 : 1.4,
          fontSize: hasBullets || hasSubtitle ? 32 : 40,
          bold: true,
          color: theme.titleHex,
          rtlMode: rtl,
          align,
        });
      }
      if (hasSubtitle) {
        s.addText(slide.subtitle, {
          x: contentX,
          y: topY + 1.0,
          w: contentW,
          h: 0.65,
          fontSize: 18,
          color: theme.subtitleHex,
          rtlMode: rtl,
          align,
        });
      }
      if (hasBullets) {
        s.addText(
          bullets.map((b) => ({
            text: b,
            options: { bullet: true, breakLine: true, fontSize: 17, color: theme.bodyHex },
          })),
          {
            x: contentX,
            y: hasSubtitle ? topY + 1.75 : topY + 1.15,
            w: contentW,
            h: 2.8,
            rtlMode: rtl,
            align,
            valign: "top",
          },
        );
      }
    }

    if (!hasTitle && !hasSubtitle && !hasBullets && !hasSideVisual) {
      s.addText(" ", { x: contentX, y: 2.4, w: contentW, h: 1 });
    }
    if (slide.notes.trim().length > 0) {
      s.addNotes(slide.notes);
    }
  }

  const data = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  const safeTitle = title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "presentation";
  return { fileName: `${safeTitle.slice(0, 60)}.pptx`, data };
}
