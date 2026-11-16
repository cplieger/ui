import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { enhanceSettings } from "./settings.js";

const frame = (): Promise<unknown> => new Promise(requestAnimationFrame);
const task = (): Promise<void> => new Promise((r) => setTimeout(r));

const NAMES = ["Connections", "Checks", "Display", "Logs"] as const;
const IDS = ["s-con", "s-chk", "s-dis", "s-log"] as const;

const rows = (keep: readonly number[]): string =>
  keep
    .map(
      (i) =>
        `<li><a class="cp-list-row" href="#${IDS[i] ?? ""}"><span class="cp-cell-stack">${NAMES[i] ?? ""}</span></a></li>`,
    )
    .join("");

type Move =
  | { readonly kind: "press"; readonly at: number }
  | { readonly kind: "scroll"; readonly to: number }
  | { readonly kind: "input"; readonly type: "wheel" | "keydown" | "pointerdown" }
  | { readonly kind: "box"; readonly to: number }
  | { readonly kind: "pane"; readonly to: number }
  | { readonly kind: "render"; readonly drop: number | null }
  | { readonly kind: "update" }
  | { readonly kind: "wait"; readonly for: "frame" | "task" | "scrollend" }
  | { readonly kind: "glide"; readonly frames: number };

const move: fc.Arbitrary<Move> = fc.oneof(
  {
    arbitrary: fc.record({ kind: fc.constant("press"), at: fc.integer({ min: 0, max: 3 }) }),
    weight: 3,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant("scroll"),
      to: fc.double({ min: 0, max: 1, noNaN: true }),
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant("input"),
      type: fc.constantFrom("wheel", "keydown", "pointerdown"),
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({ kind: fc.constant("box"), to: fc.integer({ min: 0, max: 60 }) }),
    weight: 1,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant("pane"),
      to: fc.double({ min: 0, max: 1, noNaN: true }),
    }),
    weight: 1,
  },
  // Connections stays, so the top of the page always has a category in view.
  {
    arbitrary: fc.record({ kind: fc.constant("render"), drop: fc.constantFrom(null, 1, 2, 3) }),
    weight: 2,
  },
  { arbitrary: fc.record({ kind: fc.constant("update") }), weight: 1 },
  {
    arbitrary: fc.record({
      kind: fc.constant("wait"),
      for: fc.constantFrom("frame", "task", "scrollend"),
    }),
    weight: 3,
  },
  // Waits into a glide, so the next move can meet it under way.
  {
    arbitrary: fc.record({ kind: fc.constant("glide"), frames: fc.integer({ min: 1, max: 20 }) }),
    weight: 2,
  },
);

/** The page around the categories, its smooth scrolling and its
 *  scroll-padding-top. `box` puts them in a box that scrolls in a page that
 *  scrolls too, in their own tree or slotted into a shadow root's; `short`
 *  makes Checks too short to reach the band; `tail` adds Logs, a tall
 *  category below Display, so a jump to it glides past Checks. */
interface Setup {
  readonly box: "none" | "light" | "shadow";
  readonly smooth: "none" | "root" | "both";
  readonly padding: "auto" | "48px" | "10%" | "calc(10% + 8px)";
  readonly short: boolean;
  readonly tail: boolean;
}

const setup: fc.Arbitrary<Setup> = fc.record({
  box: fc.constantFrom("none", "light", "shadow"),
  smooth: fc.constantFrom("none", "root", "both"),
  padding: fc.constantFrom("auto", "48px", "10%", "calc(10% + 8px)"),
  short: fc.boolean(),
  tail: fc.boolean(),
});

/** A custom element whose shadow root scrolls what is slotted into it. */
class Pane extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML =
      '<div style="block-size: 80vh; overflow-y: auto"><slot></slot></div>';
  }
}
customElements.define("settings-property-pane", Pane);

/** Waits until the page and `pane` have stopped scrolling for three frames. */
async function still(pane: Element | null = null): Promise<void> {
  const at = (): string => `${String(scrollY)} ${String(pane?.scrollTop ?? 0)}`;
  for (let y = "", quiet = 0; quiet < 3;) {
    await frame();
    quiet = at() === y ? quiet + 1 : 0;
    y = at();
  }
  await task();
}

