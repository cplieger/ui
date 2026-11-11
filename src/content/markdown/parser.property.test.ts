import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createParser } from "./parser.js";
import type { Kind, Sink } from "./parser.js";

interface TreeNode {
  kind: Kind | "root";
  attrs: string[];
  /** Adjacent text is merged: how a stream is cut may split it, never move it. */
  children: (TreeNode | string)[];
}

function treeSink(root: TreeNode): Sink {
  const stack: TreeNode[] = [root];
  const top = (): TreeNode => stack[stack.length - 1] ?? root;
  return {
    open(kind) {
      const node: TreeNode = { kind, attrs: [], children: [] };
      top().children.push(node);
      stack.push(node);
    },
    close() {
      stack.pop();
    },
    text(s) {
      const children = top().children;
      const last = children[children.length - 1];
      if (typeof last === "string") {
        children[children.length - 1] = last + s;
      } else {
        children.push(s);
      }
    },
    attr(name, value) {
      top().attrs.push(`${name}=${value}`);
    },
  };
}

function tree(chunks: readonly string[]): TreeNode {
  const root: TreeNode = { kind: "root", attrs: [], children: [] };
  const p = createParser(treeSink(root));
  for (const chunk of chunks) {
    p.write(chunk);
  }
  p.end();
  return root;
}

const markdownLike = fc.oneof(
  fc.lorem({ maxCount: 5 }),
  fc
    .tuple(fc.constantFrom("# ", "## ", "### ", "#### "), fc.lorem({ maxCount: 3 }))
    .map(([h, t]) => h + t + "\n"),
  fc
    .tuple(fc.constantFrom("*", "**", "_", "__", "~~"), fc.lorem({ maxCount: 2 }))
    .map(([m, t]) => m + t + m),
  fc
    .tuple(
      fc.constantFrom("```", "````"),
      fc.constantFrom("", "js", "ts"),
      fc.lorem({ maxCount: 3 }),
      fc.boolean(),
    )
    .map(([f, lang, body, closed]) => f + lang + "\n" + body + "\n" + (closed ? f : "") + "\n"),
  fc.lorem({ maxCount: 2 }).map((t) => "`" + t + "`"),
  fc.lorem({ maxCount: 3 }).map((t) => "> " + t + "\n"),
  fc
    .tuple(fc.constantFrom("- ", "* ", "1. ", "2. "), fc.lorem({ maxCount: 3 }))
    .map(([prefix, t]) => prefix + t + "\n"),
  fc.lorem({ maxCount: 1 }).map((text) => `[${text}](https://example.com)`),
  fc.constant("![alt](https://example.com/img.png)"),
  fc.constant("| a | b |\n| --- | --- |\n| c | d |\n"),
  fc.constantFrom("---\n", "***\n", "___\n"),
  fc.constantFrom("- [ ] todo\n", "- [x] done\n"),
  fc.constant("see https://example.com here"),
  fc.constant("<br>\n"),
  // A reference is held from its `&` until a `;` decodes it or a character rules it out, so a
  // malformed one is what could wedge the hold.
  fc
    .tuple(
      fc.constantFrom("&", "&#", "&#x", "&#X", "&amp", "&nosuch", "&#x11"),
      fc.stringMatching(/^[A-Za-z0-9]{0,34}$/u),
      fc.constantFrom(";", "", " ", "\n", "&"),
    )
    .map(([head, body, tail]) => head + body + tail),
  fc.constantFrom(
    "5 &lt; 6 &amp; 7 &copy;",
    "&#42;not bold&#42;",
    "&#0;",
    "&#x110000;",
    "[a](javascript&#58;alert(1))",
  ),
  fc
    .tuple(
      fc.constantFrom("<", "<http", "<https://", "<mailto:", "<a@", "<div", "<br", "<!--", "<Vec"),
      fc.stringMatching(/^[A-Za-z0-9:/.@ -]{0,20}$/u),
      fc.constantFrom(">", "", " ", "\n", "<"),
    )
    .map(([head, body, tail]) => head + body + tail),
  fc.constantFrom("<https://example.com>", "<foo@bar.example.com>", "Vec<String> in Rust"),
  fc.constantFrom("\n", "\n\n"),
);

const markdownDocument = fc
  .array(markdownLike, { minLength: 1, maxLength: 20 })
  .map((parts) => parts.join(""));

