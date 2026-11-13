# held-list

`@cplieger/ui/held-list`

A list that holds its place. While the reader is in it, a change that would add rows or move them waits behind one line above the list, such as "3 newer rows · Show", so nothing moves under them. Show puts the rows in their places and moves focus to the first. A list whose new rows go at its end, a log oldest first, lets them in at once, since they land below the reader, and counts those the reader has not seen on the same line, pinned under the list, whose Show goes to the newest. A row the app could not refresh is marked kept by `markKept()` in [list-row](list-row.md). It serves a `.cp-list` and the body of a `.cp-table` alike, and the app renders and changes every row itself.

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
import { enhanceHeldList } from "@cplieger/ui/held-list";
import { markKept } from "@cplieger/ui/list-row";

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

// A pass's steps, oldest first: each goes in at once, and those below the
// reader are counted. Following the end, the app scrolls there itself.
const steps = enhanceHeldList(ol, { edge: "end", signal: page.signal });
steps.change(() => {
  const following = atEnd(box);
  const item = renderStep(step);
  ol.append(item);
  if (following) box.scrollTop = box.scrollHeight;
  return [item];
});

markKept(row, { from: walk.lastComplete, reason: "Sonarr walk partial" });
markKept(row, null); // fresh again
```

## The parts

- The offer line is a `div.cp-list-pending` the module puts before the list, or for a table body before its table's `.cp-panel`: a span with the count's words and a small plain Show button, which the count describes, so a screen reader hears "Show, 3 newer rows". It stays until Show or `discard()`. At the end edge it goes after the list, as `div.cp-list-pending[data-edge="end"]`, pinned to its scroller's end.
- A host with its own offer, such as a conversation's New messages button, passes it as `jump`: the module keeps it `hidden` while nothing waits and writes the count's words in its `.cp-roll`, which rolls as the count grows, else as its whole text. No line is made.
- A kept row carries `data-kept`, in muted ink, and a `small.cp-kept` line in place of its second line, whose clock the stylesheet draws ([list-row](list-row.md)). In a table, every cell of a `tr[data-kept]` is muted. Markup the server writes takes the same attribute and line, without the script.

## API

- `enhanceHeldList(list, opts?)` takes a `ul.cp-list` or `ol.cp-list` of `li` rows, or the `tbody` of a `.cp-table`, and returns a `HeldList`. It adds nothing to the page until a change is held.
- `HeldListOptions` = `{ edge?, beside?, jump?, words?, settle?, signal? }`.
  - `edge` is where the list's new rows go: `"start"`, by default, for a list newest first, or `"end"` for one oldest first.
  - `beside` is the element the line goes before at the start edge, and after at the end, by default the list, or for a table body its table's `.cp-panel`, else the table.
  - `jump` is the host's own button for the offer, in place of the line.
  - `words` = `{ count?, show? }`. `count(n)` gives the count's words, by default "1 newer row" and "3 newer rows". `show` is the button's word, by default "Show".
  - `settle` is how long, in ms, the count stays the same before it is said, by default 500.
  - `signal` drops what is held or counted, removes the line, hides the jump, and removes the listeners and every `tabindex` the module gave. Focus on the offer moves as Show's would. A change after it runs at once and is not counted.
- `HeldList` = `{ change(apply, rows?), held, discard() }`.
  - `change(apply, rows?)` at the start edge runs `apply` at once when the reader is not in the list and nothing is held. Otherwise it holds `apply` and adds `rows`, by default 1, to the count. `apply` adds or moves the rows, and may return the rows it placed so that Show focuses the first. At the end edge it runs `apply` at once, and adds `rows` to the count when the last row `apply` returned, else the list's last row, ends below what the reader sees.
  - `held` is the number of rows held now, or at the end edge counted and not yet seen.
  - `discard()` drops every held or counted change and the offer, such as before the app replaces the list whole. Focus on the offer moves to the list, or at the end edge to the newest row.

## Behaviour

- The reader is in the list when, at the moment of the change, focus is inside it, the pointer is over it, or the view has scrolled past the list's start. The view is what the reader sees: the window, less what a pinch zoom or the on-screen keyboard hides, cut by every box around the list that clips. Each scroller's `scroll-padding-block-start` counts as covered, so a list under a sticky header is in once its start is under the header. A list that scrolls itself is in once it is scrolled. At the list's start, untouched, a change goes in at once, as a log with the newest first should.
- Once one change is held, every later one is held behind it, in order, so a change never runs before an earlier one it depends on. Leaving the list does not release them, because the Show button sits outside the list, and pointing at it would otherwise release the rows under the pointer.
- The line goes in without moving a row: the module scrolls the line's scroller by the line's height as it goes in, with the browser's own scroll anchoring off for that one write so the two never add up. The line does not glide in, since a growing line would push the list under the reader.
- The count's words are said politely through [announce](../feedback/announce.md) once they have stayed the same for `settle` ms, and never twice in a row, so a burst of changes is said once. The line is not a live region, because a region made in the same change that fills it is missed, and it holds a button.
- Show runs the held changes in order, removes the line and moves focus to the first row they returned, in the page's order. An item's row is its `.cp-list-row`. A row that takes no focus of its own takes `tabindex="-1"` until it loses focus. With no row returned, focus goes to the list the same way, so it never drops to the page.
- At the end edge nothing waits, since a row that goes in below the reader moves nothing they see. A row is below the reader when its end, plus its `scroll-margin-block-end`, is past the end of what a box around it that scrolls, or the window, shows, and that scroller can still scroll toward it. A scroller's `scroll-padding-block-end` counts as covered, as by a bar fixed at the window's foot, and the line is pinned above it. A host whose pinned foot covers the scroller's end gives its rows that margin, as a feed's entries have. A host that follows the end scrolls there itself inside `apply`, and a row it scrolls into view is not counted.
- At the end edge the newest counted row is the last one `apply` returned, in the page's order. Show scrolls it into view at the view's end, smoothly unless the person asked for less motion, and moves focus to it without a second scroll. A row that arrives during that scroll is followed, not counted, until the reader takes the scroll over. The count goes once the reader sees the newest row, by scrolling or as the view grows, and focus on the offer moves to it, so it never drops to the page.
- The module does nothing when it is imported.
