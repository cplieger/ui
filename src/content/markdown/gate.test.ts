import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";

import { fragmentOnly, gate, payloadShaped, withheld, written } from "./gate.js";
import { createParser } from "./parser.js";

const BASE = new URL("https://app.example/chat/1");

/** What the gate makes of a destination: the URL it checked, or null. */
function href(raw: string, base: URL | null = BASE): string | null {
  return gate(raw, base)?.url.href ?? null;
}

/** The `href` or `src` the parser hands the sink for one markdown line. */
function destination(markdown: string): string {
  const values: string[] = [];
  let depth = 0;
  const p = createParser({
    open() {
      depth += 1;
    },
    close() {
      depth -= 1;
    },
    text(s) {
      expect(s).not.toContain("](");
    },
    attr(name, value) {
      if (name === "href" || name === "src") {
        values.push(value);
      }
    },
  });
  p.write(markdown);
  p.end();
  expect(depth).toBe(0);
  expect(values).toHaveLength(1);
  return values[0] ?? "";
}

describe("gate: schemes", () => {
  it.each([
    ["http://e.example/a", "http://e.example/a"],
    ["https://e.example/a?q=1#f", "https://e.example/a?q=1#f"],
    ["HTTPS://E.EXAMPLE/a b", "https://e.example/a%20b"],
    ["mailto:a@b.example", "mailto:a@b.example"],
    ["MailTo:a@b.example", "mailto:a@b.example"],
    ["https:\\\\e.example\\a", "https://e.example/a"],
    ["https:e.example/a", "https://e.example/a"],
  ])("admits %j as %j", (raw, want) => {
    expect(href(raw)).toBe(want);
    expect(href(raw, null)).toBe(want);
    expect(gate(raw, BASE)?.relative).toBe(false);
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:image/png;base64,AAAA",
    "file:///etc/passwd",
    "ftp://e.example/a",
    "blob:https://app.example/1",
    "about:blank",
    "tel:+1555",
    "web+app:x",
    "c:\\windows",
    "x:",
    "http://",
    "https://e.example:99999/",
    "https://[::1/",
  ])("refuses %j", (raw) => {
    expect(href(raw)).toBeNull();
    expect(href(raw, null)).toBeNull();
  });
});

describe("gate: whitespace and controls", () => {
  it.each([
    ["  https://e.example/  ", "https://e.example/"],
    ["\x00https://e.example/", "https://e.example/"],
    ["ht\x01tps://e.example/", "https://e.example/"],
    ["ht\ttps://e.example/", "https://e.example/"],
    ["https://e.\nexample/", "https://e.example/"],
    ["\u00a0https://e.example/", "https://e.example/"],
  ])("strips them from %j before the scheme is read", (raw, want) => {
    expect(href(raw)).toBe(want);
  });

  it.each([
    "java\x01script:alert(1)",
    "\x00javascript:alert(1)",
    "\x1fjavascript:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "javascript\r:alert(1)",
    "\u00a0javascript:alert(1)",
    "\ufeffjavascript:alert(1)",
    "\u3000data:text/html,x",
  ])("refuses the hidden scheme in %j, with or without a base", (raw) => {
    expect(href(raw)).toBeNull();
    expect(href(raw, null)).toBeNull();
  });

  it.each(["", "   ", "\x00\x01", "\t\n"])("refuses the empty destination %j", (raw) => {
    expect(href(raw)).toBeNull();
  });
});

