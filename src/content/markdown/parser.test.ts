import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createParser } from "./parser.js";
import type { AttrName, Kind, Sink } from "./parser.js";

interface Trace {
  kinds: Kind[];
  closes: number;
  attrs: { name: AttrName; value: string }[];
  texts: string[];
  ops: string[];
  /** The lowest open depth seen after an operation, and whether it ever
   *  reached zero before the last operation. */
  minDepth: number;
  emptiedEarly: boolean;
}

function tracingSink(t: Trace): Sink {
  let depth = 0;
  return {
    open(kind) {
      t.kinds.push(kind);
      t.ops.push(`open:${kind}`);
      depth += 1;
    },
    close() {
      t.closes += 1;
      t.ops.push("close");
      depth -= 1;
      t.minDepth = Math.min(t.minDepth, depth);
    },
    text(s) {
      t.texts.push(s);
      t.ops.push(`text:${s}`);
      if (depth === 0) {
        t.emptiedEarly = true;
      }
    },
    attr(name, value) {
      t.attrs.push({ name, value });
      t.ops.push(`attr:${name}=${value}`);
    },
  };
}

function trace(input: string, chunkLen = input.length || 1): Trace {
  const t: Trace = {
    kinds: [],
    closes: 0,
    attrs: [],
    texts: [],
    ops: [],
    minDepth: 0,
    emptiedEarly: false,
  };
  const p = createParser(tracingSink(t));
  for (let i = 0; i < input.length; i += chunkLen) {
    p.write(input.slice(i, i + chunkLen));
  }
  p.end();
  return t;
}

function attrs(t: Trace, name: AttrName): string[] {
  return t.attrs.filter((a) => a.name === name).map((a) => a.value);
}

/** Every open closed exactly once, never more, and no text outside a token. */
function expectBalanced(t: Trace): void {
  expect(t.closes).toBe(t.kinds.length);
  expect(t.minDepth).toBeGreaterThanOrEqual(0);
  expect(t.emptiedEarly).toBe(false);
}

/** Text may arrive in more pieces when chunked; everything else is identical. */
function shape(t: Trace): string[] {
  return t.ops.filter((op) => !op.startsWith("text:")).concat(t.texts.join(""));
}

/** The operation indexes after which no token is open. */
function emptyAt(t: Trace): number[] {
  const at: number[] = [];
  let depth = 0;
  t.ops.forEach((op, i) => {
    if (op.startsWith("open:")) {
      depth += 1;
    } else if (op === "close") {
      depth -= 1;
      if (depth === 0) {
        at.push(i);
      }
    }
  });
  return at;
}

function stringFromChars(...chars: string[]): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...chars), { minLength: 0, maxLength: 60 })
    .map((arr) => arr.join(""));
}

function feedCharByChar(input: string): Trace {
  return trace(input, 1);
}

describe("the sink contract", () => {
  it.each([
    ["backtick sequences", stringFromChars("`", "a", "\n", " ", "~")],
    ["pipe and escape patterns", stringFromChars("|", "\\", "-", " ", "\n", "a", ":")],
    ["heading and rule ambiguity", stringFromChars("#", "-", "*", "_", " ", "\n", "a")],
    ["any text", fc.string({ maxLength: 80 })],
  ])("keeps every open balanced for %s", (_name, arb) => {
    fc.assert(
      fc.property(arb, (input) => {
        expectBalanced(feedCharByChar(input));
      }),
      { numRuns: 200 },
    );
  });

  it("never interprets fence content as markdown", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 50 }), (content) => {
        const t = trace("```\n" + content.replace(/`/gu, "") + "\n```\n");
        expect(t.kinds).toEqual(["code"]);
        expectBalanced(t);
      }),
      { numRuns: 100 },
    );
  });

  it("closes every open token at end, innermost first", () => {
    // A tight list item holds its text directly, with no paragraph.
    const t = trace("> - a **b *c");
    expect(t.kinds).toEqual(["blockquote", "list-unordered", "list-item", "strong", "emphasis"]);
    expect(t.ops.slice(-7)).toEqual([
      "attr:unclosed=*",
      "close",
      "attr:unclosed=**",
      "close",
      "close",
      "close",
      "close",
    ]);
  });

  it("does nothing on a write or an end after end", () => {
    const t: Trace = {
      kinds: [],
      closes: 0,
      attrs: [],
      texts: [],
      ops: [],
      minDepth: 0,
      emptiedEarly: false,
    };
    const p = createParser(tracingSink(t));
    p.write("a");
    p.end();
    const after = [...t.ops];
    p.write("b");
    p.end();
    expect(t.ops).toEqual(after);
    expect(after).toEqual(["open:paragraph", "text:a", "close"]);
  });

  it("emits leaves as an open and a close", () => {
    expect(trace("a\n\n---\n").ops).toEqual([
      "open:paragraph",
      "text:a",
      "close",
      "open:rule",
      "close",
    ]);
    expect(trace("- [x] done").ops.slice(2, 5)).toEqual([
      "open:checkbox",
      "attr:checked=",
      "close",
    ]);
  });
});

