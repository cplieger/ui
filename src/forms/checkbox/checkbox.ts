/**
 * checkbox.ts — `enhanceSelectAll()` ties a checkbox that stands for a group,
 * such as "All of these" or a table's header box, to the group's boxes: a
 * press checks or clears every box that can change, and the box shows
 * checked, a dash or empty as all, some or none of them are on.
 * @module
 */

import { until } from "../../core/lifetime/lifetime.js";

export interface SelectAllOptions {
  /** Removes the listeners. */
  readonly signal?: AbortSignal;
}

function tell(box: HTMLInputElement): void {
  box.dispatchEvent(new Event("input", { bubbles: true }));
  box.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * `boxes` returns the group's checkboxes and is read at each press and each
 * change, so a press covers rows added or removed since. A disabled box
 * keeps its state, and `all` counts the boxes that can change, or every box
 * when none can. Each box a press of `all` changes fires `input` and
 * `change`, as its own press would. Returns `sync`, for code that changes
 * the boxes itself, so `all` shows the new group at once.
 */
export function enhanceSelectAll(
  all: HTMLInputElement,
  boxes: () => Iterable<HTMLInputElement>,
  options: SelectAllOptions = {},
): () => void {
  const { signal } = options;
  const sync = (): void => {
    const group = [...boxes()];
    const live = group.filter((b) => !b.disabled);
    const counted = live.length > 0 ? live : group;
    const on = counted.filter((b) => b.checked).length;
    all.checked = counted.length > 0 && on === counted.length;
    all.indeterminate = on > 0 && on < counted.length;
  };
  if (signal?.aborted === true) {
    return sync;
  }
  const listen = until(signal);
  all.addEventListener(
    "change",
    () => {
      // Read once: each box told below syncs `all` to the part-done group.
      const on = all.checked;
      for (const b of boxes()) {
        if (!b.disabled && b.checked !== on) {
          b.checked = on;
          tell(b);
        }
      }
      sync();
    },
    listen,
  );
  all.ownerDocument.addEventListener(
    "change",
    (e) => {
      const t = e.target;
      if (t !== all && t instanceof HTMLInputElement && [...boxes()].includes(t)) {
        sync();
      }
    },
    listen,
  );
  sync();
  return sync;
}
