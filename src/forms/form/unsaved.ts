/**
 * unsaved.ts — the unsaved-changes guard: what a form holds that its saved
 * values do not, the question asked before a navigation or a dialog's close
 * would drop it, and the latest saved values taken in around it.
 * @module
 */

import { shared } from "../../core/lifetime/lifetime.js";
import { ask } from "../../overlays/ask/ask.js";
import { type Asker, addAsker, askEach } from "../../overlays/dialog/asker.js";
import { installDialogs } from "../../overlays/dialog/dialog.js";
import {
  changesIn,
  controlsOf,
  holds,
  isTyped,
  resetSelection,
  resetValue,
  textDefault,
} from "./changed.js";
import { type Control, isControl } from "./field-error.js";
import {
  type Piece,
  commitPiece,
  pieceOf,
  piecesIn,
  resetPieces,
  sameValues,
  savedOf,
  watchPieces,
} from "./pieces.js";

/** The guard's words. */
export interface UnsavedWords {
  /** The question, such as "Discard this message?" or "Leave without
   *  saving?". Default "Discard your changes?". */
  readonly question?: string;
  /** A sentence under the question. Default none. */
  readonly detail?: string;
  /** The answer that drops the changes, or a function of their count.
   *  Default "Discard 1 change", "Discard 3 changes". */
  readonly discard?: string | ((count: number) => string);
  /** The answer that keeps them. Default "Keep editing". */
  readonly keep?: string;
  /** The note under a field changed both here and in the latest values,
   *  given the latest value as shown: `""` when it is empty, `null` for a
   *  password. Default "Saved elsewhere as {value}", "Cleared elsewhere",
   *  "Changed elsewhere". */
  readonly elsewhere?: (value: string | null) => string;
}

/** One field's latest saved value: a string for a text field, a single
 *  select or a radio group (`""` for none checked); a boolean for a lone
 *  checkbox; a list for a multiple select, a group of checkboxes, several
 *  fields of one name, or a chips or rows field. */
export type FreshValue = string | boolean | readonly string[];

/** The latest saved values by field name. A name the form lacks is left
 *  out. */
export type FreshValues = Readonly<Record<string, FreshValue>>;

export interface GuardOptions {
  readonly words?: UnsavedWords;
  /** After each change to what waits, with the changed fields in page
   *  order. */
  readonly onChange?: (changes: readonly Element[]) => void;
  /** Whether `to` keeps this form on the page, such as another category of
   *  Settings that the app's router shows beside it: a link there asks
   *  nothing. Default: no address does. */
  readonly within?: (to: URL) => boolean;
  /** Ends the guard: its listeners, its question and its hold on the page's
   *  links. */
  readonly signal?: AbortSignal;
}

export interface Guard {
  /** The changes waiting: each changed field, a radio group once. */
  readonly count: number;
  /** The changed fields in page order: a control, a radio group's checked
   *  radio, or a chips or rows field's box. */
  changes(): readonly Element[];
  /** Counts again after a change no `input` or `change` event carried, such
   *  as a value set from script. */
  update(): void;
  /**
   * After a save: each value becomes its field's default, so Discard and the
   * count start from it. Given `values`, the saved values the answer holds,
   * each field they name takes its value as its default instead and keeps
   * what it holds, so a field changed during the save stays a change, with
   * no note; fields they do not name are left as they are. Throws a
   * `TypeError`, changing nothing, when a value does not fit its field.
   */
  saved(values?: FreshValues): void;
  /** Puts back every saved value, as the form's reset does; a reset that a
   *  listener cancels puts back nothing. */
  discard(): void;
  /**
   * Takes `fresh` as the saved values. A field the person changed keeps
   * their value; every other field takes the fresh one. A field changed
   * both here and in `fresh` also gets a note naming the fresh value, which
   * goes at `saved()` or a discard. Throws a `TypeError`, changing nothing,
   * when a value does not fit its field. Returns the count of changes kept.
   */
  rebase(fresh: FreshValues): number;
  /** Asks before the person leaves this form alone while changes wait;
   *  resolves true to go on, once the changes are discarded, or false to
   *  stay, as when they keep them or a listener cancels the reset. */
  leave(): Promise<boolean>;
}

