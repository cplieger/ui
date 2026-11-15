/**
 * keyed.ts — the gallery's long activity log on the keyed list: a year of
 * passes, problems and grabs under day headings, its rows of mixed heights.
 */

import { enhanceDisclosure } from "@cplieger/ui/disclosure";
import { createIcons } from "@cplieger/ui/icons";
import { enhanceKeyedList } from "@cplieger/ui/keyed-list";

const { icon } = createIcons<string>({ base: new URL("icons/svg/", location.href).href });

interface Event {
  readonly id: string;
  readonly at: Date;
  readonly glyph: string;
  readonly tone: string;
  /** The words before the row's link, the link's own, and after it. */
  readonly words: readonly [string, string, string];
  readonly href: string;
  readonly more?: string;
  readonly phases?: string;
}

interface Day {
  readonly id: string;
  readonly at: Date;
  readonly events: Event[];
}

const TITLES = [
  "Frieren S1",
  "Dandadan S1",
  "Mob Psycho 100 II",
  "Delicious in Dungeon S1",
  "Mushishi S2",
  "The Boy and the Heron",
  "Odd Taxi",
  "Haikyu S4",
];

const COMPONENTS = ["SeaDex", "Sonarr", "Radarr", "Prowlarr"];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The same log on every load: a small seeded generator (mulberry32). */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const pick = <T>(of: readonly T[], r: number): T => of[Math.floor(r * of.length)] as T;

function eventAt(id: string, at: Date, r: () => number): Event {
  const kind = r();
  const title = pick(TITLES, r());
  if (kind < 0.45) {
    const full = r() < 0.3;
    const changed = Math.floor(r() * 4);
    const states = changed === 1 ? "1 state changed" : `${String(changed)} states changed`;
    return full
      ? {
          id,
          at,
          glyph: "refresh-cw",
          tone: "success",
          words: ["", "Full check", ` done in 6 m 12 s · 659 copies · ${states}`],
          href: "#checks",
          phases:
            "Read SeaDex 14 s · read Sonarr 2 m 4 s · read Radarr 31 s · read Nyaa's feed 9 s · judged 3 m 14 s",
        }
      : {
          id,
          at,
          glyph: "refresh-cw",
          tone: "success",
          words: ["", "Quick check", ` done in 4 s · 2 entries judged · ${states}`],
          href: "#checks",
        };
  }
  if (kind < 0.85) {
    const failed = r() < 0.15;
    return {
      id,
      at,
      glyph: "download",
      tone: failed ? "danger" : "success",
      words: failed
        ? ["Download failed, blocklisted by Sonarr: ", title, ""]
        : ["Imported: ", title, " · grabbed from the feed"],
      href: `#entry-${String(TITLES.indexOf(title))}`,
      more: `[SubsPlease] ${title} (1080p) · Nyaa`,
    };
  }
  const component = pick(COMPONENTS, r());
  return r() < 0.5
    ? {
        id,
        at,
        glyph: "circle-x",
        tone: "danger",
        words: ["Problem: ", component, " unreachable · ongoing"],
        href: `#component-${component.toLowerCase()}`,
      }
    : {
        id,
        at,
        glyph: "check-check",
        tone: "success",
        words: [
          "Problem ended: ",
          component,
          ` unreachable · lasted ${String(2 + Math.floor(r() * 50))} m`,
        ],
        href: `#component-${component.toLowerCase()}`,
      };
}

/** A year of days, newest first, each with 4 to 44 events newest first. */
function activity(now: number): Day[] {
  const r = seeded(17);
  const today = new Date(now);
  const [year, month, date] = [today.getFullYear(), today.getMonth(), today.getDate()];
  const days: Day[] = [];
  for (let d = 0; d < 365; d += 1) {
    // Built from the calendar fields, each start is its day's first local
    // time, where a clock change skips midnight too.
    const at = new Date(year, month, date - d);
    const next = new Date(year, month, date - d + 1);
    const span = d === 0 ? now - at.getTime() : next.getTime() - at.getTime();
    const count = 4 + Math.floor(r() * 41);
    const events = Array.from({ length: count }, (_, i) =>
      eventAt(`e${String(d)}-${String(i)}`, new Date(at.getTime() + r() * span), r),
    );
    events.sort((a, b) => b.at.getTime() - a.at.getTime());
    days.push({ id: `day:${String(d)}`, at, events });
  }
  return days;
}

