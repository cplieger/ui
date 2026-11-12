# table

`@cplieger/ui/table`

The parts of a `.cp-table` that need a script. `enhanceSort` runs sortable headers, `enhanceBatchBar` runs the `.cp-batchbar` that acts on the selected rows, and `enhanceRowDetail` opens the detail under a row that explains itself. [Design patterns](../design-patterns.md) "Tables" says how a table behaves, and [Components](../design-components.md) lists its classes.

## Markup

```html
<section class="cp-batchbar" aria-label="Selected entries" hidden>
  <span class="cp-batch-count"></span>
  <button class="cp-button" data-variant="quiet" data-size="sm" type="button" data-batch-every hidden>Select all</button>
  <button class="cp-button" data-size="sm" type="button" data-batch-clear>Clear</button>
  <button class="cp-button" data-variant="primary" data-size="sm" type="button" data-batch-action="Grab">
    <span class="cp-icon" data-cp-icon="download" aria-hidden="true"></span>
    <span class="cp-roll">Grab</span>
  </button>
</section>
<div class="cp-panel" data-flush>
  <table class="cp-table">
    <caption tabindex="-1">Library, 1 to 25 of 412 entries</caption>
    <thead>
      <tr>
        <th data-col="select"><label><input class="cp-checkbox" type="checkbox"></label></th>
        <th aria-sort="ascending"><button class="cp-sort" type="button">Title</button></th>
        <th data-col="num"><button class="cp-sort" type="button">Size</button></th>
        <th data-col="actions"><span class="cp-visually-hidden">Actions</span></th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td data-col="select"><label><input class="cp-checkbox" type="checkbox" aria-label="Select Mushishi"></label></td>
        <td>
          <div class="cp-title-cell">
            <span class="cp-cover" data-harmony="4" aria-hidden="true"><span class="cp-icon" data-cp-icon="tv"></span></span>
            <div class="cp-cell-stack"><a href="/series/mushishi">Mushishi</a><span class="cp-meta">TV, 2005, 26 episodes</span></div>
          </div>
        </td>
        <td data-col="num" data-sort="44.8">44.8 GB</td>
        <td data-col="actions">
          <div class="cp-toolbar">
            <button class="cp-button" data-size="sm" type="button" aria-label="Grab Mushishi">…</button>
            <button class="cp-button" data-variant="quiet" data-size="sm" type="button" popovertarget="row-menu" aria-label="More for Mushishi">…</button>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

- A sortable header is a `<th>` holding a `<button class="cp-sort">` with the column's name. The stylesheet draws its arrow, shown on the column whose `<th>` carries `aria-sort`.
- `.cp-title-cell` puts a `.cp-cover` beside the title and its line, 36px wide so it fills the row less 1px each side, its glyph at 16px. The cover's harmony colour, glyph and `<img>` are the cover's own, as [Components](../design-components.md) describes.
- A row's actions sit in a `.cp-toolbar`. Its worded action confirms in place with [confirm](../buttons/confirm.md), and its ⋯ buttons all open one `.cp-menu` through [menu](../overlays/menu.md).
- While the table loads, each cell holds a `.cp-skeleton`, timed by [skeleton](../feedback/skeleton.md).

## Sort

```ts
import { enhanceSort } from "@cplieger/ui/table";

enhanceSort(table, {
  onSort: (header, order) => navigate({ sort: header.dataset.key, order }),
  signal: page.signal,
});
```

- Each `.cp-sort` button is named by the order its press applies, such as "Sort by Size, ascending". A press on an unsorted column sorts it ascending, and on the sorted one turns its order. `aria-sort` moves to the pressed header, and "Sorted by Size, ascending" is announced.
- Without `onSort`, the rows are reordered in the page and glide to their new places. A row sorts by its cell's `data-sort`, or else its text. Two numbers compare as numbers, numbers come before words, and words compare in the table's language, the `lang` of its nearest element that has one, numbers within them by value. A `data-part="detail"` row stays after the row before it. A sortable table nested in a cell sorts only its own rows.
- With `onSort`, the app orders the rows itself, such as by writing the sort into the URL and loading the page again.
- `words.sort(column, order)` and `words.sorted(column, order)` give the button's name and the announcement in another language.
- `signal` removes the listeners.

## Batch bar

```ts
import { enhanceSelectAll } from "@cplieger/ui/checkbox";
import { enhanceConfirm } from "@cplieger/ui/confirm";
import { enhanceBatchBar } from "@cplieger/ui/table";