describe("fence language", () => {
  it.each([
    ["```go\nx\n```", ["go"]],
    ["```go run\nx\n```", ["go"]],
    ["```  c++ {.x}\nx\n```", ["c++"]],
    ["```&#x67;o\nx\n```", ["go"]],
    ['```js"onmouseover=x\nx\n```', []],
    ['```a b"c\nx\n```', ["a"]],
    ["```" + "a".repeat(33) + "\nx\n```", []],
    ["```" + "a".repeat(32) + "\nx\n```", ["a".repeat(32)]],
    ["```\nx\n```", []],
  ])("%j gives %j", (input, expected) => {
    const t = trace(input);
    expect(attrs(t, "lang")).toEqual(expected);
    expect(t.ops[0]).toBe("open:code");
  });

  it("emits lang right after the code opens", () => {
    expect(trace("```go\nx\n```").ops.slice(0, 2)).toEqual(["open:code", "attr:lang=go"]);
  });

  it("marks a fence the text never closed with its own run", () => {
    expect(attrs(trace("````\nx"), "unclosed")).toEqual(["````"]);
    expect(attrs(trace("> ```\nx\n\nafter"), "unclosed")).toEqual(["```"]);
    expect(attrs(trace("```\nx\n```"), "unclosed")).toEqual([]);
    expect(attrs(trace("    indented"), "unclosed")).toEqual([]);
  });
});

describe("table alignment", () => {
  it("emits start, center, end and empty per column", () => {
    const t = trace("| a | b | c | d |\n| :- | :-: | -: | - |\n| 1 | 2 | 3 | 4 |");
    expect(attrs(t, "align")).toEqual(["start,center,end,"]);
    expect(t.ops.slice(0, 2)).toEqual(["open:table", "attr:align=start,center,end,"]);
  });

  it("emits no alignment when no column asks for one", () => {
    expect(attrs(trace("| a |\n| - |\n| 1 |"), "align")).toEqual([]);
  });
});

describe("link destination grammar", () => {
  it("keeps a raw space in a query in the href", () => {
    expect(attrs(trace("[label](https://x/?a=b c=d)"), "href")).toEqual(["https://x/?a=b c=d"]);
  });

  it("unwraps an angle-bracketed destination", () => {
    expect(attrs(trace("[a](<https://x/a b>)"), "href")).toEqual(["https://x/a b"]);
  });

  it("splits a quoted title off the destination, after the href", () => {
    const t = trace('[a](https://x "t")');
    expect(attrs(t, "href")).toEqual(["https://x"]);
    expect(attrs(t, "title")).toEqual(["t"]);
    expect(t.ops.slice(-4)).toEqual(["attr:href=https://x", "attr:title=t", "close", "close"]);
  });

  it("keeps balanced parentheses in the destination", () => {
    const t = trace("[a](https://en.wikipedia.org/wiki/X_(y))");
    expect(attrs(t, "href")).toEqual(["https://en.wikipedia.org/wiki/X_(y)"]);
    expect(t.texts.join("")).toBe("a");
  });

  it("decodes a reference in the destination once", () => {
    expect(attrs(trace("[a](javascript&#58;alert(1))"), "href")).toEqual(["javascript:alert(1)"]);
    expect(attrs(trace("[a](x&amp;#58;y)"), "href")).toEqual(["x&#58;y"]);
  });

  it("emits an image's alt as its text and its source as src", () => {
    const t = trace("![alt &amp; more](https://x/i.png)");
    expect(t.kinds).toEqual(["paragraph", "image"]);
    expect(t.texts.join("")).toBe("alt & more");
    expect(attrs(t, "src")).toEqual(["https://x/i.png"]);
  });

  it("makes an email autolink a mailto href", () => {
    expect(attrs(trace("<a@b.co>"), "href")).toEqual(["mailto:a@b.co"]);
  });
});

