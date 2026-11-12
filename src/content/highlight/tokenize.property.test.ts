import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { costRatio, LINEAR_BOUND } from "../test-helpers/cost-ratio.js";
import { TOKEN_KINDS, runs, tokenize } from "./highlight.js";

const LANGS = [
  "go",
  "ts",
  "js",
  "py",
  "sh",
  "rs",
  "rb",
  "c",
  "cpp",
  "docker",
  "php",
  "java",
  "toml",
  "css",
  "sql",
  "xml",
  "html",
  "json",
  "yaml",
  "diff",
  "md",
  "",
];

/** Text dense in the characters that open, close or escape a token. */
const codeText = fc.string({
  unit: fc.constantFrom(
    ..."\"'`#/*-+<>!?:=@{}[](),.;\\\n\t _$0x1eE9aZé😀",
    '"""',
    "'''",
    "<!--",
    "-->",
    "@@",
    "- ",
    "---",
    "//",
    "/*",
    "*/",
  ),
  maxLength: 80,
});

describe("tokenize, for any text in any language", () => {
  it("gives back the text, in tokens that are never empty and never two uncoloured in a row", () => {
    fc.assert(
      fc.property(codeText, fc.constantFrom(...LANGS), (code, lang) => {
        const tokens = tokenize(code, lang);
        expect(tokens.map((t) => t.text).join("")).toBe(code);
        tokens.forEach((t, i) => {
          expect(t.text).not.toBe("");
          if (t.kind === null) {
            expect(tokens[i - 1]?.kind).not.toBeNull();
          }
        });
      }),
    );
  });

  it("tokenizes a text the same whatever language name it was given as", () => {
    fc.assert(
      fc.property(codeText, (code) => {
        expect(tokenize(code, "TypeScript")).toEqual(tokenize(code, "ts"));
        expect(tokenize(code, "src/a.py")).toEqual(tokenize(code, "python"));
      }),
    );
  });

  it("gives runs that are tokenize's coloured tokens, in order", () => {
    fc.assert(
      fc.property(
        codeText,
        fc.constantFrom(...LANGS.filter((l) => l !== "md" && l !== "")),
        (code, lang) => {
          const r = runs(code, lang);
          expect(r).not.toBeNull();
          const fromRuns = Array.from(r?.starts ?? [], (start, i) => [
            TOKEN_KINDS[r?.kinds[i] ?? -1],
            code.slice(start, r?.ends[i]),
          ]);
          const fromTokens = tokenize(code, lang).flatMap((t) =>
            t.kind === null ? [] : [[t.kind, t.text]],
          );
          expect(fromRuns).toEqual(fromTokens);
        },
      ),
    );
  });
});

describe("linear time", () => {
  const generators: [string, string, (n: number) => string][] = [
    ["an unclosed string", "js", (n) => '"' + "a".repeat(n)],
    ["an unclosed template", "ts", (n) => "`" + "a".repeat(n)],
    ["an unclosed block comment", "go", (n) => "/*" + "a".repeat(n)],
    ["repeated block-comment openers", "go", (n) => "/*".repeat(n / 2)],
    ["repeated quotes on one line", "py", (n) => "'a".repeat(n / 2)],
    ["repeated triple quotes", "py", (n) => '"""a'.repeat(n / 4)],
    ["repeated lifetimes", "rs", (n) => "'a ".repeat(n / 3)],
    ["one long identifier", "go", (n) => "a".repeat(n)],
    ["one long number", "go", (n) => "1".repeat(n)],
    ["a long space run", "go", (n) => " ".repeat(n)],
    ["a long YAML key line with no colon", "yaml", (n) => "k".repeat(n)],
    ["a YAML key padded with spaces", "yaml", (n) => "k" + " ".repeat(n) + ": v"],
    ["deep YAML sequence markers", "yaml", (n) => "- ".repeat(n / 2) + "k: v"],
    ["many YAML key lines", "yaml", (n) => "key: value\n".repeat(n / 11)],
    ["a YAML key of escaped double quotes", "yaml", (n) => '"' + '\\"'.repeat(n / 2)],
    ["a YAML key of doubled single quotes", "yaml", (n) => "'" + "''".repeat(n / 2)],
    ["a long plain YAML key", "yaml", (n) => "$".repeat(n)],
    ["a JSON key padded with spaces", "json", (n) => '"k"' + " ".repeat(n) + ":1"],
    ["repeated tag openers", "html", (n) => "<a ".repeat(n / 3)],
    ["repeated comment openers", "html", (n) => "<!--".repeat(n / 4)],
    ["an unclosed attribute value", "html", (n) => '<a b="' + "x".repeat(n)],
    ["repeated lone angle brackets", "xml", (n) => "< ".repeat(n / 2)],
    ["many diff lines", "diff", (n) => "+a\n-b\n".repeat(n / 6)],
    ["one long diff line", "diff", (n) => "+" + "a".repeat(n)],
  ];

  it.each(generators)("tokenizes %s in time linear in its length", (_name, lang, generate) => {
    const work = (code: string): void => {
      tokenize(code, lang);
    };
    expect(costRatio(work, generate)).toBeLessThan(LINEAR_BOUND);
  });
});