const rows = () => table.querySelectorAll<HTMLInputElement>('tbody [data-col="select"] input');
enhanceSelectAll(all, rows, { signal: page.signal });
const bar = enhanceBatchBar(batchbar, { boxes: rows, all, total: () => results.total, signal: page.signal });
const grab = enhanceConfirm(grabButton, { busy: "Grabbing…", done: "Grabbed", onRest: bar.sync });
```

- The bar glides in once a row is selected and out once none is. `.cp-batch-count` reads "3 selected", and each `data-batch-action` button adds the count to its word, such as "Grab 3". A button whose confirm cycle runs keeps its words until `sync()`, so pass `bar.sync` as its `onRest`.
- Once the whole page is selected and `total()` is more than the page holds, the `data-batch-every` button offers "Select all 412 entries". Its press counts every matching row and moves focus to Clear. Changing a box ends it.
- Clear, and Escape while focus is in the bar or the boxes' table, clear the selection and return focus to the header box, or the first row's box without one. Escape is left alone while an automatic popover is open, which takes it to close, and when a handler has already prevented it.
- The header box is named "Select all 25 entries on this page".
- Each change to the count is announced politely, once per press, and "Selection cleared" once none is left.
- `onChange({ count, everything })` runs after each change, once for a press that changes many boxes, with the selection it ends on. The returned bar reads `count` and `everything`, `sync()` shows the boxes' state after code changes them, and `clear()` clears.
- `words` gives `count`, `cleared`, `every`, `page` and `action` in another language.
- `signal` removes the listeners.

## Row detail

```html
<table class="cp-table">
  <thead>
    <tr>
      <th data-col="expand"><span class="cp-visually-hidden">Why this rank</span></th>
      <th>Release</th>
      <th data-col="num">Rank</th>
      <th data-col="actions"><span class="cp-visually-hidden">Actions</span></th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td data-col="expand">
        <button class="cp-button" data-variant="quiet" data-size="sm" type="button" aria-expanded="false" aria-controls="why-arid" aria-label="Why Arid's release ranks first">
          <span class="cp-icon" data-cp-icon="chevron-right" aria-hidden="true"></span>
        </button>
      </td>
      <td><div class="cp-cell-stack"><strong>[Arid] Frieren S01E04</strong><span class="cp-meta">English, ASS</span></div></td>
      <td data-col="num">1st</td>
      <td data-col="actions">
        <button class="cp-button" data-size="sm" type="button" aria-label="Download [Arid] Frieren S01E04">
          <span class="cp-icon" data-cp-icon="download" aria-hidden="true"></span>
          <span class="cp-icon" data-cp-icon="spinner-arc" data-part="busy" aria-hidden="true"></span>
          <span class="cp-roll">Download</span>
        </button>
      </td>
    </tr>
    <tr id="why-arid" data-part="detail" hidden>
      <td colspan="4">
        <div>
          <dl class="cp-facts" data-variant="compare">
            <dt>Episode</dt>
            <dd><span class="cp-state" data-tone="success"><span class="cp-icon" data-cp-icon="check" aria-hidden="true"></span>Same</span><small>S01E04 in both</small></dd>
            <dt>Release group</dt>
            <dd><span class="cp-state" data-tone="warning"><span class="cp-icon" data-cp-icon="triangle-alert" aria-hidden="true"></span>Differs</span><small>Arid's video, a fansub's subtitles</small></dd>
          </dl>
        </div>
      </td>
    </tr>
  </tbody>
</table>
```

```ts
import { enhanceRowDetail } from "@cplieger/ui/table";

enhanceRowDetail(table, { signal: page.signal });
```

- A row that explains itself has a first column, `data-col="expand"`, holding a quiet small button with the chevron. Its `aria-controls` names the `<tr data-part="detail">` that follows the row, and its name says what opens, such as "Why Arid's release ranks first". The chevron turns to point down while `aria-expanded` is `"true"`.
- The detail row has one cell across the table, holding one element, which takes the detail's padding and starts in line with the row's first data column. The row takes that element's height rather than the table's row height. What it explains is often a `.cp-facts` list with `data-variant="compare"`: each fact's label, a `.cp-state` word with its glyph, and a note.
- A press turns `aria-expanded` and glides the element open or shut, its padding with its height, as every disclosure glides. The row is hidden once shut. A press during a glide turns back from where it is. Each row starts as its button's `aria-expanded` says.
- [Sort](#sort) keeps a detail row after its row.
- `signal` removes the listener and ends a glide at its end.

## Outcome

```html
<td data-col="actions">
  <span class="cp-outcome">
    <a href="/releases/arid-04"><span class="cp-icon" data-cp-icon="circle-check" aria-hidden="true"></span>Downloaded · Pinned</a>
  </span>
</td>
```

- A row action whose result is worth keeping in view, such as a download, runs through [confirm](../buttons/confirm.md) with `done: false`, then the app replaces the cell's content with a `.cp-outcome`: a link to the result, in the success tone, or a `.cp-field-error` with the reason and a Retry button that runs the same cycle.
- Focus moves to the outcome's link or Retry, and the app says the result with [announce](../feedback/announce.md), assertively for an error.
