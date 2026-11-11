/**
 * rules.ts — `enhanceRules()` runs a `.cp-rules` list of sentences: each
 * rule's + adds a target up to `max`, each target's remove shows while its
 * rule holds more than one, a rule's own remove takes it away, and "Add a
 * rule" appends one. Focus always lands on a button, never on a picker,
 * since a focused `<select>` opens its picker at once on iOS.
 * @module
 */

import { announce } from "../../feedback/announce/announce.js";
import { until } from "../../core/lifetime/lifetime.js";

/** The words the rules write and say. `when` is a rule's `data-when`, such
 *  as "when the audio is Japanese", and `name` a target's chosen text. */
export interface RulesWords {
  /** A rule's + button. Default "Add another {when}", or at `max` "Add
   *  another {when}: {max} is the most". */
  readonly add?: (when: string, full: boolean, max: number) => string;
  /** A target's remove. Default "Remove {name} {when}". */
  readonly removeTarget?: (name: string, when: string) => string;
  /** Said when a target goes. Default "{name} removed". */
  readonly removed?: (name: string) => string;
  /** Said when a rule reaches `max`. Default "{max} is the most". */
  readonly full?: (max: number) => string;
}

export interface RulesOptions {
  /** The most targets a rule holds. Default: no limit. */
  readonly max?: number;
  /** A new target's control for `rule`, such as a `.cp-select`. The rules
   *  wrap it with its remove button. */
  readonly target: (rule: HTMLElement) => HTMLElement;
  /** A new rule, for the `data-add-rule` button: an `<li>` with
   *  `data-when` and its `data-part="when"`, `"verb"` and `"targets"`. The
   *  rules add its buttons. */
  readonly rule?: () => HTMLLIElement;
  readonly words?: RulesWords;
  /** After each add and removal. */
  readonly onChange?: () => void;
  /** Removes the listeners. */
  readonly signal?: AbortSignal;
}

const ADDED = "data-cp-added";

/** An empty quiet button, whose glyph the stylesheet draws by `part`. */
function button(part: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "cp-button";
  b.type = "button";
  b.dataset["variant"] = "quiet";
  b.dataset["size"] = "sm";
  b.setAttribute(part, "");
  return b;
}

/** The text a target's control shows: a select's chosen option, else its
 *  value or its words. */
function nameOf(target: Element): string {
  const control = target.querySelector("select, input, [role='combobox']");
  if (control instanceof HTMLSelectElement) {
    return control.selectedOptions[0]?.text ?? control.value;
  }
  if (control instanceof HTMLInputElement) {
    return control.value;
  }
  return (control?.textContent ?? target.textContent).trim();
}

/**
 * `rules` is a `.cp-rules` holding an `<ol>` of rules, each an `<li>` with
 * `data-when` and a `data-part="targets"` of `.cp-rule-target`s, and a
 * `data-add-rule` button after the list. Rules in the markup are taken as
 * they are; a rule with `data-fixed`, such as the default one, gets no
 * remove of its own.
 */
