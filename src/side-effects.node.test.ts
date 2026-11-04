import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { build } from "esbuild";
import { rolldown } from "rolldown";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");

// Each subpath whose evaluation starts the dialog ranking observer, and the
// subset that also installs the window `beforetoggle` capture listener.
const OBSERVES = ["dialog", "modal", "ask", "announce", "toast", "popup", "popover", "tooltip"];
const LISTENS = new Set(["dialog", "modal", "ask"]);
const PURE = [
  "",
  "/signal",
  "/dom",
  "/fetch",
  "/actions",
  "/actions/testing",
  "/disclosure",
  "/focus-trap",
  "/roving-focus",
  "/skeleton",
  "/theme",
  "/transition",
  "/view-transition",
];

type Bundle = (entry: string) => Promise<string>;

const bundlers: Record<string, Bundle> = {
  esbuild: async (entry) => {
    const out = await build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      logLevel: "silent",
    });
    return out.outputFiles.map((f) => f.text).join("");
  },
  rolldown: async (entry) => {
    const b = await rolldown({ input: entry, logLevel: "silent", platform: "browser" });
    try {
      const { output } = await b.generate({ format: "esm" });
      return output.map((c) => ("code" in c ? c.code : "")).join("");
    } finally {
      await b.close();
    }
  },
};

let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "ui-side-effects-"));
  await mkdir(join(dir, "node_modules", "@cplieger"), { recursive: true });
  await symlink(PACKAGE_ROOT, join(dir, "node_modules", "@cplieger", "ui"), "dir");
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Bundle an entry that imports `@cplieger/ui<subpath>` only for its effect. */
async function bundleEffectOnly(bundle: Bundle, subpath: string): Promise<string> {
  const entry = join(dir, `entry${subpath.replaceAll("/", "-")}.js`);
  await writeFile(entry, `import "@cplieger/ui${subpath}";\n`);
  return bundle(entry);
}

describe.each(Object.entries(bundlers))("sideEffects under %s", (_name, bundle) => {
  it.each(OBSERVES)("an effect-only import of /%s keeps the import-time watchers", async (name) => {
    const code = await bundleEffectOnly(bundle, `/${name}`);
    expect(code).toContain(".observe(document,");
    expect(/^\s*addEventListener\("beforetoggle",/m.test(code)).toBe(LISTENS.has(name));
  });

  it.each(PURE)("an effect-only import of @cplieger/ui%s bundles to no code", async (subpath) => {
    const code = await bundleEffectOnly(bundle, subpath);
    expect(code.replaceAll(/\/\/.*$/gm, "").trim()).toBe("");
  });
});
