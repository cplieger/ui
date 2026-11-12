import { afterEach, describe, expect, it, vi } from "vitest";

import { enhanceRelativeTime, formatRelative } from "./relative-time.js";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
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

describe("formatRelative", () => {
  it("picks the largest unit that fits and rounds to it", () => {
    const at = (ago: number): string => formatRelative(NOW - ago, { now: NOW, locale: "en" });
    expect([
      at(4 * MIN + 29_000),
      at(100 * MIN),
      at(DAY),
      at(3 * DAY),
      at(15 * DAY),
      at(60 * DAY),
      at(800 * DAY),
    ]).toEqual([
      "4 minutes ago",
      "2 hours ago",
      "yesterday",
      "3 days ago",
      "2 weeks ago",
      "2 months ago",
      "2 years ago",
    ]);
  });

  it("moves to the larger unit before the smaller one's count would reach it", () => {
    const at = (s: number): string => formatRelative(NOW - s * 1000, { now: NOW, locale: "en" });
    const ahead = (s: number): string => formatRelative(NOW + s * 1000, { now: NOW, locale: "en" });
    expect([at(3569), at(3571), at(84_599), at(86_399), at(561_599), at(561_600)]).toEqual([
      "59 minutes ago",
      "1 hour ago",
      "23 hours ago",
      "yesterday",
      "6 days ago",
      "last week",
    ]);
    expect([at(24 * 86_400), at(25 * 86_400), at(344 * 86_400), at(346 * 86_400)]).toEqual([
      "3 weeks ago",
      "last month",
      "11 months ago",
      "last year",
    ]);
    expect([ahead(3569), ahead(3571)]).toEqual(["in 59 minutes", "in 1 hour"]);
  });

  it("speaks the locale's words", () => {
    const fr = (ms: number): string => formatRelative(NOW + ms, { now: NOW, locale: "fr" });
    expect([fr(-4 * MIN), fr(25 * MIN), fr(-DAY), fr(-10_000)]).toEqual([
      "il y a 4 minutes",
      "dans 25 minutes",
      "hier",
      "maintenant",
    ]);
  });

  it("says a time ahead and one under a minute either way", () => {
    const en = (ms: number): string => formatRelative(NOW + ms, { now: NOW, locale: "en" });
    expect([en(25 * MIN), en(DAY), en(-59_000), en(59_000)]).toEqual([
      "in 25 minutes",
      "tomorrow",
      "now",
      "now",
    ]);
  });

  it("gives a number in the compact forms where the long one names the day", () => {
    const always = (style: "short" | "narrow"): string =>
      new Intl.RelativeTimeFormat("en", { style, numeric: "always" }).format(-1, "day");
    const day = (style: "long" | "short" | "narrow"): string =>
      formatRelative(NOW - DAY, { now: NOW, locale: "en", style });
    expect([day("long"), day("short"), day("narrow")]).toEqual([
      "yesterday",
      always("short"),
      always("narrow"),
    ]);
    expect(always("narrow")).toMatch(/1/);
  });

  it("counts from the present by default, and refuses an invalid date", () => {
    expect(formatRelative(new Date(Date.now() - 3 * HOUR), { locale: "en" })).toBe("3 hours ago");
    expect(() => formatRelative(new Date("soon"))).toThrow(TypeError);
    expect(() => formatRelative(Number.NaN)).toThrow(TypeError);
  });
});