describe("parser properties", () => {
  it("builds the same tree whether a stream is cut at blank lines or not", () => {
    // Mid-block, the parser commits what it holds at a chunk's end, so only a cut after a blank
    // line, where no block is open, promises the one-write tree.
    const cutAtBlankLines = markdownDocument.chain((doc) => {
      const blanks: number[] = [];
      for (let i = doc.indexOf("\n\n"); i !== -1; i = doc.indexOf("\n\n", i + 1)) {
        blanks.push(i + 2);
      }
      return fc.tuple(fc.constant(doc), fc.subarray(blanks));
    });
    fc.assert(
      fc.property(cutAtBlankLines, ([doc, cuts]) => {
        const chunks = [0, ...cuts, doc.length]
          .slice(1)
          .map((end, i, ends) => doc.slice(i === 0 ? 0 : ends[i - 1], end));
        expect(tree(chunks)).toEqual(tree([doc]));
      }),
      { numRuns: 300 },
    );
  });

  it("ignores empty writes", () => {
    fc.assert(
      fc.property(markdownDocument, (doc) => {
        const chars = [...doc];
        expect(tree(chars.flatMap((ch) => ["", ch, ""]))).toEqual(tree(chars));
      }),
      { numRuns: 200 },
    );
  });

  it("opens heading-1 to heading-6 for one to six #, and no heading for seven or more", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), fc.lorem({ maxCount: 2 }), (hashes, text) => {
        const kinds = (tree(["#".repeat(hashes) + " " + text + "\n"]).children[0] as TreeNode).kind;
        expect(kinds).toBe(hashes <= 6 ? `heading-${String(hashes)}` : "paragraph");
      }),
      { numRuns: 200 },
    );
  });
});

describe("link destinations (CommonMark 6.3)", () => {
  const segment = fc.stringMatching(/^[A-Za-z0-9./:?=%-]{1,12}$/u);
  /** A destination with no whitespace, whose parentheses balance. */
  const bareDest = fc
    .array(
      fc.oneof(
        segment,
        segment.map((s) => `(${s})`),
      ),
      { minLength: 1, maxLength: 6 },
    )
    .map((parts) => parts.join(""));
  const titleText = fc.stringMatching(/^[A-Za-z0-9 .,:/-]{0,30}$/u);

  function link(input: string, chunkLen: number): TreeNode {
    const chars = [...input];
    const chunks: string[] = [];
    for (let i = 0; i < chars.length; i += chunkLen) {
      chunks.push(chars.slice(i, i + chunkLen).join(""));
    }
    const paragraph = tree(chunks).children[0] as TreeNode;
    return paragraph.children[0] as TreeNode;
  }

  it("takes a bare destination with balanced parentheses whole, at any chunk size", () => {
    fc.assert(
      fc.property(bareDest, fc.integer({ min: 1, max: 7 }), (dest, chunkLen) => {
        expect(link(`[a](${dest})`, chunkLen).attrs).toEqual([`href=${dest}`]);
      }),
    );
  });

  it("splits a quoted or parenthesised title off after whitespace", () => {
    fc.assert(
      fc.property(
        bareDest,
        titleText,
        fc.constantFrom(['"', '"'], ["'", "'"], ["(", ")"]),
        fc.constantFrom(" ", "\t", "  "),
        fc.integer({ min: 1, max: 7 }),
        (dest, title, [open, close], gap, chunkLen) => {
          expect(link(`[a](${dest}${gap}${open}${title}${close})`, chunkLen).attrs).toEqual([
            `href=${dest}`,
            `title=${title}`,
          ]);
        },
      ),
    );
  });

  it("keeps spaces and parentheses inside an angle-bracketed destination", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Za-z0-9 ()./-]{0,30}$/u),
        fc.integer({ min: 1, max: 7 }),
        (dest, chunkLen) => {
          expect(link(`[a](<${dest}>)`, chunkLen).attrs).toEqual([`href=${dest}`]);
        },
      ),
    );
  });

  it("drops the backslash of an escape and keeps it before anything but punctuation", () => {
    fc.assert(
      fc.property(
        segment,
        fc.constantFrom(
          ["\\(", "("],
          ["\\)", ")"],
          ["\\\\", "\\"],
          ["\\&amp;", "&amp;"],
          ["\\a", "\\a"],
          ["\\é", "\\é"],
        ),
        fc.integer({ min: 1, max: 7 }),
        (s, [written, href], chunkLen) => {
          expect(link(`[a](${s}${written})`, chunkLen).attrs).toEqual([`href=${s}${href}`]);
        },
      ),
    );
  });

  it("drops the backslash of an escaped title closer", () => {
    expect(link('[a](x "t\\"u")', 1).attrs).toEqual(["href=x", 'title=t"u']);
    expect(link("[a](x (t\\)u))", 1).attrs).toEqual(["href=x", "title=t)u"]);
  });
});

