/**
 * proposal.ts — `enhanceProposal()` runs a change shown before it applies:
 * Apply runs it, Discard drops it, and Undo, when the app can, puts the
 * proposal back. An unverified proposal asks first, through `ask()`.
 * @module
 */

import { enhanceConfirm } from "../../buttons/confirm/confirm.js";
import { until, whenAborted } from "../../core/lifetime/lifetime.js";
import { safely } from "../../core/safely/safely.js";
import { focusOn } from "../../data/list-row/row.js";
import { glyph, toneGlyph, type Tone } from "../../foundations/icons/glyph.js";
import { ask } from "../../overlays/ask/ask.js";
import { announce } from "../announce/announce.js";

export interface ProposalWords {
  /** What the card says once the change applied, such as "Applied: +1.250 s
   *  with drift corrected."; it is said politely too. */
  readonly applied: string;
  /** Apply's words while the change applies. Default "Applying…". */
  readonly applying?: string;
  /** Said once Discard removed the card. Default "Proposal discarded". */
  readonly discarded?: string;
  /** Undo's words at rest and while it runs. Default "Undo", "Undoing…". */
  readonly undo?: string;
  readonly undoing?: string;
  /** Said once Undo put the proposal back. Default "Change undone". */
  readonly undone?: string;
  /** The failed line's sentence for each action, or built from what the
   *  action rejected with. Defaults "The change could not be applied.",
   *  "The proposal could not be discarded.", "The change could not be undone." */
  readonly applyFailed?: string | ((reason: unknown) => string);
  readonly discardFailed?: string | ((reason: unknown) => string);
  readonly undoFailed?: string | ((reason: unknown) => string);
}

/** The question an unverified proposal asks before Apply runs. */
export interface ProposalQuestion {
  /** Such as "Apply an unchecked change?". */
  readonly title: string;
  /** Such as "Nothing confirmed that +0.400 s matches the audio." */
  readonly message: string;
  /** The answer's words. Default "Apply". */
  readonly confirmLabel?: string;
  /** The declining button's words, such as "Keep the current timing".
   *  Default "Cancel". */
  readonly cancelLabel?: string;
}

export interface ProposalOptions {
  /** Applies the change. Its signal aborts with the module's. */
  readonly apply: (signal: AbortSignal) => Promise<void>;
  /** Drops the change where the app keeps it. Default: nothing to tell the
   *  app, so the card goes at once. */
  readonly discard?: (signal: AbortSignal) => Promise<void>;
  /** Puts back what Apply changed. Without it the applied card has no Undo. */
  readonly undo?: (signal: AbortSignal) => Promise<void>;
  /** Asked before Apply runs. Required by, and only allowed on, a card
   *  marked `data-variant="unverified"`. */
  readonly confirm?: ProposalQuestion;
  /** Where focus goes once Discard removed the card. Default its parent. */
  readonly returnFocus?: HTMLElement;
  readonly words: ProposalWords;
  /** Ends the card's wiring and any action under way. */
  readonly signal?: AbortSignal;
}

const DEFAULT_FAILED = {
  apply: "The change could not be applied.",
  discard: "The proposal could not be discarded.",
  undo: "The change could not be undone.",
} as const;

type Action = keyof typeof DEFAULT_FAILED;

/**
 * Wires `card`, a `.cp-proposal` holding its words in a `<p>` and a
 * `data-part="apply"` button with a `.cp-roll` and its busy span, beside an
 * optional `data-part="discard"` button. Throws a TypeError when a part is
 * missing, or when `confirm` and the card's `data-variant="unverified"` do
 * not come together. It writes the card's `data-tone` and leads the card
 * with that tone's glyph: warning while unverified, success once applied,
 * neither on a checked proposal before it applies.
 */
