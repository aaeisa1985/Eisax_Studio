export interface TextSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

/**
 * Parse simple, XSS-safe inline **bold** and *italic* spans into segments.
 * Never interprets HTML; outputs plain text tokens.
 */
export function parseInlineSegments(input: string): TextSegment[] {
  if (!input) return [];
  const tokens: TextSegment[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: input.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    if (raw.startsWith("**") && raw.endsWith("**")) {
      tokens.push({ text: raw.slice(2, -2), bold: true });
    } else if (raw.startsWith("*") && raw.endsWith("*")) {
      tokens.push({ text: raw.slice(1, -1), italic: true });
    }
    lastIndex = match.index + raw.length;
  }

  if (lastIndex < input.length) {
    tokens.push({ text: input.slice(lastIndex) });
  }
  return tokens;
}
