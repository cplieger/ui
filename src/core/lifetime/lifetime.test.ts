import { afterEach, describe, expect, it, vi } from "vitest";

import { afterFontLoads, shared, until, whenAborted } from "./lifetime.js";

afterEach(() => {
  document.adoptedStyleSheets = [];
  document.body.replaceChildren();
});

describe("shared", () => {
  it("starts once for every caller and stops when the last caller's signal aborts", () => {
    const runs: AbortSignal[] = [];
    const page = shared((signal) => runs.push(signal));
    const a = new AbortController();
    const b = new AbortController();
    page.install({ signal: a.signal });
    page.install({ signal: b.signal });
    expect(runs).toHaveLength(1);
    expect(page.active).toBe(true);
    a.abort();
    expect(runs[0]?.aborted).toBe(false);
    b.abort();
    expect(runs[0]?.aborted).toBe(true);
    expect(page.active).toBe(false);
    page.install();
    expect(runs).toHaveLength(2);
  });

  it("does nothing for a caller whose signal has already aborted, and keeps the first caller's options", () => {
    const seen: number[] = [];
    const page = shared<{ readonly n?: number }>((_signal, o) => seen.push(o.n ?? 0));
    page.install({ signal: AbortSignal.abort(), n: 1 });
    expect(page.active).toBe(false);
    page.install({ n: 2 });
    page.install({ n: 3 });
    expect(seen).toEqual([2]);
  });
});

describe("until and whenAborted", () => {
  it("ends a listener with its signal, and leaves one without a signal on", () => {
    const life = new AbortController();
    const target = new EventTarget();
    let heard = 0;
    target.addEventListener("x", () => (heard += 1), until(life.signal));
    target.addEventListener("x", () => (heard += 10), until(undefined, true));
    life.abort();
    target.dispatchEvent(new Event("x"));
    expect(heard).toBe(10);
  });

  it("runs at once for a signal that has already aborted, else on its abort", () => {
    const calls: string[] = [];
    whenAborted(AbortSignal.abort(), () => calls.push("now"));
    const life = new AbortController();
    whenAborted(life.signal, () => calls.push("later"));
    whenAborted(undefined, () => calls.push("never"));
    expect(calls).toEqual(["now"]);
    life.abort();
    expect(calls).toEqual(["now", "later"]);
  });
});

/** Starts a face of its own, by a stylesheet, as an app's faces load: a
 *  query of its own, so no cached copy loads it at once. */
function lateFace(family: string): void {
  const url = new URL("../../../fonts/atkinson-hyperlegible-next-latin.woff2", import.meta.url);
  url.searchParams.set("late", `${family}-${String(Date.now())}`);
  const faces = new CSSStyleSheet();
  faces.replaceSync(`@font-face { font-family: "${family}"; src: url("${url.href}"); }`);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, faces];
  const text = document.createElement("span");
  text.style.fontFamily = `"${family}"`;
  text.textContent = "Late";
  document.body.append(text);
  text.getBoundingClientRect();
}

describe("afterFontLoads", () => {
  it("runs once a face that starts later has loaded", async () => {
    await document.fonts.ready;
    const runs: string[] = [];
    afterFontLoads(() => runs.push(document.fonts.status), AbortSignal.timeout(20_000));
    lateFace("cp-lifetime-later");
    await vi.waitFor(() => {
      expect(runs).toEqual(["loaded"]);
    });
  });

  it("waits out a load already running, and stops with its signal", async () => {
    lateFace("cp-lifetime-running");
    expect(document.fonts.status).toBe("loading");
    const life = new AbortController();
    const runs: string[] = [];
    afterFontLoads(() => runs.push(document.fonts.status), life.signal);
    await document.fonts.ready;
    expect(runs).toEqual(["loaded"]);
    life.abort();
    lateFace("cp-lifetime-after");
    await document.fonts.ready;
    expect(runs).toEqual(["loaded"]);
  });
});
