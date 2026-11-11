import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { enhanceReveal, enhanceSecret } from "./secret.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

function saved(): {
  form: HTMLFormElement;
  secret: HTMLElement;
  input: HTMLInputElement;
  replace: HTMLButtonElement;
  keep: HTMLButtonElement;
} {
  const form = document.createElement("form");
  // Static test markup, never caller text.
  form.setHTMLUnsafe(
    '<div class="cp-field cp-secret" data-cp-state="saved"><span class="cp-label" id="l">API key</span>' +
      '<div data-part="saved"><span>Saved</span><button class="cp-button" type="button" aria-describedby="l">Replace</button></div>' +
      '<div data-part="edit"><div class="cp-input-wrap"><input class="cp-input" name="key" type="password" aria-labelledby="l"></div>' +
      '<div><button class="cp-button" type="button" data-part="keep">Keep saved value</button></div></div></div>',
  );
  document.body.append(form);
  const secret = form.querySelector(".cp-secret") as HTMLElement;
  return {
    form,
    secret,
    input: form.querySelector("input") as HTMLInputElement,
    replace: form.querySelector("[data-part='saved'] button") as HTMLButtonElement,
    keep: form.querySelector("[data-part='keep']") as HTMLButtonElement,
  };
}

describe("enhanceSecret", () => {
  it("sends nothing while saved, and Replace opens an empty field with focus", async () => {
    const { form, secret, input, replace } = saved();
    enhanceSecret(secret, { signal: life.signal });
    expect(new FormData(form).has("key")).toBe(false);
    await userEvent.click(replace);
    expect(secret.dataset["cpState"]).toBe("edit");
    expect(document.activeElement).toBe(input);
    await userEvent.keyboard("new-key");
    expect(new FormData(form).get("key")).toBe("new-key");
  });

  it("goes back to Saved with what was typed dropped, says so to the form, and gives focus to Replace", async () => {
    const { form, secret, input, replace, keep } = saved();
    enhanceSecret(secret, { signal: life.signal });
    await userEvent.click(replace);
    await userEvent.keyboard("half");
    let inputs = 0;
    input.addEventListener("input", () => (inputs += 1));
    await userEvent.click(keep);
    expect(secret.dataset["cpState"]).toBe("saved");
    expect([input.value, inputs]).toEqual(["", 1]);
    expect(new FormData(form).has("key")).toBe(false);
    expect(document.activeElement).toBe(replace);
  });
});

describe("enhanceReveal", () => {
  it("shows and hides the text, and says whether it shows through aria-pressed", async () => {
    const input = document.createElement("input");
    input.type = "password";
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", "Show password");
    document.body.append(input, button);
    enhanceReveal(button, input, { signal: life.signal });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    await userEvent.click(button);
    expect([input.type, button.getAttribute("aria-pressed")]).toEqual(["text", "true"]);
    await userEvent.click(button);
    expect([input.type, button.getAttribute("aria-pressed")]).toEqual(["password", "false"]);
    expect(button.getAttribute("aria-label")).toBe("Show password");
  });
});
