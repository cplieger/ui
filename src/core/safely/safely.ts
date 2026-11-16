/**
 * safely.ts — runs a host's function where a throw would leave the
 * module's state half written, such as the words for work that has
 * already settled.
 * @module
 * @internal
 */

/** `f()`, or `fallback()` when `f` throws, the host's error reported to
 *  the page as an uncaught one is, so it still reaches the console. */
export function safely<R>(f: () => R, fallback: () => R): R {
  try {
    return f();
  } catch (error) {
    reportError(error);
    return fallback();
  }
}
