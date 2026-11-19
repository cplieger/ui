/**
 * `createHeaderStatus()` keeps the header's status pill, its panel and the
 * urgent banner in step with the app's own model: worst level first, offline
 * only after the stream has been down a while, the panel's rows patched in
 * place by id, and a polite word when things turn worse or come right.
 * @module
 */

import { announce } from "../../feedback/announce/announce.js";
import { markKept } from "../../data/list-row/list-row.js";
import { focusOn, landing } from "../../data/list-row/row.js";
import { enhanceRelativeTime } from "../../data/relative-time/relative-time.js";
import { turnWhile } from "../../buttons/turn/turn.js";
import { ask, type AskOptions } from "../../overlays/ask/ask.js";
import { enhancePanel } from "../../overlays/panel/panel.js";

export type StatusLevel = "problem" | "warning";

export interface StatusCondition {
  /** Stable across updates. */
  readonly id: string;
  readonly level: StatusLevel;
  /** Reaches every screen: its title names the pill unless a worse level
   *  holds, and it stands as the banner in its level's tone. */
  readonly urgent?: boolean;
  /** The condition's sentence, short enough to name the pill when urgent. */
  readonly title: string;
  /** One line each under the title. */
  readonly reasons?: readonly string[];
  /** When it began; the longest-standing comes first within its level. */
  readonly since?: Date | number;
  /** When it was last observed, in an urgent condition's banner. */
  readonly seen?: Date | number;
  /** Where it is fixed: the whole row links there. */
  readonly href?: string;
  /** The banner's one link; without it the banner links `href` as
   *  `words.fix`. */
  readonly docs?: { readonly href: string; readonly label: string };
}

/** The yes or no question a Stop asks first, through `ask()`; destroy()
 *  answers it as declined. */
export interface StopQuestion extends Omit<
  AskOptions,
  "input" | "choices" | "confirmLabel" | "signal"
> {
  readonly message: string;
  readonly confirmLabel?: string;
}

export interface StatusWork {
  readonly id: string;
  /** The work and its scope, "Scanning Sonarr". */
  readonly title: string;
  readonly phase?: string;
  readonly value?: number;
  readonly max?: number;
  /** Waiting to run: shown with Cancel, never counted as running. */
  readonly queued?: boolean;
  readonly href?: string;
  /** `run` settles once the app has asked; its rejection's message is the
   *  row's reason line. The row reads "Stopping…" until it leaves. */
  readonly stop?: { readonly run: () => Promise<void>; readonly ask?: StopQuestion };
}

/** Work the person can start from the panel, the mirror of a Stop. */
export interface StatusStart {
  /** Stable across updates. */
  readonly id: string;
  /** The button's words, "Quick check". */
  readonly label: string;
  /** The button reads "Starting…" until it settles; its rejection's
   *  message is the start's reason line. The started work shows once the
   *  app puts it in `work`. */
  readonly run: () => Promise<void>;
  /** Why it cannot start now, shown under it; the button stays focusable
   *  and pressing it runs nothing. */
  readonly unavailable?: string;
  /** A drawing from `@cplieger/ui/icons` before the label, as `ask()`
   *  takes one; the panel draws its own copy. */
  readonly icon?: Element;
  /** The icon turns while it starts, as `./turn` does. */
  readonly turn?: boolean;
  /** What it does, the button's tip and its description. */
  readonly tip?: string;
}

export interface StatusModel {
  /** Shown first, so they never move. */
  readonly starts?: readonly StatusStart[];
  /** An info button after the starts, "About the checks", whose tip a tap
   *  shows too, since a start's own tip shows only to a mouse or the keys. */
  readonly startsInfo?: { readonly label: string; readonly tip: string };
  readonly conditions: readonly StatusCondition[];
  /** Newest first; the panel shows three: running work first, then the
   *  queue, each in this order. */
  readonly work: readonly StatusWork[];
  /** The idle line while nothing runs, "Next scan 03:00". */
  readonly next?: string;
  /** How many run when the app sends only the newest few. */
  readonly workTotal?: number;
  /** The app's running page, "Show all N running". */
  readonly workHref?: string;
  readonly notices?: readonly {
    readonly id: string;
    readonly title: string;
    readonly href?: string;
  }[];
  /** Newest first; the panel shows the first five. */
  readonly recent?: readonly {
    readonly id: string;
    readonly words: string;
    readonly at: Date | number;
    readonly href?: string;
  }[];
  /** The app's history page, held at the panel's foot. */
  readonly history?: { readonly href: string; readonly label: string };
  /** Retry while offline. */
  readonly reconnect?: () => void;
}

