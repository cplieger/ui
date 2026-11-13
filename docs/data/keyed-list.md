# keyed-list

`@cplieger/ui/keyed-list`

A list whose rows are keyed. The app gives the rows' keys in order and makes each row once; on a live update it gives the keys again, and each drawn row keeps its element, so the app patches only the rows that changed. A reorder moves the other rows around the focused one, and the row at the top of the view stays where it was. A long list, such as tens of thousands of titles, draws only the rows in view, and a page the server has not sent yet shows as skeleton rows. It serves a `.cp-list` and the body of a `.cp-table` alike, and the app renders and patches every row itself.

```html
<span id="title-count"></span>
<ul class="cp-list" id="titles" data-virtual aria-label="Titles"></ul>
```

```ts
import { enhanceKeyedList } from "@cplieger/ui/keyed-list";

const titles = enhanceKeyedList(list, {
  keys: page.ids, // undefined where a page has not come yet
  of: page.total,
  count: document.getElementById("title-count"),
  row: (id) => renderTitle(store.get(id)),
  need: (start, end) => server.titles(start, end).then(() => titles.update(store.ids())),
  signal: page.signal,
});

events.on("title", (t) => {
  const row = titles.rowOf(t.id);
  if (row !== undefined) patchTitle(row, t); // only this row changes
  titles.update(store.ids());
});
search.addEventListener("input", () => titles.reset(store.matching(search.value), store.total));

// A short list, such as a conversation list, keeps every row drawn.
const conversations = enhanceKeyedList(list, { keys, row, window: false });
```

## The parts

- `.cp-list[data-virtual]` is a long list's own scroller, `--cp-list-h` tall (22rem by default). Its rows stay in flow, at the height the list's `data-density` gives them, between `li[data-part="spacer"]` items that stand for the rows out of view. A list that scrolls with the page, or inside a panel, needs no attribute.
- A table body windows the same way, with `tr[data-part="spacer"]` rows of one cell across the columns. `tbody[data-virtual]` holds the columns at the widths its head gives them, so they do not move as rows come into view and leave it.
- A row not loaded yet is a skeleton: an `li` holding a `.cp-list-row[data-skeleton]`, or a `tr[data-skeleton]` with one `.cp-skeleton` per column, hidden from a screen reader, and the list carries `aria-busy="true"` while one shows.

## API

- `enhanceKeyedList(container, opts)` takes a `ul.cp-list` or `ol.cp-list` of `li` rows, or the `tbody` of a `.cp-table`, and returns a `KeyedList`. The module owns the container's children from then on, but a `.cp-list-foot`, which stays last.
- `KeyedListOptions` = `{ keys, row, window?, need?, of?, count?, words?, overscan?, settle?, signal? }`.
  - `keys` are the rows' keys in order, each once, with `undefined` for a row not loaded yet. Its length is the list's. A key given twice throws a `TypeError`.
  - `row(key, index)` makes the row for `key`: an `li` in a list, a `tr` in a table body, else it throws a `TypeError`. It is called when the row is first drawn, and the module keeps the element while the row is drawn. A row that leaves the view is dropped, and made again from the app's current data when it comes back.
  - `window` draws only the rows in view and `overscan` each side, by default true. False draws every row, for a list short enough to draw whole that still needs its rows keyed. A list with `data-layout="grid"` is drawn whole, since its tiles share a line.
  - `need(start, end)` asks for the drawn rows from `start` to `end` (not including `end`) whose keys are `undefined`, once for each new span. The module never fetches: the app answers with `update()`.
  - `of` is every row before any filter, for the count, by default the keys' length.
  - `count` is the element the count is written in. With none, nothing is written or said.
  - `words` = `{ count? }`. `count(n, of)` gives the count's words, by default "5 of 640 titles".
  - `overscan` is how many rows are drawn past each edge of the view, by default 5.
  - `settle` is how long, in ms, a new set's count stays the same before it is said, by default 500.
  - `signal` removes the listeners and the observer. The drawn rows stay.
- `KeyedList` = `{ update(keys, of?), reset(keys, of?), rowOf(key), reveal(key, opts?), length }`.
  - `update(keys, of?)` is a live change: the keys in their new order. A drawn row keeps its element and its attributes, so the only changes to the page are the app's own patches and the rows that move, come or go. The count is written but not said.
  - `reset(keys, of?)` is a new set of rows, such as after a filter or a search: the view goes back to the list's start, and the count is written and said once it settles.
  - `rowOf(key)` is the drawn row of `key`, where the app patches a live change, or `undefined` when it is not drawn.
  - `reveal(key, opts?)` draws `key`'s row at its place, scrolls it into view, and returns it, or `undefined` for a key not in the list. `opts` = `{ scroll? }`: `scroll: false` draws the row without scrolling, as a held change needs (below). A row drawn out of view stays drawn while it has focus, and leaves at the next draw otherwise.
  - `length` is the number of rows, drawn or not.

## Behaviour

- The rows in view are the ones that meet what the reader sees of the list: the window, less what a pinch zoom or the on-screen keyboard hides, cut by every box around the list that clips, and by the list itself when it scrolls. The rows' pitch is measured from the drawn rows, and again when a row or the list changes size, so a compact, regular or tall list, a table's rows and a change of pointer all keep the spacers right.
- Rows stay in flow and in order, so the reading order and the Tab order are the list's order, and a table keeps its columns. A windowed `li` carries `aria-setsize` and `aria-posinset`, and a windowed `tr` its `aria-rowindex` with the table's `aria-rowcount`, so a screen reader hears "41 of 20,000". The module adds no listener, tab stop or role to a row, so a row whose one interactive part is its title link keeps it as its only stop.
- The focused row stays drawn wherever the list scrolls, at its place between the spacers. A reorder moves the other rows around it and never the focused row itself, since putting a node back in the page drops its focus. When the focused row's key leaves the list, focus moves to the row now at its place, or the last row, the way a [held list](held-list.md)'s Show lands on a row: its first part that takes focus, else the row itself. With no row left it goes to the list.
- On `update()` the row at the top of the view stays where it was, so rows that arrive or leave above it move nothing the reader sees. Of the rows in view, the one kept is the first that moved as most of them did, so a row that itself moved to the top is passed over. At the list's start nothing is kept, so a row put first shows. The browser's own scroll anchoring is off for each of the module's writes, so the two never add up.
- The module does nothing when it is imported.

## With a held list

A list that both holds its place and keeps its rows keyed, such as a library, makes the keyed list's `update()` the held change, and returns the changed row so Show can focus it:

```ts
held.change(() => {
  library.update(store.ids());
  const row = library.reveal(changed.id, { scroll: false });
  return row === undefined ? [] : [row];
}, 1);
```

The change runs at once when the reader is not in the list, so it must not scroll: `reveal()` with `scroll: false` draws the row at its place, wherever the view is, and the page stays still until the reader's Show focuses the row. A list drawn whole (`window: false`) can return `library.rowOf(changed.id)` instead, since every row is drawn.
