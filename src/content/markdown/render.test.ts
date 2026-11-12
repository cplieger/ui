import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDomSink, createParser, payloadShaped, renderMarkdown } from "./markdown.js";
import type { Hooks, Kind, RenderOptions } from "./markdown.js";
import { byteBudget } from "./render.js";

const hosts: HTMLElement[] = [];

function host(width?: number): HTMLElement {
  const el = document.createElement("div");
  if (width !== undefined) {
    el.style.inlineSize = `${String(width)}px`;
  }
  document.body.append(el);
  hosts.push(el);
  return el;
}

afterEach(() => {
  for (const el of hosts.splice(0)) {
    el.remove();
  }
});

function render(md: string, options?: RenderOptions): HTMLElement {
  const el = host();
  renderMarkdown(el, md, options);
  return el;
}

function attrSet(el: Element | null): Record<string, string | null> {
  expect(el).not.toBeNull();
  return Object.fromEntries(
    (el?.getAttributeNames() ?? []).map((n) => [n, el?.getAttribute(n) ?? null]),
  );
}

const REL = "noopener noreferrer nofollow";
const PAYLOAD = `https://e.example/collect?d=${"%41".repeat(25)}`;
const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

describe("the element vocabulary", () => {
  const cases: [string, string][] = [
    ["hello", "<p>hello</p>"],
    ["one\n\ntwo", "<p>one</p><p>two</p>"],
    ["# a", "<h1>a</h1>"],
    ["###### a", "<h6>a</h6>"],
    ["> q", "<blockquote><p>q</p></blockquote>"],
    ["a\n\n---", "<p>a</p><hr>"],
    ["a  \nb", "<p>a <br>b</p>"],
    ["*e* **s** ~~d~~ `c`", "<p><em>e</em> <strong>s</strong> <del>d</del> <code>c</code></p>"],
    ["- a\n- b", "<ul><li>a</li><li>b</li></ul>"],
    ["1. a\n2. b", "<ol><li>a</li><li>b</li></ol>"],
    ["3. a\n4. b", '<ol start="3"><li>a</li><li>b</li></ol>'],
    ["9. a\n1. b", '<ol start="9" data-cp-digits="2"><li>a</li><li>b</li></ol>'],
    ["98. a\n1. b\n1. c", '<ol start="98" data-cp-digits="3"><li>a</li><li>b</li><li>c</li></ol>'],
    ["$x^2$", '<p><code data-math="inline">x^2</code></p>'],
    ["$$\nx^2\n$$\n", '<p><code data-math="block">x^2\n</code></p>'],
    ["<b>x</b> &amp; <script>", "<p>&lt;b&gt;x&lt;/b&gt; &amp; &lt;script&gt;</p>"],
  ];

  it.each(cases)("renders %j as %j", (md, html) => {
    expect(render(md).innerHTML).toBe(html);
  });

  it("renders a task box disabled and named, checked when ticked", () => {
    const el = render("- [x] done\n- [ ] todo");
    const [done, todo] = el.querySelectorAll("input");
    expect(attrSet(done ?? null)).toEqual({
      type: "checkbox",
      disabled: "",
      "aria-label": "Task item",
      checked: "",
    });
    expect(attrSet(todo ?? null)).toEqual({
      type: "checkbox",
      disabled: "",
      "aria-label": "Task item",
    });
    expect(el.querySelector("li")?.textContent).toBe(" done");
  });

  it("puts a table in its region, header cells in thead, alignment as data-align", () => {
    const el = render("| a | b | c |\n|:-|:-:|-:|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |");
    const region = el.firstElementChild;
    expect(region?.className).toBe("cp-table-scroll");
    expect(region?.children).toHaveLength(1);
    const table = region?.firstElementChild as HTMLTableElement;
    expect(table.tagName).toBe("TABLE");
    expect(table.tHead?.rows).toHaveLength(1);
    expect(table.tBodies).toHaveLength(1);
    expect(table.tBodies[0]?.rows).toHaveLength(2);
    const aligns = [...table.querySelectorAll("th, td")].map((c) => [
      c.tagName,
      c.getAttribute("data-align"),
      c.textContent.trim(),
    ]);
    expect(aligns).toEqual([
      ["TH", "start", "a"],
      ["TH", "center", "b"],
      ["TH", "end", "c"],
      ["TD", "start", "1"],
      ["TD", "center", "2"],
      ["TD", "end", "3"],
      ["TD", "start", "4"],
      ["TD", "center", "5"],
      ["TD", "end", "6"],
    ]);
    expect(el.querySelector("[style]")).toBeNull();
  });

  it("pads a short body row and drops a long one's extra cells, as GFM 4.10 says", () => {
    const el = render("| a | b | c |\n|:-:|--:|---|\n| 1 |\n| 1 | 2 | 3 | 4 |");
    const rows = [...el.querySelectorAll("tbody > tr")].map((tr) =>
      [...tr.children].map((c) => [c.tagName, c.getAttribute("data-align"), c.textContent.trim()]),
    );
    expect(rows).toEqual([
      [
        ["TD", "center", "1"],
        ["TD", "end", ""],
        ["TD", null, ""],
      ],
      [
        ["TD", "center", "1"],
        ["TD", "end", "2"],
        ["TD", null, "3"],
      ],
    ]);
    expect(el.textContent).not.toContain("4");
  });

  it("keeps a replayed body row to the header's cells", () => {
    const el = host();
    const sink = createDomSink(el);
    const cell = (text: string): void => {
      sink.open("table-cell");
      sink.text(text);
      sink.close();
    };
    sink.open("table");
    sink.open("table-row");
    cell("a");
    cell("b");
    sink.close();
    sink.open("table-row");
    cell("1");
    cell("2");
    cell("3");
    sink.close();
    sink.open("table-row");
    sink.close();
    sink.end();
    const body = [...el.querySelectorAll("tbody > tr")].map((tr) =>
      [...tr.children].map((c) => c.textContent),
    );
    expect(body).toEqual([
      ["1", "2"],
      ["", ""],
    ]);
  });

  it("leaves an unaligned column without data-align", () => {
    const el = render("| a | b |\n|---|:-:|\n| 1 | 2 |");
    expect([...el.querySelectorAll("td")].map((c) => c.getAttribute("data-align"))).toEqual([
      null,
      "center",
    ]);
  });

  it("appends after what the host holds", () => {
    const el = host();
    el.append("kept");
    renderMarkdown(el, "new");
    expect(el.innerHTML).toBe("kept<p>new</p>");
  });
});

