import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { enhanceShareBar } from "./share-bar.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

const ROWS =
  '<tr data-series="1"><th scope="row"><a href="/library?verdict=best" id="best" data-route="library"><span class="cp-icon" aria-hidden="true"></span>On the best</a></th><td><data value="402">402</data></td></tr>' +
  '<tr data-series="2"><th scope="row"><a href="/library?verdict=unlisted">Not listed</a></th><td><data value="58">58</data></td></tr>' +
  '<tr data-tone="warning"><th scope="row">Withheld</th><td><data value="9">9</data></td></tr>' +
  '<tr data-series="4"><th scope="row">No file</th><td><data value="0">0</data></td></tr>';

function share(
  rows = ROWS,
  lang = "en",
): {
  box: HTMLElement;
  table: HTMLTableElement;
  toggle: HTMLButtonElement;
} {
  const box = document.createElement("div");
  box.lang = lang;
  // Static test markup, never caller text.
  box.setHTMLUnsafe(
    '<button type="button" aria-pressed="false" hidden>Table view</button>' +
      '<div class="cp-share"><div class="wrap"><table><thead><tr><th>Verdict</th><th>Copies</th></tr></thead>' +
      `<tbody>${rows}</tbody></table></div></div>`,
  );
  document.body.append(box);
  return {
    box: box.querySelector(".cp-share") as HTMLElement,
    table: box.querySelector("table") as HTMLTableElement,
    toggle: box.querySelector("button") as HTMLButtonElement,
  };
}

const segments = (box: HTMLElement) => [
  ...box.querySelectorAll<HTMLElement>(".cp-share-bar > span"),
];
const chips = (box: HTMLElement) => [
  ...box.querySelectorAll<HTMLElement>(".cp-share-legend .cp-chip"),
];

