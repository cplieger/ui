import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { enhanceTextarea, utf8Length } from "./textarea.js";

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

  it("counts with no limit, and gives each count its own id", () => {
    const { a, count } = area("abc");
    const second = area("de");
    enhanceTextarea(a, { count, signal: life.signal });
    enhanceTextarea(second.a, { count: second.count, signal: life.signal });
    expect(count.textContent).toBe("3");
    expect(count.id).not.toBe(second.count.id);
    expect(second.a.getAttribute("aria-describedby")).toBe(second.count.id);
  });

  it("leaves an error a form check set while the text is within the limit", async () => {
    const { a, count } = area("ok");
    a.setAttribute("aria-invalid", "true");
    enhanceTextarea(a, { max: 10, count, signal: life.signal });
    a.focus();
    await userEvent.keyboard("{End}!");
    expect(a.getAttribute("aria-invalid")).toBe("true");
  });

  it("takes the count's words from the caller", () => {
    const { a, count } = area("abc");
    enhanceTextarea(a, {
      max: 10,
      count,
      words: (n, m) => `${String((m ?? 0) - n)} left`,
      signal: life.signal,
    });
    expect(count.textContent).toBe("7 left");
  });

  it("counts what measure counts, such as the UTF-8 bytes a body limit sees", async () => {
    expect([utf8Length("a"), utf8Length("é"), utf8Length("€"), utf8Length("😀")]).toEqual([
      1, 2, 3, 4,
    ]);
    expect([utf8Length("\ud800"), utf8Length("\udc00x")]).toEqual([3, 4]);
    const { a, count } = area("né");
    enhanceTextarea(a, { max: 4, count, measure: utf8Length, signal: life.signal });
    expect(count.textContent).toBe("3 / 4");
    a.focus();
    await userEvent.keyboard("{End}é");
    expect([count.textContent, a.getAttribute("aria-invalid")]).toEqual(["5 / 4", "true"]);
  });

  it("sends its form through the default button on Ctrl or Meta Enter, and only then", async () => {
    const form = document.createElement("form");
    const { a } = area("Hello");
    const send = document.createElement("button");
    send.textContent = "Send";
    form.append(a, send);
    document.body.append(form);
    const submitters: (HTMLElement | null)[] = [];
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      submitters.push(e.submitter);
    });
    enhanceTextarea(a, { submitOnModEnter: true, signal: life.signal });
    a.focus();
    a.setSelectionRange(5, 5);
    await userEvent.keyboard("{Enter}");
    expect([submitters.length, a.value]).toEqual([0, "Hello\n"]);
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");
    expect(submitters).toEqual([send, send]);
    expect(a.value).toBe("Hello\n");
    send.disabled = true;
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(submitters).toHaveLength(2);
  });

  it("leaves Ctrl Enter alone without submitOnModEnter", async () => {
    const form = document.createElement("form");
    const { a } = area("");
    form.append(a, document.createElement("button"));
    document.body.append(form);
    let sent = 0;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      sent++;
    });
    enhanceTextarea(a, { signal: life.signal });
    a.focus();
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(sent).toBe(0);
  });

  it("sends once for a held Ctrl Enter", () => {
    const form = document.createElement("form");
    const { a } = area("Hello");
    form.append(a, document.createElement("button"));
    document.body.append(form);
    let sent = 0;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      sent++;
    });
    enhanceTextarea(a, { submitOnModEnter: true, signal: life.signal });
    const key = (repeat: boolean) =>
      a.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, repeat, cancelable: true }),
      );
    key(false);
    expect(key(true)).toBe(false);
    key(true);
    expect(sent).toBe(1);
  });
});