describe("headingLevel", () => {
  it.each([
    [1, ["H1", "H2", "H6"]],
    [2, ["H2", "H3", "H6"]],
    [4, ["H4", "H5", "H6"]],
    [6, ["H6", "H6", "H6"]],
  ] as const)("at %d shifts every heading and stops at h6", (level, tags) => {
    const el = render("# a\n## b\n###### c", { headingLevel: level });
    expect([...el.children].map((c) => c.tagName)).toEqual(tags);
  });

  it.each([0, 7, 2.5, Number.NaN])("refuses %d", (level) => {
    expect(() => render("# a", { headingLevel: level as 1 })).toThrow(RangeError);
  });
});

describe("unclosed inline tokens", () => {
  const cases: [string, string][] = [
    ["a **b", "<p>a **b</p>"],
    ["a *b", "<p>a *b</p>"],
    ["a _b", "<p>a _b</p>"],
    ["a ~~b", "<p>a ~~b</p>"],
    ["the ` char", "<p>the ` char</p>"],
    ["random[0,500)", "<p>random[0,500)</p>"],
    ["an ![img", "<p>an ![img</p>"],
    ["a $x^2", "<p>a $x^2</p>"],
    ["a **b *c", "<p>a **b *c</p>"],
    ["# a *b", "<h1>a *b</h1>"],
    ["a **b\n\nnext", "<p>a **b</p><p>next</p>"],
    ["[a *b](h", "<p>[a *b](h</p>"],
  ];

  it.each(cases)("renders %j as its delimiter and text", (md, html) => {
    expect(render(md).innerHTML).toBe(html);
  });

  it("keeps a closed token inside a label whose own run never closed", () => {
    const el = render("[a *b* c](https://e.example)");
    expect(el.querySelector("a")?.innerHTML).toBe("a <em>b</em> c");
  });
});

describe("links", () => {
  it("gives an absolute web link the gate's serialization, rel and a new tab", () => {
    const a = render("[x](HTTPS://E.example/a/../b?q=1)").querySelector("a");
    expect(attrSet(a)).toEqual({
      href: "https://e.example/b?q=1",
      rel: REL,
      target: "_blank",
    });
    expect(a?.textContent).toBe("x");
  });

  it("treats a protocol-relative destination as https", () => {
    expect(render("[x](//e.example/p)").querySelector("a")?.getAttribute("href")).toBe(
      "https://e.example/p",
    );
  });

  it("carries the title and nothing else", () => {
    const a = render('[x](https://e.example "Title <b>")').querySelector("a");
    expect(attrSet(a)).toEqual({
      href: "https://e.example/",
      title: "Title <b>",
      rel: REL,
      target: "_blank",
    });
  });

  it("keeps mailto a link, in this tab", () => {
    const a = render("<a@e.example> and [m](mailto:b@e.example)").querySelectorAll("a");
    expect(attrSet(a[0] ?? null)).toEqual({ href: "mailto:a@e.example", rel: REL });
    expect(attrSet(a[1] ?? null)).toEqual({ href: "mailto:b@e.example", rel: REL });
  });

  it.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "<javascript:alert(1)>",
    "java&#115;cript:alert(1)",
    "&#1;javascript:alert(1)",
    "data:text/html,x",
    "vbscript:msgbox",
    "file:///etc/passwd",
    "relative/path",
    "#frag",
  ])("refuses %j: no href, no rel, no target, the label as text", (dest) => {
    const a = render(`[label](${dest})`).querySelector("a");
    expect(attrSet(a)).toEqual({});
    expect(a?.textContent).toBe("label");
  });

  it('never writes href="#" for a refused destination', () => {
    expect(render("[x](javascript:x)").querySelector('[href="#"]')).toBeNull();
  });

  it("admits a relative destination with a base, keeping its own text", () => {
    const a = render("[x](docs/a.md)", { base: document.baseURI }).querySelector("a");
    expect(attrSet(a)).toEqual({ href: "docs/a.md", rel: REL, target: "_blank" });
  });

  it("writes the resolved URL when the base is not the document's", () => {
    const a = render("[x](docs/a.md)", { base: "https://forge.example/o/r/" }).querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://forge.example/o/r/docs/a.md");
  });

  it("keeps a fragment link in this tab", () => {
    const a = render("[x](#section)", { base: document.baseURI }).querySelector("a");
    expect(attrSet(a)).toEqual({ href: "#section", rel: REL });
  });

  it("opens a new tab for a fragment of a base that is not the page", () => {
    const a = render("[x](#section)", { base: "https://forge.example/o/r/" }).querySelector("a");
    expect(attrSet(a)).toEqual({
      href: "https://forge.example/o/r/#section",
      rel: REL,
      target: "_blank",
    });
  });

  it("opens a new tab for a fragment a <base> element sends to another document", () => {
    const tag = document.createElement("base");
    tag.href = new URL("/elsewhere/", location.href).href;
    document.head.append(tag);
    try {
      const a = render("[x](#section)", { base: document.baseURI }).querySelector("a");
      expect(a?.getAttribute("target")).toBe("_blank");
      expect(a?.href).toBe(new URL("/elsewhere/#section", location.href).href);
    } finally {
      tag.remove();
    }
  });

  it.each(["../up", "a/./b", "a/%2e%2e/b", "a\\\\..\\\\b"])(
    "refuses the dot segment in %j even with a base",
    (dest) => {
      expect(
        render(`[x](${dest})`, { base: document.baseURI }).querySelector("a")?.hasAttribute("href"),
      ).toBe(false);
    },
  );

  it("throws for a base that is not a URL", () => {
    expect(() => render("x", { base: "not a url" })).toThrow(TypeError);
  });

  it("lets urls refuse, and only refuse", () => {
    const seen: [string, string, string][] = [];
    const el = render("[a](https://a.example/x) [b](https://b.example/y)", {
      urls: (url, raw, kind) => {
        seen.push([url.href, raw, kind]);
        return url.hostname !== "b.example";
      },
    });
    expect(seen).toEqual([
      ["https://a.example/x", "https://a.example/x", "href"],
      ["https://b.example/y", "https://b.example/y", "href"],
    ]);
    const [a, b] = el.querySelectorAll("a");
    expect(a?.getAttribute("href")).toBe("https://a.example/x");
    expect(attrSet(b ?? null)).toEqual({});
  });

  it("never asks urls about a destination the gate refused", () => {
    let calls = 0;
    const el = render("[a](javascript:x)", {
      urls: () => {
        calls += 1;
        return true;
      },
    });
    expect(calls).toBe(0);
    expect(el.querySelector("a[href]")).toBeNull();
  });

  it("links a bare URL", () => {
    const a = render("see https://e.example/a now").querySelector("a");
    expect(attrSet(a)).toEqual({ href: "https://e.example/a", rel: REL, target: "_blank" });
    expect(a?.textContent).toBe("https://e.example/a");
  });

  it("links a reference-style destination", () => {
    const el = render("see [doc][r]\n\n[r]: https://e.example/doc\n");
    expect(el.querySelector("a[href]")?.getAttribute("href")).toBe("https://e.example/doc");
  });
});

