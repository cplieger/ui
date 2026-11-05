/**
 * connection-test.ts — the state machine behind a "Test connection" button:
 * idle, busy, passed, failed. It runs a check the host supplies, writes the
 * answer into a status element the host renders, and marks the field a failure
 * names. The host owns every visual, drawn from `data-state`; nothing fades.
 *
 * @module
 */

import { untracked } from "../signal/signal.js";
import type { Fx } from "./fx.js";
import { createDriver, ownedBinding } from "./owner.js";

/** Where the control stands. */
export type ConnectionTestState = "idle" | "busy" | "passed" | "failed";

/** A check's answer. `field` names the field a failure is about, by the key the
 *  host gave it in `fields`. */
export type ConnectionTestResult =
  | { readonly ok: true; readonly message: string }
  | { readonly ok: false; readonly message: string; readonly field?: string };

/** How a failure marks one field. */
export interface ConnectionTestField {
  /** An input to mark with `aria-invalid` and describe by the message. Its
   *  prior `aria-invalid` is restored on clear. A host whose form engine owns
   *  field errors passes `mark` alone. */
  readonly input?: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  /** Called with the message when the field is marked and with null when it is
   *  cleared, beside or instead of the input marking. */
  readonly mark?: (message: string | null) => void;
}

/** The check and how the control reports it. Only `run` is required. */
export interface ConnectionTestOptions {
  /** Runs the check. Resolve with the answer; reject only for a failure the host
   *  did not turn into an answer. `signal` aborts when the test is superseded. */
  readonly run: (signal: AbortSignal) => Promise<ConnectionTestResult>;
  /** Message for a rejected `run`. Default: the error's `message`, else
   *  "The test could not run." */
  readonly errorMessage?: (error: unknown) => string;
  /** Fields a failure may name, by the name the server uses. */
  readonly fields?: Readonly<Record<string, ConnectionTestField>>;
  /** Elements whose `input` or `change` returns the control to idle. Default:
   *  every such event bubbling from inside `root`, or without `root` every
   *  `fields[*].input`. */
  readonly watch?: readonly HTMLElement[];
  /** Text written into `status` while busy. Default "Testing…". */
  readonly busyMessage?: string;
  /** "status" (default) makes `status` a polite live region, unless the host
   *  gave it a role; "none" writes no role, for a host that announces itself. */
  readonly live?: "status" | "none";
  /** Called on every state change. */
  readonly onChange?: (state: ConnectionTestState, result: ConnectionTestResult | null) => void;
}

/** Handle on a wired control. After `dispose()`, `start` and `reset` do
 *  nothing and `state` reports `"idle"`. */
export interface ConnectionTestController {
  state(): ConnectionTestState;
  /** Start a test, as a click does. Ignored while busy. */
  start(): void;
  /** Back to idle: abort a running test, clear the message and any marking. */
  reset(): void;
  /** Abort a running test and remove what the control added, with no
   *  `onChange` or `mark` call. Idempotent. */
  dispose(): void;
}

interface State {
  readonly phase: ConnectionTestState;
  readonly result: ConnectionTestResult | null;
  /** The run this state belongs to; a result from any other run is dropped. */
  readonly run: number;
}

/** A field the realized state marks, with what to give back on clear. */
interface Marked {
  readonly name: string;
  readonly message: string;
  readonly input: ConnectionTestField["input"];
  /** The status id this control added to the input's aria-describedby, or null. */
  readonly token: string | null;
}

let idSeq = 0;

/** Every input a live control marks: one record per input, so the last clear
 *  restores what the input carried before the first mark. */
const inputMarks = new WeakMap<Element, { count: number; readonly prior: string | null }>();

/** Every status and root element a live control writes. */
const claimed = new WeakSet<Element>();

const NO_ANSWER = "The test returned no answer.";

/** The answer in `r`, or null when it has no boolean `ok` and string
 *  `message`. A field is kept only on a failure and only as a string, since a
 *  server may encode "no field" as null. */
