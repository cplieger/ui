import { readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

import * as prettier from "prettier";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const CSS = join(ROOT, "css", "system.css");
// The colour block lives in its own element file; css/system.css is built
// from every element file in src/system/manifest.txt.
const COLOUR = join(ROOT, "src", "foundations", "colour", "ladders.css");
const MANIFEST = join(ROOT, "src", "system", "manifest.txt");
const HEADER = join(ROOT, "src", "system", "header.css");
const DESIGN = join(ROOT, "docs", "design-colour.md");
const FONTS = join(ROOT, "fonts");
const require = createRequire(import.meta.url);
// Literal specifiers, so knip sees the two devDependencies in use.
const FAMILIES = [
  [
    "atkinson-hyperlegible-next",
    require.resolve("@fontsource-variable/atkinson-hyperlegible-next/package.json"),
  ],
  [
    "atkinson-hyperlegible-mono",
    require.resolve("@fontsource-variable/atkinson-hyperlegible-mono/package.json"),
  ],
] as const;
const SUBSETS = ["latin", "latin-ext"] as const;
const START = "/* colour:start */";
const END = "/* colour:end */";

type Theme = "light" | "dark";
type Colour = [number, number, number];
type Mode = "normal" | "more";
type Shape = "neutral" | "accent";

// Lightness per step. Steps: 1 page, 2 raised, 3 sunken and a tone's tint,
// 4 control, 5 its hover, 6 pressed and the hairline, 7 border, 8 strong
// border and focus, 9 solid, 10 solid hover (derived from 9, so its value here
// is unused), 11 secondary text, 12 primary text. "more" serves
// prefers-contrast: more.
const LADDER: Record<"normal" | "more", Record<"light" | "dark", readonly number[]>> = {
  normal: {
    light: [0.993, 0.975, 0.955, 0.932, 0.908, 0.88, 0.82, 0.62, 0.548, 0.515, 0.475, 0.25],
    dark: [0.185, 0.215, 0.25, 0.282, 0.315, 0.35, 0.42, 0.56, 0.64, 0.69, 0.79, 0.945],
  },
  more: {
    light: [0.993, 0.975, 0.955, 0.932, 0.908, 0.86, 0.7, 0.5, 0.43, 0.39, 0.38, 0.18],
    dark: [0.185, 0.215, 0.25, 0.282, 0.315, 0.42, 0.56, 0.7, 0.72, 0.76, 0.88, 0.965],
  },
};

// Chroma per step, as a factor of the family's seed chroma. Near-white and
// near-black hold little chroma inside sRGB, so the ends taper.
const CHROMA: Record<Shape, Record<Theme, readonly number[]>> = {
  neutral: {
    light: [0.35, 0.55, 0.75, 0.9, 1, 1, 1, 1, 1, 1, 1, 1],
    dark: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.6, 0.3],
  },
  accent: {
    light: [0.04, 0.08, 0.13, 0.18, 0.24, 0.3, 0.4, 0.7, 1, 1, 0.85, 0.35],
    dark: [0.1, 0.13, 0.17, 0.21, 0.26, 0.32, 0.42, 0.65, 1, 1, 0.55, 0.18],
  },
};

const MORE_TEXT_CHROMA = 0.4;

// A light solid takes white ink at any hue and chroma up to 0.15: 54.8% is
// where white overtakes black on a grey, and greens and teals, which are the
// brightest at a given lightness, dip by up to SOLID_DIP more, centred on
// SOLID_DIP_HUE. Fitted to contrast-color() over every hue.
const SOLID_DIP = 0.024;
const SOLID_DIP_HUE = 189;
const SOLID_DIP_POWER = 4;

function lightSolidL(hue: number): number {
  const w = Math.max(0, Math.cos(((hue - SOLID_DIP_HUE) * Math.PI) / 180)) ** SOLID_DIP_POWER;
  return (LADDER.normal.light[8] ?? 0) - SOLID_DIP * w;
}
const SOLID_HOVER_MIX = 0.12;

// The header: the brand at step 9's light lightness in the light theme; in
// the dark theme a deep tone of the brand under a near-white tint of it.
// L is lightness, K a factor of the brand seed's chroma.
const SHELL: Record<Mode, { darkL: number; darkK: number; inkL: number; inkK: number }> = {
  normal: { darkL: 0.34, darkK: 0.7, inkL: 0.96, inkK: 0.15 },
  more: { darkL: 0.3, darkK: 0.7, inkL: 0.985, inkK: 0.06 },
};

