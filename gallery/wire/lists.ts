/**
 * lists.ts — the gallery's lists and tables that hold their place, on the
 * library.
 */

import { enhanceHeldList, markKept } from "@cplieger/ui/held-list";
import { createIcons } from "@cplieger/ui/icons";
import { enhanceRelativeTime } from "@cplieger/ui/relative-time";

const { icon } = createIcons<string>({ base: new URL("icons/svg/", location.href).href });

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
