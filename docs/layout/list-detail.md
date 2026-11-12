# List and detail

A list with the chosen entry's detail beside it. Once the box holding both is 52rem wide, the detail docks beside the list. Below that width, the same detail opens as a full-height sheet at the inline end, across the whole window on a phone. The rest of the page is inert while the sheet is open.

The app's route decides when the detail shows. A link on each entry changes the route, and the route calls `open()` or `close()`. Back then closes the detail. Close goes back, and so do Escape and a press outside while the detail is in its sheet.

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
import { enhanceListDetail } from "@cplieger/ui/list-detail";

const detail = enhanceListDetail(document.getElementById("sources")!, {
  signal: page.signal,
  onDismiss: () => history.back(),
});

function route(entry: string | null): void {
  if (entry === null) {
    detail.close();
  } else {
    fillDetail(entry);
    detail.open();
  }
}
```

| Option | Default | What it does |
| --- | --- | --- |
| `signal` | none | Aborting it closes the detail and removes the sheet and the listeners. |
| `dockAt` | `52` | The box's width, in rem, from which the detail docks. |
| `onDismiss` | `close()` | Runs on Close, and on Escape, a press outside, or the browser closing the sheet itself while the detail is in its sheet. Go back here, and let the route close the detail. |

- `open()` shows the detail and focuses its heading. Calling it again while the detail shows moves focus back to the heading. `open({ still: true })` shows it without its entrance, for a page that loads with an entry open.
- `close()` hides the detail and returns focus to the element that had it before `open()`, usually the entry's link. When another entry's link opens the docked detail, focus returns to that link. The sheet slides out with the detail still in it; calling `open()` during that exit keeps it open.
- An open detail moves between the dock and the sheet when the box crosses the docking width, without its entrance, and keeps focus inside it.

The script measures the box, not the window, so the frame works in any region that gives it room. Mark the open entry's link with `aria-current="true"`, so a screen reader hears which entry the detail shows and the list fills its row.

The sheet is a `.cp-dialog` with `data-variant="sheet"`, the language's sheet, and the detail fills its height, so its body scrolls inside it. [announce](../feedback/announce.md) speaks from inside the sheet while it is open.
