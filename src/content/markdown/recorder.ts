/**
 * recorder.ts — parser operations as plain data, so a worker can parse and
 * the main thread render: `postMessage` copies an `Op` as it is.
 * @module
 */

import type { AttrName, Kind, Sink } from "./parser.js";

/** One sink call: `[0, kind]` opens, `[1]` closes, `[2, text]`, `[3, name, value]`. */
export type Op =
  readonly [0, Kind] | readonly [1] | readonly [2, string] | readonly [3, AttrName, string];

/** A sink that appends each call to `ops`; the caller empties it after each post. */
export function createRecorder(ops: Op[]): Sink {
  return {
    open(kind) {
      ops.push([0, kind]);
    },
    close() {
      ops.push([1]);
    },
    text(s) {
      ops.push([2, s]);
    },
    attr(name, value) {
      ops.push([3, name, value]);
    },
  };
}

/**
 * Calls `sink` for each op in order. An op of any other shape is skipped,
 * since a batch arrives through `postMessage`; the DOM sink judges what the
 * well-formed ones ask for.
 */
export function replay(ops: readonly Op[], sink: Sink): void {
  for (const op of ops as readonly unknown[]) {
    if (!Array.isArray(op)) {
      continue;
    }
    const [code, a, b] = op as readonly unknown[];
    if (code === 0 && typeof a === "string") {
      sink.open(a as Kind);
    } else if (code === 1) {
      sink.close();
    } else if (code === 2 && typeof a === "string") {
      sink.text(a);
    } else if (code === 3 && typeof a === "string" && typeof b === "string") {
      sink.attr(a as AttrName, b);
    }
  }
}