export function enhanceProposal(card: HTMLElement, options: ProposalOptions): void {
  const { signal, words } = options;
  const lines = card.querySelector<HTMLParagraphElement>(":scope > p");
  const apply = card.querySelector<HTMLButtonElement>('button[data-part="apply"]');
  const discard = card.querySelector<HTMLButtonElement>('button[data-part="discard"]');
  if (lines === null || apply === null) {
    throw new TypeError('enhanceProposal: the card needs a <p> and a data-part="apply" button');
  }
  const unverified = card.dataset["variant"] === "unverified";
  if (unverified !== (options.confirm !== undefined)) {
    throw new TypeError(
      'enhanceProposal: a data-variant="unverified" card takes confirm, and only it does',
    );
  }
  /** The proposal's words as Apply found them, which Undo puts back. */
  let proposed: Node[] = [];
  /** Writes the card's tone and the glyph it leads with, or neither. */
  const setTone = (tone: Tone | null): void => {
    card.querySelector(':scope > [data-part="tone"]')?.remove();
    if (tone === null) {
      delete card.dataset["tone"];
      return;
    }
    card.dataset["tone"] = tone;
    card.prepend(glyph(toneGlyph(tone), "tone"));
  };
  const resting: Tone | null = unverified ? "warning" : null;
  setTone(resting);
  const life = new AbortController();
  whenAborted(signal, () => {
    life.abort();
  });
  const ended = (): boolean => life.signal.aborted;
  const applyCycle = enhanceConfirm(apply, {
    busy: words.applying ?? "Applying…",
    done: false,
    signal: life.signal,
  });
  let busy = false;
  let failedLine: HTMLElement | null = null;
  /** Where Discard goes back to when Undo puts the proposal back. */
  let discardAt: { readonly parent: Node; readonly next: Node | null } | null = null;

  // A settle moves focus only when it was in the card, or the change would
  // drop it to the page; a reader who moved on keeps their place.
  const following = (): boolean =>
    card.contains(document.activeElement) || document.activeElement === document.body;

  const fail = (action: Action, reason: unknown): void => {
    const sentence = {
      apply: words.applyFailed,
      discard: words.discardFailed,
      undo: words.undoFailed,
    }[action];
    const text =
      typeof sentence === "function"
        ? safely(
            () => sentence(reason),
            () => DEFAULT_FAILED[action],
          )
        : (sentence ?? DEFAULT_FAILED[action]);
    failedLine ??= document.createElement("p");
    failedLine.className = "cp-state";
    failedLine.dataset["cpState"] = "failed";
    failedLine.textContent = text;
    lines.after(failedLine);
    announce(text, "assertive");
  };

  /** Runs one action at a time, its failure drawn under the words. */
  const act = async (action: Action, work: () => Promise<unknown>): Promise<boolean> => {
    if (busy || ended()) {
      return false;
    }
    busy = true;
    failedLine?.remove();
    try {
      await work();
      return !ended();
    } catch (reason) {
      if (!ended()) {
        fail(action, reason);
      }
      return false;
    } finally {
      busy = false;
    }
  };

  const makeUndo = (undo: (signal: AbortSignal) => Promise<void>): HTMLButtonElement => {
    const button = document.createElement("button");
    button.className = "cp-button";
    button.dataset["size"] = "sm";
    button.type = "button";
    const roll = document.createElement("span");
    roll.className = "cp-roll";
    roll.textContent = words.undo ?? "Undo";
    button.append(glyph("spinner-arc", "busy"), roll);
    const cycle = enhanceConfirm(button, {
      busy: words.undoing ?? "Undoing…",
      done: false,
      signal: life.signal,
    });
    button.addEventListener(
      "click",
      () => {
        void act("undo", () => cycle.run(() => undo(life.signal))).then((ok) => {
          if (!ok) {
            return;
          }
          const follow = following();
          delete card.dataset["cpState"];
          setTone(resting);
          lines.replaceChildren(...proposed);
          button.replaceWith(apply);
          if (discard !== null && discardAt !== null) {
            const { parent, next } = discardAt;
            parent.insertBefore(discard, next?.parentNode === parent ? next : null);
          }
          if (follow) {
            apply.focus();
          }
          announce(words.undone ?? "Change undone");
        });
      },
      until(life.signal),
    );
    return button;
  };
  const undoButton = options.undo === undefined ? null : makeUndo(options.undo);

  const toApplied = (): void => {
    const follow = following();
    card.dataset["cpState"] = "applied";
    setTone("success");
    proposed = [...lines.childNodes];
    lines.textContent = words.applied;
    if (discard?.parentNode != null) {
      discardAt = { parent: discard.parentNode, next: discard.nextSibling };
      discard.remove();
    }
    if (undoButton === null) {
      apply.remove();
    } else {
      apply.replaceWith(undoButton);
    }
    if (follow) {
      focusOn(undoButton ?? lines);
    }
    announce(words.applied);
  };

  apply.addEventListener(
    "click",
    () => {
      void (async () => {
        if (busy) {
          return;
        }
        if (options.confirm !== undefined) {
          const question = options.confirm;
          busy = true;
          const yes = await ask(question.message, {
            title: question.title,
            confirmLabel: question.confirmLabel ?? "Apply",
            cancelLabel: question.cancelLabel ?? "Cancel",
            focus: "decline",
            icon: glyph(toneGlyph("warning")),
            signal: life.signal,
          }).finally(() => {
            busy = false;
          });
          if (ended()) {
            return;
          }
          if (!yes) {
            if (apply.isConnected && document.activeElement === document.body) {
              apply.focus();
            }
            return;
          }
        }
        if (await act("apply", () => applyCycle.run(() => options.apply(life.signal)))) {
          toApplied();
        }
      })();
    },
    until(life.signal),
  );

  discard?.addEventListener(
    "click",
    () => {
      const drop = options.discard;
      const work =
        drop === undefined
          ? () => Promise.resolve()
          : async () => {
              discard.setAttribute("aria-busy", "true");
              try {
                await drop(life.signal);
              } finally {
                discard.removeAttribute("aria-busy");
              }
            };
      void act("discard", work).then((ok) => {
        if (!ok) {
          return;
        }
        const back = options.returnFocus ?? card.parentElement;
        const follow = following();
        card.remove();
        life.abort();
        if (back !== null && follow) {
          focusOn(back);
        }
        announce(words.discarded ?? "Proposal discarded");
      });
    },
    until(life.signal),
  );
}
