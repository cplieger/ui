/**
 * lists.ts — the gallery's lists on the library: one list set by its
 * attributes, and the lists and tables that hold their place.
 */

import { enhanceHeldList, markKept } from "@cplieger/ui/held-list";
import { createIcons } from "@cplieger/ui/icons";
import { enhanceRelativeTime } from "@cplieger/ui/relative-time";

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

interface Shape {
  readonly lead: string;
  readonly two: boolean;
  readonly toggles: boolean;
}

function entryRow(e: Entry, on: boolean, how: Shape): HTMLLIElement {
  const row = document.createElement(how.toggles ? "button" : "a");
  row.className = "cp-list-row";
  if (row instanceof HTMLButtonElement) {
    row.type = "button";
    row.setAttribute("aria-pressed", String(on));
  } else if (row instanceof HTMLAnchorElement) {
    row.href = "#lists";
    if (on) {
      row.setAttribute("aria-current", "page");
    }
  }
  if (how.lead === "icon") {
    row.append(icon(e.glyph));
  } else if (how.lead === "cover") {
    const cover = document.createElement("span");
    cover.className = "cp-cover";
    cover.dataset["harmony"] = e.harmony;
    cover.append(icon(e.glyph));
    row.append(cover);
  }
  const name = document.createElement("span");
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
  const item = document.createElement("li");
  item.append(row);
  return item;
}

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
    const how = {
      lead: pick("lead"),
      two: pick("lines") === "two",
      toggles: pick("rows") === "toggles",
    };
    sample.replaceChildren(
      ...ENTRIES.map((e, i) => entryRow(e, how.toggles ? pressed.has(i) : i === open, how)),
    );
  };
  settings.addEventListener("change", render);
  sample.addEventListener("click", (event) => {
    const row = event.target instanceof Element ? event.target.closest(".cp-list-row") : null;
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
    }
  });
  render();
}

/** Runs `tick` every two seconds between one press of `of`'s live button
 *  and the next, which is the card's pause control; nothing runs on load. */
function live(of: string, tick: () => void): void {
  const button = document.querySelector<HTMLButtonElement>(`[data-hold-live="${of}"]`);
  let timer: ReturnType<typeof setInterval> | undefined;
  button?.addEventListener("click", () => {
    const on = timer === undefined;
    clearInterval(timer);
    timer = on ? setInterval(tick, 2000) : undefined;
    button.replaceChildren(
      icon(on ? "pause" : "play"),
      on ? "Pause live changes" : "Start live changes",
    );
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
      log.prepend(item);
      while (log.children.length > 6) {
        log.lastElementChild?.remove();
      }
      return [item];
    });
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
}
