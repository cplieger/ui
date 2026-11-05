import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { iconNames } from "./icons.js";

const ROOT = resolve(import.meta.dirname, "../..");
const SHIPPED = join(ROOT, "icons", "svg");
const RELEASE = join(
  dirname(createRequire(import.meta.url).resolve("lucide-static/package.json")),
  "icons",
);

/**
 * What keeps `dir` from being the pinned lucide-static release of exactly
 * iconNames. With ICONS_SYNC=1 (`npm run icons:sync`) it rewrites `dir` to
 * match instead and reports only names the release lacks.
 */
async function drift(dir: string, sync = false): Promise<string[]> {
  const problems: string[] = [];
  for (const name of iconNames) {
    let want: Buffer;
    try {
      want = await readFile(join(RELEASE, `${name}.svg`));
    } catch {
      problems.push(`${name}: not in the pinned lucide-static`);
      continue;
    }
    const have = await readFile(join(dir, `${name}.svg`)).catch(() => null);
    if (have?.equals(want) === true) {
      continue;
    }
    if (sync) {
      await writeFile(join(dir, `${name}.svg`), want);
    } else {
      problems.push(
        `${name}.svg: ${have === null ? "missing" : "differs from the pinned lucide-static"}`,
      );
    }
  }
  const names = new Set<string>(iconNames);
  for (const file of await readdir(dir)) {
    if (file.endsWith(".svg") && !names.has(file.slice(0, -4))) {
      if (sync) {
        await rm(join(dir, file));
      } else {
        problems.push(`${file}: no name in iconNames`);
      }
    }
  }
  return problems;
}

describe("the shipped icon set", () => {
  it("lists each name once, sorted", () => {
    expect([...iconNames]).toEqual([...new Set(iconNames)].sort());
  });

  it("has exactly one file per name, byte-identical to the pinned lucide-static", async () => {
    expect(await drift(SHIPPED, process.env["ICONS_SYNC"] === "1")).toEqual([]);
  });

  it("reports a changed, a missing and an extra file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ui-icons-"));
    try {
      await cp(SHIPPED, dir, { recursive: true });
      await writeFile(join(dir, "x.svg"), "<svg/>");
      await rm(join(dir, "zap.svg"));
      await writeFile(join(dir, "extra.svg"), "<svg/>");
      expect((await drift(dir)).sort()).toEqual([
        "extra.svg: no name in iconNames",
        "x.svg: differs from the pinned lucide-static",
        "zap.svg: missing",
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("ships the files, Lucide's license and the notices on npm and JSR", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      files: string[];
      exports: Record<string, string>;
    };
    expect(pkg.files).toContain("icons/");
    expect(pkg.exports["./icons"]).toBe("./src/primitives/icons.ts");
    expect(pkg.exports["./icons/svg/*"]).toBe("./icons/svg/*");
    const jsr = JSON.parse(await readFile(join(ROOT, "jsr.json"), "utf8")) as {
      exports: Record<string, string>;
      publish: { include: string[] };
    };
    expect(jsr.exports["./icons"]).toBe("./src/primitives/icons.ts");
    expect(jsr.publish.include).toEqual(
      expect.arrayContaining(["icons/svg/*.svg", "icons/LICENSE-lucide"]),
    );
    expect(await readFile(join(ROOT, "icons", "LICENSE-lucide"), "utf8")).toMatch(/^ISC License/);
    expect(await readFile(join(ROOT, "NOTICE"), "utf8")).toContain("icons/LICENSE-lucide");
  });
});
