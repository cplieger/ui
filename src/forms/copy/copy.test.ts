import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { installAnnouncer } from "../../feedback/announce/announce.js";
import { enhanceCopy } from "./copy.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  vi.restoreAllMocks();
  getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

function key(): { code: HTMLElement; button: HTMLButtonElement } {
  const box = document.createElement("div");
  box.className = "cp-code";
  // Static test markup, never caller text.
  box.setHTMLUnsafe(
    '<code>cpk_test-key</code><button class="cp-button cp-copy" type="button">Copy</button>',
  );
  document.body.append(box);
  return {
    code: box.querySelector("code") as HTMLElement,
    button: box.querySelector("button") as HTMLButtonElement,
  };
}

const polite = () => document.querySelector('[aria-live="polite"]')?.textContent;

describe("enhanceCopy", () => {
  it("writes the text, turns the button done and says Copied, only once the write happened", async () => {
    installAnnouncer({ signal: life.signal });
    const written: string[] = [];
    vi.spyOn(Clipboard.prototype, "writeText").mockImplementation(async (t) => {
      written.push(t);
    });
    const { code, button } = key();
    enhanceCopy(button, { source: code, signal: life.signal });
    await userEvent.click(button);
    await expect.poll(() => button.dataset["cpState"]).toBe("done");
    expect(written).toEqual(["cpk_test-key"]);
    await expect.poll(polite).toBe("Copied");
    expect(button.textContent).toBe("Copy");
  });

  it("selects the text and names the copy keys when the clipboard refuses", async () => {
    vi.spyOn(Clipboard.prototype, "writeText").mockRejectedValue(
      new DOMException("denied", "NotAllowedError"),
    );
    const { code, button } = key();
    enhanceCopy(button, { source: code, signal: life.signal });
    await userEvent.click(button);
    const hint = () => code.parentElement?.nextElementSibling as HTMLElement;
    await expect.poll(() => hint().hidden).toBe(false);
    expect(hint().textContent).toMatch(/^Selected\. Press (Ctrl\+C|⌘C) to copy\.$/);
    expect(getSelection()?.toString()).toBe("cpk_test-key");
    expect(button.hasAttribute("data-cp-state")).toBe(false);
  });

  it("copies a text that is not on the page, and its words are the caller's", async () => {
    installAnnouncer({ signal: life.signal });
    const written: string[] = [];
    vi.spyOn(Clipboard.prototype, "writeText").mockImplementation(async (t) => {
      written.push(t);
    });
    const { button } = key();
    enhanceCopy(button, {
      text: () => "https://feed.example/rss",
      copied: "Feed address copied",
      signal: life.signal,
    });
    await userEvent.click(button);
    await expect.poll(polite).toBe("Feed address copied");
    expect(written).toEqual(["https://feed.example/rss"]);
  });

  it("needs a source or a text, and removes the hint it made once its signal aborts", () => {
    const { code, button } = key();
    expect(() => enhanceCopy(button, {})).toThrow(TypeError);
    enhanceCopy(button, { source: code, signal: life.signal });
    expect(document.querySelectorAll(".cp-help")).toHaveLength(1);
    life.abort();
    expect(document.querySelectorAll(".cp-help")).toHaveLength(0);
  });
});
