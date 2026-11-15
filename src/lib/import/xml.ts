import type JSZip from "jszip";

const MAX_ZIP_ENTRIES = 600;
const MAX_XML_UNCOMPRESSED_BYTES = 12 * 1024 * 1024; // 12 MiB per XML part
const MAX_MEDIA_UNCOMPRESSED_BYTES = 5 * 1024 * 1024; // 5 MiB per embedded image

/**
 * Guard against Zip-bomb / excessive entry count archives before extracting parts.
 */
export function assertSafeZipArchive(zip: JSZip): void {
  const entries = Object.values(zip.files);
  if (entries.length === 0 || entries.length > MAX_ZIP_ENTRIES) {
    throw new Error("zip_archive_too_many_entries");
  }
  let totalUncompressed = 0;
  for (const entry of entries) {
    const meta = (entry as unknown as { _data?: { uncompressedSize?: number } })._data;
    const size = typeof meta?.uncompressedSize === "number" ? meta.uncompressedSize : 0;
    if (size < 0 || size > 50 * 1024 * 1024) {
      throw new Error("zip_entry_exceeds_limit");
    }
    totalUncompressed += size;
    if (totalUncompressed > 80 * 1024 * 1024) {
      throw new Error("zip_total_uncompressed_exceeds_limit");
    }
  }
}

export async function readSafeZipXml(
  zip: JSZip,
  filePath: string,
): Promise<string | null> {
  const entry = zip.file(filePath);
  if (!entry) return null;
  const meta = (entry as unknown as { _data?: { uncompressedSize?: number } })._data;
  if (
    typeof meta?.uncompressedSize === "number" &&
    meta.uncompressedSize > MAX_XML_UNCOMPRESSED_BYTES
  ) {
    throw new Error("zip_xml_part_too_large");
  }
  const str = await entry.async("string");
  if (str.length > MAX_XML_UNCOMPRESSED_BYTES) {
    throw new Error("zip_xml_part_too_large");
  }
  return str;
}

export async function readSafeZipMedia(
  zip: JSZip,
  filePath: string,
): Promise<Buffer | null> {
  const entry = zip.file(filePath);
  if (!entry) return null;
  const meta = (entry as unknown as { _data?: { uncompressedSize?: number } })._data;
  if (
    typeof meta?.uncompressedSize === "number" &&
    meta.uncompressedSize > MAX_MEDIA_UNCOMPRESSED_BYTES
  ) {
    return null;
  }
  const buf = Buffer.from(await entry.async("nodebuffer"));
  if (buf.length > MAX_MEDIA_UNCOMPRESSED_BYTES) {
    return null;
  }
  return buf;
}

/**
 * Lightweight, dependency-free recursive OOXML parser preserving element order,
 * attributes, namespaces/localNames, and exact character data inside text nodes.
 */
export interface XmlNode {
  tag: string;
  localName: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

export function decodeXmlEntities(input: string): string {
  if (!input.includes("&")) return input;
  return input.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      const cp = Number.parseInt(code.slice(2), 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    if (code.startsWith("#")) {
      const cp = Number.parseInt(code.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return ENTITY_MAP[code] ?? m;
  });
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(raw)) !== null) {
    const key = m[1]!;
    const val = decodeXmlEntities(m[2] ?? m[3] ?? "");
    attrs[key] = val;
  }
  return attrs;
}

