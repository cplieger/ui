import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

import { build } from "esbuild";
import { expect, it } from "vitest";

// No standard sizes a chart module, so the budget makes growth a decision:
// measured at 33,704 bytes with the rect, line, area, dot, bar, point, rule
// and text marks, plus 10 %. A change that passes it raises the budget in
// the same pull request, with its reason.
const BUDGET = 37_074;

it("@cplieger/ui/chart bundles, minified and gzipped, within its budget", async () => {
  const out = await build({
    entryPoints: [resolve(import.meta.dirname, "chart.ts")],
    bundle: true,
    minify: true,
    write: false,
    format: "esm",
    platform: "browser",
    logLevel: "silent",
  });
  const code = out.outputFiles.map((f) => f.text).join("");
  expect(gzipSync(code).length).toBeLessThanOrEqual(BUDGET);
});