const DEFAULTS = {
  question: "Discard your changes?",
  discard: (n: number): string => (n === 1 ? "Discard 1 change" : `Discard ${String(n)} changes`),
  keep: "Keep editing",
  elsewhere: (v: string | null): string =>
    v === null ? "Changed elsewhere" : v === "" ? "Cleared elsewhere" : `Saved elsewhere as ${v}`,
};

const NOTE = "data-cp-elsewhere";
const guarded = new WeakSet<HTMLFormElement>();
let seq = 0;

interface Live extends Asker {
  readonly within: (to: URL) => boolean;
}

const live = new Set<Live>();
let passing: Element | null = null;

/** Asks each of `guards` that still waits, in turn, and only once every one
 *  said yes discards each; resolves whether none still waits, so a reset a
 *  listener cancelled keeps the person where they are. */
async function dropAll(guards: readonly Live[]): Promise<boolean> {
  const yes = await askEach(guards);
  if (yes === null) {
    return false;
  }
  for (const g of yes) {
    if (g.waiting()) {
      g.dropped();
    }
  }
  return yes.every((g) => !g.waiting());
}

/**
 * Asks every guard holding a change before the page goes to `to`, as a
 * press on a link that leaves does, for an app's router to call before it
 * acts on the browser's Back: each guard's question in turn, and only once
 * every one said yes, each form discarded. A guard whose `within` accepts
 * `to` asks nothing. Resolves true to go on, or false, nothing discarded,
 * to stay. Throws a `TypeError` for an address that does not parse.
 */
export function leavePage(to?: string | URL): Promise<boolean> {
  const url = to === undefined ? null : new URL(to, location.href);
  return dropAll([...live].filter((g) => g.waiting() && (url === null || !g.within(url))));
}

/** Where following `link` in this tab goes, or null when it stays on the
 *  document, as a jump to a fragment does, or opens another tab, a download
 *  or a mail link. */
function leavingTo(link: HTMLAnchorElement | HTMLAreaElement): URL | null {
  const target = link.target;
  if ((target !== "" && target !== "_self") || link.hasAttribute("download")) {
    return null;
  }
  const to = URL.parse(link.href);
  if (to === null || (to.protocol !== "http:" && to.protocol !== "https:")) {
    return null;
  }
  const here = new URL(location.href);
  const sameDoc =
    to.origin === here.origin && to.pathname === here.pathname && to.search === here.search;
  return sameDoc && link.href.includes("#") ? null : to;
}

// A press on a link that leaves is stopped before the page's router sees it,
// so in the window's capture phase, and pressed again once every guard lets
// it go.
const links = shared((signal) => {
  addEventListener(
    "click",
    (e) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const start = e.composedPath()[0];
      const link = start instanceof Element ? start.closest("a[href], area[href]") : null;
      if (
        !(link instanceof HTMLAnchorElement || link instanceof HTMLAreaElement) ||
        link === passing
      ) {
        return;
      }
      const to = leavingTo(link);
      const waiting = to === null ? [] : [...live].filter((g) => g.waiting() && !g.within(to));
      if (waiting.length === 0) {
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      void dropAll(waiting).then((go) => {
        if (go) {
          passing = link;
          link.click();
          passing = null;
        }
      });
    },
    { capture: true, signal },
  );
});

function commitControl(c: Control): void {
  if (c instanceof HTMLSelectElement) {
    const now = [...c.options].map((o) => o.selected);
    for (const [i, o] of [...c.options].entries()) {
      o.defaultSelected = now[i] === true;
    }
    for (const [i, o] of [...c.options].entries()) {
      o.selected = now[i] === true;
    }
  } else if (c instanceof HTMLInputElement && (c.type === "checkbox" || c.type === "radio")) {
    const now = c.checked;
    c.defaultChecked = now;
    c.checked = now;
  } else if (c instanceof HTMLInputElement && c.type === "file") {
    // Saved files are sent, so the field empties, and a file list that
    // follows its change event, such as `./file`'s, empties with it.
    if ((c.files?.length ?? 0) > 0) {
      c.value = "";
      c.dispatchEvent(new Event("change", { bubbles: true }));
    }
  } else {
    c.defaultValue = c.value;
  }
}