// [custom-property prefix, hue seed, chroma seed, shape]
const ROOT_FAMILIES: readonly (readonly [string, string, string, Shape])[] = [
  ["cp-neutral", "--cp-neutral-h", "--cp-neutral-c", "neutral"],
  ["cp-accent", "--cp-accent-h", "--cp-accent-c", "accent"],
  ["cp-danger", "--cp-danger-h", "--cp-danger-c", "accent"],
  ["cp-warning", "--cp-warning-h", "--cp-warning-c", "accent"],
  ["cp-success", "--cp-success-h", "--cp-success-c", "accent"],
];
const TONE = ["cp-tone", "--cp-tone-h", "--cp-tone-c", "accent"] as const;

// The chroma every hue may take, in docs/design-colour.md's words.
const ENVELOPE = { accent: 0.09, neutral: 0.015 } as const;

function factor(shape: Shape, theme: Theme, mode: Mode, i: number): number {
  const k = CHROMA[shape][theme][i] ?? 0;
  return Number((mode === "more" && i >= 10 ? k * MORE_TEXT_CHROMA : k).toFixed(4));
}

// A percentage as prettier prints it: one decimal at most, no trailing zero.
const pct = (v: number) => `${String(Number((v * 100).toFixed(1)))}%`;

function stepExpr(shape: Shape, i: number, theme: Theme, mode: Mode, h: string, c: string) {
  const dips = i === 8 && theme === "light" && mode === "normal";
  const l = dips
    ? `calc(${pct(LADDER[mode][theme][i] ?? 0)} - ${pct(SOLID_DIP)} * pow(max(0, cos((var(${h}) - ${String(SOLID_DIP_HUE)}) * 1deg)), ${String(SOLID_DIP_POWER)}))`
    : pct(LADDER[mode][theme][i] ?? 0);
  return `oklch(${l} calc(var(${c}) * ${String(factor(shape, theme, mode, i))}) var(${h}))`;
}

function ladder(family: readonly [string, string, string, Shape], mode: Mode): string[] {
  const [p, h, c, shape] = family;
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    if (i === 9) {
      // Hover on a solid moves away from its ink, so its contrast rises.
      out.push(
        `--${p}-10: color-mix(in oklab, var(--${p}-9), contrast-color(contrast-color(var(--${p}-9))) var(--cp-solid-hover-mix));`,
      );
      continue;
    }
    const light = stepExpr(shape, i, "light", mode, h, c);
    const dark = stepExpr(shape, i, "dark", mode, h, c);
    out.push(`--${p}-${String(i + 1)}: light-dark(${light}, ${dark});`);
  }
  out.push(`--${p}-on: contrast-color(var(--${p}-9));`);
  return out;
}

function shell(mode: Mode): string {
  const { darkL, darkK, inkL, inkK } = SHELL[mode];
  return [
    `--cp-brand-l: ${pct(LADDER[mode].light[8] ?? 0)};`,
    `--cp-shell-dark-l: ${pct(darkL)};`,
    `--cp-shell-dark-k: ${String(darkK)};`,
    `--cp-shell-ink-l: ${pct(inkL)};`,
    `--cp-shell-ink-k: ${String(inkK)};`,
  ].join(" ");
}

// Harmony colours, the accent's split complement tuned after the method of
// pro-color-harmonies (docs/design-colour.md states the rules). A partner
// sits at step 9's lightness before its white-ink dip, with its own ink,
// unless its hue needs more to look clean; it leaves the sickly yellow-greens; and it
// carries more chroma than the accent, so an orange is vivid, not brown,
// under a cap that keeps it in sRGB. The gamut test checks the fitted caps.
const HARMONY = {
  // the lightness the partners and their gamut caps were fitted at: step 9's
  // before the white-ink dip, which the partners do not follow
  l9: { light: 0.56, dark: 0.64 },
  turns: [150, 210],
  chroma: 1.2,
  // lightness floor: base + amp * max(0, cos(h - peak))^power, which only
  // the yellows and ambers rise above step 9
  floor: { base: 0.5, amp: 0.32, peak: 95, power: 4 },
  // the yellow-green band and where its two halves move to
  band: { from: 100, to: 135, split: 117.5, low: 95, high: 142 },
  // the lighter accent sits this far above step 9
  lighter: 0.14,
  // chroma cap: a - b * max(0, cos(h - centre))^power
  cap: {
    light: { partner: [0.166, 0.066, 200, 3], lighter: [0.154, 0.034, 200, 8] },
    dark: { partner: [0.166, 0.056, 200, 4], lighter: [0.131, 0.02, 265, 8] },
  },
} as const;

