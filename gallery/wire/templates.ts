/**
 * templates.ts — the gallery's wiring for the page templates' cards: each
 * template in an `<iframe>` drawn at a phone's, a tablet's or a desktop's
 * width and scaled to its card, so the template's own media queries answer
 * to the width chosen. And the search screen's demo, which narrows its
 * results as an app's server would.
 */

import { enhanceTokens } from "@cplieger/ui/tokens";

const WIDTHS = [
  ["Phone", 390],
  ["Tablet", 820],
  ["Desktop", 1280],
] as const;

for (const [n, view] of [
  ...document.querySelectorAll<HTMLElement>("[data-template-frame]"),
].entries()) {
  const frame = view.querySelector("iframe");
  if (frame === null) {
    continue;
  }
  const name = view.dataset["templateFrame"] ?? "";
  frame.style.setProperty("flex", "none");
  frame.style.setProperty("block-size", "35rem");
  frame.style.setProperty("border", "0");
  frame.style.setProperty("transform", "scale(var(--s, 1))");
  frame.style.setProperty("transform-origin", "0 0");
  const group = document.createElement("div");
  group.className = "cp-segmented";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", `${name}: width`);
  let width: number = innerWidth < 600 ? 390 : 1280;
  const fit = (): void => {
    frame.style.setProperty("inline-size", `${String(width)}px`);
    view.style.setProperty("--s", String(Math.min(1, view.clientWidth / width)));
  };
  for (const [label, w] of WIDTHS) {
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `template-${String(n)}`;
    input.value = String(w);
    input.checked = w === width;
    input.addEventListener("change", () => {
      width = w;
      fit();
    });
    const option = document.createElement("label");
    option.append(input, `${label}, ${String(w)}px`);
    group.append(option);
  }
  view.before(group);
  new ResizeObserver(fit).observe(view);
  fit();
}

const results = document.getElementById("results");
const terms = document.getElementById("search-terms");
const input = terms?.querySelector("input");
const glass = terms?.querySelector(".cp-icon");
const count = document.getElementById("result-count");
const none = document.getElementById("no-results");
if (
  results !== null &&
  terms !== null &&
  input !== null &&
  input !== undefined &&
  glass !== null &&
  glass !== undefined &&
  count !== null &&
  none !== null
) {
  const items = [...results.querySelectorAll<HTMLElement>(":scope > li")];
  const facets = [...document.querySelectorAll<HTMLButtonElement>("[data-facet]")];
  const loader = document.createElement("span");
  loader.className = "cp-loader";
  loader.setAttribute("aria-hidden", "true");
  loader.append(document.createElement("span"));
  let timer = 0;
  const run = (): void => {
    const words = [...chips.values, input.value]
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w !== "");
    const kinds = facets
      .filter((f) => f.getAttribute("aria-pressed") === "true")
      .map((f) => f.dataset["facet"]);
    let shown = 0;
    for (const item of items) {
      unmark(item);
      const text = (item.textContent ?? "").toLowerCase();
      const hit =
        words.every((w) => text.includes(w)) &&
        (kinds.length === 0 || kinds.includes(item.dataset["kind"]));
      item.hidden = !hit;
      if (hit) {
        shown += 1;
        mark(item, words);
      }
    }
    loader.replaceWith(glass);
    results.removeAttribute("aria-busy");
    none.hidden = shown > 0;
    count.textContent = `${String(shown)} result${shown === 1 ? "" : "s"}`;
  };
  const later = (): void => {
    clearTimeout(timer);
    if (glass.isConnected) {
      glass.replaceWith(loader);
    }
    results.setAttribute("aria-busy", "true");
    timer = window.setTimeout(run, 350);
  };
  const chips = enhanceTokens(terms, { onChange: later });
  input.addEventListener("input", later);
  // main.ts flips a chip's aria-pressed on the same click; run reads it later.
  for (const f of facets) {
    f.addEventListener("click", later);
  }
  document.getElementById("clear-search")?.addEventListener("click", () => {
    for (const v of chips.values) {
      chips.remove(v);
    }
    input.value = "";
    for (const f of facets) {
      f.setAttribute("aria-pressed", "false");
    }
    input.focus();
    later();
  });
  run();
}

function unmark(node: HTMLElement): void {
  for (const m of node.querySelectorAll("mark")) {
    m.replaceWith(m.textContent);
  }
  node.normalize();
}

function mark(node: HTMLElement, words: readonly string[]): void {
  if (words.length === 0) {
    return;
  }
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode() !== null) {
    texts.push(walker.currentNode as Text);
  }
  const re = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");
  for (const t of texts) {
    const found = [...t.data.matchAll(re)];
    if (found.length === 0) {
      continue;
    }
    const parts: (string | HTMLElement)[] = [];
    let last = 0;
    for (const m of found) {
      const hit = document.createElement("mark");
      hit.textContent = m[0];
      parts.push(t.data.slice(last, m.index), hit);
      last = m.index + m[0].length;
    }
    parts.push(t.data.slice(last));
    t.replaceWith(...parts);
  }
}
