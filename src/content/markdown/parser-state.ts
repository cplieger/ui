/**
 * parser-state.ts — the parser's token set, its state and the stack helpers
 * its handlers share. Forked from streaming-markdown 0.2.15 (MIT, © 2024
 * Damian Tarnawski, https://github.com/thetarnav/streaming-markdown); the
 * license text is in THIRD_PARTY_NOTICES.md.
 * @module
 */

/** The tokens the parser can open; each one reaches the sink as a `Kind`. */
const OPENABLE = {
  PARAGRAPH: 2,
  HEADING_1: 3,
  HEADING_2: 4,
  HEADING_3: 5,
  HEADING_4: 6,
  HEADING_5: 7,
  HEADING_6: 8,
  CODE_BLOCK: 9,
  CODE_FENCE: 10,
  CODE_INLINE: 11,
  ITALIC_AST: 12,
  ITALIC_UND: 13,
  STRONG_AST: 14,
  STRONG_UND: 15,
  STRIKE: 16,
  LINK: 17,
  RAW_URL: 18,
  IMAGE: 19,
  BLOCKQUOTE: 20,
  LINE_BREAK: 21,
  RULE: 22,
  LIST_UNORDERED: 23,
  LIST_ORDERED: 24,
  LIST_ITEM: 25,
  CHECKBOX: 26,
  TABLE: 27,
  TABLE_ROW: 28,
  TABLE_CELL: 29,
  EQUATION_BLOCK: 30,
  EQUATION_INLINE: 31,
} as const satisfies Record<string, number>;

/** States the parser is in while it holds characters; never opened. */
const HOLDING = {
  DOCUMENT: 1,
  NEWLINE: 101,
  MAYBE_URL: 102,
  MAYBE_TASK: 103,
  MAYBE_ANGLE: 104,
  MAYBE_EQ_BLOCK: 105,
  MAYBE_ENTITY: 106,
} as const satisfies Record<string, number>;

export type Openable = (typeof OPENABLE)[keyof typeof OPENABLE];
export type Token = Openable | (typeof HOLDING)[keyof typeof HOLDING];

export const {
  PARAGRAPH,
  HEADING_1,
  HEADING_2,
  HEADING_3,
  HEADING_4,
  HEADING_5,
  HEADING_6,
  CODE_BLOCK,
  CODE_FENCE,
  CODE_INLINE,
  ITALIC_AST,
  ITALIC_UND,
  STRONG_AST,
  STRONG_UND,
  STRIKE,
  LINK,
  RAW_URL,
  IMAGE,
  BLOCKQUOTE,
  LINE_BREAK,
  RULE,
  LIST_UNORDERED,
  LIST_ORDERED,
  LIST_ITEM,
  CHECKBOX,
  TABLE,
  TABLE_ROW,
  TABLE_CELL,
  EQUATION_BLOCK,
  EQUATION_INLINE,
} = OPENABLE;

export const {
  DOCUMENT,
  NEWLINE,
  MAYBE_URL,
  MAYBE_TASK,
  MAYBE_ANGLE,
  MAYBE_EQ_BLOCK,
  MAYBE_ENTITY,
} = HOLDING;

/** What a sink is asked to open. */
export type Kind =
  | "paragraph"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "heading-4"
  | "heading-5"
  | "heading-6"
  | "code"
  | "code-inline"
  | "emphasis"
  | "strong"
  | "strike"
  | "link"
  | "image"
  | "blockquote"
  | "break"
  | "rule"
  | "list-unordered"
  | "list-ordered"
  | "list-item"
  | "checkbox"
  | "table"
  | "table-row"
  | "table-cell"
  | "equation-block"
  | "equation-inline";

const KIND: Readonly<Record<Openable, Kind>> = {
  [PARAGRAPH]: "paragraph",
  [HEADING_1]: "heading-1",
  [HEADING_2]: "heading-2",
  [HEADING_3]: "heading-3",
  [HEADING_4]: "heading-4",
  [HEADING_5]: "heading-5",
  [HEADING_6]: "heading-6",
  [CODE_BLOCK]: "code",
  [CODE_FENCE]: "code",
  [CODE_INLINE]: "code-inline",
  [ITALIC_AST]: "emphasis",
  [ITALIC_UND]: "emphasis",
  [STRONG_AST]: "strong",
  [STRONG_UND]: "strong",
  [STRIKE]: "strike",
  [LINK]: "link",
  [RAW_URL]: "link",
  [IMAGE]: "image",
  [BLOCKQUOTE]: "blockquote",
  [LINE_BREAK]: "break",
  [RULE]: "rule",
  [LIST_UNORDERED]: "list-unordered",
  [LIST_ORDERED]: "list-ordered",
  [LIST_ITEM]: "list-item",
  [CHECKBOX]: "checkbox",
  [TABLE]: "table",
  [TABLE_ROW]: "table-row",
  [TABLE_CELL]: "table-cell",
  [EQUATION_BLOCK]: "equation-block",
  [EQUATION_INLINE]: "equation-inline",
};

