import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { presentationContentSchema, type ImageCrop } from "@/lib/validation/projects";
import { resolveSlideTheme } from "@/lib/projects/themes";
import { resolveParagraphDir } from "@/lib/utils/bidi";
import { buildOoxmlSrcRect, hasCrop } from "@/lib/utils/mediaStyle";
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

  const slideImageCrops = new Map<number, Array<ImageCrop | undefined>>();
  let slideNum = 0;

  for (const slide of parsed.data.slides) {
    slideNum += 1;
    const s = pptx.addSlide();
    if (parsed.data.showSlideNumbers) {
      s.slideNumber = { x: 9.0, y: 5.2, fontSize: 10, color: theme.subtitleHex };
    }
    const bgHex =
      slide.bgColor && /^[0-9a-fA-F]{6}$/.test(slide.bgColor.replace(/^#/, ""))
        ? slide.bgColor.replace(/^#/, "").toUpperCase()
        : theme.bgHex;
    s.background = { color: bgHex };

    if (slide.elements && slide.elements.length > 0) {
      const sorted = [...slide.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
      const shapeMap = {
        rect: pptx.ShapeType.rect,
        roundRect: pptx.ShapeType.roundRect,
        ellipse: pptx.ShapeType.ellipse,
        triangle: pptx.ShapeType.triangle,
        line: pptx.ShapeType.line,
        arrow: pptx.ShapeType.rightArrow,
      } as const;
      const cleanHex = (c: string | undefined) => {
        if (!c) return undefined;
        const stripped = c.replace(/^#/, "").trim();
        return /^[0-9a-fA-F]{6}$/.test(stripped) ? stripped.toUpperCase() : undefined;
      };

      for (const el of sorted) {
        const x = (el.x / 100) * 10;
        const y = (el.y / 100) * 5.625;
        const w = Math.max(0.05, (el.w / 100) * 10);
        const h = Math.max(0.05, (el.h / 100) * 5.625);
        const rawText = el.text || (el.runs ?? []).map((r) => r.text).join("");
        const resolvedDir = resolveParagraphDir(rawText, el.dir, slide.dir === "rtl" ? "rtl" : "ltr");
        const elRtl = resolvedDir === "rtl";
        const elAlign =
          el.align === "center" || el.align === "right" || el.align === "left" || el.align === "justify"
            ? el.align
            : elRtl
              ? "right"
              : "left";
        const fillHex = cleanHex(el.fillColor);
        const borderHex = cleanHex(el.borderColor);
        const textHex = cleanHex(el.color) ?? theme.bodyHex;

        if (el.kind === "image" && el.assetId && resolveAsset) {
          const asset = await resolveAsset(el.assetId);
          if (asset) {
            const b64 = asset.data.toString("base64");
            const list = slideImageCrops.get(slideNum) ?? [];
            list.push(el.crop);
            slideImageCrops.set(slideNum, list);
            s.addImage({
              data: `data:${asset.mimeType};base64,${b64}`,
              x,
              y,
              w,
              h,
              sizing: { type: el.objectFit === "cover" ? "cover" : "contain", w, h },
              ...(el.rotation ? { rotate: el.rotation } : {}),
            });
          }
        } else if (el.kind === "table") {
          const rawRows = el.rows && el.rows.length > 0 ? el.rows : [[" ", " "]];
          const colCount = Math.max(...rawRows.map((r) => r.length), 1);
          const colPcts =
            el.colWidths && el.colWidths.length === colCount
              ? (() => {
                  const sum = el.colWidths.reduce((a, b) => a + b, 0) || 100;
                  return el.colWidths.map((cw) => (cw / sum) * 100);
                })()
              : Array.from({ length: colCount }, () => 100 / colCount);
          const colW = colPcts.map((pct) => Math.max(0.25, (w * pct) / 100));
          const sumRowH = (el.rowHeights ?? []).reduce((a, b) => a + b, 0);
          const rowH =
            el.rowHeights && el.rowHeights.length === rawRows.length && sumRowH > 0
              ? el.rowHeights.map((rh) => Math.max(0.22, (h * rh) / sumRowH))
              : undefined;
          const tableRows = rawRows.map((r, rIdx) =>
            Array.from({ length: colCount }, (_, cIdx) => {
              const txt = r[cIdx] ?? "";
              return {
                text: txt || " ",
                options: {
                  bold: rIdx === 0,
                  fontSize: Math.max(9, el.fontSize ?? 12),
                  ...(el.fontFamily ? { fontFace: el.fontFamily } : {}),
                  color: rIdx === 0 ? theme.titleHex : textHex,
                  fill: {
                    color:
                      rIdx === 0
                        ? cleanHex(el.fillColor) ?? theme.cardBgHex
                        : bgHex,
                  },
                  align: (elRtl || /[\u0600-\u06FF]/.test(txt) ? "right" : "left") as "right" | "left",
                },
              };
            }),
          );
          s.addTable(tableRows, {
            x,
            y,
            w,
            h,
            colW,
            ...(rowH ? { rowH } : {}),
            border: { type: "solid", pt: 0.75, color: borderHex ?? theme.borderHex },
          });
        } else if (el.kind === "chart" && el.chart) {
          const ch = el.chart;
          const chartType =
            ch.kind === "line"
              ? pptx.ChartType.line
              : ch.kind === "pie"
                ? pptx.ChartType.pie
                : pptx.ChartType.bar;
          s.addChart(
            chartType,
            [{ name: ch.title, labels: ch.categories, values: ch.values }],
            {
              x,
              y,
              w,
              h,
              showTitle: true,
              title: ch.unit ? `${ch.title} (${ch.unit})` : ch.title,
              titleColor: theme.titleHex,
              titleFontSize: 11,
              chartColors: [theme.accentHex, "D9A441", theme.subtitleHex, "38BDF8", "10B981"],
              showLegend: ch.kind === "pie",
              legendPos: "b",
              legendColor: theme.bodyHex,
              catAxisLabelColor: theme.subtitleHex,
              valAxisLabelColor: theme.subtitleHex,
              dataLabelColor: theme.bodyHex,
              showValue: ch.kind !== "pie",
              showPercent: ch.kind === "pie",
            },
          );
        } else if (el.kind === "shape") {
          const st = shapeMap[el.shape ?? "rect"];
          const opts = {
            x,
            y,
            w,
            h,
            ...(fillHex ? { fill: { color: fillHex } } : {}),
            ...(borderHex ? { line: { color: borderHex, width: el.borderWidth ?? 1.5 } } : {}),
            ...(el.rotation ? { rotate: el.rotation } : {}),
          };
          if (el.text && el.text.trim() && el.shape !== "line") {
            s.addText(el.text, {
              ...opts,
              shape: st,
              fontSize: el.fontSize ?? 16,
              ...(el.fontFamily ? { fontFace: el.fontFamily } : {}),
              bold: el.bold,
              italic: el.italic,
              underline: el.underline ? { style: "sng" } : undefined,
              color: textHex,
              align: elAlign,
              valign: el.valign ?? "middle",
              rtlMode: elRtl,
            });
          } else {
            s.addShape(st, opts);
          }
        } else {
          const runsMatchText =
            el.runs &&
            el.runs.length > 0 &&
            (!el.text || el.runs.map((r) => r.text).join("").trim() === el.text.trim());
          const rawRuns = runsMatchText
            ? el.runs!
            : [{ text: el.text || " " }];

          const textRuns: Array<{
            text: string;
            options: {
              bold?: boolean;
              italic?: boolean;
              underline?: { style: "sng" };
              color: string;
              fontSize: number;
              fontFace?: string;
              breakLine?: boolean;
              rtlMode?: boolean;
            };
          }> = [];

          rawRuns.forEach((r) => {
            const parts = r.text.split("\n");
            const face = r.fontFamily ?? el.fontFamily;
            parts.forEach((part, pIdx) => {
              textRuns.push({
                text: part || (pIdx === 0 && parts.length === 1 ? " " : ""),
                options: {
                  bold: r.bold ?? el.bold,
                  italic: r.italic ?? el.italic,
                  underline: r.underline ?? el.underline ? { style: "sng" as const } : undefined,
                  color: cleanHex(r.color) ?? textHex,
                  fontSize: r.fontSize ?? el.fontSize ?? 18,
                  ...(face ? { fontFace: face } : {}),
                  breakLine: pIdx < parts.length - 1,
                  rtlMode: elRtl,
                },
              });
            });
          });

          s.addText(textRuns, {
            x,
            y,
            w,
            h,
            align: elAlign,
            valign: el.valign ?? "top",
            rtlMode: elRtl,
            ...(el.rotation ? { rotate: el.rotation } : {}),
            ...(fillHex ? { fill: { color: fillHex } } : {}),
            ...(borderHex ? { line: { color: borderHex, width: el.borderWidth ?? 1 } } : {}),
          });
        }
      }

      if (slide.notes.trim().length > 0) {
        s.addNotes(slide.notes);
      }
      continue;
    }

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
          options: { bullet: true, breakLine: true, fontSize: hasSideVisual ? 14 : 16, color: theme.bodyHex, rtlMode: rtl },
        })),
        { x: leftX, y: colY, w: colW, h: 3.0, rtlMode: rtl, align, valign: "top" },
      );
      if (col2.length > 0) {
        s.addText(
          col2.map((b) => ({
            text: b,
            options: { bullet: true, breakLine: true, fontSize: hasSideVisual ? 14 : 16, color: theme.bodyHex, rtlMode: rtl },
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
            options: { bullet: true, breakLine: true, fontSize: 17, color: theme.bodyHex, rtlMode: rtl },
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

  let data = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  const anyCropped = Array.from(slideImageCrops.values()).some((list) =>
    list.some((c) => hasCrop(c)),
  );
  if (anyCropped) {
    const zip = await JSZip.loadAsync(data);
    for (const [sIdx, crops] of slideImageCrops.entries()) {
      if (!crops.some((c) => hasCrop(c))) continue;
      const slidePath = `ppt/slides/slide${sIdx}.xml`;
      const slideXml = await zip.file(slidePath)?.async("string");
      if (!slideXml) continue;
      let imgCounter = 0;
      const patched = slideXml.replace(
        /(<p:blipFill[^>]*>[\s\S]*?<a:blip\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/a:blip>))([\s\S]*?<\/p:blipFill>)/g,
        (full, head: string, tail: string) => {
          const crop = crops[imgCounter++];
          const srcRectXml = buildOoxmlSrcRect(crop);
          if (!srcRectXml) return full;
          const cleanedTail = tail.replace(/<a:srcRect\b[^>]*\/?>/g, "");
          return `${head}${srcRectXml}${cleanedTail}`;
        },
      );
      zip.file(slidePath, patched);
    }
    data = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
  }

  const safeTitle = title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "presentation";
  return { fileName: `${safeTitle.slice(0, 60)}.pptx`, data };
}
