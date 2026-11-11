/**
 * disclosure.ts — native `<details>` that glide open and shut in every
 * engine. CSS can take a height to `auto` only where `interpolate-size`
 * ships, so the height glides in script. `enhanceDisclosure()` glides one
 * `<details>`; sections that share a `name` open one at a time, the others
 * gliding shut as one opens. `glideShow()` glides any element in or out,
 * such as a bar that pushes the content under it.
 * @module
 */

import { reducedMotion, until } from "../../core/lifetime/lifetime.js";

export interface DisclosureOptions {
  /** Removes the listener and stops the glide. */
  readonly signal?: AbortSignal;
}

const CLOSING = "data-cp-closing";
const EASE_OUT = "cubic-bezier(0.2, 0, 0, 1)";
const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";

const glides = new WeakMap<HTMLElement, Animation>();

/** Glides `el`'s height from `from` to `to` pixels, then runs `done`. The
 *  end height holds until `done` commits the open or shut state. */
function glide(el: HTMLElement, from: number, to: number, done?: () => void): void {
  glides.get(el)?.cancel();
  const run = el.animate(
    [
      { blockSize: `${String(from)}px`, overflow: "clip" },
      { blockSize: `${String(to)}px`, overflow: "clip" },
    ],
    { duration: reducedMotion() ? 0 : 240, easing: EASE_OUT, fill: "forwards" },
  );
  glides.set(el, run);
  void run.finished.then(
    () => {
      done?.();
      run.cancel();
      glides.delete(el);
    },
    () => undefined,
  );
}

function summaryOf(d: HTMLDetailsElement): HTMLElement | null {
  return d.querySelector<HTMLElement>(":scope > summary");
}

/** Glides `d` shut, keeping it open while it shrinks so its content stays
 *  drawn; the open state flips at the end. */
function shut(d: HTMLDetailsElement): void {
  const from = d.getBoundingClientRect().height;
  const to = summaryOf(d)?.getBoundingClientRect().height ?? 0;
  d.setAttribute(CLOSING, "");
  glide(d, from, to, () => {
    d.removeAttribute(CLOSING);
    d.open = false;
  });
}

/**
 * Glides `details` open and shut on a press of its summary. A `name` it
 * shares with other sections makes them one at a time: the browser's own
 * group would force shut the section just opened while a sibling is still
 * gliding, so the group is kept here under `data-cp-group`.
 */
export function enhanceDisclosure(
  details: HTMLDetailsElement,
  options: DisclosureOptions = {},
): void {
  const { signal } = options;
  const summary = summaryOf(details);
  if (summary === null || signal?.aborted === true) {
    return;
  }
  const name = details.getAttribute("name");
  if (name !== null) {
    details.removeAttribute("name");
    details.dataset["cpGroup"] = name;
  }
  summary.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      if (details.open && !details.hasAttribute(CLOSING)) {
        shut(details);
        return;
      }
      const from = details.getBoundingClientRect().height;
      details.removeAttribute(CLOSING);
      const group = details.dataset["cpGroup"];
      if (group !== undefined) {
        const root = details.getRootNode() as Document | ShadowRoot;
        for (const other of root.querySelectorAll<HTMLDetailsElement>("details[data-cp-group]")) {
          if (
            other !== details &&
            other.dataset["cpGroup"] === group &&
            other.open &&
            !other.hasAttribute(CLOSING)
          ) {
            shut(other);
          }
        }
      }
      details.open = true;
      glide(details, from, details.getBoundingClientRect().height);
    },
    until(signal),
  );
  signal?.addEventListener(
    "abort",
    () => {
      glides.get(details)?.finish();
      if (name !== null) {
        details.setAttribute("name", name);
        delete details.dataset["cpGroup"];
      }
    },
    { once: true },
  );
}

/** Shows or hides `el` by gliding its height, instead of letting the content
 *  under it jump. Showing an element already shown does nothing. */
export function glideShow(el: HTMLElement, show: boolean): void {
  if (show === !el.hidden && !glides.has(el)) {
    return;
  }
  if (show) {
    el.hidden = false;
    const to = el.getBoundingClientRect().height;
    glides.get(el)?.cancel();
    const run = el.animate(
      [
        { blockSize: "0px", opacity: 0, overflow: "clip" },
        { blockSize: `${String(to)}px`, opacity: 1, overflow: "clip" },
      ],
      { duration: reducedMotion() ? 0 : 240, easing: EASE_OUT },
    );
    glides.set(el, run);
    void run.finished.then(
      () => glides.delete(el),
      () => undefined,
    );
    return;
  }
  const from = el.getBoundingClientRect().height;
  glides.get(el)?.cancel();
  const run = el.animate(
    [
      { blockSize: `${String(from)}px`, opacity: 1, overflow: "clip" },
      { blockSize: "0px", opacity: 0, overflow: "clip" },
    ],
    { duration: reducedMotion() ? 0 : 240, easing: EASE_IN },
  );
  glides.set(el, run);
  void run.finished.then(
    () => {
      el.hidden = true;
      glides.delete(el);
    },
    () => undefined,
  );
}
