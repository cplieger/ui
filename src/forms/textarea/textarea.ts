/**
 * textarea.ts — `enhanceTextarea()` counts a text area's characters, or what
 * `measure` counts, against its limit when it has one, marks it invalid once
 * past it, grows it with its text where the engine cannot size it to its
 * content (`field-sizing`), and can send its form on Ctrl or ⌘ Enter.
 * @module
 */

import { until } from "../../core/lifetime/lifetime.js";

export interface TextareaOptions {
  /** The most the area takes, as `measure` counts, before it reads as
   *  invalid. */
  readonly max?: number;
  /** What the count and the limit count. Default: the text's length, as
   *  `maxlength` counts it. `utf8Length` counts the bytes a server's body
   *  limit sees. */
  readonly measure?: (text: string) => number;
  /** Ctrl+Enter, or ⌘+Enter on a Mac, sends the area's form through its
   *  first submit button, as Enter does in a field. Default false. */
  readonly submitOnModEnter?: boolean;
  /** Shows the count, "{length} / {max}" with a limit or "{length}"
   *  without, and describes the area. */
  readonly count?: HTMLElement;
  /** The count's words. Default as `count` says. */
  readonly words?: (length: number, max: number | undefined) => string;
  /** Removes the listener. */
  readonly signal?: AbortSignal;
}

const OVER = "data-cp-over";
let seq = 0;

/** The length of `text` in UTF-8 bytes, as a server reading the body counts
 *  it, without encoding it. */
export function utf8Length(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) {
      n += 1;
    } else if (c < 0x800) {
      n += 2;
    } else if (c >= 0xd800 && c < 0xdc00 && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d < 0xe000) {
        // A surrogate pair is one code point of four bytes.
        n += 4;
        i++;
      } else {
        n += 3;
      }
    } else {
      // A lone surrogate is sent as U+FFFD, three bytes.
      n += 3;
    }
  }
  return n;
}

export function enhanceTextarea(area: HTMLTextAreaElement, options: TextareaOptions = {}): void {
  const { max, count, signal, measure = (t: string) => t.length } = options;
  if (signal?.aborted === true) {
    return;
  }
  const grows = CSS.supports("field-sizing", "content");
  const words =
    options.words ??
    ((n: number, m: number | undefined) =>
      m === undefined ? String(n) : `${String(n)} / ${String(m)}`);
  if (count !== undefined) {
    count.id ||= `cp-textarea-count-${String(++seq)}`;
    const ids = (area.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    if (!ids.includes(count.id)) {
      area.setAttribute("aria-describedby", [...ids, count.id].join(" "));
    }
  }
  // Only the limit's own mark is cleared here, so an error a form check
  // set stays until that check clears it.
  let marked = false;
  const update = (): void => {
    const n = measure(area.value);
    const over = max !== undefined && n > max;
    if (count !== undefined) {
      count.textContent = words(n, max);
      count.toggleAttribute(OVER, over);
    }
    if (over && !marked) {
      area.setAttribute("aria-invalid", "true");
      marked = true;
    } else if (!over && marked) {
      area.removeAttribute("aria-invalid");
      marked = false;
    }
    if (!grows) {
      area.style.blockSize = "auto";
      area.style.blockSize = `${String(area.scrollHeight + area.offsetHeight - area.clientHeight)}px`;
    }
  };
  const listen = until(signal);
  area.addEventListener("input", update, listen);
  if (options.submitOnModEnter === true) {
    area.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey) || e.isComposing) {
          return;
        }
        const form = area.form;
        if (form === null) {
          return;
        }
        e.preventDefault();
        // The default button, as implicit submission picks it.
        const button = [...form.elements].find(
          (el): el is HTMLButtonElement | HTMLInputElement =>
            (el instanceof HTMLButtonElement && el.type === "submit") ||
            (el instanceof HTMLInputElement && (el.type === "submit" || el.type === "image")),
        );
        if (button?.disabled === true) {
          return;
        }
        form.requestSubmit(button);
      },
      listen,
    );
  }
  update();
}
