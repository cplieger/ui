# ranked-bars

`@cplieger/ui/ranked-bars`

A bar beside each number in a table column, sized against the column's largest. It suits a table ranked by count, such as who posts and reads, or which threads are busiest. The numbers stay exact and the names stay whole, and the bars show the ranking at a glance.

```html
<table class="cp-table" id="posters">
  <caption>Who posts and reads</caption>
  <thead><tr><th scope="col">Member</th><th scope="col" data-bar="posts">Sent</th><th scope="col" data-bar="posts">Read</th></tr></thead>
  <tbody>
    <tr><th scope="row"><a href="/members/ada">@ada</a></th><td data-bar="posts"><data value="148">148</data></td><td data-bar="posts"><data value="96">96</data></td></tr>
    <tr><th scope="row"><a href="/members/grace">@grace</a></th><td data-bar="posts"><data value="61">61</data></td><td data-bar="posts"><data value="133">133</data></td></tr>
  </tbody>
</table>
```

```ts
import { enhanceRankedBars } from "@cplieger/ui/ranked-bars";

enhanceRankedBars(posters);
```

- Each body cell marked `data-bar` holds its count as a `<data value>`, so nothing parses the shown text. Its bar is sized against the largest value in its column. Cells that share a `data-bar` name, such as sent and read posts, share one largest value, so their bars compare across the columns. In a table with spanning cells, name each column's cells with `data-bar`, since an unnamed cell is grouped by its place in its row.
- The bar sits after the number, 6rem wide, and every bar in the column starts at one line, so their lengths compare. The number ends against its bar, in tabular figures.
- A bar fills in the first [series colour](../design-colour.md#series-colours). A `data-series` or `data-tone` on the table, the row or the cell gives it that colour, such as a second slot for read posts.
- A value of 0 or less, or one that is not a finite number, such as `Infinity`, draws no fill and does not count as the largest. The smallest value above 0 still shows a 2px fill.
- The bars are not read. A reader hears the numbers, which are the table's. The bars follow every later change to the table's values and rows.
- Without the script, the table shows its numbers with no bars.
- `signal` removes the bars when it aborts.
