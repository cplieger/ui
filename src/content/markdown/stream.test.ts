import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDomSink,
  createMarkdownStream,
  createParser,
  createRecorder,
  renderMarkdown,
  replay,
} from "./markdown.js";
import type { Op, Sink, StreamOptions } from "./markdown.js";

const hosts: HTMLElement[] = [];

function host(): HTMLElement {
  const el = document.createElement("div");
  document.body.append(el);
  hosts.push(el);
  return el;
}

afterEach(() => {
  vi.useRealTimers();
  for (const el of hosts.splice(0)) {
    el.remove();
  }
});

function oneShot(md: string): string {
  const el = host();
  renderMarkdown(el, md);
  return el.innerHTML;
}

/** `text` cut at `cuts`, in order, every piece kept. */
function cutAt(text: string, cuts: readonly number[]): string[] {
  const ends = [...cuts, text.length].sort((a, b) => a - b);
  return ends.map((end, i) => text.slice(i === 0 ? 0 : ends[i - 1], end));
}

const PIECES = [
  "# head\n",
  "## sub\n",
  "para *em* **strong** ~~del~~ `code`",
  "[link](https://e.example/a) and <https://e.example/b>",
  "![alt](https://e.example/i.png)",
  "```go\nfunc main() {}\n```\n",
  "```\nplain\n",
  "| a | b |\n| :- | -: |\n| 1 | 2 |\n",
  "> quote\n",
  "- item\n- [x] done\n",
  "1. one\n2. two\n",
  "$x^2$ and $$\ny\n$$\n",
  "---\n",
  "&amp; &#42; &nosuch;",
  "<b>raw</b>",
  "\n",
  "\n\n",
  "word ",
  "é😀",
];

const markdownish = fc.oneof(
  fc.array(fc.constantFrom(...PIECES), { maxLength: 30 }).map((p) => p.join("")),
  fc.string({ maxLength: 200 }),
);

const withCuts = markdownish.chain((md) =>
  fc.tuple(
    fc.constant(md),
    fc.uniqueArray(fc.integer({ min: 0, max: md.length }), { maxLength: 8 }),
  ),
);

/** Paragraphs that each complete as a top-level block, `n` UTF-16 units in all. */
function paragraphs(n: number): string {
  return "abcdefg\n\n".repeat(Math.ceil(n / 9)).slice(0, n);
}

/** Resolves once `stream` has called `onSlice` `count` times. */
function slices(count: number): {
  options: StreamOptions;
  done: Promise<undefined>;
  seen: () => number;
} {
  let seen = 0;
  const { promise: done, resolve } = Promise.withResolvers<undefined>();
  return {
    options: {
      flushIntervalMs: 0,
      onSlice: () => {
        seen += 1;
        if (seen === count) {
          resolve(undefined);
        }
      },
    },
    done,
    seen: () => seen,
  };
}

