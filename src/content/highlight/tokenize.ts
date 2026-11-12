/**
 * tokenize.ts — source text into coloured tokens, in one forward pass, with
 * no DOM, so it runs in a worker.
 * @module
 */

import { grammarOf } from "./languages.js";
import type { Grammar } from "./languages.js";

/** The kinds a token can carry, in the order `Runs.kinds` indexes. */
export const TOKEN_KINDS = [
  "keyword",
  "string",
  "comment",
  "number",
  "punctuation",
  "key",
  "inserted",
  "deleted",
] as const;

export type TokenKind = (typeof TOKEN_KINDS)[number];

/** A slice of the source; `kind` is null for text that takes no colour. */
export interface Token {
  readonly kind: TokenKind | null;
  readonly text: string;
}

/** The coloured tokens of a text as offsets into it, uncoloured text left out, so a row renderer
 *  can colour any slice without tokenizing again. */
export interface Runs {
  readonly starts: Int32Array;
  readonly ends: Int32Array;
  /** An index into `TOKEN_KINDS` per run. */
  readonly kinds: Uint8Array;
}

/**
 * Splits `code` into tokens by the language `lang` resolves to (see
 * `resolveLanguage`). The texts joined give back `code`, no token is empty,
 * and no two uncoloured tokens touch. A language with no colouring gives one
 * uncoloured token.
 */
export function tokenize(code: string, lang: string): Token[] {
  if (code === "") {
    return [];
  }
  const g = grammarOf(lang);
  if (g === undefined) {
    return [{ kind: null, text: code }];
  }
  switch (g.scan) {
    case "code":
      return scanCode(code, g);
    case "markup":
      return scanMarkup(code);
    case "diff":
      return scanDiff(code);
    case "plain":
      return [{ kind: null, text: code }];
  }
}

/** `tokenize`'s coloured tokens as offsets; null for a language with no colouring. */
export function runs(code: string, lang: string): Runs | null {
  const g = grammarOf(lang);
  if (g === undefined || g.scan === "plain") {
    return null;
  }
  const starts: number[] = [];
  const ends: number[] = [];
  const kinds: number[] = [];
  let at = 0;
  for (const t of tokenize(code, lang)) {
    const end = at + t.text.length;
    if (t.kind !== null) {
      starts.push(at);
      ends.push(end);
      kinds.push(TOKEN_KINDS.indexOf(t.kind));
    }
    at = end;
  }
  return {
    starts: Int32Array.from(starts),
    ends: Int32Array.from(ends),
    kinds: Uint8Array.from(kinds),
  };
}

/** Collects tokens as consecutive slices of one source. */
class Out {
  readonly tokens: Token[] = [];
  private at = 0;

  constructor(private readonly code: string) {}

  /** Ends the current token at `end`, uncoloured text merging into an uncoloured predecessor. */
  emit(kind: TokenKind | null, end: number): void {
    if (end <= this.at) {
      return;
    }
    const text = this.code.slice(this.at, end);
    this.at = end;
    const last = this.tokens[this.tokens.length - 1];
    if (kind === null && last?.kind === null) {
      this.tokens[this.tokens.length - 1] = { kind: null, text: last.text + text };
      return;
    }
    this.tokens.push({ kind, text });
  }
}

const NL = 10;
const QUOTE = 34;
const APOS = 39;
const BACKTICK = 96;
const BACKSLASH = 92;

const isDigit = (c: number): boolean => c >= 48 && c <= 57;

/** ASCII letters, `_` and `$`, and anything past ASCII, so a word in another script is one
 *  identifier and no keyword hides inside it. */
const isIdentStart = (c: number): boolean =>
  (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36 || c >= 128;

const isIdentChar = (c: number): boolean => isIdentStart(c) || isDigit(c);

const isSpace = (c: number): boolean => c === 32 || c === 9 || c === NL || c === 13;

const PUNCT = new Set(Array.from("{}()[];,.:!&|<>=+-*/%^~?@", (ch) => ch.charCodeAt(0)));

/** What can start a token other than uncoloured text; a plain run stops before it. */
const isBoundary = (c: number): boolean =>
  isIdentStart(c) ||
  isDigit(c) ||
  c === QUOTE ||
  c === APOS ||
  c === BACKTICK ||
  c === 35 ||
  PUNCT.has(c);

function scanCode(code: string, g: Grammar): Token[] {
  const out = new Out(code);
  const len = code.length;
  let i = 0;
  while (i < len) {
    if (g.keys === "yaml" && (i === 0 || code.charCodeAt(i - 1) === NL)) {
      const next = yamlLineStart(code, i, out);
      if (next > i) {
        i = next;
        continue;
      }
    }
    const comment = commentEnd(code, i, g);
    if (comment !== -1) {
      out.emit("comment", comment);
      i = comment;
      continue;
    }
    const str = stringEnd(code, i, g);
    if (str !== -1) {
      out.emit(g.keys === "json" && colonFollows(code, str) ? "key" : "string", str);
      i = str;
      continue;
    }
    const c = code.charCodeAt(i);
    if (isDigit(c) || (c === 46 && isDigit(code.charCodeAt(i + 1)))) {
      i = numberEnd(code, i);
      out.emit("number", i);
      continue;
    }
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < len && isIdentChar(code.charCodeAt(j))) {
        j++;
      }
      out.emit(g.keywords.has(code.slice(i, j)) ? "keyword" : null, j);
      i = j;
      continue;
    }
    if (PUNCT.has(c)) {
      i++;
      out.emit("punctuation", i);
      continue;
    }
    // YAML keys are read at a line's start, so a plain run stops there.
    let j = i + 1;
    while (
      j < len &&
      !isBoundary(code.charCodeAt(j)) &&
      !(g.keys === "yaml" && code.charCodeAt(j - 1) === NL)
    ) {
      j++;
    }
    out.emit(null, j);
    i = j;
  }
  return out.tokens;
}

