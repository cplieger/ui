import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { installAnnouncer } from "../announce/announce.js";
import { enhanceLoadingRegion, type LoadingRegionOptions } from "./loading-region.js";

let life = new AbortController();
let sheet: HTMLLinkElement;

// The refresh line is drawn by the stylesheet, so the tests link it.
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

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const polite = (): string => document.querySelector('[aria-live="polite"]')?.textContent ?? "";

function panel(content?: string): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "cp-panel";
  if (content !== undefined) {
    const p = document.createElement("p");
    p.textContent = content;
    div.append(p);
  }
  document.body.append(div);
  return div;
}

function refreshButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "cp-button";
  button.type = "button";
  const glyph = document.createElement("span");
  glyph.className = "cp-icon";
  glyph.dataset["cpIcon"] = "refresh-cw";
  glyph.setAttribute("aria-hidden", "true");
  button.append(glyph, "Refresh");
  document.body.prepend(button);
  return button;
}

/** A region whose loads the test settles one by one. */
function wired(region: HTMLElement, extra: Partial<LoadingRegionOptions<string>> = {}) {
  const loads: Deferred<string>[] = [];
  const handle = enhanceLoadingRegion<string>(region, {
    load: () => {
      const d = deferred<string>();
      loads.push(d);
      return d.promise;
    },
    render: (text) => {
      const heading = document.createElement("h3");
      heading.textContent = text;
      region.append(heading);
    },
    signal: life.signal,
    ...extra,
  });
  return { handle, loads };
}

const notice = (region: Element) => region.querySelector(":scope > .cp-notice");
const retryIn = (region: Element) =>
  region.querySelector<HTMLButtonElement>(":scope > .cp-notice > .cp-button");

describe("enhanceLoadingRegion: a first load", () => {
  it("starts idle when empty and ready when it holds content", () => {
    expect(wired(panel()).handle.state).toBe("idle");
    expect(wired(panel("Old")).handle.state).toBe("ready");
  });

  it("is busy while it loads, paints the placeholder after its delay, then the content", async () => {
    const region = panel();
    const { handle, loads } = wired(region);
    const done = handle.load();
    expect(region.getAttribute("aria-busy")).toBe("true");
    expect(handle.state).toBe("loading");
    expect(region.querySelector(".cp-inline-load")).toBeNull();
    await sleep(260);
    expect(region.querySelector(".cp-inline-load")?.textContent).toBe("Loading…");
    loads[0]?.resolve("Series");
    expect(await done).toBe(true);
    expect(region.querySelector(".cp-inline-load")).toBeNull();
    expect(region.querySelector("h3")?.textContent).toBe("Series");
    expect(region.getAttribute("aria-busy")).toBe("false");
    expect(handle.state).toBe("ready");
  });

  it("never paints the placeholder for a fast answer", async () => {
    const region = panel();
    const { handle, loads } = wired(region, {
      placeholder: () => {
        const s = document.createElement("span");
        s.className = "cp-skeleton";
        return s;
      },
    });
    const done = handle.load();
    loads[0]?.resolve("Fast");
    await done;
    await sleep(260);
    expect(region.querySelector(".cp-skeleton")).toBeNull();
    expect(region.textContent).toBe("Fast");
  });

  it("puts a danger notice with Retry in the region's place when it fails, and Retry loads again", async () => {
    const region = panel();
    const { handle, loads } = wired(region, {
      words: { failed: (reason) => `The readers could not be loaded: ${String(reason)}.` },
    });
    region.tabIndex = -1;
    region.focus();
    const first = handle.load();
    loads[0]?.reject("timeout");
    expect(await first).toBe(false);
    expect(handle.state).toBe("failed");
    expect(region.getAttribute("aria-busy")).toBe("false");
    const box = notice(region);
    expect(box?.getAttribute("data-tone")).toBe("danger");
    expect(box?.querySelector('[data-cp-icon="circle-x"]')).not.toBeNull();
    expect(box?.textContent).toContain("The readers could not be loaded: timeout.");
    expect(region.children).toHaveLength(1);
    const retry = retryIn(region);
    expect(document.activeElement).toBe(retry);
    await sleep(150);
    expect(polite()).toBe("The readers could not be loaded: timeout.");

    retry?.click();
    await sleep(0);
    expect(handle.state).toBe("loading");
    expect(loads).toHaveLength(2);
    loads[1]?.resolve("Read");
    await sleep(500);
    expect(notice(region)).toBeNull();
    expect(handle.state).toBe("ready");
    // Retry held focus and is gone, so focus lands on the content's heading.
    expect(document.activeElement).toBe(region.querySelector("h3"));
  });
});