/** The first link whose section is in the band the docs name, 20% to 40%
 *  of the window, by the platform's own intersection. */
function inView(links: readonly HTMLAnchorElement[]): Promise<HTMLAnchorElement | null> {
  return new Promise((resolve) => {
    const probe = new IntersectionObserver(
      (entries) => {
        probe.disconnect();
        const hit = new Set(entries.filter((e) => e.isIntersecting).map((e) => e.target));
        resolve(
          links.find((l) => hit.has(document.getElementById(l.hash.slice(1)) as Element)) ?? null,
        );
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    for (const link of links) {
      const section = document.getElementById(link.hash.slice(1));
      if (section !== null) {
        probe.observe(section);
      }
    }
  });
}

async function run(page: Setup, moves: readonly Move[]): Promise<void> {
  const life = new AbortController();
  const host = document.createElement("div");
  const nested = page.box !== "none";
  const pane = page.box === "light" ? ' style="block-size: 80vh; overflow-y: auto"' : "";
  const checks = page.short ? "block-size: 40px" : "min-block-size: 120vh";
  const all = page.tail ? [0, 1, 2, 3] : [0, 1, 2];
  host.innerHTML =
    (nested ? '<header style="block-size: 10vh"></header>' : "") +
    (page.box === "shadow" ? "<settings-property-pane>" : "") +
    `<div class="cp-settings"${pane}><nav class="cp-settings-nav" aria-label="Settings"><ul class="cp-list">` +
    rows(all) +
    "</ul></nav><form>" +
    '<section id="s-con" style="min-block-size: 120vh"><h2>Connections</h2><input></section>' +
    `<section id="s-chk" style="${checks}"><h2>Checks</h2><input></section>` +
    '<section id="s-dis"><h2>Display</h2><textarea rows="2">1\n2\n3\n4\n5\n6\n7\n8</textarea></section>' +
    (page.tail ? '<section id="s-log" style="block-size: 150vh"><h2>Logs</h2></section>' : "") +
    "</form></div>" +
    (page.box === "shadow" ? "</settings-property-pane>" : "") +
    (nested ? '<footer style="block-size: 100vh"></footer>' : "");
  document.body.append(host);
  const nav = host.querySelector("nav") as HTMLElement;
  const ul = host.querySelector("ul") as HTMLElement;
  const box = host.querySelector("textarea") as HTMLTextAreaElement;
  const scroller =
    page.box === "light"
      ? (host.querySelector(".cp-settings") as HTMLElement)
      : page.box === "shadow"
        ? (host.querySelector("settings-property-pane")?.shadowRoot
            ?.firstElementChild as HTMLElement)
        : null;
  const live = (): HTMLAnchorElement[] => [
    ...nav.querySelectorAll<HTMLAnchorElement>("a.cp-list-row"),
  ];
  const end = (): number => document.documentElement.scrollHeight - innerHeight;
  const root = document.documentElement.style;
  root.scrollBehavior = page.smooth === "none" ? "" : "smooth";
  root.scrollPaddingTop = page.padding === "auto" ? "" : page.padding;
  if (scroller !== null && page.smooth === "both") {
    scroller.style.scrollBehavior = "smooth";
  }
  const s = enhanceSettings(host.querySelector("form") as HTMLFormElement, { signal: life.signal });
  let pressed = null as string | null;
  // Whether nothing since the last press could end its hold: only waits,
  // inputs, a box's own scroll, and updates that keep its link.
  let holding = false;
  try {
    for (const m of moves) {
      switch (m.kind) {
        case "press": {
          const link = live()[m.at];
          if (link !== undefined) {
            pressed = link.href;
            holding = true;
            link.click();
          }
          break;
        }
        case "scroll":
          holding = false;
          scrollTo(0, Math.round(m.to * end()));
          break;
        case "pane":
          if (scroller !== null) {
            holding = false;
            scroller.scrollTop = Math.round(m.to * (scroller.scrollHeight - scroller.clientHeight));
          }
          break;
        case "input":
          dispatchEvent(
            m.type === "keydown" ? new KeyboardEvent("keydown", { key: "Tab" }) : new Event(m.type),
          );
          break;
        case "box":
          box.scrollTop = m.to;
          break;
        case "render":
          if (m.drop !== null && pressed?.endsWith(`#${IDS[m.drop] ?? ""}`) === true) {
            holding = false;
          }
          ul.innerHTML = rows(all.filter((i) => i !== m.drop));
          s.update();
          break;
        case "update":
          s.update();
          break;
        case "glide":
          for (let i = 0, y = ""; i < m.frames; i++) {
            await frame();
            const now = `${String(scrollY)} ${String(scroller?.scrollTop ?? 0)}`;
            if (now === y) {
              break;
            }
            y = now;
          }
          break;
        case "wait":
          if (m.for === "frame") {
            await frame();
          } else if (m.for === "task") {
            await task();
          } else {
            await Promise.race([
              new Promise((r) => {
                document.addEventListener("scrollend", r, { once: true });
              }),
              new Promise((r) => setTimeout(r, 100)),
            ]);
          }
      }
    }
    await still(scroller);
    // Either the hold ended and the section in view is marked, or it still
    // holds the pressed category on a link in the list.
    const links = live();
    const marked = (): HTMLAnchorElement[] =>
      links.filter((l) => l.getAttribute("aria-current") === "location");
    const seen = await inView(links);
    await task();
    expect(marked().length).toBeLessThanOrEqual(1);
    if (holding) {
      expect(marked()[0]?.href).toBe(pressed);
    }
    if (seen !== null && marked()[0] !== seen) {
      expect(marked()[0]?.href).toBe(pressed);
      // A live hold ends on a pixel's scroll of the categories' scroller and
      // marks the section in view; a mark left by an ended hold stays put.
      const by = (scroller?.scrollTop ?? scrollY) > 0 ? -1 : 1;
      (scroller ?? window).scrollBy({ top: by, behavior: "instant" });
      await still(scroller);
      const now = await inView(links);
      await task();
      if (now !== null) {
        expect(marked()).toHaveLength(1);
        expect(marked()[0]).toBe(now);
      }
    }
    // A hold on a live link ends on the person's next page scroll.
    root.scrollBehavior = "";
    if (scroller !== null) {
      scroller.style.scrollBehavior = "";
      scroller.scrollTo({ top: 0, behavior: "instant" });
      await still(scroller);
    }
    dispatchEvent(new Event("wheel"));
    scrollTo({ top: end(), behavior: "instant" });
    await still();
    dispatchEvent(new Event("wheel"));
    scrollTo({ top: 0, behavior: "instant" });
    await still();
    const top = await inView(live());
    await task();
    expect(top).toBe(live()[0]);
    expect(live().map((l) => l.getAttribute("aria-current"))).toEqual(
      live().map((l) => (l === top ? "location" : null)),
    );
  } finally {
    life.abort();
    host.remove();
    root.scrollBehavior = "";
    root.scrollPaddingTop = "";
    scrollTo(0, 0);
    // The next run's press must not meet this one's late scroll events.
    await still();
  }
}

const flat: Setup = { box: "none", smooth: "none", padding: "auto", short: false, tail: false };

describe("enhanceSettings' pressed-category hold, for any order of events", () => {
  it("ends with the section in view marked, or holds a link still in the list", async () => {
    await fc.assert(
      fc.asyncProperty(setup, fc.array(move, { minLength: 1, maxLength: 8 }), run),
      // Each run scrolls a real page, and the setup's 10 s limit fails a
      // property it interrupts; stopping at 6 s keeps the runs a loaded host
      // affords and still reports a counter-example found before then. The
      // examples run first: short sections held after their jumps.
      {
        numRuns: 30,
        interruptAfterTimeLimit: 6000,
        examples: [
          [{ ...flat, smooth: "none" }, [{ kind: "press", at: 2 }]],
          [{ ...flat, smooth: "root" }, [{ kind: "press", at: 2 }]],
          [{ ...flat, padding: "10%", short: true }, [{ kind: "press", at: 1 }]],
          [{ ...flat, box: "light", smooth: "root", short: true }, [{ kind: "press", at: 1 }]],
          [{ ...flat, box: "shadow", short: true }, [{ kind: "press", at: 1 }]],
          [
            { ...flat, smooth: "root", short: true, tail: true },
            [
              { kind: "press", at: 3 },
              { kind: "glide", frames: 12 },
              { kind: "press", at: 1 },
            ],
          ],
        ],
      },
    );
  }, 60_000);
});
