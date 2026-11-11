/**
 * tokens.ts — `enhanceTokens()` makes a `.cp-tokens` field hold chosen
 * values as chips, such as search terms, languages or tags. Enter or a comma
 * adds the typed words, or with suggestions the list narrows as you type and
 * a press or Enter takes an option. Left or Backspace from the field reaches
 * the chips, where Left and Right move and Backspace or Delete removes one.
 * A value already there shakes instead of doubling, and past `max` the field
 * says so and takes no more. `createTokenLimit()` gives several fields one
 * limit of distinct values.
 * @module
 */

import { announce } from "../../feedback/announce/announce.js";
import { until } from "../../core/lifetime/lifetime.js";
import { enhanceCombobox } from "../combobox/combobox.js";

/** The words the field writes and says, each given the value or number. */
export interface TokensWords {
  /** A chip's remove button. Default "Remove {value}". */
  readonly remove?: (value: string) => string;
  /** Said when a chip is added. Default "{value} added". */
  readonly added?: (value: string) => string;
  /** Said when a chip is removed. Default "{value} removed". */
  readonly removed?: (value: string) => string;
  /** The option that adds the typed words as a new value. Default
   *  "Add “{text}”". */
  readonly addNew?: (text: string) => string;
  /** Under the field at the limit. Default "{max} chosen, the most allowed." */
  readonly full?: (max: number) => string;
  /** Under a field at a shared limit that can still take a value another
   *  field holds. Default "{max} chosen, the most allowed. You can still add
   *  one chosen in another field." */
  readonly limited?: (max: number) => string;
}

/** One limit of distinct values shared by several token fields, from
 *  `createTokenLimit()`. */
export interface TokenLimit {
  /** The most distinct values the fields hold together. */
  readonly max: number;
  /** How many distinct values they hold now, a value in two fields counted
   *  once. */
  readonly size: number;
}

interface Member {
  readonly values: () => readonly string[];
  readonly refresh: () => void;
}

const members = new WeakMap<TokenLimit, Set<Member>>();

/** The distinct values, in lower case, that `limit`'s fields hold. */
function counted(limit: TokenLimit): Set<string> {
  const all = new Set<string>();
  for (const m of members.get(limit) ?? []) {
    for (const v of m.values()) {
      all.add(v.toLowerCase());
    }
  }
  return all;
}

/**
 * A limit of `max` distinct values that every token field given it as
 * `limit` shares. A value counts once, whichever fields hold it, and a field
 * below its own `max` can always take a value another already holds, since
 * that adds nothing to the count.
 */
export function createTokenLimit(max: number): TokenLimit {
  const limit: TokenLimit = {
    max,
    get size() {
      return counted(limit).size;
    },
  };
  members.set(limit, new Set());
  return limit;
}

export interface TokensOptions {
  /** The most chips the field holds. Default: no limit. */
  readonly max?: number;
  /** A limit this field shares with others, from `createTokenLimit()`. At
   *  it the field takes only a value another field holds, and turns
   *  read-only once it holds every value counted. */
  readonly limit?: TokenLimit;
  /** Each chip carries a hidden input of this name, so a form sends the
   *  values. */
  readonly name?: string;
  /** The `role="listbox"` of suggestions, as @cplieger/ui/combobox drives. */
  readonly suggestions?: HTMLElement;
  /** Whether typed words become a value of their own. Default: true without
   *  suggestions, false with them. */
  readonly allowNew?: boolean;
  /** Where the limit's words show. Default: a `.cp-help` made after the
   *  field. */
  readonly note?: HTMLElement;
  readonly words?: TokensWords;
  /** Runs after each add and removal, with the values in order. */
  readonly onChange?: (values: readonly string[]) => void;
  /** Removes the listeners, and a note this call made. */
  readonly signal?: AbortSignal;
}

export interface Tokens {
  /** The values, in order. */
  readonly values: readonly string[];
  /** Adds `value` as a press would. False when it is empty, already there
   *  or past a limit. */
  add(value: string): boolean;
  /** Removes the chip of `value`, if there is one. */
  remove(value: string): void;
}

const LEAVING = "data-cp-leaving";
const AGAIN = "data-cp-again";
const NEW = "data-cp-new";
let seq = 0;

/** An option's value: its `data-value`, else its text before any element. */
function valueOf(option: HTMLElement): string {
  const own = option.dataset["value"];
  if (own !== undefined) {
    return own;
  }
  const first = option.firstChild;
  return (first instanceof Text ? first.data : option.textContent).trim();
}

/**
 * `box` holds its chips, each a `.cp-token` with `data-value`, its words and
 * a remove `<button>`, then the text `<input>`. Chips in the markup are
 * taken as they are.
 */
