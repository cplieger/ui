import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { installAnnouncer } from "../../feedback/announce/announce.js";
import { createTokenLimit, enhanceTokens, type TokensOptions } from "./tokens.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

function field(
  chips: readonly string[] = [],
  list?: readonly string[],
): {
  box: HTMLElement;
  input: HTMLInputElement;
  form: HTMLFormElement;
  suggestions: HTMLElement | undefined;
} {
  const form = document.createElement("form");
  // A submit would reload the test page; the tests count submits themselves.
  form.addEventListener("submit", (e) => {
    e.preventDefault();
  });
  const box = document.createElement("div");
  box.className = "cp-tokens";
  for (const c of chips) {
    const chip = document.createElement("span");
    chip.className = "cp-token";
    chip.dataset["value"] = c;
    const words = document.createElement("span");
    words.textContent = c;
    chip.append(words, document.createElement("button"));
    box.append(chip);
  }
  const input = document.createElement("input");
  input.setAttribute("aria-label", "Tags");
  input.placeholder = "Add a tag";
  box.append(input);
  form.append(box);
  let suggestions: HTMLElement | undefined;
  if (list !== undefined) {
    suggestions = document.createElement("ul");
    suggestions.id = "tag-list";
    suggestions.className = "cp-popover cp-listbox";
    for (const w of list) {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.append(w);
      const n = document.createElement("small");
      n.textContent = "12";
      li.append(n);
      suggestions.append(li);
    }
    form.append(suggestions);
  }
  document.body.append(form);
  return { box, input, form, suggestions };
}

function make(f: ReturnType<typeof field>, options: TokensOptions = {}) {
  const seen: (readonly string[])[] = [];
  const t = enhanceTokens(f.box, {
    onChange: (v) => seen.push(v),
    signal: life.signal,
    ...(f.suggestions === undefined ? {} : { suggestions: f.suggestions }),
    ...options,
  });
  return { t, seen };
}

const chipButtons = (box: HTMLElement) => [
  ...box.querySelectorAll<HTMLButtonElement>(".cp-token > button"),
];
const polite = () => document.querySelector('[aria-live="polite"]')?.textContent;