/** Where a comment opening at `i` ends, or -1 when none opens there. */
function commentEnd(code: string, i: number, g: Grammar): number {
  for (const open of g.line) {
    if (
      code.startsWith(open, i) &&
      !(open === "#" && g.wordHash && i > 0 && !isSpace(code.charCodeAt(i - 1)))
    ) {
      const nl = code.indexOf("\n", i);
      return nl === -1 ? code.length : nl;
    }
  }
  if (g.block !== null && code.startsWith(g.block[0], i)) {
    const close = code.indexOf(g.block[1], i + g.block[0].length);
    return close === -1 ? code.length : close + g.block[1].length;
  }
  return -1;
}

/** Where a string opening at `i` ends (an unclosed one runs to its line's or the text's end), or
 *  -1 when none opens there. */
function stringEnd(code: string, i: number, g: Grammar): number {
  const q = code.charCodeAt(i);
  if (q === BACKTICK) {
    return g.backtick === null ? -1 : closeAt(code, i + 1, q, g.backtick === "escaped", true);
  }
  if (q !== QUOTE && q !== APOS) {
    return -1;
  }
  if (g.wordQuote && i > 0 && isIdentChar(code.charCodeAt(i - 1))) {
    return -1;
  }
  if (q === APOS && g.charQuote) {
    return charLiteralEnd(code, i);
  }
  if (g.triple) {
    const three = code.slice(i, i + 3);
    if (three === '"""' || three === "'''") {
      const close = code.indexOf(three, i + 3);
      return close === -1 ? code.length : close + 3;
    }
  }
  return closeAt(code, i + 1, q, !(q === APOS && g.rawSingle), g.multiline);
}

/** The index past the first unescaped `q` from `j`; at an unspanned newline or the end, there. */
function closeAt(code: string, j: number, q: number, escapes: boolean, spans: boolean): number {
  const len = code.length;
  while (j < len) {
    const c = code.charCodeAt(j);
    if (c === q) {
      return j + 1;
    }
    if (c === NL && !spans) {
      return j;
    }
    j += c === BACKSLASH && escapes ? 2 : 1;
  }
  return len;
}

const CHAR_LITERAL =
  /'(?:\\(?:u\{[0-9a-fA-F]{1,6}\}|x[0-9a-fA-F]{2}|.)|[^'\\\n\r\t]|[\uD800-\uDBFF][\uDC00-\uDFFF])'/y;

/** Where a Rust character literal at `i` ends, or -1 when the quote opens a lifetime. */
function charLiteralEnd(code: string, i: number): number {
  CHAR_LITERAL.lastIndex = i;
  return CHAR_LITERAL.test(code) ? CHAR_LITERAL.lastIndex : -1;
}

/** Whether `:` follows `at`, past spaces and tabs. */
function colonFollows(code: string, at: number): boolean {
  let j = at;
  while (code.charCodeAt(j) === 32 || code.charCodeAt(j) === 9) {
    j++;
  }
  return code.charCodeAt(j) === 58;
}

/** Hex digits only after `0x`, an exponent sign only after `e`, so `1-2` is two numbers. */
function numberEnd(code: string, i: number): number {
  const prefix = code.charCodeAt(i) === 48 ? (code[i + 1] ?? "").toLowerCase() : "";
  const hex = prefix === "x";
  let j = hex || prefix === "o" || prefix === "b" ? i + 2 : i;
  for (; j < code.length; j++) {
    const ch = code[j] ?? "";
    if (hex ? /[\da-fA-F_]/.test(ch) : /[\d_.eE]/.test(ch)) {
      continue;
    }
    if (!hex && (ch === "+" || ch === "-") && /[eE]/.test(code[j - 1] ?? "")) {
      continue;
    }
    break;
  }
  return j;
}

const isBlank = (c: number): boolean => c === 32 || c === 9;

