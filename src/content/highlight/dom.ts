/**
 * dom.ts — tokens written into an element as text nodes and spans, never as
 * markup, so no text in the source can become an element.
 * @module
 */

import { tokenize } from "./tokenize.js";

/** A half-open range of offsets into the source. */
export interface MarkRange {
  readonly start: number;
  readonly end: number;
}

export interface HighlightOptions {
  /** Ranges to mark, ascending and not overlapping, such as a diff's changed words. */
  readonly marks?: readonly MarkRange[];
  /** A class each marked piece takes beside its `data-mark` attribute. */
  readonly markClass?: string;
}

/**
 * Replaces `el`'s children with `code`, each token of the language `lang`
 * resolves to in a `span[data-token="<kind>"]`, uncoloured text as bare text
 * nodes. A token a mark's edge crosses is split, each piece keeping its kind,
 * and a marked piece is a `span[data-mark]` (with `markClass`); one both
 * coloured and marked is one span with both. An unknown or empty `lang`
 * writes the text uncoloured, its marks still split out.
 */
export function highlightInto(
  el: Element,
  code: string,
  lang: string,
  options: HighlightOptions = {},
): void {
  const doc = el.ownerDocument;
  const marks = (options.marks ?? []).filter((m) => m.end > m.start);
  const out = doc.createDocumentFragment();
  let at = 0;
  let m = 0;
  for (const t of tokenize(code, lang)) {
    const end = at + t.text.length;
    let cut = at;
    while (cut < end) {
      while (m < marks.length && (marks[m]?.end ?? 0) <= cut) {
        m++;
      }
      const mark = marks[m];
      const inMark = mark !== undefined && mark.start <= cut;
      const stop = Math.min(end, inMark ? mark.end : (mark?.start ?? end));
      const text = doc.createTextNode(code.slice(cut, stop));
      if (t.kind === null && !inMark) {
        out.append(text);
      } else {
        const span = doc.createElement("span");
        if (t.kind !== null) {
          span.setAttribute("data-token", t.kind);
        }
        if (inMark) {
          span.setAttribute("data-mark", "");
          if (options.markClass !== undefined && options.markClass !== "") {
            span.setAttribute("class", options.markClass);
          }
        }
        span.append(text);
        out.append(span);
      }
      cut = stop;
    }
    at = end;
  }
  el.replaceChildren(out);
}