type Cap = readonly [number, number, number, number];

/** The harmony colours as OKLCH triples, the reference the CSS computes. */
function harmony(hue: number, chroma: number, theme: Theme): Colour[] {
  const l9 = HARMONY.l9[theme];
  const { floor, band } = HARMONY;
  const cos = (deg: number) => Math.cos((deg * Math.PI) / 180);
  const capOf = ([a, b, centre, power]: Cap, h: number) =>
    a - b * Math.max(0, cos(h - centre)) ** power;
  const partner = (turn: number): Colour => {
    let h = (((hue + turn) % 360) + 360) % 360;
    if (h > band.from && h < band.split) {
      h = band.low;
    } else if (h >= band.split && h < band.to) {
      h = band.high;
    }
    const l = Math.max(
      l9,
      floor.base + floor.amp * Math.max(0, cos(h - floor.peak)) ** floor.power,
    );
    return [l, Math.min(chroma * HARMONY.chroma, capOf(HARMONY.cap[theme].partner, h)), h];
  };
  // The lead is the accent's own step 9, white-ink dip included.
  const lead = theme === "light" ? lightSolidL(hue) : (LADDER.normal.dark[8] ?? 0);
  return [
    [lead, chroma, hue],
    ...HARMONY.turns.map(partner),
    [l9 + HARMONY.lighter, Math.min(chroma, capOf(HARMONY.cap[theme].lighter, hue)), hue],
  ];
}

const num = (v: number) => String(Number(v.toFixed(4)));

// A partner's hue as CSS: the turn wrapped into 0 to 360, then the band's
// two halves moved to their edges. clamp(0, x * 1e5, 1) is 0 for x <= 0 and
// 1 from x = 1e-5; adding 1 makes it 1 at x = 0 too, for the closed edge.
function partnerHueCss(turn: number): string {
  const { band } = HARMONY;
  const raw = `mod(calc(var(--cp-accent-h) + ${String(turn)}), 360)`;
  const step = (x: string, closed = false) => `clamp(0, (${x}) * 100000${closed ? " + 1" : ""}, 1)`;
  const lowHalf = `${step(`${raw} - ${num(band.from)}`)} * ${step(`${num(band.split)} - ${raw}`)}`;
  const highHalf = `${step(`${raw} - ${num(band.split)}`, true)} * ${step(`${num(band.to)} - ${raw}`)}`;
  return `calc(${raw} + ${lowHalf} * (${num(band.low)} - ${raw}) + ${highHalf} * (${num(band.high)} - ${raw}))`;
}

function capCss([a, b, centre, power]: Cap, h: string): string {
  return `calc(${num(a)} - ${num(b)} * pow(max(0, cos((${h} - ${String(centre)}) * 1deg)), ${String(power)}))`;
}

function partnerCss(theme: Theme, h: string): string {
  const { floor } = HARMONY;
  const l9 = HARMONY.l9[theme];
  const l = `max(${num(l9)}, calc(${num(floor.base)} + ${num(floor.amp)} * pow(max(0, cos((${h} - ${String(floor.peak)}) * 1deg)), ${String(floor.power)})))`;
  const c = `min(calc(var(--cp-accent-c) * ${num(HARMONY.chroma)}), ${capCss(HARMONY.cap[theme].partner, h)})`;
  return `oklch(${l} ${c} ${h})`;
}

function lighterCss(theme: Theme): string {
  const l9 = HARMONY.l9[theme];
  const c = `min(var(--cp-accent-c), ${capCss(HARMONY.cap[theme].lighter, "var(--cp-accent-h)")})`;
  return `oklch(${pct(l9 + HARMONY.lighter)} ${c} var(--cp-accent-h))`;
}

