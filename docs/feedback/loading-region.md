# loading-region

`@cplieger/ui/loading-region`

A region that loads its own content, such as a panel of facts, a table's panel or a popover that fills each time it opens. It runs the region's whole cycle. A first load shows a placeholder, and only when the answer is slow. A refresh keeps the old content in view while a thin line runs along the region's top edge, and the region is marked `aria-busy`. A failure says what broke, with Retry: in the region's place on a first load, and above the old content on a refresh, with the time that content is from. The app fetches and renders the content itself.

```html
<button class="cp-button" type="button" data-cp-refresh>
  <span class="cp-icon" data-cp-icon="refresh-cw" aria-hidden="true"></span>Refresh
</button>
<div class="cp-panel" id="library-facts">
  <dl class="cp-facts">…</dl>
</div>
```

```ts
import { enhanceLoadingRegion } from "@cplieger/ui/loading-region";

const facts = enhanceLoadingRegion(panel, {
  load: (signal) => api.libraryFacts({ signal }),
  render: (data) => panel.replaceChildren(factsList(data)),
  words: {
    refreshFailed: (reason, at) =>
      `The refresh failed: ${messageOf(reason)} What you see is from ${time(at)}.`,
  },
  signal: view.signal,
});
refresh.addEventListener("click", () => void facts.load(refresh));

// A popover that loads each time it opens: the first open is a first load,
// and each later one refreshes over the names it shows.
const readers = enhanceLoadingRegion(popover, {
  load: (signal) => api.readers(post, { signal }),
  render: (list) => popover.replaceChildren(...readerSections(list)),
  words: { loading: "Loading who read it…", failed: "The readers could not be loaded." },
});
popover.addEventListener("beforetoggle", (e) => {
  if (e.newState === "open") void readers.load();
});
```

## API

- `enhanceLoadingRegion(region, opts)` wires `region` and returns `{ load(from?), state }`. Nothing loads until `load()` is called.
- `load(from?)` loads the content. `from` is the button pressed. The failure notice's own Retry runs through [confirm](../buttons/confirm.md)'s busy cycle until the content is painted, and comes to rest as soon as a failure notice is back. Any other `from` has its icon turned through [turn](../buttons/turn.md)'s `turnWhile` while the load runs, with `aria-busy` on it. A load that replaces one from the same button keeps that button busy until the replacing load settles. A load already running is aborted, its own call resolving `false`, and this one starts from the state that load started from, so a popover that is closed and opened again quickly shows the newest answer. It resolves `true` once the content is rendered, and `false` when the load failed or the signal aborted.
- `state` is `"idle"` (never loaded, nothing in it), `"loading"` (a first load), `"failed"` (a load failed with nothing to show), `"ready"`, `"refreshing"` (a load over the content) or `"stale"` (a refresh failed, so the content is older than asked). A region that holds content when it is wired starts `"ready"`, else `"idle"`.
- `LoadingRegionOptions` = `{ load, render, placeholder?, loadedAt?, locale?, words?, signal? }`.
  - `load(signal)` fetches the content. A rejection, or a throw before it returns its promise, is the failed state. `signal` aborts with the module's, and when a later `load()` replaces this one.
  - `render(data)` puts the content in. After a first load the region is empty when it runs. After a refresh it still holds the old content, which `render` replaces or updates in place. A `render` that throws fails the load as a rejection does, and its call resolves `false`.
  - `placeholder()` makes the first load's placeholder, such as a skeleton in the content's shape. By default it is a `.cp-inline-load` with the loading words.
  - `loadedAt` is when the content the region holds was loaded, by default the time it is wired. Each load that renders sets it again.
  - `locale` writes the time in the refresh failure, by default the region's `lang`, or its nearest ancestor's. A `lang` that is not a language tag, such as `en_US`, reads as none, so the time is in the browser's language. A malformed `locale` throws a `RangeError` when the region is wired.
  - `words` = `{ loading?, failed?, refreshFailed?, remedy?, retry?, retrying? }`. `loading` is the placeholder's words, by default "Loading…". `failed` is the sentence of a first load's failure, or a function given what `load` rejected with, by default "The content did not load.". `refreshFailed(reason, loadedAt)` is the sentence of a refresh's failure, by default "The refresh failed. What you see is from 14:02.", with the date too when the content is from another day, and with no time, "The refresh failed.", when `loadedAt` is not a valid date. `remedy(reason)` is what the person can do about either failure, shown as a muted line under its sentence and not said, or `undefined` for none, the default. `retry` and `retrying` are Retry's words at rest and while it loads, by default "Retry" and "Retrying…". A word function that throws is reported to the page as an uncaught error, and its default takes its place, so the failure still settles with its notice and Retry.
  - `signal` ends a load under way and the region's wiring.

## Behaviour

- The region carries `aria-busy="true"` while it loads or refreshes, and `aria-busy="false"` once it settles, as [Loading](../design-patterns.md#loading) says. Its `data-cp-load` holds the state for the stylesheet.
- A first load paints the placeholder only after 200ms, and keeps it at least 400ms once painted, through [skeleton](skeleton.md)'s `skeletonTiming`.
- While it refreshes, a 3px accent line runs along the region's top edge, inside its border, and stays there while a region that scrolls is scrolled. When the region starts with a table, or with a panel holding one first, the line runs under the table's head while the head shows, and along the visible top edge once the head has scrolled out of view. A popover or a dialog keeps its own scroll while it refreshes, so a reader scrolled down a list stays where they were. Under reduced motion the line stays whole and pulses. In forced colours it is `Highlight`.
- A first load's failure is a danger `.cp-notice` with `circle-x`, since there is nothing to show. A refresh's failure is a warning `.cp-notice` with `triangle-alert`, since the content it keeps is still true as of its time. Each holds its sentence, the remedy line when there is one, and a small Retry that runs the same load through [confirm](../buttons/confirm.md)'s busy cycle. A later failure rewrites the same notice, and a load that renders removes it. The failure is said politely through [announce](announce.md), as a failure of background work is. The content's arrival is the app's to say in `render`, such as "12 results".
- Focus: when a load fails while focus is in the region, lost to the page, or on the button that opens a popover region, Retry takes it. When content replaces the Retry that held focus, focus goes to the content's first heading, else to the button `load` was given, else to the region. A refresh pressed from a button outside the region leaves focus on that button.
- The module writes no `style` attribute in markup. The line's place, under a table's head or at the top of a scrolled region, is a custom property set through the CSSOM.
- The module does nothing when it is imported.
