/**
 * actions.ts — a table row's actions cell on Account and security: its one
 * action as a small button, or a quiet ⋯ button opening a menu of them, as
 * docs/design-patterns.md "Row actions" holds a row to one worded action.
 * @module
 */

import { enhanceConfirm, type Confirm } from "../../buttons/confirm/confirm.js";
import { enhanceMenu } from "../../overlays/menu/menu.js";
import { glyph } from "../../foundations/icons/glyph.js";
import type { IconName } from "../../foundations/icons/icons.js";
import { cell, el, rowButton, uid } from "./dom.js";
import { holdBy, holdForHttps, isHeld } from "./screen.js";
import type { AccountWords } from "./words.js";

/** One thing a row's person can do. */
export interface Action {
  /** Its words in a menu, and its accessible name. */
  readonly text: string;
  /** Its visible words as the row's one button, when shorter than `text`,
   *  as the row names what it acts on. */
  readonly short?: string;
  /** Marks its control with `data-cp-action`, for focus after a redraw. */
  readonly key: string;
  /** Its busy words, when it runs a request in place. */
  readonly busy?: string;
  readonly icon?: IconName;
  readonly danger?: boolean;
  /** The row's name added to its accessible name, as "Rename Phone". */
  readonly label?: string;
  /** Held on this plain session, since it needs HTTPS. */
  readonly https?: boolean;
  /** `confirm` is the control's own busy cycle, absent in a menu. */
  readonly run: (opener: HTMLElement, confirm: Confirm | undefined) => void;
}

export interface ActionsCtx {
  readonly w: AccountWords;
  readonly app: string;
  readonly httpsOrigin: string | undefined;
  readonly life: { readonly signal?: AbortSignal };
}

/** The actions cell of the row named `name`, and the "Needs HTTPS." line
 *  its held actions name, for the row's state column; with `shared`, they
 *  name that line, which the caller shows once for every row. */
export function rowActions(
  ctx: ActionsCtx,
  name: string,
  actions: readonly Action[],
  shared?: HTMLElement,
): [HTMLTableCellElement, HTMLElement | undefined] {
  const { w } = ctx;
  const td = cell();
  td.dataset["col"] = "actions";
  const held: HTMLElement[] = [];
  const [only] = actions;
  if (actions.length === 1 && only !== undefined) {
    const label = only.label ?? (only.short === undefined ? undefined : only.text);
    const b = rowButton(only.short ?? only.text, {
      ...(only.icon === undefined ? {} : { icon: only.icon }),
      ...(label === undefined ? {} : { label }),
    });
    b.dataset["cpAction"] = only.key;
    if (only.danger === true) {
      b.dataset["tone"] = "danger";
    }
    const confirm = enhanceConfirm(b, {
      busy: only.busy ?? only.text,
      done: false,
      ...ctx.life,
    });
    b.addEventListener(
      "click",
      () => {
        if (!isHeld(b)) {
          only.run(b, only.busy === undefined ? undefined : confirm);
        }
      },
      ctx.life,
    );
    if (only.https === true) {
      held.push(b);
    }
    td.append(b);
  } else if (actions.length > 1) {
    const more = el("button", "cp-button");
    more.type = "button";
    more.dataset["variant"] = "quiet";
    more.dataset["size"] = "sm";
    more.setAttribute("aria-label", w["methods.actionsFor"](name));
    more.append(glyph("ellipsis"));
    const menu = el("div", "cp-popover cp-menu");
    menu.id = uid("menu");
    menu.popover = "auto";
    menu.setAttribute("role", "menu");
    more.setAttribute("popovertarget", menu.id);
    const chosen = new Map<HTMLElement, Action>();
    for (const a of actions) {
      const item = el("button", undefined, a.text);
      item.type = "button";
      item.setAttribute("role", "menuitem");
      item.dataset["cpAction"] = a.key;
      if (a.danger === true) {
        item.dataset["tone"] = "danger";
      }
      if (a.https === true) {
        held.push(item);
      }
      chosen.set(item, a);
      menu.append(item);
    }
    enhanceMenu(menu, {
      onSelect: (item) => {
        if (!isHeld(item)) {
          chosen.get(item)?.run(more, undefined);
        }
      },
      ...ctx.life,
    });
    td.append(more, menu);
  }
  if (held.length === 0) {
    return [td, undefined];
  }
  if (shared !== undefined) {
    holdBy(held, shared);
    return [td, undefined];
  }
  return [td, holdForHttps(held, ctx, ctx.app, w)];
}

/** A row's first cell, its header. */
export function rowHead(content: string | Node): HTMLTableCellElement {
  const th = el("th");
  th.scope = "row";
  th.append(content);
  return th;
}
