/**
 * lists.ts — the gallery's lists on the library: one list set by its
 * attributes, the lists, log and table that hold their place, a long list
 * keyed by its titles, the pages that Load older and Show older add, and a
 * provider's status row whose test fails again.
 */

import { enhanceConfirm } from "@cplieger/ui/confirm";
import { enhanceHeldList } from "@cplieger/ui/held-list";
import { createIcons } from "@cplieger/ui/icons";
import { enhanceKeyedList } from "@cplieger/ui/keyed-list";
import { markKept } from "@cplieger/ui/list-row";
import { enhanceLoadMore, type LoadMorePage } from "@cplieger/ui/load-more";
import { enhanceRelativeTime } from "@cplieger/ui/relative-time";
import { toast } from "@cplieger/ui/toast";

const { icon } = createIcons<string>({ base: new URL("icons/svg/", location.href).href });

interface Entry {
  readonly title: string;
  readonly facts: string;
  readonly glyph: string;
  readonly harmony: string;
  readonly fresh: number;
  readonly ago: number;
}

const ENTRIES: readonly Entry[] = [
  {
    title: "Frieren: Beyond Journey's End",
    facts: "Sonarr, TV, 2023",
    glyph: "tv",
    harmony: "1",
    fresh: 3,
    ago: 240,
  },
  {
    title: "The Boy and the Heron",
    facts: "Radarr, film, 2023",
    glyph: "film",
    harmony: "2",
    fresh: 1,
    ago: 5400,
  },
  {
    title: "Delicious in Dungeon",
    facts: "Sonarr, TV, 2024",
    glyph: "tv",
    harmony: "3",
    fresh: 12,
    ago: 86_400,
  },
  {
    title: "Mushishi",
    facts: "Sonarr, TV, 2005",
    glyph: "tv",
    harmony: "4",
    fresh: 2,
    ago: 259_200,
  },
];

/** A row is the one link or toggle, or it holds a title link and one
 *  worded action or ⋯ menu at its end. */
type Rows = "links" | "toggles" | "action" | "menu";

interface Shape {
  readonly lead: string;
  readonly two: boolean;
  readonly rows: Rows;
}

function rowFor(rows: Rows, on: boolean): HTMLElement {
  switch (rows) {
    case "toggles": {
      const row = document.createElement("button");
      row.type = "button";
      row.setAttribute("aria-pressed", String(on));
      return row;
    }
    case "links": {
      const row = document.createElement("a");
      row.href = "#lists";
      if (on) {
        row.setAttribute("aria-current", "page");
      }
      return row;
    }
    case "action":
    case "menu":
      return document.createElement("div");
  }
}

function endAction(e: Entry, rows: Rows): HTMLElement | null {
  if (rows !== "action" && rows !== "menu") {
    return null;
  }
  const button = document.createElement("button");
  button.className = "cp-button";
  button.type = "button";
  button.dataset["size"] = "sm";
  if (rows === "action") {
    button.setAttribute("aria-label", `Search ${e.title}`);
    button.append(icon("search"), "Search");
  } else {
    const name = `More for ${e.title}`;
    button.dataset["variant"] = "quiet";
    button.setAttribute("popovertarget", "m-row");
    button.setAttribute("aria-label", name);
    button.dataset["cpTip"] = name;
    button.append(icon("ellipsis"));
  }
  return button;
}

function entryRow(e: Entry, on: boolean, how: Shape): HTMLLIElement {
  const row = rowFor(how.rows, on);
  row.className = "cp-list-row";
  if (how.lead === "icon") {
    row.append(icon(e.glyph));
  } else if (how.lead === "cover") {
    const cover = document.createElement("span");
    cover.className = "cp-cover";
    cover.dataset["harmony"] = e.harmony;
    cover.append(icon(e.glyph));
    row.append(cover);
  }
  const action = endAction(e, how.rows);
  const name = document.createElement(action === null ? "span" : "a");
  if (name instanceof HTMLAnchorElement) {
    name.href = "#lists";
  }
  name.className = "cp-truncate";
  name.textContent = e.title;
  const text = document.createElement("span");
  text.className = "cp-cell-stack";
  text.append(name);
  if (how.two) {
    const facts = document.createElement("small");
    facts.className = "cp-truncate";
    facts.textContent = e.facts;
    text.append(facts);
  }
  const time = document.createElement("time");
  time.dateTime = new Date(Date.now() - e.ago * 1000).toISOString();
  enhanceRelativeTime(time);
  const hidden = document.createElement("span");
  hidden.className = "cp-visually-hidden";
  hidden.textContent = " new";
  const count = document.createElement("span");
  count.className = "cp-badge";
  count.dataset["variant"] = "quiet";
  count.append(String(e.fresh), hidden);
  const counts = document.createElement("span");
  counts.className = "cp-cluster";
  counts.append(count);
  const end = document.createElement("span");
  end.dataset["part"] = "end";
  end.append(time, counts);
  row.append(text, end);
  if (action !== null) {
    row.append(action);
  }
  const item = document.createElement("li");
  item.append(row);
  return item;
}

