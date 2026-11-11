/**
 * copy.ts — `enhanceCopy()` makes a button copy text, saying Copied only for
 * a write that happened. The clipboard exists only in a secure context and
 * can still refuse, as on an app served over plain http on a LAN address:
 * then the text is selected and a hint names the platform's own copy keys.
 * @module
 */

import { announce } from "../../feedback/announce/announce.js";
import { until } from "../../core/lifetime/lifetime.js";

export interface CopyOptions {
  /** The element whose text is copied, and selected when the write is
   *  refused. */
  readonly source?: HTMLElement;
  /** The text to copy, when it is not a source's text. */
  readonly text?: () => string;
  /** Where the hint shows. Default: a `.cp-help` made after the button's
   *  `.cp-code`, or after the button. */
  readonly hint?: HTMLElement;
  /** Said after a written copy. Default "Copied". */
  readonly copied?: string;
  /** The hint for a refused write, given the copy keys such as "Ctrl+C".
   *  Default "Selected. Press Ctrl+C to copy." */
  readonly selected?: (keys: string) => string;
  /** Removes the listener, and a hint this call made. */
  readonly signal?: AbortSignal;
}

/** How long the done fill shows before it fades back, in ms. */
const DONE_MS = 1600;
/** How long the hint stays, in ms. */
const HINT_MS = 6000;

function copyKeys(): string {
  const nav = navigator as Navigator & { readonly userAgentData?: { readonly platform?: string } };
  const platform = nav.userAgentData?.platform ?? navigator.platform;
  return /mac|iphone|ipad/i.test(platform) ? "⌘C" : "Ctrl+C";
}

async function write(text: string): Promise<boolean> {
  const clipboard = (globalThis as { readonly navigator?: { readonly clipboard?: Clipboard } })
    .navigator?.clipboard;
  if (!globalThis.isSecureContext || clipboard === undefined) {
    return false;
  }
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * `button` keeps its word, Copy. It holds the copy drawing and a check
 * marked `data-part="done"`, shown while `data-cp-state="done"` turns it
 * green. Give `source`, `text` or both.
 */
export function enhanceCopy(button: HTMLButtonElement, options: CopyOptions): void {
  const { source, signal } = options;
  if (source === undefined && options.text === undefined) {
    throw new TypeError("enhanceCopy needs a source or a text");
  }
  if (signal?.aborted === true) {
    return;
  }
  const read = options.text ?? ((): string => source?.textContent ?? "");
  let hint = options.hint;
  const made = hint === undefined;
  if (hint === undefined) {
    hint = document.createElement("span");
    hint.className = "cp-help";
    hint.hidden = true;
    (button.closest(".cp-code") ?? button).after(hint);
  }
  const shown = hint;
  let doneTimer: ReturnType<typeof setTimeout> | undefined;
  let hintTimer: ReturnType<typeof setTimeout> | undefined;

  button.addEventListener(
    "click",
    () => {
      void write(read()).then((wrote) => {
        clearTimeout(doneTimer);
        clearTimeout(hintTimer);
        if (wrote) {
          shown.hidden = true;
          button.dataset["cpState"] = "done";
          announce(options.copied ?? "Copied");
          // How long the done look shows is a length of time, so a timer measures it.
          doneTimer = setTimeout(() => {
            delete button.dataset["cpState"];
          }, DONE_MS);
          return;
        }
        delete button.dataset["cpState"];
        if (source !== undefined) {
          const range = document.createRange();
          range.selectNodeContents(source);
          getSelection()?.removeAllRanges();
          getSelection()?.addRange(range);
        }
        const keys = copyKeys();
        const words = options.selected?.(keys) ?? `Selected. Press ${keys} to copy.`;
        shown.textContent = words;
        shown.hidden = false;
        announce(words);
        hintTimer = setTimeout(() => {
          shown.hidden = true;
        }, HINT_MS);
      });
    },
    until(signal),
  );
  signal?.addEventListener(
    "abort",
    () => {
      clearTimeout(doneTimer);
      clearTimeout(hintTimer);
      delete button.dataset["cpState"];
      if (made) {
        shown.remove();
      }
    },
    { once: true },
  );
}