const noop: Sink = {
  open() {
    /* timing only */
  },
  close() {
    /* timing only */
  },
  text() {
    /* timing only */
  },
  attr() {
    /* timing only */
  },
};

/** Milliseconds for one parse, over enough parses to span 15 ms: some engines' timers tick at
 *  1 ms. */
function batchCost(input: string): number {
  let runs = 0;
  const start = performance.now();
  let now: number;
  do {
    const p = createParser(noop);
    p.write(input);
    p.end();
    runs += 1;
    now = performance.now();
  } while (now - start < 15);
  return (now - start) / runs;
}

/** How much more one parse of `large` costs than one of `small`. The samples alternate and each
 *  side keeps its fastest, so a burst of load from other work slows both or neither. */
function costRatio(small: string, large: string): number {
  let fastSmall = Infinity;
  let fastLarge = Infinity;
  for (let trial = 0; trial < 7; trial += 1) {
    fastSmall = Math.min(fastSmall, batchCost(small));
    fastLarge = Math.min(fastLarge, batchCost(large));
  }
  return fastLarge / fastSmall;
}

describe("linear time", () => {
  const nestedList = (n: number): string => {
    let out = "";
    for (let depth = 0; out.length < n; depth = (depth + 1) % 20) {
      out += "  ".repeat(depth) + "- x\n";
    }
    return out;
  };
  const generators: [string, (n: number) => string][] = [
    ["a long image destination", (n) => "![a](data:image/png;base64," + "A".repeat(n) + ")"],
    ["a destination of balanced parentheses", (n) => "[a](" + "x(y)".repeat(n / 4) + ")"],
    ["repeated link openers", (n) => "[a](".repeat(n / 4)],
    ["a long angle-bracketed destination", (n) => "[a](<" + "y".repeat(n) + ">)"],
    ["a long quoted title", (n) => '[a](x "' + "t".repeat(n) + '")'],
    ["a long parenthesised title", (n) => "[a](x (" + "t".repeat(n) + "))"],
    ["one wide table row", (n) => "|" + "a|".repeat(n / 4) + "\n|" + "-|".repeat(n / 4) + "\n"],
    ["a header row with no delimiter row", (n) => "|" + "a|".repeat(n / 2) + "\n"],
    ["one long header cell", (n) => "| " + "a".repeat(n) + " |\n|-|\n"],
    ["a long delimiter row", (n) => "|a|\n" + "-".repeat(n)],
    ["a backtick run", (n) => "`".repeat(n)],
    ["a code span of longer closing runs", (n) => "`a" + "``".repeat(n / 2) + "`"],
    ["a long fence info string", (n) => "```" + "a".repeat(n) + "\nx\n```\n"],
    ["a spaced thematic-break run", (n) => "- ".repeat(n / 2) + "x"],
    ["an underscore run", (n) => "_".repeat(n)],
    ["an ATX closing run", (n) => "# a" + " #".repeat(n / 2)],
    ["a long bare URL", (n) => "http://" + "a".repeat(n)],
    ["a bare URL of dotted segments", (n) => "http://a" + ".a".repeat(n / 2)],
    ["deep blockquote nesting", (n) => ">".repeat(n)],
    ["deep list nesting", nestedList],
    ["nested emphasis", (n) => "*a **b _c ".repeat(n / 10)],
  ];

  it.each(generators)("parses %s in time linear in its length", (_name, generate) => {
    // Sixteen times the input costs about sixteen times the work when linear and 256 times when
    // quadratic; the bound sits between them, at 16^1.5.
    expect(costRatio(generate(4 * 1024), generate(64 * 1024))).toBeLessThan(64);
  });
});
