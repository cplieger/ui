import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// The chart's modules, the scales they share and the sparkline.
const DATA = join(import.meta.dirname, "..");
const DIRS = ["chart", "scale", "sparkline"];

// Comments name these calls without making them.
const code = (text: string): string => text.replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu, "");

async function sources(): Promise<{ readonly name: string; readonly text: string }[]> {
  const out = [];
  for (const dir of DIRS) {
    for (const file of (await readdir(join(DATA, dir))).sort()) {
      if (file.endsWith(".ts") && !file.endsWith(".test.ts")) {
        out.push({
          name: `${dir}/${file}`,
          text: code(await readFile(join(DATA, dir, file), "utf8")),
        });
      }
    }
  }
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