const PLAIN_KEY_START = /[^\s#'"?:,[\]{}&*!|>%@`-]/;

/** Emits a YAML line's indent, `- ` sequence markers and key; returns where it stopped. */
function yamlLineStart(code: string, i: number, out: Out): number {
  let at = i;
  while (isBlank(code.charCodeAt(at))) {
    at++;
  }
  out.emit(null, at);
  while (code.charCodeAt(at) === 45 && isBlank(code.charCodeAt(at + 1))) {
    out.emit("punctuation", at + 1);
    at += 2;
    while (isBlank(code.charCodeAt(at))) {
      at++;
    }
    out.emit(null, at);
  }
  const key = yamlKeyEnd(code, at);
  if (key !== -1) {
    out.emit("key", key);
    return key;
  }
  return at;
}

/** Where a YAML key at `i` ends: quoted, or plain up to a `:` that a space, a tab or the line's
 *  end follows; -1 when no key starts there. */
function yamlKeyEnd(code: string, i: number): number {
  const c = code.charCodeAt(i);
  let j = i + 1;
  if (c === QUOTE) {
    while (code.charCodeAt(j) !== QUOTE) {
      const d = code.charCodeAt(j);
      if (Number.isNaN(d) || d === NL || (d === BACKSLASH && endsLine(code, j + 1))) {
        return -1;
      }
      j += d === BACKSLASH ? 2 : 1;
    }
    j++;
  } else if (c === APOS) {
    // `''` is an escaped quote, so the key ends at the first quote no quote follows.
    while (code.charCodeAt(j) !== APOS || code.charCodeAt(j + 1) === APOS) {
      const d = code.charCodeAt(j);
      if (Number.isNaN(d) || d === NL) {
        return -1;
      }
      j += d === APOS ? 2 : 1;
    }
    j++;
  } else if (PLAIN_KEY_START.test(code.charAt(i))) {
    for (let d = code.charCodeAt(j); j < code.length && d !== NL && d !== 58 && d !== 35;) {
      d = code.charCodeAt(++j);
    }
  } else {
    return -1;
  }
  return code.charCodeAt(j) === 58 && (isBlank(code.charCodeAt(j + 1)) || endsLine(code, j + 1))
    ? j
    : -1;
}

/** Whether `at` is the end of the text or a line terminator, as `$` reads it in multiline mode. */
const endsLine = (code: string, at: number): boolean =>
  at >= code.length || /[\n\r\u2028\u2029]/.test(code.charAt(at));

/** HTML and XML: tag names colour as keywords and attribute values as strings; the text between
 *  tags stays uncoloured, so its words and apostrophes are prose. */
function scanMarkup(code: string): Token[] {
  const out = new Out(code);
  const len = code.length;
  let i = 0;
  while (i < len) {
    if (code.startsWith("<!--", i)) {
      const close = code.indexOf("-->", i + 4);
      i = close === -1 ? len : close + 3;
      out.emit("comment", i);
      continue;
    }
    const next = code.charCodeAt(i + 1);
    if (code.charCodeAt(i) !== 60 || !/[A-Za-z/!?]/.test(String.fromCharCode(next))) {
      const lt = code.indexOf("<", i + 1);
      i = lt === -1 ? len : lt;
      out.emit(null, i);
      continue;
    }
    i += next === 47 || next === 33 || next === 63 ? 2 : 1;
    out.emit("punctuation", i);
    i = nameEnd(code, i);
    out.emit("keyword", i);
    i = tagRest(code, i, out);
  }
  return out.tokens;
}

function nameEnd(code: string, i: number): number {
  let j = i;
  while (j < code.length && /[\w:.-]/.test(code.charAt(j))) {
    j++;
  }
  return j;
}

/** Emits a tag's attributes through its `>`; returns the index past it, or the end. */
function tagRest(code: string, i: number, out: Out): number {
  const len = code.length;
  while (i < len) {
    const c = code.charCodeAt(i);
    if (c === QUOTE || c === APOS) {
      const close = code.indexOf(code.charAt(i), i + 1);
      i = close === -1 ? len : close + 1;
      out.emit("string", i);
    } else if (c === 62) {
      out.emit("punctuation", i + 1);
      return i + 1;
    } else if (c === 61 || c === 47 || c === 63) {
      i++;
      out.emit("punctuation", i);
    } else {
      i++;
      out.emit(null, i);
    }
  }
  return len;
}

/** Whole lines: `+` inserted, `-` deleted, `@@` hunk headers as keywords and file headers as
 *  comments. A `---` or `+++` line is a file header only before a hunk starts. */
function scanDiff(code: string): Token[] {
  const out = new Out(code);
  let inHunk = false;
  let i = 0;
  while (i < code.length) {
    const nl = code.indexOf("\n", i);
    const end = nl === -1 ? code.length : nl;
    const line = code.slice(i, end);
    let kind: TokenKind | null = null;
    if (line.startsWith("@@")) {
      inHunk = true;
      kind = "keyword";
    } else if (line.startsWith("diff ")) {
      inHunk = false;
      kind = "comment";
    } else if (!inHunk && /^(?:\+\+\+|---)(?: |$)|^index /.test(line)) {
      kind = "comment";
    } else if (line.startsWith("+")) {
      kind = "inserted";
    } else if (line.startsWith("-")) {
      kind = "deleted";
    } else if (line.startsWith("\\")) {
      kind = "comment";
    }
    out.emit(kind, end);
    i = nl === -1 ? end : nl + 1;
    out.emit(null, i);
  }
  return out.tokens;
}
