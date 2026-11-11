import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { enhanceDateRange } from "./date-range.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

function range(checked = "7"): {
  box: HTMLElement;
  from: HTMLInputElement;
  to: HTMLInputElement;
  radio: (v: string) => HTMLInputElement;
} {
  const box = document.createElement("fieldset");
  // Static test markup, never caller text.
  box.setHTMLUnsafe(
    ["1", "7", "all"]
      .map(
        (v) =>
          `<label><input type="radio" name="r" value="${v}"${v === checked ? " checked" : ""}>${v}</label>`,
      )
      .join("") +
      '<div class="cp-field"><input id="from" type="date" aria-label="From"></div>' +
      '<div class="cp-field"><input id="to" type="date" aria-label="To" aria-describedby="to-error"><span class="cp-field-error" id="to-error" hidden><span class="cp-icon"></span>Old words</span></div>',
  );
  document.body.append(box);
  const get = (s: string) => box.querySelector(s) as HTMLInputElement;
  return { box, from: get("#from"), to: get("#to"), radio: (v) => get(`input[value="${v}"]`) };
}

const today = () => new Date(2026, 10, 15, 0, 30);

describe("enhanceDateRange", () => {
  it("fills both dates from the checked quick range, in local days", () => {
    const { box, from, to } = range();
    enhanceDateRange(box, { today, signal: life.signal });
    expect([from.value, to.value]).toEqual(["2026-11-09", "2026-11-15"]);
  });

  it("refills on another quick range, and clears both for any time", async () => {
    const { box, from, to, radio } = range();
    enhanceDateRange(box, { today, signal: life.signal });
    await userEvent.click(radio("1"));
    expect([from.value, to.value]).toEqual(["2026-11-15", "2026-11-15"]);
    await userEvent.click(radio("all"));
    expect([from.value, to.value]).toEqual(["", ""]);
  });

  it("clears the quick range once a date changes, and marks an end before the start", () => {
    const { box, from, to, radio } = range();
    enhanceDateRange(box, { today, signal: life.signal });
    to.value = "2026-11-01";
    to.dispatchEvent(new Event("change", { bubbles: true }));
    expect(radio("7").checked).toBe(false);
    const error = document.getElementById("to-error") as HTMLElement;
    expect([to.getAttribute("aria-invalid"), error.hidden, error.textContent]).toEqual([
      "true",
      false,
      "The end comes before the start.",
    ]);
    expect(error.querySelector(".cp-icon")).not.toBeNull();
    from.value = "2026-10-01";
    from.dispatchEvent(new Event("change", { bubbles: true }));
    expect([to.hasAttribute("aria-invalid"), error.hidden]).toEqual([false, true]);
  });

  it("takes its error's words and stops once its signal aborts", () => {
    const { box, from, to } = range("none");
    enhanceDateRange(box, { order: "Pick an end after the start.", signal: life.signal });
    from.value = "2026-11-10";
    to.value = "2026-11-01";
    to.dispatchEvent(new Event("change", { bubbles: true }));
    expect(document.getElementById("to-error")?.textContent).toBe("Pick an end after the start.");
    life.abort();
    to.value = "2026-11-20";
    to.dispatchEvent(new Event("change", { bubbles: true }));
    expect(to.getAttribute("aria-invalid")).toBe("true");
  });

  it("tells a quick range's fill through both dates' events, and the opening fill through none", async () => {
    const { box, from, to, radio } = range();
    const seen: string[] = [];
    for (const f of [from, to]) {
      f.addEventListener("change", () => seen.push(`${f.id}=${f.value}`));
    }
    enhanceDateRange(box, { today, signal: life.signal });
    expect(seen).toEqual([]);
    await userEvent.click(radio("1"));
    expect(seen).toEqual(["from=2026-11-15", "to=2026-11-15"]);
    expect(radio("1").checked).toBe(true);
  });

  it("fills any time from the earliest day to today, and leaves it empty without one", async () => {
    const { box, from, to, radio } = range();
    enhanceDateRange(box, { today, earliest: new Date(2024, 2, 1), signal: life.signal });
    await userEvent.click(radio("all"));
    expect([from.value, to.value]).toEqual(["2024-03-01", "2026-11-15"]);
  });
});