export interface StatusWords {
  /** Default "All good". */
  readonly ok: string;
  /** Default "1 problem", "3 problems". */
  readonly problems: (n: number) => string;
  /** Default "1 warning", "2 warnings". */
  readonly warnings: (n: number) => string;
  /** Several items running. Default "Working: 3". */
  readonly working: (n: number) => string;
  /** The one running item. Default its title, then "3/8" when it has a
   *  value and a max. */
  readonly progress: (work: StatusWork) => string;
  /** The detail while the stream is down and not yet offline. Default
   *  "Reconnecting…". */
  readonly reconnecting: string;
  /** Default "Offline". */
  readonly offline: string;
  /** The panel's heading while offline. Default "Offline since 14:02". */
  readonly offlineSince: (time: string) => string;
  /** Default "Retry". */
  readonly retry: string;
  /** A kept row's line while offline. Default "As of 14:02". */
  readonly asOf: (time: string) => string;
  /** A condition's glyph, for a reader. Default "Problem", "Warning". */
  readonly level: (level: StatusLevel) => string;
  /** The end of a linked condition's name, and its banner link's words.
   *  Default "Details and fix". */
  readonly fix: string;
  /** The words before a banner's last-seen time. Default "Last seen". */
  readonly seen: (condition: StatusCondition) => string;
  /** Default "12 of 40". */
  readonly amount: (value: number, max: number) => string;
  /** The Stop button's name for a reader, from its shown word. Default
   *  "Stop Scanning Sonarr". */
  readonly stopName: (verb: string, work: StatusWork) => string;
  /** Default "Stop", "Cancel", "Stopping…" and "Queued". */
  readonly stop: string;
  readonly cancel: string;
  readonly stopping: string;
  readonly queued: string;
  /** A refused Stop's reason line. Default the error's message, else
   *  "Could not stop". */
  readonly refused: (error: unknown) => string;
  /** A start's word while its `run` is pending. Default "Starting…". */
  readonly starting: string;
  /** A start's name for a reader, from its shown word. Default the label,
   *  then "Starting… Quick check" while it starts. */
  readonly startName: (verb: string, start: StatusStart) => string;
  /** A refused start's reason line. Default the error's message, else
   *  "Could not start". */
  readonly startRefused: (error: unknown) => string;
  /** Default "Show all 12 running". */
  readonly showAll: (n: number) => string;
  /** The sections' headings. Default "Problems and warnings", "Running",
   *  "Notices" and "Recent". */
  readonly sections: {
    readonly conditions: string;
    readonly work: string;
    readonly notices: string;
    readonly recent: string;
  };
}

export interface HeaderStatusOptions {
  readonly words?: Partial<StatusWords>;
  /** Formats the counts and times. Default: the browser's. */
  readonly locale?: string;
  /** How long the stream stays down before the pill turns offline, in ms,
   *  from 0 to 2147483647 (a RangeError otherwise). Default 10000. */
  readonly offlineAfter?: number;
}

export interface HeaderStatusParts {
  /** The `.cp-header-status` button. */
  readonly button: HTMLButtonElement;
  /** Its `.cp-popover.cp-status-panel`, whose content the module writes. */
  readonly panel: HTMLElement;
  /** Where urgent conditions stand as the every-screen banner, first in the
   *  page's banner place. The module owns its children, one `.cp-notice`
   *  each, and hides it while none holds. The banners take no live role:
   *  the pill's announcement already names a new urgent condition. */
  readonly banner?: HTMLElement;
}

export interface HeaderStatus {
  /** Renders `model`, the whole state each time. Throws a RangeError for an
   *  invalid date. */
  update(model: StatusModel): void;
  /** The app's stream dropped (`"lost"`) or came back (`"live"`). */
  connection(state: "live" | "lost"): void;
  /** Stops the offline timer and the panel's listeners and times; later
   *  calls do nothing. The pill and panel keep what they last showed. */
  destroy(): void;
}

type PillState = "offline" | "problem" | "warning" | "working" | "ok";

interface Pill {
  readonly state: PillState;
  readonly words: string;
  readonly detail?: string | undefined;
}

const RANK = { problem: 0, warning: 2 } as const;

const rankOf = (c: StatusCondition): number => RANK[c.level] + (c.urgent === true ? 0 : 1);

const time = (d: Date | number | undefined): number =>
  d === undefined ? Number.POSITIVE_INFINITY : +d;

/** Problems before warnings, urgent first within each; the longest-standing
 *  first within a rank, so a cause comes before what it causes. */
function conditionOrder(conditions: readonly StatusCondition[]): StatusCondition[] {
  return conditions.toSorted((a, b) => rankOf(a) - rankOf(b) || time(a.since) - time(b.since));
}

const isProblem = (c: StatusCondition): boolean => c.level === "problem";

