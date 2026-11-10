# List and detail

A list with the chosen entry's detail beside it. Once the box holding both is 52rem wide, the detail docks beside the list. Below that width, the same detail opens in a modal dialog, which rises from the bottom on a phone.

The app's route decides when the detail shows. A link on each entry changes the route, and the route calls `open()` or `close()`. Back then closes the detail. Close goes back, and so does Escape while the detail is in its dialog.

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
| `signal` | none | Aborting it closes the detail and removes the dialog and the listeners. |
| `dockAt` | `52` | The box's width, in rem, from which the detail docks. |
| `onDismiss` | `close()` | Runs on Close, and on Escape while the detail is in its dialog. Go back here, and let the route close the detail. |

- `open()` shows the detail and focuses its heading. Calling it again while the detail shows moves focus back to the heading. `open({ still: true })` shows it without its entrance, for a page that loads with an entry open.
- `close()` hides the detail and returns focus to the element that had it before `open()`, usually the entry's link.
- An open detail moves between the dock and the dialog when the box crosses the docking width, and keeps focus inside it.

The script measures the box, not the window, so the frame works in any region that gives it room. Mark the open entry's link with `aria-current="true"`, so a screen reader hears which entry the detail shows and the list fills its row.

While the detail is in its dialog, the rest of the page is inert. [announce](../feedback/announce.md) speaks from inside the dialog then.