const isList = (v: unknown): v is readonly string[] =>
  Array.isArray(v) && v.every((s) => typeof s === "string");

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const labelOf = (el: HTMLInputElement | HTMLOptionElement): string =>
  (el instanceof HTMLOptionElement ? el.label : (el.labels?.[0]?.textContent ?? el.value)).trim();

interface Plan {
  /** The field the plan writes, where its note goes. */
  readonly anchor: Element;
  /** The controls its note describes. */
  readonly controls: readonly Element[];
  readonly apply: () => void;
  /** Takes the fresh value as the field's default, keeping its value. */
  readonly commit: () => void;
  /** The fresh value as shown, for a field changed both here and there;
   *  null for a password. Absent for no note. */
  readonly shown?: string | null;
}

function wrong(name: string, want: string): TypeError {
  return new TypeError(`${name} needs ${want}`);
}

function planRadios(
  name: string,
  anchor: HTMLInputElement,
  radios: HTMLInputElement[],
  v: FreshValue,
): Plan {
  if (typeof v !== "string") {
    throw wrong(name, "a string");
  }
  const mine = radios.find((r) => r.checked)?.value ?? "";
  const was = radios.find((r) => r.defaultChecked)?.value ?? "";
  const kept = mine !== was;
  const pick = radios.find((r) => r.value === v);
  if (pick === undefined && v !== "") {
    throw wrong(name, 'the value of one of its radios, or "" for none');
  }
  return {
    anchor,
    controls: radios,
    apply: () => {
      const checked = radios.find((r) => r.checked);
      for (const r of radios) {
        r.defaultChecked = r === pick;
      }
      for (const r of radios) {
        r.checked = kept ? r === checked : r === pick;
      }
    },
    commit: () => {
      const checked = radios.find((r) => r.checked);
      for (const r of radios) {
        r.defaultChecked = r === pick;
      }
      for (const r of radios) {
        r.checked = r === checked;
      }
    },
    ...(kept && v !== was && v !== mine ? { shown: pick === undefined ? "" : labelOf(pick) } : {}),
  };
}

function planChecks(
  name: string,
  anchor: HTMLInputElement,
  boxes: HTMLInputElement[],
  v: FreshValue,
): Plan {
  let on: (box: HTMLInputElement) => boolean;
  if (typeof v === "boolean" && boxes.length === 1) {
    on = () => v;
  } else if (isList(v)) {
    if (!v.every((x) => boxes.some((b) => b.value === x))) {
      throw wrong(name, "the values of its boxes");
    }
    on = (box) => v.includes(box.value);
  } else {
    throw wrong(name, boxes.length === 1 ? "a boolean or a list" : "a list");
  }
  // A box changed both here and in `v` changed the same way, so a box never
  // gets a note.
  return {
    anchor,
    controls: boxes,
    apply: () => {
      for (const b of boxes) {
        const mine = b.checked;
        const kept = mine !== b.defaultChecked;
        b.defaultChecked = on(b);
        b.checked = kept ? mine : on(b);
      }
    },
    commit: () => {
      for (const b of boxes) {
        const mine = b.checked;
        b.defaultChecked = on(b);
        b.checked = mine;
      }
    },
  };
}

function planSelect(name: string, select: HTMLSelectElement, v: FreshValue): Plan {
  let next: boolean[];
  const options = [...select.options];
  const known = (x: string): boolean => options.some((o) => o.value === x);
  if (select.multiple && isList(v)) {
    if (!v.every(known)) {
      throw wrong(name, "the values of its options");
    }
    next = options.map((o) => v.includes(o.value));
  } else if (!select.multiple && typeof v === "string") {
    if (!known(v)) {
      throw wrong(name, "the value of one of its options");
    }
    next = options.map((o) => o.value === v);
  } else {
    throw wrong(name, select.multiple ? "a list" : "a string");
  }
  const want = resetSelection(select);
  const mine = options.map((o) => o.selected);
  const differs = (a: readonly boolean[], b: readonly boolean[]): boolean =>
    a.some((s, i) => s !== b[i]);
  const kept = differs(mine, want);
  return {
    anchor: select,
    controls: [select],
    apply: () => {
      for (const [i, o] of options.entries()) {
        o.defaultSelected = next[i] === true;
      }
      for (const [i, o] of options.entries()) {
        o.selected = (kept ? mine : next)[i] === true;
      }
    },
    commit: () => {
      const now = options.map((o) => o.selected);
      for (const [i, o] of options.entries()) {
        o.defaultSelected = next[i] === true;
      }
      for (const [i, o] of options.entries()) {
        o.selected = now[i] === true;
      }
    },
    ...(kept && differs(next, want) && differs(next, mine)
      ? {
          shown: options
            .filter((_, i) => next[i] === true)
            .map(labelOf)
            .join(", "),
        }
      : {}),
  };
}

