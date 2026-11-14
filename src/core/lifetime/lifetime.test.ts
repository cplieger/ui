import { describe, expect, it } from "vitest";

import { shared, until, whenAborted } from "./lifetime.js";

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
