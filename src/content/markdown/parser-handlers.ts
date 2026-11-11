/**
 * parser-handlers.ts — the parser's per-context handlers. Forked from
 * streaming-markdown 0.2.15 (MIT, © 2024 Damian Tarnawski,
 * https://github.com/thetarnav/streaming-markdown); the license text is in
 * THIRD_PARTY_NOTICES.md.
 * @module
 */

import type { DestScan, Parser, Token } from "./parser-state.js";
import {
  BLOCKQUOTE,
  CHECKBOX,
  CODE_BLOCK,
  CODE_FENCE,
  CODE_INLINE,
  EQUATION_BLOCK,
  EQUATION_INLINE,
  HEADING_1,
  HEADING_2,
  HEADING_3,
  HEADING_4,
  HEADING_5,
  HEADING_6,
  IMAGE,
  ITALIC_AST,
  ITALIC_UND,
  LINE_BREAK,
  LINK,
  LIST_ITEM,
  LIST_ORDERED,
  LIST_UNORDERED,
  PARAGRAPH,
  RAW_URL,
  RULE,
  STRIKE,
  STRONG_AST,
  STRONG_UND,
  TABLE,
  TABLE_CELL,
  TABLE_ROW,
  add_text,
  emit_leaf,
  end_token,
  end_token_unresolved,
  add_token,
  add_inline_token,
  has_token_room,
  is_inline_token,
  idx_of_token,
  end_tokens_to_len,
  end_tokens_to_indent,
  open_columns,
  continue_or_add_list,
  add_list_item,
  clear_root_pending,
  is_digit,
  is_delimiter_or_number,
  prev_is_word_char,
  is_word_char,
  heading_from_level,
  NEWLINE,
  MAYBE_ANGLE,
  MAYBE_EQ_BLOCK,
  HREF,
  SRC,
  LANG,
  CHECKED,
  START,
  ALIGN,
  TITLE,
  MAYBE_ENTITY,
  hold,
  pending_head,
  pending_has_newline,
  pending_has_hash,
} from "./parser-state.js";
import { NAMED_ENTITIES, MAX_ENTITY_NAME_LENGTH } from "./entities.js";

/** XML's five names, kept out of the generated table so no regeneration
 *  drops them; HTML 4.01 lacks `apos`. */
const XML_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
};

/** One character outside this set rules the line out, which bounds the
 *  held candidate to two lines. Must stay a superset of what
 *  `is_delimiter_row` accepts, or a valid table is lost. */
const DELIMITER_ROW_CHARS = new Set(["-", " ", "\t", "|", ":"]);

/** What may open a block right after a list marker; the root context reads
 *  the rest of the line, and gives back to the item what opens none. */
const ITEM_STARTS = new Set("`~#>-*+_|0123456789".split(""));

/** A line after a table's rows that opens with one of these may start
 *  another block, which breaks the table; any other line is a row. */
const BREAKS_TABLE = new Set([
  "\n",
  "#",
  ">",
  "-",
  "*",
  "+",
  "_",
  "`",
  "~",
  "$",
  "\\",
  "<",
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
]);

function is_hex_digit(cc: number): boolean {
  return is_digit(cc) || (cc >= 65 && cc <= 70) || (cc >= 97 && cc <= 102);
}

function is_ascii_alpha(cc: number): boolean {
  return (cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122);
}

/** Whether `char` can extend the reference candidate held in `pending`, which starts at the `&`.
 *  Returning false is what ends the hold: the run is flushed verbatim and `char` is re-fed. */
function can_continue_entity(pending: string, char: string): boolean {
  const cc = char.charCodeAt(0);
  if (pending === "&") {
    return char === "#" || is_ascii_alpha(cc);
  }
  if (pending === "&#") {
    return char === "x" || char === "X" || is_digit(cc);
  }
  if (pending.startsWith("&#x") || pending.startsWith("&#X")) {
    return pending.length < 3 + 6 && is_hex_digit(cc);
  }
  if (pending.startsWith("&#")) {
    return pending.length < 2 + 7 && is_digit(cc);
  }
  return pending.length < 1 + MAX_ENTITY_NAME_LENGTH && (is_ascii_alpha(cc) || is_digit(cc));
}

/** CommonMark 6.2: a code point that is not a valid Unicode scalar decodes to U+FFFD rather than
 *  failing. */
function scalar_or_replacement(cp: number): string {
  if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
    return "\ufffd";
  }
  return String.fromCodePoint(cp);
}

/** Decode one reference body — everything between the `&` and the `;` — or null when it names
 *  nothing. A lookup miss is exactly the "an invalid reference stays literal" rule, so no extra
 *  guard is needed for it. */
function decode_entity(body: string): string | null {
  if (body.startsWith("#x") || body.startsWith("#X")) {
    const hex = body.slice(2);
    return hex === "" ? null : scalar_or_replacement(parseInt(hex, 16));
  }
  if (body.startsWith("#")) {
    const dec = body.slice(1);
    return dec === "" ? null : scalar_or_replacement(parseInt(dec, 10));
  }
  return lookup_named(body);
}

/** The character `body` names, or null when nothing names it — which is the stays-literal
 *  answer. */
function lookup_named(body: string): string | null {
  if (Object.hasOwn(XML_ENTITIES, body)) {
    return XML_ENTITIES[body] ?? null;
  }
  return Object.hasOwn(NAMED_ENTITIES, body) ? (NAMED_ENTITIES[body] ?? null) : null;
}

/** Every reference in a complete string, decoded once. A destination is
 *  decoded before the sink's URL gate sees it and never after:
 *  `javascript&#58;alert(1)` does not start with `javascript:`. */