/**
 * An attribute of the innermost open token. `href` or `src`, then `title`,
 * arrive at a link's or image's close; `align` on a table before its first
 * row, per column `start`, `center`, `end` or empty, comma-joined; `lang`
 * right after a code open. `unclosed`, just before a close, carries the
 * delimiter of a token the text never closed: an inline one is then literal
 * text, and a code block's fence never closed.
 */
export type AttrName =
  "href" | "src" | "title" | "lang" | "checked" | "start" | "align" | "unclosed";

export const HREF = "href";
export const SRC = "src";
export const TITLE = "title";
export const LANG = "lang";
export const CHECKED = "checked";
export const START = "start";
export const ALIGN = "align";
const UNCLOSED = "unclosed";

/**
 * Receives the parse as a flat sequence of operations. Every `open` is
 * matched by one `close`, innermost first; `text` belongs to the innermost
 * open token, and inside an `image` it is the alt text. Leaves (`break`,
 * `rule`, `checkbox`) open and close at once. Emitted operations never
 * change afterwards.
 */
export interface Sink {
  open(kind: Kind): void;
  close(): void;
  text(s: string): void;
  attr(name: AttrName, value: string): void;
}

export const TOKEN_ARRAY_CAP = 24;

/** A link destination read one character at a time, so the `)` that may
 *  close it is judged without rescanning the run (CommonMark 6.3). */
export interface DestScan {
  phase: number;
  url: string;
  title: string;
  depth: number;
  /** A backslash that has not consumed its character yet. */
  escaped: boolean;
  /** Whitespace separates the destination from what follows it. */
  spaced: boolean;
  closer: string;
}

/**
 * Parser state. `pending` holds the characters a handler has not decided
 * yet; it is an accessor over `held`, and assigning it drops the `held_*`
 * facts and `dest`, which `hold` keeps. Reading any character of a string
 * built one character at a time copies it (V8 flattens a rope on each read),
 * so a handler holding an unbounded run reads these facts, never the run.
 */
export interface Parser {
  sink: Sink;
  textBuf: string;
  pending: string;
  held: string;
  held_known: boolean;
  held_head: string;
  held_nl: boolean;
  held_hash: boolean;
  /** Set while `pending` holds `](` and a destination. */
  dest: DestScan | null;
  /** The trailing run of an open bare URL that may not end it, and whether
   *  its last character is a CJK separator. */
  url_tail: string;
  url_sep: boolean;
  tokens: Uint32Array;
  /** The delimiter that opened `tokens[i]`, restored as text when the
   *  token never closes. */
  delims: string[];
  len: number;
  token: Token;
  spaces: Uint8Array;
  indent: string;
  indent_len: number;
  fence_end: number;
  fence_start: number;
  blockquote_idx: number;
  hr_char: string;
  hr_chars: number;
  table_state: number;
  /** Whether the last committed character was a word character: the
   *  lookbehind for CommonMark 6.2, where a `_` run after one cannot open
   *  emphasis. */
  prev_is_word: boolean;
  /** Depth of unclosed `[` inside the open label; CommonMark 6.3 lets a
   *  label hold balanced brackets. */
  link_depth: number;
  /** Set before `end` writes its synthetic newline, which is not input: a
   *  construct needing a character after it cannot be one. */
  at_end: boolean;
  /** Whether the open heading's `pending` holds a candidate ATX closing
   *  sequence (CommonMark 4.2): `## a#` and `## ##` both hold `"#"`. */
  atx_close: boolean;
  write: (p: Parser, chunk: string) => void;
}

/** CommonMark's word character: neither Unicode whitespace nor punctuation. */
const NOT_WORD = /[\s\p{P}\p{S}]/u;

