/**
 * anchor.ts — native popovers placed by CSS anchor positioning.
 * `installAnchors()` names each opener and its popover as a pair the moment
 * the opener is pressed, so `.cp-popover` sits by the button that opened it
 * and flips to stay in view; a popover shared by several buttons, such as one
 * menu for every row, follows the one pressed. `showPopoverAt()` opens a
 * popover at a point instead, as a context menu does.
 * @module
 */

export interface AnchorOptions {
  /** Ends this call's hold on the listener. Default: none, held for the
   *  page's life. */
  readonly signal?: AbortSignal;
}

const AT = "data-uip-at";
let seq = 0;
let holds = 0;
let listening: AbortController | null = null;

/** The popover `opener` opens: by `popovertarget`, or by `commandfor` with a
 *  popover command. */
function target(opener: Element): HTMLElement | null {
  const id =
    opener.getAttribute("popovertarget") ??
    ((opener.getAttribute("command") ?? "").endsWith("popover")
      ? opener.getAttribute("commandfor")
      : null);
  if (id === null) {
    return null;
  }
  const el =
    opener.getRootNode() instanceof ShadowRoot
      ? (opener.getRootNode() as ShadowRoot).getElementById(id)
      : document.getElementById(id);
  return el instanceof HTMLElement && el.hasAttribute("popover") ? el : null;
}

const names = new WeakMap<HTMLElement, string>();

/** Adds `name` to `el`'s `anchor-name` list, beside the names it has. */
export function addAnchorName(el: HTMLElement, name: string): void {
  const list = el.style
    .getPropertyValue("anchor-name")
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n !== "");
  if (!list.includes(name)) {
    el.style.setProperty("anchor-name", [...list, name].join(", "));
  }
}

/** Takes `name` out of `el`'s `anchor-name` list, leaving the others. */
export function removeAnchorName(el: HTMLElement, name: string): void {
  const list = el.style
    .getPropertyValue("anchor-name")
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n !== "" && n !== name);
  if (list.length === 0) {
    el.style.removeProperty("anchor-name");
  } else {
    el.style.setProperty("anchor-name", list.join(", "));
  }
}

function nameOf(opener: HTMLElement): string {
  let name = names.get(opener);
  if (name === undefined) {
    name = `--cp-anchor-${String(++seq)}`;
    names.set(opener, name);
  }
  addAnchorName(opener, name);
  return name;
}

/** Ties `popover` to `opener`, so it sits by the opener when it opens. */
export function anchorTo(popover: HTMLElement, opener: HTMLElement): void {
  popover.removeAttribute(AT);
  for (const p of ["inset", "margin", "left", "top"]) {
    popover.style.removeProperty(p);
  }
  popover.style.setProperty("position-anchor", nameOf(opener));
}

/**
 * Opens `popover` with its corner at the point (`x`, `y`) in viewport
 * pixels, moved in so it stays inside the window. Showing it moves focus by
 * the popover's own rules; a menu enhanced by `enhanceMenu` takes it.
 */
export function showPopoverAt(popover: HTMLElement, x: number, y: number): void {
  popover.setAttribute(AT, "");
  popover.style.setProperty("position-anchor", "none");
  // The popover's own inset and margin would centre it.
  popover.style.inset = "auto";
  popover.style.margin = "0";
  popover.style.left = `${String(x)}px`;
  popover.style.top = `${String(y)}px`;
  if (!popover.matches(":popover-open")) {
    popover.showPopover();
  }
  const box = popover.getBoundingClientRect();
  const margin = 8;
  popover.style.left = `${String(Math.max(margin, Math.min(x, innerWidth - box.width - margin)))}px`;
  popover.style.top = `${String(Math.max(margin, Math.min(y, innerHeight - box.height - margin)))}px`;
}

function listen(signal: AbortSignal): void {
  // A click runs before the button's default action opens the popover, so
  // the pair is named in the press's own task.
  document.addEventListener(
    "click",
    (e) => {
      const from = e.composedPath()[0];
      const opener =
        from instanceof Element ? from.closest<HTMLElement>("[popovertarget], [commandfor]") : null;
      const pop = opener === null ? null : target(opener);
      if (opener !== null && pop !== null && !pop.contains(opener)) {
        anchorTo(pop, opener);
      }
    },
    { capture: true, signal },
  );
}

/**
 * Starts naming opener and popover pairs, once for the page however many
 * parts of it call this. The listener stays until every caller's signal has
 * aborted; a caller with no signal holds it for the page's life.
 */
export function installAnchors(options: AnchorOptions = {}): void {
  const { signal } = options;
  if (signal?.aborted === true) {
    return;
  }
  holds += 1;
  if (listening === null) {
    listening = new AbortController();
    listen(listening.signal);
  }
  signal?.addEventListener(
    "abort",
    () => {
      holds -= 1;
      if (holds === 0) {
        listening?.abort();
        listening = null;
      }
    },
    { once: true },
  );
}