describe("gate: character references", () => {
  it.each([
    ["[x](&#106;avascript:alert(1))", "javascript:alert(1)"],
    ["[x](&#x6A;avascript:alert(1))", "javascript:alert(1)"],
    ["[x](&#X6a;avascript:alert(1))", "javascript:alert(1)"],
    ["[x](java&#115;cript:alert(1))", "javascript:alert(1)"],
    ["[x](&#0000106;avascript:alert(1))", "javascript:alert(1)"],
    ["[x](java&#x09;script:alert(1))", "java\tscript:alert(1)"],
    ["![x](&#100;ata:image/png,AAAA)", "data:image/png,AAAA"],
  ])("decodes %j once, and the gate refuses it", (markdown, decoded) => {
    const raw = destination(markdown);
    expect(raw).toBe(decoded);
    expect(href(raw)).toBeNull();
  });

  it("decodes once, so an encoded reference stays text and the scheme is no scheme", () => {
    const raw = destination("[x](&amp;#106;avascript:alert(1))");
    expect(raw).toBe("&#106;avascript:alert(1)");
    expect(href(raw, null)).toBeNull();
    // The browser reads no scheme either: the `&` ends it before any `:`.
    expect(href(raw)).toBe("https://app.example/chat/&#106;avascript:alert(1)");
  });

  it("leaves a reference outside HTML 4.01's set as text", () => {
    const raw = destination("[x](javascript&colon;alert(1))");
    expect(raw).toBe("javascript&colon;alert(1)");
    expect(href(raw, null)).toBeNull();
  });
});

describe("gate: protocol-relative and backslash hosts", () => {
  it.each([
    ["//e.example/x", "https://e.example/x"],
    ["\\\\e.example\\x", "https://e.example/x"],
    ["/\\e.example/x", "https://e.example/x"],
    ["\\/e.example/x", "https://e.example/x"],
    ["  //E.example", "https://e.example/"],
  ])("reads %j as https, needing no base", (raw, want) => {
    expect(href(raw, null)).toBe(want);
    expect(href(raw)).toBe(want);
    expect(gate(raw, BASE)?.relative).toBe(false);
  });

  it.each(["//", "\\\\", "///", "//e.example:99999/"])(
    "refuses the hostless or invalid %j",
    (raw) => {
      expect(href(raw)).toBeNull();
    },
  );
});

describe("gate: relative destinations", () => {
  it.each([
    ["docs/a.md", "https://app.example/chat/docs/a.md"],
    ["/workspace/a.md", "https://app.example/workspace/a.md"],
    ["?page=2", "https://app.example/chat/1?page=2"],
    ["#section", "https://app.example/chat/1#section"],
    [".../x", "https://app.example/chat/.../x"],
    ["a..b/.c", "https://app.example/chat/a..b/.c"],
    ["%252e%252e/x", "https://app.example/chat/%252e%252e/x"],
    ["a?q=../x", "https://app.example/chat/a?q=../x"],
    ["a#../x", "https://app.example/chat/a#../x"],
  ])("admits %j against the base", (raw, want) => {
    expect(href(raw)).toBe(want);
    expect(gate(raw, BASE)?.relative).toBe(true);
  });

  it.each(["docs/a.md", "/workspace/a.md", "?page=2", "#section"])(
    "refuses %j with no base",
    (raw) => {
      expect(href(raw, null)).toBeNull();
    },
  );

  it.each([
    ".",
    "..",
    "./a",
    "../a",
    "a/./b",
    "a/../b",
    "a/..",
    "/workspace/../config/x",
    "%2e/a",
    "%2E%2e/a",
    "%2e%2E/a",
    ".%2e/a",
    "%2e./a",
    "a/%2E%2E",
    "a\\..\\b",
    "..\\a",
    "a\\.",
    ".\t./a",
    "%2e%2e?q=1",
    "..#f",
  ])("refuses the dot segment in %j", (raw) => {
    expect(href(raw)).toBeNull();
  });

  it("refuses a relative destination that a non-web base would resolve", () => {
    expect(href("a.md", new URL("file:///home/u/"))).toBeNull();
    expect(href("https://e.example/", new URL("file:///home/u/"))).toBe("https://e.example/");
  });

  it("marks only a bare fragment as fragment-only", () => {
    const only = gate("#section", BASE);
    const page = gate("page#section", BASE);
    const absolute = gate("https://app.example/chat/1#section", BASE);
    expect(only !== null && fragmentOnly(only)).toBe(true);
    expect(page !== null && fragmentOnly(page)).toBe(false);
    expect(absolute !== null && fragmentOnly(absolute)).toBe(false);
  });
});