export function enhanceRules(rules: HTMLElement, options: RulesOptions): void {
  const { max = Infinity, signal, onChange } = options;
  const words = {
    add:
      options.words?.add ??
      ((when: string, full: boolean, n: number) =>
        full ? `Add another ${when}: ${String(n)} is the most` : `Add another ${when}`),
    removeTarget:
      options.words?.removeTarget ?? ((name: string, when: string) => `Remove ${name} ${when}`),
    removed: options.words?.removed ?? ((name: string) => `${name} removed`),
    full: options.words?.full ?? ((n: number) => `${String(n)} is the most`),
  };
  const list = rules.querySelector<HTMLOListElement>(":scope > ol");
  if (list === null || signal?.aborted === true) {
    return;
  }
  const listen = until(signal);
  const when = (row: HTMLElement): string => row.dataset["when"] ?? "";
  const targetsOf = (row: HTMLElement): HTMLElement[] => [
    ...row.querySelectorAll<HTMLElement>('[data-part="targets"] > .cp-rule-target'),
  ];

  const sync = (row: HTMLElement): void => {
    const all = targetsOf(row);
    for (const t of all) {
      const x = t.querySelector<HTMLButtonElement>("[data-remove-target]");
      if (x !== null) {
        x.hidden = all.length < 2;
        x.setAttribute("aria-label", words.removeTarget(nameOf(t), when(row)));
      }
    }
    const add = row.querySelector<HTMLButtonElement>("[data-add-target]");
    if (add !== null) {
      const full = all.length >= max;
      add.toggleAttribute("aria-disabled", full);
      if (full) {
        add.setAttribute("aria-disabled", "true");
      }
      add.setAttribute("aria-label", words.add(when(row), full, max));
    }
  };

  /** Gives `target` its remove button, once. */
  const dress = (target: HTMLElement): HTMLElement => {
    if (target.querySelector("[data-remove-target]") === null) {
      target.append(button("data-remove-target"));
    }
    return target;
  };

  /** Gives `row` its + and, unless it is fixed, its own remove. */
  const fit = (row: HTMLElement): void => {
    for (const t of targetsOf(row)) {
      dress(t);
    }
    let acts = row.querySelector<HTMLElement>(':scope > [data-part="actions"]');
    if (acts === null) {
      acts = document.createElement("span");
      acts.dataset["part"] = "actions";
      row.append(acts);
    }
    if (acts.querySelector("[data-add-target]") === null) {
      acts.append(button("data-add-target"));
    }
    if (!row.hasAttribute("data-fixed") && acts.querySelector("[data-remove-rule]") === null) {
      acts.append(button("data-remove-rule"));
    }
    const remove = acts.querySelector<HTMLButtonElement>("[data-remove-rule]");
    remove?.setAttribute("aria-label", `Remove the rule ${when(row)}`);
    sync(row);
  };

  for (const row of list.querySelectorAll<HTMLElement>(":scope > li")) {
    fit(row);
  }

  rules.addEventListener(
    "click",
    (e) => {
      const t = e.target instanceof Element ? e.target : null;
      const b = t?.closest<HTMLButtonElement>("button");
      if (b === null || b === undefined || !rules.contains(b)) {
        return;
      }
      const row = b.closest<HTMLElement>("ol > li");
      if (b.hasAttribute("data-add-target") && row !== null) {
        if (b.getAttribute("aria-disabled") === "true") {
          return;
        }
        const target = document.createElement("span");
        target.className = "cp-rule-target";
        target.setAttribute(ADDED, "");
        target.append(options.target(row));
        row.querySelector('[data-part="targets"]')?.append(dress(target));
        sync(row);
        if (targetsOf(row).length >= max) {
          announce(words.full(max));
        }
        onChange?.();
      } else if (b.hasAttribute("data-remove-target") && row !== null) {
        const target = b.closest<HTMLElement>(".cp-rule-target");
        if (target === null) {
          return;
        }
        const gone = nameOf(target);
        target.remove();
        sync(row);
        row.querySelector<HTMLButtonElement>("[data-add-target]")?.focus();
        announce(words.removed(gone));
        onChange?.();
      } else if (b.hasAttribute("data-remove-rule") && row !== null) {
        const next = row.nextElementSibling ?? row.previousElementSibling;
        row.remove();
        (
          next?.querySelector<HTMLButtonElement>("[data-add-target]") ??
          rules.querySelector<HTMLButtonElement>("[data-add-rule]")
        )?.focus();
        onChange?.();
      } else if (b.hasAttribute("data-add-rule") && options.rule !== undefined) {
        const r = options.rule();
        r.setAttribute(ADDED, "");
        list.append(r);
        fit(r);
        r.querySelector<HTMLButtonElement>("[data-add-target]")?.focus();
        onChange?.();
      }
    },
    listen,
  );
  // A target's chosen text names its remove.
  rules.addEventListener(
    "change",
    (e) => {
      const row = e.target instanceof Element ? e.target.closest<HTMLElement>("ol > li") : null;
      if (row !== null) {
        sync(row);
      }
    },
    listen,
  );
  rules.addEventListener(
    "animationend",
    (e) => {
      if (e.target instanceof Element) {
        e.target.removeAttribute(ADDED);
      }
    },
    listen,
  );
}
