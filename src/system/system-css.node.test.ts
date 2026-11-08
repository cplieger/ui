import { readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

import * as prettier from "prettier";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const CSS = join(ROOT, "css", "system.css");
const DESIGN = join(ROOT, "docs", "design.md");
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
type Mode = "normal" | "more";
type Shape = "neutral" | "accent";

// Lightness per step. Steps: 1 page, 2 raised, 3 control, 4 hover, 5 pressed
// or selected, 6 hairline, 7 border, 8 strong border and focus, 9 solid,
// 10 solid hover (derived from 9, so its value here is unused), 11 secondary
// text, 12 primary text. "more" serves prefers-contrast: more.
const LADDER: Record<"normal" | "more", Record<"light" | "dark", readonly number[]>> = {
  normal: {
    light: [0.993, 0.975, 0.955, 0.932, 0.908, 0.88, 0.82, 0.62, 0.56, 0.515, 0.475, 0.25],
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

// The chroma every hue may take, in docs/design.md's words.
const ENVELOPE = { accent: 0.09, neutral: 0.015 } as const;

function factor(shape: Shape, theme: Theme, mode: Mode, i: number): number {
  const k = CHROMA[shape][theme][i] ?? 0;
  return Number((mode === "more" && i >= 10 ? k * MORE_TEXT_CHROMA : k).toFixed(4));
}

// A percentage as prettier prints it: one decimal at most, no trailing zero.
const pct = (v: number) => `${String(Number((v * 100).toFixed(1)))}%`;

function stepExpr(shape: Shape, i: number, theme: Theme, mode: Mode, h: string, c: string) {
  const l = pct(LADDER[mode][theme][i] ?? 0);
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

function colourBlock(): string {
  const rules = (mode: Mode): string =>
    `:root { ${mode === "normal" ? `--cp-solid-hover-mix: ${String(SOLID_HOVER_MIX * 100)}%;` : ""} ${shell(mode)} ${ROOT_FAMILIES.flatMap((f) => ladder(f, mode)).join(" ")} }
     :root, [data-tone] { ${ladder(TONE, mode).join(" ")} }`;
  return `${START}\n/* Written by npm run system:sync from src/system/system-css.node.test.ts. */\n${rules("normal")}\n\n@media (prefers-contrast: more) { ${rules("more")} }\n${END}`;
}

function markers(current: string): [number, number] {
  const a = current.indexOf(START);
  const b = current.indexOf(END);
  if (a < 0 || b < a) {
    throw new Error(`css/system.css: the ${START} and ${END} markers are missing`);
  }
  return [a, b + END.length];
}

// The file with the generated block spliced in and formatted, for the sync.
async function synced(current: string): Promise<string> {
  const [a, b] = markers(current);
  const spliced = current.slice(0, a) + colourBlock() + current.slice(b);
  const options = (await prettier.resolveConfig(CSS)) ?? {};
  return prettier.format(spliced, { ...options, filepath: CSS });
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

type Colour = [number, number, number];

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
    out.push([lad[mode][theme][i] ?? 0, chroma * factor(shape, theme, mode, i), hue]);
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

// docs/design.md's envelope table: each row is the lowest limit of every
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

describe("css/system.css", () => {
  it("carries the colour block the ladder writes", async () => {
    const current = await readFile(CSS, "utf8");
    if (process.env["SYSTEM_SYNC"] === "1") {
      await writeFile(CSS, await synced(current));
    }
    const now = await readFile(CSS, "utf8");
    const [a, b] = markers(now);
    expect(squash(now.slice(a, b)), "run npm run system:sync").toBe(squash(colourBlock()));
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