function harmonyBlock(): string {
  const hueProps = HARMONY.turns.map((_, i) => `--cp-harmony-${String(i + 2)}-h`);
  const registered = hueProps
    .map((p) => `@property ${p} { syntax: "<number>"; inherits: true; initial-value: 0; }`)
    .join("\n\n");
  const decls = [
    ...HARMONY.turns.map((t, i) => `${hueProps[i] ?? ""}: ${partnerHueCss(t)};`),
    `--cp-harmony-1: var(--cp-accent-9);`,
    ...hueProps.map(
      (p, i) =>
        `--cp-harmony-${String(i + 2)}: light-dark(${partnerCss("light", `var(${p})`)}, ${partnerCss("dark", `var(${p})`)});`,
    ),
    `--cp-harmony-4: light-dark(${lighterCss("light")}, ${lighterCss("dark")});`,
    ...[1, 2, 3, 4].map(
      (n) => `--cp-harmony-${String(n)}-on: contrast-color(var(--cp-harmony-${String(n)}));`,
    ),
  ];
  return `${registered}\n\n:root { ${decls.join(" ")} }`;
}

function colourBlock(): string {
  const rules = (mode: Mode): string =>
    `:root { ${mode === "normal" ? `--cp-solid-hover-mix: ${String(SOLID_HOVER_MIX * 100)}%;` : ""} ${shell(mode)} ${ROOT_FAMILIES.flatMap((f) => ladder(f, mode)).join(" ")} }
     :root, [data-tone] { ${ladder(TONE, mode).join(" ")} }`;
  return `${START}\n/* Written by npm run system:sync from src/system/system-css.node.test.ts. */\n${rules("normal")}\n\n@media (prefers-contrast: more) { ${rules("more")} }\n\n${harmonyBlock()}\n${END}`;
}

function markers(current: string): [number, number] {
  const a = current.indexOf(START);
  const b = current.indexOf(END);
  if (a < 0 || b < a) {
    throw new Error(
      `src/foundations/colour/ladders.css: the ${START} and ${END} markers are missing`,
    );
  }
  return [a, b + END.length];
}

// The file with the generated block spliced in and formatted, for the sync.
async function synced(current: string): Promise<string> {
  const [a, b] = markers(current);
  const spliced = current.slice(0, a) + colourBlock() + current.slice(b);
  const options = (await prettier.resolveConfig(COLOUR)) ?? {};
  return prettier.format(spliced, { ...options, filepath: COLOUR });
}

// Whitespace prettier may add or remove, so the check needs no formatter.
const squash = (css: string) =>
  css
    .replace(/\s+/g, " ")
    .replace(/\s*([(),;{}])\s*/g, "$1")
    .trim();