function planTexts(
  name: string,
  fields: (HTMLInputElement | HTMLTextAreaElement)[],
  v: FreshValue,
): Plan[] {
  let at: (i: number) => string;
  if (typeof v === "string" && fields.length === 1) {
    at = () => v;
  } else if (isList(v)) {
    if (v.length > fields.length) {
      throw wrong(name, `at most ${String(fields.length)} values, one for each field`);
    }
    at = (i) => v[i] ?? "";
  } else {
    throw wrong(name, fields.length === 1 ? "a string" : "a list");
  }
  return fields.map((f, i) => {
    const next = at(i);
    if (f instanceof HTMLInputElement && !holds(f, next)) {
      throw wrong(name, `a value a ${f.type} field holds`);
    }
    const mine = f.value;
    const was = f instanceof HTMLTextAreaElement ? textDefault(f) : resetValue(f);
    const kept = mine !== was;
    return {
      anchor: f,
      controls: [f],
      apply: () => {
        f.defaultValue = next;
        f.value = kept ? mine : next;
      },
      commit: () => {
        const now = f.value;
        f.defaultValue = next;
        f.value = now;
      },
      ...(kept && next !== was && next !== mine
        ? { shown: f instanceof HTMLInputElement && f.type === "password" ? null : next }
        : {}),
    };
  });
}

function planPiece(piece: Piece, fresh: FreshValues): Plan | null {
  const value = piece.value();
  const saved = savedOf(piece);
  const nextValue: Record<string, readonly string[]> = { ...value };
  const nextSaved: Record<string, readonly string[]> = { ...saved };
  const shown: string[] = [];
  let touched = false;
  // A rows field with every row removed holds no names, so its saved ones
  // count too.
  for (const name of new Set([...Object.keys(value), ...Object.keys(saved)])) {
    const mine = value[name] ?? [];
    const v = name === "" || !Object.hasOwn(fresh, name) ? undefined : fresh[name];
    if (v === undefined) {
      continue;
    }
    if (typeof v !== "string" && !isList(v)) {
      throw wrong(name, "a list");
    }
    const next = typeof v === "string" ? [v] : v;
    const was = saved[name] ?? [];
    touched = true;
    nextSaved[name] = next;
    if (sameList(mine, was)) {
      nextValue[name] = next;
    } else if (!sameList(next, was) && !sameList(next, mine)) {
      shown.push(next.join(", "));
    }
  }
  if (!touched) {
    return null;
  }
  const lost = piece.fits?.(nextSaved) ?? piece.fits?.(nextValue) ?? null;
  if (lost !== null) {
    throw new TypeError(lost);
  }
  return {
    anchor: piece.element,
    controls: [...piece.element.querySelectorAll("input:not([type='hidden']), select, textarea")],
    apply: () => {
      if (!sameValues(nextValue, value)) {
        piece.set(nextValue);
      }
      commitPiece(piece, nextSaved);
    },
    commit: () => {
      commitPiece(piece, nextSaved);
    },
    ...(shown.length > 0 ? { shown: shown.join("; ") } : {}),
  };
}

/** The form's controls of `name` that a value can be written to, disabled
 *  ones included, outside any piece. */
function named(form: HTMLFormElement, name: string): Control[] {
  return [...form.elements].filter(
    (el): el is Control =>
      isControl(el) &&
      isTyped(el) &&
      el.type !== "file" &&
      el.name === name &&
      pieceOf(el) === undefined,
  );
}

