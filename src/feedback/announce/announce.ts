/**
 * announce.ts — says a message to a screen reader without showing it.
 * `showModal()` makes everything outside the topmost modal dialog inert,
 * live regions included, so `announce()` writes to a polite and an
 * assertive region inside that dialog, and to the page's own pair when no
 * modal is open. Any modal dialog works, whoever opened it.
 * `installAnnouncer()` makes the page's pair and gives each modal its pair
 * as it opens, since a screen reader can miss a region made in the same
 * change that fills it.
 * @module
 */

import { shared } from "../../core/lifetime/lifetime.js";

export type Politeness = "polite" | "assertive";

export interface AnnouncerOptions {
  /** Removes the page's regions and the listener. */
  readonly signal?: AbortSignal;
}

const PAIR = "cp-live-regions";
/** The pause between emptying a region and writing to it, so the same
 *  message twice is read twice. */
const GAP_MS = 100;

const pending = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

/** The pair of regions directly inside `host`, made if it has none. */
function pairIn(host: Element): HTMLElement {
  const own = [...host.children].find(
    (c): c is HTMLElement => c instanceof HTMLElement && c.classList.contains(PAIR),
  );
  if (own !== undefined) {
    return own;
  }
  const pair = document.createElement("div");
  pair.className = `${PAIR} cp-visually-hidden`;
  for (const politeness of ["polite", "assertive"] as const) {
    const region = document.createElement("div");
    region.setAttribute("aria-live", politeness);
    region.setAttribute("aria-atomic", "true");
    region.dataset["cpPoliteness"] = politeness;
    pair.append(region);
  }
  host.append(pair);
  return pair;
}

/** The topmost open modal dialog, the last in the top layer. */
function topModal(): HTMLDialogElement | null {
  const open = [...document.querySelectorAll("dialog")].filter((d) => d.matches(":modal"));
  return open.at(-1) ?? null;
}

/**
 * Says `message` from the topmost modal dialog's regions, else the page's.
 * A message said again is read again; a second message at the same
 * politeness within 100ms replaces the first. With no announcer installed
 * and no dialog open, it does nothing.
 */
export function announce(message: string, politeness: Politeness = "polite"): void {
  const host = topModal() ?? (page.active ? document.body : null);
  if (host === null) {
    return;
  }
  const region = pairIn(host).querySelector<HTMLElement>(`[data-cp-politeness="${politeness}"]`);
  if (region === null) {
    return;
  }
  region.textContent = "";
  clearTimeout(pending.get(region));
  pending.set(
    region,
    setTimeout(() => {
      pending.delete(region);
      region.textContent = message;
    }, GAP_MS),
  );
}

const page = shared((signal) => {
  pairIn(document.body);
  for (const d of document.querySelectorAll("dialog")) {
    pairIn(d);
  }
  // A dialog's pair exists before it opens: its beforetoggle fires first.
  document.addEventListener(
    "beforetoggle",
    (e) => {
      const t = e.target;
      if (t instanceof HTMLDialogElement && e.newState === "open") {
        pairIn(t);
      }
    },
    { capture: true, signal },
  );
  // A dialog's close empties its regions, so a message never waits there to
  // be read again when it next opens.
  document.addEventListener(
    "close",
    (e) => {
      const t = e.target;
      if (t instanceof HTMLDialogElement) {
        for (const r of pairIn(t).children) {
          r.textContent = "";
        }
      }
    },
    { capture: true, signal },
  );
  signal.addEventListener(
    "abort",
    () => {
      for (const t of pending.values()) {
        clearTimeout(t);
      }
      pending.clear();
      for (const pair of document.querySelectorAll(`.${PAIR}`)) {
        pair.remove();
      }
    },
    { once: true },
  );
});

/**
 * Makes the page's regions and gives every modal dialog its own pair before
 * it opens, once for the page however many parts of it call this. The
 * regions stay until every caller's signal has aborted.
 */
export function installAnnouncer(options: AnnouncerOptions = {}): void {
  page.install(options);
}
