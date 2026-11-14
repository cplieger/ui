/**
 * build.ts — assembles the gallery into `gallery/dist/`: each page in
 * `pages/` inside one shared frame, the scripts bundled from `main.ts`, and
 * the library's own stylesheet, fonts and icons beside them, so the folder
 * opens as it is in a browser or a preview tab.
 */

import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { build } from "esbuild";

const HERE = import.meta.dirname;
const ROOT = join(HERE, "..");

/** The pages, in the bar's order. A page with a parent is reached from that
 *  tab's page and lights that tab, so the bar holds one tab per area. */
const PAGES: readonly (readonly [
  page: string,
  label: string,
  icon: string,
  title: string,
  parent?: string,
])[] = [
  ["index", "Foundations", "palette", "Foundations"],
  ["forms", "Forms", "square-pen", "Forms and chosen items"],
  ["buttons", "Buttons", "mouse-pointer-click", "Buttons and toolbars"],
  ["feedback", "Feedback", "bell", "Feedback"],
  ["overlays", "Overlays", "layers", "Overlays"],
  ["navigation", "Navigation", "panel-left", "Navigation"],
  ["data", "Data", "rows-3", "Data"],
  ["charts", "Charts", "chart-column", "Charts"],
  ["media", "Media", "film", "Media"],
  ["content", "Content", "file-text", "Content"],
  ["layouts", "Layouts", "layout-grid", "Layouts and screens"],
  ["sign-in", "Sign-in", "log-in", "Screen: sign-in", "layouts"],
  ["setup", "Setup", "list-checks", "Screen: first-run setup", "layouts"],
  ["settings", "Settings", "settings", "Screen: settings", "layouts"],
  ["search", "Search", "search", "Screen: search", "layouts"],
  ["messages", "Messages", "messages-square", "Screen: messages", "layouts"],
  ["not-found", "Not found", "telescope", "Screen: not found", "layouts"],
  ["scope", "Scope", "list-checks", "Scope against other libraries"],
];

export const pageNames: readonly string[] = PAGES.map(([page]) => page);

/** The pages in `frames/`, each shown in an `<iframe>` on a card: a piece
 *  that exists only under a media query's width, which the gallery's own
 *  window is wider than, or one that must paint with no script, which the
 *  gallery's pages run. Each is built as `frame-<name>.html`. */
const FRAMES: readonly (readonly [frame: string, title: string, script: boolean])[] = [
  ["bottom-nav", "Bottom navigation", true],
  ["icons", "Icons with no script", false],
];

export const frameNames: readonly string[] = FRAMES.map(([frame]) => `frame-${frame}`);

function nav(current: string): string {
  const parent = PAGES.find(([page]) => page === current)?.[4] ?? current;
  return PAGES.filter((p) => p[4] === undefined)
    .map(([page, label, icon]) => {
      const here = page === parent ? ' aria-current="page"' : "";
      return `    <a class="cp-nav-item" href="${page}.html"${here}><span class="cp-icon" data-cp-icon="${icon}" aria-hidden="true"></span><span class="cp-nav-label">${label}</span></a>`;
    })
    .join("\n");
}

async function iconGrid(): Promise<string> {
  const names = (await readdir(join(ROOT, "icons", "svg")))
    .filter((f) => f.endsWith(".svg"))
    .map((f) => f.slice(0, -4))
    .sort();
  const cells = names
    .map(
      (n) =>
        `<span class="g-icon"><span class="cp-icon" data-cp-icon="${n}" aria-hidden="true"></span><small>${n}</small></span>`,
    )
    .join("");
  return `<div class="g-icons">${cells}</div>`;
}

/** The glyphs the system stylesheet draws by name, each beside its name. */
async function drawnIcons(): Promise<string> {
  const css = await readFile(join(ROOT, "src", "foundations", "icons", "icons.css"), "utf8");
  const cells = [...css.matchAll(/\.cp-icon:where\(\[data-cp-icon="([a-z0-9-]+)"\]\)/g)]
    .map(
      ([, n = ""]) =>
        `<span class="cp-cluster" data-gap="tight"><span class="cp-icon" data-cp-icon="${n}" aria-hidden="true"></span><small>${n}</small></span>`,
    )
    .join("");
  return `<div class="cp-cluster">${cells}</div>`;
}

