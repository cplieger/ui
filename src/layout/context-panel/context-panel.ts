/**
 * context-panel.ts — `enhanceContextPanel()` docks a context panel, such as
 * a thread's reservations, queue and followers, as a column beside its main
 * column once the box holding both is wide enough, and makes it a
 * disclosure above the main column below that width.
 * @module
 */

import { whenAborted } from "../../core/lifetime/lifetime.js";
import { enhanceDisclosure } from "../../navigation/disclosure/disclosure.js";

export interface ContextPanelOptions {
  /** Removes the observer and the listeners and undocks the panel. Default:
   *  none, kept for the page's life. */
  readonly signal?: AbortSignal;
  /** The box's width, in rem, from which the panel docks. Default 48. */
  readonly dockAt?: number;
}

const DOCKED = "data-cp-docked";
const CLOSING = "data-cp-closing";

function remPx(): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

/**
 * `root` is a `.cp-context` whose first child is a `details.cp-context-panel`
 * with its `<summary>`, and whose second is the `.cp-context-main`. Docked,
 * the panel is open and its summary hidden; below the docking width it is a
 * disclosure, open or shut as the person last left it, and open while focus
 * is inside it. Throws a TypeError when `root` has no such panel.
 */
export function enhanceContextPanel(root: HTMLElement, options: ContextPanelOptions = {}): void {
  const panel = root.firstElementChild;
  const summary = panel?.querySelector<HTMLElement>(":scope > summary") ?? null;
  if (!(panel instanceof HTMLDetailsElement) || summary === null) {
    throw new TypeError("enhanceContextPanel: root's first child is no details with a summary");
  }
  const { signal } = options;
  if (signal?.aborted === true) {
    return;
  }
  const dockAt = options.dockAt ?? 48;
  enhanceDisclosure(panel, signal === undefined ? {} : { signal });

  /** The state the person chose for the disclosure. */
  let chosen = panel.open;
  let docked = false;
  /** A heading given tabindex="-1" to hold focus the hidden summary had. */
  let holder: HTMLElement | null = null;

  const onToggle = (): void => {
    if (!docked) {
      chosen = panel.open;
    } else if (!panel.open) {
      panel.open = true;
    }
  };
  panel.addEventListener("toggle", onToggle);

  const dock = (): void => {
    docked = true;
    // A glide shutting the panel would shut it at its end, under a hidden
    // summary that could not open it again.
    for (const run of panel.getAnimations()) {
      run.cancel();
    }
    panel.removeAttribute(CLOSING);
    const hadSummary = document.activeElement === summary;
    root.setAttribute(DOCKED, "");
    panel.open = true;
    if (hadSummary) {
      const heading = panel.querySelector<HTMLElement>(":scope > section :is(h2, h3, h4)");
      if (heading !== null && !heading.hasAttribute("tabindex")) {
        heading.tabIndex = -1;
        holder = heading;
      }
      heading?.focus({ preventScroll: true });
    }
  };

  const undock = (): void => {
    docked = false;
    root.removeAttribute(DOCKED);
    if (panel.contains(document.activeElement)) {
      chosen = true;
    }
    panel.open = chosen;
  };

  const place = (): void => {
    const box = root.getBoundingClientRect();
    // A hidden root, such as a closed detail, has no width to go by.
    if (box.width === 0 && box.height === 0) {
      return;
    }
    const want = box.width >= dockAt * remPx();
    if (want !== docked) {
      if (want) {
        dock();
      } else {
        undock();
      }
    }
  };

  // Docking resizes the box, so a change inside the observer's own
  // callback would raise "ResizeObserver loop completed"; it waits a frame.
  let frame = 0;
  const resize = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(place);
  });
  resize.observe(root);
  place();

  whenAborted(signal, () => {
    resize.disconnect();
    cancelAnimationFrame(frame);
    panel.removeEventListener("toggle", onToggle);
    if (docked) {
      undock();
    }
    holder?.removeAttribute("tabindex");
    holder = null;
  });
}
