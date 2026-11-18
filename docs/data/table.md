# table

`@cplieger/ui/table`

The parts of a `.cp-table` that need a script. `enhanceSort` runs sortable headers, `enhanceBatchBar` runs the `.cp-batchbar` that acts on the selected rows, `enhanceRowDetail` opens the detail under a row that explains itself, and `skeletonRow` gives the row that stands for one while the table loads. [Design patterns](../design-patterns.md) "Tables" says how a table behaves, and [Components](../design-components.md) lists its classes.

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
<h2 id="library-h" tabindex="-1">Library</h2>
<div class="cp-panel" data-flush role="region" tabindex="0" aria-labelledby="library-h">
  <table class="cp-table" aria-labelledby="library-h">
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

- A table holds no `<caption>`: a heading outside it names it, through `aria-labelledby` on the table, and its range, such as "1 to 25 of 412", is the [pager](../design-patterns.md)'s. The flush `.cp-panel` that scrolls a table wider than it is a region named by the same heading, with `role="region"`, `aria-labelledby` and `tabindex="0"`, so a keyboard reaches the columns past its edge in every browser.
- A sortable header is a `<th>` holding a `<button class="cp-sort">` with the column's name. The stylesheet draws its arrow, shown on the column whose `<th>` carries `aria-sort`.
- Each cell sits in the middle of its row's height, so a one-line cell centres beside a title and its line. A `data-col="num"` column, and a [ranked-bars](ranked-bars.md) column, hugs its widest cell as the actions column does, ends its values and header together and never breaks a value from its unit, and the text columns take the table's leftover width. A `<time>` in a cell stays on one line.
- `.cp-title-cell` puts a `.cp-cover` beside the title and its line, 2rem wide (`--cp-cover-row-w`) and 6px (`--cp-cover-inset`) from the row's top and bottom edges, its glyph at 16px. The two lengths are the shared cover tokens a list row's cover reads too. The cover's harmony colour, glyph and `<img>` are the cover's own, as [Components](../design-components.md) describes.
- A title cell's title and its line keep one line each, cut with an ellipsis, so every row is one height known before its data comes. Once the table is under 44rem wide the title gets two lines, and a short title leaves its second line empty. The full title stays in the link's name and on the page it opens.
- Under 44rem the title cell is the column that narrows, so the table fits its panel, and a row's worded action keeps only its icon. Its `aria-label` names it, such as "Grab Mushishi", so give it the same words in `data-cp-tip`, as every icon-only control has.
- A row's actions sit in a `.cp-toolbar`. Its worded action confirms in place with [confirm](../buttons/confirm.md), and its ⋯ buttons all open one `.cp-menu` through [menu](../overlays/menu.md).
## Loading

```ts
import { skeletonTiming } from "@cplieger/ui/skeleton";
import { skeletonRow } from "@cplieger/ui/table";

const bones = skeletonRow(table);
const t = skeletonTiming(() => body.replaceChildren(...rows.map(() => bones.cloneNode(true))));
```

- `skeletonRow(table)` returns a `<tr data-skeleton aria-hidden="true">` in a loaded row's shape, to clone once per row: a title cell holds a cover-sized bone and a line of bars per line, a `.cp-cell-stack` two bars, and any other cell one. Each cell takes its head cell's `data-col` and `data-priority`, so the same columns step aside. Loading and loaded rows are then one height and the table keeps its size when the data comes. [skeleton](../feedback/skeleton.md) times it.
- The table's first loaded body row gives the shapes. Before any row has loaded, `data-row` on the table names them: `data-row="media"` gives the first column without a `data-col` a title cell with a cover, and a length, such as `data-row="4rem"`, makes every cell that tall.

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

A row action whose result is worth keeping in view, such as a download, settles into a `.cp-outcome` in its cell: a link to the result, in the success tone, or its failed `.cp-state` beside Retry. [outcome](../feedback/outcome.md) runs it.
