import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { installDialogs } from "../../overlays/dialog/dialog.js";
import { enhanceReveal, enhanceSecret, shownOnce } from "./secret.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  for (const d of document.querySelectorAll("dialog")) {
    d.close();
  }
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

describe("shownOnce", () => {
  function shown(): { d: HTMLDialogElement; code: HTMLElement } {
    const d = document.createElement("dialog");
    d.className = "cp-dialog";
    const code = document.createElement("code");
    code.textContent = "cpk_test-key";
    const done = document.createElement("button");
    done.type = "button";
    done.textContent = "Done";
    done.addEventListener("click", () => d.close());
    d.append(code, done);
    document.body.append(d);
    return { d, code };
  }

  it("keeps the dialog on Escape until the secret is copied", async () => {
    installDialogs({ signal: life.signal });
    const { d } = shown();
    const once = shownOnce(d.querySelector("code") as HTMLElement, {
      dialog: d,
      signal: life.signal,
    });
    d.showModal();
    await userEvent.keyboard("{Escape}");
    expect(d.open).toBe(true);
    once.copied();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => d.open).toBe(false);
  });

  it("clears the secret when the dialog closes and when the page is hidden", () => {
    const { d, code } = shown();
    shownOnce(code, { dialog: d, signal: life.signal });
    d.showModal();
    (d.querySelector("button") as HTMLButtonElement).click();
    return expect
      .poll(() => code.textContent)
      .toBe("")
      .then(() => {
        code.textContent = "cpk_again";
        dispatchEvent(new PageTransitionEvent("pagehide"));
        expect(code.textContent).toBe("");
      });
  });
});