describe("enhanceRelativeTime", () => {
  it("writes the words, the exact time for a screen reader and the tip for the hover", () => {
    const at = Date.now() - 4 * MIN;
    const t = time(at);
    enhanceRelativeTime(t, { locale: "en", signal: life.signal });
    const exact = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
      at,
    );
    expect(t.childNodes).toHaveLength(2);
    expect(shown(t)).toBe("4 minutes ago");
    const hidden = t.lastElementChild;
    expect(hidden?.className).toBe("cp-visually-hidden");
    expect(hidden?.textContent).toBe(` ${exact}`);
    expect(t.dataset["cpTip"]).toBe(exact);
    expect(t.textContent).toBe(`4 minutes ago ${exact}`);
  });

  it("turns to the next minute when the rounded minutes change", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = time(NOW - 4 * MIN - 29_000);
    enhanceRelativeTime(t, { locale: "en", signal: life.signal });
    expect(shown(t)).toBe("4 minutes ago");
    // 4.5 minutes rounds to 4 until the clock is past it.
    vi.advanceTimersByTime(1_500);
    expect(shown(t)).toBe("4 minutes ago");
    vi.advanceTimersByTime(1);
    expect(shown(t)).toBe("5 minutes ago");
    vi.advanceTimersByTime(MIN);
    expect(shown(t)).toBe("6 minutes ago");
  });

  it("waits until a three-hour-old time's words change", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = time(NOW - 3 * HOUR);
    const set = vi.spyOn(globalThis, "setTimeout");
    enhanceRelativeTime(t, { locale: "en", signal: life.signal });
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0]?.[1]).toBeGreaterThanOrEqual(30 * MIN);
    vi.advanceTimersByTime(30 * MIN + 500);
    expect(shown(t)).toBe("3 hours ago");
    vi.advanceTimersByTime(1);
    expect(shown(t)).toBe("4 hours ago");
  });

  it("turns to the next unit where its words start", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = time(NOW - 58 * MIN);
    enhanceRelativeTime(t, { locale: "en", signal: life.signal });
    expect(shown(t)).toBe("58 minutes ago");
    vi.advanceTimersByTime(MIN);
    expect(shown(t)).toBe("59 minutes ago");
    vi.advanceTimersByTime(30_000);
    expect(shown(t)).toBe("1 hour ago");
    const ahead = time(Date.now() + 61 * MIN);
    enhanceRelativeTime(ahead, { locale: "en", signal: life.signal });
    expect(shown(ahead)).toBe("in 1 hour");
    vi.advanceTimersByTime(90_000);
    expect(shown(ahead)).toBe("in 1 hour");
    vi.advanceTimersByTime(1_000);
    expect(shown(ahead)).toBe("in 59 minutes");
  });

  it("counts a time ahead down to now, then up as it passes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = time(NOW + 25 * MIN);
    enhanceRelativeTime(t, { locale: "en", signal: life.signal });
    expect(shown(t)).toBe("in 25 minutes");
    vi.advanceTimersByTime(24 * MIN + 30_000);
    expect(shown(t)).toBe("now");
    vi.advanceTimersByTime(61 * MIN);
    expect(shown(t)).toBe("1 hour ago");
  });

  it("stops with its signal, leaving its words and no timer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = time(NOW - 4 * MIN);
    const stop = new AbortController();
    enhanceRelativeTime(t, { locale: "en", signal: stop.signal });
    expect(vi.getTimerCount()).toBe(1);
    stop.abort();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10 * MIN);
    expect(shown(t)).toBe("4 minutes ago");
  });

  it("replaces an earlier call on the same time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = time(NOW - 4 * MIN);
    const first = new AbortController();
    const second = new AbortController();
    enhanceRelativeTime(t, { locale: "en", signal: first.signal });
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
    enhanceRelativeTime(old, { locale: "en", signal: life.signal });
    enhanceRelativeTime(fresh, { locale: "en", signal: life.signal });
    expect(vi.getTimerCount()).toBe(1);
    expect(shown(fresh)).toBe("now");
    vi.advanceTimersByTime(50_501);
    expect([shown(fresh), shown(old)]).toEqual(["1 minute ago", "3 hours ago"]);
  });

  it("keeps a time out of the page current, so it reads the present when put back", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = time(NOW - 4 * MIN);
    enhanceRelativeTime(t, { locale: "en", signal: life.signal });
    t.remove();
    vi.advanceTimersByTime(3 * MIN);
    document.body.append(t);
    expect(shown(t)).toBe("7 minutes ago");
  });

  it("brings every time up to date when the page shows again", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = time(NOW - 4 * MIN);
    enhanceRelativeTime(t, { locale: "en", signal: life.signal });
    // A hidden page's timers run late: the clock moves with none firing.
    vi.setSystemTime(NOW + 20 * MIN);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(shown(t)).toBe("4 minutes ago");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(shown(t)).toBe("24 minutes ago");
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
