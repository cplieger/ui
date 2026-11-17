import type { DetailCloseEvent, ListDetail } from "@cplieger/ui/list-detail";

// Each entry this router owns records whether the entry before it showed the
// list, beside the app's other `history.state` keys, so Close is one Back to
// that list or else a push of the list's address: never a jump over several
// entries.
const FROM_LIST = "cp-gallery-from-list";

const fromList = (state: unknown): boolean | undefined => {
  const v: unknown =
    typeof state === "object" && state !== null ? Reflect.get(state, FROM_LIST) : undefined;
  return typeof v === "boolean" ? v : undefined;
};

const stamp = (from: boolean, url?: string): void => {
  const own: unknown = history.state;
  history.replaceState(
    { ...(typeof own === "object" && own !== null ? own : {}), [FROM_LIST]: from },
    "",
    url,
  );
};

export interface ListRouteOptions {
  /** The `.cp-list-detail`, before `enhanceListDetail` runs on it. */
  readonly root: HTMLElement;
  /** Whether a fragment, with its `#`, names an entry the page can show. */
  readonly names: (hash: string) => boolean;
  /** The list's own address, which Close pushes when the entry before it showed no list. */
  readonly list: string;
  /** Renders what the address names, `still` on the page's load; called again
   *  for the same address, it changes nothing. */
  readonly sync: (still: boolean) => void;
  /** Where focus goes when the detail closes with focus in it or on the page:
   *  the closed entry's row, or the list's tab stop when that row is gone. */
  readonly rowOrStop: (key: string) => HTMLElement | null;
}

export interface ListRoute {
  /** The list-detail's `onDismiss`. */
  readonly close: () => void;
  /** Stamps the entry the page loaded on, rewriting its address to `url` when
   *  given, renders it, and follows Back, Forward, a fragment's change and a
   *  restore. */
  start(detail: ListDetail, url?: string): void;
}

/** The gallery's sample router for a list-detail whose address is the page's fragment. */
export function routeListDetail(options: ListRouteOptions): ListRoute {
  const { root, names, list, sync, rowOrStop } = options;
  const shown = root.querySelector(":scope > .cp-detail");
  /** Set from a Close's Back until the page arrives, so a second Close leaves no further. */
  let leaving = false;

  const arrive = (e: Event): void => {
    leaving = false;
    if (e instanceof HashChangeEvent && fromList(history.state) === undefined) {
      stamp(!names(new URL(e.oldURL).hash));
    }
    sync(false);
  };

  root.addEventListener("detailclose", (e) => {
    const active = document.activeElement;
    if (active === document.body || shown?.contains(active) === true) {
      rowOrStop((e as DetailCloseEvent).detail.key)?.focus({ preventScroll: true });
    }
  });

  return {
    close: () => {
      if (leaving) {
        return;
      }
      if (fromList(history.state) === true) {
        leaving = true;
        history.back();
        return;
      }
      history.pushState({ [FROM_LIST]: false }, "", list);
      sync(false);
    },
    start(detail, url) {
      if (fromList(history.state) === undefined) {
        stamp(false, url ?? location.href);
      }
      addEventListener("popstate", arrive);
      addEventListener("hashchange", arrive);
      addEventListener("pageshow", (e) => {
        if (e.persisted) {
          arrive(e);
        }
      });
      // A press on a link to the address itself would replace its entry, which
      // in Firefox drops its state (https://html.spec.whatwg.org/multipage/browsing-the-web.html#navigate-fragid);
      // the page keeps the entry and only moves focus.
      document.addEventListener("click", (e) => {
        const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
        const plain = e.button === 0 && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);
        if (
          !(link instanceof HTMLAnchorElement) ||
          !plain ||
          e.defaultPrevented ||
          location.hash === "" ||
          link.href !== location.href
        ) {
          return;
        }
        e.preventDefault();
        if (detail.key === null) {
          document.getElementById(location.hash.slice(1))?.scrollIntoView();
        } else {
          detail.show(detail.key);
        }
      });
      sync(true);
    },
  };
}