const ROWS: readonly Rows[] = ["links", "toggles", "action", "menu"];

// The settings card's one list: each control sets one of its attributes or
// the rows' shape, and a click moves the open row or flips a toggle.
const sample = document.getElementById("ls-sample");
const settings = document.getElementById("ls-settings");
if (sample instanceof HTMLUListElement && settings !== null) {
  const pick = (name: string) =>
    settings.querySelector<HTMLInputElement>(`input[name="ls-${name}"]:checked`)?.value ?? "";
  let open = 0;
  const pressed = new Set([0, 2]);
  const render = () => {
    for (const attr of ["density", "surface", "divider"]) {
      const value = pick(attr);
      if (value === "") {
        sample.removeAttribute(`data-${attr}`);
      } else {
        sample.setAttribute(`data-${attr}`, value);
      }
    }
    const how: Shape = {
      lead: pick("lead"),
      two: pick("lines") === "two",
      rows: ROWS.find((r) => r === pick("rows")) ?? "links",
    };
    sample.replaceChildren(
      ...ENTRIES.map((e, i) =>
        entryRow(e, how.rows === "toggles" ? pressed.has(i) : i === open, how),
      ),
    );
  };
  settings.addEventListener("change", render);
  sample.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }
    const target = event.target;
    const row = target.closest(".cp-list-row");
    const rows = [...sample.querySelectorAll(".cp-list-row")];
    const at = row === null ? -1 : rows.indexOf(row);
    if (row instanceof HTMLButtonElement) {
      const on = row.getAttribute("aria-pressed") !== "true";
      row.setAttribute("aria-pressed", String(on));
      if (on) {
        pressed.add(at);
      } else {
        pressed.delete(at);
      }
    } else if (row instanceof HTMLAnchorElement) {
      event.preventDefault();
      rows[open]?.removeAttribute("aria-current");
      row.setAttribute("aria-current", "page");
      open = at;
    } else if (target.closest("a") !== null) {
      event.preventDefault();
    } else if (target.closest(".cp-button:not([popovertarget])") !== null) {
      toast({ kind: "info", title: "Search started" });
    }
  });
  render();
}

/** Runs `tick` every two seconds between one press of `of`'s live button
 *  and the next, which is the card's pause control, or until `tick` says
 *  `false`; nothing runs on load. */
function live(of: string, tick: () => boolean | undefined): void {
  const button = document.querySelector<HTMLButtonElement>(`[data-hold-live="${of}"]`);
  let timer: ReturnType<typeof setInterval> | undefined;
  const run = (on: boolean): void => {
    clearInterval(timer);
    timer = on
      ? setInterval(() => {
          if (tick() === false) {
            run(false);
          }
        }, 2000)
      : undefined;
    button?.replaceChildren(
      icon(on ? "pause" : "play"),
      on ? "Pause live changes" : "Start live changes",
    );
  };
  button?.addEventListener("click", () => {
    run(timer === undefined);
  });
}

interface Activity {
  readonly glyph: string;
  readonly tone: string;
  readonly what: string;
  readonly facts: string;
}

const ARRIVALS: readonly Activity[] = [
  {
    glyph: "refresh-cw",
    tone: "success",
    what: "Quick check",
    facts: "3 s · 1 entry judged · no state changed",
  },
  {
    glyph: "download",
    tone: "success",
    what: "Grabbed: Frieren",
    facts: "Sonarr S1 · [Arid] Frieren S01 (BD 1080p) · Nyaa",
  },
  { glyph: "circle-x", tone: "danger", what: "Problem: Radarr unreachable", facts: "Ongoing" },
  {
    glyph: "check-check",
    tone: "success",
    what: "Problem ended: Radarr unreachable",
    facts: "Lasted 4 m",
  },
];

