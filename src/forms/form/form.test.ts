import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { clearError, reportErrors, showError } from "./form.js";

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

describe("a form not yet in the document", () => {
  it("shows a field's error under it, joined by aria-describedby, then clears it", () => {
    const form = document.createElement("form");
    // Static test markup, never caller text.
    form.setHTMLUnsafe(
      '<div class="cp-field"><label class="cp-label" for="msg">Message</label><textarea class="cp-input" id="msg" aria-describedby="msg-help"></textarea><span class="cp-help" id="msg-help">Markdown works.</span><p class="cp-field-error" id="msg-error" hidden></p></div>',
    );
    const field = form.querySelector("textarea") as HTMLTextAreaElement;
    const error = form.querySelector("#msg-error") as HTMLElement;
    showError(field, "This conversation takes no reply.");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(error.hidden).toBe(false);
    expect(error.textContent).toBe("This conversation takes no reply.");
    expect(field.getAttribute("aria-describedby")?.split(" ")).toContain("msg-error");
    document.body.append(form);
    clearError(field);
    expect(field.hasAttribute("aria-invalid")).toBe(false);
    expect(error.hidden).toBe(true);
  });
});

function settings(): {
  form: HTMLFormElement;
  summary: HTMLElement;
  notice: HTMLElement;
  name: HTMLInputElement;
  every: HTMLInputElement;
  sources: HTMLElement;
  alerts: HTMLElement;
} {
  // Static test markup, never caller text. The categories after the first
  // are hidden until their nav link is pressed, as an app shows one at a time.
  document.body.setHTMLUnsafe(
    '<nav><a href="#account">Account and security</a><a href="#sources">Sources</a><a href="#alerts">Alerts</a></nav>' +
      '<form class="cp-form" novalidate>' +
      '<div class="cp-notice" data-variant="banner" hidden><div data-part="body"></div></div>' +
      '<div class="cp-notice" data-tone="danger" hidden><div data-part="body"></div></div>' +
      '<section id="account" aria-labelledby="account-h"><h2 id="account-h">Account and security</h2>' +
      '<div class="cp-field"><label class="cp-label" for="name">Display name</label><input class="cp-input" id="name"></div></section>' +
      '<section id="sources" hidden><h2>Sources</h2>' +
      '<section aria-label="Sonarr"><div class="cp-field"><label class="cp-label" for="every">Check every</label><input class="cp-input" id="every"></div></section></section>' +
      '<section id="alerts" aria-label="Alerts" hidden><h2>When to tell you</h2>' +
      '<details><summary>More</summary><div class="cp-field"><label class="cp-label" for="quiet">Quiet hours</label><input class="cp-input" id="quiet"></div></details></section>' +
      "</form>",
  );
  for (const a of document.querySelectorAll("nav a")) {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      for (const s of document.querySelectorAll<HTMLElement>("form > section")) {
        s.hidden = `#${s.id}` !== a.getAttribute("href");
      }
    });
  }
  const form = document.querySelector("form") as HTMLFormElement;
  const [notice, summary] = [...form.querySelectorAll<HTMLElement>(".cp-notice")] as [
    HTMLElement,
    HTMLElement,
  ];
  return {
    form,
    summary,
    notice,
    name: form.querySelector("#name") as HTMLInputElement,
    every: form.querySelector("#every") as HTMLInputElement,
    sources: form.querySelector("#sources") as HTMLElement,
    alerts: form.querySelector("#alerts") as HTMLElement,
  };
}

const items = (summary: HTMLElement) =>
  [...summary.querySelectorAll("li")].map((li) => li.textContent);