describe("written", () => {
  it("writes an absolute destination as the gate serialized it", () => {
    const g = gate(" HTTPS://E.example/a b ", BASE);
    expect(g === null ? null : written(g, BASE.href)).toBe("https://e.example/a%20b");
  });

  it("keeps a relative destination's own text when the document base agrees", () => {
    const g = gate(" docs/a%20b.md ", BASE);
    expect(g === null ? null : written(g, BASE.href)).toBe("docs/a%20b.md");
  });

  it("writes the resolved URL when the document base would resolve elsewhere", () => {
    const g = gate("docs/a.md", new URL("https://forge.example/o/r/blob/main/"));
    expect(g === null ? null : written(g, "https://app.example/chat/1")).toBe(
      "https://forge.example/o/r/blob/main/docs/a.md",
    );
  });

  it("writes the resolved URL against a document base that does not parse", () => {
    const g = gate("docs/a.md", BASE);
    expect(g === null ? null : written(g, "not a url")).toBe("https://app.example/chat/docs/a.md");
  });

  // The pieces a destination is built from, chosen to hit the scheme, host
  // and dot-segment rules and their edges.
  const piece = fc.constantFrom(
    "a",
    "B",
    "0",
    ".",
    "..",
    "%2e",
    "%2E",
    "/",
    "\\",
    ":",
    "?",
    "#",
    "@",
    "%",
    "-",
    "+",
    " ",
    "\t",
    "\x01",
    "\u00a0",
    "http",
    "https",
    "mailto",
    "javascript",
    "data",
    "e.example",
    "[::1]",
  );
  const destinationText = fc.array(piece, { maxLength: 12 }).map((parts) => parts.join(""));

  it("hands the browser a value it resolves to the URL the gate checked", () => {
    fc.assert(
      fc.property(destinationText, fc.boolean(), (raw, withBase) => {
        const g = gate(raw, withBase ? BASE : null);
        if (g === null) {
          return;
        }
        expect(["http:", "https:", "mailto:"]).toContain(g.url.protocol);
        expect(new URL(written(g, BASE.href), BASE).href).toBe(g.url.href);
        expect(new URL(written(g, "https://other.example/"), BASE).href).toBe(g.url.href);
      }),
      { numRuns: 3000 },
    );
  });

  it("calls relative only what this engine cannot parse without a base", () => {
    fc.assert(
      fc.property(destinationText, (raw) => {
        const g = gate(raw, BASE);
        if (g?.relative === true) {
          expect(() => new URL(g.text)).toThrow(TypeError);
        }
      }),
      { numRuns: 3000 },
    );
  });
});

describe("withheld", () => {
  const ORIGIN = "https://app.example";
  let asked: string[] = [];
  const always = (url: URL): boolean => {
    asked.push(url.href);
    return true;
  };
  beforeEach(() => {
    asked = [];
  });

  function judge(raw: string, withhold: false | ((url: URL) => boolean) = always): boolean {
    const g = gate(raw, BASE);
    expect(g).not.toBeNull();
    return g !== null && withheld(g, withhold, ORIGIN);
  }

  it("asks the predicate about a destination that leaves the origin", () => {
    expect(judge("https://e.example/?q=1")).toBe(true);
    expect(asked).toEqual(["https://e.example/?q=1"]);
    expect(judge("//e.example/x")).toBe(true);
    expect(judge("http://app.example/x")).toBe(true);
    expect(judge("https://app.example:8443/x")).toBe(true);
    expect(judge("https://e.example/", () => false)).toBe(false);
  });

  it("never judges a relative, same-origin or mailto destination", () => {
    expect(judge("docs/a.md")).toBe(false);
    expect(judge("#section")).toBe(false);
    expect(judge("https://app.example/other?q=1")).toBe(false);
    expect(judge(`mailto:a@b.example?body=${"Q".repeat(60)}`)).toBe(false);
    expect(asked).toEqual([]);
  });

  it("withholds nothing when turned off", () => {
    expect(judge(`https://e.example/?d=${"Q".repeat(40)}`, false)).toBe(false);
  });

  it("judges the default predicate on what the gate checked", () => {
    expect(judge(`\x01https://e.example/?d=${"Q".repeat(40)}`, payloadShaped)).toBe(true);
    expect(judge(`//e.example/?d=${"Q".repeat(40)}`, payloadShaped)).toBe(true);
    expect(judge("https://e.example/?q=1", payloadShaped)).toBe(false);
  });
});