function activityRow(a: Activity): HTMLLIElement {
  const glyph = icon(a.glyph);
  glyph.dataset["tone"] = a.tone;
  const facts = document.createElement("small");
  facts.textContent = a.facts;
  const text = document.createElement("span");
  text.className = "cp-cell-stack";
  text.append(a.what, facts);
  const time = document.createElement("time");
  time.dateTime = new Date().toISOString();
  enhanceRelativeTime(time);
  const end = document.createElement("span");
  end.dataset["part"] = "end";
  end.append(time);
  const row = document.createElement("a");
  row.className = "cp-list-row";
  row.href = "#lists";
  row.append(glyph, text, end, icon("chevron-right"));
  const item = document.createElement("li");
  item.append(row);
  return item;
}

// The activity log keeps its newest rows, as a status panel's first page
// does, so the card keeps its height.
const log = document.getElementById("hold-log");
if (log instanceof HTMLUListElement) {
  const held = enhanceHeldList(log);
  let next = 0;
  live(log.id, () => {
    const arrival = ARRIVALS[next++ % ARRIVALS.length];
    if (arrival === undefined) {
      return;
    }
    held.change(() => {
      const item = activityRow(arrival);
      const since = log.querySelector(":scope > .cp-since");
      if (since === null) {
        log.prepend(item);
      } else {
        since.after(item);
      }
      while (log.querySelectorAll(":scope > li:not(.cp-since)").length > 6) {
        log.lastElementChild?.remove();
      }
      return [item];
    });
  });
}

interface Step {
  readonly glyph: string;
  readonly tone?: string;
  readonly what: string;
}

const STEPS: readonly Step[] = [
  { glyph: "refresh-cw", what: "Full check started" },
  { glyph: "globe", what: "Read SeaDex: 1,206 entries" },
  { glyph: "tv", what: "Read Sonarr: 413 series" },
  { glyph: "film", what: "Read Radarr: 96 films" },
  { glyph: "radio-tower", what: "Read Nyaa's feed: 321 releases" },
  { glyph: "scale", what: "Judged 509 copies: 1 state changed" },
  { glyph: "download", tone: "success", what: "Grabbed: Dandadan S1 from Nyaa" },
  { glyph: "check-check", tone: "success", what: "Full check done in 2 m 4 s" },
];

function stepRow({ glyph, tone, what }: Step): HTMLLIElement {
  const mark = icon(glyph);
  if (tone !== undefined) {
    mark.dataset["tone"] = tone;
  }
  const text = document.createElement("span");
  text.className = "cp-cell-stack";
  text.textContent = what;
  const time = document.createElement("time");
  time.dateTime = new Date().toISOString();
  enhanceRelativeTime(time);
  const end = document.createElement("span");
  end.dataset["part"] = "end";
  end.append(time);
  const row = document.createElement("div");
  row.className = "cp-list-row";
  row.append(mark, text, end);
  const item = document.createElement("li");
  item.append(row);
  return item;
}

// A log oldest first: each press runs one full check, a step every two
// seconds, appended at the log's end.
const steps = document.getElementById("hold-steps");
if (steps instanceof HTMLOListElement) {
  const held = enhanceHeldList(steps, { edge: "end" });
  let next = 0;
  live(steps.id, () => {
    const step = STEPS[next];
    next = (next + 1) % STEPS.length;
    if (step !== undefined) {
      held.change(() => {
        const item = stepRow(step);
        steps.append(item);
        return [item];
      });
    }
    return next !== 0;
  });
}

type Verdict = "missing" | "worse" | "alt" | "best";

const VERDICTS: Record<
  Verdict,
  { readonly rank: number; readonly tone: string; readonly glyph: string; readonly words: string }
> = {
  missing: { rank: 0, tone: "danger", glyph: "circle-x", words: "Missing" },
  worse: { rank: 1, tone: "warning", glyph: "triangle-alert", words: "Not the best" },
  alt: { rank: 2, tone: "success", glyph: "check", words: "On an alt" },
  best: { rank: 3, tone: "success", glyph: "circle-check", words: "On the best" },
};

