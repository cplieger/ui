/**
 * loading-region.ts — `enhanceLoadingRegion()` runs the content cycle of a
 * region that loads its own content: a first load behind a placeholder, a
 * refresh that keeps the old content under a line along the region's top
 * edge, and a failure that says what broke with Retry, above the old
 * content when there is some. The region is `aria-busy` while it loads.
 * @module
 */

import { enhanceConfirm, type Confirm } from "../../buttons/confirm/confirm.js";
import { turnWhile } from "../../buttons/turn/turn.js";
import { until, whenAborted } from "../../core/lifetime/lifetime.js";
import { focusOn } from "../../data/list-row/row.js";
import { announce } from "../announce/announce.js";
import { skeletonTiming } from "../skeleton/skeleton.js";

/** `idle`: never loaded, nothing in it. `loading`: its first load runs.
 *  `failed`: a load failed with nothing to show under it. `ready`: its
 *  content is current. `refreshing`: a load runs over its content.
 *  `stale`: a refresh failed, so its content is older than asked. */
export type LoadingState = "idle" | "loading" | "failed" | "ready" | "refreshing" | "stale";

export interface LoadingRegionWords {
  /** The placeholder's words on a first load. Default "Loading…". */
  readonly loading?: string;
  /** Said and shown when a load fails with nothing under it, or built from
   *  what `load` rejected with. Default "The content did not load." */
  readonly failed?: string | ((reason: unknown) => string);
  /** Said and shown when a refresh fails over content loaded at `loadedAt`.
   *  Default "The refresh failed. What you see is from 14:02." */
  readonly refreshFailed?: (reason: unknown, loadedAt: Date) => string;
  /** What the person can do about a failure, shown under its sentence and
   *  not said; none when it returns undefined. Default none. */
  readonly remedy?: (reason: unknown) => string | undefined;
  /** Retry's words at rest. Default "Retry". */
  readonly retry?: string;
  /** Retry's words while it loads. Default "Retrying…". */
  readonly retrying?: string;
}

export interface LoadingRegionOptions<T> {
  /** Fetches the content. Its signal aborts with the module's, and when a
   *  later `load()` replaces this one. */
  readonly load: (signal: AbortSignal) => Promise<T>;
  /** Puts the content in the region. After a first load the region is
   *  empty when it runs; after a refresh it holds the old content, which
   *  `render` replaces or updates in place. */
  readonly render: (data: T) => void;
  /** The first load's placeholder, such as a skeleton in the content's
   *  shape. Default: a `.cp-inline-load` with the loading words. */
  readonly placeholder?: () => Node;
  /** When the content the region holds now was loaded. Default: now when
   *  the region holds content, so the cycle starts `ready`, else `idle`. */
  readonly loadedAt?: Date;
  /** The locale the time in the refresh failure is written in. Default:
   *  the document's language. */
  readonly locale?: string;
  readonly words?: LoadingRegionWords;
  /** Ends a load under way and the region's wiring. */
  readonly signal?: AbortSignal;
}

export interface LoadingRegion {
  /**
   * Loads the region's content, turning `from`, the button pressed, while
   * it runs. A load already running is aborted and its call resolves
   * false. Resolves true once the content is rendered, false when it
   * failed or the signal aborted.
   */
  load(from?: Element): Promise<boolean>;
  readonly state: LoadingState;
}

const NOTICE = "data-cp-load-notice";

/** A load under way, and what an abort puts back. */
interface Run {
  readonly life: AbortController;
  readonly before: LoadingState;
  readonly timing: { cancel(): void } | null;
}
/** The refresh line's thickness in loading-region.css. */
const LINE_PX = 3;

function glyph(name: string, part?: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "cp-icon";
  span.dataset["cpIcon"] = name;
  if (part !== undefined) {
    span.dataset["part"] = part;
  }
  span.setAttribute("aria-hidden", "true");
  return span;
}

function inlineLoad(words: string): HTMLSpanElement {
  const square = document.createElement("span");
  square.className = "cp-loader";
  square.setAttribute("aria-hidden", "true");
  square.append(document.createElement("span"));
  const load = document.createElement("span");
  load.className = "cp-inline-load";
  load.append(square, words);
  return load;
}