function wordsFor(options: HeaderStatusOptions): StatusWords {
  const n = new Intl.NumberFormat(options.locale);
  const count = (one: string, many: string) => (k: number) =>
    `${n.format(k)} ${k === 1 ? one : many}`;
  return {
    ok: "All good",
    problems: count("problem", "problems"),
    warnings: count("warning", "warnings"),
    working: (k) => `Working: ${n.format(k)}`,
    progress: (w) =>
      w.value !== undefined && w.max !== undefined
        ? `${w.title} ${n.format(w.value)}/${n.format(w.max)}`
        : w.title,
    reconnecting: "Reconnecting…",
    offline: "Offline",
    offlineSince: (t) => `Offline since ${t}`,
    retry: "Retry",
    asOf: (t) => `As of ${t}`,
    level: (l) => (l === "problem" ? "Problem" : "Warning"),
    fix: "Details and fix",
    seen: () => "Last seen",
    amount: (v, m) => `${n.format(v)} of ${n.format(m)}`,
    stopName: (v, x) => `${v} ${x.title}`,
    stop: "Stop",
    cancel: "Cancel",
    stopping: "Stopping…",
    queued: "Queued",
    refused: (e) => (e instanceof Error && e.message !== "" ? e.message : "Could not stop"),
    starting: "Starting…",
    startName: (v, s) => (v === s.label ? v : `${v} ${s.label}`),
    startRefused: (e) => (e instanceof Error && e.message !== "" ? e.message : "Could not start"),
    showAll: (k) => `Show all ${n.format(k)} running`,
    sections: {
      conditions: "Problems and warnings",
      work: "Running",
      notices: "Notices",
      recent: "Recent",
    },
    ...options.words,
  };
}

/** The pill's state and words for `model`, the stream live. */
function pillOf(model: StatusModel, w: StatusWords): Pill {
  const running = model.work.filter((x) => x.queued !== true);
  const total = model.workTotal ?? running.length;
  const [one] = running;
  const work =
    total === 0 ? undefined : total === 1 && one !== undefined ? w.progress(one) : w.working(total);
  const ordered = conditionOrder(model.conditions);
  const problems = ordered.filter(isProblem).length;
  const [first] = ordered;
  if (problems > 0) {
    return first?.urgent === true
      ? { state: "problem", words: first.title, detail: problems > 1 ? w.problems(problems) : work }
      : { state: "problem", words: w.problems(problems), detail: work };
  }
  if (first !== undefined) {
    const many = ordered.length > 1 ? w.warnings(ordered.length) : work;
    return first.urgent === true
      ? { state: "warning", words: first.title, detail: many }
      : { state: "warning", words: w.warnings(ordered.length), detail: work };
  }
  if (work !== undefined) {
    return { state: "working", words: work };
  }
  return { state: "ok", words: w.ok };
}

/** The level the person is told about: 2 for a problem, 1 for a warning. */
const severity = (conditions: readonly StatusCondition[]): number =>
  conditions.some(isProblem) ? 2 : conditions.length > 0 ? 1 : 0;

function writePill(button: HTMLButtonElement, pill: Pill): void {
  button.dataset["state"] = pill.state;
  let words = button.querySelector<HTMLElement>(":scope > span:not([data-part])");
  if (words === null) {
    words = document.createElement("span");
    button.prepend(words);
  }
  if (words.textContent !== pill.words) {
    words.textContent = pill.words;
  }
  let detail = button.querySelector<HTMLElement>(':scope > [data-part="detail"]');
  if (pill.detail === undefined) {
    detail?.remove();
    return;
  }
  if (detail === null) {
    detail = document.createElement("span");
    detail.dataset["part"] = "detail";
    words.after(detail);
  }
  if (detail.textContent !== pill.detail) {
    detail.textContent = pill.detail;
  }
}

type Child = Node | string | false | undefined;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Readonly<Record<string, string | undefined>> = {},
  ...kids: readonly Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value !== undefined) {
      el.setAttribute(name, value);
    }
  }
  for (const kid of kids) {
    if (kid !== false && kid !== undefined) {
      el.append(kid);
    }
  }
  return el;
}

const icon = (name: string, tone?: string): HTMLElement =>
  h("span", { class: "cp-icon", "data-cp-icon": name, "data-tone": tone, "aria-hidden": "true" });

/** A copy of an app's icon, its drawing set through the CSSOM, since a
 *  strict content policy refuses a copied `style` attribute. */
const copyIcon = (from: Element): HTMLElement => {
  const span = h("span", {
    class: "cp-icon",
    "data-cp-icon": from.getAttribute("data-cp-icon") ?? undefined,
    "data-cp-icon-size": from.getAttribute("data-cp-icon-size") ?? undefined,
    "aria-hidden": "true",
  });
  if (from instanceof HTMLElement) {
    span.style.cssText = from.style.cssText;
  }
  return span;
};

const hidden = (text: string): HTMLElement => h("span", { class: "cp-visually-hidden" }, text);

const stamp = (d: Date | number): HTMLTimeElement =>
  h("time", { datetime: new Date(+d).toISOString() });

/** Throws before `model` is kept, so the kept model always renders. */
function checkDates(model: StatusModel): void {
  const dates = [
    ...model.conditions.flatMap((c) => [c.since, c.seen]),
    ...(model.recent ?? []).map((r) => r.at),
  ];
  for (const d of dates) {
    if (d !== undefined && Number.isNaN(new Date(+d).getTime())) {
      throw new RangeError(`createHeaderStatus: invalid date ${String(d)}`);
    }
  }
}

const chevron = (): HTMLElement => icon("chevron-right");

/** A row of a list section: `a.cp-list-row` when it links, else a div. */
function row(href: string | undefined, ...kids: readonly Child[]): HTMLElement {
  return href === undefined
    ? h("div", { class: "cp-list-row" }, ...kids)
    : h("a", { class: "cp-list-row", href }, ...kids, chevron());
}

