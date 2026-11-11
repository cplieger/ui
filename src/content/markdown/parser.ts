/**
 * parser.ts — an append-only streaming markdown parser emitting to a `Sink`.
 * Raw HTML is text; a character reference is decoded once, before the sink
 * sees it, and never re-parsed; named references are HTML 4.01's. Forked
 * from streaming-markdown 0.2.15 (MIT, © 2024 Damian Tarnawski,
 * https://github.com/thetarnav/streaming-markdown), see THIRD_PARTY_NOTICES.
 * @module
 */

import {
  handleRootContext,
  handleHeading,
  handleTable,
  handleTableRow,
  handleTableCell,
  handleCodeBlock,
  handleCodeFence,
  handleCodeInline,
  handleMaybeTask,
  handleStrong,
  handleItalic,
  handleMaybeEqBlock,
  handleMaybeURL,
  handleLinkOrImage,
  handleRawURL,
  handleMaybeAngle,
  handleMaybeEntity,
  handleCommon,
} from "./parser-handlers.js";
import type { Parser, Sink, Token } from "./parser-state.js";
import {
  DOCUMENT,
  BLOCKQUOTE,
  HEADING_1,
  HEADING_2,
  HEADING_3,
  HEADING_4,
  HEADING_5,
  HEADING_6,
  LINE_BREAK,
  LIST_ITEM,
  LIST_ORDERED,
  LIST_UNORDERED,
  NEWLINE,
  TABLE,
  TABLE_ROW,
  TABLE_CELL,
  CODE_BLOCK,
  CODE_FENCE,
  CODE_INLINE,
  STRONG_AST,
  STRONG_UND,
  ITALIC_AST,
  ITALIC_UND,
  STRIKE,
  MAYBE_EQ_BLOCK,
  MAYBE_TASK,
  MAYBE_URL,
  EQUATION_BLOCK,
  EQUATION_INLINE,
  IMAGE,
  LINK,
  RAW_URL,
  MAYBE_ANGLE,
  MAYBE_ENTITY,
  TOKEN_ARRAY_CAP,
  add_text,
  end_token,
  end_tokens_to_indent,
  end_tokens_to_len,
  open_columns,
  pending_head,
} from "./parser-state.js";

export type { AttrName, Kind, Sink } from "./parser-state.js";

/** A parser bound to one sink. After `end`, `write` and `end` do nothing. */
export interface MarkdownParser {
  write(chunk: string): void;
  /** Closes every open token, innermost first, so the last block completes. */
  end(): void;
}

/** CommonMark 2.1 ends a line at `\r\n` or a bare `\r` too; the parser
 *  reads only `\n`, and a `\r` ending a chunk may be half of a pair. */
export function createParser(sink: Sink): MarkdownParser {
  const p = parser(sink);
  let ended = false;
  let cr = false;
  return {
    write(chunk) {
      if (ended || chunk === "") {
        return;
      }
      let text = cr ? "\r" + chunk : chunk;
      cr = text.endsWith("\r");
      if (cr) {
        text = text.slice(0, -1);
      }
      parser_write(p, text.replace(/\r\n?/gu, "\n"));
    },
    end() {
      if (!ended) {
        ended = true;
        if (cr) {
          parser_write(p, "\n");
        }
        parser_end(p);
      }
    },
  };
}

function parser(sink: Sink): Parser {
  const tokens = new Uint32Array(TOKEN_ARRAY_CAP);
  tokens[0] = DOCUMENT;
  return {
    sink,
    textBuf: "",
    get pending() {
      return this.held;
    },
    set pending(v: string) {
      this.held = v;
      this.held_known = false;
      this.dest = null;
    },
    held: "",
    held_known: true,
    held_head: "",
    held_nl: false,
    held_hash: false,
    dest: null,
    url_tail: "",
    url_sep: false,
    tokens,
    delims: new Array<string>(TOKEN_ARRAY_CAP).fill(""),
    len: 0,
    token: DOCUMENT,
    fence_end: 0,
    blockquote_idx: 0,
    hr_char: "",
    hr_chars: 0,
    fence_start: 0,
    fence_indent: 0,
    line_quotes: 0,
    quote_space: false,
    code_gap: "",
    item_gap: false,
    item_start: false,
    spaces: new Uint8Array(TOKEN_ARRAY_CAP),
    indent: "",
    indent_len: 0,
    table_state: 0,
    prev_is_word: false,
    link_depth: 0,
    at_end: false,
    atx_close: false,
    write: parser_write,
  };
}