/** `work`, settled early by `signal`'s abort, so a load whose host ignores
 *  its signal still frees the region for the load that replaced it. */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  const aborted = new Promise<never>((_resolve, reject) => {
    signal.addEventListener(
      "abort",
      () => {
        reject(new DOMException("The load was replaced.", "AbortError"));
      },
      { once: true },
    );
  });
  aborted.catch(() => undefined);
  return Promise.race([work, aborted]);
}

function holdsContent(region: Element): boolean {
  return region.childElementCount > 0 || region.textContent.trim() !== "";
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/** The table whose head the refresh line runs under: the region's first
 *  child, or the first child of a panel that is. */
function leadTable(region: Element): HTMLTableElement | null {
  const first = region.firstElementChild;
  const table =
    first instanceof HTMLTableElement
      ? first
      : (first?.querySelector(":scope > table:first-child") ?? null);
  return table instanceof HTMLTableElement ? table : null;
}

/** Whether the person's focus is where a settled load should take it
 *  from: in the region, lost to the page, or on what opened the region. */
function attending(region: HTMLElement): boolean {
  const at = document.activeElement;
  if (at === null || at === document.body || region.contains(at)) {
    return true;
  }
  return at instanceof HTMLButtonElement && at.popoverTargetElement === region;
}

/**
 * Wires `region` to load its content with `load` and put it in with
 * `render`. Nothing loads until `load()` is called, as on a first open or
 * a Refresh button's press. Failures are said politely, as background
 * work's are; a load's success is the host's to say in `render`.
 */
export function enhanceLoadingRegion<T>(
  region: HTMLElement,
  options: LoadingRegionOptions<T>,
): LoadingRegion {
  const { signal } = options;
  const words = options.words ?? {};
  const retryWords = words.retry ?? "Retry";
  const locale = options.locale ?? (document.documentElement.lang || undefined);
  let state: LoadingState = holdsContent(region) ? "ready" : "idle";
  let loadedAt = options.loadedAt ?? new Date();
  let running: Run | null = null;
  let notice: HTMLElement | null = null;
  let sentence: HTMLElement | null = null;
  let remedyLine: HTMLElement | null = null;
  let retry: HTMLButtonElement | null = null;
  let retryCycle: Confirm | null = null;

  const mark = (next: LoadingState): void => {
    state = next;
    region.dataset["cpLoad"] = next;
    region.setAttribute("aria-busy", String(next === "loading" || next === "refreshing"));
  };
  region.dataset["cpLoad"] = state;

  whenAborted(signal, () => {
    running?.life.abort();
  });

  const failedSentence = (reason: unknown): string => {
    const failed = words.failed ?? "The content did not load.";
    return typeof failed === "function" ? failed(reason) : failed;
  };

  const refreshSentence = (reason: unknown): string => {
    if (words.refreshFailed !== undefined) {
      return words.refreshFailed(reason, loadedAt);
    }
    const format = new Intl.DateTimeFormat(
      locale,
      sameDay(loadedAt, new Date())
        ? { timeStyle: "short" }
        : { dateStyle: "medium", timeStyle: "short" },
    );
    return `The refresh failed. What you see is from ${format.format(loadedAt)}.`;
  };

  /** The one notice the region's failures write, made on the first. A
   *  refresh's failure is a warning, since what it keeps is still true as
   *  of its time; a first load's is danger, with nothing to show. */
  const noticeWith = (text: string, over: boolean, reason: unknown): HTMLElement => {
    if (notice === null || sentence === null || retry === null) {
      notice = document.createElement("div");
      notice.className = "cp-notice";
      notice.setAttribute(NOTICE, "");
      sentence = document.createElement("span");
      const button = document.createElement("button");
      button.className = "cp-button";
      button.dataset["size"] = "sm";
      button.type = "button";
      const roll = document.createElement("span");
      roll.className = "cp-roll";
      roll.textContent = retryWords;
      button.append(glyph("spinner-arc", "busy"), roll);
      const body = document.createElement("span");
      body.dataset["part"] = "text";
      body.append(sentence);
      notice.append(glyph("circle-x"), body, button);
      retry = button;
      retryCycle = enhanceConfirm(button, {
        busy: words.retrying ?? "Retrying…",
        done: false,
        ...(signal === undefined ? {} : { signal }),
      });
      button.addEventListener(
        "click",
        () => {
          void api.load(button);
        },
        until(signal),
      );
    }
    notice.dataset["tone"] = over ? "warning" : "danger";
    notice.firstElementChild?.setAttribute("data-cp-icon", over ? "triangle-alert" : "circle-x");
    sentence.textContent = text;
    const remedy = words.remedy?.(reason);
    if (remedy === undefined) {
      remedyLine?.remove();
    } else {
      remedyLine ??= document.createElement("small");
      remedyLine.textContent = remedy;
      sentence.after(remedyLine);
    }
    return notice;
  };

  /** Where focus goes once content replaced what held it: the content's
   *  first heading, else the button that asked, else the region. */
  const refocus = (from: Element | undefined): void => {
    const heading = region.querySelector<HTMLElement>("h1, h2, h3, h4, h5, h6");
    if (heading !== null) {
      focusOn(heading);
    } else if (from instanceof HTMLElement && from.isConnected && !region.contains(from)) {
      from.focus();
    } else {
      focusOn(region);
    }
  };

  const lost = (): boolean => {
    const at = document.activeElement;
    return (
      at === null ||
      at === document.body ||
      (at instanceof HTMLButtonElement && at.popoverTargetElement === region)
    );
  };

  const run = async (from: Element | undefined): Promise<boolean> => {
    const life = new AbortController();
    const before = state;
    const stale = state === "ready" || state === "stale";
    const firstTime = state === "idle";
    mark(stale ? "refreshing" : "loading");
    if (stale) {
      const head = leadTable(region)?.tHead ?? null;
      if (head !== null) {
        const top = region.getBoundingClientRect().top + region.clientTop;
        const at = head.getBoundingClientRect().bottom - top - LINE_PX;
        region.style.setProperty("--cp-load-line-at", `${String(at)}px`);
      } else {
        region.style.removeProperty("--cp-load-line-at");
      }
    }
    const timing = firstTime
      ? skeletonTiming(
          () => {
            region.replaceChildren(
              options.placeholder?.() ?? inlineLoad(words.loading ?? "Loading…"),
            );
            return () => {
              region.replaceChildren();
            };
          },
          { showDelayMs: 200, minVisibleMs: 400, signal: life.signal },
        )
      : null;
    running = { life, before, timing };
    const work = untilAborted(options.load(life.signal), life.signal);
    let data: T;
    try {
      if (from !== undefined && from === retry && retryCycle !== null) {
        // The cycle holds its busy state for its minimum after work ends;
        // the content goes in as soon as it comes.
        retryCycle.run(() => work).catch(() => undefined);
        data = await work;
      } else {
        data = from === undefined ? await work : await turnWhile(from, work);
      }
    } catch (reason) {
      if (life.signal.aborted) {
        settleAborted(life);
        return false;
      }
      timing?.cancel();
      const regain = attending(region);
      const text = stale ? refreshSentence(reason) : failedSentence(reason);
      const box = noticeWith(text, stale, reason);
      if (stale) {
        if (region.firstElementChild !== box) {
          region.prepend(box);
        }
      } else {
        region.replaceChildren(box);
      }
      mark(stale ? "stale" : "failed");
      announce(text);
      if (regain && retry !== null) {
        retry.focus();
      }
      return false;
    }
    if (life.signal.aborted) {
      settleAborted(life);
      return false;
    }
    // A later load cancels this one's deferred paint, so its abort settles it.
    return new Promise<boolean>((resolve) => {
      life.signal.addEventListener(
        "abort",
        () => {
          settleAborted(life);
          resolve(false);
        },
        { once: true },
      );
      const paint = (): void => {
        const regain = attending(region);
        notice?.remove();
        if (!stale) {
          region.replaceChildren();
        }
        options.render(data);
        loadedAt = new Date();
        mark("ready");
        if (regain && lost()) {
          refocus(from);
        }
        resolve(true);
      };
      if (timing === null) {
        paint();
      } else {
        timing.commit(paint);
      }
    });
  };

  /** Puts back the state a run started from, unless a later load
   *  superseded it, which already did and now owns the region. */
  const settleAborted = (life: AbortController): void => {
    if (running?.life !== life) {
      return;
    }
    running.timing?.cancel();
    mark(running.before);
    running = null;
  };

  const api: LoadingRegion = {
    async load(from) {
      if (signal?.aborted === true) {
        return false;
      }
      if (running !== null) {
        const earlier = running;
        earlier.life.abort();
        settleAborted(earlier.life);
      }
      const settled = run(from);
      const mine = running;
      try {
        return await settled;
      } finally {
        if (running === mine) {
          running = null;
        }
      }
    },
    get state() {
      return state;
    },
  };
  return api;
}