describe("enhanceLoadingRegion: a refresh", () => {
  it("keeps the old content under the line, turns the pressed button, and is busy", async () => {
    const region = panel("Old");
    const button = refreshButton();
    const { handle, loads } = wired(region, { render: (text) => region.replaceChildren(text) });
    const done = handle.load(button);
    expect(handle.state).toBe("refreshing");
    expect(region.dataset["cpLoad"]).toBe("refreshing");
    expect(region.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(region.textContent).toBe("Old");
    const line = getComputedStyle(region, "::before");
    expect(line.content).not.toBe("none");
    expect(line.position).toBe("absolute");
    expect(line.blockSize).toBe("3px");
    expect(getComputedStyle(region).position).toBe("relative");
    loads[0]?.resolve("New");
    expect(await done).toBe(true);
    expect(region.textContent).toBe("New");
    expect(button.hasAttribute("aria-busy")).toBe(false);
    expect(getComputedStyle(region, "::before").content).toBe("none");
  });

  it("does not start a second load while one runs", async () => {
    const region = panel("Old");
    const { handle, loads } = wired(region);
    const first = handle.load();
    expect(await handle.load()).toBe(false);
    expect(loads).toHaveLength(1);
    loads[0]?.resolve("x");
    await first;
  });

  it("puts its failure above the old content with its age, and rewrites the same notice", async () => {
    const region = panel("Old");
    const button = refreshButton();
    const at = new Date();
    at.setHours(14, 2, 0, 0);
    const { handle, loads } = wired(region, { loadedAt: at, locale: "en-GB" });
    const first = handle.load(button);
    loads[0]?.reject(new Error("Sonarr did not answer"));
    await first;
    expect(handle.state).toBe("stale");
    const box = notice(region);
    expect(region.firstElementChild).toBe(box);
    expect(region.querySelector("p")?.textContent).toBe("Old");
    expect(box?.textContent).toContain("The refresh failed. What you see is from 14:02.");
    // A refresh from a button outside the region keeps focus on it.
    button.focus();
    const second = handle.load(button);
    expect(document.activeElement).toBe(button);
    loads[1]?.reject(new Error("again"));
    await second;
    expect(notice(region)).toBe(box);
    expect(region.querySelectorAll(".cp-notice")).toHaveLength(1);
    expect(document.activeElement).toBe(button);
  });

  it("takes the host's refresh words, given the reason and the time", async () => {
    const region = panel("Old");
    const { handle, loads } = wired(region, {
      words: {
        refreshFailed: (reason, loadedAt) =>
          `The refresh failed: ${(reason as Error).message}. What you see is from ${String(loadedAt.getHours())}h.`,
        retry: "Try again",
      },
      loadedAt: new Date(2026, 10, 14, 9, 0),
    });
    const done = handle.load();
    loads[0]?.reject(new Error("Sonarr did not answer"));
    await done;
    expect(notice(region)?.textContent).toContain(
      "The refresh failed: Sonarr did not answer. What you see is from 9h.",
    );
    expect(retryIn(region)?.textContent).toBe("Try again");
  });

  it("runs the line under a table's head when the region starts with one", async () => {
    const region = document.createElement("div");
    region.className = "cp-panel";
    region.dataset["flush"] = "";
    const table = document.createElement("table");
    table.className = "cp-table";
    table.createTHead().insertRow().insertCell().textContent = "Name";
    table.createTBody().insertRow().insertCell().textContent = "Frieren";
    region.append(table);
    document.body.append(region);
    const { handle, loads } = wired(region);
    const done = handle.load();
    const line = getComputedStyle(region, "::before");
    const head = table.tHead?.getBoundingClientRect().bottom ?? 0;
    const top = region.getBoundingClientRect().top + region.clientTop;
    expect(Number.parseFloat(line.insetBlockStart)).toBeCloseTo(head - top - 3, 0);
    loads[0]?.resolve("x");
    await done;
  });

  it("stops a load under way when its signal aborts", async () => {
    const region = panel("Old");
    const own = new AbortController();
    let seen: AbortSignal | undefined;
    const handle = enhanceLoadingRegion(region, {
      load: (signal) => {
        seen = signal;
        return new Promise<string>(() => undefined);
      },
      render: () => undefined,
      signal: own.signal,
    });
    void handle.load();
    own.abort();
    expect(seen?.aborted).toBe(true);
    expect(await handle.load()).toBe(false);
  });
});
