import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { rollText } from "../../core/roll/roll.js";
import { installAnnouncer } from "../announce/announce.js";
import { type BatchAnswer, type BatchOptions, enhanceBatchedAction } from "./batch-report.js";

let life = new AbortController();
let sheet: HTMLLinkElement;

beforeAll(async () => {
  document.documentElement.classList.add("cp");
  sheet = document.createElement("link");
  sheet.rel = "stylesheet";
  sheet.href = new URL("../../../css/system.css", import.meta.url).href;
  const loaded = new Promise((resolve, reject) => {
    sheet.addEventListener("load", resolve, { once: true });
    sheet.addEventListener("error", reject, { once: true });
  });
  document.head.append(sheet);
  await loaded;
});

afterAll(() => {
  sheet.remove();
  document.documentElement.classList.remove("cp");
});

beforeEach(() => {
  installAnnouncer({ signal: life.signal });
});

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

interface Deferred {
  readonly promise: Promise<BatchAnswer>;
  resolve(answer: BatchAnswer): void;
  reject(reason: unknown): void;
}

function deferred(): Deferred {
  let resolve!: (answer: BatchAnswer) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<BatchAnswer>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Waits until `check` holds, for work that settles across a few tasks. */
async function until(check: () => boolean, ms = 2000): Promise<void> {
  const end = performance.now() + ms;
  while (!check()) {
    if (performance.now() > end) {
      throw new Error("timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const said = (politeness: "polite" | "assertive"): string =>
  document.querySelector(`[aria-live="${politeness}"]`)?.textContent ?? "";

function card(first = "Start the first 100"): { button: HTMLButtonElement; report: HTMLElement } {
  const button = document.createElement("button");
  button.className = "cp-button";
  button.type = "button";
  const busy = document.createElement("span");
  busy.className = "cp-icon";
  busy.dataset["cpIcon"] = "spinner-arc";
  busy.dataset["part"] = "busy";
  const roll = document.createElement("span");
  roll.className = "cp-roll";
  roll.textContent = first;
  button.append(busy, roll);
  const report = document.createElement("div");
  report.className = "cp-batch-report";
  const p = document.createElement("p");
  p.textContent = "248 episodes need subtitles.";
  report.append(p);
  document.body.append(button, report);
  return { button, report };
}

const label = (button: HTMLButtonElement): string =>
  rollText(button.querySelector(".cp-roll") as HTMLElement);

function wire(
  button: HTMLButtonElement,
  report: HTMLElement,
  extra: Partial<BatchOptions> = {},
): { calls: Deferred[]; sends: number[] } {
  const calls: Deferred[] = [];
  const sends: number[] = [];
  enhanceBatchedAction(button, report, {
    total: 248,
    size: 100,
    send: (count) => {
      sends.push(count);
      const d = deferred();
      calls.push(d);
      return d.promise;
    },
    signal: life.signal,
    ...extra,
  });
  return { calls, sends };
}

/** Presses `button` and settles the batch it sends with `answer`. */
async function press(
  button: HTMLButtonElement,
  calls: Deferred[],
  answer: BatchAnswer,
  settled: () => boolean,
): Promise<void> {
  const before = calls.length;
  button.click();
  expect(calls).toHaveLength(before + 1);
  calls[before]?.resolve(answer);
  await until(settled);
}

describe("enhanceBatchedAction", () => {
  it("sends each batch's share and names what the next press does", async () => {
    const { button, report } = card();
    const { calls, sends } = wire(button, report);
    button.focus();
    await press(button, calls, { started: 100 }, () => label(button) === "Start the next 100");
    expect(report.querySelector("p")?.textContent).toBe("Started 100 of 248. 148 remain.");
    await until(() => said("polite") === "Started 100 of 248. 148 remain.");
    expect(document.activeElement).toBe(button);
    await press(button, calls, { started: 100 }, () => label(button) === "Start the remaining 48");
    await press(button, calls, { started: 48 }, () => label(button) === "All 248 started");
    expect(sends).toEqual([100, 100, 48]);
    expect(report.querySelector("p")?.textContent).toBe("Started 248 of 248. None remain.");
    expect(report.querySelector("dl")).toBeNull();
    await until(() => button.disabled);
    expect(document.activeElement).toBe(report);
    button.click();
    expect(calls).toHaveLength(3);
  });

  it("lists every item that did not go, across presses, as compared facts", async () => {
    const { button, report } = card();
    const { calls } = wire(button, report);
    await press(
      button,
      calls,
      {
        started: 99,
        missed: [
          {
            name: "Kaiba, episode 4",
            reason: "No provider has Basque subtitles",
            note: "Checked 6 providers",
          },
        ],
      },
      () => report.querySelector("dl") !== null,
    );
    expect(report.querySelector("p")?.textContent).toBe(
      "Started 99 of 248. 148 remain. 1 couldn't start:",
    );
    await press(button, calls, { started: 100 }, () => label(button) === "Start the remaining 48");
    await press(
      button,
      calls,
      { started: 47, missed: [{ name: "Kaiba, episode 9", reason: "The video file is missing" }] },
      () => label(button) === "246 of 248 started",
    );
    expect(report.querySelector("p")?.textContent).toBe(
      "Started 246 of 248. None remain. 2 couldn't start:",
    );
    const list = report.querySelector('dl.cp-facts[data-variant="compare"]');
    expect([...(list?.querySelectorAll("dt") ?? [])].map((dt) => dt.textContent)).toEqual([
      "Kaiba, episode 4",
      "Kaiba, episode 9",
    ]);
    const reasons = [...(list?.querySelectorAll("dd > .cp-state") ?? [])];
    expect(reasons.map((s) => [s.getAttribute("data-cp-state"), s.textContent])).toEqual([
      ["failed", "No provider has Basque subtitles"],
      ["failed", "The video file is missing"],
    ]);
    expect([...(list?.querySelectorAll("dd > small") ?? [])].map((s) => s.textContent)).toEqual([
      "Checked 6 providers",
    ]);
  });

  it("says a press that failed, keeps focus and the count, and sends the same items again", async () => {
    const { button, report } = card();
    const { calls, sends } = wire(button, report, {
      words: { failed: (reason) => `Nothing started: ${(reason as Error).message}` },
    });
    await press(button, calls, { started: 100 }, () => label(button) === "Start the next 100");
    button.focus();
    button.click();
    calls[1]?.reject(new Error("the provider timed out."));
    const failed = () => report.querySelector(':scope > .cp-state[data-cp-state="failed"]');
    await until(() => failed() !== null);
    expect(failed()?.textContent).toBe("Nothing started: the provider timed out.");
    expect(report.querySelector("p")?.textContent).toBe("Started 100 of 248. 148 remain.");
    expect(label(button)).toBe("Start the next 100");
    expect(document.activeElement).toBe(button);
    await until(() => said("assertive") === "Nothing started: the provider timed out.");
    button.click();
    expect(failed()).toBeNull();
    expect(sends.at(-1)).toBe(100);
  });

  it("keeps pending items in what remains and sends them again until none is held back", async () => {
    const { button, report } = card();
    const { calls, sends } = wire(button, report);
    await press(button, calls, { started: 100 }, () => label(button) === "Start the next 100");
    await press(
      button,
      calls,
      { started: 88, pending: 12 },
      () => label(button) === "Start the remaining 60",
    );
    expect(report.querySelector("p")?.textContent).toBe(
      "Started 188 of 248. 12 waiting to be sent again. 48 remain.",
    );
    await press(
      button,
      calls,
      { started: 50, pending: 10 },
      () => label(button) === "Start the remaining 10",
    );
    expect(report.querySelector("p")?.textContent).toBe(
      "Started 238 of 248. 10 waiting to be sent again.",
    );
    expect(button.disabled).toBe(false);
    await press(button, calls, { started: 10 }, () => label(button) === "All 248 started");
    expect(sends).toEqual([100, 100, 60, 10]);
    expect(report.querySelector("p")?.textContent).toBe("Started 248 of 248. None remain.");
    await until(() => button.disabled);
  });

  it("fails a press whose answer does not account for its batch, counting nothing", async () => {
    const { button, report } = card();
    const { calls, sends } = wire(button, report);
    button.click();
    calls[0]?.resolve({ started: 90 });
    const failed = () => report.querySelector(':scope > .cp-state[data-cp-state="failed"]');
    await until(() => failed() !== null);
    expect(failed()?.textContent).toBe("The batch could not start.");
    expect(report.querySelector("p")?.textContent).toBe("248 episodes need subtitles.");
    expect(label(button)).toBe("Start the first 100");
    button.click();
    expect(sends).toEqual([100, 100]);
  });

  it("sends one batch at a time, staying focusable and busy while it goes", async () => {
    const { button, report } = card();
    const { calls } = wire(button, report);
    button.focus();
    button.click();
    button.click();
    expect(calls).toHaveLength(1);
    await until(() => button.getAttribute("aria-busy") === "true");
    expect(label(button)).toBe("Starting…");
    expect(button.disabled).toBe(false);
    expect(document.activeElement).toBe(button);
    calls[0]?.resolve({ started: 100 });
    await until(() => label(button) === "Start the next 100");
  });

  it("takes the app's words and writes counts in the page's language", async () => {
    const { button, report } = card("Erste 1.000 starten");
    report.lang = "de";
    button.lang = "de";
    const { calls } = wire(button, report, {
      total: 2500,
      size: 1000,
      words: {
        next: (size, left, last) => (last ? `Letzte ${left} starten` : `Nächste ${size} starten`),
        done: (started, total) => `${started} von ${total} gestartet`,
        report: ({ started, left, format }) =>
          `${format(started)} gestartet, ${format(left)} übrig.`,
      },
    });
    await press(button, calls, { started: 1000 }, () => label(button) === "Nächste 1.000 starten");
    expect(report.querySelector("p")?.textContent).toBe("1.000 gestartet, 1.500 übrig.");
    await press(button, calls, { started: 1000 }, () => label(button) === "Letzte 500 starten");
    await press(
      button,
      calls,
      { started: 500 },
      () => label(button) === "2.500 von 2.500 gestartet",
    );
  });

  it("says one remains in the singular", async () => {
    const { button, report } = card();
    const { calls } = wire(button, report, { total: 3, size: 2 });
    await press(button, calls, { started: 2 }, () => label(button) === "Start the remaining 1");
    expect(report.querySelector("p")?.textContent).toBe("Started 2 of 3. 1 remains.");
  });

  it("refuses a total or a size that is not a whole number of at least 1", () => {
    const { button, report } = card();
    const send = () => Promise.resolve({ started: 0 });
    for (const [total, size] of [
      [0, 10],
      [10, 0],
      [1.5, 1],
      [10, Number.NaN],
    ] as const) {
      expect(() => {
        enhanceBatchedAction(button, report, { total, size, send });
      }).toThrow(RangeError);
    }
  });

  it("stacks each miss under its name in a report narrower than 24rem", async () => {
    const { button, report } = card();
    const { calls } = wire(button, report, { total: 2, size: 2 });
    const miss = { name: "Kaiba, episode 4", reason: "No provider has Basque subtitles" };
    await press(button, calls, { started: 0, missed: [miss, miss] }, () => button.disabled);
    const box = (e: Element | null) => (e as Element).getBoundingClientRect();
    const [name, reason] = [report.querySelector("dt"), report.querySelector(".cp-state")];
    report.style.inlineSize = "40rem";
    expect(box(reason).left).toBeGreaterThan(box(name).right);
    expect(box(reason).top).toBeLessThan(box(name).bottom);
    report.style.inlineSize = "20rem";
    expect(box(reason).left).toBe(box(name).left);
    expect(box(reason).top).toBeGreaterThanOrEqual(box(name).bottom - 1);
  });

  it("stops at its signal, writing nothing for the batch under way", async () => {
    const { button, report } = card();
    const stop = new AbortController();
    const { calls } = wire(button, report, { signal: stop.signal });
    button.click();
    stop.abort();
    calls[0]?.resolve({ started: 100 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(report.querySelector("p")?.textContent).toBe("248 episodes need subtitles.");
    expect(label(button)).toBe("Start the first 100");
    button.click();
    expect(calls).toHaveLength(1);
  });
});
