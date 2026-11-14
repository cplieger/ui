import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writer, type Format } from "../scale/format.js";
import { forgetMeasures } from "../scale/measure.js";

import { renderChart, type ChartSpec } from "./chart.js";

// A minus, maybe a currency sign, before a zero whose separator has only zeros
// after it: "-0", "−0.00", "-€0.00", "-0%", never "-0.5" or the "-05" of a date.
const SIGNED_ZERO = /(?<![\p{Nd}\p{L}])[-\u2212]\p{Sc}?\s?0(?:[.,]0+)?(?!\p{Nd}|[.,]\p{Nd})/u;

const signedZeros = (texts: readonly string[]): string[] =>
  texts.filter((t) => SIGNED_ZERO.test(t));

// Swedish writes its minus as U+2212, German its decimal separator as a comma.
const locale = fc.constantFrom("en", "sv", "de");

// Values at and around 0 of both signs, -0 among them, from 1e-12 to 1e3.
const near = fc.oneof(
  fc.constant(-0),
  fc
    .tuple(fc.integer({ min: -999, max: 999 }), fc.integer({ min: -12, max: 0 }))
    .map(([n, e]) => Number(`${String(n)}e${String(e)}`)),
  fc.double({ min: -1e-3, max: 1e-3, noNaN: true }),
);

// Every number format an app can name: the presets and Intl options with
// each sign display, rounding and style.
const format: fc.Arbitrary<Exclude<Format, "duration" | ((v: number) => string)> | undefined> =
  fc.oneof(
    fc.constantFrom(undefined, "number", "integer", "percent"),
    fc
      .tuple(
        fc.constantFrom<Intl.NumberFormatOptions>(
          {},
          { style: "percent" },
          { style: "unit", unit: "celsius" },
          { style: "currency", currency: "EUR" },
          { notation: "compact" },
          { notation: "scientific" },
        ),
        fc.record(
          {
            maximumFractionDigits: fc.integer({ min: 0, max: 4 }),
            signDisplay: fc.constantFrom("auto", "always", "exceptZero", "negative", "never"),
          },
          { requiredKeys: [] },
        ),
      )
      .map(([style, rest]): Intl.NumberFormatOptions => ({ ...style, ...rest })),
  );

describe("the writer", () => {
  it("writes no signed zero in any number format, signed or not, at any digits", () => {
    fc.assert(
      fc.property(
        format,
        locale,
        fc.boolean(),
        fc.option(fc.tuple(fc.nat({ max: 104 }), fc.nat({ max: 3 })), { nil: undefined }),
        near,
        (f, lang, signed, digits, v) => {
          const how =
            digits === undefined ? {} : { digits: [digits[0], digits[0] + digits[1]] as const };
          const text = writer(f, lang, { ...how, signed })(v);
          expect(signedZeros([text]), text).toEqual([]);
        },
      ),
    );
  });
});

const hosts: HTMLElement[] = [];
const lives: AbortController[] = [];
let sheet: HTMLLinkElement;

beforeEach(async () => {
  sheet = document.createElement("link");
  sheet.rel = "stylesheet";
  sheet.href = new URL("../../../css/system.css", import.meta.url).href;
  const loaded = new Promise((resolve, reject) => {
    sheet.addEventListener("load", resolve, { once: true });
    sheet.addEventListener("error", reject, { once: true });
  });
  document.head.append(sheet);
  await loaded;
  document.documentElement.classList.add("cp");
});

afterEach(() => {
  for (const life of lives.splice(0)) {
    life.abort();
  }
  for (const h of hosts.splice(0)) {
    h.remove();
  }
  sheet.remove();
  document.documentElement.classList.remove("cp");
  forgetMeasures();
});

// Every text the figure holds, its plot's name and the summary.
function texts(figure: HTMLElement, summary: string): string[] {
  const out = [summary];
  const walk = document.createTreeWalker(figure, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n !== null; n = walk.nextNode()) {
    out.push(n.textContent ?? "");
  }
  for (const el of figure.querySelectorAll("[aria-label]")) {
    out.push(el.getAttribute("aria-label") ?? "");
  }
  return out;
}

