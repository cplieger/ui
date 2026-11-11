import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { build } from "esbuild";
import { rolldown } from "rolldown";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");

// No subpath does anything as it loads: each starts its work from a call.
const PURE = [
  "/anchor",
  "/announce",
  "/ask",
  "/checkbox",
  "/chip",
  "/choice",
  "/combobox",
  "/confirm",
  "/connection-test",
  "/copy",
  "/date-range",
  "/dialog",
  "/disclosure",
  "/file",
  "/form",
  "/highlight",
  "/icons",
  "/list-detail",
  "/markdown",
  "/menu",
  "/pairs",
  "/panel",
  "/pill",
  "/pointer",
  "/press",
  "/radio-focus",
  "/range",
  "/roll",
  "/rules",
  "/roving-focus",
  "/search",
  "/secret",
  "/skeleton",
  "/stepper",
  "/tabs",
  "/textarea",
  "/theme",
  "/toast",
  "/toggle",
  "/tokens",
  "/tooltip",
  "/turn",
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

it("lists every exported module", async () => {
  const pkg = JSON.parse(await readFile(join(PACKAGE_ROOT, "package.json"), "utf8")) as {
    exports: Record<string, unknown>;
  };
  // Stylesheets, fonts and icon files are exports but not modules.
  const exported = Object.entries(pkg.exports)
    .filter(([, target]) => typeof target === "string" && target.endsWith(".ts"))
    .map(([key]) => key.slice(1));
  expect(exported.toSorted()).toEqual(PURE.toSorted());
});

describe.each(Object.entries(bundlers))("sideEffects under %s", (_name, bundle) => {
  it.each(PURE)("an effect-only import of @cplieger/ui%s bundles to no code", async (subpath) => {
    const code = await bundleEffectOnly(bundle, subpath);
    expect(code.replaceAll(/\/\/.*$/gm, "").trim()).toBe("");
  });
});
