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

- `show(key)` shows the detail for `key` and focuses its heading. The same key again only moves focus back to the heading, scrolling only as far as it takes to show the heading when it is entirely out of view, so a press on the open entry changes nothing else. `show(key, { still: true })` shows it without its entrance, for a page that loads with an entry open. Docked, a still show also moves no focus and no scroll, since the load is not the reader's act, so focus stays at the page's start; in the sheet it focuses the heading. `key` reads the entry shown, or null.
- `show(null)` hides the detail and returns focus, when focus was inside it, to the element that had it before the detail showed, usually the entry's link. Focus the reader moved elsewhere stays there. When another entry's link shows the docked detail, focus returns to that link. When that element is gone, or was the page itself because the page loaded with the entry open, or focus is on the page itself when the detail hides, the app focuses the entry's link in a `detailclose` listener. When that link is not drawn, it focuses the list's tab stop instead: the roving row in a list with arrow keys, else the first drawn row's link, or the list's heading, with `tabindex="-1"`, when no row is drawn. The sheet slides out with the detail still in it, and a `show(key)` during that exit keeps it open.
- The root gets a `detailopen` event, a `DetailOpenEvent` whose `detail` holds the new `key` and the `previous` one or null, each time the shown entry changes, before the heading takes focus, so its listener fills the detail. It gets a `detailclose` event, a `DetailCloseEvent` with the `key`, once each time the detail hides: after its sheet has closed, so a listener can move focus out of it, or, when a `show()` keeps the leaving sheet open, just before that show's `detailopen`, while the sheet is still open.
- An open detail moves between the dock and the sheet when the box crosses the docking width, without its entrance, and keeps focus inside it.
- While the box is hidden, such as in a closed tab panel, the detail stays in it and opens no sheet. An open sheet shuts without asking `onDismiss`, and the detail docks or opens its sheet again once the box shows.

The script measures the box, not the window, so the frame works in any region that gives it room. Mark the open entry's link with `aria-current="true"`, so a screen reader hears which entry the detail shows and the list fills its row.

The sheet is a `.cp-dialog` with `data-variant="sheet"`, the language's sheet, marked `data-cp-own-close` because the route decides whether a close request closes it, and the detail fills its height, so its body scrolls inside it. [announce](../feedback/announce.md) speaks from inside the sheet while it is open.