function toResult(r: unknown): ConnectionTestResult | null {
  if (typeof r !== "object" || r === null) {
    return null;
  }
  const o = r as Record<string, unknown>;
  const { ok, message, field } = { ok: o["ok"], message: o["message"], field: o["field"] };
  if (typeof ok !== "boolean" || typeof message !== "string") {
    return null;
  }
  if (ok) {
    return { ok, message };
  }
  return typeof field === "string" ? { ok, message, field } : { ok, message };
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function tokens(value: string | null): string[] {
  return (value ?? "").split(/\s+/).filter((t) => t !== "");
}

/** Wire `button` to run the check and `status` to show its state. `root`, when
 *  given, also carries `data-state` and scopes the default `watch`. Throws a
 *  `TypeError` when `button` is not a `<button>`, `status` contains it, or a
 *  live control already writes `status`. */
export function createConnectionTest(
  button: HTMLButtonElement,
  status: HTMLElement,
  opts: ConnectionTestOptions,
  root?: HTMLElement,
): ConnectionTestController {
  if (!(button instanceof HTMLButtonElement)) {
    throw new TypeError("@cplieger/ui/connection-test: button must be a <button>");
  }
  if (status === button || status.contains(button)) {
    throw new TypeError("@cplieger/ui/connection-test: status must not contain the button");
  }
  if (claimed.has(status) || (root !== undefined && claimed.has(root))) {
    throw new TypeError(
      "@cplieger/ui/connection-test: status or root already shows another control",
    );
  }
  const o = untracked(() => ({
    run: opts.run,
    errorMessage: opts.errorMessage,
    fields: { ...(opts.fields ?? {}) },
    watch: opts.watch === undefined ? null : [...opts.watch],
    busyMessage: opts.busyMessage ?? "Testing…",
    live: opts.live ?? "status",
    onChange: opts.onChange,
  }));

  return ownedBinding((binding) => {
    claimed.add(status);
    if (root !== undefined) {
      claimed.add(root);
    }
    // A button with no type submits its form, and implicit submission (Enter in a
    // field) clicks the first one; so it becomes type="button", given back on dispose.
    const addedType = !button.hasAttribute("type");
    if (addedType) {
      button.type = "button";
    }
    let runId = 0;
    let aborter: AbortController | null = null;
    let marked: Marked | null = null;
    let reported: { phase: ConnectionTestState; result: ConnectionTestResult | null } = {
      phase: "idle",
      result: null,
    };
    let markedReported: { readonly name: string; readonly message: string } | null = null;
    // What the control added, so terminal gives back exactly that.
    const addedId = status.id === "" ? `uip-connection-test-${(++idSeq).toString()}` : null;
    const addedRole = o.live === "status" && !status.hasAttribute("role");
    // The host's own aria-disabled, held while busy and put back after.
    let held: { readonly prior: string | null } | null = null;
    const restoreDisabled = (fx: Fx): void => {
      if (held === null) {
        return;
      }
      const { prior } = held;
      held = null;
      if (prior === null) {
        fx.removeAttr(button, "aria-disabled");
      } else {
        fx.setAttr(button, "aria-disabled", prior);
      }
    };
    let listening = false;

    const abort = (): void => {
      aborter?.abort();
      aborter = null;
    };
    const toIdle = (): void => {
      if (binding.ended) {
        return;
      }
      abort();
      runId++;
      driver.commit({ phase: "idle", result: null, run: runId });
    };
    const answer = (id: number, outcome: { value: unknown } | { error: unknown }): void => {
      // A function, not a condition: host code below can supersede the run.
      const stale = (): boolean => binding.ended || id !== runId;
      if (stale()) {
        return;
      }
      let result: ConnectionTestResult;
      if ("value" in outcome) {
        const answered = toResult(outcome.value);
        if (answered !== null) {
          result = answered;
        } else {
          console.error(
            "@cplieger/ui/connection-test: run resolved with no ConnectionTestResult:",
            outcome.value,
          );
          result = { ok: false, message: NO_ANSWER };
          if (stale()) {
            return;
          }
        }
      } else if (isAbort(outcome.error)) {
        toIdle();
        return;
      } else {
        result = { ok: false, message: messageFor(outcome.error) };
        if (stale()) {
          return;
        }
      }
      aborter = null;
      driver.commit({ phase: result.ok ? "passed" : "failed", result, run: id });
    };
    const messageFor = (error: unknown): string => {
      if (o.errorMessage !== undefined) {
        try {
          return o.errorMessage(error);
        } catch (thrown) {
          console.error("@cplieger/ui/connection-test: errorMessage threw:", thrown);
        }
      }
      return error instanceof Error && error.message !== ""
        ? error.message
        : "The test could not run.";
    };
    const start = (): void => {
      if (binding.ended || driver.state.phase === "busy") {
        return;
      }
      abort();
      const id = ++runId;
      const controller = new AbortController();
      aborter = controller;
      // A throwing onChange or mark must not leave the control busy with no run.
      let hookError: { readonly error: unknown } | null = null;
      try {
        driver.commit({ phase: "busy", result: null, run: id });
      } catch (error) {
        hookError = { error };
      }
      // A function, not a condition: the hooks above can dispose or supersede.
      const live = (): boolean => !binding.ended && id === runId;
      if (live()) {
        send(id, controller.signal);
      }
      if (hookError !== null) {
        throw hookError.error;
      }
    };
    const send = (id: number, signal: AbortSignal): void => {
      let pending: Promise<unknown>;
      try {
        pending = Promise.resolve(untracked(() => o.run(signal)));
      } catch (error) {
        // The thrown value as is, so it reaches errorMessage as a rejection's would.
        queueMicrotask(() => {
          answer(id, { error });
        });
        return;
      }
      pending.then(
        (value: unknown) => {
          answer(id, { value });
        },
        (error: unknown) => {
          answer(id, { error });
        },
      );
    };

    const onClick = (e: Event): void => {
      if (driver.state.phase === "busy") {
        // aria-disabled: the activation does nothing, a submit button's included.
        e.preventDefault();
        return;
      }
      start();
    };
    const onEdit = (): void => {
      toIdle();
    };
    const watched = (): readonly HTMLElement[] =>
      o.watch ??
      (root === undefined
        ? Object.values(o.fields).flatMap((f) => (f.input === undefined ? [] : [f.input]))
        : [root]);
    const listen = (on: boolean): void => {
      if (listening === on) {
        return;
      }
      listening = on;
      const method = on ? "addEventListener" : "removeEventListener";
      button[method]("click", onClick);
      for (const el of watched()) {
        el[method]("input", onEdit);
        el[method]("change", onEdit);
      }
    };

    const unmark = (fx: Fx): void => {
      const m = marked;
      if (m === null) {
        return;
      }
      marked = null;
      if (m.input === undefined) {
        return;
      }
      const rec = inputMarks.get(m.input);
      if (rec !== undefined && --rec.count === 0) {
        inputMarks.delete(m.input);
        if (rec.prior === null) {
          fx.removeAttr(m.input, "aria-invalid");
        } else {
          fx.setAttr(m.input, "aria-invalid", rec.prior);
        }
      }
      if (m.token !== null) {
        const token = m.token;
        const rest = tokens(m.input.getAttribute("aria-describedby")).filter((t) => t !== token);
        if (rest.length === 0) {
          fx.removeAttr(m.input, "aria-describedby");
        } else {
          fx.setAttr(m.input, "aria-describedby", rest.join(" "));
        }
      }
    };
    const markField = (fx: Fx, name: string, message: string): void => {
      if (marked?.name === name && marked.message === message) {
        return;
      }
      unmark(fx);
      const input = o.fields[name]?.input;
      if (input === undefined) {
        marked = { name, message, input, token: null };
        return;
      }
      const described = tokens(input.getAttribute("aria-describedby"));
      const rec = inputMarks.get(input);
      if (rec === undefined) {
        inputMarks.set(input, { count: 1, prior: input.getAttribute("aria-invalid") });
      } else {
        rec.count++;
      }
      marked = { name, message, input, token: described.includes(status.id) ? null : status.id };
      fx.setAttr(input, "aria-invalid", "true");
      if (marked.token !== null) {
        fx.setAttr(input, "aria-describedby", [...described, status.id].join(" "));
      }
    };
    const failedField = (s: State): string | null => {
      const field = s.result !== null && !s.result.ok ? s.result.field : undefined;
      return field !== undefined && Object.hasOwn(o.fields, field) ? field : null;
    };

    const driver = createDriver<State>({
      initial: { phase: "idle", result: null, run: 0 },
      realize(fx, s) {
        listen(true);
        if (addedId !== null && status.id === "") {
          fx.setProp(status, "id", addedId);
        }
        if (addedRole) {
          fx.setAttr(status, "role", "status");
        }
        if (s.phase === "busy") {
          held ??= { prior: button.getAttribute("aria-disabled") };
          fx.setAttr(button, "aria-disabled", "true");
        } else {
          restoreDisabled(fx);
        }
        const text = s.phase === "busy" ? o.busyMessage : (s.result?.message ?? "");
        if (status.textContent !== text) {
          status.textContent = text;
        }
        for (const el of root === undefined ? [status] : [status, root]) {
          fx.setAttr(el, "data-state", s.phase);
        }
        const field = failedField(s);
        if (field === null) {
          unmark(fx);
        } else {
          markField(fx, field, s.result?.message ?? "");
        }
      },
      notify(fx, s) {
        const name = failedField(s);
        const message = s.result?.message ?? "";
        const had = markedReported;
        if ((had?.name ?? null) !== name || (had !== null && had.message !== message)) {
          markedReported = name === null ? null : { name, message };
          const before = had === null ? undefined : o.fields[had.name]?.mark;
          const after = name === null ? undefined : o.fields[name]?.mark;
          if (before !== undefined && had?.name !== name) {
            fx.call(() => {
              before(null);
            });
          }
          if (after !== undefined) {
            fx.call(() => {
              after(message);
            });
          }
        }
        if (reported.phase !== s.phase || reported.result !== s.result) {
          reported = { phase: s.phase, result: s.result };
          const onChange = o.onChange;
          if (onChange !== undefined) {
            fx.call(() => {
              onChange(s.phase, s.result);
            });
          }
        }
      },
      terminal(fx) {
        claimed.delete(status);
        if (root !== undefined) {
          claimed.delete(root);
        }
        if (addedType && button.getAttribute("type") === "button") {
          fx.removeAttr(button, "type");
        }
        listen(false);
        abort();
        unmark(fx);
        restoreDisabled(fx);
        for (const el of root === undefined ? [status] : [status, root]) {
          fx.removeAttr(el, "data-state");
        }
        if (status.textContent !== "") {
          status.textContent = "";
        }
        if (addedRole) {
          fx.removeAttr(status, "role");
        }
        if (addedId !== null && status.id === addedId) {
          fx.removeAttr(status, "id");
        }
      },
    });

    return {
      controller: {
        state: () => (binding.ended ? "idle" : driver.state.phase),
        start,
        reset: toIdle,
        dispose: binding.dispose,
      },
      start: () => {
        driver.flush();
      },
      release: () => {
        driver.release();
      },
    };
  });
}
