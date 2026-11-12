import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { createStateHistory } from "./state-history.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

const STATES = {
  ok: { tone: "success", word: "Answered" },
  slow: { tone: "warning", word: "Slow" },
  down: { tone: "danger", word: "Failed" },
  skip: { tone: "neutral", word: "Not checked" },
} as const;

const checks = (...keys: (keyof typeof STATES)[]) => keys.map((state) => ({ state }));

const texts = (root: Element, selector: string) =>
  [...root.querySelectorAll(selector)].map((n) => n.textContent);

describe("createStateHistory", () => {
  it("draws one cell per observation, oldest first, in its state's tone", () => {
    const el = createStateHistory(checks("ok", "slow", "ok", "down"), {
      name: "Sonarr",
      states: STATES,
    });
    expect(el.className).toBe("cp-state-history");
    const cells = [...el.querySelectorAll("svg > rect")];
    expect(cells.map((c) => c.getAttribute("data-tone"))).toEqual([
      "success",
      "warning",
      "success",
      "danger",
    ]);
    expect(cells.map((c) => Number(c.getAttribute("x")))).toEqual([0.15, 25.15, 50.15, 75.15]);
    expect(cells[0]?.getAttribute("width")).toBe("24.7");
  });

  it("keeps every cell of a long history drawn, thinning the gap between them", () => {
    const el = createStateHistory(
      Array.from({ length: 400 }, () => ({ state: "ok" as const })),
      { name: "Sonarr", states: STATES },
    );
    const cells = [...el.querySelectorAll("svg > rect")];
    const widths = cells.map((c) => Number(c.getAttribute("width")));
    expect(cells).toHaveLength(400);
    expect(widths.every((w) => w > 0)).toBe(true);
    const last = cells.at(-1) as Element;
    expect(Number(last.getAttribute("x")) + Number(last.getAttribute("width"))).toBeLessThan(100);
  });

  it("names the strip with each state's count, in the order the states are given", () => {
    const el = createStateHistory(checks("down", "ok", "ok", "skip"), {
      name: "Sonarr, the last 4 checks",
      states: STATES,
    });
    const strip = el.querySelector("svg") as SVGSVGElement;
    expect(strip.getAttribute("role")).toBe("img");
    expect(strip.getAttribute("aria-label")).toBe(
      "Sonarr, the last 4 checks: 2 answered, 1 failed, 1 not checked",
    );
  });

  it("lists in the legend only the states that occur, each with its tone", () => {
    const el = createStateHistory(checks("skip", "ok"), { name: "Sonarr", states: STATES });
    const keys = [...el.querySelectorAll('[data-part="legend"] > span')];
    expect(keys.map((k) => [k.textContent, k.getAttribute("data-tone")])).toEqual([
      ["Answered", "success"],
      ["Not checked", "neutral"],
    ]);
  });

  it("opens the same observations as a table, the newest first", () => {
    const el = createStateHistory([{ state: "ok", label: "14:00" }, ...checks("down", "ok")], {
      name: "Sonarr",
      states: STATES,
    });
    const table = el.querySelector("details > .cp-panel[data-flush] > table.cp-table") as Element;
    expect(table.getAttribute("aria-label")).toBe("Sonarr");
    expect(texts(table, "th")).toEqual(["Check", "State"]);
    expect(texts(table, "tbody td")).toEqual([
      "Check 3, the latest",
      "Answered",
      "Check 2",
      "Failed",
      "14:00",
      "Answered",
    ]);
    expect(el.querySelector("summary")?.textContent).toBe("Show as a table");
  });

  it("writes its words in another language", () => {
    const el = createStateHistory([{ state: "ok" }, { state: "ok" }], {
      name: "Sonarr",
      states: { ok: { tone: "success", word: "Répond" } },
      words: {
        tally: (n, w) => `${w} : ${String(n)}`,
        show: "Voir le tableau",
        point: "Contrôle",
        state: "État",
        label: (n, latest) => (latest ? `Dernier (${String(n)})` : `N° ${String(n)}`),
      },
    });
    expect(el.querySelector("svg")?.getAttribute("aria-label")).toBe("Sonarr: Répond : 2");
    expect(el.querySelector("summary")?.textContent).toBe("Voir le tableau");
    expect(texts(el, "th")).toEqual(["Contrôle", "État"]);
    expect(texts(el, "tbody td:first-child")).toEqual(["Dernier (2)", "N° 1"]);
  });

  it("names an empty strip by its name alone", () => {
    const el = createStateHistory([], { name: "Sonarr", states: STATES });
    expect(el.querySelector("svg")?.getAttribute("aria-label")).toBe("Sonarr");
    expect(el.querySelectorAll("rect, [data-part='legend'] > *, tbody tr")).toHaveLength(0);
  });

  it("refuses a state it was not given, an inherited name included", () => {
    const states: Record<string, { tone: "success"; word: string }> = {
      ok: { tone: "success", word: "Answered" },
    };
    expect(() =>
      createStateHistory([{ state: "constructor" }], { name: "Sonarr", states }),
    ).toThrow(RangeError);
  });

  it("glides the table open on a press of its summary, and stops when its signal aborts", async () => {
    const el = createStateHistory(checks("ok"), {
      name: "Sonarr",
      states: STATES,
      signal: life.signal,
    });
    document.body.append(el);
    const details = el.querySelector("details") as HTMLDetailsElement;
    await userEvent.click(el.querySelector("summary") as HTMLElement);
    expect(details.open).toBe(true);
    expect(details.getAnimations()).toHaveLength(1);
    life.abort();
    await new Promise((tick) => setTimeout(tick));
    expect(details.getAnimations()).toHaveLength(0);
  });
});
