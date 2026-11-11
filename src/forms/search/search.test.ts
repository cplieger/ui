import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { enhanceSearch } from "./search.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

describe("enhanceSearch", () => {
  it("empties the field on a press of Clear, tells the page as typing would, and gives focus back", async () => {
    const search = document.createElement("div");
    search.className = "cp-search";
    // Static test markup, never caller text.
    search.setHTMLUnsafe(
      '<input class="cp-input" type="search" placeholder="Search titles…" aria-label="Search titles" value="Frieren"><button class="cp-button" aria-label="Clear search"></button>',
    );
    document.body.append(search);
    const input = search.querySelector("input") as HTMLInputElement;
    const clear = search.querySelector("button") as HTMLButtonElement;
    const heard: string[] = [];
    input.addEventListener("input", () => heard.push(input.value));
    enhanceSearch(search, { signal: life.signal });
    expect(clear.type).toBe("button");
    await userEvent.click(clear);
    expect([input.value, heard, document.activeElement]).toEqual(["", [""], input]);
  });
});
