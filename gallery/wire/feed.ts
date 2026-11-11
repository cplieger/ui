/**
 * feed.ts — the gallery's lists, feeds and times, on the library.
 */

import { announce, installAnnouncer } from "@cplieger/ui/announce";
import { enhanceConnectionTest } from "@cplieger/ui/connection-test";
import { glideShow } from "@cplieger/ui/disclosure";
import { enhanceRelativeTime } from "@cplieger/ui/relative-time";
import { enhanceReorder } from "@cplieger/ui/reorder";

installAnnouncer();

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

interface Title {
  readonly id: string;
  readonly title: string;
  readonly seen: number;
}

const ROW_H = 48;

function titleRow(id: string): HTMLDivElement {
  const link = document.createElement("a");
  link.className = "cp-truncate";
  link.href = `#${id}`;
  const text = document.createElement("span");
  text.className = "cp-cell-stack";
  text.append(link);
  const count = document.createElement("span");
  count.dataset["part"] = "end";
  const row = document.createElement("div");
  row.className = "cp-list-row";
  row.dataset["id"] = id;
  row.append(text, count);
  return row;
}

// Only the rows in view, and five each side, are in the document, each
// keyed by its id so a live update changes it in place. The focused row
// stays drawn when it scrolls away, so focus never drops to the body.
for (const list of document.querySelectorAll<HTMLElement>(".cp-list[data-virtual]")) {
  const spacer = list.querySelector<HTMLElement>('[data-part="spacer"]');
  const count = document.getElementById(list.dataset["count"] ?? "");
  if (spacer === null || count === null) {
    continue;
  }
  const total = Number(list.dataset["total"]);
  const names = [
    "Frieren",
    "Mushishi",
    "Dungeon",
    "Heron",
    "Monogatari",
    "Ping Pong",
    "Haikyu",
    "Mob Psycho",
    "Odd Taxi",
    "Kaiju",
  ];
  let titles: Title[] = Array.from({ length: total }, (_, i) => ({
    id: `t${String(i)}`,
    title: `${names[i % names.length] ?? ""} ${String(Math.floor(i / names.length) + 1)}`,
    seen: (i * 7) % 26,
  }));
  let view = titles;
  const drawn = new Map<string, HTMLDivElement>();
  const draw = () => {
    spacer.style.blockSize = `${String(view.length * ROW_H)}px`;
    const first = Math.max(0, Math.floor(list.scrollTop / ROW_H) - 5);
    const last = Math.min(view.length, Math.ceil((list.scrollTop + list.clientHeight) / ROW_H) + 5);
    const keep = new Set(view.slice(first, last).map((t) => t.id));
    const focused = document.activeElement?.closest<HTMLElement>(".cp-list-row")?.dataset["id"];
    if (focused !== undefined && drawn.has(focused)) {
      keep.add(focused);
    }
    for (const [id, row] of drawn) {
      if (!keep.has(id)) {
        row.remove();
        drawn.delete(id);
      }
    }
    view.forEach((t, i) => {
      if (!keep.has(t.id)) {
        return;
      }
      let row = drawn.get(t.id);
      if (row === undefined) {
        row = titleRow(t.id);
        drawn.set(t.id, row);
        spacer.append(row);
      }
      row.style.insetBlockStart = `${String(i * ROW_H)}px`;
      const [text, end] = row.children;
      if (text?.firstElementChild != null && end != null) {
        text.firstElementChild.textContent = t.title;
        end.textContent = `${String(t.seen)} of 26 episodes`;
      }
    });
  };
  const counted = () =>
    `${view.length.toLocaleString()} of ${titles.length.toLocaleString()} titles`;
  list.addEventListener("scroll", draw, { passive: true });
  const filter = document.getElementById(list.dataset["filter"] ?? "");
  let say: ReturnType<typeof setTimeout> | undefined;
  filter?.addEventListener("input", () => {
    const q = filter instanceof HTMLInputElement ? filter.value.trim().toLowerCase() : "";
    view = q === "" ? titles : titles.filter((t) => t.title.toLowerCase().includes(q));
    list.scrollTop = 0;
    draw();
    count.textContent = counted();
    clearTimeout(say);
    say = setTimeout(() => {
      announce(counted());
    }, 500);
  });
  document.querySelector(`[data-live-update="${list.id}"]`)?.addEventListener("click", () => {
    titles = titles.map((t) =>
      Math.random() < 0.3 ? { ...t, seen: Math.min(26, t.seen + 1) } : t,
    );
    const shown = new Set(view.map((t) => t.id));
    view = titles.filter((t) => shown.has(t.id));
    draw();
  });
  count.textContent = counted();
  draw();
}

