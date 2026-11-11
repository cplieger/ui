import { afterEach, describe, expect, it } from "vitest";

import { enhanceRankedBars } from "./ranked-bars.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

function table(rows: string): HTMLTableElement {
  const el = document.createElement("table");
  // Static test markup, never caller text.
  el.setHTMLUnsafe(
    `<thead><tr><th>Name</th><th data-bar>Sent</th></tr></thead><tbody>${rows}</tbody>`,
  );
  document.body.append(el);
  return el;
}

const cell = (name: string, value: string) =>
  `<td data-bar="${name}"><data value="${value}">${value}</data></td>`;
const fills = (el: HTMLTableElement) =>
  [...el.querySelectorAll('[data-bar] > [data-part="bar"]')].map(
    (bar) => (bar.firstElementChild as HTMLElement | null)?.style.inlineSize ?? "",
  );
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("enhanceRankedBars", () => {
  it("sizes each bar against its column's largest value", () => {
    const el = table(
      `<tr><th>a</th>${cell("", "40")}${cell("", "5")}</tr>` +
        `<tr><th>b</th>${cell("", "10")}${cell("", "20")}</tr>`,
    );
    enhanceRankedBars(el, { signal: life.signal });
    expect(fills(el)).toEqual(["100%", "25%", "25%", "100%"]);
  });

  it("shares one largest value among the cells of one name", () => {
    const el = table(
      `<tr><th>a</th>${cell("posts", "40")}${cell("posts", "10")}</tr>` +
        `<tr><th>b</th>${cell("posts", "20")}${cell("posts", "30")}</tr>`,
    );
    enhanceRankedBars(el, { signal: life.signal });
    expect(fills(el)).toEqual(["100%", "25%", "50%", "75%"]);
  });

  it("puts one aria-hidden bar after the number, and none in the head", () => {
    const el = table(`<tr><th>a</th>${cell("", "3")}</tr>`);
    enhanceRankedBars(el, { signal: life.signal });
    const td = el.querySelector("td") as HTMLElement;
    expect([...td.children].map((c) => c.localName)).toEqual(["data", "span"]);
    expect(td.lastElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(el.tHead?.querySelector('[data-part="bar"]')).toBeNull();
  });

  it("draws no fill for 0, a negative or a missing number, or a column of zeros", () => {
    const el = table(
      `<tr><th>a</th>${cell("", "8")}${cell("z", "0")}</tr>` +
        `<tr><th>b</th>${cell("", "0")}${cell("z", "0")}</tr>` +
        `<tr><th>c</th>${cell("", "-2")}<td></td></tr>` +
        `<tr><th>d</th>${cell("", "")}<td></td></tr>` +
        `<tr><th>e</th>${cell("", "many")}<td></td></tr>`,
    );
    enhanceRankedBars(el, { signal: life.signal });
    expect(fills(el)).toEqual(["100%", "", "", "", "", "", ""]);
    expect(el.querySelectorAll('[data-part="bar"]')).toHaveLength(7);
  });

  it("leaves a cell without data-bar or without a <data> alone", () => {
    const el = table(`<tr><th>a</th><td><data value="4">4</data></td><td data-bar>4</td></tr>`);
    enhanceRankedBars(el, { signal: life.signal });
    expect(el.querySelector('[data-part="bar"]')).toBeNull();
  });

  it("follows a changed value and an added row", async () => {
    const el = table(`<tr><th>a</th>${cell("", "40")}</tr><tr><th>b</th>${cell("", "10")}</tr>`);
    enhanceRankedBars(el, { signal: life.signal });
    const top = el.querySelector("data") as HTMLDataElement;
    top.value = "20";
    await settle();
    expect(fills(el)).toEqual(["100%", "50%"]);
    el.tBodies[0]?.insertAdjacentHTML("beforeend", `<tr><th>c</th>${cell("", "80")}</tr>`);
    await settle();
    expect(fills(el)).toEqual(["25%", "12.5%", "100%"]);
    expect(el.querySelectorAll('[data-part="bar"]')).toHaveLength(3);
  });

  it("removes its bars and stops following when the signal aborts", async () => {
    const el = table(`<tr><th>a</th>${cell("", "40")}</tr>`);
    enhanceRankedBars(el, { signal: life.signal });
    life.abort();
    expect(el.querySelector('[data-part="bar"]')).toBeNull();
    (el.querySelector("data") as HTMLDataElement).value = "4";
    await settle();
    expect(el.querySelector('[data-part="bar"]')).toBeNull();
  });

  it("does nothing under a signal already aborted", () => {
    const el = table(`<tr><th>a</th>${cell("", "40")}</tr>`);
    life.abort();
    enhanceRankedBars(el, { signal: life.signal });
    expect(el.querySelector('[data-part="bar"]')).toBeNull();
  });
});
