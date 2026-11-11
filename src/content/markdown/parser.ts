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
  pending_head,
} from "./parser-state.js";

export type { AttrName, Kind, Sink } from "./parser-state.js";

/** A parser bound to one sink. After `end`, `write` and `end` do nothing. */
export interface MarkdownParser {
  write(chunk: string): void;
  /** Closes every open token, innermost first, so the last block completes. */
  end(): void;
}

export function createParser(sink: Sink): MarkdownParser {
  const p = parser(sink);
  let ended = false;
  return {
    write(chunk) {
      if (!ended) {
        parser_write(p, chunk);
      }
    },
    end() {
      if (!ended) {
        ended = true;
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

function parser_write(p: Parser, chunk: string): void {
  for (const char of chunk) {
    // The indent after a newline decides whether the previous block extends or a new one starts.
    if (p.token === NEWLINE) {
      switch (char) {
        case " ":
          p.indent_len += 1;
          continue;
        case "\t":
          p.indent_len += 4;
          continue;
      }

      const indent = end_tokens_to_indent(p, p.indent_len);
      p.indent_len = 0;
      p.token = p.tokens[p.len] as Token;

      if (indent > 0) {
        parser_write(p, " ".repeat(indent));
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