// Each text `spec` writes in `lang`: drawn, read key by key, and as a table.
// A spec the chart refuses writes none.
function written(spec: ChartSpec, lang: string, keys: readonly string[]): string[] | undefined {
  const box = document.createElement("div");
  box.style.inlineSize = "600px";
  document.body.append(box);
  hosts.push(box);
  box.innerHTML = `<figure class="cp-chart" lang="${lang}"><figcaption>Values</figcaption></figure>`;
  const figure = box.querySelector("figure") as HTMLElement;
  const life = new AbortController();
  lives.push(life);
  let chart;
  try {
    chart = renderChart(figure, spec, { signal: life.signal, timeZone: "UTC" });
  } catch (e) {
    if (e instanceof RangeError || e instanceof TypeError) {
      return undefined;
    }
    throw e;
  }
  const out = texts(figure, chart.summary);
  const plot = figure.querySelector<HTMLElement>(':scope > [data-part="plot"]');
  for (const key of keys) {
    plot?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    out.push(...texts(figure, chart.summary));
  }
  chart.showTable(true);
  out.push(...texts(figure, chart.summary));
  life.abort();
  box.remove();
  return out;
}

function check(spec: ChartSpec, lang: string, keys: readonly string[]): void {
  const out = written(spec, lang, keys);
  fc.pre(out !== undefined);
  expect(signedZeros(out)).toEqual([]);
}

const span = fc
  .tuple(near, near)
  .filter(([a, b]) => a !== b)
  .map(([a, b]): readonly [number, number] => [Math.min(a, b), Math.max(a, b)]);

// A chart's runs each draw a whole figure, so fewer than the shared thousand fit its time limit.
const RUNS = { numRuns: 40 };

describe("a chart's numbers", () => {
  it("are never a signed zero on a cell chart's colour key, readings, table or summary", () => {
    const colour = fc.oneof(
      fc.record(
        { steps: fc.integer({ min: 2, max: 9 }), domain: span },
        { requiredKeys: ["steps"] },
      ),
      fc.record(
        {
          type: fc.constant("diverging" as const),
          steps: fc.integer({ min: 2, max: 9 }),
          pivot: near,
          domain: span,
        },
        { requiredKeys: ["type", "steps"] },
      ),
      fc.record({
        thresholds: fc
          .uniqueArray(near, { minLength: 1, maxLength: 8, comparator: (a, b) => a === b })
          .map((t) => [...t].sort((a, b) => a - b)),
      }),
    );
    fc.assert(
      fc.property(
        colour,
        format,
        locale,
        fc.array(fc.option(near, { nil: null }), { minLength: 6, maxLength: 6 }),
        (c, f, lang, v) => {
          const values = [v.slice(0, 3), v.slice(3)];
          check(
            {
              colour: f === undefined ? c : { ...c, format: f },
              marks: [{ mark: "cell", x: ["a", "b", "c"], y: ["r", "s"], values }],
            },
            lang,
            ["ArrowRight", "ArrowRight", "ArrowDown", "ArrowLeft"],
          );
        },
      ),
      RUNS,
    );
  });

  it("are never a signed zero on a line's axes, rule, readings, table or summary", () => {
    fc.assert(
      fc.property(
        format,
        format,
        locale,
        fc.option(span, { nil: undefined }),
        fc.array(fc.option(near, { nil: null }), { minLength: 4, maxLength: 4 }),
        near,
        fc.integer({ min: -6, max: 0 }),
        (fx, fy, lang, domain, y, rule, e) => {
          const x = [-2, -1, 0, 1].map((k) => Number(`${String(k)}e${String(e)}`));
          check(
            {
              x: { type: "linear", ...(fx === undefined ? {} : { format: fx }) },
              y: {
                ...(fy === undefined ? {} : { format: fy }),
                ...(domain === undefined ? {} : { domain }),
              },
              marks: [
                { mark: "line", x, series: [{ name: "A", y }] },
                { mark: "rule", y: rule, label: "Target" },
                { mark: "text", x: x[1] ?? 0, y: rule, text: "Peak" },
              ],
            },
            lang,
            ["ArrowRight", "ArrowRight", "ArrowLeft", "ArrowLeft", "ArrowLeft"],
          );
        },
      ),
      RUNS,
    );
  });

  it("are never a signed zero in a slope's signed changes", () => {
    fc.assert(
      fc.property(
        format,
        locale,
        fc.array(near, { minLength: 4, maxLength: 4 }),
        (f, lang, [a = 0, b = 0, c = 0, d = 0]) => {
          check(
            {
              ...(f === undefined ? {} : { y: { format: f } }),
              marks: [
                {
                  mark: "slope",
                  x: ["Before", "After"],
                  series: [
                    { name: "A", y: [a, b] },
                    { name: "B", y: [c, d] },
                  ],
                },
              ],
            },
            lang,
            ["ArrowDown", "ArrowDown", "ArrowUp"],
          );
        },
      ),
      RUNS,
    );
  });
});
