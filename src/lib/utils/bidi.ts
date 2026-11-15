const RTL_CHAR_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const LTR_CHAR_RE = /[A-Za-z\u00C0-\u024F\u0370-\u04FF\u1E00-\u1EFF]/;

/**
 * Check whether text contains any Arabic script characters.
 */
export function hasArabicChars(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

/**
 * Unicode Bidi Algorithm (UAX #9 P2/P3) first-strong directional character detection.
 * Skips whitespace, digits, and punctuation so numbers/dashes don't lock direction.
 */
export function detectFirstStrongDir(text: string): "ltr" | "rtl" | null {
  for (const ch of text) {
    if (RTL_CHAR_RE.test(ch)) return "rtl";
    if (LTR_CHAR_RE.test(ch)) return "ltr";
  }
  return null;
}

/**
 * Resolve concrete direction ("ltr" | "rtl") from an optional/auto direction attribute and text.
 */
export function resolveParagraphDir(
  text: string,
  explicitDir?: string | null,
  fallback: "ltr" | "rtl" = "ltr",
): "ltr" | "rtl" {
  if (explicitDir === "rtl" || explicitDir === "ltr") return explicitDir;
  const strong = detectFirstStrongDir(text);
  if (strong) return strong;
  if (hasArabicChars(text)) return "rtl";
  return fallback;
}

/**
 * Split mixed Arabic/English text into script-coherent runs for Microsoft Word OOXML (`<w:rtl/>`).
 * Inside an RTL paragraph (`<w:bidi/>`), Latin spans stay `rtl: false` while Arabic and sentence
 * punctuation/neutrals take paragraph direction, preventing punctuation/word scrambling in Word.
 */
export function splitBidiRunChunks(
  text: string,
  paragraphRtl: boolean,
): Array<{ text: string; rtl: boolean }> {
  if (!text) return [];

  // Match contiguous Latin word phrases (letters/digits separated by internal spaces/hyphens/apostrophes)
  const latinPhraseRe = /[A-Za-z\u00C0-\u024F]+(?:[\s'.,:/+-]+[A-Za-z0-9\u00C0-\u024F]+)*/g;
  const arabicSpanRe = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]+(?:[\s\u060C\u061B\u061F0-9.,:;!?'"()[\]-]+[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]+)*/g;

  const chunks: Array<{ text: string; rtl: boolean }> = [];
  if (paragraphRtl) {
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = latinPhraseRe.exec(text)) !== null) {
      if (match.index > last) {
        chunks.push({ text: text.slice(last, match.index), rtl: true });
      }
      chunks.push({ text: match[0], rtl: false });
      last = match.index + match[0].length;
    }
    if (last < text.length) {
      chunks.push({ text: text.slice(last), rtl: true });
    }
    return chunks;
  }

  // LTR paragraph: mark embedded Arabic spans as rtl: true and Latin/neutral as rtl: false
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = arabicSpanRe.exec(text)) !== null) {
    if (match.index > last) {
      chunks.push({ text: text.slice(last, match.index), rtl: false });
    }
    chunks.push({ text: match[0], rtl: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    chunks.push({ text: text.slice(last), rtl: false });
  }
  return chunks;
}
