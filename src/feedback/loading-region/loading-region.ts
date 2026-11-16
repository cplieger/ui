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
import { localeOf } from "../../core/locale/locale.js";
import { safely } from "../../core/safely/safely.js";
import { focusOn } from "../../data/list-row/row.js";
import { glyph } from "../../foundations/icons/glyph.js";
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
  /** When the content the region holds now was loaded. Default: when the
   *  region is wired. */
  readonly loadedAt?: Date;
  /** The locale the time in the refresh failure is written in, a malformed
   *  one throwing a `RangeError` here. Default: the region's `lang`, or its
   *  nearest ancestor's. */
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
  const locale = options.locale ?? localeOf(region);
  const time = new Intl.DateTimeFormat(locale, { timeStyle: "short" });
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  let state: LoadingState = holdsContent(region) ? "ready" : "idle";
  let loadedAt = options.loadedAt ?? new Date();
  let running: Run | null = null;
  let notice: HTMLElement | null = null;
  let sentence: HTMLElement | null = null;
  let remedyLine: HTMLElement | null = null;
  let retry: HTMLButtonElement | null = null;
  let retryCycle: Confirm | null = null;
  let tracking: AbortController | null = null;

  const mark = (next: LoadingState): void => {
    state = next;
    if (next !== "refreshing") {
      tracking?.abort();
      tracking = null;
    }
    region.dataset["cpLoad"] = next;
    region.setAttribute("aria-busy", String(next === "loading" || next === "refreshing"));
  };
  region.dataset["cpLoad"] = state;

  whenAborted(signal, () => {
    running?.life.abort();
  });

  const failedSentence = (reason: unknown): string => {
    const fallback = "The content did not load.";
    const failed = words.failed ?? fallback;
    return typeof failed === "function"
      ? safely(
          () => failed(reason),
          () => fallback,
        )
      : failed;
  };

  // safely's fallback for refreshFailed, so it must not throw: an
  // invalid loadedAt leaves the time out rather than format it.
  const sinceSentence = (): string => {
    if (Number.isNaN(loadedAt.getTime())) {
      return "The refresh failed.";
    }
    const format = sameDay(loadedAt, new Date()) ? time : dateTime;
    return `The refresh failed. What you see is from ${format.format(loadedAt)}.`;
  };

  const refreshSentence = (reason: unknown): string => {
    const { refreshFailed } = words;
    return refreshFailed === undefined
      ? sinceSentence()
      : safely(() => refreshFailed(reason, loadedAt), sinceSentence);
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
    notice.firstElementChild?.replaceWith(glyph(over ? "triangle-alert" : "circle-x"));
    sentence.textContent = text;
    const { remedy: remedyOf } = words;
    const remedy =
      remedyOf === undefined
        ? undefined
        : safely(
            () => remedyOf(reason),
            () => undefined,
          );
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

  /** Puts the refresh line, in the region's content coordinates, under a
   *  leading table's head while the head shows, else on the region's
   *  visible top edge, and never below its visible bottom, so it stays in
   *  view while a region that scrolls is scrolled. */
  const placeLine = (): void => {
    const head = leadTable(region)?.tHead ?? null;
    const visible = region.scrollTop;
    let at = visible;
    if (head !== null) {
      const top = region.getBoundingClientRect().top + region.clientTop;
      at += Math.max(0, head.getBoundingClientRect().bottom - top - LINE_PX);
    }
    at = Math.min(at, visible + Math.max(0, region.clientHeight - LINE_PX));
    if (at === 0) {
      region.style.removeProperty("--cp-load-line-at");
    } else {
      region.style.setProperty("--cp-load-line-at", `${String(at)}px`);
    }
  };

  const run = async (from: Element | undefined): Promise<boolean> => {
    const life = new AbortController();
    const before = state;
    const stale = state === "ready" || state === "stale";
    const firstTime = state === "idle";
    mark(stale ? "refreshing" : "loading");
    if (stale) {
      placeLine();
      tracking = new AbortController();
      region.addEventListener("scroll", placeLine, { passive: true, signal: tracking.signal });
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
    // Called in the executor, at once, so a load that throws before it
    // returns a promise fails like one that rejects.
    const work = untilAborted(
      new Promise<T>((resolve) => {
        resolve(options.load(life.signal));
      }),
      life.signal,
    );

    const failed = (reason: unknown, regain: boolean): false => {
      timing?.cancel();
      mark(stale ? "stale" : "failed");
      const text = stale ? refreshSentence(reason) : failedSentence(reason);
      const box = noticeWith(text, stale, reason);
      if (stale) {
        if (region.firstElementChild !== box) {
          region.prepend(box);
        }
      } else {
        region.replaceChildren(box);
      }
      announce(text);
      if (regain && retry !== null) {
        retry.focus();
      }
      return false;
    };
    let data: T;
    try {
      if (from !== undefined && from === retry && retryCycle !== null) {
        const cycle = retryCycle;
        const button = retry;
        // The cycle holds its busy state for its minimum after work ends;
        // the content goes in as soon as it comes.
        void (async () => {
          // A replaced cycle refuses this run until its own settling puts
          // the button at rest; a task tick, not a microtask loop, so a
          // cycle holding busy on a timer can reach its end.
          while (button.hasAttribute("data-cp-state")) {
            await new Promise((resolve) => setTimeout(resolve, 0));
            if (life.signal.aborted) {
              return;
            }
          }
          await cycle.run(() => work);
        })().catch(() => undefined);
        data = await work;
      } else {
        data = from === undefined ? await work : await turnWhile(from, work);
      }
    } catch (reason) {
      if (life.signal.aborted) {
        settleAborted(life);
        return false;
      }
      return failed(reason, attending(region));
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
        try {
          options.render(data);
        } catch (reason) {
          resolve(failed(reason, regain));
          return;
        }
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
