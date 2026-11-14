import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installAnnouncer } from "../../feedback/announce/announce.js";
import { forgetMeasures } from "../scale/measure.js";

import { weekStartOf } from "./calendar.js";
import { renderChart, type ChartSpec } from "./chart.js";
import { chartModel, type CalendarModel } from "./model.js";

const root = document.documentElement;
let sheet: HTMLLinkElement;
const hosts: HTMLElement[] = [];
const lives: AbortController[] = [];

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
  root.classList.add("cp");
  const life = new AbortController();
  lives.push(life);
  installAnnouncer({ signal: life.signal });
});

afterEach(() => {
  for (const life of lives.splice(0)) {
    life.abort();
  }
  for (const h of hosts.splice(0)) {
    h.remove();
  }
  sheet.remove();
  root.classList.remove("cp");
  forgetMeasures();
});

// 1 January 2026, a Thursday, and the year from it.
const JAN1 = Date.UTC(2026, 0, 1);
const year = (weekStart?: number): ChartSpec => ({
  colour: { unit: { one: "post", other: "posts" } },
  marks: [
    {
      mark: "cell",
      days: { start: JAN1, values: Array.from({ length: 365 }, (_, i) => (i * 7) % 23) },
      ...(weekStart === undefined ? {} : { weekStart }),
    },
  ],
});

describe("the week a calendar starts on", () => {
  it("is the locale's first day in this engine: Sunday in en-US, Monday in en-GB and fr", () => {
    expect(weekStartOf("en-US")).toBe(7);
    expect(weekStartOf("en-GB")).toBe(1);
    expect(weekStartOf("fr")).toBe(1);
    const weekStart = (locale: string) =>
      (chartModel(year(), locale, "UTC").marks[0] as CalendarModel).weekStart;
    expect(weekStart("en-US")).toBe(7);
    expect(weekStart("en-GB")).toBe(1);
  });

  it("is Monday in an engine whose Intl.Locale gives no week info", () => {
    const proto = Intl.Locale.prototype as { getWeekInfo?: unknown };
    const own = Object.getOwnPropertyDescriptor(proto, "getWeekInfo");
    delete proto.getWeekInfo;
    try {
      expect(weekStartOf("en-US")).toBe(1);
    } finally {
      if (own !== undefined) {
        Object.defineProperty(proto, "getWeekInfo", own);
      }
    }
  });

  it("is the spec's weekStart over the locale's", () => {
    expect((chartModel(year(1), "en-US", "UTC").marks[0] as CalendarModel).weekStart).toBe(1);
  });
});

function build(spec: ChartSpec, width: number, lang = "en-GB") {
  const box = document.createElement("div");
  box.style.inlineSize = `${String(width)}px`;
  document.body.append(box);
  hosts.push(box);
  box.innerHTML = `<figure class="cp-chart" lang="${lang}"><figcaption>Posts per day</figcaption></figure>`;
  const figure = box.querySelector("figure") as HTMLElement;
  const life = new AbortController();
  lives.push(life);
  renderChart(figure, spec, { signal: life.signal, timeZone: "UTC" });
  const plot = figure.querySelector<HTMLElement>(':scope > [data-part="plot"]') as HTMLElement;
  return { figure, plot, svg: plot.querySelector("svg") as SVGSVGElement };
}

const full = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeZone: "UTC" });
const names = (svg: SVGSVGElement, part: string) =>
  [...svg.querySelectorAll(`[data-part="${part}"] > text`)].map((t) => t.textContent);

describe("a calendar heatmap drawn", () => {
  it("names the weekdays from the locale's first day and the months above their first days", () => {
    const { svg } = build(year(), 900, "en-US");
    expect(names(svg, "y")).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    expect(names(svg, "x")).toHaveLength(12);
    expect(svg.querySelectorAll('[data-part="cell"] path[data-step]').length).toBe(5);
  });

  it("folds into five blocks of weeks on a phone, growing down", () => {
    const wide = build(year(), 900).svg;
    const phone = build(year(), 320).svg;
    expect(names(phone, "y")).toHaveLength(35);
    expect(phone.getBoundingClientRect().height).toBeGreaterThan(
      4 * wide.getBoundingClientRect().height,
    );
  });

  it("selects the newest day on focus, rings it and turns its weekday name ink", async () => {
    const { plot, svg } = build(year(), 900);
    plot.focus();
    await expect
      .poll(() => document.querySelector('[aria-live="polite"]')?.textContent ?? "")
      .toBe(`${full.format(Date.UTC(2026, 11, 31))}: 18\u00A0posts.`);
    expect(svg.querySelector('[data-part="ring"]')).not.toBeNull();
    const selected = [...svg.querySelectorAll("text[data-selected]")].map((t) => t.textContent);
    expect(selected).toEqual(["Thu"]);
  });
});
