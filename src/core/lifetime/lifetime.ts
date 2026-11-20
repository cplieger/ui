/**
 * lifetime.ts — the lifetime rules every component shares. A component a
 * page installs once, such as the press or the tooltips, is one set of
 * listeners however many parts of the page install it, kept until every
 * caller's signal has aborted. A component on one element ends with the
 * signal it is given.
 * @module
 */

interface LifetimeOptions {
  /** Ends this call's hold. Default: none, held for the page's life. */
  readonly signal?: AbortSignal;
}

interface Shared<O> {
  /** Starts the listeners on the first call, and holds them until this
   *  call's signal aborts. A call whose signal has already aborted does
   *  nothing. The first call's other options hold. */
  install(options?: O & LifetimeOptions): void;
  /** Whether any call holds the listeners now. */
  readonly active: boolean;
}

/**
 * One page-wide install. `start` adds the listeners under the signal it is
 * given, which aborts once no call holds them, and cleans up on that abort.
 */
export function shared<O extends object = object>(
  start: (signal: AbortSignal, options: O) => void,
): Shared<O> {
  let holds = 0;
  let running: AbortController | null = null;
  return {
    install(options) {
      const signal = options?.signal;
      if (signal?.aborted === true) {
        return;
      }
      holds += 1;
      if (running === null) {
        running = new AbortController();
        start(running.signal, (options ?? {}) as O);
      }
      signal?.addEventListener(
        "abort",
        () => {
          holds -= 1;
          if (holds === 0) {
            running?.abort();
            running = null;
          }
        },
        { once: true },
      );
    },
    get active() {
      return running !== null;
    },
  };
}

/** Listener options that end with `signal`, which may be absent. */
export function until(signal: AbortSignal | undefined, capture = false): AddEventListenerOptions {
  return signal === undefined ? { capture } : { capture, signal };
}

/** Runs `fn` when `signal` aborts, or now if it already has. */
export function whenAborted(signal: AbortSignal | undefined, fn: () => void): void {
  if (signal?.aborted === true) {
    fn();
  } else {
    signal?.addEventListener("abort", fn, { once: true });
  }
}

// WebKit collects the page's FontFaceSet wrapper, and every listener on it,
// once nothing in script references it, so the first caller pins it here.
let fontSet: FontFaceSet | undefined;

/**
 * Runs `run` once the page's fonts settle, after a load already running
 * and after each load that starts until `signal` aborts. A load is seen by
 * its `loading` event, because WebKit fires no `loadingdone` for a face a
 * stylesheet starts.
 */
export function afterFontLoads(run: () => void, signal?: AbortSignal): void {
  const fonts = (fontSet ??= document.fonts);
  let waiting = false;
  const settle = (): void => {
    if (waiting) {
      return;
    }
    waiting = true;
    void fonts.ready.then(() => {
      waiting = false;
      if (signal?.aborted !== true) {
        run();
      }
    });
  };
  fonts.addEventListener("loading", settle, until(signal));
  if (fonts.status === "loading") {
    settle();
  }
}

/** Whether the person asked for less motion. */
export function reducedMotion(): boolean {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}
