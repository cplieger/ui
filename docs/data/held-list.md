# held-list

`@cplieger/ui/held-list`

A list that holds its place. While the reader is in it, a change that would add rows or move them waits behind one line above the list, such as "3 newer rows · Show", so nothing moves under them. Show puts the rows in their places and moves focus to the first. The same module marks a row the app could not refresh, kept in muted ink beside the time it is from and the reason. It serves a `.cp-list` and the body of a `.cp-table` alike, and the app renders and changes every row itself.

```html
<ul class="cp-list" aria-label="Activity">
  <li>
    <div class="cp-list-row">
      <span class="cp-icon" data-cp-icon="download" aria-hidden="true"></span>
      <span class="cp-cell-stack">Frieren, Season 1<small>Grabbed <time datetime="2026-11-12T14:02:00Z">14:02</time></small></span>
    </div>
  </li>
  <li>
    <div class="cp-list-row" data-kept>
      <span class="cp-icon" data-cp-icon="radio-tower" aria-hidden="true"></span>
      <span class="cp-cell-stack">Sonarr's queue<small class="cp-kept">Kept from 03:00: Sonarr walk partial</small></span>
    </div>
  </li>
</ul>
```

```ts
import { enhanceHeldList, markKept } from "@cplieger/ui/held-list";

const log = enhanceHeldList(list, { signal: page.signal });
events.on("grab", (grab) => {
  log.change(() => {
    const item = renderRow(grab);
    list.prepend(item);
    return [item];
  });
});

// The Library is a table, and its words are its own.
const library = enhanceHeldList(tbody, {
  words: { count: (n) => (n === 1 ? "1 row changed" : `${String(n)} rows changed`) },
  signal: page.signal,
});
library.change(() => moveToSortedPlace(row), 1);

markKept(row, { from: walk.lastComplete, reason: "Sonarr walk partial" });
markKept(row, null); // fresh again
```

## The parts

- The offer line is a `div.cp-list-pending` the module puts before the list, or for a table body before its table's `.cp-panel`: a span with the count's words and a small plain Show button, which the count describes, so a screen reader hears "Show, 3 newer rows". It stays until Show or `discard()`.
- A kept row carries `data-kept`, in muted ink, and a `small.cp-kept` line in place of its second line, whose clock the stylesheet draws. In a table, every cell of a `tr[data-kept]` is muted. Markup the server writes takes the same attribute and line, without the script.

## API

- `enhanceHeldList(list, opts?)` takes a `ul.cp-list` or `ol.cp-list` of `li` rows, or the `tbody` of a `.cp-table`, and returns a `HeldList`. It adds nothing to the page until a change is held.
- `HeldListOptions` = `{ before?, words?, settle?, signal? }`.
  - `before` is the element the line goes before, by default the list, or for a table body its table's `.cp-panel`, else the table.
  - `words` = `{ count?, show? }`. `count(n)` gives the count's words, by default "1 newer row" and "3 newer rows". `show` is the button's word, by default "Show".
  - `settle` is how long, in ms, the count stays the same before it is said, by default 500.
  - `signal` drops what is held and removes the line and its listener. A change after it runs at once.
- `HeldList` = `{ change(apply, rows?), held, discard() }`.
  - `change(apply, rows?)` runs `apply` at once when the reader is not in the list and nothing is held. Otherwise it holds `apply` and adds `rows`, by default 1, to the count. `apply` adds or moves the rows, and may return the rows it placed so that Show focuses the first.
  - `held` is the number of rows held now.
  - `discard()` drops every held change and the line, such as before the app replaces the list whole. Focus on the line moves to the list.
- `markKept(row, kept, opts?)` marks an `li`, a `.cp-list-row` or a `tr` kept: `kept` = `{ from, reason }`, where `from` is a `Date` or ms since the epoch. Null marks it fresh again and shows the lines it hid. It throws a `TypeError` for an invalid date.
- `KeptOptions` = `{ words?, locale? }`. `words(time, reason)` gives the line, by default "Kept from 03:00: Sonarr walk partial". `locale` is a BCP 47 language tag for the time, by default the browser's.

## Behaviour

- The reader is in the list when, at the moment of the change, focus is inside it, the pointer is over it, or the view has scrolled past the list's start. The view is what the reader sees: the window, less what a pinch zoom or the on-screen keyboard hides, cut by every box around the list that clips. Each scroller's `scroll-padding-block-start` counts as covered, so a list under a sticky header is in once its start is under the header. A list that scrolls itself is in once it is scrolled. At the list's start, untouched, a change goes in at once, as a log with the newest first should.
- Once one change is held, every later one is held behind it, in order, so a change never runs before an earlier one it depends on. Leaving the list does not release them, because the Show button sits outside the list, and pointing at it would otherwise release the rows under the pointer.
- The line goes in without moving a row: the module scrolls the line's scroller by the line's height as it goes in, with the browser's own scroll anchoring off for that one write so the two never add up. The line does not glide in, since a growing line would push the list under the reader.
- The count's words are said politely through [announce](../feedback/announce.md) once they have stayed the same for `settle` ms, and never twice in a row, so a burst of changes is said once. The line is not a live region, because a region made in the same change that fills it is missed, and it holds a button.
- Show runs the held changes in order, removes the line and moves focus to the first row they returned, in the page's order. An item's row is its `.cp-list-row`. A row that takes no focus of its own takes `tabindex="-1"` until it loses focus. With no row returned, focus goes to the list the same way, so it never drops to the page.
- A kept row's time is the time of day in the locale's words when it is today's, "03:00", and the date with the time on another day, "9 Nov 2026, 03:00". The lines it hides are the visible `small` and `.cp-meta` lines of the row's first `.cp-cell-stack`, such as a list row's facts or a table title's meta line. A row with none takes the line at its end, or in its first cell for a table row.
- The module does nothing when it is imported.