describe("raw URL trailing boundary", () => {
  it("keeps a closing ** out of the href and out of the link text", () => {
    const t = trace("**see https://example.com**");
    expect(attrs(t, "href")).toEqual(["https://example.com"]);
    expect(t.texts.join("")).toBe("see https://example.com");
  });

  it("re-feeds the stripped tail so the emphasis still closes", () => {
    const t = trace("**see https://example.com** plain");
    expect(t.kinds).toEqual(["paragraph", "strong", "link"]);
    expect(attrs(t, "unclosed")).toEqual([]);
    expect(t.texts.join("")).toBe("see https://example.com plain");
  });

  it("keeps CJK punctuation out of the href and renders it as text", () => {
    const t = trace("https://example.com。");
    expect(attrs(t, "href")).toEqual(["https://example.com"]);
    expect(t.texts).toEqual(["https://example.com", "。"]);
  });

  it("keeps a legal trailing path character in the href", () => {
    expect(attrs(trace("https://example.com/a.b,c/d "), "href")).toEqual([
      "https://example.com/a.b,c/d",
    ]);
  });

  it("keeps a closing parenthesis in the href", () => {
    expect(attrs(trace("https://en.wikipedia.org/wiki/Mercury_(planet) "), "href")).toEqual([
      "https://en.wikipedia.org/wiki/Mercury_(planet)",
    ]);
  });

  it("trims a run of trailing punctuation, not just the last character", () => {
    expect(attrs(trace("see https://example.com?!, here"), "href")).toEqual([
      "https://example.com",
    ]);
  });
});

describe("intraword underscore lookbehind across writes", () => {
  it("survives a write boundary that lands on the underscore", () => {
    expect(trace("run_progress", 4).kinds).not.toContain("emphasis");
  });

  it("opens a paragraph-initial underscore after the promotion re-feed", () => {
    expect(trace("_em_").kinds).toEqual(["paragraph", "emphasis"]);
  });

  it("survives a write boundary inside an open __ run", () => {
    expect(trace("__run_progress__", 6).kinds).toEqual(["paragraph", "strong"]);
  });

  it("reads the last code point when a chunk splits a surrogate pair", () => {
    for (let chunkLen = 1; chunkLen <= 8; chunkLen += 1) {
      expect(trace("\u{1F389}_yay_", chunkLen).kinds).toEqual(["paragraph", "emphasis"]);
    }
  });

  it("resets the lookbehind at a soft break under chunking", () => {
    const t = trace("a_b\n_real_\n", 3);
    expect(t.kinds).toEqual(["paragraph", "break", "emphasis"]);
    expect(t.texts.join("")).toBe("a_breal");
  });
});

describe("token-stack saturation", () => {
  const shapes = [
    ">".repeat(23) + " x",
    ">".repeat(200) + " x",
    ">".repeat(1000) + " x",
    "> ".repeat(30) + "x",
    ">".repeat(30) + " ```js`x",
    ">".repeat(30) + " **x",
    ">".repeat(21) + " | a | b |\n| - | - |\n| 1 | 2 |",
    ">".repeat(200) + " | a |\n| - |\n| 1 |",
    "> ".repeat(30) + "| a |\n| - |\n| 1 |",
    "- ".repeat(1024) + "x",
    " ".repeat(1024) + "- x",
    "*".repeat(1024),
  ];

  it.each(shapes)("keeps the operations balanced for %j", (input) => {
    expectBalanced(trace(input));
  });

  it("still keeps the text at saturating depth", () => {
    expect(trace(">".repeat(23) + " x").texts.join("")).toContain("x");
  });

  // Past the cap no block opens, so the whole line is text, markers included.
  const AT_CAP = ">".repeat(23) + " ";
  const bodies = [
    "## head",
    "###### h6",
    "```js\ncode\n```",
    "```\ncode\n```",
    "- item",
    "* item",
    "+ item",
    "1. item",
    "3. item",
    "- [x] item",
    "> deeper",
    "$$\nx\n$$",
    "http://example.com x",
    "    indented",
    "| a |\n| - |\n| 1 |",
  ];

  it.each(bodies)("keeps every character of %j as text at the cap", (body) => {
    const t = trace(AT_CAP + body);
    expect(t.texts.join("").replace(/\n+$/u, "")).toBe(" " + body);
    expect(t.kinds).toEqual(new Array<Kind>(23).fill("blockquote"));
    // A refused token's attribute would land on the enclosing blockquote.
    expect(t.attrs).toEqual([]);
  });

  it.each(bodies)("keeps that text at every chunk size for %j", (body) => {
    const whole = trace(AT_CAP + body);
    for (let chunkLen = 1; chunkLen <= 8; chunkLen += 1) {
      expect(shape(trace(AT_CAP + body, chunkLen))).toEqual(shape(whole));
    }
  });

  it("keeps the whole expression when an equation block does not fit", () => {
    const t = trace(">".repeat(22) + " $$\nx\n$$");
    expect(t.texts.join("")).toContain("$$");
    expect(t.kinds).toEqual([...new Array<Kind>(22).fill("blockquote"), "paragraph", "break"]);
  });

  it("keeps the scheme once when a raw URL does not fit", () => {
    const t = trace(">".repeat(22) + " see http://example.com x");
    expect(t.texts.join("")).toBe("see http://example.com x");
    expect(t.attrs).toEqual([]);
  });
});

