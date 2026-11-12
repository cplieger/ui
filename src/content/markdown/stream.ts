/**
 * stream.ts — markdown rendered as it arrives: writes are buffered for an
 * interval, then parsed in slices across tasks so a large flush never holds
 * a frame. The parser is append-only, so nothing emitted is rendered again.
 * @module
 */

import { createParser } from "./parser.js";
import { byteBudget, byteLimit, domSink, truncationLine } from "./render.js";
import type { RenderOptions } from "./render.js";

export interface StreamOptions extends RenderOptions {
  /** How long a write waits before it is parsed; default 200, 0 parses on write. */
  readonly flushIntervalMs?: number;
  /** Runs for each text node, attached as `parent`'s last child, code and
   *  math hosts included; what it returns takes the node's place. */
  readonly text?: (parent: Element, node: Text) => Node | undefined;
  /** Runs before an inline token the text never closed gives its children
   *  to its parent, so a fade or a caret on them can follow. */
  readonly moved?: (el: Element) => void;
  /** Runs after each slice parsed while streaming. */
  readonly onSlice?: (host: Element) => void;
}

export interface MarkdownStream {
  /** Queues `chunk`; it is parsed after `flushIntervalMs`. Ignored after `end` or an abort. */
  write(chunk: string): void;
  /** Parses the first slice of what is queued now and the rest across tasks. */
  flush(): void;
  /** Parses everything queued, closes every token so the last block's hooks
   *  run, and shows the truncation line if `maxBytes` cut the text. Idempotent. */
  end(): void;
}

/** UTF-16 units parsed per task, well under a frame on a slow device. */
const SLICE = 4096;
const INTERVAL_MS = 200;

/** Where a slice of `text` ends: never between a surrogate pair's halves. */
function sliceEnd(text: string): number {
  if (text.length <= SLICE) {
    return text.length;
  }
  const c = text.charCodeAt(SLICE - 1);
  return c >= 0xd800 && c <= 0xdbff ? SLICE - 1 : SLICE;
}

/**
 * Renders markdown written in chunks into `host`, after what it holds.
 * Throws a `RangeError` for a `flushIntervalMs`, `headingLevel` or
 * `maxBytes` out of range, and a `TypeError` for a `base` that is not a URL.
 */
export function createMarkdownStream(host: Element, options: StreamOptions = {}): MarkdownStream {
  const interval = options.flushIntervalMs ?? INTERVAL_MS;
  if (!Number.isFinite(interval) || interval < 0) {
    throw new RangeError(`flushIntervalMs must be 0 or more, not ${String(interval)}`);
  }
  const max = byteLimit(options);
  const extras = {
    ...(options.text === undefined ? {} : { text: options.text }),
    ...(options.moved === undefined ? {} : { moved: options.moved }),
  };
  const sink = domSink(host, options, extras);
  let parser = createParser(sink);
  const budget = byteBudget(max);
  const signal = options.signal;
  // One channel per stream: a posted message yields to the browser as a new task.
  const channel = new MessageChannel();
  let buffer = "";
  let queued = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  // `draining` holds from a slice's parse until the queue is empty, so a
  // write from a hook only queues; `parsing` defers an `end` a hook asks for
  // until the slice it interrupts is parsed.
  let draining = false;
  let parsing = false;
  let endAsked = false;
  let ended = false;

  function stop(): void {
    ended = true;
    clearTimeout(timer);
    timer = undefined;
    buffer = "";
    queued = "";
    channel.port1.close();
    channel.port2.close();
  }

  function take(): string {
    const rest = queued + buffer + budget.flush();
    queued = "";
    buffer = "";
    return rest;
  }

  /** Parses until nothing is queued, then closes every token. A hook that
   *  writes while the last block closes gets a new parser on the same sink,
   *  since every block before its text is closed by then. Ends the stream
   *  even when a hook throws, since the parser has ended by then. */
  function finish(): void {
    draining = true;
    parsing = true;
    try {
      let rest = take();
      while (!isEnded()) {
        if (rest !== "") {
          parser.write(rest);
        } else {
          parser.end();
          if (queued === "" && buffer === "") {
            break;
          }
          parser = createParser(sink);
        }
        rest = take();
      }
    } finally {
      draining = false;
      parsing = false;
      // An abort during the parse stopped the stream where it was.
      if (!isEnded()) {
        stop();
        signal?.removeEventListener("abort", stop);
        sink.end();
        if (budget.cut) {
          host.append(truncationLine(host.ownerDocument, max));
        }
      }
    }
  }

  function isEnded(): boolean {
    return ended;
  }

  function drain(): void {
    if (ended) {
      return;
    }
    const end = sliceEnd(queued);
    const slice = queued.slice(0, end);
    queued = queued.slice(end);
    draining = true;
    parsing = true;
    try {
      parser.write(slice);
    } catch (error) {
      // Nothing is posted after a throw, so the next flush must drain.
      draining = false;
      throw error;
    } finally {
      parsing = false;
    }
    // A hook or an abort listener may have ended the stream during the parse.
    if (isEnded()) {
      return;
    }
    if (endAsked) {
      finish();
      return;
    }
    options.onSlice?.(host);
    draining = queued !== "" && !ended;
    if (draining) {
      channel.port2.postMessage(null);
    }
  }

  function flush(): void {
    clearTimeout(timer);
    timer = undefined;
    if (ended || buffer === "") {
      return;
    }
    queued += buffer;
    buffer = "";
    if (!draining) {
      drain();
    }
  }

  channel.port1.onmessage = drain;
  if (signal?.aborted === true) {
    stop();
  }
  signal?.addEventListener("abort", stop, { once: true });

  return {
    write(chunk) {
      const kept = ended ? "" : budget.take(chunk);
      if (kept === "") {
        return;
      }
      buffer += kept;
      if (interval === 0) {
        flush();
      } else {
        timer ??= setTimeout(flush, interval);
      }
    },
    flush,
    end() {
      if (ended) {
        return;
      }
      if (parsing) {
        endAsked = true;
        return;
      }
      finish();
    },
  };
}
