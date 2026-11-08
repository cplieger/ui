import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { iconNames, ownIconNames } from "./icons.js";

const ROOT = resolve(import.meta.dirname, "../..");
const SHIPPED = join(ROOT, "icons", "svg");
const require = createRequire(import.meta.url);
const PINNED = dirname(require.resolve("lucide-static/package.json"));
const RELEASE = join(PINNED, "icons");

/**
 * What keeps `dir`, and the LICENSE-lucide beside it, from being the pinned
 * lucide-static release of exactly iconNames. With ICONS_SYNC=1
 * (`npm run icons:sync`) it rewrites them to match instead and reports only
 * names the release lacks.
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
  const license = await readFile(join(PINNED, "LICENSE"));
  const shippedLicense = join(dirname(dir), "LICENSE-lucide");
  const haveLicense = await readFile(shippedLicense).catch(() => null);
  if (haveLicense?.equals(license) !== true) {
    if (sync) {
      await writeFile(shippedLicense, license);
    } else {
      problems.push("LICENSE-lucide: differs from the pinned lucide-static LICENSE");
    }
  }
  const names = new Set<string>([...iconNames, ...ownIconNames]);
  for (const file of await readdir(dir)) {
    if (file.endsWith(".svg") && !names.has(file.slice(0, -4))) {
      if (sync) {
        await rm(join(dir, file));
      } else {
        problems.push(`${file}: no name in iconNames or ownIconNames`);
      }
    }
  }
  return problems;
}

describe("the shipped icon set", () => {
  it("lists each name once, sorted", () => {
    expect([...iconNames]).toEqual([...new Set(iconNames)].sort());
    expect([...ownIconNames]).toEqual([...new Set(ownIconNames)].sort());
  });

  it("draws its own icons on Lucide's grid and stroke, under names no pinned Lucide has", async () => {
    const lucide = new Set((await readdir(RELEASE)).map((f) => f.replace(/\.svg$/, "")));
    for (const name of ownIconNames) {
      expect(lucide.has(name), `${name} shadows a Lucide drawing`).toBe(false);
      expect(iconNames as readonly string[]).not.toContain(name);
      const root =
        /<svg\b[^>]*>/.exec(await readFile(join(SHIPPED, `${name}.svg`), "utf8"))?.[0] ?? "";
      for (const attr of [
        'viewBox="0 0 24 24"',
        'stroke="currentColor"',
        'stroke-width="2"',
        'stroke-linecap="round"',
        'stroke-linejoin="round"',
      ]) {
        expect(root, `${name}.svg`).toContain(attr);
      }
    }
  });

  it("has exactly one file per name, byte-identical to the pinned lucide-static", async () => {
    expect(await drift(SHIPPED, process.env["ICONS_SYNC"] === "1")).toEqual([]);
  });

  it("keeps its own drawings through a sync", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ui-icons-"));
    try {
      await cp(join(ROOT, "icons"), dir, { recursive: true });
      expect(await drift(join(dir, "svg"), true)).toEqual([]);
      for (const name of ownIconNames) {
        await expect(readFile(join(dir, "svg", `${name}.svg`))).resolves.toBeInstanceOf(Buffer);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reports a changed, a missing and an extra file and a stale licence", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ui-icons-"));
    try {
      await cp(join(ROOT, "icons"), dir, { recursive: true });
      const svg = join(dir, "svg");
      await writeFile(join(dir, "LICENSE-lucide"), "stale");
      await writeFile(join(svg, "x.svg"), "<svg/>");
      await rm(join(svg, "zap.svg"));
      await writeFile(join(svg, "extra.svg"), "<svg/>");
      expect((await drift(svg)).sort()).toEqual([
        "LICENSE-lucide: differs from the pinned lucide-static LICENSE",
        "extra.svg: no name in iconNames or ownIconNames",
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