/** Reads the last code point: an astral character's low surrogate alone is
 *  category Cs, which would call `🎉` a word character and block `🎉_yay_`. */
function ends_with_word_char(s: string): boolean {
  const len = s.length;
  if (len === 0) {
    return false;
  }
  const start = len > 1 && (s.codePointAt(len - 2) ?? 0) > 0xffff ? len - 2 : len - 1;
  return !NOT_WORD.test(s.slice(start));
}

/** Flushes `textBuf` rather than reading its end, which would copy the
 *  whole buffer on each call (see `Parser`). */
export function prev_is_word_char(p: Parser): boolean {
  add_text(p);
  return p.prev_is_word;
}

/** Appends `char` to `pending`, keeping the facts `pending_head` and its
 *  siblings answer from. */
export function hold(p: Parser, char: string): void {
  if (p.held === "") {
    p.held_known = true;
    p.held_head = char.charAt(0);
    p.held_nl = false;
    p.held_hash = false;
  }
  if (char === "\n") {
    p.held_nl = true;
  } else if (char === "#") {
    p.held_hash = true;
  }
  p.held += char;
}

function know_held(p: Parser): void {
  if (!p.held_known) {
    p.held_known = true;
    p.held_head = p.held.charAt(0);
    p.held_nl = p.held.includes("\n");
    p.held_hash = p.held.includes("#");
  }
}

/** `pending[0]`, without reading `pending`. */
export function pending_head(p: Parser): string | undefined {
  if (p.held === "") {
    return undefined;
  }
  know_held(p);
  return p.held_head;
}

export function pending_has_newline(p: Parser): boolean {
  know_held(p);
  return p.held_nl;
}

export function pending_has_hash(p: Parser): boolean {
  know_held(p);
  return p.held_hash;
}

export function is_word_char(ch: string): boolean {
  return ch !== "" && !NOT_WORD.test(ch);
}

/** A leaf has no content, so it never touches the token stack. */
export function emit_leaf(p: Parser, token: Openable, attr?: AttrName): void {
  p.prev_is_word = false;
  p.sink.open(KIND[token]);
  if (attr !== undefined) {
    p.sink.attr(attr, "");
  }
  p.sink.close();
}

export function add_text(p: Parser): void {
  if (p.textBuf === "") {
    return;
  }
  p.prev_is_word = ends_with_word_char(p.textBuf);
  p.sink.text(p.textBuf);
  p.textBuf = "";
}

export function end_token(p: Parser): void {
  p.prev_is_word = false;
  p.len -= 1;
  p.token = p.tokens[p.len] as Token;
  p.sink.close();
}

/** The tokens opened by a delimiter that has a matching closer. */
const INLINE_TOKENS: ReadonlySet<Token> = new Set<Token>([
  ITALIC_AST,
  ITALIC_UND,
  STRONG_AST,
  STRONG_UND,
  STRIKE,
  CODE_INLINE,
  LINK,
  IMAGE,
  EQUATION_INLINE,
]);

export function is_inline_token(token: Token): boolean {
  return INLINE_TOKENS.has(token);
}

/** At the depth cap nothing is pushed and the delimiter stays text, the
 *  reading it gets when the token opens and never closes. */
export function add_inline_token(p: Parser, token: Openable, delim: string): void {
  if (add_token(p, token)) {
    p.delims[p.len] = delim;
    return;
  }
  p.textBuf += delim;
}

export function end_token_unresolved(p: Parser): void {
  p.sink.attr(UNCLOSED, p.delims[p.len] ?? "");
  end_token(p);
}

/** Every proper close of an inline token or a fence goes through its own
 *  handler, so one reached from a bulk close never met its closer. */
function end_token_or_unresolved(p: Parser): void {
  const token = p.tokens[p.len] as Token;
  if (is_inline_token(token) || token === CODE_FENCE) {
    end_token_unresolved(p);
    return;
  }
  end_token(p);
}

/** Whether `n` more pushes fit above depth `len`: a construct that needs
 *  several nested tokens asks before it opens the outermost. */
export function has_token_room(len: number, n: number): boolean {
  return len + n <= TOKEN_ARRAY_CAP - 1;
}

/** False at the cap, with nothing changed: a caller that then re-feeds its
 *  character re-enters itself with the same state and never returns, so it
 *  must consume the text itself. */
