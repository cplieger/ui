import { afterEach, describe, expect, it } from "vitest";

import { rollText } from "../../core/roll/roll.js";
import { enhanceConfirm, type ConfirmOptions } from "./confirm.js";

afterEach(() => {
  document.body.replaceChildren();
});

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Short timings, so a whole cycle runs in a test. */
const QUICK = { busyDelay: 20, busyMin: 60, hold: 80 } as const;

function button(words = "Save changes", parent: HTMLElement = document.body): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "cp-button";
  b.type = "button";
  const rest = document.createElement("span");
  rest.className = "cp-icon";
  const busy = document.createElement("span");
  busy.className = "cp-icon";
  busy.dataset["part"] = "busy";
  const done = document.createElement("span");
  done.className = "cp-icon";
  done.dataset["part"] = "done";
  const roll = document.createElement("span");
  roll.className = "cp-roll";
  // The stylesheet's window, inline, so the test needs no css/system.
  Object.assign(roll.style, {
    display: "inline-grid",
    gridTemplateColumns: "max-content",
    overflow: "hidden",
    blockSize: "1lh",
  });
  roll.textContent = words;
  b.append(rest, busy, done, roll);
  parent.append(b);
  return b;
}

function confirm(b: HTMLButtonElement, more: Partial<ConfirmOptions> = {}) {
  return enhanceConfirm(b, { busy: "Saving…", done: "Saved", ...QUICK, ...more });
}

const words = (b: HTMLButtonElement) => rollText(b.querySelector(".cp-roll") as HTMLElement);

describe("enhanceConfirm", () => {
  it("shows busy while slow work runs, then done, then rest by itself", async () => {
    const b = button();
    const c = confirm(b);
    const work = Promise.withResolvers<undefined>();
    const finish = () => {
      work.resolve(undefined);
    };
    const run = c.run(() => work.promise);
    await sleep(40);
    expect(b.dataset["cpState"]).toBe("busy");
    expect(b.getAttribute("aria-busy")).toBe("true");
    expect(words(b)).toBe("Saving…");
    finish();
    await expect(run).resolves.toBe(true);
    expect(b.dataset["cpState"]).toBe("done");
    expect(b.hasAttribute("aria-busy")).toBe(false);
    expect(words(b)).toBe("Saved");
    await sleep(QUICK.hold + 20);
    expect(b.hasAttribute("data-cp-state")).toBe(false);
    expect(words(b)).toBe("Save changes");
  });

  it("goes straight to done when the work ends before the busy delay", async () => {
    const b = button();
    const seen: (string | null)[] = [];
    new MutationObserver(() => seen.push(b.getAttribute("aria-busy"))).observe(b, {
      attributes: true,
      attributeFilter: ["aria-busy"],
    });
    await confirm(b).run(() => Promise.resolve());
    await sleep(0);
    expect(seen).toEqual([]);
    expect(b.dataset["cpState"]).toBe("done");
  });

  it("keeps a busy state that showed for at least busyMin", async () => {
    const b = button();
    const run = confirm(b).run(() => sleep(30));
    await sleep(25);
    const shown = performance.now();
    expect(b.dataset["cpState"]).toBe("busy");
    await run;
    expect(performance.now() - shown).toBeGreaterThanOrEqual(QUICK.busyMin - 25);
  });

  it("ignores a second run while a cycle is running and never calls its work", async () => {
    const b = button();
    const c = confirm(b);
    const first = c.run(() => sleep(10));
    let called = false;
    await expect(
      c.run(() => {
        called = true;
        return Promise.resolve();
      }),
    ).resolves.toBe(false);
    await first;
    await expect(c.run(() => Promise.resolve())).resolves.toBe(false);
    expect(called).toBe(false);
  });

  it("returns to rest at once and passes the rejection through when the work fails", async () => {
    const b = button();
    const c = confirm(b);
    const boom = new Error("Sonarr did not answer");
    await expect(c.run(() => sleep(40).then(() => Promise.reject(boom)))).rejects.toBe(boom);
    expect(b.hasAttribute("data-cp-state")).toBe(false);
    expect(b.hasAttribute("aria-busy")).toBe(false);
    expect(words(b)).toBe("Save changes");
    await expect(c.run(() => Promise.resolve())).resolves.toBe(true);
  });

  it("returns to the words on the button at the press, such as a count that changed", async () => {
    const b = button("Grab 2");
    const c = confirm(b, { busy: "Grabbing…", done: "Grabbed" });
    (b.querySelector(".cp-roll") as HTMLElement).textContent = "Grab 3";
    await c.run(() => Promise.resolve());
    await sleep(QUICK.hold + 20);
    expect(words(b)).toBe("Grab 3");
  });

  it("holds the widest word's footprint in a table's actions cell", async () => {
    const cell = document.createElement("td");
    cell.dataset["col"] = "actions";
    document.body.append(cell);
    const b = button("Grab", cell);
    const c = confirm(b, { busy: "Grabbing…", done: "Grabbed" });
    expect(b.dataset["cpConfirm"]).toBe("footprint");
    const footprint = () =>
      (b.querySelector(".cp-roll") as HTMLElement).getBoundingClientRect().width +
      Number.parseFloat(b.style.marginInlineEnd);
    await sleep(400);
    const atRest = footprint();
    expect(Number.parseFloat(b.style.marginInlineEnd)).toBeGreaterThan(0);
    await c.run(() => Promise.resolve());
    await sleep(400);
    expect(footprint()).toBeCloseTo(atRest, 0);
  });

  it("holds the widest word's width in a split button", () => {
    const split = document.createElement("div");
    split.className = "cp-split";
    document.body.append(split);
    const b = button("Grab the best", split);
    confirm(b, { busy: "Grabbing…", done: "Grabbed" });
    expect(b.dataset["cpConfirm"]).toBe("fixed");
    const roll = b.querySelector(".cp-roll") as HTMLElement;
    expect(Number.parseFloat(roll.style.minInlineSize)).toBeGreaterThan(0);
  });

  it("glides elsewhere, and takes the width mode it is given", () => {
    expect(button().dataset["cpConfirm"]).toBeUndefined();
    const b = button();
    confirm(b);
    expect(b.dataset["cpConfirm"]).toBe("glide");
    const f = button();
    confirm(f, { width: "fixed" });
    expect(f.dataset["cpConfirm"]).toBe("fixed");
  });

  it("puts the button back at rest when its signal aborts mid-cycle", async () => {
    const life = new AbortController();
    const b = button();
    const c = confirm(b, { signal: life.signal });
    const run = c.run(() => sleep(200));
    await sleep(40);
    expect(b.dataset["cpState"]).toBe("busy");
    life.abort();
    expect(b.hasAttribute("data-cp-state")).toBe(false);
    expect(b.hasAttribute("aria-busy")).toBe(false);
    await expect(run, "never shows done once aborted").resolves.toBe(false);
    expect(b.hasAttribute("data-cp-state")).toBe(false);
    await expect(c.run(() => Promise.resolve())).resolves.toBe(false);
  });

  it("throws a TypeError without its words", () => {
    const b = document.createElement("button");
    expect(() => enhanceConfirm(b, { busy: "Saving…", done: "Saved" })).toThrow(TypeError);
  });
});