/** The `g-` classes the gallery's own stylesheet draws, for review.ts. */
async function galleryClasses(): Promise<string> {
  const css = await readFile(join(HERE, "legacy", "gallery.css"), "utf8");
  return [...new Set([...css.matchAll(/\.(g-[\w-]+)/g)].map((m) => m[1] ?? ""))].sort().join(" ");
}

function frame(title: string, page: string, body: string, classes: string): string {
  return `<!DOCTYPE html>
<html lang="en" class="cp" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="marotte-preview" content="desktop">
<title>${title}: cplieger gallery</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="css/system.css">
<link rel="stylesheet" href="gallery.css">
<meta name="gallery-classes" content="${classes}">
</head>
<body data-page="${page}">
<header class="cp-header g-header">
  <a class="cp-wordmark" href="index.html"><span class="cp-mark" aria-hidden="true">C</span><span class="cp-hidden-narrow">Gallery</span></a>
  <nav class="cp-nav g-nav" aria-label="Gallery">
${nav(page)}
  </nav>
</header>
${body}
<div class="controls" role="group" aria-label="Gallery controls">
  <label>Theme <select name="theme"><option value="light">Light</option><option value="dark">Dark</option></select></label>
  <label>Hue <input name="hue" type="range" min="0" max="359" value="255"></label>
  <label><input name="motion" type="checkbox"> Reduced motion</label>
  <label>Show <select name="show"><option value="all">Every card</option><option value="review">To review</option><option value="mockup">Mockups</option><option value="built">Built</option></select></label>
</div>
<script type="module" src="gallery.js"></script>
</body>
</html>
`;
}

/** A frame's page: the library alone, no gallery header or controls. */
function bare(title: string, body: string, script: boolean): string {
  return `<!DOCTYPE html>
<html lang="en" class="cp" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}: cplieger gallery</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="css/system.css">
</head>
<body>
${body}
${script ? '<script type="module" src="frame.js"></script>\n' : ""}</body>
</html>
`;
}

/** Builds the gallery into `out`, emptied first. */
export async function buildGallery(out = join(HERE, "dist")): Promise<void> {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const grid = await iconGrid();
  const classes = await galleryClasses();
  for (const [page, , , title] of PAGES) {
    const body = (await readFile(join(HERE, "pages", `${page}.html`), "utf8"))
      .trimEnd()
      .replace('<div class="g-icons" data-icon-grid></div>', grid);
    await writeFile(join(out, `${page}.html`), frame(title, page, body, classes));
  }
  const drawn = await drawnIcons();
  for (const [name, title, script] of FRAMES) {
    const body = (await readFile(join(HERE, "frames", `${name}.html`), "utf8"))
      .trimEnd()
      .replaceAll("<div data-drawn-icons></div>", drawn);
    await writeFile(join(out, `frame-${name}.html`), bare(title, body, script));
  }
  await build({
    // Against the repo root, where npm runs the script, and literals, so a
    // tool that traces bundler entries reaches main.ts and frame.ts.
    entryPoints: [
      { in: "gallery/main.ts", out: "gallery" },
      { in: "gallery/frame.ts", out: "frame" },
    ],
    bundle: true,
    format: "esm",
    platform: "browser",
    outdir: out,
    // The package marks its scripts free of side effects, which would drop
    // the gallery's own, imported for its effects alone.
    ignoreAnnotations: true,
    logLevel: "warning",
  });
  await cp(join(HERE, "legacy", "gallery.css"), join(out, "gallery.css"));
  await cp(join(HERE, "media"), join(out, "media"), { recursive: true });
  await cp(join(ROOT, "css", "system.css"), join(out, "css", "system.css"));
  await cp(join(ROOT, "fonts"), join(out, "fonts"), { recursive: true });
  for (const dir of ["svg", "marks"]) {
    await cp(join(ROOT, "icons", dir), join(out, "icons", dir), { recursive: true });
  }
}

if (process.argv[1] === import.meta.filename) {
  await buildGallery();
  process.stdout.write(`built ${String(PAGES.length)} pages into gallery/dist\n`);
}