const item = (key: string | undefined, kid: Node): HTMLLIElement =>
  h("li", { "data-cp-key": key }, kid);

/** Puts `kids` in `parent` in order, removing the rest first, so a child
 *  already in place is never re-inserted: that would drop its focus and
 *  restart its animations. */
function place(parent: Element, kids: readonly Element[]): void {
  const keep = new Set(kids);
  for (const child of [...parent.children]) {
    if (!keep.has(child)) {
      child.remove();
    }
  }
  kids.forEach((kid, i) => {
    const at = parent.children[i];
    if (at !== kid) {
      parent.insertBefore(kid, at ?? null);
    }
  });
}

/** Whether another module wrote this attribute on a node the panel keeps,
 *  so the patch leaves it: the tooltip sets its anchor in `style` and its
 *  own `aria-describedby` on a control with none. The panel writes `style`
 *  only on a copied icon, whose drawing from `@cplieger/ui/icons` always
 *  has one, and describes only by its own `cp-status-` ids. */
const foreign = (name: string, value: string): boolean =>
  name === "style" || (name === "aria-describedby" && !value.startsWith("cp-status-"));

/** Makes `old` read as `fresh`, keeping every node whose tag holds, so a
 *  focused control keeps its focus. A time whose moment holds keeps the
 *  words relative-time keeps current. Returns the node to keep. */
function patch(old: Element, fresh: Element): Element {
  if (old.tagName !== fresh.tagName) {
    return fresh;
  }
  if (old instanceof HTMLTimeElement && old.dateTime === (fresh as HTMLTimeElement).dateTime) {
    return old;
  }
  const focused = old === document.activeElement;
  for (const { name, value } of [...old.attributes]) {
    if (fresh.hasAttribute(name) || (focused && name === "tabindex") || foreign(name, value)) {
      continue;
    }
    old.removeAttribute(name);
  }
  for (const { name, value } of [...fresh.attributes]) {
    if (old.getAttribute(name) === value) {
      continue;
    }
    // A strict content policy refuses a `style` set as an attribute.
    if (name === "style" && old instanceof HTMLElement && fresh instanceof HTMLElement) {
      old.style.cssText = fresh.style.cssText;
    } else {
      old.setAttribute(name, value);
    }
  }
  const was = [...old.childNodes];
  const now = [...fresh.childNodes];
  const alike =
    was.length === now.length &&
    was.every(
      (n, i) =>
        n.nodeType === now[i]?.nodeType &&
        (!(n instanceof Element) || n.tagName === (now[i] as Element).tagName),
    );
  if (!alike) {
    old.replaceChildren(...now);
    return old;
  }
  was.forEach((n, i) => {
    const m = now[i] as Node;
    if (n instanceof Element) {
      const kept = patch(n, m as Element);
      if (kept !== n) {
        n.replaceWith(kept);
      }
    } else if (n.nodeValue !== m.nodeValue) {
      n.nodeValue = m.nodeValue;
    }
  });
  return old;
}

/** Patches `list`'s children to `fresh` by their `data-cp-key`. */
function syncList(list: Element, fresh: readonly HTMLElement[]): void {
  const old = new Map<string | undefined, Element>();
  for (const li of list.children) {
    old.set((li as HTMLElement).dataset["cpKey"], li);
  }
  place(
    list,
    fresh.map((li) => {
      const prior = old.get(li.dataset["cpKey"]);
      return prior === undefined ? li : patch(prior, li);
    }),
  );
}

let seq = 0;

/**
 * Takes over `parts.button`'s state and words and writes `parts.panel`'s
 * content, which it enhances with `enhancePanel`, and `parts.banner`'s. The
 * app calls `update()` with its whole model on every change and
 * `connection()` as its stream drops and returns; the first `update()` is
 * never announced.
 */