export function add_token(p: Parser, token: Openable): boolean {
  if (
    (p.tokens[p.len] === LIST_ORDERED || p.tokens[p.len] === LIST_UNORDERED) &&
    token !== LIST_ITEM
  ) {
    end_token(p);
  }
  if (p.len >= TOKEN_ARRAY_CAP - 1) {
    return false;
  }
  p.prev_is_word = false;
  p.len += 1;
  p.tokens[p.len] = token;
  p.token = token;
  p.sink.open(KIND[token]);
  return true;
}

export function idx_of_token(p: Parser, token: Token, start_idx: number): number {
  while (start_idx <= p.len) {
    if (p.tokens[start_idx] === token) {
      return start_idx;
    }
    start_idx += 1;
  }
  return -1;
}

/** Both bulk closes flush `textBuf` first, or text still buffered lands in
 *  whichever element the sink holds open next. */
export function end_tokens_to_len(p: Parser, len: number): void {
  add_text(p);
  p.fence_start = 0;
  while (p.len > len) {
    end_token_or_unresolved(p);
  }
}

export function end_tokens_to_indent(p: Parser, indent: number): number {
  add_text(p);
  let idx = 0;
  for (let i = 0; i <= p.len; i += 1) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    indent -= p.spaces[i]!;
    if (indent < 0) {
      break;
    }
    switch (p.tokens[i]) {
      case CODE_BLOCK:
      case CODE_FENCE:
      case BLOCKQUOTE:
      case LIST_ITEM:
        idx = i;
        break;
      default:
        break;
    }
  }
  while (p.len > idx) {
    end_token_or_unresolved(p);
  }
  return indent;
}

/** `no_room` means nothing happened, not even a close, so the caller keeps
 *  the marker as text. */
type ListOpen = "created" | "continued" | "no_room";

/** Leaves `add_list_item` one slot to push into. */
export function continue_or_add_list(p: Parser, list_token: Openable, delim: string): ListOpen {
  let list_idx = -1;
  let item_idx = -1;
  for (let i = p.blockquote_idx + 1; i <= p.len; i += 1) {
    if (p.tokens[i] === LIST_ITEM) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (p.indent_len < p.spaces[i]!) {
        item_idx = -1;
        break;
      }
      item_idx = i;
    } else if (p.tokens[i] === list_token && p.delims[i] === delim) {
      list_idx = i;
    }
  }
  if (item_idx === -1) {
    if (list_idx === -1) {
      if (!has_token_room(p.blockquote_idx, 2)) {
        return "no_room";
      }
      end_tokens_to_len(p, p.blockquote_idx);
      add_token(p, list_token);
      p.delims[p.len] = delim;
      return "created";
    }
    if (!has_token_room(list_idx, 1)) {
      return "no_room";
    }
    end_tokens_to_len(p, list_idx);
    return "continued";
  }
  if (!has_token_room(item_idx, 2)) {
    return "no_room";
  }
  end_tokens_to_len(p, item_idx);
  add_token(p, list_token);
  p.delims[p.len] = delim;
  return "created";
}

/** Call only after `continue_or_add_list` returned anything but `no_room`,
 *  which guarantees the push fits. */
export function add_list_item(p: Parser, prefix_length: number): void {
  add_token(p, LIST_ITEM);
  p.spaces[p.len] = p.indent_len + prefix_length;
  clear_root_pending(p);
  p.token = MAYBE_TASK;
}

export function clear_root_pending(p: Parser): void {
  p.indent = "";
  p.indent_len = 0;
  p.pending = "";
  p.prev_is_word = false;
  p.link_depth = 0;
}

export function is_digit(cc: number): boolean {
  return cc >= 48 && cc <= 57;
}

export function is_delimiter_or_number(cc: number): boolean {
  return is_digit(cc) || is_delimiter(cc);
}

function is_delimiter(cc: number): boolean {
  switch (cc) {
    case 32:
    case 58:
    case 59:
    case 41:
    case 44:
    case 33:
    case 46:
    case 63:
    case 93:
    case 10:
      return true;
    default:
      return false;
  }
}

export function heading_from_level(level: number): Openable {
  switch (level) {
    case 1:
      return HEADING_1;
    case 2:
      return HEADING_2;
    case 3:
      return HEADING_3;
    case 4:
      return HEADING_4;
    case 5:
      return HEADING_5;
    default:
      return HEADING_6;
  }
}