function decode_entities(s: string): string {
  if (!s.includes("&")) {
    return s;
  }
  return s.replace(
    /&(#[Xx][0-9A-Fa-f]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,30});/gu,
    (whole, body: string) => decode_entity(body) ?? whole,
  );
}

/** The fence's language: the first word of its decoded info string, kept
 *  only when it matches the pattern, since a sink may write it as a class. */
function fence_lang(info: string): string {
  const word = decode_entities(info).trim().split(/\s/u)[0] ?? "";
  return /^[A-Za-z0-9_+.#-]{1,32}$/u.test(word) ? word : "";
}

/** A row's cells as the row handlers split them: neither an escaped pipe
 *  nor one inside a code span delimits. The delimiter row is measured
 *  against this count, so one the cell walker would not produce loses the
 *  table or splits header from body. */
function table_row_cells(row: string): string[] {
  const body = row.replace(/^[ \t]+/u, "").replace(/[ \t]+$/u, "");
  const cells: string[] = [];
  let cell = "";
  let fence = 0;
  for (let i = body.startsWith("|") ? 1 : 0; i < body.length; i += 1) {
    const ch = body.charAt(i);
    if (ch === "\\" && i + 1 < body.length) {
      cell += ch + body.charAt(i + 1);
      i += 1;
    } else if (ch === "`") {
      // A run closes the span only at its own length, which is what makes ``` ``a | b`` ``` one
      // cell as well.
      let run = 1;
      while (body.charAt(i + run) === "`") {
        run += 1;
      }
      if (fence === 0) {
        fence = run;
      } else if (fence === run) {
        fence = 0;
      }
      cell += "`".repeat(run);
      i += run - 1;
    } else if (ch === "|" && fence === 0) {
      cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  // A trailing `|` closed the last cell, so the empty remainder is not one.
  if (cell !== "") {
    cells.push(cell);
  }
  return cells;
}

/** GFM's delimiter row: a cell count matching the header's, and every cell a run of dashes with
 *  an optional colon on either side. */
function is_delimiter_row(row: string, cells: string[], header_cells: number): boolean {
  // GFM reads a `-`, `*` or `+` followed by a space or tab at line start as a BULLET, and that
  // outranks the delimiter row. The space is what keeps `-|-` a delimiter row; `- - -` is already
  // ruled out by the per-cell test.
  if (/^[ \t]*[-*+][ \t]/u.test(row)) {
    return false;
  }
  if (cells.length === 0 || cells.length !== header_cells) {
    return false;
  }
  return cells.every((cell) => /^[ \t]*:?-+:?[ \t]*$/u.test(cell));
}

/** Per-column `text-align` from the delimiter row's colons, comma-joined, or "" when the row
 *  asks for no alignment at all. */
function column_alignments(cells: string[]): string {
  const out = cells.map((cell) => {
    const c = cell.trim();
    if (!c.startsWith(":")) {
      return c.endsWith(":") ? "end" : "";
    }
    return c.endsWith(":") ? "center" : "start";
  });
  return out.some((align) => align !== "") ? out.join(",") : "";
}

/** The innermost list item a blank line keeps open, or -1: a quote the
 *  line did not continue ends there, and everything in it. */
function gap_item(p: Parser): number {
  let item = -1;
  for (let i = p.blockquote_idx + 1; i <= p.len && p.tokens[i] !== BLOCKQUOTE; i += 1) {
    if (p.tokens[i] === LIST_ITEM) {
      item = i;
    }
  }
  return item;
}

/** Opens the fence `pending` holds, `fence_start` characters of `ch` then
 *  its info string, at the line's indent past its containers. */
function open_fence(p: Parser, ch: "`" | "~", pending_with_char: string): void {
  end_tokens_to_indent(p, p.indent_len);
  const indent = Math.max(0, p.indent_len - open_columns(p));
  if (!add_token(p, CODE_FENCE)) {
    // The info string must not be emitted here: with no fence to carry it the attribute lands
    // on the enclosing element as its `class`.
    p.textBuf += p.indent + pending_with_char;
    clear_root_pending(p);
    p.fence_start = 0;
    return;
  }
  p.delims[p.len] = ch.repeat(p.fence_start);
  p.fence_indent = indent;
  const lang = fence_lang(p.pending.slice(p.fence_start));
  if (lang !== "") {
    p.sink.attr(LANG, lang);
  }
  clear_root_pending(p);
  p.fence_end = 0;
  p.token = NEWLINE;
}

export function handleRootContext(p: Parser, char: string, pending_with_char: string): boolean {
  switch (pending_head(p)) {
    case undefined:
      p.pending = char;
      return true;
    case " ":
      p.pending = char;
      p.indent += " ";
      p.indent_len += 1;
      return true;
    case "\t":
      p.pending = char;
      p.indent += "\t";
      p.indent_len += 4;
      return true;
    case "\n": {
      // A blank line in a list item: the next line decides whether the item goes on (CommonMark 5.2).
      const item = p.token === LINE_BREAK ? gap_item(p) : -1;
      if (item !== -1) {
        end_tokens_to_len(p, item);
        clear_root_pending(p);
        p.item_gap = true;
        p.blockquote_idx = 0;
        // LIST_ITEM has no handler, so the next line must still reach this one.
        p.token = LINE_BREAK;
        p.pending = char;
        return true;
      }
      end_tokens_to_len(p, p.blockquote_idx);
      clear_root_pending(p);
      p.token = p.tokens[p.len] as Token;
      p.blockquote_idx = 0;
      p.fence_start = 0;
      if (!has_token_room(p.len, 1)) {
        // Past the cap no block opens, so this line break is the only thing left to separate one
        // line of text from the next.
        p.textBuf += "\n";
      }
      p.pending = char;
      return true;
    }
    case "#":
      // Heading: #..###### + space, or a bare run, which CommonMark 4.2 reads as an empty heading.
      if (char === "#") {
        if (p.pending.length < 6) {
          p.pending = pending_with_char;
          return true;
        }
      } else if (char === " " || char === "\n") {
        end_tokens_to_indent(p, p.indent_len);
        const opened = add_token(p, heading_from_level(p.pending.length));
        if (!opened) {
          p.textBuf += p.indent + pending_with_char;
        }
        clear_root_pending(p);
        if (opened) {
          p.atx_close = true;
          if (char === "\n") {
            // Handed on rather than consumed, or the next line's text lands inside the heading this
            // newline has to close.
            p.pending = char;
          }
        }
        return true;
      }
      break;
    case ">": {
      const next_blockquote_idx = idx_of_token(p, BLOCKQUOTE, p.blockquote_idx + 1);
      if (next_blockquote_idx === -1) {
        end_tokens_to_indent(p, p.indent_len);
        if (!add_token(p, BLOCKQUOTE)) {
          // Past the cap the line is text, and so is the `>` that started it. `blockquote_idx`
          // stays put: advancing it past `len` leaves every later search for an enclosing block
          // starting above the stack.
          break;
        }
        p.blockquote_idx = p.len;
        p.fence_start = 0;
        clear_root_pending(p);
      } else {
        p.blockquote_idx = next_blockquote_idx;
        // A blank quote line in an item leaves the next line to decide, past the quote's marker.
        const gap = p.item_gap;
        clear_root_pending(p);
        p.item_gap = gap;
      }
      // The one space after `>` belongs to the marker, not to the line's indent (CommonMark 5.1).
      p.pending = char === " " ? "" : char;
      return true;
    }
    case "-":
    case "*":
    case "_": {
      // Horizontal rule: "--- * *** --" variants
      if (p.hr_chars === 0) {
        p.hr_chars = 1;
        p.hr_char = p.pending;
      }
      if (p.hr_chars > 0) {
        if (char === p.hr_char) {
          p.hr_chars += 1;
          hold(p, char);
          return true;
        }
        if (char === " ") {
          hold(p, char);
          return true;
        }
        if (char === "\n") {
          if (p.hr_chars < 3) {
            // Fall through to unordered-list check below
          } else {
            end_tokens_to_indent(p, p.indent_len);
            emit_leaf(p, RULE);
            clear_root_pending(p);
            p.hr_chars = 0;
            return true;
          }
        }
        p.hr_chars = 0;
      }
      // Unordered list: "* foo", "- foo", but not "_ foo"
      if (pending_head(p) !== "_" && p.pending[1] === " ") {
        if (continue_or_add_list(p, LIST_UNORDERED, "") === "no_room") {
          break;
        }
        add_list_item(p, 2);
        p.write(p, pending_with_char.slice(2));
        return true;
      }
      break;
    }
    case "`":
      // Code fence handling: need 3+ backticks followed by newline.
      if (p.pending.length < 3) {
        if (char === "`") {
          hold(p, char);
          p.fence_start = p.pending.length;
          return true;
        }
        p.fence_start = 0;
        break;
      }
      if (char === "`") {
        if (p.pending.length === p.fence_start) {
          hold(p, char);
          p.fence_start = p.pending.length;
        } else if (p.item_start) {
          p.fence_start = 0;
          break;
        } else if (add_token(p, PARAGRAPH)) {
          clear_root_pending(p);
          p.fence_start = 0;
          p.write(p, pending_with_char);
        } else {
          p.textBuf += pending_with_char;
          clear_root_pending(p);
          p.fence_start = 0;
        }
        return true;
      }
      if (char === "\n") {
        open_fence(p, "`", pending_with_char);
        return true;
      }
      hold(p, char);
      return true;
    case "~": {
      // A tilde fence's info string may hold anything, backticks and tildes included.
      const run = p.pending.length === 1 ? 1 : p.fence_start;
      if (char === "~" && p.pending.length === run) {
        hold(p, char);
        p.fence_start = p.pending.length;
        return true;
      }
      if (run < 3) {
        p.fence_start = 0;
        break;
      }
      p.fence_start = run;
      if (char === "\n") {
        open_fence(p, "~", pending_with_char);
        return true;
      }
      hold(p, char);
      return true;
    }
    case "+":
      if (char !== " ") {
        break;
      }
      if (continue_or_add_list(p, LIST_UNORDERED, "") === "no_room") {
        break;
      }
      add_list_item(p, 2);
      return true;
    case "0":
    case "1":
    case "2":
    case "3":
    case "4":
    case "5":
    case "6":
    case "7":
    case "8":
    case "9":
      if (p.pending.endsWith(".") || p.pending.endsWith(")")) {
        if (char !== " ") {
          break;
        }
        const number = p.pending.slice(0, -1);
        const opened = continue_or_add_list(p, LIST_ORDERED, p.pending.slice(-1));
        if (opened === "no_room") {
          break;
        }
        if (opened === "created" && number !== "1") {
          p.sink.attr(START, number);
        }
        add_list_item(p, p.pending.length + 1);
        return true;
      } else {
        const cc = char.charCodeAt(0);
        // CommonMark 5.2 bounds the marker at nine digits, so a longer run of them is prose — an
        // order number, a phone number, a byte count.
        if (cc === 46 || cc === 41 || (is_digit(cc) && p.pending.length < 9)) {
          p.pending = pending_with_char;
          return true;
        }
      }
      break;
    case "|": {
      // GFM needs a delimiter row on the line AFTER the header, so the header is HELD in `pending`
      // until the next line decides.
      const has_nl = pending_has_newline(p);
      if (has_nl && char === "\n") {
        const nl = p.pending.indexOf("\n");
        const header = p.pending.slice(0, nl);
        const delim = p.pending.slice(nl + 1);
        const cells = table_row_cells(delim);
        if (!is_delimiter_row(delim, cells, table_row_cells(header).length)) {
          break;
        }
        end_tokens_to_indent(p, p.indent_len);
        // TABLE, TABLE_ROW and TABLE_CELL must ALL fit: a failed row or cell push leaves the cell
        // text as a text node directly inside the `<table>`, and `handleTableRow`'s default arm
        // re-feeds its character, so a failure there recurses without bound.
        if (!has_token_room(p.len, 3)) {
          break;
        }
        add_token(p, TABLE);
        const align = column_alignments(cells);
        if (align !== "") {
          p.sink.attr(ALIGN, align);
        }
        add_token(p, TABLE_ROW);
        p.pending = "";
        p.indent = "";
        p.indent_len = 0;
        p.item_start = false;
        // Replayed through the row handlers rather than emitted here, so the header and the
        // delimiter row go through exactly the path they took before the deferral existed.
        p.write(p, header.slice(1) + "\n" + delim + "\n");
        return true;
      }
      // No line follows the newline `parser_end` writes, so a candidate still being held at end of
      // input can never become a table.
      if (p.at_end) {
        break;
      }
      if (!has_nl || DELIMITER_ROW_CHARS.has(char)) {
        hold(p, char);
        return true;
      }
      break;
    }
  }

  // Fallthrough: promote pending to a paragraph or code block.
  let to_write = pending_with_char;
  let pushed = true;
  if (p.item_start) {
    p.token = p.tokens[p.len] as Token;
  } else if (p.token === LINE_BREAK && !p.item_gap) {
    p.token = p.tokens[p.len] as Token;
    emit_leaf(p, LINE_BREAK);
  } else {
    if (p.item_gap) {
      p.token = p.tokens[p.len] as Token;
      end_tokens_to_indent(p, p.indent_len);
      p.indent_len = Math.max(0, p.indent_len - open_columns(p));
      p.indent = " ".repeat(p.indent_len);
    }
    if (p.indent_len >= 4) {
      let code_start = 0;
      for (; code_start < 4; code_start += 1) {
        if (p.indent[code_start] === "\t") {
          code_start = code_start + 1;
          break;
        }
      }
      to_write = p.indent.slice(code_start) + pending_with_char;
      pushed = add_token(p, CODE_BLOCK);
      p.code_gap = "";
    } else {
      pushed = add_token(p, PARAGRAPH);
    }
    if (!pushed) {
      // No block opened, so the leading whitespace one would have consumed is text as well — the
      // four columns that mark indented code included. Promotion runs once per two characters past
      // the cap, so without this a space landing on a promotion boundary disappears.
      to_write = p.indent + pending_with_char;
    }
  }

  clear_root_pending(p);
  if (!pushed) {
    // The stack is at its cap, so nothing changed and re-feeding would re-enter this function with
    // identical state. Past the depth limit the line is text.
    p.textBuf += to_write;
    if (to_write.endsWith("\n")) {
      // The newline arm never ran for this newline, and it owns the two pieces of line-scoped state
      // below. Left alone, `blockquote_idx` still names the blockquote the PREVIOUS line ended in,
      // so the next line's `>` run searches above the stack and reads as literal text.
      p.blockquote_idx = 0;
      p.fence_start = 0;
    }
    return true;
  }
  p.write(p, to_write);
  return true;
}

/** The ATX closing sequence at the end of a held run: whitespace, an optional run of `#`, then
 *  whitespace. Anchored at the end, so `" ## #"` loses only the LAST run and keeps the first as
 *  content, which is CommonMark 4.2's reading. */
const ATX_CLOSE_TAIL = /[ \t]*(?:#+[ \t]*)?$/u;

/** Hold a candidate ATX closing sequence, so a `#` run that turns out to be syntax never reaches
 *  the sink as text. */
export function handleHeading(p: Parser, char: string): boolean {
  if (char === "\n") {
    // A whitespace-only hold is the line's trailing whitespace, which 4.2 strips from a heading's
    // content whether or not a closing run follows it.
    if (p.atx_close || /^[ \t]+$/u.test(p.pending)) {
      p.textBuf += p.pending.replace(ATX_CLOSE_TAIL, "");
      p.pending = "";
      p.atx_close = false;
    }
    return false;
  }
  if (char === "#") {
    // A closing run must be preceded by whitespace. `atx_close` covers the run that starts the
    // content, whose whitespace was the opening sequence's own.
    if (p.atx_close || /^[ \t]+$/u.test(p.pending)) {
      hold(p, char);
      p.atx_close = true;
      return true;
    }
    p.atx_close = false;
    return false;
  }
  if ((char === " " || char === "\t") && p.atx_close && pending_has_hash(p)) {
    hold(p, char);
    return true;
  }
  if (char !== " " && char !== "\t") {
    p.atx_close = false;
  }
  return false;
}

export function handleTable(p: Parser, char: string, pending_with_char: string): boolean {
  if (p.table_state === 1) {
    if (char === "\n") {
      p.table_state = 2;
      p.pending = "";
      return true;
    }
    if (DELIMITER_ROW_CHARS.has(char)) {
      p.pending = pending_with_char;
      return true;
    }
    end_token(p);
    p.table_state = 0;
    return false;
  }
  // A line's first character decides at once whether it is a row, so the table never holds
  // text and where a stream is cut cannot move the line (GFM 0.29 examples 201 and 202).
  if (p.table_state === 2 && p.pending === "" && (char === " " || char === "\t")) {
    p.indent += char;
    return true;
  }
  const indent = p.indent;
  p.indent = "";
  if (p.table_state === 2 && p.pending === "" && char !== "|") {
    if (!BREAKS_TABLE.has(char)) {
      add_token(p, TABLE_ROW);
      p.write(p, char);
      return true;
    }
    end_token(p);
    p.table_state = 0;
    if (p.tokens[p.len] === LIST_ITEM) {
      // The line starts a block, in the item or past it, as after a blank line in the item.
      p.token = LINE_BREAK;
      p.item_gap = true;
    }
    p.write(p, indent + char);
    return true;
  }
  switch (p.pending) {
    case "|":
      add_token(p, TABLE_ROW);
      p.pending = "";
      p.write(p, char);
      return true;
    case "\n":
      end_token(p);
      p.pending = "";
      p.table_state = 0;
      p.write(p, char);
      return true;
  }
  return false;
}

function is_blank(s: string): boolean {
  for (const ch of s) {
    if (ch !== " " && ch !== "\t") {
      return false;
    }
  }
  return true;
}

/** The row and cell pushes here are unchecked because the `|` arm in `handleRootContext`
 *  reserves room for all three table tokens before it opens the table. */
export function handleTableRow(p: Parser, char: string): boolean {
  switch (p.pending) {
    case "":
      return false;
    case "|":
      add_token(p, TABLE_CELL);
      end_token(p);
      p.pending = "";
      p.write(p, char);
      return true;
    case "\n":
      end_token(p);
      p.table_state = Math.min(p.table_state + 1, 2);
      p.pending = "";
      p.write(p, char);
      return true;
    default:
      // GFM makes the trailing pipe optional and trims every cell, so whitespace between the last
      // pipe and the newline is not a cell.
      if (is_blank(p.pending)) {
        if (char === "\n") {
          p.pending = char;
          return true;
        }
        if (char === " " || char === "\t") {
          return true;
        }
      }
      add_token(p, TABLE_CELL);
      p.write(p, char);
      return true;
  }
}

export function handleTableCell(p: Parser, char: string): boolean {
  if (p.pending === "|") {
    add_text(p);
    end_token(p);
    p.pending = "";
    p.write(p, char);
    return true;
  }
  if (p.pending === "\n") {
    // GFM makes the trailing pipe optional, so a newline ends the last cell as well as the row.
    add_text(p);
    end_token(p);
    p.pending = "\n";
    p.write(p, char);
    return true;
  }
  return false;
}

/** A newline hands the next line's prefix to the parser's line reader,
 *  which decides whether the block goes on. */
export function handleCodeBlock(p: Parser, char: string, pending_with_char: string): void {
  if (char === "\n") {
    p.textBuf += p.pending;
    p.pending = char;
    p.token = NEWLINE;
    return;
  }
  p.textBuf += pending_with_char;
  p.pending = "";
}

/** Whether a held line is a closing fence per CommonMark 4.5: at most three spaces of indent,
 *  then a run of at least `fence_start` of the fence's character, then nothing but spaces and
 *  tabs. `line` may carry the newline that started it. */
function is_fence_close(line: string, ch: string, fence_start: number): boolean {
  let i = line.startsWith("\n") ? 1 : 0;
  const indent_start = i;
  while (line[i] === " ") {
    i += 1;
  }
  if (i - indent_start > 3) {
    return false;
  }
  const run_start = i;
  while (line[i] === ch) {
    i += 1;
  }
  if (i - run_start < fence_start) {
    return false;
  }
  while (i < line.length) {
    if (line[i] !== " " && line[i] !== "\t") {
      return false;
    }
    i += 1;
  }
  return true;
}

export function handleCodeFence(p: Parser, char: string, pending_with_char: string): void {
  // `p.fence_end` is the current line's verdict: 0 while the line could still be the closing fence,
  // 1 once a character ruled it out.
  const ch = p.delims[p.len]?.charAt(0) ?? "`";
  if (p.fence_end === 0) {
    switch (char) {
      case ch:
      case " ":
      case "\t":
        p.pending = pending_with_char;
        return;
      case "\n":
        if (is_fence_close(p.pending, ch, p.fence_start)) {
          add_text(p);
          end_token(p);
          p.pending = "";
          p.fence_start = 0;
          p.fence_end = 0;
          p.token = NEWLINE;
          return;
        }
        break;
      default:
        p.fence_end = 1;
    }
  }
  if (char === "\n") {
    p.textBuf += p.pending;
    p.pending = char;
    p.token = NEWLINE;
    p.fence_end = 0;
    return;
  }
  p.textBuf += pending_with_char;
  p.pending = "";
}

export function handleCodeInline(p: Parser, char: string, pending_with_char: string): void {
  switch (char) {
    case "`":
      if (pending_with_char.length === p.fence_start + (pending_head(p) === " " ? 1 : 0)) {
        add_text(p);
        end_token(p);
        p.pending = "";
        p.fence_start = 0;
      } else {
        hold(p, char);
      }
      return;
    case "\n":
      p.textBuf += p.pending;
      p.pending = "";
      p.token = LINE_BREAK;
      p.blockquote_idx = 0;
      add_text(p);
      return;
    case " ":
      p.textBuf += p.pending;
      p.pending = char;
      return;
    default:
      p.textBuf += pending_with_char;
      p.pending = "";
  }
}

export function handleMaybeTask(p: Parser, char: string, pending_with_char: string): boolean {
  switch (p.pending.length) {
    case 0:
      if (ITEM_STARTS.has(char)) {
        // An item's first line may open a block: a fence, a heading, a quote, a list (CommonMark 5.2).
        p.item_start = true;
        p.indent_len = open_columns(p);
        p.token = LINE_BREAK;
        p.pending = char;
        return true;
      }
      if (char !== "[") {
        break;
      }
      p.pending = pending_with_char;
      return true;
    case 1:
      if (char !== " " && char !== "x") {
        break;
      }
      p.pending = pending_with_char;
      return true;
    case 2:
      if (char !== "]") {
        break;
      }
      p.pending = pending_with_char;
      return true;
    case 3:
      if (char !== " ") {
        break;
      }
      emit_leaf(p, CHECKBOX, p.pending[1] === "x" ? CHECKED : undefined);
      p.pending = " ";
      return true;
  }
  p.token = p.tokens[p.len] as Token;
  p.pending = "";
  p.write(p, pending_with_char);
  return true;
}

export function handleStrong(p: Parser, char: string): boolean {
  const isUnd = p.token === STRONG_UND;
  const symbol = isUnd ? "_" : "*";
  const italic = isUnd ? ITALIC_UND : ITALIC_AST;

  if (symbol === p.pending) {
    if (symbol === char) {
      add_text(p);
      end_token(p);
      p.pending = "";
      return true;
    }
    // Same delimiter-run rule as handleCommon, on the nested open only: the close above must stay
    // ungated, or `__run_progress__` would never close. Falling through leaves the `_` to
    // handleCommon's literal path.
    if (isUnd && prev_is_word_char(p)) {
      return false;
    }
    add_text(p);
    add_inline_token(p, italic, symbol);
    p.pending = char;
    return true;
  }
  return false;
}

export function handleItalic(p: Parser, char: string, pending_with_char: string): boolean {
  const isUnd = p.token === ITALIC_UND;
  const symbol = isUnd ? "_" : "*";
  const strong = isUnd ? STRONG_UND : STRONG_AST;

  switch (p.pending) {
    case symbol:
      if (symbol === char) {
        if (p.tokens[p.len - 1] === strong) {
          p.pending = pending_with_char;
        } else if (isUnd && prev_is_word_char(p)) {
          // Same rule again, on the nested open. handleCommon cannot be delegated to here: it grows
          // `pending` to `__`, which the next character reads as "close both" and fires two
          // end_token calls against one open token. Consume the run as text instead.
          p.textBuf += pending_with_char;
          p.pending = "";
        } else {
          add_text(p);
          add_inline_token(p, strong, symbol + symbol);
          p.pending = "";
        }
      } else if (isUnd && prev_is_word_char(p) && is_word_char(char)) {
        // CommonMark 6.2 rule 6: a `_` run with a word character on both sides is both left- and
        // right-flanking, so it cannot close either.
        p.textBuf += p.pending;
        p.pending = char;
      } else {
        add_text(p);
        end_token(p);
        p.pending = char;
      }
      return true;
    case symbol + symbol: {
      const italic = isUnd ? ITALIC_UND : ITALIC_AST;
      add_text(p);
      end_token(p);
      end_token(p);
      if (symbol !== char) {
        add_inline_token(p, italic, symbol);
        p.pending = char;
      } else {
        p.pending = "";
      }
      return true;
    }
  }
  return false;
}

export function handleMaybeEqBlock(p: Parser, char: string): void {
  if (char === "\n" && !p.at_end) {
    add_text(p);
    if (!add_token(p, EQUATION_BLOCK)) {
      // Past the cap the opener is literal text, and the token that would have consumed the rest of
      // the expression does not exist.
      p.token = p.tokens[p.len] as Token;
      p.textBuf += p.pending + char;
      p.pending = "";
      return;
    }
    p.pending = "";
  } else {
    p.token = p.tokens[p.len] as Token;
    // `\[` is an escaped bracket; `$$` is two dollar signs.
    p.textBuf += p.pending.startsWith("\\") ? "[" : p.pending;
    p.pending = "";
    p.write(p, char);
  }
}

export function handleMaybeURL(p: Parser, char: string, pending_with_char: string): void {
  if (pending_with_char === "http://" || pending_with_char === "https://") {
    add_text(p);
    if (!add_token(p, RAW_URL)) {
      // Past the cap the scheme is text like the rest of the line.
      p.token = p.tokens[p.len] as Token;
      p.textBuf += pending_with_char;
      p.pending = "";
      return;
    }
    p.pending = pending_with_char;
    p.textBuf = pending_with_char;
    p.url_tail = "";
    p.url_sep = false;
    return;
  }
  const http = "http:/";
  const https = "https:/";
  if (http[p.pending.length] === char || https[p.pending.length] === char) {
    p.pending = pending_with_char;
    return;
  }
  p.token = p.tokens[p.len] as Token;
  p.write(p, char);
}

/** Index of the innermost open token from `wanted`, reachable through inline tokens only, or -1.
 *  Used where a structural delimiter has to win over an inline token that never closed:
 *  CommonMark resolves a link before emphasis, and GFM splits a table row into cells before
 *  parsing inline content at all. */
function enclosing_idx(p: Parser, wanted: readonly Token[]): number {
  for (let i = p.len; i > 0; i -= 1) {
    const token = p.tokens[i] as Token;
    if (wanted.includes(token)) {
      return i;
    }
    if (!is_inline_token(token)) {
      return -1;
    }
  }
  return -1;
}

const LABEL_TOKENS: readonly Token[] = [LINK, IMAGE];
const CELL_TOKENS: readonly Token[] = [TABLE_CELL];

/** CommonMark 2.4: a backslash escapes only ASCII punctuation, and is a literal before anything
 *  else. */
function is_ascii_punctuation(ch: string): boolean {
  const cc = ch.charCodeAt(0);
  return (
    ch.length === 1 &&
    ((cc >= 33 && cc <= 47) ||
      (cc >= 58 && cc <= 64) ||
      (cc >= 91 && cc <= 96) ||
      (cc >= 123 && cc <= 126))
  );
}

/** An escaped character as the destination or title keeps it. `decode_entities` runs over the
 *  whole value later, so an escaped `&` is spelled `&amp;` to stay a literal `&`. */
function unescaped(ch: string): string {
  return ch === "&" ? "&amp;" : ch;
}

/** Where a `DestScan` is in the run after `](`. */
const DEST_START = 0;
const DEST_ANGLE = 1;
const DEST_BARE = 2;
const DEST_GAP = 3;
const DEST_TITLE = 4;
const DEST_AFTER_TITLE = 5;
/** Not a destination and title: a closing `)` takes the whole run as the URL. */
const DEST_WHOLE = 6;
/** A bare destination left a `(` open before whitespace, so no `)` closes it. */
const DEST_STUCK = 7;

function new_dest(): DestScan {
  return {
    phase: DEST_START,
    url: "",
    title: "",
    depth: 0,
    escaped: false,
    spaced: false,
    closer: "",
  };
}

function is_space_or_tab(ch: string): boolean {
  return ch === " " || ch === "\t";
}

/** Reads one character of the run. */
function dest_feed(d: DestScan, ch: string): void {
  if (d.escaped) {
    d.escaped = false;
    if (is_ascii_punctuation(ch)) {
      if (d.phase === DEST_TITLE) {
        d.title += unescaped(ch);
      } else {
        d.url += unescaped(ch);
      }
      return;
    }
    if (d.phase === DEST_TITLE) {
      d.title += "\\";
    } else {
      d.url += "\\";
    }
  } else if (
    ch === "\\" &&
    (d.phase === DEST_ANGLE || d.phase === DEST_BARE || d.phase === DEST_TITLE)
  ) {
    d.escaped = true;
    return;
  }
  switch (d.phase) {
    case DEST_START:
      if (ch === "<") {
        d.phase = DEST_ANGLE;
        return;
      }
      d.phase = DEST_BARE;
      dest_feed(d, ch);
      return;
    case DEST_ANGLE:
      if (ch === ">") {
        d.phase = DEST_GAP;
        return;
      }
      d.url += ch;
      return;
    case DEST_BARE:
      if (is_space_or_tab(ch)) {
        d.phase = d.depth > 0 ? DEST_STUCK : DEST_GAP;
        d.spaced = true;
        return;
      }
      if (ch === "(") {
        d.depth += 1;
      } else if (ch === ")") {
        d.depth -= 1;
      }
      d.url += ch;
      return;
    case DEST_GAP:
      if (is_space_or_tab(ch)) {
        d.spaced = true;
        return;
      }
      d.closer = ch === "(" ? ")" : ch === '"' || ch === "'" ? ch : "";
      // A title must be separated from the destination; `<a>"t"` is one URL.
      d.phase = d.closer !== "" && d.spaced ? DEST_TITLE : DEST_WHOLE;
      return;
    case DEST_TITLE:
      if (ch === d.closer) {
        d.phase = DEST_AFTER_TITLE;
      } else {
        d.title += ch;
      }
      return;
    case DEST_AFTER_TITLE:
      if (!is_space_or_tab(ch)) {
        d.phase = DEST_WHOLE;
      }
      return;
    default:
      return;
  }
}

/** Whether a `)` read now belongs to the run instead of closing the link: escaped, inside `<…>`,
 *  after an unbalanced `(`, or as the closer of a `(…)` title. */
function dest_keeps_paren(d: DestScan): boolean {
  if (d.escaped) {
    return true;
  }
  switch (d.phase) {
    case DEST_ANGLE:
    case DEST_STUCK:
      return true;
    case DEST_BARE:
      return d.depth > 0;
    case DEST_TITLE:
      return d.closer === ")";
    default:
      return false;
  }
}

export function handleLinkOrImage(p: Parser, char: string, pending_with_char: string): boolean {
  if (p.dest !== null) {
    const d = p.dest;
    if (char !== ")" || dest_keeps_paren(d)) {
      dest_feed(d, char);
      hold(p, char);
      return true;
    }
    const whole = d.phase === DEST_WHOLE || (d.phase === DEST_TITLE && d.closer !== ")");
    const type = p.token === LINK ? HREF : SRC;
    // Decoded here, before the sink's gate judges it: see `decode_entities`.
    p.sink.attr(type, decode_entities(whole ? p.pending.slice(2) : d.url));
    if (d.phase === DEST_AFTER_TITLE) {
      p.sink.attr(TITLE, decode_entities(d.title));
    }
    end_token(p);
    p.pending = "";
    return true;
  }
  // CommonMark 6.3 allows balanced brackets in a label, so the label ends at a `]` only when no `[`
  // is open.
  if (p.pending === "[") {
    p.link_depth += 1;
    p.textBuf += p.pending;
    p.pending = char;
    return true;
  }
  if (p.pending === "]") {
    if (p.link_depth > 0) {
      p.link_depth -= 1;
      p.textBuf += p.pending;
      p.pending = char;
      return true;
    }
    add_text(p);
    if (char === "(") {
      p.pending = pending_with_char;
      p.dest = new_dest();
    } else {
      // No destination, so this was never a link: the sink restores the `[` as text.
      end_token_unresolved(p);
      p.textBuf += "]";
      p.pending = char;
    }
    return true;
  }
  return false;
}

// Characters a bare URL may not END on: the markdown emphasis and code delimiters, plus the
// trailing punctuation GFM already trims. ASCII parentheses are absent deliberately — trimming one
// needs GFM's balance rule, and without it a Wikipedia disambiguation link is cut short.
const RAW_URL_TAIL = new Set(["*", "_", "~", "`", ".", ",", ":", ";", "!", "?", "'", '"']);

/** CJK punctuation: U+3000-U+303F and U+FF00-U+FF65. */
function isCJKPunctuation(ch: string): boolean {
  const cc = ch.charCodeAt(0);
  return (cc >= 0x3000 && cc <= 0x303f) || (cc >= 0xff00 && cc <= 0xff65);
}

/** The CJK marks that separate clauses rather than end sentences. Sentence enders (`。．！？…｡`) are
 *  deliberately absent: a URL genuinely containing one is indistinguishable from a sentence that
 *  ends after a URL, so the only honest answer there is to leave the run alone. */
const CJK_SEPARATOR = new Set(["，", "、", "；", "：", "､"]);

/** Split an accumulated bare URL into the href and the trailing run that is not part of it.
 *  Computed from the WHOLE accumulated pending and only at its END: `.` and `,` are legal inside
 *  a path, so terminating on one would break every domain name, and a trim derived from the
 *  incoming character alone would not be chunk-size invariant, which the property and fuzz
 *  suites assert. */
function splitRawURLTail(pending: string): { url: string; tail: string } {
  let end = pending.length;
  while (end > 0) {
    const ch = pending.charAt(end - 1);
    if (!RAW_URL_TAIL.has(ch) && !isCJKPunctuation(ch)) {
      break;
    }
    end -= 1;
  }
  return { url: pending.slice(0, end), tail: pending.slice(end) };
}

/** Close the open RAW_URL at the last character that can belong to it, then re-feed the trimmed
 *  tail plus `trailing`. */
function endRawURL(p: Parser, trailing: string): void {
  const { url, tail } = splitRawURLTail(p.pending);
  p.sink.attr(HREF, url);
  // `textBuf` holds only the href half (see below), so the label is cut at the same point as the
  // href.
  add_text(p);
  end_token(p);
  p.pending = "";
  for (const c of tail + trailing) {
    p.write(p, c);
  }
}

/** `url_tail` is `splitRawURLTail(pending).tail`, kept per character (see `Parser`). */
export function handleRawURL(p: Parser, char: string): void {
  if (char === " " || char === "\n" || char === "\\") {
    endRawURL(p, char);
  } else if (RAW_URL_TAIL.has(char) || isCJKPunctuation(char)) {
    // A CJK separator followed by a backtick proves the URL ended: RFC 3986 excludes the backtick.
    if (char === "`" && p.url_sep) {
      endRawURL(p, char);
      return;
    }
    // Held, not appended: the sink cannot take text back and every chunk boundary flushes
    // `textBuf`, so a possible tail waits until the URL is known to continue past it.
    hold(p, char);
    p.url_tail += char;
    p.url_sep = CJK_SEPARATOR.has(char);
  } else {
    // The URL continues, so everything held is part of it after all.
    p.textBuf += p.url_tail + char;
    hold(p, char);
    p.url_tail = "";
    p.url_sep = false;
  }
}

/** The `<br…>` shapes the angle deferral accepts, held or complete. */
const BR_CANDIDATE = /^<br *\/? *$/u;

/** CommonMark 6.5's absolute URI: a scheme of an ASCII letter then one to thirty-one of letter,
 *  digit, `+`, `.` or `-`, a `:`, then anything but whitespace, `<` or `>`. */
const URI_AUTOLINK = /^[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*$/u;

/** CommonMark 6.5's email autolink. */
const EMAIL_AUTOLINK =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/u;

function autolink_url(content: string): string | null {
  if (URI_AUTOLINK.test(content)) {
    return content;
  }
  return EMAIL_AUTOLINK.test(content) ? "mailto:" + content : null;
}

/** Whether `char` can extend the held angle-bracket candidate. An autolink's content admits no
 *  whitespace, `<` or `>`; the one exception is the space in `<br />`. */
function can_continue_angle(pending: string, char: string): boolean {
  if (char === " ") {
    return BR_CANDIDATE.test(pending);
  }
  return char !== "\t" && char !== "\n" && char !== "<";
}

/** Hold an angle-bracket run until the `>` decides what it is: a line break, an autolink, or
 *  escaped text. */
export function handleMaybeAngle(p: Parser, char: string, pending_with_char: string): boolean {
  if (char === ">") {
    if (BR_CANDIDATE.test(p.pending)) {
      add_text(p);
      p.token = p.tokens[p.len] as Token;
      emit_leaf(p, LINE_BREAK);
      p.pending = "";
      return true;
    }
    // Decoded before the shape test and before the href, for the same reason a destination is: a
    // gate that only ever sees the encoded spelling passes it.
    const label = decode_entities(p.pending.slice(1));
    const url = autolink_url(label);
    if (url !== null && enclosing_idx(p, LABEL_TOKENS) === -1) {
      add_text(p);
      p.token = p.tokens[p.len] as Token;
      if (!has_token_room(p.len, 1)) {
        // Past the cap the run is the text that was typed, brackets included.
        p.textBuf += p.pending + char;
        p.pending = "";
        return true;
      }
      add_inline_token(p, LINK, "<");
      p.textBuf += label;
      add_text(p);
      p.sink.attr(HREF, url);
      end_token(p);
      p.pending = "";
      return true;
    }
  } else if (can_continue_angle(p.pending, char)) {
    p.pending = pending_with_char;
    return true;
  }
  p.token = p.tokens[p.len] as Token;
  p.textBuf += "<";
  p.pending = p.pending.slice(1);
  p.write(p, char);
  return true;
}

/** Hold a candidate entity or numeric character reference from its `&` until a `;` decodes it or
 *  a character rules it out. A decoded character goes straight to `textBuf` and is NEVER re-fed
 *  through `p.write`. */
export function handleMaybeEntity(p: Parser, char: string, pending_with_char: string): boolean {
  if (char === ";") {
    const decoded = decode_entity(p.pending.slice(1));
    p.token = p.tokens[p.len] as Token;
    p.textBuf += decoded ?? pending_with_char;
    p.pending = "";
    return true;
  }
  if (can_continue_entity(p.pending, char)) {
    p.pending = pending_with_char;
    return true;
  }
  // Not a reference after all, so the run is the text that was typed. Re-feed the disqualifying
  // character rather than consuming it, the recovery shape handleMaybeURL already uses.
  p.token = p.tokens[p.len] as Token;
  p.textBuf += p.pending;
  p.pending = "";
  p.write(p, char);
  return true;
}

export function handleCommon(p: Parser, char: string, pending_with_char: string): boolean {
  const head = pending_head(p);
  switch (head) {
    case "\\":
      if (p.token === IMAGE || p.token === EQUATION_BLOCK || p.token === EQUATION_INLINE) {
        break;
      }
      switch (char) {
        case "(":
          add_text(p);
          add_inline_token(p, EQUATION_INLINE, "\\(");
          p.pending = "";
          return true;
        case "[":
          p.token = MAYBE_EQ_BLOCK;
          p.pending = pending_with_char;
          return true;
        case "\n":
          if (p.at_end) {
            // Nothing follows the synthetic newline, so this is a literal backslash rather than a
            // hard line break.
            p.textBuf += p.pending;
          }
          p.pending = char;
          return true;
        default: {
          const cc = char.charCodeAt(0);
          p.pending = "";
          p.textBuf +=
            is_digit(cc) || (cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122)
              ? pending_with_char
              : char;
          return true;
        }
      }
    case "\n":
      switch (p.token) {
        case IMAGE:
        case EQUATION_BLOCK:
        case EQUATION_INLINE:
          break;
        case HEADING_1:
        case HEADING_2:
        case HEADING_3:
        case HEADING_4:
        case HEADING_5:
        case HEADING_6: {
          add_text(p);
          // A heading is never continued lazily, so in an item the next line decides as after a
          // blank line.
          const item = gap_item(p);
          end_tokens_to_len(p, Math.max(p.blockquote_idx, item));
          if (item !== -1) {
            p.item_gap = true;
            p.token = LINE_BREAK;
          }
          p.blockquote_idx = 0;
          p.pending = char;
          return true;
        }
        default:
          add_text(p);
          p.pending = char;
          p.token = LINE_BREAK;
          p.blockquote_idx = 0;
          return true;
      }
      break;
    case "<":
      if (p.token !== IMAGE && p.token !== EQUATION_BLOCK && p.token !== EQUATION_INLINE) {
        add_text(p);
        p.pending = pending_with_char;
        p.token = MAYBE_ANGLE;
        return true;
      }
      break;
    case "&":
      // Not guarded on IMAGE: an image label is alt text, which CommonMark decodes too. The
      // equation tokens hold TeX source, not markdown.
      if (
        p.token !== EQUATION_BLOCK &&
        p.token !== EQUATION_INLINE &&
        can_continue_entity(p.pending, char)
      ) {
        add_text(p);
        p.pending = pending_with_char;
        p.token = MAYBE_ENTITY;
        return true;
      }
      break;
    case "`":
      if (p.token === IMAGE) {
        break;
      }
      if (char === "\n") {
        // A code span cannot open on a line's last character, so the held backticks are literal
        // text.
        p.fence_start = 0;
        break;
      }
      if (char === "`") {
        p.fence_start += 1;
        hold(p, char);
      } else {
        p.fence_start += 1;
        add_text(p);
        // The space after the opening run is dropped from the content, so it is part of the
        // delimiter for restoration purposes.
        add_inline_token(p, CODE_INLINE, "`".repeat(p.fence_start) + (char === " " ? " " : ""));
        if (char !== " " && char !== "\n") {
          p.textBuf += char;
        }
        p.pending = "";
      }
      return true;
    case "_":
    case "*": {
      if (
        p.token === IMAGE ||
        p.token === EQUATION_BLOCK ||
        p.token === EQUATION_INLINE ||
        p.token === STRONG_AST
      ) {
        break;
      }
      const symbol = head;
      const isUnd = symbol === "_";
      const italic = isUnd ? ITALIC_UND : ITALIC_AST;
      const strong = isUnd ? STRONG_UND : STRONG_AST;
      // CommonMark 6.2: a `_` run preceded by a word character is both left- and right-flanking, so
      // it cannot open emphasis whatever follows — which is why this needs the lookbehind only.
      const undBlocked = isUnd && prev_is_word_char(p);

      if (p.pending.length === 1) {
        if (symbol === char) {
          p.pending = pending_with_char;
          return true;
        }
        if (char !== " " && char !== "\n" && !undBlocked) {
          add_text(p);
          add_inline_token(p, italic, symbol);
          p.pending = char;
          return true;
        }
      } else {
        if (undBlocked) {
          break;
        }
        if (symbol === char) {
          add_text(p);
          add_inline_token(p, strong, symbol + symbol);
          add_inline_token(p, italic, symbol);
          p.pending = "";
          return true;
        }
        if (char !== " " && char !== "\n") {
          add_text(p);
          add_inline_token(p, strong, symbol + symbol);
          p.pending = char;
          return true;
        }
      }
      break;
    }
    case "~":
      if (p.token !== IMAGE && p.token !== STRIKE) {
        if (p.pending === "~") {
          if (char === "~") {
            p.pending = pending_with_char;
            return true;
          }
        } else if (char !== " " && char !== "\n") {
          add_text(p);
          add_inline_token(p, STRIKE, "~~");
          p.pending = char;
          return true;
        }
      }
      break;
    case "$":
      // Inside an open equation a closing `$$` must not reach the opener below, which would open a
      // nested block that never closes.
      if (
        p.token !== IMAGE &&
        p.token !== STRIKE &&
        p.token !== EQUATION_BLOCK &&
        p.token !== EQUATION_INLINE &&
        p.pending === "$"
      ) {
        if (char === "$") {
          p.token = MAYBE_EQ_BLOCK;
          p.pending = pending_with_char;
          return true;
        }
        if (is_delimiter_or_number(char.charCodeAt(0))) {
          break;
        }
        add_text(p);
        add_inline_token(p, EQUATION_INLINE, "$");
        p.pending = char;
        return true;
      }
      break;
    case "[":
      if (
        p.token !== IMAGE &&
        p.token !== LINK &&
        p.token !== EQUATION_BLOCK &&
        p.token !== EQUATION_INLINE &&
        char !== "]" &&
        // A label cannot open on the last character of a line; the held `[` is literal text.
        char !== "\n"
      ) {
        add_text(p);
        add_inline_token(p, LINK, "[");
        p.link_depth = 0;
        p.pending = char;
        return true;
      }
      break;
    case "]":
      // CommonMark resolves a link before emphasis (6.3 before 6.2), so a `]` ends the label even
      // when an inline token opened inside it never closed. Without this the label end is never
      // seen, the link loses its href and the destination shows up as visible text.
      if (p.pending === "]" && p.link_depth === 0) {
        const label_idx = enclosing_idx(p, LABEL_TOKENS);
        if (label_idx !== -1) {
          add_text(p);
          end_tokens_to_len(p, label_idx);
          return handleLinkOrImage(p, char, pending_with_char);
        }
      }
      break;
    case "|":
      // GFM splits a row into cells BEFORE parsing their inline content, so a `|` ends the cell
      // even when an inline token opened inside it never closed.
      if (p.pending === "|") {
        const cell_idx = enclosing_idx(p, CELL_TOKENS);
        if (cell_idx !== -1) {
          add_text(p);
          end_tokens_to_len(p, cell_idx);
          return handleTableCell(p, char);
        }
      }
      break;
    case "!":
      if (p.token !== IMAGE && char === "[") {
        add_text(p);
        add_inline_token(p, IMAGE, "![");
        p.link_depth = 0;
        p.pending = "";
        return true;
      }
      break;
    case " ":
      if (p.pending.length === 1 && char === " ") {
        return true; // trim consecutive spaces
      }
      break;
    default:
      break;
  }
  return false;
}
