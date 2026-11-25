/**
 * Minimal tokenizer for Tenhou mjlog XML. An mjlog is a flat list of tags such as
 * `<INIT seed="0,0,0,1,2,3" .../>` or `<T12/>` inside `<mjloggm>`, so a full XML parser (DOMParser
 * is not available in Node tests anyway) is not needed.
 */

export interface MjlogTag {
  /** Tag name as written, e.g. "INIT", "T12", "mjloggm". */
  name: string;
  /** True for a closing tag such as `</mjloggm>`. */
  closing: boolean;
  /** Attribute values with XML entities decoded (URL encoding is left to the caller). */
  attrs: Map<string, string>;
}

const NAME = /^[A-Za-z_][\w.-]*/;
/**
 * `name="value"` or `name='value'`. The lookbehind lets a match start only at the beginning of a
 * word: without it, a long word with no "=" after it was rescanned from each of its characters,
 * which took seconds for a crafted tag of a few hundred kilobytes.
 */
const ATTRIBUTE = /(?<![\w:.-])([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/**
 * Splits mjlog text into tags, skipping the XML declaration, comments, doctype and text between
 * tags. Returns null when the text has an unterminated tag.
 */
export function readTags(text: string): MjlogTag[] | null {
  const tags: MjlogTag[] = [];
  let position = 0;
  while (true) {
    const start = text.indexOf("<", position);
    if (start < 0) {
      return tags;
    }
    if (text.startsWith("<!--", start)) {
      const end = text.indexOf("-->", start + 4);
      if (end < 0) {
        return null;
      }
      position = end + 3;
      continue;
    }
    const end = findTagEnd(text, start + 1);
    if (end < 0) {
      return null;
    }
    position = end + 1;
    const body = text.slice(start + 1, end);
    if (body.startsWith("?") || body.startsWith("!")) {
      continue;
    }
    const closing = body.startsWith("/");
    const inner = closing ? body.slice(1) : body;
    const name = NAME.exec(inner)?.[0];
    if (!name) {
      return null;
    }
    tags.push({ name, closing, attrs: readAttributes(inner.slice(name.length)) });
  }
}

/** Index of the `>` closing the tag that starts before `from`, ignoring `>` inside quotes. */
function findTagEnd(text: string, from: number): number {
  let quote: string | null = null;
  for (let i = from; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === quote) {
        quote = null;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return i;
    }
  }
  return -1;
}

function readAttributes(text: string): Map<string, string> {
  const attrs = new Map<string, string>();
  for (const match of text.matchAll(ATTRIBUTE)) {
    const [, key, doubleQuoted, singleQuoted] = match;
    if (key !== undefined) {
      attrs.set(key, decodeEntities(doubleQuoted ?? singleQuoted ?? ""));
    }
  }
  return attrs;
}

const NAMED_ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
]);

function decodeEntities(value: string): string {
  if (!value.includes("&")) {
    return value;
  }
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (entity, code: string) => {
    if (code.startsWith("#")) {
      const point = code[1] === "x" ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
      return point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    }
    return NAMED_ENTITIES.get(code) ?? entity;
  });
}
