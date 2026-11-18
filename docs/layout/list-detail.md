# List and detail

A list with the chosen entry's detail beside it. Once the box holding both is 52rem wide, the detail docks beside the list. Below that width, the same detail opens as a full-height sheet at the inline end, across the whole window on a phone. The rest of the page is inert while the sheet is open.

The app's router owns the URL and decides when the detail shows. A link on each entry changes the address, and the router calls `show(key)` with the entry the address names, or `show(null)` when it names none. Back restores the previous entry, and the detail closes only when that entry names none. Close, and Escape or a press outside while the detail is in its sheet, ask the router to leave the entry: one Back when the entry before it showed the list, otherwise a navigation to the list's address, never a jump over several entries. [Navigation and the URL](../design-patterns.md#navigation-and-the-url) has the router's rules.

## Markup

```html
<div class="cp-list-detail" id="sources">
  <ul class="cp-stack">
    <li><a href="#sources/sonarr">Sonarr</a></li>
  </ul>
  <section class="cp-detail" hidden aria-labelledby="source-title">
    <header>
      <h2 id="source-title" tabindex="-1">Sonarr</h2>
      <button class="cp-button" data-variant="quiet" type="button" data-detail-close aria-label="Close">
        <span class="cp-icon" data-cp-icon="x" aria-hidden="true"></span>
      </button>
    </header>
    <div class="cp-detail-body">…</div>
  </section>
</div>
```

The heading takes focus when the detail opens, so it needs `tabindex="-1"`. The design language draws no focus ring on a heading that script focuses.

## Wide

`data-variant="wide"` is for a detail that is the work, such as an open conversation. Docked, the list takes 30% of the box, kept within 16rem and 22rem, at its own height, and the detail takes the rest. The docked detail sticks under any sticky header, `--cp-sticky-top` from the top, and is at most the window's height less that header, so the list and the detail scroll apart. Its second child fills the rest of it and scrolls inside it: a `.cp-detail-body`, or a [context-panel](context-panel.md) whose feed keeps its foot pinned to the detail's end.

```html
<div class="cp-list-detail" data-variant="wide" id="messages">
  <ul class="cp-list">…</ul>
  <section class="cp-detail" hidden aria-labelledby="thread-title">
    <header>…</header>
    <div class="cp-context">…</div>
  </section>
</div>
```

## Script

```ts
import { type DetailOpenEvent, enhanceListDetail } from "@cplieger/ui/list-detail";

const root = document.getElementById("sources")!;
const detail = enhanceListDetail(root, {
  signal: page.signal,
  onDismiss: backToList,
  entry: rowLink,
});

root.addEventListener("detailopen", (e) => {
  fillDetail((e as DetailOpenEvent).detail.key);
});

function route(entry: string | null): void {
  detail.show(entry);
}
```

| Option | Default | What it does |
| --- | --- | --- |
| `signal` | none | Aborting it closes the detail and removes the sheet and the listeners. |
| `dockAt` | `52` | The box's width, in rem, from which the detail docks. |
| `onDismiss` | `show(null)` | Runs on Close, and on Escape, a press outside, or the browser closing the sheet itself while the detail is in its sheet. Leave the entry here, by one Back when the entry before it showed the list or else a navigation to the list's address, and let the route call `show(null)`. Until it does, Close, Escape and a press outside leave the sheet open, so a route that refuses, such as an unsaved-changes "Keep editing", is asked again on the next one. |
| `entry` | none | Takes an entry's key and returns its row's link, or null when the row is not drawn. Focus goes there after a hide when the element that showed the entry is gone or was the page, or when Back or Forward showed it, at once or after an await. Without it, focus goes to the list's tab stop. |

- `show(key)` shows the detail for `key` and focuses its heading. Showing another entry moves focus to its heading even when the heading already had it, so a screen reader hears the new entry. The same key again only moves focus back to the heading, so a press on the open entry changes nothing else. When that heading is entirely out of view, or under the page's `scroll-padding` where a sticky bar sits, the page scrolls only as far as it takes to show it. Back and Forward can restore the page's scroll after the route's show, so the heading a traversal's show focused is revealed again by the same rule once the restore has run. `show(key, { still: true })` shows it without its entrance, for a page that loads with an entry open. Docked, a still show moves no focus and no scroll, since the load is not the reader's act, so focus stays at the page's start. In the sheet, it focuses the heading. `key` reads the entry shown, or null.
- `show(null)` hides the detail, and the module moves focus. The sheet slides out with the detail still in it, and a `show(key)` during that exit keeps it open. Focus ends on the first of these that applies:
  1. Where the reader moved it. Focus the reader put outside the detail before the hide stays there.
  2. Where a fragment navigation went. This applies when the hide comes while the page handles a navigation that pushed a new entry to a fragment of this page, from a link in the detail or elsewhere, or from a script. The route hides during that navigation: in its `popstate` or `hashchange` listener, or in its `intercept()` handler, which may await. A hide after that counts as any other. Focus lands as it would on a page with no modal sheet. A fragment naming an element outside the detail, one that does not hold the list-detail, puts focus on it, or, when it takes no focus, on it with `tabindex="-1"` until it loses focus, so the next Tab starts there, with its top scrolled into view. An empty fragment, or `#top` naming no element, is the top of the document: the page scrolls to its start and focus goes to its first focusable element in view, else its main heading, else the page itself. The module reads the navigation from the [Navigation API](https://developer.mozilla.org/docs/Web/API/Navigation_API). A navigation that replaced the entry, a reload, Back and Forward go to step 3, and so does a press that navigated nothing, such as a Ctrl press that opens a new tab or a press the page prevented. In a browser without that API, no navigation counts.
  3. The element that had focus when the entry being hidden was shown, usually its link, or the entry's link pressed again from outside the docked detail, while it is still a control that takes focus. It belongs to that entry: showing another entry forgets it, so focus never returns to another entry's row. A show from a link inside the detail records none. A show that follows a hide records none unless it shows the hidden entry again, so a route that hides while it fetches the next entry never makes the row the module returned focus to that entry's opener. Neither does a show during or after Back or Forward, whether the route makes it at once or after an await, until the next navigation that is not Back or Forward.
  4. The entry's row, from `entry`, when that element is gone, or none was recorded: the page loaded with the entry open, a link inside the detail showed it, or Back or Forward did.
  5. The list's tab stop: the roving row in a list with arrow keys, else the list's first drawn link, else its first heading, with `tabindex="-1"` until it loses focus.

  Steps 3 to 5 scroll only when none of the element is in view clear of the page's `scroll-padding`, so a return to the row never jumps the list. The app writes no focus code for a hide.
- The root gets a `detailopen` event, a `DetailOpenEvent` whose `detail` holds the new `key` and the `previous` one or null, each time the shown entry changes, before the heading takes focus, so its listener fills the detail. It gets a `detailclose` event, a `DetailCloseEvent` with the `key`, once each time the detail hides, for a listener that reacts to it: after focus has moved, once the sheet has closed, or, when a `show()` keeps the leaving sheet open, just before that show's `detailopen`.
- An open detail moves between the dock and the sheet when the box crosses the docking width, without its entrance, and keeps focus inside it.
- While the box is hidden, such as in a closed tab panel, the detail stays in it and opens no sheet. An open sheet shuts without asking `onDismiss`, and the detail docks or opens its sheet again once the box shows.

The script measures the box, not the window, so the frame works in any region that gives it room. Mark the open entry's link with `aria-current="true"`, so a screen reader hears which entry the detail shows and the list fills its row.

The sheet is a `.cp-dialog` with `data-variant="sheet"`, the language's sheet, marked `data-cp-own-close` because the route decides whether a close request closes it, and the detail fills its height, so its body scrolls inside it. [announce](../feedback/announce.md) speaks from inside the sheet while it is open.
