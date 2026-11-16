import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { enhanceSettings } from "./settings.js";

const frame = (): Promise<unknown> => new Promise(requestAnimationFrame);
const task = (): Promise<void> => new Promise((r) => setTimeout(r));

const NAMES = ["Connections", "Checks", "Display"] as const;
const IDS = ["s-con", "s-chk", "s-dis"] as const;

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
  | { readonly kind: "render"; readonly drop: number | null }
  | { readonly kind: "update" }
  | { readonly kind: "wait"; readonly for: "frame" | "task" | "scrollend" };

const move: fc.Arbitrary<Move> = fc.oneof(
  {
    arbitrary: fc.record({ kind: fc.constant("press"), at: fc.integer({ min: 0, max: 2 }) }),
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
  // Connections stays, so the top of the page always has a category in view.
  {
    arbitrary: fc.record({ kind: fc.constant("render"), drop: fc.constantFrom(null, 1, 2) }),
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
);

/** Waits until the page has stopped scrolling for three frames. */
async function still(): Promise<void> {
  let y = Number.NaN;
  for (let quiet = 0; quiet < 3;) {
    await frame();
    quiet = scrollY === y ? quiet + 1 : 0;
    y = scrollY;
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

async function run(smooth: boolean, moves: readonly Move[]): Promise<void> {
  const life = new AbortController();
  const host = document.createElement("div");
  host.innerHTML =
    '<div class="cp-settings"><nav class="cp-settings-nav" aria-label="Settings"><ul class="cp-list">' +
    rows([0, 1, 2]) +
    "</ul></nav><form>" +
    '<section id="s-con" style="min-block-size: 120vh"><h2>Connections</h2><input></section>' +
    '<section id="s-chk" style="min-block-size: 120vh"><h2>Checks</h2><input></section>' +
    '<section id="s-dis"><h2>Display</h2><textarea rows="2">1\n2\n3\n4\n5\n6\n7\n8</textarea></section>' +
    "</form></div>";
  document.body.append(host);
  const nav = host.querySelector("nav") as HTMLElement;
  const ul = host.querySelector("ul") as HTMLElement;
  const box = host.querySelector("textarea") as HTMLTextAreaElement;
  const live = (): HTMLAnchorElement[] => [
    ...nav.querySelectorAll<HTMLAnchorElement>("a.cp-list-row"),
  ];
  const end = (): number => document.documentElement.scrollHeight - innerHeight;
  document.documentElement.style.scrollBehavior = smooth ? "smooth" : "";
  const s = enhanceSettings(host.querySelector("form") as HTMLFormElement, { signal: life.signal });
  let pressed: string | null = null;
  try {
    for (const m of moves) {
      switch (m.kind) {
        case "press": {
          const link = live()[m.at];
          if (link !== undefined) {
            pressed = link.href;
            link.click();
          }
          break;
        }
        case "scroll":
          scrollTo(0, Math.round(m.to * end()));
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
          ul.innerHTML = rows([0, 1, 2].filter((i) => i !== m.drop));
          s.update();
          break;
        case "update":
          s.update();
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
    await still();
    // Either the hold ended and the section in view is marked, or it still
    // holds the pressed category on a link in the list.
    const links = live();
    const marked = links.filter((l) => l.getAttribute("aria-current") === "location");
    const seen = await inView(links);
    await task();
    if (seen !== null) {
      expect(marked).toHaveLength(1);
      expect(marked[0] === seen || marked[0]?.href === pressed).toBe(true);
    }
    // A hold on a live link ends on the person's next page scroll.
    document.documentElement.style.scrollBehavior = "";
    dispatchEvent(new Event("wheel"));
    scrollTo(0, end());
    await still();
    dispatchEvent(new Event("wheel"));
    scrollTo(0, 0);
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
    document.documentElement.style.scrollBehavior = "";
    scrollTo(0, 0);
    // The next run's press must not meet this one's late scroll events.
    await still();
  }
}

describe("enhanceSettings' pressed-category hold, for any order of events", () => {
  it("ends with the section in view marked, or holds a link still in the list", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), fc.array(move, { minLength: 1, maxLength: 8 }), run),
      // Each run scrolls a real page, and the setup's 10 s limit fails a
      // property it interrupts; stopping at 6 s keeps the runs a loaded host
      // affords and still reports a counter-example found before then.
      { numRuns: 30, interruptAfterTimeLimit: 6000 },
    );
  }, 60_000);
});
