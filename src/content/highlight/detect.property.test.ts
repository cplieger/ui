import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { detectLanguage } from "./highlight.js";

// Words a sentence, a path or a cell may hold, the languages' keywords and shell commands among them.
const WORDS = [
  ..."the a build test file run it when if for while return package func def fn let mut const".split(
    " ",
  ),
  ..."import from export function class type interface use impl go make git cd ls cat echo npm".split(
    " ",
  ),
  ..."FROM RUN docker yaml key value note main server error output data user config".split(" "),
];

const word = fc.constantFrom(...WORDS);

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** A sentence: a capital, words with an optional comma or colon after one, and an end mark. */
const sentence = fc
  .tuple(
    fc.array(fc.tuple(word, fc.constantFrom("", "", "", ",", ":")), {
      minLength: 3,
      maxLength: 14,
    }),
    fc.constantFrom(".", "?", "!"),
  )
  .map(([ws, end]) => capital(ws.map(([w, p]) => w + p).join(" ")) + end);

const prose = fc
  .array(fc.array(sentence, { minLength: 1, maxLength: 3 }), { minLength: 1, maxLength: 6 })
  .map((lines) => lines.map((l) => l.join(" ")).join("\n"));

const path = fc
  .tuple(
    fc.constantFrom("", "/", "./", "~/"),
    fc.array(word, { minLength: 1, maxLength: 4 }),
    fc.constantFrom(".go", ".ts", ".md", ".json", ".py", ".rs", ".yaml", ".sh"),
  )
  .map(([root, parts, ext]) => root + parts.join("/") + ext);

const pathList = fc
  .tuple(fc.constantFrom("", "- ", "* ", "1. "), fc.array(path, { minLength: 1, maxLength: 12 }))
  .map(([marker, paths]) => paths.map((p) => marker + p).join("\n"));

const cell = fc.array(word, { minLength: 1, maxLength: 3 }).map((ws) => ws.join(" "));

const table = fc
  .tuple(fc.integer({ min: 1, max: 5 }), fc.integer({ min: 1, max: 8 }))
  .chain(([cols, rows]) =>
    fc.array(fc.array(cell, { minLength: cols, maxLength: cols }), {
      minLength: rows + 1,
      maxLength: rows + 1,
    }),
  )
  .map(([head = [], ...body]) =>
    [head, head.map(() => "---"), ...body].map((r) => `| ${r.join(" | ")} |`).join("\n"),
  );

describe("detectLanguage never colours", () => {
  it.each([
    ["prose", prose],
    ["a list of paths", pathList],
    ["a markdown table", table],
  ])("%s", (_name, text) => {
    fc.assert(
      fc.property(text, (t) => {
        expect(detectLanguage(t)).toBe("");
      }),
    );
  });
});