const lang = document.documentElement.lang;
const dayWords = new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long" });
const yearWords = new Intl.DateTimeFormat(lang, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const relative = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
const clock = new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" });

function heading(day: Day, now: Date): HTMLLIElement {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  // Midnight to midnight, rounded, as a day of a clock change is 23 or 25 hours.
  const back = Math.round((midnight.getTime() - day.at.getTime()) / DAY);
  const h = document.createElement("h3");
  h.className = "cp-list-heading";
  if (back < 2) {
    const words = relative.format(-back, "day");
    h.textContent = words.charAt(0).toUpperCase() + words.slice(1);
  } else {
    h.textContent = (day.at.getFullYear() === now.getFullYear() ? dayWords : yearWords).format(
      day.at,
    );
  }
  const li = document.createElement("li");
  li.append(h);
  return li;
}

function eventItem(e: Event, opened: Set<string>): HTMLLIElement {
  const mark = document.createElement("span");
  mark.dataset["part"] = "mark";
  mark.dataset["tone"] = e.tone;
  mark.append(icon(e.glyph));
  const [before, linked, after] = e.words;
  const link = document.createElement("a");
  link.href = e.href;
  link.textContent = linked;
  const words = document.createElement("p");
  words.append(before, link, after);
  const body = document.createElement("div");
  body.append(words);
  if (e.more !== undefined) {
    const more = document.createElement("p");
    more.textContent = e.more;
    body.append(more);
  }
  if (e.phases !== undefined) {
    const summary = document.createElement("summary");
    summary.append(icon("chevron-right"), "Phases");
    const phases = document.createElement("p");
    phases.textContent = e.phases;
    const details = document.createElement("details");
    details.open = opened.has(e.id);
    details.append(summary, phases);
    // The row is made again each time it scrolls back into view, so the
    // open sections are the app's state, kept by key.
    details.addEventListener("toggle", () => {
      if (details.open) {
        opened.add(e.id);
      } else {
        opened.delete(e.id);
      }
    });
    enhanceDisclosure(details);
    body.append(details);
  }
  const time = document.createElement("time");
  time.dateTime = e.at.toISOString();
  time.textContent = clock.format(e.at);
  const end = document.createElement("span");
  end.dataset["part"] = "end";
  end.append(time);
  const row = document.createElement("div");
  row.className = "cp-list-row";
  row.dataset["lines"] = "wrap";
  row.append(mark, body, end);
  const li = document.createElement("li");
  li.append(row);
  return li;
}

const logList = document.getElementById("k-log");
if (logList instanceof HTMLOListElement) {
  const now = new Date();
  const days = activity(now.getTime());
  const opened = new Set<string>();
  let byKey = new Map<string, Day | Event>();
  const keys = (): string[] => {
    byKey = new Map();
    return days.flatMap((day) => {
      byKey.set(day.id, day);
      for (const e of day.events) {
        byKey.set(e.id, e);
      }
      return [day.id, ...day.events.map((e) => e.id)];
    });
  };
  const list = enhanceKeyedList(logList, {
    keys: keys(),
    row: (key) => {
      const item = byKey.get(key);
      if (item === undefined) {
        throw new TypeError(`no event ${key}`);
      }
      return "events" in item ? heading(item, now) : eventItem(item, opened);
    },
  });
  const r = seeded(now.getTime());
  let added = 0;
  document.querySelector("[data-keyed-newer]")?.addEventListener("click", () => {
    added += 1;
    days[0]?.events.unshift(eventAt(`new${String(added)}`, new Date(), r));
    list.update(keys());
  });
}
