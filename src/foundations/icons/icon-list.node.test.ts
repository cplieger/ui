import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { iconNames, ownIconNames } from "./icons.js";

const ROOT = resolve(import.meta.dirname, "../../..");
const LIST = join(import.meta.dirname, "icons.css");

/** Not the library's markup: the gallery paints by its own script, `css/`
 *  is built from `src/`, and `icons/` holds the drawings themselves. */
const SKIP = new Set(["node_modules", ".git", "gallery", "css", "icons", "coverage", "dist"]);
const USE =
  /data-cp-icon(?:="|", ")([a-z0-9-]+)"|cpIcon"?\]? = "([a-z0-9-]+)"|icons\/svg\/([a-z0-9-]+)\.svg/g;

/** Each glyph the files under `root` name, with the files naming it: an icon
 *  span's `data-cp-icon` in markup, docs or a module, or a drawing a
 *  stylesheet masks by its file. Tests, the changelog and the list itself
 *  are not uses. */
async function uses(root: string): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>();
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) {
          await walk(path);
        }
        continue;
      }
      if (
        !/\.(?:css|ts|md|html)$/.test(entry.name) ||
        entry.name.endsWith(".test.ts") ||
        entry.name === "CHANGELOG.md" ||
        path === LIST
      ) {
        continue;
      }
      for (const m of (await readFile(path, "utf8")).matchAll(USE)) {
        const name = m[1] ?? m[2] ?? m[3] ?? "";
        found.set(name, [...(found.get(name) ?? []), relative(root, path)]);
      }
    }
  }
  await walk(root);
  return found;
}

/** The list's rules as [name, file], in source order. */
async function listed(): Promise<[name: string, file: string][]> {
  const css = await readFile(LIST, "utf8");
  return [
    ...css.matchAll(
      /\.cp-icon:where\(\[data-cp-icon="([a-z0-9-]+)"\]\) \{\n {2}--cp-icon-image: url\("\.\.\/icons\/svg\/([a-z0-9-]+)\.svg"\);\n\}/g,
    ),
  ].map((m) => [m[1] ?? "", m[2] ?? ""]);
}

describe("the icon list", () => {
  it("draws each name once, sorted, from its own shipped file", async () => {
    const rules = await listed();
    const names = rules.map(([name]) => name);
    expect(names.length).toBeGreaterThan(0);
    expect(names).toEqual([...new Set(names)].sort());
    const shipped = new Set<string>([...iconNames, ...ownIconNames]);
    for (const [name, file] of rules) {
      expect(file, name).toBe(name);
      expect(shipped.has(name), `${name} is not a shipped drawing`).toBe(true);
    }
    const all = (await readFile(LIST, "utf8")).match(/--cp-icon-image:/g) ?? [];
    expect(all, "a --cp-icon-image rule outside the list's shape").toHaveLength(rules.length);
  });

  it("lists every glyph the library's own markup and CSS use", async () => {
    const names = new Set((await listed()).map(([name]) => name));
    const missing = [...(await uses(ROOT))]
      .filter(([name]) => !names.has(name))
      .map(([name, files]) => `${name} (${files.join(", ")})`);
    expect(missing).toEqual([]);
  });

  it("names on the icons page exactly the glyphs it draws", async () => {
    const page = await readFile(join(ROOT, "docs", "foundations", "icons.md"), "utf8");
    const line = page.split("\n").find((l) => l.startsWith("The glyphs it paints with no script:"));
    expect(line).toBeDefined();
    const named = [...(line ?? "").matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]);
    expect(named).toEqual((await listed()).map(([name]) => name));
  });
});

describe("the use scan", () => {
  it("finds markup, module and stylesheet uses, and skips tests, the gallery and dependencies", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ui-icon-uses-"));
    try {
      const put = async (path: string, text: string): Promise<void> => {
        await mkdir(join(dir, path, ".."), { recursive: true });
        await writeFile(join(dir, path), text);
      };
      await put("docs/a.md", '<span class="cp-icon" data-cp-icon="pin"></span>');
      await put("docs/b.html", '<span class="cp-icon" data-cp-icon="pin-filled"></span>');
      await put("src/a/a.ts", 'span.setAttribute("data-cp-icon", "copy");');
      await put("src/a/b.ts", 'span.dataset["cpIcon"] = "check";');
      await put("src/a/a.css", '.x::before { mask: url("../icons/svg/clock.svg"); }');
      await put("src/a/a.test.ts", '<span data-cp-icon="star"></span>');
      await put("gallery/pages/a.html", '<span data-cp-icon="film"></span>');
      await put("node_modules/x/a.md", '<span data-cp-icon="tv"></span>');
      await put("CHANGELOG.md", '<span data-cp-icon="bug"></span>');
      const found = await uses(dir);
      expect([...found.keys()].sort()).toEqual(["check", "clock", "copy", "pin", "pin-filled"]);
      expect(found.get("clock")).toEqual([join("src", "a", "a.css")]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
