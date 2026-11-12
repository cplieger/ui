import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";

import { highlightInto, tokenize } from "./highlight.js";
import type { MarkRange, TokenKind } from "./highlight.js";

let host: HTMLElement | undefined;

function code(): HTMLElement {
  host = document.createElement("code");
  document.body.append(host);
  return host;
}

afterEach(() => {
  host?.remove();
  host = undefined;
});

/** Each child as `[token kind, marked, text]`, or `["text", text]` for a bare text node. */
function pieces(
  el: Element,
): (readonly [string | null, boolean, string] | readonly ["text", string])[] {
  return Array.from(el.childNodes, (n) => {
    if (n instanceof Text) {
      return ["text", n.data] as const;
    }
    const span = n as Element;
    return [
      span.getAttribute("data-token"),
      span.hasAttribute("data-mark"),
      span.textContent,
    ] as const;
  });
}

describe("highlightInto", () => {
  it("writes each coloured token as a span with its kind and leaves the rest as text", () => {
    const el = code();
    highlightInto(el, 'x := "s" // c', "go");
    expect(pieces(el)).toEqual([
      ["text", "x "],
      ["punctuation", false, ":"],
      ["punctuation", false, "="],
      ["text", " "],
      ["string", false, '"s"'],
      ["text", " "],
      ["comment", false, "// c"],
    ]);
  });

  it("puts only data-token on a span", () => {
    const el = code();
    highlightInto(el, "return 1", "go");
    for (const span of el.querySelectorAll("span")) {
      expect(span.getAttributeNames()).toEqual(["data-token"]);
    }
  });

  it("replaces what the element held", () => {
    const el = code();
    el.append(document.createElement("b"), "old");
    highlightInto(el, "a", "go");
    expect(el.childNodes).toHaveLength(1);
    expect(el.textContent).toBe("a");
  });

  it("makes no element from markup in the source", () => {
    const el = code();
    const source = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    highlightInto(el, source, "html");
    expect(el.querySelector("img, script")).toBeNull();
    expect(el.textContent).toBe(source);
    expect(Array.from(el.children, (c) => c.localName).every((n) => n === "span")).toBe(true);
  });

  it("writes an unknown or empty language as one text node", () => {
    for (const lang of ["", "klingon", "md", "constructor"]) {
      const el = code();
      highlightInto(el, "if x { return }", lang);
      expect(pieces(el)).toEqual([["text", "if x { return }"]]);
      el.remove();
    }
  });

  it("writes nothing for empty source", () => {
    const el = code();
    el.append("old");
    highlightInto(el, "", "go");
    expect(el.childNodes).toHaveLength(0);
  });
});

describe("highlightInto with marks", () => {
  it("is the unmarked output when there are no marks", () => {
    const a = code();
    highlightInto(a, 'f("abc") // c', "go");
    const unmarked = pieces(a);
    highlightInto(a, 'f("abc") // c', "go", { marks: [], markClass: "m" });
    expect(pieces(a)).toEqual(unmarked);
  });

  it("splits a token at a mark's edges, each piece keeping its kind", () => {
    const el = code();
    highlightInto(el, '"abcd"', "go", { marks: [{ start: 2, end: 4 }], markClass: "m" });
    expect(pieces(el)).toEqual([
      ["string", false, '"a'],
      ["string", true, "bc"],
      ["string", false, 'd"'],
    ]);
    expect(el.querySelector("[data-mark]")?.getAttribute("class")).toBe("m");
  });

  it("puts kind and mark on one span when a mark covers a whole token", () => {
    const el = code();
    highlightInto(el, 'x := "s"', "go", { marks: [{ start: 5, end: 8 }], markClass: "m" });
    const marked = el.querySelector("[data-mark]");
    expect(marked?.getAttribute("data-token")).toBe("string");
    expect(marked?.textContent).toBe('"s"');
    expect(marked?.getAttributeNames().sort()).toEqual(["class", "data-mark", "data-token"]);
  });

  it("marks uncoloured text with a span that has no kind", () => {
    const el = code();
    highlightInto(el, "abcd", "", { marks: [{ start: 1, end: 3 }] });
    expect(pieces(el)).toEqual([
      ["text", "a"],
      [null, true, "bc"],
      ["text", "d"],
    ]);
    expect(el.querySelector("[data-mark]")?.hasAttribute("class")).toBe(false);
  });

  it("carries a mark across tokens", () => {
    const el = code();
    highlightInto(el, "return 1", "go", { marks: [{ start: 4, end: 8 }] });
    expect(pieces(el)).toEqual([
      ["keyword", false, "retu"],
      ["keyword", true, "rn"],
      [null, true, " "],
      ["number", true, "1"],
    ]);
  });

  it("ignores empty marks", () => {
    const el = code();
    highlightInto(el, "ab", "", { marks: [{ start: 1, end: 1 }] });
    expect(pieces(el)).toEqual([["text", "ab"]]);
  });
});

/** Ascending, non-overlapping ranges inside `[0, len]`. */
const marksWithin = (len: number): fc.Arbitrary<MarkRange[]> =>
  fc.uniqueArray(fc.integer({ min: 0, max: len }), { maxLength: 8 }).map((cuts) => {
    const sorted = cuts.sort((a, b) => a - b);
    const out: MarkRange[] = [];
    for (let i = 0; i + 1 < sorted.length; i += 2) {
      out.push({ start: sorted[i] ?? 0, end: sorted[i + 1] ?? 0 });
    }
    return out;
  });

describe("highlightInto, for any source and marks", () => {
  it("gives each character the kind tokenize gives it, and marks exactly the marked ones", () => {
    const el = code();
    const source = fc.string({ unit: fc.constantFrom(..."ab1 \"'/*#\n{}:-+@"), maxLength: 40 });
    fc.assert(
      fc.property(
        source.chain((s) => fc.tuple(fc.constant(s), marksWithin(s.length))),
        fc.constantFrom("go", "py", "yaml", "diff", "html", ""),
        ([s, marks], lang) => {
          highlightInto(el, s, lang, { marks, markClass: "m" });
          const perChar = <T>(text: string, value: T): T[] =>
            Array.from({ length: text.length }, () => value);
          const want: [TokenKind | null, boolean][] = tokenize(s, lang)
            .flatMap((t) => perChar(t.text, t.kind))
            .map((kind, at) => [kind, marks.some((m) => m.start <= at && at < m.end)]);
          const have = Array.from(el.childNodes).flatMap((n) => {
            const span = n instanceof Element ? n : null;
            return perChar(n.textContent ?? "", [
              span?.getAttribute("data-token") ?? null,
              span?.hasAttribute("data-mark") ?? false,
            ]);
          });
          expect(el.textContent).toBe(s);
          expect(have).toEqual(want);
        },
      ),
    );
  });
});
