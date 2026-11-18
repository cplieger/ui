/**
 * pages.ts — how the account screens read a list: every page in turn for
 * a list a screen needs whole, or one page at a time under the pager,
 * which says where the page sits and links the pages on either side by
 * the cursors the answer carries.
 * @module
 */

import type { ListAnswer, PageQuery, Result } from "./client.js";
import { el } from "./dom.js";
import { read } from "./screen.js";

/** The largest page a list read may ask for. */
export const MAX_PAGE = 200;
// A list longer than this many pages is a server that never ends it.
const MAX_PAGES = 1000;

/** Every item of the list `page` reads, in the list's order, following
 *  each `next_cursor`: the first refusal instead when a page is refused,
 *  and a status 0 refusal when the list does not end. */
export async function everyPage<T>(
  page: (q: PageQuery) => Promise<Result<ListAnswer<T>>>,
): Promise<Result<readonly T[]>> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const at = cursor;
    const got = await read(() =>
      page(at === undefined ? { limit: MAX_PAGE } : { cursor: at, limit: MAX_PAGE }),
    );
    if (!got.ok) {
      return got;
    }
    items.push(...got.data.items);
    cursor = got.data.next_cursor;
    if (cursor === undefined) {
      return { ok: true, data: items };
    }
  }
  return { ok: false, status: 0, error: "the list did not end" };
}

interface PagerWords {
  /** The pager's accessible name. */
  readonly label: string;
  readonly prev: string;
  readonly next: string;
  /** "51 to 100 of 659", from the formatted numbers. */
  readonly range: (first: string, last: string, total: string) => string;
}

export interface PagerSpec {
  readonly words: PagerWords;
  /** Names the links' `data-cp-action`, `<key>-prev` and `<key>-next`, by
   *  which a redraw keeps focus on them. */
  readonly key: string;
  /** The address of the page a cursor reaches. */
  readonly href: (cursor: string) => string;
  /** Shows the page a cursor reaches, on a plain press of its link. */
  readonly go: (cursor: string) => void;
  readonly signal?: AbortSignal | undefined;
}

/** A `nav.cp-pager` under `page`: its place in the list, then a link to
 *  the page before and the page after; a side the answer has no cursor
 *  for is an `aria-disabled` link with no address. */
export function pager(page: ListAnswer<unknown>, spec: PagerSpec): HTMLElement {
  const { words } = spec;
  const nav = el("nav", "cp-pager");
  nav.setAttribute("aria-label", words.label);
  const fmt = new Intl.NumberFormat();
  nav.append(
    el(
      "span",
      undefined,
      page.items.length === 0
        ? ""
        : words.range(
            fmt.format(page.offset + 1),
            fmt.format(page.offset + page.items.length),
            fmt.format(page.total),
          ),
    ),
    link(words.prev, page.prev_cursor, `${spec.key}-prev`, spec),
    link(words.next, page.next_cursor, `${spec.key}-next`, spec),
  );
  return nav;
}

function link(
  text: string,
  cursor: string | undefined,
  action: string,
  spec: PagerSpec,
): HTMLAnchorElement {
  const a = el("a", "cp-button", text);
  a.dataset["variant"] = "quiet";
  a.dataset["size"] = "sm";
  a.dataset["cpAction"] = action;
  if (cursor === undefined) {
    a.setAttribute("aria-disabled", "true");
    return a;
  }
  a.href = spec.href(cursor);
  a.addEventListener(
    "click",
    (ev) => {
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) {
        return;
      }
      ev.preventDefault();
      spec.go(cursor);
    },
    spec.signal === undefined ? {} : { signal: spec.signal },
  );
  return a;
}