describe("withheld links", () => {
  it("withholds a payload-shaped link: no href, the destination after the label", () => {
    const a = render(`see [file an issue](${PAYLOAD}) now`).querySelector("a");
    expect(attrSet(a)).toEqual({ "data-cp-withheld": "" });
    expect(a?.textContent).toBe(`file an issue${PAYLOAD}`);
    const dest = a?.querySelector('[data-part="dest"]');
    expect(dest?.textContent).toBe(PAYLOAD);
    expect(a?.lastChild).toBe(dest);
  });

  it.each([
    ["a bare URL", (u: string) => `go ${u} now`],
    ["an angle autolink", (u: string) => `go <${u}> now`],
    ["a reference", (u: string) => `go [x][r]\n\n[r]: ${u}\n`],
  ])("withholds %s", (_name, produce) => {
    const el = render(produce(PAYLOAD));
    expect(el.querySelector("a[href]")).toBeNull();
    expect(el.querySelector("a[data-cp-withheld]")).not.toBeNull();
  });

  it("withholds a host carrying encoded data", () => {
    const host32 = `${"a1".repeat(16)}.e.example`;
    expect(render(`[x](https://${host32}/)`).querySelector("a[href]")).toBeNull();
  });

  it("leaves an ordinary link alone", () => {
    const a = render("[docs](https://e.example/docs?page=2)").querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://e.example/docs?page=2");
    expect(a?.hasAttribute("data-cp-withheld")).toBe(false);
  });

  it("never judges a same-origin, relative or mailto destination", () => {
    const tail = `?d=${"%41".repeat(25)}`;
    const el = render(
      `[a](${location.origin}/x${tail}) [b](x${tail}) [c](mailto:a@e.example${tail})`,
      { base: document.baseURI },
    );
    expect(el.querySelectorAll("a[href]")).toHaveLength(3);
    expect(el.querySelector("[data-cp-withheld]")).toBeNull();
  });

  it("renders a payload-shaped link live when withhold is false", () => {
    const a = render(`[x](${PAYLOAD})`, { withhold: false }).querySelector("a");
    expect(a?.getAttribute("href")).toBe(PAYLOAD);
    expect(a?.hasAttribute("data-cp-withheld")).toBe(false);
  });

  it("takes a predicate of the app's own", () => {
    const el = render("[a](https://a.example/) [b](https://b.example/)", {
      withhold: (url) => url.hostname === "a.example",
    });
    const [a, b] = el.querySelectorAll("a");
    expect(a?.hasAttribute("href")).toBe(false);
    expect(b?.getAttribute("href")).toBe("https://b.example/");
  });

  it("still refuses a long-query javascript: link with withhold on or off", () => {
    for (const options of [{}, { withhold: false }] as const) {
      const el = render(`[x](javascript:alert(1)?${"q".repeat(250)})`, options);
      expect(attrSet(el.querySelector("a"))).toEqual({});
    }
  });

  it("tells the link hook it withheld the link, and gives it the URL", () => {
    const seen: unknown[] = [];
    render(`[x](${PAYLOAD}) [y](https://e.example/)`, {
      hooks: {
        link: (n) => {
          seen.push([n.url?.href, n.raw, n.withheld]);
        },
      },
    });
    expect(seen).toEqual([
      [PAYLOAD, PAYLOAD, true],
      ["https://e.example/", "https://e.example/", false],
    ]);
  });

  it("withholds a link streamed one character at a time", () => {
    const el = host();
    const sink = createDomSink(el);
    const parser = createParser(sink);
    for (const ch of `see [file an issue](${PAYLOAD}) now`) {
      parser.write(ch);
    }
    parser.end();
    sink.end();
    expect(el.querySelector("a[href]")).toBeNull();
    expect(el.querySelector("a")?.textContent).toBe(`file an issue${PAYLOAD}`);
  });

  it("leaves no payload-shaped address on an anchor, whatever the query", () => {
    const query = fc.oneof(
      fc.string({ maxLength: 260 }).map((s) => encodeURIComponent(s)),
      fc.constantFrom(
        `k=${"%2F".repeat(22)}`,
        `t=${"AKIA"}${"ABCDEFGHIJKLMNOP"}`,
        `b=${"Q".repeat(44)}`,
      ),
    );
    const producers = [
      (u: string) => `x ${u} y`,
      (u: string) => `[t](${u})`,
      (u: string) => `x <${u}> y`,
      (u: string) => `x [t][r] y\n\n[r]: ${u}\n`,
    ];
    fc.assert(
      fc.property(query, fc.constantFrom(...producers), (q, produce) => {
        const el = render(produce(`https://e.example/p?${q}`));
        for (const a of el.querySelectorAll("a[href]")) {
          expect(payloadShaped(new URL(a.getAttribute("href") ?? ""))).toBe(false);
        }
        el.remove();
      }),
      { numRuns: 200 },
    );
  });
});

