/**
 * part.ts — the one owner of an account screen part's data and its draw:
 * its reads, what is drawn, the notice a refused read shows, and the names
 * edited in place in it, with where focus goes when one of them ends.
 * @module
 */

import { skeletonTiming } from "../../feedback/skeleton/skeleton.js";
import type { Refusal, Result } from "./client.js";
import { sketch } from "./dom.js";
import type { Heading } from "./focus.js";
import { redrawKeepingFocus } from "./focus.js";
import { renameHold, type RenameSpec } from "./rename.js";
import { latest, type Slot } from "./screen.js";

interface PartSpec<T> {
  /** What `draw` fills. */
  readonly content: HTMLElement;
  /** Where a draw keeps focus, when wider than `content`. */
  readonly scope?: HTMLElement;
  readonly heading: Heading;
  /** What carries `aria-busy` while `load` runs. */
  readonly busy?: HTMLElement;
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
  /** For a read that builds on what is drawn: a refresh during a read
   *  waits for it, and the refreshes made meanwhile share one read after
   *  it. Without it a refresh supersedes the read. */
  readonly follows?: boolean;
  /** True when an answer adds nothing to what is drawn, so it is not
   *  drawn again. */
  readonly unchanged?: (data: T, drawn: T) => boolean;
}

export interface Part<T> {
  /**
   * Reads again and draws the answer while it is the newest read. `focus`
   * names the control focused after the draw, null the heading; with none,
   * focus stays, or goes to the heading when the draw took its control. A
   * refusal leaves what is drawn under its notice; an `unchanged` answer
   * only drops that notice; an open edit holds the draw back and drops
   * the request. True when it drew.
   */
  refresh(focus?: string | null): Promise<boolean>;
  /** `refresh`, with `aria-busy` on `busy` while it runs and a sketch in
   *  `content` while it is slow and nothing is drawn. */
  load(focus?: string | null): Promise<boolean>;
  /** Draws data the screen read itself, as the newest read's. */
  show(data: T, focus?: string | null): void;
  /** Shows a refusal of a read the screen ran itself as the part's, so
   *  the next draw drops it; what is drawn stays. */
  failed(r: Refusal): void;
  /** Edits a name in place: while any edit is open no read draws, and
   *  focus goes back to the edit's own opener when it ends. On a name
   *  already being edited it focuses that field. */
  edit(spec: RenameSpec): void;
  /** Hands `content` to a flow that draws in it itself: the part forgets
   *  its draw and drops the read in flight, so a refusal after it empties
   *  `content` and Retry loads afresh. */
  lend(): HTMLElement;
  /** Aborts once `content` is drawn again, emptied or lent, or the part's
   *  signal ends: what a draw or a loan starts runs on it. */
  life(): AbortSignal;
  /** The data drawn last, undefined before the first draw. */
  drawn(): T | undefined;
}

export function screenPart<T>(spec: PartSpec<T>): Part<T> {
  const reads = latest(spec.signal);
  const scope = spec.scope ?? spec.content;
  let runs = 0;
  let loads = 0;
  /** The newest read's end while it runs. */
  let running: Promise<unknown> | undefined;
  /** The refresh the calls made during a read share. */
  let queued: Promise<boolean> | undefined;
  // A superseded read hands its focus request to the newer one.
  let wanted: string | null | undefined;
  let drawn: { readonly data: T } | undefined;
  let failure: Element | undefined;
  let drawing = new AbortController();
  const handOn = (): void => {
    drawing.abort();
    drawing = new AbortController();
  };
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
      scope,
      spec.heading,
      () => {
        handOn();
        spec.draw(data);
      },
      asked,
    );
  };

  // Retry asks again for the focus the refused read was to draw with, and
  // with nothing drawn it is the first read again.
  const fail = (r: Refusal, asked: string | null | undefined): void => {
    spec.refused(r, () => void (drawn === undefined ? load(asked) : refresh(asked)));
    failure = spec.notices.shown();
  };

  const track = <R>(work: Promise<R>): Promise<R> => {
    running = work;
    void work.then(() => {
      if (running === work) {
        running = undefined;
      }
    });
    return work;
  };

  const idle = async (): Promise<void> => {
    for (let r = running; r !== undefined; r = running) {
      await r;
    }
  };

  const refresh = (focus?: string | null): Promise<boolean> => {
    if (spec.follows !== true || running === undefined) {
      return track(reread(focus));
    }
    queued ??= idle().then(() => {
      queued = undefined;
      return refresh(focus);
    });
    return queued;
  };

  const reread = async (focus?: string | null): Promise<boolean> => {
    wanted = focus === undefined ? wanted : focus;
    runs += 1;
    let drew = false;
    await reads.run(spec.read, (got) => {
      if (got === undefined) {
        return;
      }
      const asked = wanted;
      wanted = undefined;
      if (!got.ok) {
        if (drawn === undefined) {
          redrawKeepingFocus(scope, spec.heading, () => {
            handOn();
            spec.content.replaceChildren();
          });
        }
        fail(got, asked);
        return;
      }
      if (drawn !== undefined && spec.unchanged?.(got.data, drawn.data) === true) {
        spec.notices.drop(failure);
        failure = undefined;
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

  const load = async (focus?: string | null): Promise<boolean> => {
    spec.busy?.setAttribute("aria-busy", "true");
    loads += 1;
    const loading = loads;
    const reading = track(reread(focus));
    const mine = runs;
    const skeleton = skeletonTiming(
      () => {
        if (runs === mine && drawn === undefined) {
          redrawKeepingFocus(scope, spec.heading, () => {
            handOn();
            spec.content.replaceChildren(sketch());
          });
        }
      },
      spec.signal === undefined ? {} : { signal: spec.signal },
    );
    const drew = await reading;
    if (spec.signal?.aborted === true) {
      skeleton.cancel();
      return false;
    }
    skeleton.commit(() => {
      if (loads === loading) {
        spec.busy?.removeAttribute("aria-busy");
      }
    });
    return drew;
  };

  return {
    refresh,
    load,
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
    lend: () => {
      reads.start();
      runs += 1;
      wanted = undefined;
      drawn = undefined;
      handOn();
      return spec.content;
    },
    life: () =>
      spec.signal === undefined ? drawing.signal : AbortSignal.any([drawing.signal, spec.signal]),
    drawn: () => drawn?.data,
  };
}