describe("enhanceShareBar", () => {
  it("draws one segment per part above zero, grown by its count, in its row's colour", () => {
    const { box } = share();
    enhanceShareBar(box, { signal: life.signal });
    const bar = box.querySelector(".cp-share-bar") as HTMLElement;
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    expect(bar.nextElementSibling?.className).toBe("cp-share-legend");
    expect(segments(box).map((s) => s.style.flexGrow)).toEqual(["402", "58", "9"]);
    expect(segments(box).map((s) => s.dataset["series"] ?? s.dataset["tone"])).toEqual([
      "1",
      "2",
      "warning",
    ]);
  });

  // 402, 58 and 9 of 469.
  it("gives each segment a tip with its words, its count and its share, which a tap toggles", () => {
    const { box } = share();
    enhanceShareBar(box, { signal: life.signal });
    expect(segments(box).map((s) => s.dataset["cpTip"])).toEqual([
      "On the best: 402, 86%",
      "Not listed: 58, 12%",
      "Withheld: 9, 1.9%",
    ]);
    expect(segments(box).every((s) => s.hasAttribute("data-cp-tip-toggle"))).toBe(true);
  });

  it("writes the share in the language of the page around it", () => {
    const { box } = share(ROWS, "fr");
    enhanceShareBar(box, { signal: life.signal });
    // French sets a no-break space before the sign, which engines' locale data
    // write as U+00A0 or U+202F.
    expect(segments(box)[0]?.dataset["cpTip"]).toMatch(/^On the best: 402, 86[\u00a0\u202f]%$/);
  });

  it("makes a legend chip per part, a link where its row's label is one", () => {
    const { box, table } = share();
    enhanceShareBar(box, { signal: life.signal });
    const [best, unlisted, withheld, none] = chips(box);
    expect(best?.localName).toBe("a");
    expect(best?.getAttribute("href")).toBe("/library?verdict=best");
    expect(best?.dataset["route"]).toBe("library");
    expect(best?.id).toBe("");
    expect(best?.dataset["series"]).toBe("1");
    expect(best?.firstElementChild?.className).toBe("cp-swatch");
    expect(best?.textContent).toBe("On the best 402, 86%");
    expect(best?.querySelector(":scope > .cp-icon")).not.toBeNull();
    expect(best?.querySelector("data")?.value).toBe("402");
    expect(unlisted?.localName).toBe("a");
    expect([withheld?.localName, withheld?.dataset["tone"]]).toEqual(["span", "warning"]);
    expect(none?.textContent).toBe("No file 0, 0%");
    // The legend holds copies; the table keeps its own nodes.
    expect(table.querySelector("#best")).not.toBeNull();
    expect(table.querySelectorAll("data")).toHaveLength(4);
  });

  it("leaves out a row whose count is missing, empty, negative or not a number", () => {
    const { box } = share(
      '<tr><th>Kept</th><td><data value="3">3</data></td></tr>' +
        "<tr><th>No data</th><td>4</td></tr>" +
        '<tr><th>Empty</th><td><data value="">?</data></td></tr>' +
        '<tr><th>Negative</th><td><data value="-1">-1</data></td></tr>' +
        '<tr><th>Not a number</th><td><data value="lots">lots</data></td></tr>' +
        '<tr><th>Endless</th><td><data value="Infinity">∞</data></td></tr>',
    );
    enhanceShareBar(box, { signal: life.signal });
    expect(chips(box).map((c) => c.textContent)).toEqual(["Kept 3, 100%"]);
    expect(segments(box)).toHaveLength(1);
  });

  it("draws no segment for a whole of zero, and keeps its legend", () => {
    const { box } = share('<tr><th>None</th><td><data value="0">0</data></td></tr>');
    enhanceShareBar(box, { signal: life.signal });
    expect(segments(box)).toHaveLength(0);
    const [chip] = chips(box);
    expect(chip?.textContent).toBe("None 0");
    expect(chip?.hasAttribute("data-cp-tip")).toBe(false);
  });

  it("says each part's share in its chip, in the page's language, and shows its tip on focus", () => {
    const { box } = share(ROWS, "fr");
    enhanceShareBar(box, { signal: life.signal });
    const [best, , withheld] = chips(box) as [HTMLElement, HTMLElement, HTMLElement];
    const words = best.querySelector(":scope > .cp-visually-hidden");
    expect(words?.textContent).toMatch(/^, 86[\u00a0\u202f]%$/);
    expect(best.lastElementChild).toBe(words);
    expect(best.dataset["cpTip"]).toBe(segments(box)[0]?.dataset["cpTip"]);
    // A tap on a link follows it; a plain chip's tap shows its tip.
    expect(best.hasAttribute("data-cp-tip-toggle")).toBe(false);
    expect(withheld.hasAttribute("data-cp-tip-toggle")).toBe(true);
    best.focus({ focusVisible: true });
    const tip = document.querySelector(".cp-tooltip") as HTMLElement;
    expect(tip.matches(":popover-open")).toBe(true);
    expect(tip.textContent).toBe(best.dataset["cpTip"]);
    // The chip's own words already say what its tip says.
    expect(best.hasAttribute("aria-describedby")).toBe(false);
  });

  it("toggles a plain chip's tip with a tap", () => {
    const { box } = share();
    enhanceShareBar(box, { signal: life.signal });
    const withheld = chips(box)[2] as HTMLElement;
    const tap = () => {
      withheld.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, composed: true, pointerType: "touch" }),
      );
    };
    const tip = () => document.querySelector(".cp-tooltip") as HTMLElement;
    tap();
    expect(tip().matches(":popover-open")).toBe(true);
    expect(tip().textContent).toBe("Withheld: 9, 1.9%");
    tap();
    expect(tip().matches(":popover-open")).toBe(false);
  });

  it("keeps a showing tip anchored to its chip through a redraw, with the new words", async () => {
    const { box, table } = share();
    enhanceShareBar(box, { signal: life.signal });
    const best = chips(box)[0] as HTMLElement;
    best.focus({ focusVisible: true });
    const tip = document.querySelector(".cp-tooltip") as HTMLElement;
    const count = table.querySelector("data") as HTMLDataElement;
    count.value = "500";
    count.textContent = "500";
    await expect.poll(() => tip.textContent).toBe("On the best: 500, 88%");
    expect(chips(box)[0]).toBe(best);
    expect(best.style.getPropertyValue("anchor-name")).toContain("--cp-tip-anchor");
    expect(tip.matches(":popover-open")).toBe(true);
  });

  it("never writes a part with a count as 0%", () => {
    const { box } = share(
      '<tr><th>Most</th><td><data value="10000">10000</data></td></tr>' +
        '<tr><th>One</th><td><data value="1">1</data></td></tr>',
    );
    enhanceShareBar(box, { signal: life.signal });
    expect(segments(box)[1]?.dataset["cpTip"]).toBe("One: 1, 0.01%");
    expect(chips(box)[1]?.textContent).toBe("One 1, 0.01%");
  });

  it("never writes a part short of the whole as 100%", () => {
    const { box } = share(
      '<tr><th>Most</th><td><data value="199">199</data></td></tr>' +
        '<tr><th>One</th><td><data value="1">1</data></td></tr>',
    );
    enhanceShareBar(box, { signal: life.signal });
    expect(segments(box).map((s) => s.dataset["cpTip"])).toEqual([
      "Most: 199, 99.5%",
      "One: 1, 0.5%",
    ]);
    expect(chips(box)[0]?.textContent).toBe("Most 199, 99.5%");
  });

  it("leaves each id of the table on the table's own node", () => {
    const { box, table } = share(
      '<tr><th><a href="/a" id="row-link"><span id="glyph"></span>Glyph</a></th><td><data id="count" value="3">3</data></td></tr>',
    );
    enhanceShareBar(box, { signal: life.signal });
    for (const id of ["row-link", "glyph", "count"]) {
      expect(document.querySelectorAll(`#${id}`)).toHaveLength(1);
      expect(table.contains(document.getElementById(id))).toBe(true);
    }
    expect(chips(box)[0]?.textContent).toBe("Glyph 3, 100%");
  });

  it("switches to the table and back by the toggle, which it shows", async () => {
    const { box, toggle } = share();
    const view = box.querySelector(".wrap") as HTMLElement;
    enhanceShareBar(box, { toggle, signal: life.signal });
    const parts = () => [
      (box.querySelector(".cp-share-bar") as HTMLElement).hidden,
      (box.querySelector(".cp-share-legend") as HTMLElement).hidden,
      view.hidden,
    ];
    expect(toggle.hidden).toBe(false);
    expect(parts()).toEqual([false, false, true]);
    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(parts()).toEqual([true, true, false]);
    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(parts()).toEqual([false, false, true]);
  });

  it("starts on the table when the toggle starts pressed", () => {
    const { box, toggle } = share();
    toggle.setAttribute("aria-pressed", "true");
    enhanceShareBar(box, { toggle, signal: life.signal });
    expect((box.querySelector(".wrap") as HTMLElement).hidden).toBe(false);
    expect((box.querySelector(".cp-share-bar") as HTMLElement).hidden).toBe(true);
  });

  it("follows a change to the table, keeping the focused chip and the segments in place", async () => {
    const { box, table } = share();
    enhanceShareBar(box, { signal: life.signal });
    const [seg] = segments(box);
    const [chip] = chips(box);
    chip?.focus();
    const count = table.querySelector("data") as HTMLDataElement;
    count.value = "500";
    count.textContent = "500";
    await expect.poll(() => segments(box)[0]?.style.flexGrow).toBe("500");
    expect(segments(box)[0]).toBe(seg);
    expect(chips(box)[0]).toBe(chip);
    expect(document.activeElement).toBe(chip);
    expect(chip?.textContent).toBe("On the best 500, 88%");
    expect(seg?.dataset["cpTip"]).toBe("On the best: 500, 88%");

    const link = table.querySelector("a") as HTMLAnchorElement;
    link.setAttribute("aria-current", "page");
    await expect.poll(() => chips(box)[0]?.getAttribute("aria-current")).toBe("page");
    link.replaceWith(...link.childNodes);
    await expect.poll(() => chips(box)[0]?.localName).toBe("span");
    (table.tBodies[0]?.rows[1] as HTMLTableRowElement).dataset["series"] = "7";
    await expect.poll(() => segments(box)[1]?.dataset["series"]).toBe("7");
    table.tBodies[0]?.rows[0]?.remove();
    await expect.poll(() => chips(box)).toHaveLength(3);
    expect(segments(box)).toHaveLength(2);
  });

  it("puts the page's markup back, the table shown and the toggle hidden, when its signal aborts", async () => {
    const { box, table, toggle } = share();
    enhanceShareBar(box, { toggle, signal: life.signal });
    life.abort();
    expect(box.querySelector(".cp-share-bar, .cp-share-legend")).toBeNull();
    expect((box.querySelector(".wrap") as HTMLElement).hidden).toBe(false);
    expect(toggle.hidden).toBe(true);
    toggle.hidden = false;
    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    (table.querySelector("data") as HTMLDataElement).value = "1";
    await new Promise((r) => setTimeout(r, 0));
    expect(box.querySelector(".cp-share-bar")).toBeNull();
  });

  it("does nothing with no table, or with a signal already aborted", () => {
    const empty = document.createElement("div");
    document.body.append(empty);
    enhanceShareBar(empty);
    expect(empty.childElementCount).toBe(0);
    const { box } = share();
    const gone = new AbortController();
    gone.abort();
    enhanceShareBar(box, { signal: gone.signal });
    expect(box.querySelector(".cp-share-bar")).toBeNull();
  });
});