describe("images", () => {
  it("renders an image as a link to its source by default, labelled by its alt", () => {
    const a = render('![a cat](https://e.example/cat.png "Title")').querySelector("a");
    expect(attrSet(a)).toEqual({
      href: "https://e.example/cat.png",
      title: "Title",
      rel: REL,
      target: "_blank",
    });
    expect(a?.textContent).toBe("a cat");
    expect(document.querySelector("img")).toBeNull();
  });

  it("labels the link form by host and path when alt is empty", () => {
    const a = render("![](https://e.example/img/cat.png?size=2)").querySelector("a");
    expect(a?.textContent).toBe("e.example/img/cat.png");
  });

  it("withholds a payload-shaped link form", () => {
    const el = render(`![x](${PAYLOAD})`);
    expect(el.querySelector("a[href]")).toBeNull();
    expect(el.querySelector("a[data-cp-withheld]")).not.toBeNull();
  });

  it("loads in load mode with the exact attribute set, src last", () => {
    const set: string[] = [];
    const el = host();
    const collect = (records: MutationRecord[]): void => {
      for (const r of records) {
        if (r.type === "attributes" && r.attributeName !== null) {
          set.push(r.attributeName);
        }
      }
    };
    const mo = new MutationObserver(collect);
    mo.observe(el, { subtree: true, attributes: true, childList: true });
    renderMarkdown(el, '![a cat](https://e.example/cat.png "T")', { images: "load" });
    collect(mo.takeRecords());
    mo.disconnect();
    const img = el.querySelector("img");
    expect(attrSet(img)).toEqual({
      alt: "a cat",
      title: "T",
      referrerpolicy: "no-referrer",
      loading: "lazy",
      src: "https://e.example/cat.png",
    });
    expect(set.at(-1)).toBe("src");
    expect(el.querySelector("a")).toBeNull();
  });

  it("keeps an empty alt on a loaded image", () => {
    expect(
      attrSet(render("![](https://e.example/c.png)", { images: "load" }).querySelector("img")),
    ).toMatchObject({ alt: "" });
  });

  it.each(["javascript:alert(1)", "data:image/svg+xml,x", "&#x64;ata:text/html,x", "vbscript:x"])(
    "renders a gate-refused %j as its label in an anchor with no href",
    (src) => {
      for (const images of ["link", "load"] as const) {
        const el = render(`![shown](${src})`, { images });
        expect(el.querySelector("img")).toBeNull();
        expect(attrSet(el.querySelector("a"))).toEqual({});
        expect(el.textContent).toBe("shown");
      }
    },
  );

  it("names a refused image with no alt", () => {
    expect(render("![](javascript:x)").textContent).toBe("Image");
  });

  it("renders the link form when urls refuses only the src", () => {
    const kinds: string[] = [];
    const el = render("![x](https://e.example/c.png)", {
      images: "load",
      urls: (_u, _r, kind) => {
        kinds.push(kind);
        return kind === "href";
      },
    });
    expect(kinds).toEqual(["src", "href"]);
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector("a")?.getAttribute("href")).toBe("https://e.example/c.png");
  });

  it("renders the refused link form when urls refuses both", () => {
    const el = render("![x](https://e.example/c.png)", { images: "load", urls: () => false });
    expect(el.querySelector("img")).toBeNull();
    expect(attrSet(el.querySelector("a"))).toEqual({});
  });

  it("renders the withheld link form in load mode for a payload-shaped source", () => {
    const el = render(`![x](${PAYLOAD})`, { images: "load" });
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector("a[data-cp-withheld]")).not.toBeNull();
  });

  it("runs the image hook before src, with the img attached and its policy set", () => {
    const seen: unknown[] = [];
    render('![a](https://e.example/c.png "t")', {
      images: "load",
      hooks: {
        image: (n, el) => {
          seen.push([
            n.url?.href,
            n.raw,
            n.alt,
            n.title,
            el.tagName,
            el.hasAttribute("src"),
            el.getAttribute("referrerpolicy"),
            el.getAttribute("loading"),
            el.parentElement?.tagName,
          ]);
        },
      },
    });
    expect(seen).toEqual([
      [
        "https://e.example/c.png",
        "https://e.example/c.png",
        "a",
        "t",
        "IMG",
        false,
        "no-referrer",
        "lazy",
        "P",
      ],
    ]);
  });

  it("fetches nothing for an image a hook replaces", async () => {
    const probe = (n: string): string =>
      new URL(`/icons/svg/x.svg?probe=${n}-${String(Math.random())}`, location.href).href;
    const replaced = probe("replaced");
    const kept = probe("kept");
    const srcWrites: string[] = [];
    const el = host();
    const collect = (records: MutationRecord[]): void => {
      for (const r of records) {
        if (r.attributeName === "src") {
          srcWrites.push((r.target as Element).getAttribute("src") ?? "");
        }
      }
    };
    const mo = new MutationObserver(collect);
    mo.observe(el, { subtree: true, attributes: true });
    const hooks: Hooks = {
      image: (n) => (n.url?.href === replaced ? document.createTextNode("[card]") : undefined),
    };
    renderMarkdown(el, `![r](${replaced})\n\n![k](${kept})`, {
      images: "load",
      base: document.baseURI,
      hooks,
    });
    const img = el.querySelector("img");
    expect(img?.getAttribute("src")).toBe(kept);
    await new Promise<void>((resolve) => {
      if (img?.complete === true) {
        resolve();
      }
      img?.addEventListener("load", () => resolve(), { once: true });
      img?.addEventListener("error", () => resolve(), { once: true });
    });
    collect(mo.takeRecords());
    mo.disconnect();
    const fetched = performance.getEntriesByType("resource").map((e) => e.name);
    expect(fetched).toContain(kept);
    expect(fetched).not.toContain(replaced);
    expect(srcWrites).toEqual([kept]);
    expect(el.textContent).toContain("[card]");
  });

  it("loads an img a hook wraps", () => {
    const el = render("![a](https://e.example/c.png)", {
      images: "load",
      hooks: {
        image: (_n, img) => {
          const figure = document.createElement("figure");
          figure.append(img);
          return figure;
        },
      },
    });
    expect(el.querySelector("p > figure > img")?.getAttribute("src")).toBe(
      "https://e.example/c.png",
    );
  });

  it("loads an img a hook returns itself", () => {
    const el = render("![a](https://e.example/c.png)", {
      images: "load",
      hooks: { image: (_n, img) => img },
    });
    expect(el.querySelector("img")?.getAttribute("src")).toBe("https://e.example/c.png");
  });

  it("gives no src to an img a hook detached and kept nothing in place of", () => {
    let held: Element | null = null;
    render("![a](https://e.example/c.png)", {
      images: "load",
      hooks: {
        image: (_n, el) => {
          held = el;
          el.remove();
        },
      },
    });
    expect((held as Element | null)?.hasAttribute("src")).toBe(false);
  });
});

