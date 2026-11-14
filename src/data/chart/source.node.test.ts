import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

// The chart's modules, the scales they share and the sparkline.
const DATA = join(import.meta.dirname, "..");
const DIRS = ["chart", "scale", "sparkline"];

// Comments name these calls without making them.
const code = (text: string): string => text.replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu, "");

async function sources(strip = code): Promise<{ readonly name: string; readonly text: string }[]> {
  const out = [];
  for (const dir of DIRS) {
    for (const file of (await readdir(join(DATA, dir))).sort()) {
      if (file.endsWith(".ts") && !file.endsWith(".test.ts")) {
        out.push({
          name: `${dir}/${file}`,
          text: strip(await readFile(join(DATA, dir, file), "utf8")),
        });
      }
    }
  }
  return out;
}

// Each spread among a call's arguments, as "callee(...head", head being the
// spread's text up to its first call.
function callSpreads(name: string, text: string): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isSpreadElement(node) &&
      (ts.isCallExpression(node.parent) || ts.isNewExpression(node.parent))
    ) {
      const head = node.expression.getText().split("(")[0] ?? "";
      out.push(`${name}: ${node.parent.expression.getText()}(...${head}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true));
  return out;
}

describe("one path from a number to its words", () => {
  it("leaves Intl.NumberFormat, toFixed, toPrecision and toLocaleString to format.ts", async () => {
    const calls = (await sources()).flatMap(({ name, text }) =>
      [
        ...text.matchAll(/\bIntl\.NumberFormat\b|\.(?:toFixed|toPrecision|toLocaleString)\s*\(/gu),
      ].map((m) => `${name}: ${m[0]}`),
    );
    expect(calls).toEqual(["scale/format.ts: Intl.NumberFormat"]);
  });

  it("builds a number format only for writer, widthKey reading its options alone", async () => {
    const text = code(await readFile(join(DATA, "scale/format.ts"), "utf8"));
    const from = text.indexOf("export function writer(");
    const to = text.indexOf("\n}\n", from);
    expect(from).toBeGreaterThan(-1);
    const outside = [...text.matchAll(/\bnumbers\([^()]*\)(?:\.\w+)?/gu)]
      .filter((m) => m.index < from || m.index > to)
      .map((m) => m[0]);
    expect(outside).toEqual(["numbers(locale, options).resolvedOptions"]);
  });
});

describe("one maker of a Date", () => {
  it("leaves new Date and Date.UTC to dateAt, which range-checks every instant", async () => {
    const calls = (await sources()).flatMap(({ name, text }) =>
      [...text.matchAll(/\bnew\s+Date\b|\bDate\.(?:UTC|parse)\b/gu)].map((m) => `${name}: ${m[0]}`),
    );
    expect(calls).toEqual(["scale/time.ts: new Date"]);
    const text = code(await readFile(join(DATA, "scale/time.ts"), "utf8"));
    const from = text.indexOf("export function dateAt(");
    expect(text.indexOf("new Date")).toBeGreaterThan(from);
    expect(text.indexOf("new Date")).toBeLessThan(text.indexOf("\n}\n", from));
  });

  // Intl.DateTimeFormat's format and formatToParts build a Date from a number
  // themselves (ECMA-402 ToDateTimeFormattable), with the engine's bare error.
  it("hands every date format an instant from dateAt", async () => {
    const calls = (await sources()).flatMap(({ name, text }) =>
      [...text.matchAll(/\.(?:format|formatToParts)\(\s*(?!dateAt\()[^,)]*/gu)].map(
        (m) => `${name}: ${m[0]}`,
      ),
    );
    expect(calls).toEqual([
      "scale/format.ts: .format(v",
      "scale/format.ts: .format(v",
      "scale/format.ts: .format(v",
      "scale/format.ts: .format(Math.sign(v",
      "scale/format.ts: .format(0",
      "scale/format.ts: .format(v",
      "scale/format.ts: .format(record",
    ]);
  });
});

// V8 refuses a call spread past about 125,000 arguments with "Maximum call
// stack size exceeded", so a list the spec sets is pushed, measured or
// appended in a loop or a DocumentFragment, never spread into a call.
describe("no call spreads a list the spec sets", () => {
  it("spreads into a call only lists of a fixed length", async () => {
    const spreads = (await sources((text) => text)).flatMap(({ name, text }) =>
      callSpreads(name, text),
    );
    expect(spreads).toEqual([
      // xSpan returns a pair of words.
      "chart/readout.ts: words.range(...model.xSpan",
      "chart/readout.ts: words.range(...model.xSpan",
      "chart/readout.ts: words.range(...model.xSpan",
      "chart/readout.ts: words.range(...model.xSpan",
      // At most the three of 1, 2 and 5 in a decade.
      "scale/log.ts: all.push(...[1, 2, 5].map",
      // A column of four points or fewer, and the four a longer one keeps.
      "scale/reduce.ts: run.push(...column",
      "scale/reduce.ts: run.push(...column.filter",
    ]);
  });
});