function parser_end(p: Parser): void {
  if (p.pending.length > 0) {
    p.at_end = true;
    parser_write(p, "\n");
    // What a handler still holds waited for a character that never came, so it is text (a `<`
    // held as a possible `<br>`). The synthetic newline is not input.
    const held = p.pending.endsWith("\n") ? p.pending.slice(0, -1) : p.pending;
    if (held !== "") {
      p.token = p.tokens[p.len] as Token;
      p.pending = "";
      p.textBuf += held;
      add_text(p);
    }
  }
  end_tokens_to_len(p, 0);
}

const actionContinue = 0;
const actionBreak = 1;
const actionAlwaysContinue = 2;
type TokenAction = typeof actionContinue | typeof actionBreak | typeof actionAlwaysContinue;

type TokenHandler = (p: Parser, char: string, pending: string) => TokenAction;

const TOKEN_HANDLERS: Partial<Record<Token, TokenHandler>> = {
  [LINE_BREAK]: (p, char, pending) =>
    handleRootContext(p, char, pending) ? actionContinue : actionBreak,
  [DOCUMENT]: (p, char, pending) =>
    handleRootContext(p, char, pending) ? actionContinue : actionBreak,
  [BLOCKQUOTE]: (p, char, pending) =>
    handleRootContext(p, char, pending) ? actionContinue : actionBreak,
  [LIST_ORDERED]: (p, char, pending) =>
    handleRootContext(p, char, pending) ? actionContinue : actionBreak,
  [LIST_UNORDERED]: (p, char, pending) =>
    handleRootContext(p, char, pending) ? actionContinue : actionBreak,
  [HEADING_1]: (p, char) => (handleHeading(p, char) ? actionContinue : actionBreak),
  [HEADING_2]: (p, char) => (handleHeading(p, char) ? actionContinue : actionBreak),
  [HEADING_3]: (p, char) => (handleHeading(p, char) ? actionContinue : actionBreak),
  [HEADING_4]: (p, char) => (handleHeading(p, char) ? actionContinue : actionBreak),
  [HEADING_5]: (p, char) => (handleHeading(p, char) ? actionContinue : actionBreak),
  [HEADING_6]: (p, char) => (handleHeading(p, char) ? actionContinue : actionBreak),
  [TABLE]: (p, char, pending) => (handleTable(p, char, pending) ? actionContinue : actionBreak),
  [TABLE_ROW]: (p, char) => (handleTableRow(p, char) ? actionContinue : actionBreak),
  [TABLE_CELL]: (p, char) => (handleTableCell(p, char) ? actionContinue : actionBreak),
  [CODE_BLOCK]: (p, char, pending) => {
    handleCodeBlock(p, char, pending);
    return actionAlwaysContinue;
  },
  [CODE_FENCE]: (p, char, pending) => {
    handleCodeFence(p, char, pending);
    return actionAlwaysContinue;
  },
  [CODE_INLINE]: (p, char, pending) => {
    handleCodeInline(p, char, pending);
    return actionAlwaysContinue;
  },
  [MAYBE_TASK]: (p: Parser, char: string, pending: string) =>
    handleMaybeTask(p, char, pending) ? actionContinue : actionBreak,
  [STRONG_AST]: (p: Parser, char: string, _pending: string) =>
    handleStrong(p, char) ? actionContinue : actionBreak,
  [STRONG_UND]: (p: Parser, char: string, _pending: string) =>
    handleStrong(p, char) ? actionContinue : actionBreak,
  [ITALIC_AST]: (p, char, pending) =>
    handleItalic(p, char, pending) ? actionContinue : actionBreak,
  [ITALIC_UND]: (p, char, pending) =>
    handleItalic(p, char, pending) ? actionContinue : actionBreak,
  [STRIKE]: (p, _char, pending) => {
    if (pending === "~~") {
      add_text(p);
      end_token(p);
      p.pending = "";
      return actionContinue;
    }
    return actionBreak;
  },
  [MAYBE_EQ_BLOCK]: (p, char) => {
    handleMaybeEqBlock(p, char);
    return actionAlwaysContinue;
  },
  [EQUATION_BLOCK]: (p, _char, pending) => {
    // `$$` closes a block opened with `$$\n`: the newline before the closer leaves `pending`
    // non-empty, so a bare `$` cannot match. handleCommon's `$` equation guard is the other half.
    if (pending === "\\]" || pending === "$" || pending === "$$") {
      add_text(p);
      end_token(p);
      p.pending = "";
      return actionContinue;
    }
    return actionBreak;
  },
  [EQUATION_INLINE]: (p, char, pending) => {
    if (pending === "\\)" || pending_head(p) === "$") {
      add_text(p);
      end_token(p);
      p.pending = char === ")" ? "" : char;
      return actionContinue;
    }
    return actionBreak;
  },
  [MAYBE_URL]: (p: Parser, char: string, pending: string) => {
    handleMaybeURL(p, char, pending);
    return actionAlwaysContinue;
  },
  [LINK]: (p, char, pending) =>
    handleLinkOrImage(p, char, pending) ? actionContinue : actionBreak,
  [IMAGE]: (p, char, pending) =>
    handleLinkOrImage(p, char, pending) ? actionContinue : actionBreak,
  [RAW_URL]: (p, char) => {
    handleRawURL(p, char);
    return actionAlwaysContinue;
  },
  [MAYBE_ANGLE]: (p, char, pending) =>
    handleMaybeAngle(p, char, pending) ? actionContinue : actionBreak,
  [MAYBE_ENTITY]: (p: Parser, char: string, pending: string) =>
    handleMaybeEntity(p, char, pending) ? actionContinue : actionBreak,
};

