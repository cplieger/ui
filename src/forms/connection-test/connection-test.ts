/**
 * connection-test.ts — the "Test connection" button of a setup or settings
 * form: idle, busy, passed or failed. It runs a check the app supplies,
 * writes the answer into a status element the app renders, marks the field
 * a failure names, and goes back to idle once the person edits the form.
 * @module
 */

import { until } from "../../core/lifetime/lifetime.js";

export type ConnectionTestState = "idle" | "busy" | "passed" | "failed";

export type ConnectionTestResult =
  | { readonly ok: true; readonly message: string }
  | { readonly ok: false; readonly message: string; readonly field?: string };

export interface ConnectionTestOptions {
  /** The check. Resolve with the answer; reject only for a failure you did
   *  not turn into one, such as a network error. */
  readonly run: (signal: AbortSignal) => Promise<ConnectionTestResult>;
  /** The fields a failure can name, as the server names them: the input
   *  that gets `aria-invalid`, and the element whose text says why. */
  readonly fields?: Readonly<
    Record<string, { readonly input?: HTMLElement; readonly mark?: HTMLElement }>
  >;
  /** The element that carries `data-cp-state` beside the status and scopes
   *  the edits that reset the test. Default: the button's form. */
  readonly root?: HTMLElement;
  /** The words while it runs. Default "Testing…". */
  readonly busyMessage?: string;
  /** Words a rejected `run` with. Default: the error's message, or "The
   *  test could not run." */
  readonly errorMessage?: (error: unknown) => string;
  /** After each change of state, with the answer when there is one. */
  readonly onChange?: (state: ConnectionTestState, result?: ConnectionTestResult) => void;
  /** Ends a running test and removes the listeners. */
  readonly signal?: AbortSignal;
}

export interface ConnectionTest {
  /** The state on show. */
  state(): ConnectionTestState;
  /** Runs the check, as a press does. Does nothing while one runs. */
  start(): void;
  /** Ends a running check and goes back to idle. */
  reset(): void;
}

/**
 * Wires `button` to run the check and `status` to say its answer. `status`
 * becomes a polite live region unless it has a role, so the answer is said
 * as it appears; it never gets `aria-busy`, which would make a reader skip
 * "Testing…". The button is never `disabled` while busy, which would move
 * focus off it: it is `aria-disabled` and a press does nothing.
 */
export function enhanceConnectionTest(
  button: HTMLButtonElement,
  status: HTMLElement,
  options: ConnectionTestOptions,
): ConnectionTest {
  const { run, fields = {}, onChange, signal } = options;
  const root = options.root ?? button.form ?? null;
  const busyMessage = options.busyMessage ?? "Testing…";
  const words = (err: unknown): string =>
    options.errorMessage?.(err) ??
    (err instanceof Error && err.message !== "" ? err.message : "The test could not run.");
  if (!button.hasAttribute("type")) {
    // A button with no type submits its form.
    button.type = "button";
  }
  if (!status.hasAttribute("role")) {
    status.setAttribute("role", "status");
  }

  let state: ConnectionTestState = "idle";
  let running: AbortController | null = null;
  let marked: string | null = null;

  const unmark = (): void => {
    if (marked !== null) {
      const f = fields[marked];
      f?.input?.removeAttribute("aria-invalid");
      if (f?.mark !== undefined) {
        f.mark.textContent = "";
        f.mark.hidden = true;
      }
    }
    marked = null;
  };

  const set = (
    next: ConnectionTestState,
    message: string,
    result?: ConnectionTestResult,
    quiet = false,
  ): void => {
    state = next;
    status.dataset["cpState"] = next;
    if (root !== null) {
      root.dataset["cpState"] = next;
    }
    status.textContent = message;
    if (next === "busy") {
      button.setAttribute("aria-disabled", "true");
    } else {
      button.removeAttribute("aria-disabled");
    }
    if (!quiet) {
      onChange?.(next, result);
    }
  };

  const api: ConnectionTest = {
    state: () => state,
    start() {
      if (state === "busy" || signal?.aborted === true) {
        return;
      }
      unmark();
      const mine = new AbortController();
      running = mine;
      set("busy", busyMessage);
      run(mine.signal).then(
        (result) => {
          if (running !== mine) {
            return;
          }
          running = null;
          if (!result.ok && result.field !== undefined && Object.hasOwn(fields, result.field)) {
            const f = fields[result.field];
            marked = result.field;
            f?.input?.setAttribute("aria-invalid", "true");
            if (f?.mark !== undefined) {
              f.mark.textContent = result.message;
              f.mark.hidden = false;
            }
          }
          set(result.ok ? "passed" : "failed", result.message, result);
        },
        (err: unknown) => {
          if (running !== mine) {
            return;
          }
          running = null;
          set("failed", words(err));
        },
      );
    },
    reset() {
      running?.abort();
      running = null;
      unmark();
      if (state !== "idle") {
        set("idle", "");
      }
    },
  };

  const listen = until(signal);
  button.addEventListener(
    "click",
    (e) => {
      if (state === "busy") {
        e.preventDefault();
        return;
      }
      api.start();
    },
    listen,
  );
  // An edit makes the last answer stale.
  const watchRoot = root ?? button.parentElement;
  for (const type of ["input", "change"]) {
    watchRoot?.addEventListener(
      type,
      (e) => {
        if (e.target !== button && state !== "idle") {
          api.reset();
        }
      },
      listen,
    );
  }
  signal?.addEventListener(
    "abort",
    () => {
      running?.abort();
      running = null;
    },
    { once: true },
  );
  set("idle", "", undefined, true);
  return api;
}
