import { describe, expect, it } from "vitest";

import { shared, sharedBy, until, whenAborted } from "./lifetime.js";

describe("sharedBy", () => {
  it("starts one install for each key, each held by its own calls", () => {
    const runs = new Map<string, AbortSignal[]>();
    const per = sharedBy<{ readonly name: string }>((key, signal) => {
      runs.set(key.name, [...(runs.get(key.name) ?? []), signal]);
    });
    const a = { name: "a" };
    const b = { name: "b" };
    const one = new AbortController();
    const two = new AbortController();
    const three = new AbortController();
    per(a).install({ signal: one.signal });
    per(a).install({ signal: two.signal });
    per(b).install({ signal: three.signal });
    expect([runs.get("a")?.length, runs.get("b")?.length]).toEqual([1, 1]);
    three.abort();
    one.abort();
    expect([runs.get("a")?.[0]?.aborted, runs.get("b")?.[0]?.aborted]).toEqual([false, true]);
    expect([per(a).active, per(b).active]).toEqual([true, false]);
    two.abort();
    expect(per(a).active).toBe(false);
  });
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