function plansFor(form: HTMLFormElement, name: string, v: FreshValue): Plan[] {
  const controls = named(form, name);
  const [first] = controls;
  if (first === undefined) {
    return [];
  }
  const inputs = controls.filter((c): c is HTMLInputElement => c instanceof HTMLInputElement);
  if (first instanceof HTMLInputElement && inputs.length === controls.length) {
    if (inputs.every((c) => c.type === "radio")) {
      return [planRadios(name, first, inputs, v)];
    }
    if (inputs.every((c) => c.type === "checkbox")) {
      return [planChecks(name, first, inputs, v)];
    }
  }
  if (controls.length === 1 && first instanceof HTMLSelectElement) {
    return [planSelect(name, first, v)];
  }
  const texts = controls.filter(
    (c): c is HTMLInputElement | HTMLTextAreaElement =>
      c instanceof HTMLTextAreaElement ||
      (c instanceof HTMLInputElement && c.type !== "checkbox" && c.type !== "radio"),
  );
  if (texts.length !== controls.length) {
    throw new TypeError(`${name} names fields of different kinds`);
  }
  return planTexts(name, texts, v);
}

/** Plans the writes of `fresh` into `form`, checking every value first so a
 *  value that does not fit throws before anything changes. */
function plan(form: HTMLFormElement, fresh: FreshValues, verb: string): Plan[] {
  const raw: unknown = fresh;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new TypeError(`${verb} needs an object of values by field name`);
  }
  try {
    const plans: Plan[] = [];
    for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v !== "string" && typeof v !== "boolean" && !isList(v)) {
        throw wrong(name, "a string, a boolean or a list of strings");
      }
      plans.push(...plansFor(form, name, v));
    }
    for (const p of piecesIn(form)) {
      const piece = planPiece(p, fresh);
      if (piece !== null) {
        plans.push(piece);
      }
    }
    return plans;
  } catch (e) {
    throw e instanceof TypeError ? new TypeError(`${verb}: ${e.message}`) : e;
  }
}

/** Where a field's note goes: its setting's words, its `.cp-field` or its
 *  fieldset, else after the field or the label around it. */
function placeNote(anchor: Element, note: HTMLElement): void {
  const host = anchor.closest(".cp-field, fieldset, .cp-setting");
  if (host === null) {
    (anchor.closest("label") ?? anchor).after(note);
  } else if (host.matches(".cp-setting")) {
    (host.firstElementChild ?? host).append(note);
  } else {
    host.append(note);
  }
}