function quote_count(p: Parser): number {
  let n = 0;
  for (let i = 1; i <= p.len; i += 1) {
    if (p.tokens[i] === BLOCKQUOTE) {
      n += 1;
    }
  }
  return n;
}

/** Reads a fence line's indent and the `>` markers of the quotes around the
 *  fence; false for the first character past them. A tab the marker's space
 *  took a column of is kept as the spaces left (CommonMark 2.2). */
function fence_line_prefix(p: Parser, char: string): boolean {
  switch (char) {
    case " ":
      if (p.quote_space) {
        p.quote_space = false;
      } else {
        p.indent += " ";
        p.indent_len += 1;
      }
      return true;
    case "\t":
      p.indent += p.quote_space ? "   " : "\t";
      p.indent_len += p.quote_space ? 3 : 4;
      p.quote_space = false;
      return true;
    case ">":
      if (p.indent_len > 3 || p.line_quotes >= quote_count(p)) {
        return false;
      }
      p.line_quotes += 1;
      p.indent = "";
      p.indent_len = 0;
      p.quote_space = true;
      return true;
    default:
      return false;
  }
}

/** A fence line missing a quote's `>` ends that quote and the fence in it;
 *  `blockquote_idx` names the deepest quote the line continued. */
function end_unquoted(p: Parser): void {
  let seen = 0;
  let last = 0;
  for (let i = 1; i <= p.len; i += 1) {
    if (p.tokens[i] !== BLOCKQUOTE) {
      continue;
    }
    if (seen === p.line_quotes) {
      end_tokens_to_len(p, i - 1);
      break;
    }
    seen += 1;
    last = i;
  }
  p.blockquote_idx = last;
}

