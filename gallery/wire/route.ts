import type { ListDetail } from "@cplieger/ui/list-detail";

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
  /** Whether a fragment, with its `#`, names an entry the page can show. */
  readonly names: (hash: string) => boolean;
  /** The list's own address, which Close pushes when the entry before it showed no list. */
  readonly list: string;
  /** Renders what the address names, `still` on the page's load; called again
   *  for the same address, it changes nothing. */
  readonly sync: (still: boolean) => void;
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
  const { names, list, sync } = options;
  /** Set from a Close's Back until the page arrives, so a second Close leaves no further. */
  let leaving = false;

  const arrive = (e: Event): void => {
    leaving = false;
    if (e instanceof HashChangeEvent && fromList(history.state) === undefined) {
      stamp(!names(new URL(e.oldURL).hash));
    }
    sync(false);
  };

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
      // the page keeps the entry and only moves focus. While the address names
      // an entry, the detail is one panel whose content a link to another
      // entry changes, so that link replaces the entry, keeping its state.
      document.addEventListener("click", (e) => {
        const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
        const plain = e.button === 0 && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);
        if (
          !(link instanceof HTMLAnchorElement) ||
          !plain ||
          e.defaultPrevented ||
          // `_self`, in any ASCII case, is the link's own navigable
          // (https://html.spec.whatwg.org/multipage/document-sequences.html#valid-navigable-target-name-or-keyword).
          !/^(_self)?$/i.test(link.target) ||
          location.hash === "" ||
          link.href.split("#")[0] !== location.href.split("#")[0]
        ) {
          return;
        }
        if (link.href !== location.href) {
          if (names(location.hash) && names(link.hash)) {
            e.preventDefault();
            stamp(fromList(history.state) ?? false, link.href);
            sync(false);
          }
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
