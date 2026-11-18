/**
 * part.ts — the one owner of an account screen part's data and its draw:
 * its reads, what is drawn, the notice a refused read shows, and the names
 * edited in place in it, with where focus goes when one of them ends.
 * @module
 */

import type { Refusal, Result } from "./client.js";
import type { Heading } from "./focus.js";
import { redrawKeepingFocus } from "./focus.js";
import { renameHold, type RenameSpec } from "./rename.js";
import { latest, type Slot } from "./screen.js";

export interface PartSpec<T> {
  /** What `draw` fills. */
  readonly content: HTMLElement;
  readonly heading: Heading;
  readonly notices: Slot;
  readonly signal?: AbortSignal | undefined;
  /** The part's read; undefined when it did not run. */
  readonly read: () => Promise<Result<T> | undefined>;
  /** Shows a refused read in `notices`, with Retry running `again`. */
  readonly refused: (r: Refusal, again: () => void) => void;
  /** Takes a current read's data, whether or not an open edit holds the
   *  draw back. */
  readonly took?: (data: T) => void;
  /** Replaces what `content` holds with `data`. */
  readonly draw: (data: T) => void;
}

export interface Part<T> {
  /**
   * Reads again and draws the answer while it is the newest read. `focus`
   * names the control focused after the draw, null the heading; with none,
   * focus stays, or goes to the heading when the draw took its control. A
   * refusal leaves what is drawn under its notice; an open edit holds the
   * draw back and drops the request. True when it drew.
   */
  refresh(focus?: string | null): Promise<boolean>;
  /** Draws data the screen read itself, as the newest read's. */
  show(data: T, focus?: string | null): void;
  /** Shows a refusal of a read the screen ran itself as the part's, so
   *  the next draw drops it; what is drawn stays. */
  failed(r: Refusal): void;
  /** Edits a name in place: while any edit is open no read draws, and
   *  focus goes back to the edit's own opener when it ends. On a name
   *  already being edited it focuses that field. */
  edit(spec: RenameSpec): void;
  /** The data drawn last, undefined before the first draw. */
  drawn(): T | undefined;
}

export function screenPart<T>(spec: PartSpec<T>): Part<T> {
  const reads = latest(spec.signal);
  // A superseded read hands its focus request to the newer one.
  let wanted: string | null | undefined;
  let drawn: { readonly data: T } | undefined;
  let failure: Element | undefined;
  // The read a hold owes draws with no carried request, so focus stays on
  // the opener the ended edit gave it back to.
  const renames = renameHold(() => {
    wanted = undefined;
    void refresh();
  });

  const put = (data: T, asked: string | null | undefined): void => {
    spec.notices.drop(failure);
    failure = undefined;
    drawn = { data };
    redrawKeepingFocus(
      spec.content,
      spec.heading,
      () => {
        spec.draw(data);
      },
      asked,
    );
  };

  // Retry asks again for the focus the refused read was to draw with.
  const fail = (r: Refusal, asked: string | null | undefined): void => {
    spec.refused(r, () => void refresh(asked));
    failure = spec.notices.shown();
  };

  const refresh = async (focus?: string | null): Promise<boolean> => {
    wanted = focus === undefined ? wanted : focus;
    let drew = false;
    await reads.run(spec.read, (got) => {
      if (got === undefined) {
        return;
      }
      const asked = wanted;
      wanted = undefined;
      if (!got.ok) {
        if (drawn === undefined) {
          spec.content.replaceChildren();
        }
        fail(got, asked);
        return;
      }
      spec.took?.(got.data);
      if (renames.held()) {
        return;
      }
      put(got.data, asked);
      drew = true;
    });
    return drew;
  };

  return {
    refresh,
    show(data, focus) {
      reads.start();
      wanted = undefined;
      spec.took?.(data);
      put(data, focus);
    },
    failed: (r) => {
      fail(r, undefined);
    },
    edit: (s) => {
      renames.edit(s);
    },
    drawn: () => drawn?.data,
  };
}