describe("hooks", () => {
  it("replace an element with what they return", () => {
    const el = render("see [x](https://e.example/) here", {
      hooks: { link: () => document.createTextNode("LINK") },
    });
    expect(el.innerHTML).toBe("<p>see LINK here</p>");
  });

  it("wrap an element by returning a new one holding it", () => {
    const el = render("[x](https://e.example/)", {
      hooks: {
        link: (_n, a) => {
          const wrap = document.createElement("span");
          wrap.className = "app-card";
          wrap.append(a);
          return wrap;
        },
      },
    });
    expect(el.querySelector(".app-card > a[href]")?.textContent).toBe("x");
  });

  it("may move the element themselves and return nothing", () => {
    const aside = host();
    const el = render("[x](https://e.example/) y", {
      hooks: {
        link: (_n, a) => {
          aside.append(a);
        },
      },
    });
    expect(aside.querySelector("a")?.textContent).toBe("x");
    expect(el.innerHTML).toBe("<p> y</p>");
  });

  it("run with the element attached to its parent", () => {
    const parents: (string | undefined)[] = [];
    const record = (_n: unknown, el: Element): undefined => {
      parents.push(el.parentElement?.tagName);
    };
    render("[a](https://e.example/) ![b](https://e.example/b.png) $x$\n\n```\nc\n```", {
      hooks: {
        link: record,
        image: record,
        math: record,
        code: record,
      },
    });
    expect(parents).toEqual(["P", "P", "P", "DIV"]);
  });

  it("give math its TeX and whether it is display math", () => {
    const seen: unknown[] = [];
    render("a $x^2$ b\n\n$$\n\\frac{a}{b}\n$$\n", {
      hooks: {
        math: (n, el) => {
          seen.push([n.tex, n.display, el.getAttribute("data-math")]);
        },
      },
    });
    expect(seen).toEqual([
      ["x^2", false, "inline"],
      ["\\frac{a}{b}\n", true, "block"],
    ]);
  });

  it("run inner hooks before block, and block once per top-level block", () => {
    const calls: string[] = [];
    render(
      "> [a](https://e.example/)\n\n- b\n- c\n\n```go\nx\n```\n\n| h |\n|---|\n| 1 |\n\ntail",
      {
        hooks: {
          link: () => {
            calls.push("link");
          },
          code: () => {
            calls.push("code");
          },
          block: (el) => {
            calls.push(`block:${el.tagName}${el.className === "" ? "" : `.${el.className}`}`);
          },
        },
      },
    );
    expect(calls).toEqual([
      "link",
      "block:BLOCKQUOTE",
      "block:UL",
      "code",
      "block:DIV.cp-code",
      "block:DIV.cp-table-scroll",
      "block:P",
    ]);
  });

  it("give block what the block's own hook left", () => {
    const seen: Element[] = [];
    const card = document.createElement("figure");
    render("```mermaid\ngraph\n```", {
      hooks: {
        code: () => card,
        block: (el) => {
          seen.push(el);
        },
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(card);
  });

  it("let block replace a block", () => {
    const el = render("a\n\nb", {
      hooks: {
        block: (p) => {
          const div = document.createElement("section");
          div.append(...p.childNodes);
          return div;
        },
      },
    });
    expect(el.innerHTML).toBe("<section>a</section><section>b</section>");
  });

  it("run for the last block, which the text never ended", () => {
    const calls: string[] = [];
    render("first\n\nlast [x](https://e.example/)", {
      hooks: {
        link: () => {
          calls.push("link");
        },
        block: (el) => {
          calls.push(el.textContent);
        },
      },
    });
    expect(calls).toEqual(["first", "link", "last x"]);
  });
});

describe("code blocks", () => {
  it("are the language's one code block, built when the fence opens", () => {
    const el = host();
    const sink = createDomSink(el);
    const parser = createParser(sink);
    parser.write("```go\nfunc");
    const block = el.firstElementChild;
    expect(attrSet(block)).toEqual({ class: "cp-code", "data-variant": "block" });
    const [bar, pre, hint] = block?.children ?? [];
    expect(attrSet(bar ?? null)).toEqual({ "data-part": "bar" });
    const [lang, actions] = bar?.children ?? [];
    expect(attrSet(lang ?? null)).toEqual({ "data-part": "lang" });
    expect(lang?.textContent).toBe("Go");
    expect(attrSet(actions ?? null)).toEqual({ "data-part": "actions" });
    const copy = actions?.firstElementChild;
    expect(actions?.children).toHaveLength(1);
    expect(attrSet(copy ?? null)).toEqual({
      class: "cp-button cp-copy",
      type: "button",
      "data-variant": "quiet",
      "data-size": "sm",
    });
    expect(copy?.textContent).toBe("Copy");
    expect(pre?.tagName).toBe("PRE");
    const code = pre?.firstElementChild;
    expect(attrSet(code ?? null)).toEqual({ class: "language-go" });
    expect(code?.textContent).toBe("func");
    expect(code?.querySelector("[data-token]")).toBeNull();
    expect(hint?.className).toBe("cp-help");
    expect((hint as HTMLElement | undefined)?.hidden).toBe(true);
    parser.end();
    sink.end();
    expect(code?.querySelector('[data-token="keyword"]')?.textContent).toBe("func");
  });

  it.each([
    ["```ts\nlet x: number = 1;\n```", "TypeScript", "language-ts"],
    ["```golang\nx\n```", "Go", "language-golang"],
    ["```weird-lang\nx\n```", "weird-lang", "language-weird-lang"],
    ["```\npackage main\n\nfunc main() {\n}\n```", "Go", null],
    ["```\nplain words here\n```", "", null],
    ["    indented", "", null],
  ])("label %j as %j", (md, label, cls) => {
    const el = render(md);
    expect(el.querySelector('[data-part="lang"]')?.textContent).toBe(label);
    expect(el.querySelector("code")?.getAttribute("class")).toBe(cls);
  });

  it("keep only a fence tag that matches the pattern", () => {
    const el = render('```a"b c\nx\n```');
    expect(el.querySelector("pre > code")?.getAttribute("class")).toBeNull();
    expect(el.querySelector('[data-part="lang"]')?.textContent).toBe("");
  });

  it("colour an untagged block detection names, before the code hook", () => {
    let coloured = false;
    render("```\n#!/bin/sh\necho hi\n```", {
      hooks: {
        code: (_n, el) => {
          coloured = el.querySelector("[data-token]") !== null;
        },
      },
    });
    expect(coloured).toBe(true);
  });

  it("stay uncoloured with highlight false", () => {
    const el = render("```go\nfunc main() {}\n```", { highlight: false });
    expect(el.querySelector("[data-token]")).toBeNull();
    expect(el.querySelector("code")?.textContent).toBe("func main() {}");
    expect(el.querySelector('[data-part="lang"]')?.textContent).toBe("Go");
  });

  it("give the code hook the tag as written, the text and whether it closed", () => {
    const seen: unknown[] = [];
    const code: Hooks["code"] = (n, el) => {
      seen.push([n.lang, n.text, n.closed, el.className]);
    };
    render("```Shell\nls\n```\n\n```mermaid\ngraph", { hooks: { code } });
    expect(seen).toEqual([
      ["Shell", "ls", true, "cp-code"],
      ["mermaid", "graph", false, "cp-code"],
    ]);
  });

  it("keep markup in the code as text", () => {
    const el = render("```html\n<script>alert(1)</script>\n```");
    expect(el.querySelector("script")).toBeNull();
    expect(el.querySelector("code")?.textContent).toBe("<script>alert(1)</script>");
  });

  it("take a tab stop only while the pre overflows", async () => {
    const narrow = host(200);
    renderMarkdown(narrow, `\`\`\`\n${"x".repeat(400)}\n\`\`\`\n\n\`\`\`\nshort\n\`\`\``);
    await frame();
    await frame();
    const [long, short] = narrow.querySelectorAll("pre");
    expect(long?.getAttribute("tabindex")).toBe("0");
    expect(short?.hasAttribute("tabindex")).toBe(false);
  });

  it("strip an indented fence's indent from its lines, so Copy takes the code as written", async () => {
    const written: string[] = [];
    clipboard((text) => {
      written.push(text);
      return Promise.resolve();
    });
    const el = render("  ```py\n  def f():\n      return 1\n  ```");
    expect(el.querySelector("code")?.textContent).toBe("def f():\n    return 1");
    const copy = el.querySelector<HTMLButtonElement>(".cp-copy");
    copy?.click();
    await expect.poll(() => copy?.dataset["cpState"]).toBe("done");
    expect(written).toEqual(["def f():\n    return 1"]);
  });

  it("stay in a list item after a blank line, the list whole", () => {
    const el = render("1. Install:\n\n   ```sh\n   npm i x\n   ```\n2. Run it");
    expect(el.children).toHaveLength(1);
    const items = el.querySelectorAll("ol > li");
    expect(items).toHaveLength(2);
    expect(items[0]?.querySelector(".cp-code code")?.textContent).toBe("npm i x");
    expect(items[1]?.textContent).toBe("Run it");
  });

  function clipboard(write: (text: string) => Promise<void>): void {
    vi.stubGlobal("navigator", { platform: "Linux", clipboard: { writeText: write } });
  }

  it("copy the block's text", async () => {
    const written: string[] = [];
    clipboard((text) => {
      written.push(text);
      return Promise.resolve();
    });
    const el = render("```go\nfunc main() {}\n```");
    const copy = el.querySelector<HTMLButtonElement>(".cp-copy");
    copy?.click();
    await expect.poll(() => copy?.dataset["cpState"]).toBe("done");
    expect(written).toEqual(["func main() {}"]);
  });

  it("select the block's text in place, the hint inside the block, when the clipboard refuses", async () => {
    clipboard(() => Promise.reject(new Error("denied")));
    const el = render("```go\nfunc main() {}\n```");
    const hint = el.querySelector<HTMLElement>(".cp-code > .cp-help");
    el.querySelector<HTMLButtonElement>(".cp-copy")?.click();
    await expect.poll(() => hint?.hidden).toBe(false);
    expect(getSelection()?.toString()).toBe("func main() {}");
    expect(getSelection()?.anchorNode?.parentElement?.closest("pre")).not.toBeNull();
  });

  it("keep Copy's hint inside the block", () => {
    const el = render("```\nx\n```");
    const block = el.querySelector(".cp-code");
    expect(block?.querySelector(":scope > .cp-help")).not.toBeNull();
    expect(el.querySelectorAll(".cp-help")).toHaveLength(1);
  });
});

describe("the table region", () => {
  const wide = `| ${Array.from({ length: 30 }, (_, i) => `column ${String(i)}`).join(" | ")} |\n|${"---|".repeat(30)}\n| ${"x | ".repeat(30)}`;

  it("is a named, focusable region only while the table overflows", async () => {
    const narrow = host(200);
    renderMarkdown(narrow, `${wide}\n\nbetween\n\n| a |\n|---|\n| 1 |`);
    await frame();
    await frame();
    const [over, fits] = narrow.querySelectorAll(".cp-table-scroll");
    expect(attrSet(over ?? null)).toEqual({
      class: "cp-table-scroll",
      role: "region",
      "aria-label": "Table",
      tabindex: "0",
    });
    expect(attrSet(fits ?? null)).toEqual({ class: "cp-table-scroll" });
  });

  it("drops all three when the host widens, and stops watching after an abort", async () => {
    const live = host(200);
    renderMarkdown(live, wide);
    const aborted = new AbortController();
    const still = host(200);
    renderMarkdown(still, wide, { signal: aborted.signal });
    await frame();
    await frame();
    aborted.abort();
    // An aborted render still rendered: the signal stops what follows, not what was done.
    expect(still.querySelector(".cp-table-scroll")?.getAttribute("role")).toBe("region");
    live.style.inlineSize = "20000px";
    still.style.inlineSize = "20000px";
    await frame();
    await frame();
    expect(attrSet(live.querySelector(".cp-table-scroll"))).toEqual({ class: "cp-table-scroll" });
    expect(still.querySelector(".cp-table-scroll")?.getAttribute("role")).toBe("region");
  });
});

describe("lists", () => {
  it("renders numbered steps split by blank lines as one list", () => {
    const el = render("1. Install:\n\n   ```sh\n   npm i x\n   ```\n\n2. Run it");
    expect(el.querySelectorAll("ol")).toHaveLength(1);
    const items = el.querySelectorAll("ol > li");
    expect(items).toHaveLength(2);
    expect(items[0]?.querySelector(".cp-code code")?.textContent).toBe("npm i x");
    expect(items[1]?.textContent).toBe("Run it");
  });

  it("renders a table on the marker's line inside the item", () => {
    const el = render("- | a |\n  |---|\n  | 1 |\n");
    const table = el.querySelector("li > div.cp-table-scroll > table");
    expect(table?.querySelector("th")?.textContent.trim()).toBe("a");
    expect(table?.querySelector("td")?.textContent.trim()).toBe("1");
  });
});

describe("a cell past the header's count", () => {
  it("builds nothing and runs no hook", () => {
    const link = vi.fn(() => undefined);
    const image = vi.fn(() => undefined);
    const el = render(
      "| a |\n|---|\n| x | ![i](https://e.example/drop.png) [l](https://e.example/l) |",
      { images: "load", hooks: { link, image } },
    );
    expect(link).not.toHaveBeenCalled();
    expect(image).not.toHaveBeenCalled();
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelectorAll("tbody td")).toHaveLength(1);
    expect(el.querySelector("tbody td")?.textContent?.trim()).toBe("x");
  });
});

describe("signal", () => {
  it("renders nothing when already aborted", () => {
    const el = render("# a\n\nb", { signal: AbortSignal.abort() });
    expect(el.childNodes).toHaveLength(0);
  });

  it("stops a sink's later operations and hooks", () => {
    const ac = new AbortController();
    const calls: string[] = [];
    const el = host();
    const sink = createDomSink(el, {
      signal: ac.signal,
      hooks: {
        block: (b) => {
          calls.push(b.textContent);
        },
      },
    });
    const parser = createParser(sink);
    parser.write("one\n\ntwo");
    ac.abort();
    parser.write("\n\nthree");
    parser.end();
    sink.end();
    expect(calls).toEqual(["one"]);
    expect(el.textContent).toMatch(/^onetwo?$/);
  });
});

describe("maxBytes", () => {
  it("cuts the text at the limit, shows one line at the cut and closes the last block", () => {
    const calls: string[] = [];
    const el = render(`${"a".repeat(10)}\n\n${"b".repeat(30)}`, {
      maxBytes: 20,
      hooks: {
        block: (b) => {
          calls.push(b.textContent);
        },
      },
    });
    expect(el.children).toHaveLength(3);
    expect(el.children[1]?.textContent).toBe("b".repeat(8));
    expect(el.lastElementChild?.hasAttribute("data-cp-truncated")).toBe(true);
    expect(el.querySelectorAll("[data-cp-truncated]")).toHaveLength(1);
    expect(calls).toEqual(["a".repeat(10), "b".repeat(8)]);
  });

  it("names a limit under a kilobyte in bytes", () => {
    const line = render("a".repeat(30), { maxBytes: 20 }).querySelector("[data-cp-truncated]");
    expect(line?.textContent).toBe("The text stops here, after its first 20 bytes.");
  });

  it("counts UTF-8 bytes and never splits a code point", () => {
    // "é" is 2 bytes, "😀" 4: 3 + 2 + 4 = 9 fit in 10, the next "😀" does not.
    const el = render("abcé😀😀", { maxBytes: 10 });
    expect(el.firstElementChild?.textContent).toBe("abcé😀");
    expect(el.querySelector("[data-cp-truncated]")).not.toBeNull();
  });

  it("counts an unpaired surrogate as U+FFFD's 3 bytes", () => {
    // TextEncoder writes a lone surrogate as U+FFFD: 1 + 3 + 1 = 5.
    expect(new TextEncoder().encode("a\uD800b")).toHaveLength(5);
    expect(render("a\uD800b", { maxBytes: 5 }).querySelector("[data-cp-truncated]")).toBeNull();
    const cut = render("a\uD800bc", { maxBytes: 5 });
    expect(cut.firstElementChild?.textContent).toBe("a\uD800b");
    expect(cut.querySelector("[data-cp-truncated]")).not.toBeNull();
  });

  it("keeps a lone lead surrogate that fits as U+FFFD's 3 bytes", () => {
    expect(new TextEncoder().encode("A\uD800")).toHaveLength(4);
    expect(render("\uD800", { maxBytes: 3 }).textContent).toBe("\uD800");
    const after = render("A\uD800", { maxBytes: 4 });
    expect(after.textContent).toBe("A\uD800");
    expect(after.querySelector("[data-cp-truncated]")).toBeNull();
    const over = render("A\uD800", { maxBytes: 3 });
    expect(over.firstElementChild?.textContent).toBe("A");
    expect(over.querySelector("[data-cp-truncated]")).not.toBeNull();
  });

  it("charges a pair split across chunks its 4 bytes, and cuts before it whole", () => {
    const fits = byteBudget(4);
    expect(fits.take("\uD83D") + fits.take("\uDE00") + fits.flush()).toBe("\uD83D\uDE00");
    expect(fits.cut).toBe(false);
    expect(fits.take("a")).toBe("");
    expect(fits.cut).toBe(true);
    const short = byteBudget(3);
    expect(short.take("\uD83D") + short.take("\uDE00") + short.flush()).toBe("");
    expect(short.cut).toBe(true);
    const lone = byteBudget(4);
    expect(lone.take("\uD800") + lone.take("a") + lone.flush()).toBe("\uD800a");
    expect(lone.cut).toBe(false);
  });

  it("shows no line when the text fits exactly", () => {
    const el = render("abcé😀", { maxBytes: 9 });
    expect(el.querySelector("[data-cp-truncated]")).toBeNull();
    expect(el.textContent).toBe("abcé😀");
  });

  it("defaults to 1 MiB", () => {
    // "あ" is 3 UTF-8 bytes: 349,525 of them and one "a" make 1,048,576 in a
    // third of the characters an ASCII text needs.
    const exact = "あ".repeat(349_525) + "a";
    const under = render(exact);
    expect(under.querySelector("[data-cp-truncated]")).toBeNull();
    const over = render(`${exact}a`);
    expect(over.querySelector("[data-cp-truncated]")?.textContent).toBe(
      "The text stops here, after its first 1 MB.",
    );
    expect(over.firstElementChild?.textContent).toBe(exact);
  });

  it("closes a fence cut short as unclosed", () => {
    let closed: boolean | undefined;
    render("```\nabcdefghij\n```", {
      maxBytes: 10,
      hooks: {
        code: (n) => {
          closed = n.closed;
        },
      },
    });
    expect(closed).toBe(false);
  });

  it.each([-1, 1.5, Number.NaN])("refuses %d", (maxBytes) => {
    expect(() => render("x", { maxBytes })).toThrow(RangeError);
  });
});

/** The attributes each element of the vocabulary may carry. */
const COLUMNS: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  Object.entries({
    P: [],
    H1: [],
    H2: [],
    H3: [],
    H4: [],
    H5: [],
    H6: [],
    BLOCKQUOTE: [],
    HR: [],
    BR: [],
    EM: [],
    STRONG: [],
    DEL: [],
    UL: [],
    LI: [],
    OL: ["start"],
    CODE: ["class", "data-math"],
    INPUT: ["type", "checked", "disabled", "aria-label"],
    TABLE: [],
    THEAD: [],
    TBODY: [],
    TR: [],
    TH: ["data-align"],
    TD: ["data-align"],
    A: ["href", "title", "rel", "target", "data-cp-withheld"],
    IMG: ["src", "alt", "title", "loading", "referrerpolicy"],
    PRE: ["tabindex"],
    DIV: ["class", "data-variant", "data-part", "role", "aria-label", "tabindex"],
    SPAN: ["class", "data-part", "data-token", "hidden", "aria-hidden"],
    BUTTON: ["class", "type", "data-variant", "data-size"],
  }).map(([tag, names]) => [tag, new Set(names)]),
);

function expectInVocabulary(root: Element, base?: URL): void {
  for (const node of root.querySelectorAll("*")) {
    const column = COLUMNS.get(node.tagName);
    expect(column, node.tagName).toBeDefined();
    for (const name of node.getAttributeNames()) {
      expect(column?.has(name), `${node.tagName}[${name}]`).toBe(true);
    }
    for (const name of ["href", "src"]) {
      const value = node.getAttribute(name);
      if (value !== null) {
        expect(["http:", "https:", "mailto:"]).toContain(new URL(value, base).protocol);
        if (base === undefined) {
          expect(() => new URL(value)).not.toThrow();
        }
      }
    }
  }
}

const PIECES = [
  "[",
  "]",
  "(",
  ")",
  "](",
  "![",
  "<",
  ">",
  "`",
  "```",
  "~~",
  "*",
  "**",
  "_",
  "$",
  "$$",
  "\\",
  "|",
  "|---|",
  "#",
  "> ",
  "- ",
  "1. ",
  "- [x] ",
  "\n",
  "\n\n",
  " ",
  "    ",
  "a",
  "word",
  "http://",
  "https://e.example/",
  "javascript:",
  "data:",
  "vbscript:",
  "&#58;",
  "&#x6a;",
  "&amp;",
  "<script>",
  "<img onerror=x>",
  '"',
  "'",
  "mailto:",
  "//",
  "%2e%2e/",
  "../",
];

const markdownish = fc.array(fc.constantFrom(...PIECES), { maxLength: 60 }).map((p) => p.join(""));

describe("the allowlist", () => {
  it("holds for any text: every element and attribute in its column", () => {
    fc.assert(
      fc.property(
        fc.oneof(markdownish, fc.string({ maxLength: 300 })),
        fc.boolean(),
        (md, load) => {
          const el = render(md, { images: load ? "load" : "link" });
          expectInVocabulary(el);
          el.remove();
        },
      ),
      { numRuns: 500 },
    );
  });

  it("holds with a base", () => {
    const base = new URL(document.baseURI);
    fc.assert(
      fc.property(markdownish, (md) => {
        const el = render(md, { base, images: "load" });
        expectInVocabulary(el, base);
        el.remove();
      }),
      { numRuns: 300 },
    );
  });

  it("holds for any operations a sink receives", () => {
    const kinds = fc.oneof(
      fc.constantFrom<Kind>(
        "paragraph",
        "heading-1",
        "heading-6",
        "code",
        "code-inline",
        "emphasis",
        "strong",
        "strike",
        "link",
        "image",
        "blockquote",
        "break",
        "rule",
        "list-unordered",
        "list-ordered",
        "list-item",
        "checkbox",
        "table",
        "table-row",
        "table-cell",
        "equation-block",
        "equation-inline",
      ),
      fc.constantFrom(
        "script",
        "iframe",
        "style",
        "heading-9",
        "constructor",
        "__proto__",
      ) as unknown as fc.Arbitrary<Kind>,
    );
    const names = fc.constantFrom(
      "href",
      "src",
      "title",
      "lang",
      "checked",
      "start",
      "align",
      "unclosed",
      "onclick",
      "style",
      "class",
      "constructor",
    );
    const values = fc.constantFrom(
      "javascript:alert(1)",
      "https://e.example/",
      'x" onmouseover="y',
      "1",
      "a,b,center",
      "go",
      "x y",
      "<b>",
      "data:text/html,x",
      "",
    );
    const op = fc.oneof(
      kinds.map((k) => (s: ReturnType<typeof createDomSink>) => {
        s.open(k);
      }),
      fc.constant((s: ReturnType<typeof createDomSink>) => {
        s.close();
      }),
      fc.string({ maxLength: 8 }).map((t) => (s: ReturnType<typeof createDomSink>) => {
        s.text(t);
      }),
      fc.tuple(names, values).map(([n, v]) => (s: ReturnType<typeof createDomSink>) => {
        s.attr(n as "href", v);
      }),
    );
    fc.assert(
      fc.property(fc.array(op, { maxLength: 40 }), fc.boolean(), (ops, load) => {
        const el = host();
        const sink = createDomSink(el, { images: load ? "load" : "link" });
        for (const apply of ops) {
          apply(sink);
        }
        sink.end();
        expectInVocabulary(el);
        el.remove();
      }),
      { numRuns: 500 },
    );
  });

  it("never yields an event handler, a script or a blocked scheme from a link or image", () => {
    const blocked = fc.constantFrom(
      "javascript:alert(1)",
      "JavaScript:alert(document.cookie)",
      "javascript&#58;alert(1)",
      "&#x6a;avascript:alert(1)",
      "java\tscript:alert(1)",
      "&NewLine;javascript:alert(1)",
      "&#1;javascript:alert(1)",
      "&#32;&#1;&#32;javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "&#100;ata:text/html,x",
      "vbscript:msgbox",
      "&#118;bscript:msgbox",
      "file:///etc/passwd",
    );
    const forms = [
      (u: string) => `[t](${u})`,
      (u: string) => `![t](${u})`,
      (u: string) => `x <${u}> y`,
      (u: string) => `[t][r]\n\n[r]: ${u}\n`,
    ];
    fc.assert(
      fc.property(blocked, fc.constantFrom(...forms), fc.boolean(), (url, form, load) => {
        const el = render(form(url), { images: load ? "load" : "link" });
        expect(el.querySelector("[href], [src], script")).toBeNull();
        el.remove();
      }),
      { numRuns: 300 },
    );
  });
});