const isVerdict = (v: string | undefined): v is Verdict =>
  v !== undefined && Object.hasOwn(VERDICTS, v);

/** Each change moves its copy, and the six bring the table back to its
 *  first order. */
const CHANGES: readonly (readonly [copy: string, verdict: Verdict])[] = [
  ["frieren", "missing"],
  ["ping-pong", "best"],
  ["frieren", "best"],
  ["mushishi", "missing"],
  ["ping-pong", "missing"],
  ["mushishi", "alt"],
];

/** The copies the partial walk did not reach. */
const MISSED = ["mushishi", "frieren"];

const rank = (row: HTMLTableRowElement): number => {
  const v = row.dataset["verdict"];
  return isVerdict(v) ? VERDICTS[v].rank : 0;
};
const title = (row: HTMLTableRowElement): string => row.cells[0]?.textContent ?? "";
const before = (a: HTMLTableRowElement, b: HTMLTableRowElement): boolean =>
  rank(a) < rank(b) || (rank(a) === rank(b) && title(a).localeCompare(title(b)) < 0);

/** Repaints `row`'s verdict and moves it to its sorted place, worst first. */
function setVerdict(body: HTMLTableSectionElement, row: HTMLTableRowElement, v: Verdict): void {
  const { tone, glyph, words } = VERDICTS[v];
  const chip = document.createElement("span");
  chip.className = "cp-chip";
  chip.dataset["tone"] = tone;
  chip.append(icon(glyph), words);
  row.cells[1]?.replaceChildren(chip);
  row.dataset["verdict"] = v;
  markKept(row, null);
  const after = [...body.rows].find((r) => r !== row && before(row, r));
  body.insertBefore(row, after ?? null);
}

const library = document.getElementById("hold-library");
if (library instanceof HTMLTableSectionElement) {
  const held = enhanceHeldList(library, {
    words: { count: (n) => (n === 1 ? "1 row changed" : `${String(n)} rows changed`) },
  });
  const copy = (key: string) =>
    library.querySelector<HTMLTableRowElement>(`tr[data-copy="${CSS.escape(key)}"]`);
  let next = 0;
  live(library.id, () => {
    const [key, verdict] = CHANGES[next++ % CHANGES.length] ?? [];
    if (key === undefined || verdict === undefined) {
      return;
    }
    held.change(() => {
      const row = copy(key);
      if (row === null) {
        return undefined;
      }
      setVerdict(library, row, verdict);
      return [row];
    });
  });
  const partial = document.querySelector<HTMLButtonElement>(`[data-hold-partial="${library.id}"]`);
  partial?.addEventListener("click", () => {
    const end = partial.textContent === "End Sonarr's walk partial";
    const from = new Date();
    from.setHours(3, 0, 0, 0);
    for (const key of MISSED) {
      const row = copy(key);
      if (row !== null) {
        markKept(row, end ? { from, reason: "Sonarr walk partial" } : null);
      }
    }
    partial.textContent = end ? "Complete Sonarr's walk" : "End Sonarr's walk partial";
  });
  const more = document.querySelector<HTMLButtonElement>(`[data-load-copies="${library.id}"]`);
  if (more !== null) {
    enhanceLoadMore(more, {
      load: pager([
        () => ({
          items: [
            copyRow("vinland", "Vinland Saga", "Sonarr, TV, 2019"),
            copyRow("your-name", "Your Name", "Radarr, film, 2016"),
          ],
          more: false,
        }),
      ]),
      words: { count: (n) => (n === 1 ? "1 more copy" : `${String(n)} more copies`) },
    });
  }
}

/** A copy on the best release with no grab, which sorts after every row
 *  the card starts with. */
function copyRow(key: string, name: string, facts: string): HTMLTableRowElement {
  const link = document.createElement("a");
  link.href = "#lists";
  link.textContent = name;
  const meta = document.createElement("span");
  meta.className = "cp-meta";
  meta.textContent = facts;
  const stack = document.createElement("div");
  stack.className = "cp-cell-stack";
  stack.append(link, meta);
  const { tone, glyph, words } = VERDICTS.best;
  const chip = document.createElement("span");
  chip.className = "cp-chip";
  chip.dataset["tone"] = tone;
  chip.append(icon(glyph), words);
  const none = document.createElement("span");
  none.className = "cp-meta";
  none.textContent = "None";
  const row = document.createElement("tr");
  row.dataset["copy"] = key;
  row.dataset["verdict"] = "best";
  row.insertCell().append(stack);
  row.insertCell().append(chip);
  row.insertCell().append(none);
  return row;
}

