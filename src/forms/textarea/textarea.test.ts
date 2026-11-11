import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { enhanceTextarea } from "./textarea.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

function area(value = ""): { a: HTMLTextAreaElement; count: HTMLElement } {
  const a = document.createElement("textarea");
  a.id = "note";
  a.setAttribute("aria-label", "Note");
  a.value = value;
  const count = document.createElement("span");
  document.body.append(a, count);
  return { a, count };
}

describe("enhanceTextarea", () => {
  it("counts the characters against the limit and describes the area by the count", () => {
    const { a, count } = area("Dual audio");
    enhanceTextarea(a, { max: 20, count, signal: life.signal });
    expect(count.textContent).toBe("10 / 20");
    expect(a.getAttribute("aria-describedby")).toBe(count.id);
  });

  it("marks the area invalid and the count over once past the limit, and clears both under it", async () => {
    const { a, count } = area("12345");
    enhanceTextarea(a, { max: 6, count, signal: life.signal });
    a.focus();
    await userEvent.keyboard("{End}67");
    expect([a.getAttribute("aria-invalid"), count.hasAttribute("data-cp-over")]).toEqual([
      "true",
      true,
    ]);
    await userEvent.keyboard("{Backspace}");
    expect([a.hasAttribute("aria-invalid"), count.hasAttribute("data-cp-over")]).toEqual([
      false,
      false,
    ]);
    expect(count.textContent).toBe("6 / 6");
  });

  it("takes the count's words from the caller", () => {
    const { a, count } = area("abc");
    enhanceTextarea(a, {
      max: 10,
      count,
      words: (n, m) => `${String(m - n)} left`,
      signal: life.signal,
    });
    expect(count.textContent).toBe("7 left");
  });
});
