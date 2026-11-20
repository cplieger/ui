import { afterEach, describe, expect, it, vi } from "vitest";

import { date, relative } from "../../core/format/format.js";

import { enhanceRelativeTime } from "./relative-time.js";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const NB = "\u00A0";
const pageLang = document.documentElement.lang;

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.documentElement.lang = pageLang;
  vi.useRealTimers();
  delete (document as { visibilityState?: unknown }).visibilityState;
  document.body.replaceChildren();
});

function time(at: number): HTMLTimeElement {
  const t = document.createElement("time");
  t.dateTime = new Date(at).toISOString();
  t.textContent = "12:00";
  document.body.append(t);
  return t;
}

/** The words a time shows, without its hidden exact time. */
function shown(t: HTMLTimeElement): string {
  return t.firstChild?.textContent ?? "";
}

describe("the module", () => {
  it("exports the element alone, its words being format's relative", async () => {
    const mod = await import("./relative-time.js");
    expect(Object.keys(mod).toSorted()).toEqual(["enhanceRelativeTime"]);
  });
});

describe("enhanceRelativeTime", () => {
  it("writes the words, the exact time for a screen reader and the tip for the hover", () => {
    const at = Date.now() - 4 * MIN;
    const t = time(at);
    enhanceRelativeTime(t, { locale: "en", style: "long", signal: life.signal });
    const exact = date(at, "datetime", "en");
    expect(t.childNodes).toHaveLength(2);
    expect(shown(t)).toBe(`4${NB}minutes ago`);
    const hidden = t.lastElementChild;
    expect(hidden?.className).toBe("cp-visually-hidden");
    expect(hidden?.textContent).toBe(` ${exact}`);
    expect(t.dataset["cpTip"]).toBe(exact);
    expect(t.textContent).toBe(`4${NB}minutes ago ${exact}`);
    expect(exact).not.toMatch(/ /u);
  });

  it("writes the narrow form by default", () => {
    const t = time(Date.now() - 3 * HOUR);
    enhanceRelativeTime(t, { locale: "en", signal: life.signal });
    expect(shown(t)).toBe(
      new Intl.RelativeTimeFormat("en", { style: "narrow", numeric: "always" }).format(-3, "hour"),
    );
  });

  it("writes in the page's language when given no locale", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    document.documentElement.lang = "fr";
    const at = NOW - 4 * MIN;
    const t = time(at);
    enhanceRelativeTime(t, { signal: life.signal });
    expect(shown(t)).toBe(relative(at, { now: NOW }));
    expect(shown(t)).toBe(relative(at, { now: NOW, locale: "fr" }));
    expect(t.dataset["cpTip"]).toBe(date(at, "datetime", "fr"));
    vi.advanceTimersByTime(2 * MIN);
    expect(shown(t)).toBe(relative(at, { locale: "fr" }));
  });

  it("writes in the lang of its nearest ancestor over the page's", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    document.documentElement.lang = "fr";
    const at = NOW - 4 * MIN;
    const wrap = document.createElement("div");
    wrap.lang = "de";
    const t = time(at);
    wrap.append(t);
    document.body.append(wrap);
    enhanceRelativeTime(t, { style: "long", signal: life.signal });
    expect(shown(t)).toBe(`vor 4${NB}Minuten`);
    expect(t.dataset["cpTip"]).toBe(date(at, "datetime", "de"));
  });

  it("writes in the page's language when enhanced before it is put in the page", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    document.documentElement.lang = "fr";
    const at = NOW - 4 * MIN;
    const t = document.createElement("time");
    t.dateTime = new Date(at).toISOString();
    enhanceRelativeTime(t, { style: "long", signal: life.signal });
    document.body.append(t);
    expect(shown(t)).toBe(`il y a 4${NB}minutes`);
    expect(t.dataset["cpTip"]).toBe(date(at, "datetime", "fr"));
  });

  it("writes in the browser's language for an empty or invalid lang around it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    document.documentElement.lang = "fr";
    const at = NOW - 4 * MIN;
    const browser = new Intl.DateTimeFormat().resolvedOptions().locale;
    const section = document.createElement("section");
    section.lang = "en_US";
    document.body.append(section);
    const inSection = time(at);
    section.append(inSection);
    const empty = time(at);
    empty.lang = "";
    for (const t of [inSection, empty]) {
      enhanceRelativeTime(t, { style: "long", signal: life.signal });
      expect(shown(t)).toBe(relative(at, { now: NOW, style: "long", locale: browser }));
      expect(t.dataset["cpTip"]).toBe(date(at, "datetime", browser));
    }
  });

  it("turns to the next minute when the rounded minutes change", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = time(NOW - 4 * MIN - 29_000);
    enhanceRelativeTime(t, { locale: "en", style: "long", signal: life.signal });
    expect(shown(t)).toBe(`4${NB}minutes ago`);
    // 4.5 minutes rounds to 4 until the clock is past it.
    vi.advanceTimersByTime(1_500);
    expect(shown(t)).toBe(`4${NB}minutes ago`);
    vi.advanceTimersByTime(1);
    expect(shown(t)).toBe(`5${NB}minutes ago`);
    vi.advanceTimersByTime(MIN);
    expect(shown(t)).toBe(`6${NB}minutes ago`);
  });

  it("waits until a three-hour-old time's words change", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = time(NOW - 3 * HOUR);
    const set = vi.spyOn(globalThis, "setTimeout");
    enhanceRelativeTime(t, { locale: "en", style: "long", signal: life.signal });
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0]?.[1]).toBeGreaterThanOrEqual(30 * MIN);
    vi.advanceTimersByTime(30 * MIN + 500);
    expect(shown(t)).toBe(`3${NB}hours ago`);
    vi.advanceTimersByTime(1);
    expect(shown(t)).toBe(`4${NB}hours ago`);
  });

  it("turns to the next unit where its words start", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = time(NOW - 58 * MIN);
    enhanceRelativeTime(t, { locale: "en", style: "long", signal: life.signal });
    expect(shown(t)).toBe(`58${NB}minutes ago`);
    vi.advanceTimersByTime(MIN);
    expect(shown(t)).toBe(`59${NB}minutes ago`);
    vi.advanceTimersByTime(30_000);
    expect(shown(t)).toBe(`1${NB}hour ago`);
    const ahead = time(Date.now() + 61 * MIN);
    enhanceRelativeTime(ahead, { locale: "en", style: "long", signal: life.signal });
    expect(shown(ahead)).toBe(`in 1${NB}hour`);
    vi.advanceTimersByTime(90_000);
    expect(shown(ahead)).toBe(`in 1${NB}hour`);
    vi.advanceTimersByTime(1_000);
    expect(shown(ahead)).toBe(`in 59${NB}minutes`);
  });

  it("counts a time ahead down to now, then up as it passes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = time(NOW + 25 * MIN);
    enhanceRelativeTime(t, { locale: "en", style: "long", signal: life.signal });
    expect(shown(t)).toBe(`in 25${NB}minutes`);
    vi.advanceTimersByTime(24 * MIN + 30_000);
    expect(shown(t)).toBe("now");
    vi.advanceTimersByTime(61 * MIN);
    expect(shown(t)).toBe(`1${NB}hour ago`);
  });

  it("stops with its signal, leaving its words and no timer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = time(NOW - 4 * MIN);
    const stop = new AbortController();
    enhanceRelativeTime(t, { locale: "en", style: "long", signal: stop.signal });
    expect(vi.getTimerCount()).toBe(1);
    stop.abort();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10 * MIN);
    expect(shown(t)).toBe(`4${NB}minutes ago`);
  });

  it("replaces an earlier call on the same time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = time(NOW - 4 * MIN);
    const first = new AbortController();
    const second = new AbortController();
    enhanceRelativeTime(t, { locale: "en", style: "long", signal: first.signal });
    enhanceRelativeTime(t, { locale: "en", style: "narrow", signal: second.signal });
    expect(t.childNodes).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(1);
    first.abort();
    vi.advanceTimersByTime(2 * MIN);
    expect(shown(t)).toBe(
      new Intl.RelativeTimeFormat("en", { style: "narrow", numeric: "always" }).format(
        -6,
        "minute",
      ),
    );
    second.abort();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shares one timer across times, set to the soonest change", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const old = time(NOW - 3 * HOUR);
    const fresh = time(NOW - 10_000);
    enhanceRelativeTime(old, { locale: "en", style: "long", signal: life.signal });
    enhanceRelativeTime(fresh, { locale: "en", style: "long", signal: life.signal });
    expect(vi.getTimerCount()).toBe(1);
    expect(shown(fresh)).toBe("now");
    vi.advanceTimersByTime(50_501);
    expect([shown(fresh), shown(old)]).toEqual([`1${NB}minute ago`, `3${NB}hours ago`]);
  });

  it("keeps a time out of the page current, so it reads the present when put back", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = time(NOW - 4 * MIN);
    enhanceRelativeTime(t, { locale: "en", style: "long", signal: life.signal });
    t.remove();
    vi.advanceTimersByTime(3 * MIN);
    document.body.append(t);
    expect(shown(t)).toBe(`7${NB}minutes ago`);
  });

  it("brings every time up to date when the page shows again", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = time(NOW - 4 * MIN);
    enhanceRelativeTime(t, { locale: "en", style: "long", signal: life.signal });
    // A hidden page's timers run late: the clock moves with none firing.
    vi.setSystemTime(NOW + 20 * MIN);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(shown(t)).toBe(`4${NB}minutes ago`);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(shown(t)).toBe(`24${NB}minutes ago`);
  });

  it("keeps its own rewrites out of a live region it sits in", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const region = document.createElement("div");
    region.setAttribute("role", "status");
    document.body.append(region);
    const t = time(NOW - 4 * MIN);
    region.append("Last seen ", t);
    enhanceRelativeTime(t, { locale: "en", style: "long", signal: life.signal });
    expect(t.getAttribute("aria-live")).toBe("off");
    vi.advanceTimersByTime(MIN);
    expect(shown(t)).toBe(`5${NB}minutes ago`);
    expect(t.getAttribute("aria-live")).toBe("off");
  });

  it("throws when the datetime does not parse, and does nothing under an aborted signal", () => {
    const t = time(Date.now());
    t.dateTime = "soon";
    expect(() => {
      enhanceRelativeTime(t);
    }).toThrow(TypeError);
    const u = time(Date.now() - 4 * MIN);
    enhanceRelativeTime(u, { signal: AbortSignal.abort() });
    expect(u.textContent).toBe("12:00");
    expect(u.hasAttribute("data-cp-tip")).toBe(false);
  });
});