// Stop leaves with its job's end, so focus moves to the job's link first
// rather than drop to the body.
function endJob(job: HTMLElement, words: string, glyph: string, tone: string): void {
  job.dataset["ended"] = "";
  const phase = job.querySelector<HTMLElement>("[data-job-phase]");
  if (phase !== null) {
    const mark = document.createElement("span");
    mark.className = "cp-icon";
    mark.dataset["cpIcon"] = glyph;
    mark.setAttribute("aria-hidden", "true");
    phase.className = "cp-state";
    phase.dataset["tone"] = tone;
    phase.replaceChildren(mark, words);
  }
  const stop = job.querySelector<HTMLElement>("[data-stop]");
  if (stop?.contains(document.activeElement) === true) {
    job.querySelector("a")?.focus();
  }
  stop?.remove();
}

for (const list of document.querySelectorAll<HTMLElement>("[data-jobs]")) {
  const template = list.querySelector("li:has(> .cp-list-row)")?.cloneNode(true);
  setInterval(() => {
    for (const job of list.querySelectorAll<HTMLElement>(".cp-list-row:not([data-ended])")) {
      const bar = job.querySelector("progress");
      const n = job.querySelector("[data-job-n]");
      if (bar === null || n === null) {
        continue;
      }
      bar.value = Math.min(bar.max, bar.value + 1);
      n.textContent = `${String(bar.value)} of ${String(bar.max)}`;
      if (bar.value === bar.max) {
        endJob(job, "Finished", "circle-check", "success");
      }
    }
  }, 700);
  list.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    const job = target?.closest("[data-stop]")?.closest<HTMLElement>(".cp-list-row");
    if (job != null) {
      endJob(job, "Stopped by you", "circle-minus", "neutral");
      announce(`${job.querySelector("[data-job-kind]")?.textContent ?? "The job"} stopped`);
    }
    const foot = target?.closest("[data-more-jobs]")?.closest(".cp-list-foot");
    if (foot == null || !(template instanceof HTMLElement)) {
      return;
    }
    const added = Array.from({ length: 3 }, () => template.cloneNode(true) as HTMLElement);
    for (const item of added) {
      const bar = item.querySelector("progress");
      const n = item.querySelector("[data-job-n]");
      if (bar !== null && n !== null) {
        bar.value = 0;
        n.textContent = `0 of ${String(bar.max)}`;
      }
    }
    foot.before(...added);
    added[0]?.querySelector("a")?.focus();
    foot.remove();
  });
}

for (const list of document.querySelectorAll<HTMLOListElement>("ol[data-reorder]")) {
  enhanceReorder(list);
}

// A provider's test passes after a second for any key, and fails for none.
for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-provider-test]")) {
  const status = document.getElementById(button.dataset["providerTest"] ?? "");
  const key = document.getElementById(button.dataset["key"] ?? "");
  const mark = document.getElementById(`${key?.id ?? ""}-error`);
  const card = button.closest<HTMLElement>("section");
  const name = card?.closest<HTMLElement>("li")?.dataset["name"] ?? "The provider";
  if (status === null || !(key instanceof HTMLInputElement) || mark === null || card === null) {
    continue;
  }
  enhanceConnectionTest(button, status, {
    root: card,
    run: (signal) =>
      new Promise((done, fail) => {
        const timer = setTimeout(() => {
          done(
            key.value.trim() === ""
              ? { ok: false, message: `${name} needs an API key.`, field: "key" }
              : { ok: true, message: `Connected to ${name}` },
          );
        }, 1000);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          fail(new DOMException("The check was ended.", "AbortError"));
        });
      }),
    fields: { key: { input: key, mark } },
  });
}