describe("payloadShaped", () => {
  const prose = "word ".repeat(44);
  const token = `ghp_${"a1B2c3".repeat(6)}`;

  it.each([
    ["a query of 200 characters", `https://e.example/?q=${"a.".repeat(99)}`],
    [
      "a query and fragment of 200 characters",
      `https://e.example/?q=${"a.".repeat(49)}#${"b.".repeat(50)}`,
    ],
    ["21 consecutive percent escapes", `https://e.example/?d=${"%41".repeat(21)}`],
    ["a 40-character base64 run", `https://e.example/?d=${"Q".repeat(40)}`],
    ["a 39-character run with padding", `https://e.example/?d=${"Q".repeat(39)}=`],
    ["an AWS access key id", "https://e.example/?k=AKIAABCDEFGHIJKLMNOP"],
    ["an ssh key marker", "https://e.example/?k=ssh-ed25519%20AAAA"],
    ["a private key header", "https://e.example/?k=BEGIN+RSA+PRIVATE+KEY"],
    ["a Slack token", "https://e.example/?t=xoxb-123-abc"],
    ["a classic GitHub token", `https://e.example/?t=${token}`],
    ["a fine-grained GitHub token", `https://e.example/?t=github_pat_${"a1_B2".repeat(5)}`],
    ["an issue-prefill link", `https://github.com/o/r/issues/new?title=x&body=${prose}`],
    ["a payload in a fragment with no query", `https://e.example/page#${"%41".repeat(21)}`],
    ["a token in a fragment with no query", `https://e.example/#${token}`],
    ["a token as the user name", `https://${token}@e.example/`],
    ["a base64 password", `https://u:${"Q".repeat(40)}@e.example/`],
    ["a hex label in the host", `https://${"a1".repeat(16)}.e.example/`],
    ["a 63-character label in the host", `https://${"z9".repeat(31)}z.e.example/`],
    ["a credential marker in the host", "https://akiaabcdefghijklmnop.e.example/"],
    ["a host over 100 characters", `https://${"ab1c.".repeat(20)}e.example/`],
  ])("flags %s", (_name, url) => {
    expect(payloadShaped(new URL(url))).toBe(true);
  });

  it.each([
    ["no query", "https://github.com/o/r"],
    ["a short query", "https://e.example/search?q=marotte&page=2"],
    ["a 199-character query", `https://e.example/?q=${"a.".repeat(98)}a`],
    ["a long path and no query", `https://e.example/${"segment/".repeat(40)}`],
    [
      "a commit SHA in the path",
      `https://github.com/o/r/commit/${"0123456789abcdef0123".repeat(2)}`,
    ],
    ["20 percent escapes", `https://e.example/?d=${"%41".repeat(20)}`],
    ["a 39-character run with no padding", `https://e.example/?d=${"Q".repeat(39)}`],
    ["a ghp_ prefix one character short", `https://e.example/?t=ghp_${"a".repeat(35)}`],
    ["a short fragment", "https://e.example/docs#section-2"],
    ["a user name", "https://user:pass@e.example/"],
    ["a 31-character hex label", `https://${"a1".repeat(15)}a.e.example/`],
    [
      "a long word as a label",
      "https://llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch.example/",
    ],
    ["a deploy preview host", "https://5f3a1b2c3d4e5f6a7b8c9d0e--site.netlify.app/"],
    ["a cloud host", "https://my-app-1234567890.us-east-1.elb.amazonaws.com/"],
    ["an IPv6 host", "https://[2001:db8:85a3::8a2e:370:7334]/"],
  ])("passes %s", (_name, url) => {
    expect(payloadShaped(new URL(url))).toBe(false);
  });

  it("reads the shape alone, so the withhold rule owns the mailto exemption", () => {
    expect(payloadShaped(new URL(`mailto:a@b.example?body=${"Q".repeat(60)}`))).toBe(true);
  });
});
