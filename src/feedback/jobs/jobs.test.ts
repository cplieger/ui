import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { enhanceLoadMore } from "../../data/load-more/load-more.js";
import { installAnnouncer } from "../announce/announce.js";
import { reported } from "../test-helpers/reported.js";
import { enhanceJobs, type JobsOptions } from "./jobs.js";

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
  readonly promise: Promise<void>;
  resolve(): void;
  reject(reason: unknown): void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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

const JOB = (kind: string, scope: string, done: number, total: number, phase: string): string =>
  `<li><div class="cp-list-row"><span class="cp-cell-stack"><strong data-part="kind">${kind}</strong><a href="#job">${scope}</a></span><button class="cp-button" data-size="sm" type="button" data-part="stop">Stop</button><progress max="${String(total)}" value="${String(done)}" aria-label="${kind}, ${scope}"></progress><small><span data-part="count">${String(done)} of ${String(total)}</span> · <span data-part="phase">${phase}</span></small></div></li>`;

function list(): HTMLUListElement {
  const ul = document.createElement("ul");
  ul.className = "cp-list";
  ul.innerHTML =
    JOB("Finding subtitles", "Frieren, Season 1", 12, 40, "Searching providers") +
    JOB("Fixing timing", "Mushishi, Season 1", 20, 26, "Matching cues to the audio");
  document.body.append(ul);
  return ul;
}

const rows = (ul: HTMLElement): HTMLElement[] => [
  ...ul.querySelectorAll<HTMLElement>(":scope > li > .cp-list-row"),
];
const first = (ul: HTMLElement): HTMLElement => rows(ul)[0] as HTMLElement;
const stopOf = (row: HTMLElement): HTMLButtonElement =>
  row.querySelector('[data-part="stop"]') as HTMLButtonElement;

function wire(
  ul: HTMLElement,
  extra: Partial<JobsOptions> = {},
): { calls: Deferred[]; jobs: ReturnType<typeof enhanceJobs> } {
  const calls: Deferred[] = [];
  const jobs = enhanceJobs(ul, {
    stop: () => {
      const d = deferred();
      calls.push(d);
      return d.promise;
    },
    signal: life.signal,
    ...extra,
  });
  return { calls, jobs };
}

