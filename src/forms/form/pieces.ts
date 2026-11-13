/**
 * pieces.ts — fields whose value is more than their controls' values, such
 * as `./tokens`' chips or `./pairs`' rows. Each registers the box that holds
 * it, how to read and write its values, and the values a reset puts back,
 * so the unsaved-changes guard counts, discards and rebases it as it does a
 * native control.
 * @internal
 * @module
 */

import { shared } from "../../core/lifetime/lifetime.js";

/** A piece's values by the name each saves under; `""` for a piece with no
 *  name. */
export type Values = Readonly<Record<string, readonly string[]>>;

export interface Piece {
  /** The box: every control inside is the piece's, never counted alone. */
  readonly element: Element;
  value(): Values;
  /** Writes `values` with no announcement and no animation, then calls
   *  `touched` with the box. */
  set(values: Values): void;
}

interface Held {
  readonly piece: Piece;
  saved: Values;
}

const held = new WeakMap<Element, Held>();
const boxes = new Set<WeakRef<Element>>();
const watchers = new Set<(box: Element) => void>();

export function sameValues(a: Values, b: Values): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((k) => {
      const x = a[k] ?? [];
      const y = b[k];
      return y?.length === x.length && x.every((v, i) => v === y[i]);
    })
  );
}

// A form's reset puts each piece inside it back, a task later as `./file`
// does, so a listener that cancels the reset keeps the piece too.
const resets = shared((signal) => {
  document.addEventListener(
    "reset",
    (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }
      setTimeout(() => {
        if (!e.defaultPrevented) {
          resetPieces(form);
        }
      });
    },
    { capture: true, signal },
  );
});

/** Holds `piece`, its values now taken as the ones a reset puts back. */
export function registerPiece(piece: Piece, signal?: AbortSignal): void {
  if (signal?.aborted === true) {
    return;
  }
  const ref = new WeakRef(piece.element);
  held.set(piece.element, { piece, saved: piece.value() });
  boxes.add(ref);
  resets.install(signal === undefined ? {} : { signal });
  signal?.addEventListener(
    "abort",
    () => {
      boxes.delete(ref);
      if (held.get(piece.element)?.piece === piece) {
        held.delete(piece.element);
      }
    },
    { once: true },
  );
}

/** The pieces inside `root`, in page order. */
export function piecesIn(root: Element): Piece[] {
  const found: Piece[] = [];
  for (const ref of boxes) {
    const box = ref.deref();
    const h = box === undefined ? undefined : held.get(box);
    if (box === undefined || h === undefined) {
      boxes.delete(ref);
    } else if (root.contains(box)) {
      found.push(h.piece);
    }
  }
  return found.sort((a, b) =>
    a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
}

/** The registered piece whose box holds `node`, if any. */
export function pieceOf(node: Node): Piece | undefined {
  for (let n: Node | null = node; n !== null; n = n.parentNode) {
    const h = n instanceof Element ? held.get(n) : undefined;
    if (h !== undefined) {
      return h.piece;
    }
  }
  return undefined;
}

export function savedOf(piece: Piece): Values {
  return held.get(piece.element)?.saved ?? {};
}

/** Takes `values` as the ones a reset puts back. */
export function commitPiece(piece: Piece, values: Values = piece.value()): void {
  const h = held.get(piece.element);
  if (h !== undefined) {
    h.saved = values;
  }
}

export function pieceChanged(piece: Piece): boolean {
  return !sameValues(piece.value(), savedOf(piece));
}

/** Puts each changed piece inside `form` back to its saved values. */
export function resetPieces(form: Element): void {
  for (const p of piecesIn(form)) {
    if (pieceChanged(p)) {
      p.set(savedOf(p));
    }
  }
}

/** Tells every watcher that the piece in `box` changed. */
export function touched(box: Element): void {
  for (const w of watchers) {
    w(box);
  }
}

/** Runs `fn` with a piece's box after each change to it, until `signal`. */
export function watchPieces(fn: (box: Element) => void, signal?: AbortSignal): void {
  watchers.add(fn);
  signal?.addEventListener(
    "abort",
    () => {
      watchers.delete(fn);
    },
    { once: true },
  );
}