export function parseXml(xml: string): XmlNode | null {
  const root: XmlNode = {
    tag: "#root",
    localName: "#root",
    attrs: {},
    children: [],
    text: "",
  };
  const stack: XmlNode[] = [root];

  let i = 0;
  const len = xml.length;

  while (i < len) {
    const lt = xml.indexOf("<", i);
    if (lt === -1) {
      const tail = xml.slice(i);
      if (tail && stack.length > 1) {
        stack[stack.length - 1]!.text += decodeXmlEntities(tail);
      }
      break;
    }

    if (lt > i && stack.length > 1) {
      const txt = xml.slice(i, lt);
      if (txt) {
        stack[stack.length - 1]!.text += decodeXmlEntities(txt);
      }
    }

    // Comment <!-- ... -->
    if (xml.startsWith("<!--", lt)) {
      const end = xml.indexOf("-->", lt + 4);
      i = end === -1 ? len : end + 3;
      continue;
    }
    // Processing instruction <?xml ... ?>
    if (xml.startsWith("<?", lt)) {
      const end = xml.indexOf("?>", lt + 2);
      i = end === -1 ? len : end + 2;
      continue;
    }
    // CDATA <![CDATA[ ... ]]>
    if (xml.startsWith("<![CDATA[", lt)) {
      const end = xml.indexOf("]]>", lt + 9);
      const content = end === -1 ? xml.slice(lt + 9) : xml.slice(lt + 9, end);
      if (stack.length > 1) {
        stack[stack.length - 1]!.text += content;
      }
      i = end === -1 ? len : end + 3;
      continue;
    }
    // DOCTYPE or <!...>
    if (xml.startsWith("<!", lt)) {
      const end = xml.indexOf(">", lt + 2);
      i = end === -1 ? len : end + 1;
      continue;
    }

    // Closing tag </tag>
    if (xml.startsWith("</", lt)) {
      const gt = xml.indexOf(">", lt + 2);
      if (gt === -1) break;
      const closeTag = xml.slice(lt + 2, gt).trim();
      for (let s = stack.length - 1; s >= 1; s--) {
        if (stack[s]!.tag === closeTag || stack[s]!.localName === closeTag.split(":").pop()) {
          stack.length = s;
          break;
        }
      }
      i = gt + 1;
      continue;
    }

    // Opening or self-closing tag: scan quote-aware until >
    let gt = lt + 1;
    let quote: string | null = null;
    while (gt < len) {
      const ch = xml[gt]!;
      if (quote) {
        if (ch === quote) quote = null;
      } else {
        if (ch === '"' || ch === "'") quote = ch;
        else if (ch === ">") break;
      }
      gt++;
    }
    if (gt >= len) break;

    let inner = xml.slice(lt + 1, gt);
    const selfClosing = inner.endsWith("/");
    if (selfClosing) inner = inner.slice(0, -1);

    const spaceIdx = inner.search(/\s/);
    const tag = (spaceIdx === -1 ? inner : inner.slice(0, spaceIdx)).trim();
    const attrStr = spaceIdx === -1 ? "" : inner.slice(spaceIdx + 1);
    const colonIdx = tag.indexOf(":");
    const localName = colonIdx === -1 ? tag : tag.slice(colonIdx + 1);

    const node: XmlNode = {
      tag,
      localName,
      attrs: attrStr ? parseAttributes(attrStr) : {},
      children: [],
      text: "",
    };

    stack[stack.length - 1]!.children.push(node);
    if (!selfClosing) {
      stack.push(node);
    }
    i = gt + 1;
  }

  return root.children[0] ?? null;
}

export function child(node: XmlNode | null | undefined, localName: string): XmlNode | undefined {
  return node?.children.find((c) => c.localName === localName);
}

export function childrenOf(node: XmlNode | null | undefined, localName: string): XmlNode[] {
  return node ? node.children.filter((c) => c.localName === localName) : [];
}

export function firstDescendant(node: XmlNode | null | undefined, localName: string): XmlNode | undefined {
  if (!node) return undefined;
  for (const c of node.children) {
    if (c.localName === localName) return c;
    const found = firstDescendant(c, localName);
    if (found) return found;
  }
  return undefined;
}

export function descendants(node: XmlNode | null | undefined, localName: string): XmlNode[] {
  const out: XmlNode[] = [];
  if (!node) return out;
  const walk = (n: XmlNode) => {
    for (const c of n.children) {
      if (c.localName === localName) out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}

export function attr(node: XmlNode | null | undefined, name: string): string | undefined {
  if (!node) return undefined;
  if (name in node.attrs) return node.attrs[name];
  const suffix = `:${name}`;
  for (const [k, v] of Object.entries(node.attrs)) {
    if (k === name || k.endsWith(suffix)) return v;
  }
  return undefined;
}

export function textContent(node: XmlNode | null | undefined): string {
  if (!node) return "";
  let out = node.text;
  for (const c of node.children) {
    out += textContent(c);
  }
  return out;
}
