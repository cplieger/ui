import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { installAnnouncer } from "../../feedback/announce/announce.js";
import { enhanceActiveFilters } from "./active-filters.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
});

const polite = () => document.querySelector('[aria-live="polite"]')?.textContent;

function filters(...words: string[]): { row: HTMLElement; count: HTMLElement } {
  const row = document.createElement("div");
  row.className = "cp-active-filters";
  for (const w of words) {
    row.append(chip(w));
  }
  const clear = document.createElement("button");
  clear.className = "cp-button";
  clear.dataset["filtersClear"] = "";
  clear.textContent = "Clear filters";
  row.append(clear);
  const count = document.createElement("strong");
  count.textContent = "140 of 412";
  document.body.append(row, count);
  return { row, count };
}

function chip(words: string): HTMLElement {
  const c = document.createElement("span");
  c.className = "cp-token";
  c.dataset["value"] = words.toLowerCase();
  const text = document.createElement("span");
  text.textContent = words;
  c.append(text, document.createElement("button"));
  return c;
}

const removeOf = (row: HTMLElement, i: number) =>
  row.querySelectorAll<HTMLButtonElement>(".cp-token:not([data-cp-leaving]) > button")[
    i
  ] as HTMLButtonElement;
const clearOf = (row: HTMLElement) =>
  row.querySelector("[data-filters-clear]") as HTMLButtonElement;

describe("enhanceActiveFilters", () => {
  it("names each Remove by its filter and shows Clear only while a filter is on", () => {
    const { row, count } = filters("Kind: TV");
    const named = chip("Verdict: Best");
    named.querySelector("button")?.setAttribute("aria-label", "End Verdict: Best");
    row.prepend(named);
    enhanceActiveFilters(row, { count, signal: life.signal });
    expect(removeOf(row, 0).getAttribute("aria-label")).toBe("End Verdict: Best");
    expect(removeOf(row, 1).getAttribute("aria-label")).toBe("Remove Kind: TV");
    expect(removeOf(row, 1).type).toBe("button");
    expect(clearOf(row).hidden).toBe(false);

    const empty = filters();
    enhanceActiveFilters(empty.row, { count: empty.count, signal: life.signal });
    expect(clearOf(empty.row).hidden).toBe(true);
  });

  it("moves focus to the next chip, then to Clear, then to the count, telling the app what is left", async () => {
    const { row, count } = filters("A", "B", "C");
    const seen: (readonly string[])[] = [];
    const active = enhanceActiveFilters(row, {
      count,
      onChange: (v) => seen.push(v),
      signal: life.signal,
    });
    expect(count.tabIndex).toBe(-1);
    await userEvent.click(removeOf(row, 0));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Remove B");
    expect(active.values).toEqual(["b", "c"]);
    await userEvent.click(removeOf(row, 1));
    expect(document.activeElement).toBe(clearOf(row));
    expect(clearOf(row).hidden).toBe(false);
    await userEvent.click(removeOf(row, 0));
    expect(document.activeElement).toBe(count);
    expect(clearOf(row).hidden).toBe(true);
    expect(seen).toEqual([["b", "c"], ["b"], []]);
    await expect.poll(() => row.querySelectorAll(".cp-token").length).toBe(0);
  });

  it("ends every filter on Clear and sends focus to the rest the app names", async () => {
    const { row, count } = filters("A", "B");
    const rest = document.createElement("button");
    document.body.append(rest);
    const seen: (readonly string[])[] = [];
    enhanceActiveFilters(row, { count, rest, onChange: (v) => seen.push(v), signal: life.signal });
    expect(count.hasAttribute("tabindex")).toBe(false);
    await userEvent.click(clearOf(row));
    expect(document.activeElement).toBe(rest);
    expect(clearOf(row).hidden).toBe(true);
    expect(seen).toEqual([[]]);
  });

  it("announces the count once it stops changing, and not when it reads the same", async () => {
    installAnnouncer({ signal: life.signal });
    const { row, count } = filters("A");
    const active = enhanceActiveFilters(row, { count, settle: 50, signal: life.signal });
    const region = document.querySelector('[aria-live="polite"]') as HTMLElement;
    const heard: string[] = [];
    const watch = new MutationObserver(() => {
      if (region.textContent !== "") {
        heard.push(region.textContent);
      }
    });
    watch.observe(region, { childList: true, characterData: true, subtree: true });
    active.setCount("200 of 412");
    active.setCount("412 titles");
    expect(count.textContent).toBe("412 titles");
    await expect.poll(polite).toBe("412 titles");
    active.setCount("412 titles");
    await new Promise((done) => setTimeout(done, 250));
    watch.disconnect();
    expect(heard).toEqual(["412 titles"]);
  });

  it("names chips the app adds once it syncs", () => {
    const { row, count } = filters();
    const active = enhanceActiveFilters(row, { count, signal: life.signal });
    clearOf(row).before(chip("Kind: Film"));
    active.sync();
    expect(removeOf(row, 0).getAttribute("aria-label")).toBe("Remove Kind: Film");
    expect(clearOf(row).hidden).toBe(false);
    expect(active.values).toEqual(["kind: film"]);
  });

  it("takes its words in another language", () => {
    const { row, count } = filters("Genre : Drame");
    enhanceActiveFilters(row, {
      count,
      words: { remove: (f) => `Retirer ${f}` },
      signal: life.signal,
    });
    expect(removeOf(row, 0).getAttribute("aria-label")).toBe("Retirer Genre : Drame");
  });

  it("stops listening and drops a waiting count once its signal aborts", async () => {
    installAnnouncer({ signal: life.signal });
    const { row, count } = filters("A");
    const own = new AbortController();
    const seen: (readonly string[])[] = [];
    const active = enhanceActiveFilters(row, {
      count,
      settle: 20,
      onChange: (v) => seen.push(v),
      signal: own.signal,
    });
    active.setCount("9 of 412");
    own.abort();
    await userEvent.click(removeOf(row, 0));
    await new Promise((done) => setTimeout(done, 150));
    expect(seen).toEqual([]);
    expect(polite()).toBe("");
    active.setCount("10 of 412");
    await new Promise((done) => setTimeout(done, 150));
    expect(count.textContent).toBe("10 of 412");
    expect(polite()).toBe("");

    const done = new AbortController();
    done.abort();
    const late = filters("B");
    enhanceActiveFilters(late.row, {
      count: late.count,
      onChange: (v) => seen.push(v),
      signal: done.signal,
    });
    expect(removeOf(late.row, 0).getAttribute("aria-label")).toBe("Remove B");
    await userEvent.click(removeOf(late.row, 0));
    expect(seen).toEqual([]);
  });
});