// OKLCH to linear sRGB (Björn Ottosson's OKLab matrices).
function linearSrgb(l: number, c: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

// A browser clips a colour just outside sRGB; 2% of a linear channel is
// below what a reader can see and leaves the contrast maths valid.
const inGamut = (rgb: readonly number[]) => rgb.every((v) => v >= -0.02 && v <= 1.02);
const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
const luminance = ([r, g, b]: readonly number[]) =>
  0.2126 * clamp(r ?? 0) + 0.7152 * clamp(g ?? 0) + 0.0722 * clamp(b ?? 0);
const ratio = (y1: number, y2: number) => (Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05);

type Ladder = Record<Mode, Record<Theme, readonly number[]>>;

function steps(
  shape: Shape,
  theme: Theme,
  mode: Mode,
  hue: number,
  chroma: number,
  lad: Ladder,
): Colour[] {
  const out: Colour[] = [];
  for (let i = 0; i < 12; i++) {
    const l =
      i === 8 && theme === "light" && mode === "normal" && lad === LADDER
        ? lightSolidL(hue)
        : (lad[mode][theme][i] ?? 0);
    out.push([l, chroma * factor(shape, theme, mode, i), hue]);
  }
  // Step 10: step 9 mixed in oklab toward white or black, away from its ink.
  const [l, c, h] = out[8] as Colour;
  const target = inkIsWhite(out[8] as Colour) ? 0 : 1;
  out[9] = [l * (1 - SOLID_HOVER_MIX) + target * SOLID_HOVER_MIX, c * (1 - SOLID_HOVER_MIX), h];
  return out;
}

// contrast-color(): white or black, whichever contrasts more.
function inkIsWhite(solid: Colour): boolean {
  const y = luminance(linearSrgb(...solid));
  return ratio(1, y) >= ratio(0, y);
}

// [foreground step or "on", background step, floor]; text 4.5, boundaries 3.
const PAIRS: readonly (readonly [number | "on", number, number])[] = [
  [12, 1, 7],
  [12, 2, 7],
  [12, 3, 7],
  [12, 4, 4.5],
  [12, 5, 4.5],
  // a control's label on its pressed fill
  [12, 6, 4.5],
  ...[1, 2, 3, 4, 5].map((b) => [11, b, 4.5] as const),
  ...[1, 2, 3].map((b) => [8, b, 3] as const),
  ["on", 9, 4.5],
  ["on", 10, 4.5],
  [9, 1, 3],
];

function failures(shape: Shape, hue: number, chroma: number, lad: Ladder = LADDER): string[] {
  const out: string[] = [];
  if (shape === "neutral") {
    // data-tone="neutral" runs the neutral seed through the accent shape at twice its chroma.
    out.push(...failures("accent", hue, chroma * 2, lad).map((f) => `neutral tone: ${f}`));
  } else {
    // The dark header: its fill and its ink; the light one is step 9 and its contrast-color ink.
    for (const mode of ["normal", "more"] as const) {
      const { darkL, darkK, inkL, inkK } = SHELL[mode];
      const bg = linearSrgb(darkL, chroma * darkK, hue);
      const ink = linearSrgb(inkL, chroma * inkK, hue);
      if (!inGamut(bg) || !inGamut(ink)) {
        out.push(`dark ${mode} header is outside sRGB`);
      }
      const r = ratio(luminance(ink), luminance(bg));
      const need = mode === "normal" ? 4.5 : 7;
      if (r < need) {
        out.push(`dark ${mode} header ink is ${r.toFixed(2)}:1, needs ${String(need)}:1`);
      }
    }
  }
  for (const theme of ["light", "dark"] as const) {
    for (const mode of ["normal", "more"] as const) {
      const st = steps(shape, theme, mode, hue, chroma, lad);
      const rgb = st.map((s) => linearSrgb(...s));
      rgb.forEach((v, i) => {
        if (!inGamut(v)) {
          out.push(`${theme} ${mode} step ${String(i + 1)} is outside sRGB`);
        }
      });
      for (const [fg, bg, floor] of PAIRS) {
        const need = mode === "more" ? (floor >= 4.5 ? 7 : 4.5) : floor;
        const fy =
          fg === "on" ? (inkIsWhite(st[8] as Colour) ? 1 : 0) : luminance(rgb[fg - 1] ?? []);
        const r = ratio(fy, luminance(rgb[bg - 1] ?? []));
        if (r + 1e-9 < need) {
          out.push(
            `${theme} ${mode} ${String(fg)} on ${String(bg)} is ${r.toFixed(2)}:1, needs ${String(need)}:1`,
          );
        }
      }
    }
  }
  return out;
}

/**
 * What keeps fonts/ from being the pinned Fontsource release of exactly the
 * two families and subsets, licences included. With SYSTEM_SYNC=1 it copies
 * them instead.
 */
async function fontDrift(sync: boolean): Promise<string[]> {
  const problems: string[] = [];
  const want = new Map<string, Buffer>();
  for (const [family, manifest] of FAMILIES) {
    const pkg = dirname(manifest);
    for (const subset of SUBSETS) {
      want.set(
        `${family}-${subset}.woff2`,
        await readFile(join(pkg, "files", `${family}-${subset}-wght-normal.woff2`)),
      );
    }
    want.set(`LICENSE-${family}`, await readFile(join(pkg, "LICENSE")));
  }
  for (const [file, bytes] of want) {
    const have = await readFile(join(FONTS, file)).catch(() => null);
    if (have?.equals(bytes) === true) {
      continue;
    }
    if (sync) {
      await writeFile(join(FONTS, file), bytes);
    } else {
      problems.push(`${file}: ${have === null ? "missing" : "differs from the pinned Fontsource"}`);
    }
  }
  for (const file of await readdir(FONTS)) {
    if (!want.has(file)) {
      problems.push(`${file}: not a file of the pinned families`);
    }
  }
  return problems;
}

// The highest chroma, in steps of 0.005, at which a hue keeps every step in
// sRGB and every pair over its floor.
function limit(shape: Shape, hue: number): number {
  let c = 0;
  while (c < 0.4 && failures(shape, hue, Number((c + 0.005).toFixed(3))).length === 0) {
    c = Number((c + 0.005).toFixed(3));
  }
  return c;
}

// docs/design-colour.md's envelope table: each row is the lowest limit of every
// whole degree from its hue up to the next row's, so a row holds for all of them.
function envelopeTable(): string {
  const rows = ["| Hues | Accent or tone | Neutral |", "| --- | --- | --- |"];
  for (let hue = 0; hue < 360; hue += 15) {
    const window = Array.from({ length: 15 }, (_, i) => hue + i);
    const low = (shape: Shape) => Math.min(...window.map((h) => limit(shape, h))).toFixed(3);
    rows.push(`| ${String(hue)} to ${String(hue + 14)} | ${low("accent")} | ${low("neutral")} |`);
  }
  return `<!-- envelope:start -->\n${rows.join("\n")}\n<!-- envelope:end -->`;
}

// The element files src/system/manifest.txt lists, in its order.
async function manifest(): Promise<string[]> {
  return (await readFile(MANIFEST, "utf8"))
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));
}