interface Title {
  readonly id: string;
  readonly title: string;
  readonly seen: number;
}

const NAMES = [
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

function titleItem(t: Title): HTMLLIElement {
  const link = document.createElement("a");
  link.className = "cp-truncate";
  link.href = `#${t.id}`;
  link.textContent = t.title;
  const text = document.createElement("span");
  text.className = "cp-cell-stack";
  text.append(link);
  const end = document.createElement("span");
  end.dataset["part"] = "end";
  end.textContent = `${String(t.seen)} of 26 episodes`;
  const row = document.createElement("div");
  row.className = "cp-list-row";
  row.append(text, end);
  const li = document.createElement("li");
  li.append(row);
  return li;
}

// The server sends the titles a page at a time, so a page not come yet is
// an undefined key, which the list draws as skeleton rows and asks for.
const longList = document.getElementById("v-list");
const longCount = document.getElementById("v-count");
if (longList instanceof HTMLUListElement && longCount !== null) {
  const PAGE = 100;
  let all: readonly Title[] = Array.from({ length: 20_000 }, (_, i) => ({
    id: `t${String(i)}`,
    title: `${NAMES[i % NAMES.length] ?? ""} ${String(Math.floor(i / NAMES.length) + 1)}`,
    seen: (i * 7) % 26,
  }));
  let byId = new Map(all.map((t) => [t.id, t]));
  let view = all;
  let pages = new Set([0]);
  const keys = () => view.map((t, i) => (pages.has(Math.floor(i / PAGE)) ? t.id : undefined));
  const list = enhanceKeyedList(longList, {
    keys: keys(),
    of: all.length,
    count: longCount,
    row: (id) => titleItem(byId.get(id) ?? { id, title: id, seen: 0 }),
    need: (start, end) => {
      const asked = pages;
      setTimeout(() => {
        for (let p = Math.floor(start / PAGE); p * PAGE < end; p += 1) {
          asked.add(p);
        }
        if (asked === pages) {
          list.update(keys());
        }
      }, 600);
    },
  });
  const filter = document.getElementById("v-filter");
  filter?.addEventListener("input", () => {
    const q = filter instanceof HTMLInputElement ? filter.value.trim().toLowerCase() : "";
    view = q === "" ? all : all.filter((t) => t.title.toLowerCase().includes(q));
    pages = new Set([0]);
    list.reset(keys(), all.length);
  });
  document.querySelector(`[data-live-update="${longList.id}"]`)?.addEventListener("click", () => {
    all = all.map((t) => (Math.random() < 0.3 ? { ...t, seen: Math.min(26, t.seen + 1) } : t));
    byId = new Map(all.map((t) => [t.id, t]));
    view = view.map((t) => byId.get(t.id) ?? t);
    for (const t of view) {
      const end = list.rowOf(t.id)?.querySelector('[data-part="end"]');
      const words = `${String(t.seen)} of 26 episodes`;
      if (end != null && end.textContent !== words) {
        end.textContent = words;
      }
    }
    list.update(keys());
  });
}

/** The gallery's stand-in for a page request: 600 ms, and the second
 *  request of a card fails once, so its Retry shows. */
function pager(
  pages: readonly (() => LoadMorePage)[],
): (signal: AbortSignal) => Promise<LoadMorePage> {
  let asked = 0;
  let next = 0;
  return (signal) =>
    new Promise((resolve, reject) => {
      asked += 1;
      const fail = asked === 2;
      const timer = setTimeout(() => {
        const page = pages[next];
        if (fail || page === undefined) {
          reject(new Error("The server did not answer."));
          return;
        }
        next += 1;
        resolve(page());
      }, 600);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
      });
    });
}