function describe(el: Element, id: string, on: boolean): void {
  const ids = (el.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter((t) => t !== "" && t !== id);
  if (on) {
    ids.push(id);
  }
  if (ids.length > 0) {
    el.setAttribute("aria-describedby", ids.join(" "));
  } else {
    el.removeAttribute("aria-describedby");
  }
}

/**
 * Guards `form`'s unsaved changes, each field whose value differs from what
 * a reset puts back, so the form's saved values are its defaults. While one
 * waits, a link that leaves the page asks first and a reload gets the
 * browser's prompt; in a `.cp-dialog`, so do Escape, a close command and a
 * close request. Throws a `TypeError` for a form that has a guard already.
 */
export function guardChanges(form: HTMLFormElement, options: GuardOptions = {}): Guard {
  if (guarded.has(form)) {
    throw new TypeError("guardChanges: the form already has a guard");
  }
  const { signal, onChange } = options;
  const words = { ...DEFAULTS, ...options.words };
  const dialog = form.closest("dialog.cp-dialog");
  const notes = new Map<Element, { note: HTMLElement; controls: readonly Element[] }>();
  let last: readonly Element[] = changesIn(form);
  let unloading = false;
  let stopped = signal?.aborted === true;

  const onUnload = (e: BeforeUnloadEvent): void => {
    if (guarding()) {
      e.preventDefault();
    }
  };
  // Listened to only while a change waits, so the page stays in the
  // back-forward cache otherwise.
  const unload = (on: boolean): void => {
    if (on === unloading || (on && stopped)) {
      return;
    }
    unloading = on;
    if (on) {
      addEventListener("beforeunload", onUnload);
    } else {
      removeEventListener("beforeunload", onUnload);
    }
  };
  // A discard or a rebase writes many fields; the count follows once, after
  // the last.
  let writing = false;
  const recount = (): void => {
    if (writing) {
      return;
    }
    const now = changesIn(form);
    unload(now.length > 0);
    const moved = now.length !== last.length || now.some((el, i) => el !== last[i]);
    last = now;
    if (moved) {
      onChange?.(now);
    }
  };
  const guarding = (): boolean =>
    form.isConnected &&
    (!(dialog instanceof HTMLDialogElement) || dialog.open) &&
    changesIn(form).length > 0;

  const unnote = (anchor: Element): void => {
    const n = notes.get(anchor);
    if (n !== undefined) {
      for (const c of n.controls) {
        describe(c, n.note.id, false);
      }
      n.note.remove();
      notes.delete(anchor);
    }
  };
  const clearNotes = (): void => {
    for (const anchor of [...notes.keys()]) {
      unnote(anchor);
    }
  };
  const note = (p: Plan, shown: string | null): void => {
    const el = document.createElement("span");
    el.className = "cp-help";
    el.setAttribute(NOTE, "");
    el.id = `cp-elsewhere-${String(++seq)}`;
    el.textContent = words.elsewhere(shown);
    placeNote(p.anchor, el);
    for (const control of p.controls) {
      describe(control, el.id, true);
    }
    notes.set(p.anchor, { note: el, controls: p.controls });
  };

  let pending: Promise<boolean> | null = null;
  const question = (): Promise<boolean> => {
    if (pending !== null) {
      return pending;
    }
    const n = changesIn(form).length;
    const answer = typeof words.discard === "function" ? words.discard(n) : words.discard;
    const opts = { tone: "danger", confirmLabel: answer, cancelLabel: words.keep } as const;
    pending = (
      words.detail === undefined
        ? ask(words.question, opts)
        : ask(words.detail, { ...opts, title: words.question })
    ).finally(() => {
      pending = null;
    });
    return pending;
  };

  const discard = (): void => {
    writing = true;
    const seen: { reset?: Event } = {};
    const listening = new AbortController();
    form.addEventListener(
      "reset",
      (e) => {
        seen.reset = e;
      },
      { capture: true, signal: listening.signal },
    );
    // A control named "reset" would shadow the form's own method.
    HTMLFormElement.prototype.reset.call(form);
    listening.abort();
    // Read once the reset's listeners have all run, any of which may cancel it.
    const done = seen.reset !== undefined && !seen.reset.defaultPrevented;
    if (done) {
      resetPieces(form);
    }
    writing = false;
    if (done) {
      clearNotes();
    }
    recount();
  };
  const saved = (values?: FreshValues): void => {
    if (values === undefined) {
      for (const c of controlsOf(form)) {
        commitControl(c);
      }
      for (const p of piecesIn(form)) {
        commitPiece(p);
      }
    } else {
      const plans = plan(form, values, "saved");
      writing = true;
      for (const p of plans) {
        p.commit();
      }
      writing = false;
    }
    clearNotes();
    recount();
  };
  const rebase = (fresh: FreshValues): number => {
    const plans = plan(form, fresh, "rebase");
    writing = true;
    for (const p of plans) {
      unnote(p.anchor);
      p.apply();
      if (p.shown !== undefined) {
        note(p, p.shown);
      }
    }
    writing = false;
    recount();
    return last.length;
  };
  const self: Live = {
    waiting: guarding,
    ask: question,
    dropped: discard,
    within: options.within ?? (() => false),
  };

  const guard: Guard = {
    get count() {
      return changesIn(form).length;
    },
    changes: () => changesIn(form),
    update: recount,
    saved,
    discard,
    rebase,
    leave: () => dropAll([self]),
  };
  if (stopped) {
    return guard;
  }

  guarded.add(form);
  live.add(self);
  const hold = signal === undefined ? {} : { signal };
  links.install(hold);
  const on = signal === undefined ? {} : { signal };
  form.addEventListener("input", recount, on);
  form.addEventListener("change", recount, on);
  // A reset fires no input event, so the count follows it a task later, as
  // the pieces it puts back do.
  form.addEventListener(
    "reset",
    (e) => {
      setTimeout(() => {
        if (!e.defaultPrevented && !stopped) {
          clearNotes();
          recount();
        }
      });
    },
    on,
  );
  watchPieces((box) => {
    if (form.contains(box)) {
      recount();
    }
  }, signal);
  if (dialog instanceof HTMLDialogElement) {
    installDialogs(hold);
    addAsker(dialog, self, signal);
  }
  unload(last.length > 0);
  signal?.addEventListener(
    "abort",
    () => {
      stopped = true;
      guarded.delete(form);
      live.delete(self);
      unload(false);
    },
    { once: true },
  );
  return guard;
}
