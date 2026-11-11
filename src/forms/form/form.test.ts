import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { clearError, reportErrors } from "./form.js";

afterEach(() => {
  document.body.replaceChildren();
});

function source(): {
  form: HTMLFormElement;
  summary: HTMLElement;
  url: HTMLInputElement;
  key: HTMLInputElement;
} {
  const form = document.createElement("form");
  form.className = "cp-form";
  // Static test markup, never caller text.
  form.setHTMLUnsafe(
    '<div class="cp-notice" data-tone="danger" hidden><div data-part="body"></div></div>' +
      '<div class="cp-field"><label class="cp-label" for="url">Address</label><input class="cp-input" id="url"></div>' +
      '<div class="cp-field"><label class="cp-label" for="key">API key</label><input class="cp-input" id="key" aria-describedby="key-help"><span class="cp-help" id="key-help">From Sonarr.</span></div>',
  );
  document.body.append(form);
  const get = (id: string) => form.querySelector(`#${id}`) as HTMLInputElement;
  return {
    form,
    summary: form.querySelector(".cp-notice") as HTMLElement,
    url: get("url"),
    key: get("key"),
  };
}

const heading = (n: number) => `${String(n)} fields need a fix before this saves`;

describe("reportErrors", () => {
  it("marks each field and lists them all in the summary, which takes focus, for two or more", async () => {
    const { form, summary, url, key } = source();
    reportErrors(
      form,
      [
        { field: url, message: "Enter the address." },
        { field: key, message: "Paste the key." },
      ],
      { summary, heading },
    );
    expect([url.getAttribute("aria-invalid"), key.getAttribute("aria-invalid")]).toEqual([
      "true",
      "true",
    ]);
    expect(document.getElementById("url-error")?.textContent).toBe("Enter the address.");
    expect(key.getAttribute("aria-describedby")).toBe("key-help key-error");
    expect(summary.hidden).toBe(false);
    expect(document.activeElement).toBe(summary);
    expect(summary.querySelector("strong")?.textContent).toBe(
      "2 fields need a fix before this saves",
    );
    const links = [...summary.querySelectorAll("a")];
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Address", "#url"],
      ["API key", "#key"],
    ]);
    await userEvent.click(links[1] as HTMLAnchorElement);
    expect(document.activeElement).toBe(key);
  });

  it("moves focus to the field for one error, and hides the summary", () => {
    const { form, summary, key } = source();
    reportErrors(form, [{ field: key, message: "Paste the key." }], { summary, heading });
    expect(summary.hidden).toBe(true);
    expect(document.activeElement).toBe(key);
  });

  it("clears the errors a later call no longer names, keeping what was typed and the field's help", () => {
    const { form, summary, url, key } = source();
    key.value = "typed";
    reportErrors(
      form,
      [
        { field: url, message: "Enter the address." },
        { field: key, message: "Paste the key." },
      ],
      { summary, heading },
    );
    reportErrors(form, [{ field: url, message: "Start with http://." }], { summary, heading });
    expect(key.hasAttribute("aria-invalid")).toBe(false);
    expect(key.getAttribute("aria-describedby")).toBe("key-help");
    expect(document.getElementById("key-error")?.hidden).toBe(true);
    expect(key.value).toBe("typed");
    expect(document.getElementById("url-error")?.textContent).toBe("Start with http://.");
    reportErrors(form, [], { summary, heading });
    expect(url.hasAttribute("aria-invalid")).toBe(false);
  });

  it("writes into the error the field already names, whatever its id, instead of making a second", () => {
    const { form, summary, url } = source();
    const error = document.createElement("span");
    error.className = "cp-field-error";
    error.id = "address-problem";
    error.hidden = true;
    url.after(error);
    url.setAttribute("aria-describedby", "address-problem");
    reportErrors(form, [{ field: url, message: "Enter the address." }], { summary, heading });
    expect(form.querySelectorAll(".cp-field-error")).toHaveLength(1);
    expect([error.hidden, error.textContent]).toEqual([false, "Enter the address."]);
    expect(url.getAttribute("aria-describedby")).toBe("address-problem");
    clearError(url);
    expect([error.hidden, url.hasAttribute("aria-describedby")]).toEqual([true, false]);
  });

  it("finds the markup's error again after a clear, so a later report makes no second one", () => {
    const { form, summary, url } = source();
    const error = document.createElement("span");
    error.className = "cp-field-error";
    error.id = "address-problem";
    const icon = document.createElement("span");
    icon.className = "cp-icon";
    error.append(icon);
    error.hidden = true;
    url.after(error);
    url.setAttribute("aria-describedby", "address-problem");
    reportErrors(form, [{ field: url, message: "Enter the address." }], { summary, heading });
    clearError(url);
    reportErrors(form, [{ field: url, message: "Start with http://." }], { summary, heading });
    expect(form.querySelectorAll(".cp-field-error")).toHaveLength(1);
    expect([error.firstElementChild, error.textContent, error.hidden]).toEqual([
      icon,
      "Start with http://.",
      false,
    ]);
  });

  it("keeps the icon an error was written with, and clears one field on request", () => {
    const { form, summary, url } = source();
    const error = document.createElement("span");
    error.className = "cp-field-error";
    error.id = "url-error";
    const icon = document.createElement("span");
    icon.className = "cp-icon";
    error.append(icon, "Old words");
    url.after(error);
    reportErrors(form, [{ field: url, message: "New words" }], { summary, heading });
    expect(error.firstElementChild).toBe(icon);
    expect(error.textContent).toBe("New words");
    clearError(url);
    expect([
      url.hasAttribute("aria-invalid"),
      error.hidden,
      url.hasAttribute("aria-describedby"),
    ]).toEqual([false, true, false]);
  });
});
