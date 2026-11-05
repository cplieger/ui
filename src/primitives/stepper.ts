/**
 * stepper.ts — the progress display of a multi-step flow whose steps are
 * routes: an ordered list naming every step, each marked done, current or to
 * do in its accessible text as well as its `data-state`, and the heading for
 * the host's `<h1>`. It keeps no step index and no draft: the host passes every
 * step's state on each navigation, and owns the buttons, the form and the route.
 *
 * @module
 */

import { untracked } from "../signal/signal.js";
import { ownedBinding } from "./owner.js";

/** Where a step stands. */
export type StepState = "done" | "current" | "todo";

/** One step of the flow. */
export interface StepperStep {
  /** Stable id, unique in the list. Used for the item's `data-step` attribute. */
  readonly id: string;
  /** Visible name, also used in the heading. */
  readonly label: string;
  readonly state: StepState;
  /** Where the item links. A `current` step never links. A `done` or `todo`
   *  step links when `href` is set and is plain text when it is null. */
  readonly href: string | null;
}

/** The words the stepper writes. Every field is optional. */
export interface StepperLabels {
  /** Default: `(n, m, label) => "Step n of m: label"`. */
  readonly heading?: (n: number, m: number, label: string) => string;
  /** Visually hidden state words read after each item's label.
   *  Defaults: "done", "current step", "not started". */
  readonly done?: string;
  readonly current?: string;
  readonly todo?: string;
  /** The list's accessible name. Default "Progress". */
  readonly list?: string;
}

/** Handle on a rendered step list. After `dispose()`, `update` does nothing and
 *  `heading` returns the last heading. */
export interface StepperController {
  /** Replace the steps. Throws a `TypeError` on a list that breaks the contract
   *  (no step, not exactly one `current` step, a duplicate `id`, an empty
   *  `label`) and leaves the previous list rendered. */
  update(steps: readonly StepperStep[]): void;
  /** The heading for the current steps, for the host's `<h1>`. */
  heading(): string;
  /** Remove what `createStepper` added to `root`. Idempotent. */
  dispose(): void;
}

interface Words {
  readonly heading: (n: number, m: number, label: string) => string;
  readonly state: Readonly<Record<StepState, string>>;
  readonly list: string;
}

/** An item as rendered: its node and the fields it shows. */
interface Rendered {
  readonly node: HTMLLIElement;
  readonly label: string;
  readonly state: StepState;
  readonly href: string | null;
}

/** The host's steps copied field by field, so no getter is read later or tracked. */
function snapshot(steps: readonly StepperStep[]): StepperStep[] {
  return untracked(() => steps.map(({ id, label, state, href }) => ({ id, label, state, href })));
}

/** The index of the current step, after checking the list keeps the contract. */
function currentIndex(steps: readonly StepperStep[]): number {
  if (steps.length === 0) {
    throw new TypeError("@cplieger/ui/stepper: no step");
  }
  const ids = new Set<string>();
  let current = -1;
  for (const [i, s] of steps.entries()) {
    if (ids.has(s.id)) {
      throw new TypeError(`@cplieger/ui/stepper: duplicate step id ${JSON.stringify(s.id)}`);
    }
    ids.add(s.id);
    if (s.label.trim() === "") {
      throw new TypeError(`@cplieger/ui/stepper: step ${JSON.stringify(s.id)} has an empty label`);
    }
    if (s.state === "current") {
      if (current !== -1) {
        throw new TypeError("@cplieger/ui/stepper: more than one current step");
      }
      current = i;
    }
  }
  if (current === -1) {
    throw new TypeError("@cplieger/ui/stepper: no current step");
  }
  return current;
}

function renderItem(step: StepperStep, words: Words): HTMLLIElement {
  const li = document.createElement("li");
  li.dataset["step"] = step.id;
  li.dataset["state"] = step.state;
  const hidden = document.createElement("span");
  hidden.className = "uip-visually-hidden";
  hidden.textContent = `, ${words.state[step.state]}`;
  if (step.state === "current") {
    li.setAttribute("aria-current", "step");
  }
  if (step.state !== "current" && step.href !== null) {
    const a = document.createElement("a");
    a.href = step.href;
    a.append(step.label, hidden);
    li.append(a);
  } else {
    li.append(step.label, hidden);
  }
  return li;
}

/** Put `nodes` in `list` in order, never moving the one holding focus: any
 *  re-seat of a node blurs what is focused inside it. */
function place(list: HTMLOListElement, nodes: readonly HTMLLIElement[]): void {
  // The root's own active element: inside a shadow root, document's is the host.
  const focus = (list.getRootNode() as Document | ShadowRoot).activeElement;
  const at = nodes.findIndex((n) => n.contains(focus));
  if (at === -1) {
    for (const [i, node] of nodes.entries()) {
      const here = list.children[i] ?? null;
      if (here !== node) {
        list.insertBefore(node, here);
      }
    }
    return;
  }
  for (let i = at - 1; i >= 0; i--) {
    const [node, after] = [nodes[i], nodes[i + 1]];
    if (node !== undefined && after !== undefined && node.nextSibling !== after) {
      list.insertBefore(node, after);
    }
  }
  for (let i = at + 1; i < nodes.length; i++) {
    const [before, node] = [nodes[i - 1], nodes[i]];
    if (before !== undefined && node !== undefined && before.nextSibling !== node) {
      list.insertBefore(node, before.nextSibling);
    }
  }
}

/** Render the step list into `root` (an empty element the host places) and
 *  return its controller. Throws a `TypeError` as `update` does, adding nothing. */
export function createStepper(
  root: HTMLElement,
  steps: readonly StepperStep[],
  labels?: StepperLabels,
): StepperController {
  const words: Words = untracked(() => ({
    heading: labels?.heading ?? ((n, m, label) => `Step ${String(n)} of ${String(m)}: ${label}`),
    state: {
      done: labels?.done ?? "done",
      current: labels?.current ?? "current step",
      todo: labels?.todo ?? "not started",
    },
    list: labels?.list ?? "Progress",
  }));
  const first = snapshot(steps);
  let current = currentIndex(first);

  return ownedBinding((binding) => {
    const list = document.createElement("ol");
    list.className = "uip-stepper";
    list.setAttribute("aria-label", words.list);
    let shown = first;
    let rendered = new Map<string, Rendered>();

    const render = (next: readonly StepperStep[]): void => {
      const kept = new Map<string, Rendered>();
      const nodes = next.map((s) => {
        const was = rendered.get(s.id);
        const same = was?.label === s.label && was.state === s.state && was.href === s.href;
        const r: Rendered = same
          ? was
          : { node: renderItem(s, words), label: s.label, state: s.state, href: s.href };
        kept.set(s.id, r);
        return r.node;
      });
      for (const [id, r] of rendered) {
        if (kept.get(id)?.node !== r.node) {
          r.node.remove();
        }
      }
      place(list, nodes);
      rendered = kept;
    };

    return {
      controller: {
        update(steps: readonly StepperStep[]): void {
          if (binding.ended) {
            return;
          }
          const next = snapshot(steps);
          const index = currentIndex(next);
          render(next);
          shown = next;
          current = index;
        },
        heading(): string {
          const step = shown[current];
          return step === undefined ? "" : words.heading(current + 1, shown.length, step.label);
        },
        dispose: binding.dispose,
      },
      start: () => {
        render(first);
        root.append(list);
      },
      release: () => {
        list.remove();
      },
    };
  });
}