/** `indent` past its first `columns` columns, a tab counting four; a tab
 *  the cut splits leaves its remaining columns as spaces. */
function strip_columns(indent: string, columns: number): string {
  let column = 0;
  for (let i = 0; i < indent.length; i += 1) {
    if (column >= columns) {
      return indent.slice(i);
    }
    column += indent[i] === "\t" ? 4 : 1;
    if (column > columns) {
      return " ".repeat(column - columns) + indent.slice(i + 1);
    }
  }
  return "";
}

/** Reads `char`, the first past a line's prefix inside indented code. A
 *  blank line is held and a line four columns past the open items goes on
 *  in the block (CommonMark 4.4); false for a shallower line, which closes
 *  the block, drops what was held and is read anew. */
function code_block_line(p: Parser, char: string): boolean {
  const base = open_columns(p);
  const rest = p.indent_len - base >= 4 ? strip_columns(p.indent, base + 4) : "";
  if (char === "\n") {
    p.code_gap += rest + "\n";
  } else if (p.indent_len - base >= 4) {
    p.textBuf += p.pending + p.code_gap + rest + char;
    p.code_gap = "";
    p.pending = "";
    p.token = CODE_BLOCK;
  } else {
    p.pending = "";
    add_text(p);
    end_token(p);
    return false;
  }
  p.indent = "";
  p.indent_len = 0;
  p.line_quotes = 0;
  p.quote_space = false;
  return true;
}

function parser_write(p: Parser, chunk: string): void {
  for (const char of chunk) {
    // The indent after a newline decides whether the previous block extends or a new one starts.
    if (p.token === NEWLINE) {
      if (fence_line_prefix(p, char)) {
        continue;
      }
      end_unquoted(p);
      if (p.tokens[p.len] === CODE_BLOCK && code_block_line(p, char)) {
        continue;
      }
      // A blank line neither ends a fence nor the list item holding it (CommonMark 5.2); out of a
      // fence, the root context's blank-line arm decides what it ends.
      const blank = char === "\n";
      let indent = blank
        ? p.indent_len - open_columns(p)
        : end_tokens_to_indent(p, p.indent_len, true);
      const written = p.indent;
      const width = p.indent_len;
      p.indent = "";
      p.indent_len = 0;
      p.line_quotes = 0;
      p.quote_space = false;
      p.token = p.tokens[p.len] as Token;
      if (p.token === CODE_FENCE) {
        indent -= Math.min(indent, p.fence_indent);
      } else if (blank) {
        p.token = LINE_BREAK;
      } else if (p.token === LIST_ITEM) {
        // A closed fence is never continued lazily: the root context reads the whole line.
        p.token = LINE_BREAK;
        p.item_gap = true;
        indent = width;
      }

      if (indent > 0) {
        parser_write(p, strip_columns(written, width - indent));
      }
    }

    const pending_with_char = p.pending + char;

    const handler = TOKEN_HANDLERS[p.token];
    if (handler !== undefined) {
      const action = handler(p, char, pending_with_char);
      if (action === actionContinue || action === actionAlwaysContinue) {
        continue;
      }
    }

    if (handleCommon(p, char, pending_with_char)) {
      continue;
    }

    // Raw URL detection: "foo http://..." can start anywhere a space or line boundary ends a word.
    if (
      p.token !== IMAGE &&
      p.token !== LINK &&
      p.token !== EQUATION_BLOCK &&
      p.token !== EQUATION_INLINE &&
      char === "h" &&
      (p.pending === " " || p.pending === "")
    ) {
      p.textBuf += p.pending;
      p.pending = char;
      p.token = MAYBE_URL;
      continue;
    }

    p.textBuf += p.pending;
    p.pending = char;
  }

  add_text(p);
}
