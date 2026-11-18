import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { installAnnouncer } from "../../feedback/announce/announce.js";
import { enhancePairs } from "./pairs.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

function pairs(): { box: HTMLElement; list: HTMLUListElement; add: HTMLButtonElement } {
  const box = document.createElement("div");
  // Static test markup, never caller text.
  box.setHTMLUnsafe(
    '<ul class="cp-pairs"><li>' +
      '<div class="cp-field"><label for="from-1">From</label><input class="cp-input" id="from-1" value="/tv" aria-describedby="from-help-1 from-1-error" aria-invalid="true"><span class="cp-help" id="from-help-1">As Sonarr sees it</span><span class="cp-field-error" id="from-1-error">Start with /</span></div>' +
      '<div class="cp-field"><input class="cp-input" id="to-1" value="/media/tv" aria-label="To"></div>' +
      '<button type="button" data-remove-pair aria-label="Remove this mapping">x</button></li></ul>' +
      '<button type="button" data-add-pair>Add a mapping</button>',
  );
  document.body.append(box);
  return {
    box,
    list: box.querySelector("ul") as HTMLUListElement,
    add: box.querySelector("[data-add-pair]") as HTMLButtonElement,
  };
}

describe("enhancePairs", () => {
  it("appends an empty row copied from the first, numbering its ids and their references", async () => {
    const { box, list, add } = pairs();
    let changes = 0;
    enhancePairs(box, { onChange: () => changes++, signal: life.signal });
    await userEvent.click(add);
    const row = list.lastElementChild as HTMLElement;
    const from = row.querySelector("input") as HTMLInputElement;
    expect([from.id, from.value, from.hasAttribute("aria-invalid")]).toEqual(["from-2", "", false]);
    // A description is read from hidden text too, so the new row's field
    // names its help and not the error it hides.
    expect(from.getAttribute("aria-describedby")).toBe("from-help-2");
    expect(row.querySelector("label")?.htmlFor).toBe("from-2");
    expect((row.querySelector(".cp-field-error") as HTMLElement).hidden).toBe(true);
    expect(document.activeElement).toBe(from);
    expect(changes).toBe(1);
    await userEvent.click(add);
    expect((list.lastElementChild?.querySelector("input") as HTMLInputElement).id).toBe("from-3");
  });

  it("removes a row and moves focus to the next, the one before, or the add button", async () => {
    const { box, list, add } = pairs();
    enhancePairs(box, { signal: life.signal });
    await userEvent.click(add);
    await userEvent.click(list.querySelector("[data-remove-pair]") as HTMLButtonElement);
    expect(list.children).toHaveLength(1);
    expect(document.activeElement?.id).toBe("from-2");
    await userEvent.click(list.querySelector("[data-remove-pair]") as HTMLButtonElement);
    expect(document.activeElement).toBe(add);
  });

  it("says a removed row by its values, or by the app's words", async () => {
    installAnnouncer({ signal: life.signal });
    const said = () => document.querySelector('[aria-live="polite"]')?.textContent;
    const { box, list, add } = pairs();
    let gone: readonly string[] = [];
    enhancePairs(box, { signal: life.signal });
    await userEvent.click(add);
    await userEvent.click(list.querySelector("[data-remove-pair]") as HTMLButtonElement);
    await expect.poll(said).toBe("/tv, /media/tv removed");
    await userEvent.click(list.querySelector("[data-remove-pair]") as HTMLButtonElement);
    await expect.poll(said).toBe("Row removed");
    life.abort();
    life = new AbortController();
    installAnnouncer({ signal: life.signal });
    const other = pairs();
    enhancePairs(other.box, {
      words: {
        removed: (values) => {
          gone = values;
          return "Mapping removed";
        },
      },
      signal: life.signal,
    });
    await userEvent.click(other.list.querySelector("[data-remove-pair]") as HTMLButtonElement);
    await expect.poll(said).toBe("Mapping removed");
    expect(gone).toEqual(["/tv", "/media/tv"]);
  });

  it("puts its rows and their values back on the form's reset, and tells the host", async () => {
    const { box, list, add } = pairs();
    const form = document.createElement("form");
    form.append(box);
    document.body.append(form);
    let changes = 0;
    enhancePairs(box, { onChange: () => changes++, signal: life.signal });
    await userEvent.click(add);
    await userEvent.type(list.querySelector("#from-2") as HTMLInputElement, "/films");
    await userEvent.click(list.querySelector("[data-remove-pair]") as HTMLButtonElement);
    expect(list.querySelectorAll("li")).toHaveLength(1);
    const values = (): string[] => [...list.querySelectorAll("input")].map((i) => i.value);
    // The rows follow the reset a task later, after the form's own fields.
    form.reset();
    await expect.poll(values).toEqual(["/tv", "/media/tv"]);
    expect(changes).toBe(3);
    await userEvent.click(list.querySelector("[data-remove-pair]") as HTMLButtonElement);
    expect(list.querySelectorAll("li")).toHaveLength(0);
    form.reset();
    await expect.poll(values).toEqual(["/tv", "/media/tv"]);
    expect(document.activeElement).toBe(add);
  });

  it("adds a row like the page's first even after that row is removed, and stops once its signal aborts", async () => {
    const { box, list, add } = pairs();
    enhancePairs(box, { signal: life.signal });
    await userEvent.click(list.querySelector("[data-remove-pair]") as HTMLButtonElement);
    await userEvent.click(add);
    expect(list.querySelectorAll("li")).toHaveLength(1);
    life.abort();
    add.click();
    expect(list.querySelectorAll("li")).toHaveLength(1);
  });
});
