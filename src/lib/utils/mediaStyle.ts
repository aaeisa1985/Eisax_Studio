import type { CSSProperties } from "react";
import type { ImageCrop } from "@/lib/validation/projects";

export const OFFICE_FONT_FAMILIES: Array<{ label: string; labelAr: string; value: string }> = [
  { label: "Default (System)", labelAr: "الافتراضي", value: "" },
  { label: "Noto Sans Arabic", labelAr: "نوتو عربي (Noto Sans Arabic)", value: "Noto Sans Arabic" },
  { label: "Cairo", labelAr: "القاهرة (Cairo)", value: "Cairo" },
  { label: "Tajawal", labelAr: "تجول (Tajawal)", value: "Tajawal" },
  { label: "Amiri", labelAr: "أميري (Amiri)", value: "Amiri" },
  { label: "Tahoma", labelAr: "تاهوما (Tahoma)", value: "Tahoma" },
  { label: "Segoe UI", labelAr: "Segoe UI", value: "Segoe UI" },
  { label: "Arial", labelAr: "Arial", value: "Arial" },
  { label: "Calibri", labelAr: "Calibri", value: "Calibri" },
  { label: "Georgia", labelAr: "Georgia", value: "Georgia" },
  { label: "Times New Roman", labelAr: "Times New Roman", value: "Times New Roman" },
  { label: "Cambria", labelAr: "Cambria", value: "Cambria" },
  { label: "Verdana", labelAr: "Verdana", value: "Verdana" },
  { label: "Trebuchet MS", labelAr: "Trebuchet MS", value: "Trebuchet MS" },
  { label: "Courier New", labelAr: "Courier New", value: "Courier New" },
];

export const DOC_FONT_SIZES = [
  "8pt",
  "9pt",
  "10pt",
  "11pt",
  "12pt",
  "14pt",
  "16pt",
  "18pt",
  "20pt",
  "24pt",
  "28pt",
  "32pt",
  "36pt",
  "48pt",
  "60pt",
  "72pt",
];

export const SLIDE_FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 60, 72];

export const LIST_STYLE_OPTIONS: Array<{
  value: string;
  ordered: boolean;
  labelEn: string;
  labelAr: string;
}> = [
  { value: "decimal", ordered: true, labelEn: "1, 2, 3 (Numbers)", labelAr: "١، ٢، ٣ / 1, 2, 3 (أرقام)" },
  { value: "arabic-indic", ordered: true, labelEn: "١، ٢، ٣ (Arabic Digits)", labelAr: "١، ٢، ٣ (أرقام عربية)" },
  { value: "arabic", ordered: true, labelEn: "أ، ب، ج (Arabic Letters)", labelAr: "أ، ب، ت (أبجدي عربي)" },
  { value: "upper-alpha", ordered: true, labelEn: "A, B, C", labelAr: "A, B, C" },
  { value: "lower-alpha", ordered: true, labelEn: "a, b, c", labelAr: "a, b, c" },
  { value: "upper-roman", ordered: true, labelEn: "I, II, III", labelAr: "I, II, III (روماني)" },
  { value: "lower-roman", ordered: true, labelEn: "i, ii, iii", labelAr: "i, ii, iii (روماني صغير)" },
  { value: "disc", ordered: false, labelEn: "• Solid Bullet", labelAr: "• نقطة ممتلئة" },
  { value: "circle", ordered: false, labelEn: "◦ Circle Bullet", labelAr: "◦ دائرة مفرغة" },
  { value: "square", ordered: false, labelEn: "▪ Square Bullet", labelAr: "▪ مربع" },
];

export function hasCrop(crop?: ImageCrop | null): boolean {
  if (!crop) return false;
  return (crop.top ?? 0) > 0 || (crop.right ?? 0) > 0 || (crop.bottom ?? 0) > 0 || (crop.left ?? 0) > 0;
}

export function normalizeCrop(crop?: Partial<ImageCrop> | null): ImageCrop {
  const clamp = (n: number | undefined) => Math.max(0, Math.min(45, Math.round((n ?? 0) * 10) / 10));
  return {
    top: clamp(crop?.top),
    right: clamp(crop?.right),
    bottom: clamp(crop?.bottom),
    left: clamp(crop?.left),
  };
}

/**
 * Computes image CSS positioning inside a `dir="ltr"; overflow: hidden` frame so
 * percentage crops from each side zoom smoothly and match OOXML `<a:srcRect>`.
 */
export function croppedImageCss(
  crop?: ImageCrop | null,
  fit: "contain" | "cover" = "contain",
): CSSProperties {
  if (!hasCrop(crop)) {
    return {
      width: "100%",
      height: "100%",
      objectFit: fit,
      display: "block",
    };
  }
  const c = normalizeCrop(crop);
  const visW = Math.max(10, 100 - c.left - c.right);
  const visH = Math.max(10, 100 - c.top - c.bottom);
  return {
    position: "relative",
    width: `${(10000 / visW).toFixed(3)}%`,
    height: `${(10000 / visH).toFixed(3)}%`,
    maxWidth: "none",
    left: `${-((c.left * 100) / visW).toFixed(3)}%`,
    top: `${-((c.top * 100) / visH).toFixed(3)}%`,
    objectFit: "fill",
    display: "block",
  };
}

const ARABIC_INDIC = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

/** Convert Western digits `0-9` into Arabic-Indic digits `٠-٩`. */
export function toArabicIndicDigits(text: string): string {
  return text.replace(/[0-9]/g, (d) => ARABIC_INDIC[Number(d)] ?? d);
}

/** Convert Arabic-Indic `٠-٩` (and Extended Arabic-Indic `۰-۹`) into Western `0-9`. */
export function toWesternDigits(text: string): string {
  return text
    .replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (ch) => String(ch.charCodeAt(0) - 0x06f0));
}

/** Smart toggle: switches between Western (123) and Arabic-Indic (١٢٣) digits. */
export function toggleDigitsScript(text: string): string {
  if (/[\u0660-\u0669\u06F0-\u06F9]/.test(text)) {
    return toWesternDigits(text);
  }
  return toArabicIndicDigits(text);
}

/** Format an integer slide/page index according to UI/document language. */
export function formatDisplayNumber(n: number, rtlOrArabic: boolean): string {
  const s = String(n);
  return rtlOrArabic ? toArabicIndicDigits(s) : s;
}

/**
 * Inject OOXML `<a:srcRect l="..." t="..." r="..." b="..."/>` (1/1000th of 1%) inside the
 * first matching `<a:blipFill>` or targeted picture XML block when crop is present.
 */
export function buildOoxmlSrcRect(crop?: ImageCrop | null): string {
  if (!hasCrop(crop)) return "";
  const c = normalizeCrop(crop);
  const l = Math.round(c.left * 1000);
  const t = Math.round(c.top * 1000);
  const r = Math.round(c.right * 1000);
  const b = Math.round(c.bottom * 1000);
  return `<a:srcRect l="${l}" t="${t}" r="${r}" b="${b}"/>`;
}