describe("chunk-boundary invariance", () => {
  const inputs = [
    "```\nfoo ```\nbar\n",
    "```\nfoo\n    ```\nbar\n",
    "```\nfoo\n`````\nbar\n",
    "[a [b] c](https://e.com)",
    "见 https://example.com/2137，`96ed647b`）",
    "ab<",
    "ab[\ncd",
    "ab`\ncd",
    "| a | b |\n| - | - |\n| 1 | 2 |",
    "| a | b | \n| - | - |\n| 1 | 2 |",
    "| a | b |\n| x |\n| - |\n| 1 |",
    "| a |\n|\t-\t|\n| 1 |",
    "| a \\| b |\n| - |\n| 1 |",
    '[a](http://e.com "t")',
    "[a](http://e.com (t))",
    "[a](http://e.com/x(1))",
    "## heading ##",
    "## heading ## #",
    "1) first\n2) second",
    `${">".repeat(23)} a\n${">".repeat(23)} b`,
    "5 &lt; 6 &amp; 7 &copy;",
    "a &nosuch; b",
    "&#x1F600; emoji",
    "<https://example.com>",
    "Vec<String> in Rust",
    "line<br />next",
    'a [angle](<https://x/a b>) [title](https://x "t") **see https://example.com**, c https://example.com。続き',
    "run_progress shape, tool_call_update as a delta",
    "```go run\nx",
    "a **b",
    "a ` b\nc",
    "[a *b](https://e.com)",
    "an ![img",
  ];

  it.each(inputs)("produces one sequence for %j at every chunk size", (input) => {
    const whole = shape(trace(input));
    for (let chunkLen = 1; chunkLen <= 8; chunkLen += 1) {
      expect(shape(trace(input, chunkLen))).toEqual(whole);
    }
  });
});

describe("unresolved inline tokens report their delimiter", () => {
  const cases: [string, string[]][] = [
    ["a *b", ["*"]],
    ["a _b", ["_"]],
    ["a **b", ["**"]],
    ["a __b", ["__"]],
    ["a ~~b", ["~~"]],
    ["a `b", ["`"]],
    ["a ``b", ["``"]],
    ["a ` b", ["` "]],
    ["a [b", ["["]],
    ["a ![b", ["!["]],
    ["a $b", ["$"]],
    ["a \\(b", ["\\("]],
    ["a **b *c", ["*", "**"]],
  ];

  it.each(cases)("%j reports %j", (input, expected) => {
    expect(attrs(trace(input), "unclosed")).toEqual(expected);
  });

  const closed = ["a **b** c", "*em*", "_em_", "~~s~~", "`c`", "[a](http://e.com)", "$x$"];

  it.each(closed)("%j reports nothing", (input) => {
    expect(attrs(trace(input), "unclosed")).toEqual([]);
  });

  it("reports nothing for a token saturation refused to push", () => {
    expect(attrs(trace(">".repeat(30) + " **x"), "unclosed")).toEqual([]);
  });

  it("emits the delimiter immediately before the close it belongs to", () => {
    expect(trace("a **b").ops.slice(-3)).toEqual(["attr:unclosed=**", "close", "close"]);
  });
});

describe("a refused underscore close leaves the operations balanced", () => {
  const inputs = [
    "_foo_bar",
    "_foo bar_baz",
    "_internal_state",
    "_internal_state_here_",
    "_a_b_c_d_e_",
    "__x_y_",
    "___tri___",
    "_a__b_",
  ];

  it.each(inputs)("%j closes its paragraph only at end", (input) => {
    for (let chunkLen = 1; chunkLen <= 4; chunkLen += 1) {
      const t = trace(input, chunkLen);
      expect(t.kinds[0]).toBe("paragraph");
      expectBalanced(t);
      expect(emptyAt(t)).toEqual([t.ops.length - 1]);
      expect(t.texts.join("")).toBe(trace(input).texts.join(""));
    }
  });
});
