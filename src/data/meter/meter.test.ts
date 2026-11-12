import { afterEach, describe, expect, it } from "vitest";

import { enhanceMeter } from "./meter.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

function meter(bar: string, lang = "en"): HTMLElement {
  const box = document.createElement("div");
  box.className = "cp-meter";
  box.lang = lang;
  // Static test markup, never caller text.
  box.setHTMLUnsafe(`<div data-part="bar">${bar}</div><small data-part="words">words</small>`);
  document.body.append(box);
  return box;
}

const meters = (box: HTMLElement) => [...box.querySelectorAll("meter")];
const marks = (box: HTMLElement) => [
  ...box.querySelectorAll<HTMLElement>('[data-part="marks"] > span'),
];
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const STORE = '<meter min="0" max="500" low="400" high="450" optimum="0" value="300"></meter>';

describe("enhanceMeter", () => {
  it("grows each meter by its range", () => {
    const box = meter(
      '<meter max="12" value="12"></meter><meter max="6" value="3"></meter><meter min="10" max="14" value="11"></meter>',
    );
    enhanceMeter(box, { signal: life.signal });
    expect(meters(box).map((m) => m.style.flexGrow)).toEqual(["12", "6", "4"]);
  });

  it("levels a low optimum as HTML's algorithm does, the host at its worst", async () => {
    const box = meter(STORE);
    enhanceMeter(box, { signal: life.signal });
    const [m] = meters(box) as [HTMLMeterElement];
    const level = async (value: number) => {
      m.setAttribute("value", String(value));
      await settle();
      return [m.dataset["cpLevel"], box.dataset["cpLevel"]];
    };
    expect(m.dataset["cpLevel"]).toBe("optimum");
    expect(await level(420)).toEqual(["suboptimum", "suboptimum"]);
    expect(await level(400)).toEqual(["suboptimum", "suboptimum"]);
    expect(await level(450)).toEqual(["suboptimum", "suboptimum"]);
    expect(await level(451)).toEqual(["even-less-good", "even-less-good"]);
    expect(await level(399)).toEqual(["optimum", "optimum"]);
  });

  it("levels a high optimum and a middle one, and takes the worst of several", () => {
    const box = meter(
      '<meter max="100" low="20" high="50" optimum="90" value="30"></meter>' +
        '<meter max="100" low="20" high="50" optimum="90" value="10"></meter>' +
        '<meter max="100" low="20" high="50" optimum="90" value="50"></meter>' +
        '<meter max="100" low="20" high="50" optimum="90" value="20"></meter>' +
        '<meter max="100" low="20" high="80" value="10"></meter>' +
        '<meter max="100" low="20" high="80" value="50"></meter>' +
        '<meter max="12" value="3"></meter>',
    );
    enhanceMeter(box, { signal: life.signal });
    expect(meters(box).map((m) => m.dataset["cpLevel"])).toEqual([
      "suboptimum",
      "even-less-good",
      "suboptimum",
      "suboptimum",
      "suboptimum",
      "optimum",
      "optimum",
    ]);
    expect(box.dataset["cpLevel"]).toBe("even-less-good");
  });

  it("marks low and high in the page's language, after the gaps before them", () => {
    const box = meter(STORE, "fr");
    enhanceMeter(box, { signal: life.signal });
    const holder = box.querySelector('[data-part="marks"]') as HTMLElement;
    expect(holder.previousElementSibling?.getAttribute("data-part")).toBe("bar");
    expect(holder.getAttribute("aria-hidden")).toBe("true");
    expect(marks(box).map((m) => m.textContent)).toEqual(["80\u00A0%", "90\u00A0%"]);
    expect(marks(box).map((m) => m.style.insetInlineStart)).toEqual([
      "calc((100% - 0 * var(--cp-meter-gap)) * 0.8 + 0 * var(--cp-meter-gap))",
      "calc((100% - 0 * var(--cp-meter-gap)) * 0.9 + 0 * var(--cp-meter-gap))",
    ]);
    const two = meter(
      '<meter max="10" value="1"></meter><meter max="30" low="15" value="1"></meter>',
    );
    enhanceMeter(two, { signal: life.signal });
    expect(marks(two).map((m) => [m.textContent, m.style.insetInlineStart])).toEqual([
      ["50%", "calc((100% - 1 * var(--cp-meter-gap)) * 0.625 + 1 * var(--cp-meter-gap))"],
    ]);
  });

  it("draws no mark at the ends or twice at one point, and hides an empty row", () => {
    const box = meter(
      '<meter max="10" low="0" high="10" value="2"></meter><meter max="10" low="5" high="5" value="2"></meter>',
    );
    enhanceMeter(box, { signal: life.signal });
    expect(marks(box).map((m) => m.textContent)).toEqual(["50%"]);
    const bare = meter('<meter max="10" value="2"></meter>');
    enhanceMeter(bare, { signal: life.signal });
    expect((bare.querySelector('[data-part="marks"]') as HTMLElement).hidden).toBe(true);
  });

  it("follows a change to a bound and a meter added later", async () => {
    const box = meter(STORE);
    enhanceMeter(box, { signal: life.signal });
    const [m] = meters(box) as [HTMLMeterElement];
    m.setAttribute("high", "475");
    await settle();
    expect(marks(box).map((x) => x.textContent)).toEqual(["80%", "95%"]);
    box
      .querySelector('[data-part="bar"]')
      ?.append(Object.assign(document.createElement("meter"), { max: 1000, value: 2 }));
    await settle();
    expect(meters(box).map((x) => x.style.flexGrow)).toEqual(["500", "1000"]);
    expect(marks(box)[0]?.style.insetInlineStart).toContain("1 * var(--cp-meter-gap)) * 0.2666");
  });

  it("does nothing without a bar or with a signal already aborted", () => {
    const box = meter(STORE);
    life.abort();
    enhanceMeter(box, { signal: life.signal });
    expect(box.querySelector('[data-part="marks"]')).toBeNull();
    const none = document.createElement("div");
    enhanceMeter(none);
    expect(none.childElementCount).toBe(0);
  });

  it("puts the meters back and stops following them on abort", async () => {
    const box = meter(STORE);
    enhanceMeter(box, { signal: life.signal });
    life.abort();
    const [m] = meters(box) as [HTMLMeterElement];
    expect(box.querySelector('[data-part="marks"]')).toBeNull();
    expect(box.dataset["cpLevel"]).toBeUndefined();
    expect(m.dataset["cpLevel"]).toBeUndefined();
    expect(m.getAttribute("style")).toBe("");
    m.setAttribute("value", "460");
    await settle();
    expect(m.dataset["cpLevel"]).toBeUndefined();
  });
});