export function enhanceTokens(box: HTMLElement, options: TokensOptions = {}): Tokens {
  const { max = Infinity, name, suggestions, signal } = options;
  const shared = options.limit;
  const allowNew = options.allowNew ?? suggestions === undefined;
  const words = {
    remove: options.words?.remove ?? ((v: string) => `Remove ${v}`),
    added: options.words?.added ?? ((v: string) => `${v} added`),
    removed: options.words?.removed ?? ((v: string) => `${v} removed`),
    addNew: options.words?.addNew ?? ((t: string) => `Add “${t}”`),
    full: options.words?.full ?? ((n: number) => `${String(n)} chosen, the most allowed.`),
    limited:
      options.words?.limited ??
      ((n: number) =>
        `${String(n)} chosen, the most allowed. You can still add one chosen in another field.`),
  };
  const input = box.querySelector<HTMLInputElement>(":scope > input");
  if (input === null) {
    throw new TypeError("enhanceTokens needs an <input> inside the field");
  }
  const chips = (): HTMLElement[] =>
    [...box.querySelectorAll<HTMLElement>(":scope > .cp-token")].filter(
      (c) => !c.hasAttribute(LEAVING),
    );
  const values = (): string[] => chips().map((c) => c.dataset["value"] ?? "");
  const has = (v: string): HTMLElement | undefined =>
    chips().find((c) => (c.dataset["value"] ?? "").toLowerCase() === v.toLowerCase());
  const together = (): Set<string> => (shared === undefined ? new Set() : counted(shared));
  /** At the shared limit: true once its fields hold `limit.max` values. */
  const atShared = (): boolean => shared !== undefined && together().size >= shared.max;
  /** Whether the field's own limit and the shared one leave room for `v`. A
   *  chip of `v` already here is the caller's check. */
  const room = (v: string): boolean =>
    chips().length < max && (!atShared() || together().has(v.toLowerCase()));
  /** The field can take nothing more: its own limit, or the shared one
   *  with every counted value already here. */
  const full = (): boolean => {
    if (chips().length >= max) {
      return true;
    }
    if (!atShared()) {
      return false;
    }
    const mine = new Set(values().map((v) => v.toLowerCase()));
    return [...together()].every((v) => mine.has(v));
  };
  const tell = (): void => {
    options.onChange?.(values());
  };

  let note = options.note;
  const made = note === undefined;
  if (note === undefined && (Number.isFinite(max) || shared !== undefined)) {
    note = document.createElement("span");
    note.className = "cp-help";
    note.hidden = true;
    box.after(note);
  }
  if (note !== undefined) {
    note.id ||= `cp-tokens-note-${String(++seq)}`;
    const ids = (input.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    if (!ids.includes(note.id)) {
      input.setAttribute("aria-describedby", [...ids, note.id].join(" "));
    }
  }
  const placeholder = input.placeholder;
  let wasFull = false;
  let wasLimited = false;
  /** Writes the limit's state. `quiet` says nothing, for the opening state
   *  or a change another field made. */
  const limit = (quiet = false): void => {
    const f = full();
    const ownFull = chips().length >= max;
    const limited = !f && atShared();
    input.readOnly = f;
    input.setAttribute("aria-disabled", String(f));
    input.placeholder = f ? "" : placeholder;
    const most = ownFull || shared === undefined ? max : shared.max;
    const said = f ? words.full(most) : limited ? words.limited(most) : "";
    if (note !== undefined) {
      note.textContent = said;
      note.hidden = said === "";
    }
    if (!quiet && ((f && !wasFull) || (limited && !wasLimited))) {
      announce(said);
    }
    wasFull = f;
    wasLimited = limited;
  };
  /** After this field's change: every field sharing its limit rewrites. */
  const changed = (): void => {
    limit();
    if (shared !== undefined) {
      for (const m of members.get(shared) ?? []) {
        if (m !== self) {
          m.refresh();
        }
      }
    }
  };

  const dress = (chip: HTMLElement): void => {
    if (name !== undefined && chip.querySelector("input") === null) {
      const hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = name;
      hidden.value = chip.dataset["value"] ?? "";
      chip.append(hidden);
    }
    const button = chip.querySelector("button");
    if (button !== null) {
      button.type = "button";
      button.tabIndex = -1;
      if (!button.hasAttribute("aria-label")) {
        button.setAttribute("aria-label", words.remove(chip.dataset["value"] ?? ""));
      }
    }
  };
  for (const c of chips()) {
    dress(c);
  }

  const add = (raw: string): boolean => {
    const v = raw.trim();
    if (v === "") {
      return false;
    }
    const same = has(v);
    if (same !== undefined) {
      same.removeAttribute(AGAIN);
      // Read layout so the shake restarts.
      same.getBoundingClientRect();
      same.setAttribute(AGAIN, "");
      return false;
    }
    if (!room(v)) {
      if (note !== undefined && note.textContent !== "") {
        announce(note.textContent);
      }
      return false;
    }
    const chip = document.createElement("span");
    chip.className = "cp-token";
    chip.dataset["value"] = v;
    const text = document.createElement("span");
    text.textContent = v;
    const button = document.createElement("button");
    chip.append(text, button);
    dress(chip);
    input.before(chip);
    announce(words.added(v));
    changed();
    tell();
    return true;
  };
  const drop = (chip: HTMLElement, next: HTMLElement): void => {
    const v = chip.dataset["value"] ?? "";
    chip.setAttribute(LEAVING, "");
    chip.querySelector("input")?.remove();
    next.focus();
    const gone = (): void => {
      chip.remove();
    };
    void Promise.all(chip.getAnimations({ subtree: true }).map((a) => a.finished)).then(gone, gone);
    announce(words.removed(v));
    changed();
    tell();
  };
  const buttonOf = (chip: HTMLElement | undefined): HTMLElement | undefined =>
    chip?.querySelector("button") ?? undefined;

  if (signal?.aborted === true) {
    return { values: [], add: () => false, remove: () => undefined };
  }
  const listen = until(signal);
  let combo: { refresh(): void } | undefined;
  const self: Member = {
    values,
    refresh: () => {
      limit(true);
      combo?.refresh();
    },
  };
  if (shared !== undefined) {
    members.get(shared)?.add(self);
  }

  box.addEventListener(
    "click",
    (e) => {
      const t = e.target instanceof Element ? e.target : null;
      const x = t?.closest(".cp-token > button");
      const chip = x?.parentElement;
      if (chip instanceof HTMLElement && !chip.hasAttribute(LEAVING)) {
        drop(chip, input);
      } else if (t !== null && t.closest(".cp-token") === null) {
        input.focus();
      }
    },
    listen,
  );
  box.addEventListener(
    "keydown",
    (e) => {
      const t = e.target instanceof Element ? e.target : null;
      const chip = t?.closest<HTMLElement>(".cp-token");
      if (chip === null || chip === undefined) {
        return;
      }
      const all = chips();
      const i = all.indexOf(chip);
      if (e.key === "ArrowLeft") {
        buttonOf(all[Math.max(0, i - 1)])?.focus();
      } else if (e.key === "ArrowRight") {
        (buttonOf(all[i + 1]) ?? input).focus();
      } else if (e.key === "Backspace" || e.key === "Delete") {
        drop(chip, buttonOf(all[i + 1]) ?? buttonOf(all[i - 1]) ?? input);
      } else {
        return;
      }
      e.preventDefault();
    },
    listen,
  );
  input.addEventListener(
    "keydown",
    (e) => {
      if (e.isComposing) {
        return;
      }
      const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
      if ((e.key === "Backspace" && input.value === "") || (e.key === "ArrowLeft" && atStart)) {
        const last = buttonOf(chips().at(-1));
        if (last !== undefined) {
          e.preventDefault();
          last.focus();
        }
      } else if (e.key === "Enter" && suggestions === undefined) {
        // Enter adds; it never submits the form around the field.
        e.preventDefault();
        if (allowNew && add(input.value)) {
          input.value = "";
        }
      }
    },
    listen,
  );
  if (allowNew) {
    input.addEventListener(
      "input",
      () => {
        if (!input.value.includes(",")) {
          return;
        }
        const parts = input.value.split(",");
        for (const part of parts.slice(0, -1)) {
          add(part);
        }
        input.value = parts.at(-1) ?? "";
      },
      { ...listen, capture: true },
    );
  }

  if (suggestions !== undefined) {
    const fresh = allowNew ? document.createElement("li") : null;
    if (fresh !== null) {
      fresh.setAttribute("role", "option");
      fresh.setAttribute(NEW, "");
      fresh.hidden = true;
      // Last, so Enter takes a match before it makes a new value.
      suggestions.append(fresh);
    }
    combo = enhanceCombobox(input, suggestions, {
      anchor: box,
      openOnFocus: true,
      autoActivate: true,
      onQuery: (text) => {
        const q = text.trim().toLowerCase();
        const taken = new Set(values().map((v) => v.toLowerCase()));
        let exact = false;
        for (const o of suggestions.querySelectorAll<HTMLElement>(
          `[role="option"]:not([${NEW}])`,
        )) {
          const v = valueOf(o).toLowerCase();
          exact ||= v === q;
          o.hidden =
            taken.has(v) || !room(v) || (q !== "" && !o.textContent.toLowerCase().includes(q));
        }
        if (fresh !== null) {
          fresh.hidden = q === "" || exact || taken.has(q) || !room(q);
          fresh.dataset["value"] = text.trim();
          fresh.textContent = words.addNew(text.trim());
        }
      },
      onAccept: (option) => {
        if (add(valueOf(option))) {
          input.value = "";
        }
        combo?.refresh();
      },
      onText: () => undefined,
      ...(signal === undefined ? {} : { signal }),
    });
    signal?.addEventListener(
      "abort",
      () => {
        fresh?.remove();
      },
      { once: true },
    );
  }
  signal?.addEventListener(
    "abort",
    () => {
      if (made) {
        note?.remove();
      }
      if (shared !== undefined) {
        members.get(shared)?.delete(self);
        for (const m of members.get(shared) ?? []) {
          m.refresh();
        }
      }
    },
    { once: true },
  );
  // The opening state is no change, so it says nothing, and a field joining
  // a shared limit rewrites the others it may have filled.
  limit(true);
  if (shared !== undefined) {
    for (const m of members.get(shared) ?? []) {
      if (m !== self) {
        m.refresh();
      }
    }
  }

  return {
    get values() {
      return values();
    },
    add,
    remove(value) {
      const chip = has(value);
      if (chip !== undefined) {
        drop(chip, input);
      }
    },
  };
}