const weeksAgo = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function historyEvent(
  tone: string,
  glyph: string,
  word: string,
  rest: string,
  weeks: number,
): HTMLLIElement {
  const mark = document.createElement("span");
  mark.dataset["part"] = "mark";
  mark.dataset["tone"] = tone;
  mark.append(icon(glyph));
  const strong = document.createElement("strong");
  strong.textContent = word;
  const words = document.createElement("p");
  words.append(strong, rest);
  const body = document.createElement("div");
  body.append(words);
  const time = document.createElement("time");
  time.dateTime = new Date(Date.now() - weeks * 604_800_000).toISOString();
  time.textContent = weeksAgo.format(-weeks, "week");
  const end = document.createElement("span");
  end.dataset["part"] = "end";
  end.append(time);
  const row = document.createElement("div");
  row.className = "cp-list-row";
  row.dataset["lines"] = "wrap";
  row.append(mark, body, end);
  const item = document.createElement("li");
  item.append(row);
  return item;
}

function historyWeek(weeks: number): LoadMorePage {
  const when = weeksAgo.format(-weeks, "week");
  const heading = document.createElement("h3");
  heading.className = "cp-list-heading";
  heading.textContent = when.charAt(0).toUpperCase() + when.slice(1);
  const list = document.createElement("ol");
  list.className = "cp-list";
  list.dataset["variant"] = "timeline";
  list.dataset["surface"] = "plain";
  list.append(
    historyEvent("neutral", "search", "Checked", " against SeaDex", weeks),
    historyEvent("success", "download", "Grabbed", " a web release", weeks),
  );
  return { items: [heading, list], more: weeks < 3 };
}

const older = document.querySelector<HTMLButtonElement>("button[data-load-older]");
if (older !== null) {
  enhanceLoadMore(older, {
    load: pager([() => historyWeek(2), () => historyWeek(3)]),
    words: {
      count: (n) => (n === 1 ? "1 older event" : `${String(n)} older events`),
      failed: "The older events did not load.",
    },
  });
}

const POSTS = [
  { author: "@kiro", subject: "Feed scroll", body: "Who holds internal/feed this week?" },
  { author: "@codex", subject: "Reservation queue", body: "I can take it after the jump lands." },
  { author: "@gpt", subject: "Phone check", body: "The composer keeps clear of the keyboard." },
];

function olderPost(post: (typeof POSTS)[number], at: Date): HTMLLIElement {
  const author = document.createElement("a");
  author.href = `#agent-${post.author.slice(1)}`;
  author.textContent = post.author;
  const time = document.createElement("time");
  time.dateTime = at.toISOString();
  enhanceRelativeTime(time);
  const header = document.createElement("header");
  header.append(author, time);
  const subject = document.createElement("h3");
  subject.textContent = post.subject;
  const text = document.createElement("p");
  text.className = "cp-feed-text";
  text.textContent = post.body;
  const item = document.createElement("li");
  item.className = "cp-feed-entry";
  item.append(header, subject, text, document.createElement("footer"));
  return item;
}

const dayWords = new Intl.DateTimeFormat(document.documentElement.lang, {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** A day of older posts, `days` before the conversation's first. */
function olderDay(days: number, more: boolean): LoadMorePage {
  const at = new Date(Date.now() - (days + 2) * 86_400_000);
  const day = document.createElement("li");
  day.className = "cp-feed-day";
  const time = document.createElement("time");
  time.dateTime = at.toISOString().slice(0, 10);
  time.textContent = dayWords.format(at);
  day.append(time);
  const posts = POSTS.map((post, i) => olderPost(post, new Date(at.getTime() + i * 1_800_000)));
  return { items: [day, ...posts], more };
}

const showOlder = document.querySelector<HTMLButtonElement>("button[data-msg-older]");
if (showOlder !== null) {
  enhanceLoadMore(showOlder, {
    edge: "start",
    load: pager([() => olderDay(1, true), () => olderDay(2, false)]),
    words: { failed: "The older messages did not load." },
  });
}

// The provider's key is still refused, so each test ends in the same failure.
for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-status-test]")) {
  const test = enhanceConfirm(button, { busy: "Testing…", done: "Passed" });
  const name = button.dataset["statusTest"] ?? "";
  button.addEventListener("click", () => {
    test
      .run(
        () =>
          new Promise<never>((_, refuse) => {
            setTimeout(() => {
              refuse(new Error("401 Unauthorized"));
            }, 900);
          }),
      )
      .catch(() => {
        toast({ kind: "error", title: `${name} still refuses the API key` });
      });
  });
}
