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
  band: { from: 100, to: 135, split: 117.5, low: 90, high: 142 },
  // the lighter accent sits this far above step 9
  lighter: 0.14,
  // chroma cap: a - b * max(0, cos(h - centre))^power
  cap: {
    light: { partner: [0.166, 0.066, 200, 3], lighter: [0.154, 0.034, 200, 8] },
    dark: { partner: [0.166, 0.056, 200, 4], lighter: [0.131, 0.02, 265, 8] },
  },
} as const;

type Cap = readonly [number, number, number, number];

const cos = (deg: number) => Math.cos((deg * Math.PI) / 180);

// The accent's hue turned, then moved out of the yellow-greens to the band's edges.
function turned(hue: number, turn: number): number {
  const { band } = HARMONY;
  const h = (((hue + turn) % 360) + 360) % 360;
  if (h > band.from && h < band.split) {
    return band.low;
  }
  return h >= band.split && h < band.to ? band.high : h;
}

/** The harmony colours as OKLCH triples, the reference the CSS computes. */
function harmony(hue: number, chroma: number, theme: Theme): Colour[] {
  const l9 = HARMONY.l9[theme];
  const { floor } = HARMONY;
  const capOf = ([a, b, centre, power]: Cap, h: number) =>
    a - b * Math.max(0, cos(h - centre)) ** power;
  const partner = (turn: number): Colour => {
    const h = turned(hue, turn);
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

// Series slots: nine categorical colours turned from the accent as the
// harmony partners are, slots 2 and 3 being harmony 2 and 3's hues. One rule
// for every hue. Odd slots are bright and even slots deep, a fixed step
// apart, so neighbours differ in lightness, which every colour-vision
// deficiency keeps. In the light theme a bright slot sits as light as 3:1 on
// every surface allows at its hue, so every slot meets the page at the same
// contrast; the curve is that ceiling, the least over the chromas a slot can
// take, fitted by two harmonics and kept under it. The dark theme's two
// levels hold 3:1 at every hue as they are. Chroma is the accent's times k,
// kept between min and max so a muted accent still gives slots apart, under a
// gamut cap fitted per level. The tests below check the fits.
const SERIES = {
  turns: [0, 150, 210, 30, 60, 90, 120, 240, 270],
  // light bright: a + r1 * cos(h - p1) + r2 * cos(2 * (h - p2)); deep is step below
  light: { a: 0.6276, r1: 0.019, p1: -7, r2: 0.0023, p2: 80, step: 0.18 },
  dark: { bright: 0.8, deep: 0.6 },
  chroma: { k: 1.3, min: 0.13, max: 0.2 },
  // a - b1 * max(0, cos(h - c1))^p1 - b2 * max(0, cos(h - c2))^p2
  cap: {
    light: {
      bright: [0.18, 0.038, 91, 5, 0.073, 199, 3],
      deep: [0.154, 0.034, 91, 7, 0.07, 199, 3],
    },
    dark: {
      bright: [0.169, 0.07, 255, 1, 0.059, 24, 4],
      deep: [0.169, 0.034, 89, 7, 0.06, 199, 3],
    },
  },
} as const;

type Level = "bright" | "deep";
type SeriesCap = readonly [number, number, number, number, number, number, number];

const levelOf = (slot: number): Level => (slot % 2 === 1 ? "bright" : "deep");

function lightnessOf(theme: Theme, level: Level, h: number): number {
  if (theme === "dark") {
    return SERIES.dark[level];
  }
  const { a, r1, p1, r2, p2, step } = SERIES.light;
  const bright = a + r1 * cos(h - p1) + r2 * cos(2 * (h - p2));
  return level === "bright" ? bright : bright - step;
}

/** The series slots as OKLCH triples, slot 1 first, the reference the CSS computes. */
function series(hue: number, chroma: number, theme: Theme): Colour[] {
  return SERIES.turns.map((turn, i) => {
    const level = levelOf(i + 1);
    // Slot 1 keeps the accent's own hue, which is the app's to choose.
    const h = i === 0 ? hue : turned(hue, turn);
    const [a, b1, c1, p1, b2, c2, p2]: SeriesCap = SERIES.cap[theme][level];
    const cap = a - b1 * Math.max(0, cos(h - c1)) ** p1 - b2 * Math.max(0, cos(h - c2)) ** p2;
    const want = Math.min(Math.max(chroma * SERIES.chroma.k, SERIES.chroma.min), SERIES.chroma.max);
    return [lightnessOf(theme, level, h), Math.min(want, cap), h];
  });
}

// An angle offset as CSS: `- 7` or `+ 7`, never `- -7`.
const offset = (deg: number) => (deg < 0 ? `+ ${String(-deg)}` : `- ${String(deg)}`);

function seriesCss(theme: Theme, slot: number): string {
  const level = levelOf(slot);
  const h = `var(--cp-series-${String(slot)}-h)`;
  const [a, b1, c1, p1, b2, c2, p2]: SeriesCap = SERIES.cap[theme][level];
  const trough = (b: number, centre: number, power: number) =>
    `${num(b)} * pow(max(0, cos((${h} - ${String(centre)}) * 1deg)), ${String(power)})`;
  const cap = `calc(${num(a)} - ${trough(b1, c1, p1)} - ${trough(b2, c2, p2)})`;
  const want = `clamp(${num(SERIES.chroma.min)}, calc(var(--cp-accent-c) * ${num(SERIES.chroma.k)}), ${num(SERIES.chroma.max)})`;
  let l: string;
  if (theme === "dark") {
    l = pct(SERIES.dark[level]);
  } else {
    const { a: la, r1, p1: q1, r2, p2: q2, step } = SERIES.light;
    const base = level === "bright" ? la : la - step;
    l = `calc(${num(base)} + ${num(r1)} * cos((${h} ${offset(q1)}) * 1deg) + ${num(r2)} * cos((2 * (${h} ${offset(q2)})) * 1deg))`;
  }
  return `oklch(${l} min(${want}, ${cap}) ${h})`;
}

function seriesBlock(): string {
  const slots = SERIES.turns.map((_, i) => i + 1);
  const registered = slots
    .map(
      (n) =>
        `@property --cp-series-${String(n)}-h { syntax: "<number>"; inherits: true; initial-value: 0; }`,
    )
    .join("\n\n");
  const hue = (n: number, turn: number) => {
    if (n === 1) {
      return "var(--cp-accent-h)";
    }
    const k = HARMONY.turns.indexOf(turn as (typeof HARMONY.turns)[number]);
    return k < 0 ? partnerHueCss(turn) : `var(--cp-harmony-${String(k + 2)}-h)`;
  };
  const decls = SERIES.turns.flatMap((turn, i) => {
    const n = String(i + 1);
    return [
      `--cp-series-${n}-h: ${hue(i + 1, turn)};`,
      `--cp-series-${n}: light-dark(${seriesCss("light", i + 1)}, ${seriesCss("dark", i + 1)});`,
    ];
  });
  // A slot is a tone: its tint and text steps take the slot's hue at the chroma
  // every hue may take, and its solid is the slot itself.
  const tones = slots.map(
    (n) =>
      `[data-series="${String(n)}"] { --cp-tone-h: var(--cp-series-${String(n)}-h); --cp-tone-c: ${num(ENVELOPE.accent)}; --cp-tone-9: var(--cp-series-${String(n)}); }`,
  );
  return `${registered}\n\n:root { ${decls.join(" ")} }\n\n${tones.join("\n")}`;
}

// Sequential and diverging scales: nine ordered steps each, for a fill that
// encodes a value; docs/design-colour.md states the rules. Step 1 is the
// lowest value and the nearest the surface in both themes. Hue follows
// lightness rank (1 the lightest step), turned toward a yellow when light and
// a blue when dark, which hold their colour there. The tests below hold the
// thresholds the rules were fitted to.
const SCALE = {
  // step 1's lightness, then step 9's, in equal steps
  sequential: { light: [0.86, 0.29], dark: [0.4, 0.92] },
  turn: { max: 30, light: HARMONY.floor.peak, dark: 265 },
  // The slots' factor and floor. A ceiling of 0.18 puts dark neighbours
  // 0.046 apart under protanopia; 0.17 is the highest that keeps 0.05.
  chroma: { k: SERIES.chroma.k, min: SERIES.chroma.min, max: 0.17 },
  // above knee, chroma tapers linearly to top of itself at ceil: a vivid
  // light cyan reads as white to a protanope
  taper: { knee: 0.75, ceil: 0.94, top: 0.4 },
  // the arms' lightness outward from the middle; dark arms start 16 points
  // out, since a protanope's red darkens onto the grey
  diverging: {
    middle: { light: 0.86, dark: 0.38 },
    arm: { light: [0.75, 0.64, 0.53, 0.42], dark: [0.54, 0.63, 0.72, 0.81] },
  },
  // Gamut cap, Ottosson's cusp triangle
  // (https://bottosson.github.io/posts/gamutclipping/): the cusp's lightness
  // and chroma are five-harmonic Fourier series of the hue, fitted to sRGB's
  // most chromatic colour at every whole degree, coefficients in the order
  // 1, cos h, sin h, cos 2h, sin 2h, and so on. low and high are the largest
  // factors keeping lightness 25% to 97% inside sRGB at every hue.
  cusp: {
    l: [
      0.7427, -0.1278, 0.1233, 0.0365, -0.0114, 0.0153, -0.0628, -0.0126, -0.0047, -0.0171, -0.0001,
    ],
    c: [
      0.2243, 0.0468, -0.0233, -0.0002, -0.0506, 0.0043, 0.0221, -0.0041, 0.0043, 0.0028, -0.0082,
    ],
    low: 0.88,
    high: 0.89,
    power: 1.2,
  },
} as const;

const wrapHue = (h: number) => ((h % 360) + 360) % 360;

// The signed shortest turn from one hue to another; exactly opposite is +180.
function shortTurn(from: number, to: number): number {
  const d = wrapHue(to - from);
  return d > 180 ? d - 360 : d;
}

function rankHue(accent: number, rank: number): number {
  const { max, light, dark } = SCALE.turn;
  const toLight = Math.max(-max, Math.min(max, shortTurn(accent, light)));
  const toDark = Math.max(-max, Math.min(max, shortTurn(accent, dark)));
  return wrapHue(accent + toDark + ((toLight - toDark) * (9 - rank)) / 8);
}

// The diverging scale's other arm. No fixed turn works at every hue (180
// degrees puts a cyan opposite a pink a deuteranope sees as one), so blue
// faces warm accents, orange cool ones, and greens and magentas a mirror.
function oppositeHue(accent: number): number {
  const a = wrapHue(accent);
  if (a >= 355 || a < 120) {
    return 245;
  }
  return a >= 170 && a < 308 ? 55 : 475 - a;
}

function cuspOf(h: number): [number, number] {
  const series = (k: readonly number[]) =>
    k.reduce((sum, v, i) => {
      const n = Math.ceil(i / 2);
      return sum + (i === 0 ? v : v * (i % 2 === 1 ? cos(n * h) : cos(n * h - 90)));
    }, 0);
  return [series(SCALE.cusp.l), series(SCALE.cusp.c)];
}

function scaleColour(l: number, h: number, accentChroma: number): Colour {
  const { k, min, max } = SCALE.chroma;
  const { knee, ceil, top } = SCALE.taper;
  const taper = l <= knee ? 1 : 1 - ((1 - top) * (l - knee)) / (ceil - knee);
  const [lc, cc] = cuspOf(h);
  const { low, high, power } = SCALE.cusp;
  const cap = Math.max(0, Math.min((low * cc * l) / lc, high * cc * ((1 - l) / (1 - lc)) ** power));
  return [l, Math.min(Math.min(Math.max(accentChroma * k, min), max) * taper, cap), h];
}

// A step's lightness as the CSS writes it, so the reference and the CSS agree.
function sequentialL(theme: Theme, i: number): number {
  const [a, b] = SCALE.sequential[theme];
  return Number((a + ((b - a) * i) / 8).toFixed(4));
}

// Light step k has rank k, dark step k rank 10 - k.
const rankOf = (theme: Theme, i: number) => (theme === "light" ? i + 1 : 9 - i);

/** The sequential steps as OKLCH triples, step 1 first, the reference the CSS computes. */
function sequential(hue: number, chroma: number, theme: Theme): Colour[] {
  return Array.from({ length: 9 }, (_, i) =>
    scaleColour(sequentialL(theme, i), rankHue(hue, rankOf(theme, i)), chroma),
  );
}

/** The diverging steps, step 1 the far end of the opposite arm, on a neutral seed. */
function diverging(
  hue: number,
  chroma: number,
  theme: Theme,
  neutralHue: number,
  neutralChroma: number,
  opposite = oppositeHue(hue),
): Colour[] {
  const arm = SCALE.diverging.arm[theme];
  const middle: Colour = [SCALE.diverging.middle[theme], neutralChroma, neutralHue];
  return [
    ...arm.map((l) => scaleColour(l, opposite, chroma)).reverse(),
    middle,
    ...arm.map((l) => scaleColour(l, hue, chroma)),
  ];
}

// A signed term of a sum as CSS: ` + 0.1 * x` or ` - 0.1 * x`.
const term = (k: number, x: string) => ` ${k < 0 ? "-" : "+"} ${num(Math.abs(k))} * ${x}`;

function cuspCss(k: readonly number[], h: string): string {
  const terms = k.slice(1).map((v, i) => {
    const n = Math.floor(i / 2) + 1;
    return term(v, `${i % 2 === 0 ? "cos" : "sin"}(${h} * ${String(n)}deg)`);
  });
  return `calc(${num(k[0] ?? 0)}${terms.join("")})`;
}

// One step's colour as CSS, its hue and cusp read from the registered numbers.
function scaleCss(l: number, h: string, cusp: string): string {
  const { k, min, max } = SCALE.chroma;
  const { knee, ceil, top } = SCALE.taper;
  const { low, high, power } = SCALE.cusp;
  const [lc, cc] = [`var(${cusp}-lc)`, `var(${cusp}-cc)`];
  const want = `clamp(${num(min)}, calc(var(--cp-accent-c) * ${num(k)}), ${num(max)})`;
  const tapered =
    l <= knee ? want : `${want} * (1 - ${num(1 - top)} * ${num(l - knee)} / ${num(ceil - knee)})`;
  const cap = `max(0, min(${num(low)} * ${cc} * ${num(l)} / ${lc}, ${num(high)} * ${cc} * pow(${num(1 - l)} / (1 - ${lc}), ${num(power)})))`;
  return `oklch(${num(l * 100)}% min(calc(${tapered}), ${cap}) ${h})`;
}

// The shortest turn from the accent toward a hue, capped, as CSS. mod() with
// a positive divisor lands in 0 to 360; the step subtracts 360 above 180.
function turnCss(to: number): string {
  const d = `mod(${String(to)} - var(--cp-accent-h), 360)`;
  const max = String(SCALE.turn.max);
  return `clamp(-${max}, ${d} - 360 * clamp(0, (${d} - 180) * 100000, 1), ${max})`;
}

// The four pieces of oppositeHue as CSS, each a window of the accent's hue
// with the partners' steps (partnerHueCss).
function oppositeHueCss(): string {
  const a = "mod(var(--cp-accent-h), 360)";
  const from = (edge: number) => `clamp(0, (${a} - ${String(edge)}) * 100000 + 1, 1)`;
  const below = (edge: number) => `clamp(0, (${String(edge)} - ${a}) * 100000, 1)`;
  const mirror = `(${from(120)} * ${below(170)} + ${from(308)} * ${below(355)})`;
  return `calc(245 + ${mirror} * (230 - ${a}) - ${from(170)} * ${below(308)} * 190)`;
}

function scaleBlock(): string {
  const ranks = Array.from({ length: 9 }, (_, i) => i + 1);
  const cusps = [
    ...ranks.map((r) => `--cp-scale-${String(r)}`),
    "--cp-scale-accent",
    "--cp-scale-opposite",
  ];
  const props = [
    "--cp-scale-to-light",
    "--cp-scale-to-dark",
    ...ranks.map((r) => `--cp-scale-${String(r)}-h`),
    "--cp-scale-opposite-h",
    ...cusps.flatMap((c) => [`${c}-lc`, `${c}-cc`]),
  ];
  const registered = props
    .map((p) => `@property ${p} { syntax: "<number>"; inherits: true; initial-value: 0; }`)
    .join("\n\n");
  const hueOf = (c: string) => (c === "--cp-scale-accent" ? "var(--cp-accent-h)" : `var(${c}-h)`);
  const decls = [
    `--cp-scale-to-light: ${turnCss(SCALE.turn.light)};`,
    `--cp-scale-to-dark: ${turnCss(SCALE.turn.dark)};`,
    ...ranks.map(
      (r) =>
        `--cp-scale-${String(r)}-h: mod(calc(var(--cp-accent-h) + var(--cp-scale-to-dark) + (var(--cp-scale-to-light) - var(--cp-scale-to-dark)) * ${num((9 - r) / 8)}), 360);`,
    ),
    `--cp-scale-opposite-h: ${oppositeHueCss()};`,
    ...cusps.flatMap((c) => [
      `${c}-lc: ${cuspCss(SCALE.cusp.l, hueOf(c))};`,
      `${c}-cc: ${cuspCss(SCALE.cusp.c, hueOf(c))};`,
    ]),
    ...ranks.map((n) => {
      const step = (theme: Theme) => {
        const cusp = `--cp-scale-${String(rankOf(theme, n - 1))}`;
        return scaleCss(sequentialL(theme, n - 1), `var(${cusp}-h)`, cusp);
      };
      return `--cp-sequential-${String(n)}: light-dark(${step("light")}, ${step("dark")});`;
    }),
    ...ranks.map((n) => {
      const step = (theme: Theme) => {
        if (n === 5) {
          return `oklch(${pct(SCALE.diverging.middle[theme])} var(--cp-neutral-c) var(--cp-neutral-h))`;
        }
        const arm = SCALE.diverging.arm[theme];
        const l = arm[Math.abs(n - 5) - 1] ?? 0;
        return n > 5
          ? scaleCss(l, "var(--cp-accent-h)", "--cp-scale-accent")
          : scaleCss(l, "var(--cp-scale-opposite-h)", "--cp-scale-opposite");
      };
      return `--cp-diverging-${String(n)}: light-dark(${step("light")}, ${step("dark")});`;
    }),
  ];
  return `${registered}\n\n:root { ${decls.join(" ")} }`;
}

function colourBlock(): string {
  const rules = (mode: Mode): string =>
    `:root { ${mode === "normal" ? `--cp-solid-hover-mix: ${String(SOLID_HOVER_MIX * 100)}%;` : ""} ${shell(mode)} ${ROOT_FAMILIES.flatMap((f) => ladder(f, mode)).join(" ")} }
     :root, [data-tone], [data-series] { ${ladder(TONE, mode).join(" ")} }`;
  return `${START}\n/* Written by npm run system:sync from src/system/system-css.node.test.ts. */\n${rules("normal")}\n\n@media (prefers-contrast: more) { ${rules("more")} }\n\n${harmonyBlock()}\n\n${seriesBlock()}\n\n${scaleBlock()}\n${END}`;
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

// Linear sRGB to OKLab (Björn Ottosson's matrices), for distances between colours.
function oklab([r = 0, g = 0, b = 0]: readonly number[]): Colour {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const deltaE = (a: Colour, b: Colour) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Three just-noticeable differences: CSS Color 4 puts one at 0.02 in OKLab
// (https://www.w3.org/TR/css-color-4/#gamut-mapping).
const APART = 0.06;

type Matrix = readonly [number, number, number, number, number, number, number, number, number];
const apply = (m: Matrix, [r = 0, g = 0, b = 0]: readonly number[]): number[] => [
  m[0] * r + m[1] * g + m[2] * b,
  m[3] * r + m[4] * g + m[5] * b,
  m[6] * r + m[7] * g + m[8] * b,
];

// Dichromat vision on linear sRGB, with libDaltonLens's public-domain matrices
// and its choice of model: Viénot 1999 for protanopia and deuteranopia,
// Brettel 1997 for tritanopia, whose two half-planes split at a normal
// (https://github.com/DaltonLens/libDaltonLens/blob/master/libDaltonLens.c).
const TRITAN = {
  normal: [0.03901, -0.02788, -0.01113],
  a: [1.01277, 0.13548, -0.14826, -0.01243, 0.86812, 0.14431, 0.07589, 0.805, 0.11911],
  b: [0.93678, 0.18979, -0.12657, 0.06154, 0.81526, 0.1232, -0.37562, 1.12767, 0.24796],
} as const;
const VISIONS = {
  protanopia: (c: readonly number[]) =>
    apply([0.11238, 0.88762, 0, 0.11238, 0.88762, 0, 0.00401, -0.00401, 1], c),
  deuteranopia: (c: readonly number[]) =>
    apply([0.29275, 0.70725, 0, 0.29275, 0.70725, 0, -0.02234, 0.02234, 1], c),
  tritanopia: (c: readonly number[]) => {
    const [r = 0, g = 0, b = 0] = c;
    const [nr, ng, nb] = TRITAN.normal;
    return apply(r * nr + g * ng + b * nb >= 0 ? TRITAN.a : TRITAN.b, c);
  },
} as const;

// The page, raised, sunken and overlay surfaces; the sunken dark and overlay
// light ones are roles.css's own.
function surfaceColours(theme: Theme, hue: number, chroma: number): Colour[] {
  const st = steps("neutral", theme, "normal", hue, chroma, LADDER);
  return theme === "light"
    ? [st[0] as Colour, st[1] as Colour, st[2] as Colour, [0.996, chroma * 0.5, hue]]
    : [st[0] as Colour, st[1] as Colour, [0.16, chroma * 0.8, hue], st[2] as Colour];
}

function surfacesOf(theme: Theme, hue: number, chroma: number): number[] {
  return surfaceColours(theme, hue, chroma).map((c) => luminance(linearSrgb(...c)));
}

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

const SEEDS = join(ROOT, "src", "foundations", "colour", "seeds.css");
const SWATCHES = join(ROOT, "docs", "images", "colour-scales.svg");

async function seed(name: string): Promise<number> {
  const m = new RegExp(`${name}:\\s*([\\d.]+);`).exec(await readFile(SEEDS, "utf8"));
  if (m?.[1] === undefined) {
    throw new Error(`src/foundations/colour/seeds.css sets no ${name}`);
  }
  return Number(m[1]);
}

function hex(c: Colour): string {
  const channel = (v: number) => {
    const x = clamp(v);
    const s = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.round(s * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${linearSrgb(...c)
    .map(channel)
    .join("")}`;
}

// docs/design-colour.md's swatches: the default seeds' two scales, each
// theme on its own page surface, as sRGB hex so any image viewer shows them.
async function scalesSvg(): Promise<string> {
  const aH = await seed("--cp-accent-h");
  const aC = await seed("--cp-accent-c");
  const nH = await seed("--cp-neutral-h");
  const nC = await seed("--cp-neutral-c");
  const box = { w: 36, h: 28, gap: 2, pad: 16, label: 88, panel: 136 };
  const width = box.pad * 2 + box.label + 9 * box.w + 8 * box.gap;
  const left = (i: number) => box.pad + box.label + i * (box.w + box.gap);
  const text = (x: number, y: number, fill: string, s: string, anchor = "start") =>
    `<text x="${String(x)}" y="${String(y)}" fill="${fill}" text-anchor="${anchor}">${s}</text>`;
  const panel = (theme: Theme, top: number) => {
    const ladder = steps("neutral", theme, "normal", nH, nC, LADDER);
    const ink = hex(ladder[11] as Colour);
    const row = (y: number, name: string, colours: readonly Colour[]) => [
      text(box.pad, y + 19, ink, name),
      ...colours.map(
        (c, i) =>
          `<rect x="${String(left(i))}" y="${String(y)}" width="${String(box.w)}" height="${String(box.h)}" fill="${hex(c)}"/>`,
      ),
    ];
    return [
      `<rect x="0" y="${String(top)}" width="${String(width)}" height="${String(box.panel)}" fill="${hex(ladder[0] as Colour)}"/>`,
      text(box.pad, top + 29, ink, theme === "light" ? "Light theme" : "Dark theme"),
      ...Array.from({ length: 9 }, (_, i) =>
        text(left(i) + box.w / 2, top + 50, hex(ladder[10] as Colour), String(i + 1), "middle"),
      ),
      ...row(top + 58, "Sequential", sequential(aH, aC, theme)),
      ...row(top + 94, "Diverging", diverging(aH, aC, theme, nH, nC)),
    ];
  };
  const height = box.panel * 2;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}" role="img" font-family="system-ui, sans-serif" font-size="13">`,
    `<title>The sequential and diverging scales of the default accent, steps 1 to 9, in the light and dark themes</title>`,
    ...panel("light", 0),
    ...panel("dark", box.panel),
    "</svg>",
    "",
  ].join("\n");
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

// The cp- class names in a module's source. A cp- word right before "-${"
// is an id prefix, and --cp- and data-cp- are a property and an attribute.
function cpClasses(source: string): string[] {
  return source.match(/(?<![-\w$])cp-[a-z0-9]+(?:-[a-z0-9]+)*(?![-\w$])/g) ?? [];
}

// The default neutral seed and twelve hues at the chroma every neutral may take.
const NEUTRALS: readonly (readonly [number, number])[] = [
  [260, 0.008],
  ...Array.from({ length: 12 }, (_, i) => [i * 30, ENVELOPE.neutral] as const),
];

// OKLab distances and contrasts the scales hold. A heatmap's steps need no
// 3:1 between them: WCAG 1.4.11 exempts gradients that represent a
// measurement (https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
const SCALE_FLOOR = {
  neighbours: 0.05,
  // steps 1, 3, 5, 7 and 9 are the five-class set
  twoApart: 0.1,
  step1: { full: 0.1, simulated: 0.04 },
  arms: APART,
  middle: APART,
  far: 4.5,
} as const;

const SCALE_CHECKS = [
  "gamut",
  "neighbours",
  "twoApart",
  "step1",
  "divNeighbours",
  "arms",
  "middle",
  "rising",
  "far",
] as const;
type ScaleCheck = (typeof SCALE_CHECKS)[number];

const SEEN: readonly (readonly [string, (c: readonly number[]) => readonly number[]])[] = [
  ["full", (c) => c],
  ...Object.entries(VISIONS),
];
const seenAs = (simulate: (c: readonly number[]) => readonly number[], c: Colour) =>
  oklab(simulate(linearSrgb(...c).map(clamp)));

// Every scale check over every accent hue by the degree, five accent chromas,
// both themes and every neutral's surfaces, computed once for the tests below.
// Only the diverging middle and the surfaces depend on the neutral, so each
// colour is simulated once and the neutral loop only measures distances.
let scaleReport: Record<ScaleCheck, string[]> | undefined;
function scaleFailures(): Record<ScaleCheck, string[]> {
  if (scaleReport !== undefined) {
    return scaleReport;
  }
  const r = Object.fromEntries(SCALE_CHECKS.map((k) => [k, [] as string[]])) as Record<
    ScaleCheck,
    string[]
  >;
  const fail = (k: ScaleCheck, d: number, floor: number, at: () => string) => {
    if (d < floor) {
      r[k].push(`${at()} is ${d.toFixed(3)}, needs ${String(floor)}`);
    }
  };
  const yOf = (c: Colour) => luminance(linearSrgb(...c));
  for (const theme of ["light", "dark"] as const) {
    const neutrals = NEUTRALS.map(([nh, nc]) => {
      const surfaces = surfaceColours(theme, nh, nc);
      const middle: Colour = [SCALE.diverging.middle[theme], nc, nh];
      if (!inGamut(linearSrgb(...middle))) {
        r.gamut.push(`${theme} neutral ${String(nh)} ${String(nc)} diverging 5 is outside sRGB`);
      }
      return {
        name: `neutral ${String(nh)} ${String(nc)}`,
        ys: surfaces.map(yOf),
        yMiddle: yOf(middle),
        seen: SEEN.map(([, simulate]) => ({
          surfaces: surfaces.map((c) => seenAs(simulate, c)),
          middle: seenAs(simulate, middle),
        })),
      };
    });
    for (let hue = 0; hue < 360; hue++) {
      for (const chroma of [0, 0.02, 0.09, 0.137, 0.2]) {
        const at = `${theme} hue ${String(hue)} chroma ${String(chroma)}`;
        const s = sequential(hue, chroma, theme);
        // the arms do not depend on the neutral; step 5 is each neutral's, below
        const d = diverging(hue, chroma, theme, 0, 0);
        const named: (readonly [Colour, string])[] = [
          ...s.map((c, i) => [c, `sequential ${String(i + 1)}`] as const),
          ...d.map((c, i) => [c, `diverging ${String(i + 1)}`] as const),
        ];
        for (const [c, name] of named) {
          if (name !== "diverging 5" && !inGamut(linearSrgb(...c))) {
            r.gamut.push(`${at} ${name} is outside sRGB`);
          }
        }
        const ps = SEEN.map(([, simulate]) => s.map((c) => seenAs(simulate, c)));
        const qs = SEEN.map(([, simulate]) => d.map((c) => seenAs(simulate, c)));
        SEEN.forEach(([vision], v) => {
          const p = ps[v] ?? [];
          p.slice(1).forEach((c, i) => {
            fail("neighbours", deltaE(p[i] as Colour, c), SCALE_FLOOR.neighbours, () => {
              return `${at} ${vision} steps ${String(i + 1)}, ${String(i + 2)}`;
            });
          });
          p.slice(2).forEach((c, i) => {
            fail("twoApart", deltaE(p[i] as Colour, c), SCALE_FLOOR.twoApart, () => {
              return `${at} ${vision} steps ${String(i + 1)}, ${String(i + 3)}`;
            });
          });
          const q = qs[v] ?? [];
          for (let k = 1; k <= 4; k++) {
            fail("arms", deltaE(q[4 - k] as Colour, q[4 + k] as Colour), SCALE_FLOOR.arms, () => {
              return `${at} ${vision} diverging ${String(5 - k)}, ${String(5 + k)}`;
            });
          }
          for (const i of [0, 1, 2, 5, 6, 7]) {
            fail(
              "divNeighbours",
              deltaE(q[i] as Colour, q[i + 1] as Colour),
              SCALE_FLOOR.neighbours,
              () => {
                return `${at} ${vision} diverging ${String(i + 1)}, ${String(i + 2)}`;
              },
            );
          }
        });
        const ysS = s.map(yOf);
        const ysD = d.map(yOf);
        for (const n of neutrals) {
          const on = () => `${at} on ${n.name}`;
          SEEN.forEach(([vision], v) => {
            const p = ps[v] ?? [];
            const q = qs[v] ?? [];
            const seen = n.seen[v];
            if (seen === undefined) {
              return;
            }
            const floor = vision === "full" ? SCALE_FLOOR.step1.full : SCALE_FLOOR.step1.simulated;
            for (const surface of seen.surfaces) {
              fail("step1", deltaE(p[0] as Colour, surface), floor, () => {
                return `${on()} ${vision} sequential 1`;
              });
              fail("middle", deltaE(seen.middle, surface), SCALE_FLOOR.middle, () => {
                return `${on()} ${vision} diverging 5`;
              });
            }
            for (const i of [3, 4]) {
              const [a, b] =
                i === 3 ? [q[3] as Colour, seen.middle] : [seen.middle, q[5] as Colour];
              fail("divNeighbours", deltaE(a, b), SCALE_FLOOR.neighbours, () => {
                return `${on()} ${vision} diverging ${String(i + 1)}, ${String(i + 2)}`;
              });
            }
          });
          const page = n.ys[0] ?? 0;
          const cs = ysS.map((y) => ratio(y, page));
          const cd = ysD.map((y, i) => ratio(i === 4 ? n.yMiddle : y, page));
          const outward = [
            ...cs.slice(1).map((c, i) => [c, cs[i] ?? 0, `sequential ${String(i + 2)}`] as const),
            ...[6, 7, 8, 9].map(
              (k) => [cd[k - 1] ?? 0, cd[k - 2] ?? 0, `diverging ${String(k)}`] as const,
            ),
            ...[4, 3, 2, 1].map(
              (k) => [cd[k - 1] ?? 0, cd[k] ?? 0, `diverging ${String(k)}`] as const,
            ),
          ];
          for (const [c, before, name] of outward) {
            if (c <= before) {
              r.rising.push(`${on()} ${name} has less contrast with the page than the step before`);
            }
          }
          for (const y of n.ys) {
            for (const [yc, name] of [
              [ysS[8], "sequential 9"],
              [ysD[0], "diverging 1"],
              [ysD[8], "diverging 9"],
            ] as const) {
              fail("far", ratio(yc ?? 0, y), SCALE_FLOOR.far, () => `${on()} ${name}`);
            }
          }
        }
      }
    }
  }
  scaleReport = r;
  return r;
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

  // An app may allow only the classes this stylesheet draws, so a module that
  // writes or looks up any other cp- class breaks that app. A hook a script
  // finds an element by is a data-cp-* attribute.
  it("draws every cp- class a module's source names", async () => {
    const drawn = new Set(
      (await readFile(CSS, "utf8")).match(/(?<=\.)cp-[a-z0-9]+(?:-[a-z0-9]+)*/g),
    );
    const missing: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "test-helpers") {
            await walk(path);
          }
        } else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) {
          for (const name of cpClasses(await readFile(path, "utf8"))) {
            if (!drawn.has(name)) {
              missing.push(`${path.slice(ROOT.length + 1)}: ${name}`);
            }
          }
        }
      }
    };
    await walk(join(ROOT, "src"));
    expect(
      missing,
      "draw the class in its element's CSS, or make the hook a data-cp-* attribute",
    ).toEqual([]);
  });

  it("counts a written or looked-up cp- class, and no id prefix, property or attribute", () => {
    expect(cpClasses('d.className = "cp-dialog cp-detail-dialog"; q(".cp-live-regions");')).toEqual(
      ["cp-dialog", "cp-detail-dialog", "cp-live-regions"],
    );
    expect(
      cpClasses('t.id = `cp-ask-${n}`; s.setProperty("--cp-at", v); a["data-cp-state"];'),
    ).toEqual([]);
  });

  it("documents the envelope the ladder gives", async () => {
    const table = envelopeTable();
    const block = /<!-- envelope:start -->[\s\S]*<!-- envelope:end -->/;
    if (process.env["SYSTEM_SYNC"] === "1") {
      await writeFile(DESIGN, (await readFile(DESIGN, "utf8")).replace(block, table));
    }
    expect(block.exec(await readFile(DESIGN, "utf8"))?.[0], "run npm run system:sync").toBe(table);
  });

  it("draws the default seeds' scales for docs/design-colour.md", async () => {
    const svg = await scalesSvg();
    if (process.env["SYSTEM_SYNC"] === "1") {
      await writeFile(SWATCHES, svg);
    }
    expect(await readFile(SWATCHES, "utf8"), "run npm run system:sync").toBe(svg);
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

  it("keeps every series slot inside sRGB and at 3:1 on every surface of its theme", () => {
    const report: string[] = [];
    for (const theme of ["light", "dark"] as const) {
      const surfaces = NEUTRALS.flatMap(([h, c]) => surfacesOf(theme, h, c));
      for (let hue = 0; hue < 360; hue++) {
        for (const chroma of [0, 0.02, 0.09, 0.137, 0.2]) {
          series(hue, chroma, theme).forEach((colour, i) => {
            const at = `${theme} hue ${String(hue)} chroma ${String(chroma)} slot ${String(i + 1)}`;
            const rgb = linearSrgb(...colour);
            if (!inGamut(rgb)) {
              report.push(`${at} is outside sRGB`);
            }
            const worst = Math.min(...surfaces.map((s) => ratio(luminance(rgb), s)));
            if (worst < 3) {
              report.push(`${at} is ${worst.toFixed(2)}:1 on a surface`);
            }
          });
        }
      }
    }
    expect(report).toEqual([]);
  });

  it("keeps neighbouring series slots apart under protanopia, deuteranopia and tritanopia", () => {
    const report: string[] = [];
    for (const theme of ["light", "dark"] as const) {
      for (let hue = 0; hue < 360; hue++) {
        for (const chroma of [0, 0.09, 0.137, 0.2]) {
          const rgb = series(hue, chroma, theme).map((c) => linearSrgb(...c).map(clamp));
          for (const [vision, simulate] of Object.entries(VISIONS)) {
            const seen = rgb.map((c) => oklab(simulate(c)));
            seen.forEach((c, i) => {
              const next = seen[i + 1];
              const d = next === undefined ? Infinity : deltaE(c, next);
              if (d < APART) {
                report.push(
                  `${theme} hue ${String(hue)} chroma ${String(chroma)} ${vision}: slots ${String(i + 1)} and ${String(i + 2)} are ${d.toFixed(3)} apart`,
                );
              }
            });
          }
        }
      }
    }
    expect(report).toEqual([]);
  });

  it("keeps any two series slots apart in full colour vision", () => {
    const report: string[] = [];
    for (const theme of ["light", "dark"] as const) {
      for (let hue = 0; hue < 360; hue++) {
        for (const chroma of [0, 0.09, 0.137, 0.2]) {
          const seen = series(hue, chroma, theme).map((c) => oklab(linearSrgb(...c).map(clamp)));
          seen.forEach((a, i) => {
            seen.slice(i + 1).forEach((b, j) => {
              if (deltaE(a, b) < APART) {
                report.push(
                  `${theme} hue ${String(hue)} chroma ${String(chroma)}: slots ${String(i + 1)} and ${String(i + j + 2)}`,
                );
              }
            });
          });
        }
      }
    }
    expect(report).toEqual([]);
  });

  it("finds the pair each simulated vision confuses and full colour vision tells apart", () => {
    const confused: Record<keyof typeof VISIONS, readonly [Colour, Colour]> = {
      protanopia: [
        [0.6, 0.1, 10],
        [0.5, 0.1, 190],
      ],
      deuteranopia: [
        [0.6, 0.15, 30],
        [0.6, 0.15, 142],
      ],
      tritanopia: [
        [0.5, 0.1, 80],
        [0.5, 0.1, 340],
      ],
    };
    for (const [vision, [a, b]] of Object.entries(confused)) {
      const [x, y] = [a, b].map((c) => linearSrgb(...c).map(clamp));
      const simulate = VISIONS[vision as keyof typeof VISIONS];
      expect(deltaE(oklab(x ?? []), oklab(y ?? [])), vision).toBeGreaterThan(2 * APART);
      expect(deltaE(oklab(simulate(x ?? [])), oklab(simulate(y ?? []))), vision).toBeLessThan(
        APART,
      );
    }
  });

  it("keeps an orange partner at the accent's lightness but vivid, and lifts a yellow one", () => {
    const [lead, orange, yellow] = harmony(255, 0.137, "light");
    // At 56% and the accent's own chroma, hue 45 reads brown.
    expect(orange?.[0]).toBe(HARMONY.l9.light);
    expect(lead?.[0]).toBeCloseTo(0.548 - 0.024 * Math.cos((66 * Math.PI) / 180) ** 4, 5);
    expect(orange?.[1]).toBeCloseTo(0.137 * HARMONY.chroma, 5);
    expect(yellow?.[2]).toBe(HARMONY.band.low);
    const { base, amp, peak, power } = HARMONY.floor;
    expect(yellow?.[0]).toBeCloseTo(base + amp * cos(HARMONY.band.low - peak) ** power, 5);
    expect(yellow?.[0]).toBeGreaterThan(0.8);
  });

  const scaleTests: readonly (readonly [ScaleCheck, string])[] = [
    ["gamut", "keeps every sequential and diverging step inside sRGB"],
    ["neighbours", "keeps neighbouring sequential steps 0.05 apart in every vision"],
    ["twoApart", "keeps sequential steps two apart 0.10 apart in every vision"],
    ["step1", "keeps sequential step 1 off every surface, 0.10 in full colour and 0.04 simulated"],
    ["divNeighbours", "keeps neighbouring diverging steps 0.05 apart in every vision"],
    ["arms", "keeps the two diverging arms apart at each distance from the middle in every vision"],
    ["middle", "keeps the diverging middle off every surface in every vision"],
    ["rising", "raises contrast with the page at every step away from it"],
    ["far", "holds each scale's far steps at 4.5:1 on every surface"],
  ];
  for (const [check, name] of scaleTests) {
    it(name, () => {
      expect(scaleFailures()[check].slice(0, 20)).toEqual([]);
    });
  }

  it("turns the default blue from a sky blue to a deep blue, and a red from amber to crimson", () => {
    expect([1, 5, 9].map((r) => rankHue(255, r))).toEqual([225, 245, 265]);
    expect([1, 9].map((r) => rankHue(27, r))).toEqual([57, 357]);
    // the dark theme's step 1 is its darkest, so it takes the darkest rank's hue
    expect(sequential(255, 0.137, "dark")[0]?.[2]).toBe(265);
    expect(sequential(255, 0.137, "light")[0]?.[2]).toBe(225);
  });

  it("faces each accent with its piece's opposite hue on both sides of every edge", () => {
    const edges = [119, 120, 169, 170, 307, 308, 354, 355].map(oppositeHue);
    expect(edges).toEqual([245, 355, 306, 55, 55, 167, 121, 245]);
  });

  it("finds the cyan and pink a deuteranope confuses, which a fixed 180-degree turn would pair", () => {
    const arms = (opposite: number) => {
      const q = diverging(176, 0.137, "light", 260, 0.008, opposite).map((c) =>
        seenAs(VISIONS.deuteranopia, c),
      );
      return Math.min(...[1, 2, 3, 4].map((k) => deltaE(q[4 - k] as Colour, q[4 + k] as Colour)));
    };
    expect(arms(356)).toBeLessThan(SCALE_FLOOR.arms);
    expect(arms(oppositeHue(176))).toBeGreaterThanOrEqual(SCALE_FLOOR.arms);
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