describe("reportErrors across sections", () => {
  it("names a field by its outermost section and its label", () => {
    const { form, summary, name, every } = settings();
    reportErrors(
      form,
      [
        { field: name, message: "Enter a name." },
        { field: every, message: "Enter 5 minutes or more." },
      ],
      { summary, heading },
    );
    expect(items(summary)).toEqual(["Account and security: Display name", "Sources: Check every"]);
  });

  it("links an error to its control in another category, opening that category first", async () => {
    const { form, summary, name, every, sources } = settings();
    reportErrors(
      form,
      [
        { field: name, message: "Enter a name." },
        { field: every, message: "Enter 5 minutes or more." },
      ],
      { summary, heading },
    );
    await userEvent.click(summary.querySelectorAll("a")[1] as HTMLAnchorElement);
    expect(sources.hidden).toBe(false);
    expect(document.activeElement).toBe(every);
  });

  it("opens a closed details around the control as well as its category", async () => {
    const { form, summary, name, alerts } = settings();
    const quiet = form.querySelector("#quiet") as HTMLInputElement;
    reportErrors(
      form,
      [
        { field: name, message: "Enter a name." },
        { field: quiet, message: "End after it starts." },
      ],
      { summary, heading },
    );
    expect(items(summary)[1]).toBe("Alerts: Quiet hours");
    await userEvent.click(summary.querySelectorAll("a")[1] as HTMLAnchorElement);
    expect([alerts.hidden, (alerts.querySelector("details") as HTMLDetailsElement).open]).toEqual([
      false,
      true,
    ]);
    expect(document.activeElement).toBe(quiet);
  });

  it("lists an error with no control under its section's link, which focuses the section's heading", async () => {
    const { form, summary, sources } = settings();
    reportErrors(form, [{ section: sources, message: "Two sources use one address." }], {
      summary,
      heading,
    });
    expect(summary.hidden).toBe(false);
    expect(document.activeElement).toBe(summary);
    expect(summary.querySelector("strong")?.textContent).toBe(
      "1 fields need a fix before this saves",
    );
    expect(items(summary)).toEqual(["Sources: Two sources use one address."]);
    const a = summary.querySelector("a") as HTMLAnchorElement;
    expect([a.textContent, a.getAttribute("href")]).toEqual(["Sources", "#sources"]);
    await userEvent.click(a);
    const h = sources.querySelector("h2") as HTMLElement;
    expect([sources.hidden, document.activeElement]).toEqual([false, h]);
    expect(h.getAttribute("tabindex")).toBe("-1");
    h.blur();
    expect(h.hasAttribute("tabindex")).toBe(false);
  });

  it("gives a section with no id one, so its link has somewhere to go", () => {
    const { form, summary, every } = settings();
    const sonarr = every.closest("section") as HTMLElement;
    reportErrors(form, [{ section: sonarr, message: "Sonarr did not answer." }], {
      summary,
      heading,
    });
    const a = summary.querySelector("a") as HTMLAnchorElement;
    expect(sonarr.id).not.toBe("");
    expect([a.textContent, a.getAttribute("href")]).toEqual(["Sonarr", `#${sonarr.id}`]);
  });

  it("shows a document's own error in the notice and focuses it when it is the only one", () => {
    const { form, summary, notice } = settings();
    reportErrors(form, [{ message: "These settings changed on another device." }], {
      summary,
      heading,
      notice,
    });
    expect([notice.hidden, notice.textContent, summary.hidden]).toEqual([
      false,
      "These settings changed on another device.",
      true,
    ]);
    expect(document.activeElement).toBe(notice);
    reportErrors(form, [], { summary, heading, notice });
    expect(notice.hidden).toBe(true);
  });

  it("lists every document error in the notice, and the field beside it in the summary", () => {
    const { form, summary, notice, name } = settings();
    reportErrors(
      form,
      [
        { message: "Saved elsewhere." },
        { field: name, message: "Enter a name." },
        { message: "Reload first." },
      ],
      { summary, heading, notice },
    );
    expect([...notice.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "Saved elsewhere.",
      "Reload first.",
    ]);
    expect([summary.hidden, items(summary), document.activeElement]).toEqual([
      false,
      ["Account and security: Display name"],
      summary,
    ]);
    expect(summary.querySelector("strong")?.textContent).toBe(
      "1 fields need a fix before this saves",
    );
  });

  it("lists a document's error as a plain item of the summary when there is no notice", () => {
    const { form, summary, notice } = settings();
    reportErrors(form, [{ message: "The server refused the save." }], { summary, heading });
    expect([summary.hidden, items(summary), summary.querySelectorAll("a").length]).toEqual([
      false,
      ["The server refused the save."],
      0,
    ]);
    expect(notice.hidden).toBe(true);
  });
});
