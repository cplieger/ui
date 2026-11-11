/**
 * feed.ts — the gallery's lists, feeds and times, on the library.
 */

import { glideShow } from "@cplieger/ui/disclosure";
import { enhanceRelativeTime } from "@cplieger/ui/relative-time";

// A card writes its times as seconds before the page loaded, in data-ago,
// so they read the same on every visit.
for (const time of document.querySelectorAll<HTMLTimeElement>("time[data-ago]")) {
  time.dateTime ||= new Date(Date.now() - Number(time.dataset["ago"]) * 1000).toISOString();
  enhanceRelativeTime(time, { style: time.dataset["style"] === "narrow" ? "narrow" : "long" });
}

const dot = document.querySelector<HTMLElement>("[data-dot-demo]");
const dotWords = dot?.nextElementSibling;
document.querySelector("[data-dot-next]")?.addEventListener("click", () => {
  if (dot == null || dotWords == null) {
    return;
  }
  const live = !dot.hasAttribute("data-live");
  dot.toggleAttribute("data-live", live);
  dot.dataset["tone"] = live ? "success" : "neutral";
  dotWords.textContent = live ? "Checking now" : "Waiting";
});

function arrived(k: number): HTMLLIElement {
  const glyph = document.createElement("span");
  glyph.className = "cp-icon";
  glyph.dataset["cpIcon"] = "plus";
  glyph.setAttribute("aria-hidden", "true");
  const time = document.createElement("time");
  time.dateTime = new Date().toISOString();
  enhanceRelativeTime(time);
  const facts = document.createElement("small");
  facts.append("Grabbed ", time);
  const text = document.createElement("span");
  text.className = "cp-cell-stack";
  text.append(`New grab ${String(k)}`, facts);
  const row = document.createElement("div");
  row.className = "cp-list-row";
  row.tabIndex = -1;
  row.append(glyph, text);
  const item = document.createElement("li");
  item.append(row);
  return item;
}

// Rows that arrive wait behind a line that offers them, so nothing moves
// under the reader (WCAG 3.2.2).
for (const list of document.querySelectorAll<HTMLElement>("[data-hold]")) {
  const words = document.createElement("span");
  const show = document.createElement("button");
  show.className = "cp-button";
  show.dataset["size"] = "sm";
  show.type = "button";
  show.textContent = "Show";
  const line = document.createElement("div");
  line.className = "cp-list-pending";
  line.setAttribute("role", "status");
  line.append(words, show);
  let pending = 0;
  show.addEventListener("click", () => {
    let first: HTMLLIElement | undefined;
    for (let k = pending; k > 0; k--) {
      first = arrived(k);
      list.prepend(first);
    }
    pending = 0;
    line.remove();
    first?.querySelector<HTMLElement>(".cp-list-row")?.focus();
  });
  document.querySelector(`[data-hold-push="${list.id}"]`)?.addEventListener("click", () => {
    pending += 3;
    words.textContent = `${String(pending)} newer rows`;
    if (!line.isConnected) {
      line.hidden = true;
      list.before(line);
      glideShow(line, true);
    }
  });
}