describe("enhanceJobs", () => {
  it("moves the bar and writes the count from it, with the phase", () => {
    const ul = list();
    const { jobs } = wire(ul);
    const row = first(ul);
    jobs.progress(row, 13);
    jobs.phase(row.parentElement as Element, "Downloading");
    const bar = row.querySelector("progress") as HTMLProgressElement;
    expect([bar.value, bar.max]).toEqual([13, 40]);
    expect(row.querySelector('[data-part="count"]')?.textContent).toBe("13 of 40");
    expect(row.querySelector('[data-part="phase"]')?.textContent).toBe("Downloading");
    jobs.progress(row, 60, 50);
    expect(row.querySelector('[data-part="count"]')?.textContent).toBe("50 of 50");
  });

  it("writes counts in the page's language through the app's words", () => {
    const ul = list();
    ul.lang = "de";
    const { jobs } = wire(ul, { words: { count: (done, total) => `${done} von ${total}` } });
    jobs.progress(first(ul), 1200, 2500);
    expect(first(ul).querySelector('[data-part="count"]')?.textContent).toBe("1.200 von 2.500");
  });

  it("ends a job with its outcome at its end and its cause under its scope", () => {
    const ul = list();
    const { jobs } = wire(ul);
    const row = first(ul);
    jobs.end(row, { words: "Finished", tone: "success", cause: "All 40 done" });
    expect(row.hasAttribute("data-ended")).toBe(true);
    expect(row.querySelector("progress")).toBeNull();
    expect(stopOf(row)).toBeNull();
    expect(row.querySelector(':scope > small, [data-part="count"]')).toBeNull();
    const end = row.querySelector(':scope > [data-part="end"]');
    expect(end?.previousElementSibling).toBe(row.querySelector(".cp-cell-stack"));
    const state = end?.querySelector(":scope > .cp-state");
    expect([state?.getAttribute("data-tone"), state?.textContent]).toEqual(["success", "Finished"]);
    expect(state?.querySelector('.cp-icon[aria-hidden="true"]')?.getAttribute("data-cp-icon")).toBe(
      "circle-check",
    );
    expect(row.querySelector(".cp-cell-stack > small:last-child")?.textContent).toBe("All 40 done");
  });

  it("says a job's end when the host gives its words, and nothing otherwise", async () => {
    const ul = list();
    const { jobs } = wire(ul);
    jobs.end(first(ul), { words: "Finished", tone: "success" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(said("polite")).toBe("");
    jobs.end(rows(ul)[1] as HTMLElement, {
      words: "Finished",
      tone: "success",
      said: "Fixing timing finished",
    });
    await until(() => said("polite") === "Fixing timing finished");
  });

  it("rewrites an ended job's outcome rather than adding a second", () => {
    const ul = list();
    const { jobs } = wire(ul);
    const row = first(ul);
    jobs.end(row, { words: "Finished", tone: "success", cause: "All 40 done" });
    jobs.end(row, { words: "Failed", tone: "danger", cause: "The disk is full" });
    expect(row.querySelectorAll('[data-part="end"] > .cp-state')).toHaveLength(1);
    expect(row.querySelector('[data-part="end"] .cp-icon')?.getAttribute("data-cp-icon")).toBe(
      "circle-x",
    );
    expect([...row.querySelectorAll(".cp-cell-stack > small")].map((s) => s.textContent)).toEqual([
      "The disk is full",
    ]);
  });

  it("stops a job: busy and focusable, then its link takes focus and its end says so", async () => {
    const ul = list();
    const { calls } = wire(ul);
    const row = first(ul);
    const stop = stopOf(row);
    stop.focus();
    stop.click();
    stop.click();
    expect(calls).toHaveLength(1);
    expect(stop.getAttribute("aria-busy")).toBe("true");
    expect(stop.disabled).toBe(false);
    expect(document.activeElement).toBe(stop);
    calls[0]?.resolve();
    await until(() => row.hasAttribute("data-ended"));
    expect(document.activeElement).toBe(row.querySelector("a"));
    expect(row.querySelector('[data-part="end"] .cp-state')?.textContent).toBe("Stopped");
    expect(row.querySelector('[data-part="end"] .cp-icon')?.getAttribute("data-cp-icon")).toBe(
      "circle-minus",
    );
    expect(row.querySelector(".cp-cell-stack > small")?.textContent).toBe(
      "Stopped by you at 12 of 40",
    );
    await until(() => said("polite") === "Finding subtitles stopped");
    expect(rows(ul)[1]?.hasAttribute("data-ended")).toBe(false);
  });

  it("takes the app's word for a cancel", async () => {
    const ul = list();
    const { calls } = wire(ul, {
      words: {
        stopped: "Cancelled",
        stoppedCause: (done, total) => `Cancelled by you at ${done ?? "?"} of ${total ?? "?"}`,
        said: (kind) => `${kind} cancelled`,
      },
    });
    const row = first(ul);
    stopOf(row).click();
    calls[0]?.resolve();
    await until(() => row.hasAttribute("data-ended"));
    expect(row.querySelector('[data-part="end"] .cp-state')?.textContent).toBe("Cancelled");
    expect(row.querySelector(".cp-cell-stack > small")?.textContent).toBe(
      "Cancelled by you at 12 of 40",
    );
    await until(() => said("polite") === "Finding subtitles cancelled");
  });

  it("ends a stopped job in the default words when the app's words throw", async () => {
    const errors = reported();
    const ul = list();
    const { calls } = wire(ul, {
      words: {
        stoppedCause: () => {
          throw new Error("no words");
        },
        said: () => {
          throw new Error("no words");
        },
      },
    });
    const row = first(ul);
    stopOf(row).click();
    calls[0]?.resolve();
    await until(() => row.hasAttribute("data-ended"));
    expect(row.querySelector(".cp-cell-stack > small")?.textContent).toBe(
      "Stopped by you at 12 of 40",
    );
    await until(() => said("polite") === "Finding subtitles stopped");
    expect(errors).toHaveLength(2);
  });

  it("falls back to the app's count words when its stopped cause throws", async () => {
    const errors = reported();
    const ul = list();
    const { calls } = wire(ul, {
      words: {
        count: (done, total) => `${done}/${total}`,
        stoppedCause: () => {
          throw new Error("no words");
        },
      },
    });
    const row = first(ul);
    stopOf(row).click();
    calls[0]?.resolve();
    await until(() => row.hasAttribute("data-ended"));
    expect(row.querySelector(".cp-cell-stack > small")?.textContent).toBe(
      "Stopped by you at 12/40",
    );
    expect(errors).toHaveLength(1);
  });

  it("says the default failure when the app's stop-failed words throw", async () => {
    const errors = reported();
    const ul = list();
    const { calls } = wire(ul, {
      words: { stopFailed: (reason) => (reason as { body: { detail: string } }).body.detail },
    });
    const row = first(ul);
    stopOf(row).click();
    calls[0]?.reject(new TypeError("Failed to fetch"));
    const failed = () => row.querySelector(':scope > .cp-state[data-cp-state="failed"]');
    await until(() => failed() !== null);
    expect(failed()?.textContent).toBe("The job could not be stopped.");
    expect(errors).toHaveLength(1);
  });

  it("keeps a job whose stop failed, says why and keeps focus on Stop to try again", async () => {
    const ul = list();
    const { calls } = wire(ul, {
      words: { stopFailed: (reason) => `Not stopped: ${(reason as Error).message}` },
    });
    const row = first(ul);
    const stop = stopOf(row);
    stop.focus();
    stop.click();
    calls[0]?.reject(new Error("the worker did not answer."));
    const failed = () => row.querySelector(':scope > .cp-state[data-cp-state="failed"]');
    await until(() => failed() !== null);
    expect(failed()?.textContent).toBe("Not stopped: the worker did not answer.");
    expect(failed()?.previousElementSibling?.tagName).toBe("SMALL");
    expect(row.hasAttribute("data-ended")).toBe(false);
    expect(stop.hasAttribute("aria-busy")).toBe(false);
    expect(document.activeElement).toBe(stop);
    await until(() => said("assertive") === "Not stopped: the worker did not answer.");
    stop.click();
    expect(failed()).toBeNull();
    calls[1]?.resolve();
    await until(() => row.hasAttribute("data-ended"));
    expect(failed()).toBeNull();
  });

  it("keeps the end the app wrote while Stop was pending", async () => {
    const ul = list();
    const { calls, jobs } = wire(ul);
    const row = first(ul);
    jobs.progress(row, 39);
    stopOf(row).click();
    jobs.end(row, { words: "Finished", tone: "success", cause: "All 40 done" });
    calls[0]?.resolve();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(row.querySelector('[data-part="end"] .cp-state')?.textContent).toBe("Finished");
    expect(row.querySelector(".cp-cell-stack > small")?.textContent).toBe("All 40 done");
    expect(said("polite")).toBe("");
  });

  it("fails a stop that throws before it returns a promise, and a second press works", async () => {
    const ul = list();
    let presses = 0;
    wire(ul, {
      stop: () => {
        presses += 1;
        if (presses === 1) {
          throw new Error("no job id");
        }
        return Promise.resolve();
      },
    });
    const row = first(ul);
    const stop = stopOf(row);
    stop.click();
    const failed = () => row.querySelector(':scope > .cp-state[data-cp-state="failed"]');
    await until(() => failed() !== null);
    expect(failed()?.textContent).toBe("The job could not be stopped.");
    expect(stop.hasAttribute("aria-busy")).toBe(false);
    expect(row.hasAttribute("data-ended")).toBe(false);
    stop.click();
    await until(() => row.hasAttribute("data-ended"));
    expect(presses).toBe(2);
  });

  it("stops rows a page brought in later, and focuses the first one it added", async () => {
    const ul = list();
    const foot = document.createElement("li");
    foot.className = "cp-list-foot";
    foot.innerHTML =
      '<button class="cp-button" data-variant="quiet" data-size="sm" type="button">Show all 3 running</button>';
    ul.append(foot);
    const { calls } = wire(ul);
    enhanceLoadMore(foot.querySelector("button") as HTMLButtonElement, {
      load: () => {
        const holder = document.createElement("ul");
        holder.innerHTML = JOB("Finding subtitles", "Kaiba", 0, 12, "Waiting");
        return Promise.resolve({ items: [...holder.children], more: false });
      },
      signal: life.signal,
    });
    (foot.querySelector("button") as HTMLButtonElement).click();
    await until(() => rows(ul).length === 3);
    const added = rows(ul)[2] as HTMLElement;
    await until(() => document.activeElement === added.querySelector("a"));
    stopOf(added).click();
    calls[0]?.resolve();
    await until(() => added.hasAttribute("data-ended"));
    expect(added.querySelector(".cp-cell-stack > small")?.textContent).toBe(
      "Stopped by you at 0 of 12",
    );
  });

  it("moves focus to the row when it has no other part to take it", () => {
    const ul = list();
    const { jobs } = wire(ul);
    const row = first(ul);
    row.querySelector("a")?.replaceWith("Frieren, Season 1");
    stopOf(row).focus();
    jobs.end(row, { words: "Finished", tone: "success" });
    expect(document.activeElement).toBe(row);
    expect(row.querySelector(".cp-cell-stack > small")).toBeNull();
  });

  it("leaves Stop to the host without a stop, and writes nothing after its signal", async () => {
    const ul = list();
    enhanceJobs(ul, { signal: life.signal });
    stopOf(first(ul)).click();
    expect(stopOf(first(ul)).hasAttribute("aria-busy")).toBe(false);

    const other = list();
    const ends = new AbortController();
    const calls: Deferred[] = [];
    enhanceJobs(other, {
      stop: () => {
        const d = deferred();
        calls.push(d);
        return d.promise;
      },
      signal: ends.signal,
    });
    stopOf(first(other)).click();
    ends.abort();
    calls[0]?.resolve();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(first(other).hasAttribute("data-ended")).toBe(false);
    stopOf(first(other)).click();
    expect(calls).toHaveLength(1);
  });

  it("draws every outcome's glyph and keeps an ended row's words muted", () => {
    const ul = list();
    const { jobs } = wire(ul);
    const row = first(ul);
    const masks = new Set<string>();
    for (const tone of ["success", "warning", "danger", "neutral"] as const) {
      jobs.end(row, { words: tone, tone });
      const glyph = row.querySelector('[data-part="end"] .cp-icon') as HTMLElement;
      const mask = getComputedStyle(glyph).maskImage;
      expect(mask, tone).toMatch(/^url\(/);
      masks.add(mask);
    }
    expect(masks.size).toBe(4);
    const live = rows(ul)[1] as HTMLElement;
    expect(getComputedStyle(row).color).not.toBe(getComputedStyle(live).color);
  });
});
