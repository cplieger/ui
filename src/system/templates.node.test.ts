import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const TEMPLATES = join(ROOT, "templates");

describe("the page templates", () => {
  it("ship on npm, each under its own subpath", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      files: string[];
      exports: Record<string, string>;
    };
    expect(pkg.files).toContain("templates/");
    expect(pkg.exports["./templates/*"]).toBe("./templates/*");
  });

  it("each have their section in templates/README.md", async () => {
    const pages = (await readdir(TEMPLATES)).filter((f) => f.endsWith(".html")).toSorted();
    const readme = await readFile(join(TEMPLATES, "README.md"), "utf8");
    const named = [...readme.matchAll(/^## .*: `([a-z-]+\.html)`$/gm)].map((m) => m[1]).toSorted();
    expect(named).toEqual(pages);
  });
});