// css/system.css: the header, then every element file in the manifest's order.
async function built(): Promise<string> {
  const parts = await Promise.all(
    (await manifest()).map((f) => readFile(join(ROOT, "src", f), "utf8")),
  );
  return [await readFile(HEADER, "utf8"), ...parts].join("\n");
}

describe("css/system.css", () => {
  it("carries the colour block the ladder writes", async () => {
    const current = await readFile(COLOUR, "utf8");
    if (process.env["SYSTEM_SYNC"] === "1") {
      await writeFile(COLOUR, await synced(current));
    }
    const now = await readFile(COLOUR, "utf8");
    const [a, b] = markers(now);
    expect(squash(now.slice(a, b)), "run npm run system:sync").toBe(squash(colourBlock()));
  });

  it("is built from the element files the manifest lists, in its order", async () => {
    if (process.env["SYSTEM_SYNC"] === "1") {
      await writeFile(CSS, await built());
    }
    expect(
      await readFile(CSS, "utf8"),
      "css/system.css is built: edit the element files src/system/manifest.txt lists, then run npm run system:sync",
    ).toBe(await built());
  });

  it("lists every element file once, and no file the tree lacks", async () => {
    const listed = await manifest();
    const onDisk: string[] = [];
    const walk = async (dir: string, rel: string): Promise<void> => {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) {
          await walk(join(dir, e.name), r);
        } else if (e.name.endsWith(".css") && r !== "system/header.css") {
          onDisk.push(r);
        }
      }
    };
    await walk(join(ROOT, "src"), "");
    expect(new Set(listed).size, "a file listed twice").toBe(listed.length);
    expect([...listed].sort()).toEqual(onDisk.sort());
  });

  it("documents the envelope the ladder gives", async () => {
    const table = envelopeTable();
    const block = /<!-- envelope:start -->[\s\S]*<!-- envelope:end -->/;
    if (process.env["SYSTEM_SYNC"] === "1") {
      await writeFile(DESIGN, (await readFile(DESIGN, "utf8")).replace(block, table));
    }
    expect(block.exec(await readFile(DESIGN, "utf8"))?.[0], "run npm run system:sync").toBe(table);
  });

  it("keeps every hue in gamut and every pair over its floor at the chroma every hue may take", () => {
    const report: string[] = [];
    for (let hue = 0; hue < 360; hue += 5) {
      for (const shape of ["accent", "neutral"] as const) {
        for (const f of failures(shape, hue, ENVELOPE[shape])) {
          report.push(`${shape} hue ${String(hue)}: ${f}`);
        }
      }
    }
    expect(report).toEqual([]);
  });

  it("inks every light solid white, at every hue and at chromas up to 0.15", () => {
    const black: string[] = [];
    for (let hue = 0; hue < 360; hue++) {
      for (const chroma of [0, 0.015, 0.03, 0.06, 0.09, 0.12, 0.15]) {
        const solid = steps("accent", "light", "normal", hue, chroma, LADDER)[8] as Colour;
        if (!inkIsWhite(solid)) {
          black.push(`${String(hue)} at ${String(chroma)}`);
        }
      }
    }
    expect(black).toEqual([]);
  });

  it("passes with its own default seeds", () => {
    expect(failures("neutral", 260, 0.008)).toEqual([]);
    for (const [h, c] of [
      [255, 0.13],
      [27, 0.15],
      [75, 0.12],
      [150, 0.12],
    ] as const) {
      expect(failures("accent", h, c)).toEqual([]);
    }
  });

  it("finds a hue whose chroma leaves sRGB and a pair that falls under its floor", () => {
    expect(failures("accent", 195, 0.2).some((f) => f.includes("outside sRGB"))).toBe(true);
    const faint = { ...LADDER, normal: { ...LADDER.normal, light: [...LADDER.normal.light] } };
    // An achromatic oklch colour's luminance is L cubed: (0.993³ + 0.05) / (0.7³ + 0.05).
    faint.normal.light[10] = 0.7;
    expect(failures("neutral", 0, 0, faint)).toContain(
      "light normal 11 on 1 is 2.62:1, needs 4.5:1",
    );
  });

  it("keeps every harmony colour inside sRGB, its ink over 4.5:1 and its hue out of the yellow-greens", () => {
    const report: string[] = [];
    for (let hue = 0; hue < 360; hue++) {
      for (const chroma of [0.02, 0.09, 0.137, 0.2]) {
        for (const theme of ["light", "dark"] as const) {
          harmony(hue, chroma, theme).forEach((colour, i) => {
            const at = `${theme} hue ${String(hue)} chroma ${String(chroma)} harmony ${String(i + 1)}`;
            // 1 is the accent's step 9, which the ladder checks at its own seeds.
            if (i > 0 && !inGamut(linearSrgb(...colour))) {
              report.push(`${at} is outside sRGB`);
            }
            const y = luminance(linearSrgb(...colour));
            if (i > 0 && Math.max(ratio(1, y), ratio(0, y)) < 4.5) {
              report.push(`${at} has no ink at 4.5:1`);
            }
            // 4 is the accent's own hue, which is the app's to choose.
            if (
              (i === 1 || i === 2) &&
              colour[2] > HARMONY.band.from &&
              colour[2] < HARMONY.band.to
            ) {
              report.push(`${at} sits in the yellow-greens at hue ${colour[2].toFixed(1)}`);
            }
          });
        }
      }
    }
    expect(report).toEqual([]);
  });

  it("keeps an orange partner at the accent's lightness but vivid, and lifts a yellow one", () => {
    const [lead, orange, yellow] = harmony(255, 0.137, "light");
    // At 56% and the accent's own chroma, hue 45 reads brown.
    expect(orange?.[0]).toBe(HARMONY.l9.light);
    expect(lead?.[0]).toBeCloseTo(0.548 - 0.024 * Math.cos((66 * Math.PI) / 180) ** 4, 5);
    expect(orange?.[1]).toBeCloseTo(0.137 * HARMONY.chroma, 5);
    expect(yellow?.[2]).toBe(HARMONY.band.low);
    expect(yellow?.[0]).toBeCloseTo(HARMONY.floor.base + HARMONY.floor.amp, 5);
  });

  it("ships fonts byte-identical to the pinned Fontsource release", async () => {
    expect(await fontDrift(process.env["SYSTEM_SYNC"] === "1")).toEqual([]);
  });

  it("ships the stylesheet and its fonts on npm and JSR", async () => {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
      files: string[];
      exports: Record<string, string>;
    };
    expect(pkg.exports["./css/system"]).toBe("./css/system.css");
    expect(pkg.exports["./fonts/*"]).toBe("./fonts/*");
    expect(pkg.files).toContain("fonts/");
    const jsr = JSON.parse(await readFile(join(ROOT, "jsr.json"), "utf8")) as {
      publish: { include: string[] };
    };
    expect(jsr.publish.include).toEqual(
      expect.arrayContaining(["fonts/*.woff2", "fonts/LICENSE-*"]),
    );
    const css = await readFile(CSS, "utf8");
    for (const [, file] of css.matchAll(/url\("\.\.\/fonts\/([^"]+)"\)/g)) {
      await expect(readFile(join(ROOT, "fonts", file ?? ""))).resolves.toBeInstanceOf(Buffer);
    }
    expect(await readFile(join(ROOT, "THIRD_PARTY_NOTICES.md"), "utf8")).toContain(
      "fonts/LICENSE-atkinson-hyperlegible-next",
    );
  });
});