export function createHeaderStatus(
  parts: HeaderStatusParts,
  options: HeaderStatusOptions = {},
): HeaderStatus {
  const { button, panel } = parts;
  const { offlineAfter = 10_000, locale } = options;
  // A timer longer than a signed 32-bit count of ms fires at once
  // (https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#timers).
  if (!Number.isFinite(offlineAfter) || offlineAfter < 0 || offlineAfter > 2_147_483_647) {
    throw new RangeError(
      "createHeaderStatus: offlineAfter must be a number of ms from 0 to 2147483647",
    );
  }
  const w = wordsFor(options);
  const clock = new Intl.DateTimeFormat(locale, { timeStyle: "short" });
  const life = new AbortController();
  let model: StatusModel = { conditions: [], work: [] };
  let link: "live" | "lost" | "offline" = "live";
  let lostAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let gone = false;
  let started = false;
  /** What the person was last told: the level, the problems, the ids. */
  let toldLevel = 0;
  let toldProblems = 0;
  let toldIds = new Set<string>();
  /** Trouble was said and the return to all good not yet. */
  let troubled = false;
  /** Each stop in flight by id, its token telling a late answer from an
   *  earlier stop of an item that left and came back. */
  const stopping = new Map<string, object>();
  const refused = new Map<string, string>();
  /** The same for starts, by start id. */
  const starting = new Map<string, object>();
  const startRefused = new Map<string, string>();
  const kept = new Set<Element>();
  /** One signal per shown time, so a time that leaves or is enhanced again
   *  releases its relative-time entry rather than holding it until destroy. */
  const times = new Map<HTMLTimeElement, AbortController>();

  const id = `cp-status-${String(++seq)}`;
  const title = h("h2", { id: `${id}-h`, tabindex: "-1" });
  const retry = h(
    "button",
    { class: "cp-button", "data-size": "sm", type: "button", "data-cp-retry": "" },
    w.retry,
  );
  const head = h("header", {}, title);
  const foot = h("footer");
  const sections = new Map<string, HTMLElement>();
  panel.replaceChildren(head);
  if (!panel.hasAttribute("aria-label") && !panel.hasAttribute("aria-labelledby")) {
    panel.setAttribute("aria-labelledby", title.id);
  }
  enhancePanel(panel, { signal: life.signal });

  const section = (name: string): HTMLElement => {
    let s = sections.get(name);
    if (s === undefined) {
      s = h("section", { "data-cp-status": name });
      sections.set(name, s);
    }
    return s;
  };

  /** A section of one list under its heading, or none when it has no rows. */
  const listSection = (
    name: keyof StatusWords["sections"],
    rows: readonly HTMLLIElement[],
  ): HTMLElement | undefined => {
    if (rows.length === 0) {
      return undefined;
    }
    const s = section(name);
    if (s.childElementCount === 0) {
      s.append(
        h("h3", { class: "cp-list-heading", id: `${id}-${name}`, tabindex: "-1" }),
        h("ul", { class: "cp-list", "data-surface": "plain", "aria-labelledby": `${id}-${name}` }),
      );
    }
    const [heading, list] = s.children as unknown as [HTMLElement, HTMLElement];
    if (heading.textContent !== w.sections[name]) {
      heading.textContent = w.sections[name];
    }
    syncList(list, rows);
    return s;
  };

  const conditionRow = (c: StatusCondition): HTMLLIElement => {
    const problem = isProblem(c);
    const lead = icon(problem ? "circle-x" : "triangle-alert", problem ? "danger" : "warning");
    lead.removeAttribute("aria-hidden");
    lead.setAttribute("role", "img");
    lead.setAttribute("aria-label", w.level(problem ? "problem" : "warning"));
    const body = h(
      "span",
      { class: "cp-cell-stack" },
      h("span", {}, c.title),
      ...(c.reasons ?? []).map((r) => h("small", {}, r)),
    );
    const end = c.since !== undefined && h("span", { "data-part": "end" }, stamp(c.since));
    return item(c.id, row(c.href, lead, body, end, c.href !== undefined && hidden(`, ${w.fix}`)));
  };

  const startItem = (s: StatusStart, i: number): HTMLLIElement => {
    const busy = starting.has(s.id);
    const verb = busy ? w.starting : s.label;
    const reason = s.unavailable ?? startRefused.get(s.id);
    const line = `${id}-start-${String(i)}`;
    const about = `${line}-tip`;
    // The tip's own copy describes the button, so a reader hears the tip
    // whether or not the tooltip is showing.
    const describedBy = [reason === undefined ? "" : line, s.tip === undefined ? "" : about];
    // The line and the tip's copy are always there, hidden when empty, so
    // the button is never re-made, which would drop its focus.
    return h(
      "li",
      { "data-cp-key": s.id },
      h(
        "button",
        {
          class: "cp-button",
          "data-size": "sm",
          type: "button",
          "data-cp-start": s.id,
          "data-cp-tip": s.tip,
          "aria-disabled": busy || s.unavailable !== undefined ? "true" : undefined,
          "aria-busy": busy ? "true" : undefined,
          "aria-label": w.startName(verb, s),
          "aria-describedby": describedBy.filter((x) => x !== "").join(" ") || undefined,
        },
        s.icon !== undefined && copyIcon(s.icon),
        verb,
      ),
      h("small", { id: line, hidden: reason === undefined ? "" : undefined }, reason),
      h(
        "span",
        { id: about, class: "cp-visually-hidden", hidden: s.tip === undefined ? "" : undefined },
        s.tip,
      ),
    );
  };

  const startsInfo = (info: NonNullable<StatusModel["startsInfo"]>): HTMLLIElement =>
    h(
      "li",
      {},
      h(
        "button",
        {
          class: "cp-button",
          "data-variant": "quiet",
          "data-size": "sm",
          type: "button",
          "aria-label": info.label,
          "data-cp-tip": info.tip,
          "data-cp-tip-toggle": "",
        },
        icon("info"),
      ),
    );

  const workRow = (x: StatusWork): HTMLLIElement => {
    const busy = stopping.has(x.id);
    const verb = busy ? w.stopping : x.queued === true ? w.cancel : w.stop;
    const action =
      x.stop !== undefined &&
      h(
        "button",
        {
          class: "cp-button",
          "data-size": "sm",
          type: "button",
          "data-cp-stop": x.id,
          "aria-disabled": busy ? "true" : undefined,
          "aria-label": w.stopName(verb, x),
        },
        verb,
      );
    const whole = x.href !== undefined && action === false;
    const reason = refused.get(x.id);
    const body = h(
      "span",
      { class: "cp-cell-stack" },
      x.href !== undefined && !whole ? h("a", { href: x.href }, x.title) : h("span", {}, x.title),
      reason !== undefined && h("small", { "data-cp-refused": "" }, reason),
    );
    const end =
      x.queued === true &&
      h("span", { "data-part": "end" }, h("span", { class: "cp-state" }, w.queued));
    const amount =
      x.value !== undefined && x.max !== undefined ? w.amount(x.value, x.max) : undefined;
    const line = [amount, x.phase].filter((s) => s !== undefined && s !== "").join(" · ");
    const under = x.queued !== true && [
      h("progress", {
        "aria-label": x.title,
        value: amount === undefined ? undefined : String(x.value),
        max: amount === undefined ? undefined : String(x.max),
      }),
      line !== "" && h("small", {}, line),
    ];
    const tail = under === false ? [] : under;
    return item(
      x.id,
      whole
        ? h("a", { class: "cp-list-row", href: x.href }, body, end, chevron(), ...tail)
        : h("div", { class: "cp-list-row" }, body, end, action, ...tail),
    );
  };

  /** `.cp-notice`'s banner form: with reasons, the stacked head, list and
   *  foot; without, the glyph beside the title and its foot. */
  const bannerOf = (c: StatusCondition): HTMLElement => {
    const to = c.docs ?? (c.href === undefined ? undefined : { href: c.href, label: w.fix });
    const words: Child[] = [];
    if (c.seen !== undefined) {
      words.push(`${w.seen(c)} `, stamp(c.seen), ".");
    }
    if (to !== undefined) {
      words.push(words.length > 0 && " ", h("a", { href: to.href }, to.label));
    }
    const foot = words.length > 0 && h("small", {}, ...words);
    const glyph = isProblem(c) ? "circle-x" : "triangle-alert";
    const attrs = {
      class: "cp-notice",
      "data-variant": "banner",
      "data-tone": isProblem(c) ? "danger" : "warning",
      "data-cp-key": c.id,
    };
    const reasons = c.reasons ?? [];
    return reasons.length > 0
      ? h(
          "div",
          attrs,
          h("strong", {}, icon(glyph), c.title),
          h("ul", {}, ...reasons.map((r) => h("li", {}, r))),
          foot,
        )
      : h(
          "div",
          attrs,
          icon(glyph),
          h("span", {}, h("strong", {}, c.title), foot !== false && " ", foot),
        );
  };

  const renderBanner = (): void => {
    const { banner } = parts;
    if (banner === undefined) {
      return;
    }
    const urgent = conditionOrder(model.conditions).filter((c) => c.urgent === true);
    syncList(banner, urgent.map(bannerOf));
    banner.hidden = urgent.length === 0;
    enhanceTimes(banner);
  };

  const enhanceTimes = (root: Element): void => {
    for (const t of root.querySelectorAll<HTMLTimeElement>("time:not([data-cp-tip])")) {
      times.get(t)?.abort();
      const own = new AbortController();
      times.set(t, own);
      enhanceRelativeTime(t, {
        signal: AbortSignal.any([life.signal, own.signal]),
        ...(locale === undefined ? {} : { locale }),
      });
    }
  };

  const releaseTimes = (): void => {
    for (const [t, own] of times) {
      if (!panel.contains(t) && parts.banner?.contains(t) !== true) {
        own.abort();
        times.delete(t);
        // enhanceTimes skips a time with the tip, and a cached row can bring
        // this one back with the same moment.
        delete t.dataset["cpTip"];
      }
    }
  };

  const renderPanel = (pill: Pill): void => {
    const offline = link === "offline";
    const words = offline
      ? w.offlineSince(clock.format(lostAt))
      : pill.detail === undefined
        ? pill.words
        : `${pill.words} · ${pill.detail}`;
    if (title.textContent !== words) {
      title.textContent = words;
    }
    place(head, offline && model.reconnect !== undefined ? [title, retry] : [title]);

    for (const r of kept) {
      markKept(r, null);
    }
    kept.clear();

    const kids: HTMLElement[] = [head];
    const starts = model.starts ?? [];
    if (starts.length > 0) {
      const s = section("starts");
      let list = s.firstElementChild;
      if (list === null) {
        list = h("ul", { class: "cp-cluster" });
        s.append(list);
      }
      const items = starts.map(startItem);
      if (model.startsInfo !== undefined) {
        items.push(startsInfo(model.startsInfo));
      }
      syncList(list, items);
      kids.push(s);
    }
    const conditions = listSection(
      "conditions",
      conditionOrder(model.conditions).map(conditionRow),
    );
    const shown = [
      ...model.work.filter((x) => x.queued !== true),
      ...model.work.filter((x) => x.queued === true),
    ].slice(0, 3);
    const total = model.workTotal ?? model.work.filter((x) => x.queued !== true).length;
    const runningShown = shown.filter((x) => x.queued !== true).length;
    const workRows = shown.map(workRow);
    if (total === 0 && runningShown === 0 && model.next !== undefined) {
      workRows.push(
        item(
          undefined,
          row(undefined, icon("clock"), h("span", { class: "cp-cell-stack" }, model.next)),
        ),
      );
    } else if (model.workHref !== undefined && total > runningShown) {
      workRows.push(
        h(
          "li",
          { class: "cp-list-foot" },
          h("a", { class: "cp-button", "data-size": "sm", href: model.workHref }, w.showAll(total)),
        ),
      );
    }
    const work = listSection("work", workRows);
    const notices = listSection(
      "notices",
      (model.notices ?? []).map((n) =>
        item(n.id, row(n.href, icon("info"), h("span", { class: "cp-cell-stack" }, n.title))),
      ),
    );
    const recent = listSection(
      "recent",
      (model.recent ?? [])
        .slice(0, 5)
        .map((r) =>
          item(
            r.id,
            row(
              r.href,
              h("span", { class: "cp-cell-stack" }, r.words),
              h("span", { "data-part": "end" }, stamp(r.at)),
            ),
          ),
        ),
    );
    for (const s of [conditions, work, notices, recent]) {
      if (s !== undefined) {
        kids.push(s);
      }
    }
    if (model.history !== undefined) {
      const a = h("a", { href: model.history.href }, model.history.label);
      const [prior] = foot.children;
      if (prior === undefined) {
        foot.append(a);
      } else {
        patch(prior, a);
      }
      kids.push(foot);
    }
    place(panel, kids);
    enhanceTimes(panel);
    if (offline) {
      for (const s of [conditions, work]) {
        for (const li of s?.querySelectorAll("li[data-cp-key]") ?? []) {
          markKept(
            li,
            { from: lostAt, reason: "" },
            {
              words: (t) => w.asOf(t),
              ...(locale === undefined ? {} : { locale }),
            },
          );
          kept.add(li);
          // A refusal is the person's own press, newer than the drop, so it
          // stays in sight among the kept lines.
          const own = li.querySelector<HTMLElement>("[data-cp-refused]");
          if (own !== null) {
            own.hidden = false;
          }
        }
      }
    }
  };

  /** Renders, keeping focus in the panel: a focused row that leaves hands
   *  it to the next row of its section, else that section's heading, else
   *  the panel's heading. */
  const render = (): void => {
    const pill: Pill =
      link === "offline" ? { state: "offline", words: w.offline } : pillOf(model, w);
    const shown = link === "lost" ? { ...pill, detail: w.reconnecting } : pill;
    writePill(button, shown);
    const active = document.activeElement;
    const inside = active instanceof HTMLElement && active !== panel && panel.contains(active);
    const li = inside ? active.closest<HTMLElement>("li[data-cp-key]") : null;
    const name = inside
      ? active.closest<HTMLElement>("section[data-cp-status]")?.dataset["cpStatus"]
      : undefined;
    const after: string[] = [];
    for (let n = li?.nextElementSibling; n instanceof HTMLElement; n = n.nextElementSibling) {
      const key = n.dataset["cpKey"];
      if (key !== undefined) {
        after.push(key);
      }
    }
    renderPanel(shown);
    renderBanner();
    releaseTimes();
    if (!inside || document.activeElement === active) {
      return;
    }
    if (active.isConnected && panel.contains(active)) {
      active.focus({ preventScroll: true });
      return;
    }
    const s = name === undefined ? undefined : sections.get(name);
    const rows =
      s?.isConnected === true ? [...s.querySelectorAll<HTMLElement>("li[data-cp-key]")] : [];
    const find = (key: string | undefined): HTMLElement | undefined =>
      rows.find((r) => r.dataset["cpKey"] === key);
    const target = find(li?.dataset["cpKey"]) ?? after.map(find).find((r) => r !== undefined);
    if (target !== undefined) {
      focusOn(landing(target), { preventScroll: true });
    } else {
      const heading = s?.isConnected === true ? s.querySelector<HTMLElement>("h3") : null;
      (heading ?? title).focus({ preventScroll: true });
    }
  };

  const tell = (): void => {
    const ordered = conditionOrder(model.conditions);
    const level = severity(ordered);
    const problems = ordered.filter(isProblem).length;
    const fresh = ordered.filter((c) => !toldIds.has(c.id));
    const newUrgent = fresh.find((c) => c.urgent === true);
    const worse = level > toldLevel || (level === 2 && problems > toldProblems);
    if (newUrgent !== undefined || worse) {
      const cause =
        newUrgent ?? fresh.find((c) => (level === 2 ? isProblem(c) : true)) ?? ordered[0];
      if (cause !== undefined) {
        announce(
          cause.urgent === true
            ? cause.title
            : `${level === 2 ? w.problems(problems) : w.warnings(ordered.length)}: ${cause.title}`,
        );
        troubled = true;
      }
    } else if (troubled && pillOf(model, w).state === "ok") {
      announce(w.ok);
      troubled = false;
    }
    toldLevel = level;
    toldProblems = problems;
    toldIds = new Set(ordered.map((c) => c.id));
  };

  // Read after an await, where a destroy() may have run meanwhile.
  const ended = (): boolean => gone;

  const stop = async (key: string): Promise<void> => {
    const work = model.work.find((x) => x.id === key);
    if (gone || work?.stop === undefined || stopping.has(key)) {
      return;
    }
    const question = work.stop.ask;
    if (question !== undefined) {
      const { message, ...rest } = question;
      if (!(await ask(message, { ...rest, signal: life.signal })) || ended()) {
        return;
      }
    }
    // The model may have moved while the question was open: stop the item
    // shown now, never the one read at the click.
    const current = model.work.find((x) => x.id === key);
    if (current?.stop === undefined || stopping.has(key)) {
      return;
    }
    const mine = {};
    stopping.set(key, mine);
    refused.delete(key);
    render();
    try {
      await current.stop.run();
    } catch (error) {
      if (ended() || stopping.get(key) !== mine) {
        return;
      }
      stopping.delete(key);
      const reason = w.refused(error);
      refused.set(key, reason);
      announce(reason);
      render();
    }
  };

  const start = async (key: string): Promise<void> => {
    const s = model.starts?.find((x) => x.id === key);
    if (gone || s === undefined || s.unavailable !== undefined || starting.has(key)) {
      return;
    }
    const mine = {};
    starting.set(key, mine);
    startRefused.delete(key);
    render();
    let reason: string | undefined;
    try {
      const button =
        s.turn === true && s.icon !== undefined
          ? panel.querySelector(`[data-cp-start="${CSS.escape(key)}"]`)
          : null;
      await (button === null ? s.run() : turnWhile(button, s.run()));
    } catch (error) {
      reason = w.startRefused(error);
    }
    if (ended()) {
      return;
    }
    // update() drops the entry of a start that left, so a late answer to
    // one that left, or to an earlier press, ends here. Its turnWhile
    // cleared aria-busy, which the render gives back to a press pending.
    if (starting.get(key) !== mine) {
      render();
      return;
    }
    starting.delete(key);
    if (reason !== undefined) {
      // An unavailable start shows its own reason, newer than the press.
      if (model.starts?.find((x) => x.id === key)?.unavailable === undefined) {
        startRefused.set(key, reason);
      }
      announce(reason);
    }
    render();
  };

  panel.addEventListener(
    "click",
    (e) => {
      const target = e.target instanceof Element ? e.target : null;
      const stopper = target?.closest<HTMLElement>("[data-cp-stop]");
      const starter = target?.closest<HTMLElement>("[data-cp-start]");
      if (stopper !== null && stopper !== undefined) {
        void stop(stopper.dataset["cpStop"] ?? "");
      } else if (starter !== null && starter !== undefined) {
        void start(starter.dataset["cpStart"] ?? "");
      } else if (target?.closest("[data-cp-retry]") !== null && target !== null) {
        model.reconnect?.();
      } else if (
        target?.closest("a[href]") !== null &&
        target !== null &&
        e.button === 0 &&
        !(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) &&
        panel.matches(":popover-open")
      ) {
        // A link opened here may land on this page, such as on a component's
        // status heading: the panel goes first so that heading keeps the
        // focus the arrival gives it, and nothing covers it.
        panel.hidePopover();
      }
    },
    { signal: life.signal },
  );

  render();

  return {
    update(next) {
      if (gone) {
        return;
      }
      checkDates(next);
      model = next;
      const present = new Set(model.work.map((x) => x.id));
      for (const key of [...stopping.keys(), ...refused.keys()]) {
        if (!present.has(key)) {
          stopping.delete(key);
          refused.delete(key);
        }
      }
      const starts = new Map((model.starts ?? []).map((s) => [s.id, s]));
      for (const key of [...starting.keys(), ...startRefused.keys()]) {
        const s = starts.get(key);
        if (s === undefined) {
          starting.delete(key);
          startRefused.delete(key);
        } else if (s.unavailable !== undefined) {
          startRefused.delete(key);
        }
      }
      render();
      if (!started) {
        started = true;
        const ordered = conditionOrder(model.conditions);
        toldLevel = severity(ordered);
        toldProblems = ordered.filter(isProblem).length;
        toldIds = new Set(ordered.map((c) => c.id));
        return;
      }
      if (link !== "offline") {
        tell();
      }
    },
    connection(state) {
      if (gone) {
        return;
      }
      if (state === "live") {
        clearTimeout(timer);
        timer = undefined;
        const was = link;
        link = "live";
        render();
        if (was === "offline") {
          tell();
        }
        return;
      }
      if (link !== "live") {
        return;
      }
      link = "lost";
      lostAt = Date.now();
      render();
      timer = setTimeout(() => {
        timer = undefined;
        link = "offline";
        render();
        announce(w.offline);
        troubled = true;
      }, offlineAfter);
    },
    destroy() {
      gone = true;
      clearTimeout(timer);
      life.abort();
    },
  };
}