describe("createMarkdownStream", () => {
  it("renders what one call renders, wherever the writes are cut", () => {
    fc.assert(
      fc.property(withCuts, ([md, cuts]) => {
        const el = host();
        const stream = createMarkdownStream(el, { flushIntervalMs: 0 });
        for (const chunk of cutAt(md, cuts)) {
          stream.write(chunk);
        }
        stream.end();
        expect(el.innerHTML).toBe(oneShot(md));
      }),
      { numRuns: 200 },
    );
  });

  it("parses a large write in 4 KiB slices, one per task", async () => {
    const md = paragraphs(10_000);
    const el = host();
    const run = slices(3);
    const stream = createMarkdownStream(el, run.options);
    stream.write(md);
    expect(run.seen()).toBe(1);
    // The parser holds a write's last character until the next decides it.
    const first = md.slice(0, 4096).replaceAll("\n", "");
    expect(first.startsWith(el.textContent)).toBe(true);
    expect(el.textContent.length).toBeGreaterThan(first.length - 8);
    await run.done;
    const all = md.replaceAll("\n", "");
    expect(all.startsWith(el.textContent)).toBe(true);
    expect(el.textContent.length).toBeGreaterThan(all.length - 8);
    stream.end();
    expect(el.innerHTML === oneShot(md)).toBe(true);
  });

  it("never parses half of a surrogate pair at a slice's end", async () => {
    const md = `${"a".repeat(4095)}😀b`;
    const el = host();
    const texts: string[] = [];
    const run = slices(2);
    const stream = createMarkdownStream(el, {
      ...run.options,
      text: (_parent, node) => {
        texts.push(node.data);
        return undefined;
      },
    });
    stream.write(md);
    await run.done;
    stream.end();
    expect(texts.some((t) => /[\uD800-\uDBFF]$/u.test(t) || /^[\uDC00-\uDFFF]/u.test(t))).toBe(
      false,
    );
    expect(el.textContent).toBe(md);
  });

  it("waits 200 ms by default and joins the writes made meanwhile", () => {
    vi.useFakeTimers();
    const el = host();
    const stream = createMarkdownStream(el);
    stream.write("a\n\n");
    vi.advanceTimersByTime(150);
    stream.write("b\n\nc");
    vi.advanceTimersByTime(49);
    expect(el.textContent).toBe("");
    vi.advanceTimersByTime(1);
    expect(el.textContent).toBe("ab");
  });

  it("parses on write with flushIntervalMs 0", () => {
    const el = host();
    createMarkdownStream(el, { flushIntervalMs: 0 }).write("a\n\nb");
    expect(el.firstElementChild?.outerHTML).toBe("<p>a</p>");
  });

  it("flush parses what is queued now, without waiting for the interval", () => {
    vi.useFakeTimers();
    const el = host();
    const stream = createMarkdownStream(el, { flushIntervalMs: 1000 });
    stream.write("a\n\nb");
    stream.flush();
    expect(el.firstElementChild?.outerHTML).toBe("<p>a</p>");
  });

  it("end parses everything at once and closes the last block with its hooks", () => {
    const md = paragraphs(10_000);
    const blocks: string[] = [];
    const el = host();
    const stream = createMarkdownStream(el, {
      hooks: {
        block: (b) => {
          blocks.push(b.textContent);
          return undefined;
        },
      },
    });
    stream.write(md);
    stream.end();
    expect(el.textContent).toBe(md.replaceAll("\n", ""));
    expect(blocks).toHaveLength(el.children.length);
    expect(blocks.at(-1)).toBe(el.lastElementChild?.textContent);
  });

  it("does nothing on a second end, or on a write or flush after end", () => {
    let calls = 0;
    const el = host();
    const stream = createMarkdownStream(el, {
      flushIntervalMs: 0,
      hooks: {
        block: () => {
          calls += 1;
          return undefined;
        },
      },
    });
    stream.write("one\n\ntwo");
    stream.end();
    const after = el.innerHTML;
    stream.end();
    stream.write("\n\nthree");
    stream.flush();
    expect(el.innerHTML).toBe(after);
    expect(calls).toBe(2);
  });

  it("on abort drops the pending slices and runs no further hook", async () => {
    const md = paragraphs(12_000);
    const ac = new AbortController();
    const calls: string[] = [];
    const el = host();
    const stream = createMarkdownStream(el, {
      flushIntervalMs: 0,
      signal: ac.signal,
      maxBytes: 10_000,
      hooks: {
        block: (b) => {
          calls.push(b.textContent);
          return undefined;
        },
      },
    });
    stream.write(md);
    ac.abort();
    const before = { html: el.innerHTML, calls: calls.length };
    // A stream that is not aborted finishes its slices on the same task source.
    const control = slices(3);
    createMarkdownStream(host(), control.options).write(md);
    await control.done;
    stream.write("more");
    stream.flush();
    stream.end();
    expect(el.innerHTML).toBe(before.html);
    expect(calls).toHaveLength(before.calls);
    expect(el.querySelector("[data-cp-truncated]")).toBeNull();
  });

  it("renders nothing for a signal aborted before it starts", () => {
    const el = host();
    const stream = createMarkdownStream(el, { flushIntervalMs: 0, signal: AbortSignal.abort() });
    stream.write("# a");
    stream.end();
    expect(el.childNodes).toHaveLength(0);
  });

  it("counts maxBytes across every write and shows the line once, at end", () => {
    const el = host();
    const stream = createMarkdownStream(el, { flushIntervalMs: 0, maxBytes: 10 });
    stream.write("abcdef");
    stream.write("ghijkl");
    stream.write("mn");
    expect(el.querySelector("[data-cp-truncated]")).toBeNull();
    stream.end();
    expect(el.firstElementChild?.textContent).toBe("abcdefghij");
    expect(el.querySelectorAll("[data-cp-truncated]")).toHaveLength(1);
    expect(el.lastElementChild?.hasAttribute("data-cp-truncated")).toBe(true);
  });

  it("keeps a surrogate pair whole when two writes split it", () => {
    // "abc" is 3 bytes and "😀" 4: 7 fit, the "x" after does not.
    const fits = host();
    const a = createMarkdownStream(fits, { flushIntervalMs: 0, maxBytes: 7 });
    a.write("abc\uD83D");
    a.write("\uDE00x");
    a.end();
    expect(fits.firstElementChild?.textContent).toBe("abc😀");
    const short = host();
    const b = createMarkdownStream(short, { flushIntervalMs: 0, maxBytes: 6 });
    b.write("abc\uD83D");
    b.write("\uDE00");
    b.end();
    expect(short.firstElementChild?.textContent).toBe("abc");
  });

  it("runs text for each text node, attached as its parent's last child", () => {
    const seen: { parent: string; data: string; last: boolean }[] = [];
    const el = host();
    const stream = createMarkdownStream(el, {
      flushIntervalMs: 0,
      highlight: false,
      text: (parent, node) => {
        seen.push({ parent: parent.tagName, data: node.data, last: parent.lastChild === node });
        return undefined;
      },
    });
    stream.write("a *b*\n\n```\nc\n```");
    stream.end();
    // Where a run of text splits into nodes is the parser's; what each parent gets is not.
    const byParent = new Map<string, string>();
    for (const { parent, data } of seen) {
      byParent.set(parent, (byParent.get(parent) ?? "") + data);
    }
    expect(Object.fromEntries(byParent)).toEqual({ P: "a ", EM: "b", CODE: "c" });
    expect(seen.every((n) => n.last)).toBe(true);
  });

  it("puts what text returns in the node's place", () => {
    const el = host();
    const stream = createMarkdownStream(el, {
      flushIntervalMs: 0,
      text: (_parent, node) => {
        const span = document.createElement("span");
        span.append(node);
        return span;
      },
    });
    stream.write("a **b**");
    stream.end();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const parents: string[] = [];
    for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
      parents.push(n.parentElement?.tagName ?? "");
    }
    expect(parents.length).toBeGreaterThan(1);
    expect(parents.every((t) => t === "SPAN")).toBe(true);
    expect(el.querySelector("p > strong > span")?.textContent).toBe("b");
    expect(el.textContent).toBe("a b");
  });

  it("runs moved before an unclosed token gives its children to its parent", () => {
    const seen: { tag: string; text: string; connected: boolean }[] = [];
    const el = host();
    const stream = createMarkdownStream(el, {
      flushIntervalMs: 0,
      moved: (m) => {
        seen.push({ tag: m.tagName, text: m.textContent, connected: m.isConnected });
      },
    });
    stream.write("x *a b");
    stream.end();
    expect(seen).toEqual([{ tag: "EM", text: "a b", connected: true }]);
    expect(el.innerHTML).toBe("<p>x *a b</p>");
  });

  it("passes its host to onSlice", () => {
    const el = host();
    const got: Element[] = [];
    createMarkdownStream(el, { flushIntervalMs: 0, onSlice: (h) => got.push(h) }).write("a");
    expect(got).toHaveLength(1);
    expect(got[0]).toBe(el);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("refuses flushIntervalMs %d", (ms) => {
    expect(() => createMarkdownStream(host(), { flushIntervalMs: ms })).toThrow(RangeError);
  });
});

describe("createRecorder and replay", () => {
  /** A worker's loop: parse a chunk, post the batch, empty `ops`. */
  function batches(md: string, cuts: readonly number[]): Op[][] {
    const ops: Op[] = [];
    const parser = createParser(createRecorder(ops));
    const out: Op[][] = [];
    for (const chunk of cutAt(md, cuts)) {
      parser.write(chunk);
      out.push(structuredClone(ops));
      ops.length = 0;
    }
    parser.end();
    out.push(structuredClone(ops));
    return out;
  }

  it("renders a worker's batches, replayed into one sink, as one call does", () => {
    fc.assert(
      fc.property(withCuts, fc.boolean(), ([md, cuts], load) => {
        const el = host();
        const sink = createDomSink(el, { images: load ? "load" : "link" });
        for (const batch of batches(md, cuts)) {
          replay(batch, sink);
        }
        sink.end();
        const direct = host();
        renderMarkdown(direct, md, { images: load ? "load" : "link" });
        expect(el.innerHTML).toBe(direct.innerHTML);
      }),
      { numRuns: 200 },
    );
  });

  it("renders batches that crossed a real postMessage", async () => {
    const md = PIECES.join("");
    const channel = new MessageChannel();
    const el = host();
    const sink = createDomSink(el);
    const sent = batches(md, [7, 40, 41, 120, 300]);
    const received = new Promise<void>((resolve) => {
      let left = sent.length;
      channel.port1.onmessage = (e: MessageEvent<unknown>) => {
        replay(e.data as Op[], sink);
        left -= 1;
        if (left === 0) {
          resolve(undefined);
        }
      };
    });
    for (const batch of sent) {
      channel.port2.postMessage(batch);
    }
    await received;
    channel.port1.close();
    sink.end();
    expect(el.innerHTML).toBe(oneShot(md));
  });

  it("records plain data that survives a JSON round trip", () => {
    const ops: Op[] = [];
    const parser = createParser(createRecorder(ops));
    parser.write('[a](https://e.example "t")\n\n```go\nx\n');
    parser.end();
    expect(ops.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(ops))).toEqual(ops);
  });

  it("skips an op of any other shape", () => {
    const calls: string[] = [];
    const sink: Sink = {
      open: (k) => calls.push(`open:${k}`),
      close: () => calls.push("close"),
      text: (t) => calls.push(`text:${t}`),
      attr: (n, v) => calls.push(`attr:${n}=${v}`),
    };
    const junk = [
      null,
      "x",
      7,
      {},
      [],
      [9],
      [0, 5],
      [2, null],
      [3, "href"],
      [3, 1, "x"],
      [0, "paragraph"],
      [2, "t"],
      [3, "title", "v"],
      [1],
    ] as unknown as Op[];
    replay(junk, sink);
    expect(calls).toEqual(["open:paragraph", "text:t", "attr:title=v", "close"]);
  });
});