describe("enhanceTokens", () => {
  it("adds the typed words on Enter or a comma, without submitting the form, and tells the host", async () => {
    const f = field();
    let submits = 0;
    f.form.addEventListener("submit", (e) => {
      e.preventDefault();
      submits += 1;
    });
    const { t, seen } = make(f);
    f.input.focus();
    await userEvent.keyboard("1080p{Enter}dual audio,BD,");
    expect(t.values).toEqual(["1080p", "dual audio", "BD"]);
    expect(f.input.value).toBe("");
    expect(seen.at(-1)).toEqual(["1080p", "dual audio", "BD"]);
    expect(submits).toBe(0);
    const [first] = chipButtons(f.box);
    expect([first?.getAttribute("aria-label"), first?.tabIndex]).toEqual(["Remove 1080p", -1]);
  });

  it("shakes a value already there instead of adding it twice", async () => {
    const f = field(["seasonal"]);
    const { t } = make(f);
    f.input.focus();
    await userEvent.keyboard("Seasonal{Enter}");
    expect(t.values).toEqual(["seasonal"]);
    expect(f.box.querySelector(".cp-token")?.hasAttribute("data-cp-again")).toBe(true);
  });

  it("reaches the chips from the field and removes one with Backspace, moving focus on", async () => {
    const f = field(["a", "b", "c"]);
    const { t } = make(f);
    f.input.focus();
    await userEvent.keyboard("{Backspace}");
    const [a, b, c] = chipButtons(f.box);
    expect(document.activeElement).toBe(c);
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(b);
    await userEvent.keyboard("{Backspace}");
    expect(t.values).toEqual(["a", "c"]);
    expect(document.activeElement).toBe(c);
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(f.input);
    await userEvent.click(a as HTMLButtonElement);
    expect(t.values).toEqual(["c"]);
    expect(document.activeElement).toBe(f.input);
  });

  it("says each add and removal through the announcer", async () => {
    installAnnouncer({ signal: life.signal });
    const f = field(["seasonal"]);
    const { t } = make(f);
    t.add("dub only");
    await expect.poll(polite).toBe("dub only added");
    t.remove("seasonal");
    await expect.poll(polite).toBe("seasonal removed");
  });

  it("at the limit turns the field read-only but focusable, says so under it, and takes no more", async () => {
    installAnnouncer({ signal: life.signal });
    const f = field(["a"]);
    const { t } = make(f, { max: 2 });
    f.input.focus();
    await userEvent.keyboard("b{Enter}");
    expect([f.input.readOnly, f.input.disabled, f.input.getAttribute("aria-disabled")]).toEqual([
      true,
      false,
      "true",
    ]);
    const note = document.getElementById(
      f.input.getAttribute("aria-describedby") ?? "",
    ) as HTMLElement;
    expect([note.hidden, note.textContent]).toEqual([false, "2 chosen, the most allowed."]);
    await expect.poll(polite).toBe("2 chosen, the most allowed.");
    expect(t.add("c")).toBe(false);
    expect(document.activeElement).toBe(f.input);
    await userEvent.keyboard("{Backspace}{Backspace}");
    expect([t.values, f.input.readOnly, note.hidden]).toEqual([["a"], false, true]);
    expect(f.input.placeholder).toBe("Add a tag");
  });

  it("shares one limit of distinct values across fields, a value in two counted once", () => {
    installAnnouncer({ signal: life.signal });
    const limit = createTokenLimit(3);
    const a = field(["a", "b"]);
    const b = field(["c"]);
    const ta = make(a, { limit }).t;
    const tb = make(b, { limit }).t;
    const noteOf = (f: ReturnType<typeof field>) =>
      document.getElementById(f.input.getAttribute("aria-describedby") ?? "") as HTMLElement;
    expect([limit.size, limit.max]).toEqual([3, 3]);
    // At the limit both fields can still take what the other holds.
    expect([a.input.readOnly, b.input.readOnly]).toEqual([false, false]);
    expect(noteOf(b).textContent).toBe(
      "3 chosen, the most allowed. You can still add one chosen in another field.",
    );
    expect(tb.add("d")).toBe(false);
    expect(tb.add("A")).toBe(true);
    expect(limit.size).toBe(3);
    // A holds every value counted, so it can take nothing more.
    expect(ta.add("c")).toBe(true);
    expect([a.input.readOnly, noteOf(a).textContent]).toEqual([
      true,
      "3 chosen, the most allowed.",
    ]);
    expect(b.input.readOnly).toBe(false);
    // Below the limit again, every field opens and its note hides.
    tb.remove("c");
    ta.remove("c");
    expect(limit.size).toBe(2);
    expect([a.input.readOnly, noteOf(a).hidden, noteOf(b).hidden]).toEqual([false, true, true]);
    expect(tb.add("d")).toBe(true);
  });

  it("at a shared limit offers only the suggestions another field holds", async () => {
    const limit = createTokenLimit(2);
    const a = field(["English", "French"]);
    make(a, { limit });
    const b = field([], ["English", "French", "German"]);
    make(b, { limit, allowNew: true });
    b.input.focus();
    const shown = () =>
      [...(b.suggestions as HTMLElement).querySelectorAll<HTMLElement>("li:not([hidden])")].map(
        (l) => l.firstChild?.textContent,
      );
    expect(shown()).toEqual(["English", "French"]);
    await userEvent.keyboard("ger");
    expect(shown()).toEqual([]);
  });

  it("lets go of a shared limit once its signal aborts", () => {
    const limit = createTokenLimit(2);
    const own = new AbortController();
    const a = field(["a", "b"]);
    enhanceTokens(a.box, { limit, signal: own.signal });
    const b = field([]);
    const tb = make(b, { limit }).t;
    expect(tb.add("c")).toBe(false);
    own.abort();
    expect(limit.size).toBe(0);
    expect(tb.add("c")).toBe(true);
  });

  it("sends each value under its name in the form, the markup's chips included", () => {
    const f = field(["a"]);
    const { t } = make(f, { name: "tag" });
    t.add("b");
    t.add("c");
    t.remove("b");
    expect(new FormData(f.form).getAll("tag")).toEqual(["a", "c"]);
  });

  it("narrows its suggestions to what matches and is not chosen, and adds one on Enter", async () => {
    const f = field(["English"], ["English", "French", "Finnish", "German"]);
    const { t } = make(f);
    f.input.focus();
    const shown = () =>
      [...(f.suggestions as HTMLElement).querySelectorAll<HTMLElement>("li:not([hidden])")].map(
        (l) => l.firstChild?.textContent,
      );
    expect(shown()).toEqual(["French", "Finnish", "German"]);
    await userEvent.keyboard("fin");
    expect(shown()).toEqual(["Finnish"]);
    await userEvent.keyboard("{Enter}");
    expect(t.values).toEqual(["English", "Finnish"]);
    expect(f.input.value).toBe("");
    expect(shown()).toEqual(["French", "German"]);
    expect((f.suggestions as HTMLElement).matches(":popover-open")).toBe(true);
  });

  it("offers the typed words as a new value only when new ones are allowed", async () => {
    const f = field([], ["favourite", "rewatch"]);
    const { t } = make(f, { allowNew: true });
    f.input.focus();
    await userEvent.keyboard("fav");
    const add = (f.suggestions as HTMLElement).querySelector<HTMLElement>("[data-cp-new]");
    expect(add?.hidden).toBe(false);
    expect(add?.textContent).toBe("Add “fav”");
    await userEvent.keyboard("ourite");
    expect(add?.hidden).toBe(true);
    await userEvent.keyboard("{Enter}");
    expect(t.values).toEqual(["favourite"]);
    await userEvent.keyboard("winter{Enter}");
    expect(t.values).toEqual(["favourite", "winter"]);
    document.body.replaceChildren();
    const g = field([], ["favourite"]);
    const only = make(g);
    g.input.focus();
    await userEvent.keyboard("winter{Enter}");
    expect(only.t.values).toEqual([]);
    expect(g.suggestions?.querySelector("[data-cp-new]")).toBeNull();
  });

  it("needs a text input, and removes its note and its listeners once its signal aborts", async () => {
    const empty = document.createElement("div");
    expect(() => enhanceTokens(empty)).toThrow(TypeError);
    const f = field();
    const { t } = make(f, { max: 3 });
    expect(document.querySelectorAll(".cp-help")).toHaveLength(1);
    life.abort();
    expect(document.querySelectorAll(".cp-help")).toHaveLength(0);
    f.input.focus();
    await userEvent.keyboard("late{Enter}");
    expect(t.values).toEqual([]);
  });
});
