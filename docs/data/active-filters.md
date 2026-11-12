# active-filters

`@cplieger/ui/active-filters`

The filters in force over a table or a list, as a row of chips that each end their filter, with Clear filters after them and the result count nearby. [Design patterns](../design-patterns.md) "Tables" says where the row sits, and [Components](../design-components.md) lists its classes.

## Markup

```html
<div class="cp-active-filters">
  <span class="cp-token" data-value="verdict=not-best"><span>Verdict: Not the best</span><button type="button"></button></span>
  <span class="cp-token" data-value="kind=tv"><span>Kind: TV</span><button type="button"></button></span>
  <button class="cp-button" data-variant="quiet" data-size="sm" type="button" data-filters-clear>
    <span class="cp-icon" data-cp-icon="funnel-x" aria-hidden="true"></span>Clear filters
  </button>
</div>
<p><strong id="results-count">140 of 412</strong></p>
```

- `.cp-active-filters` is a wrapping row with the space of `--cp-space-2` between its parts.
- Each filter is a `.cp-token`, the chip [tokens](../forms/tokens.md) draws, with the filter's key in `data-value`, its words in a `<span>` and an empty Remove `<button>` whose cross the stylesheet draws. A chip here does not pop in, since it arrives with the page's results, and it shrinks away when removed.
- The `data-filters-clear` button ends every filter.
- The count reads "140 of 412" while a filter is on and "412 titles" with none, in the words of the app.

## Script

```ts
import { enhanceActiveFilters } from "@cplieger/ui/active-filters";

const active = enhanceActiveFilters(row, {
  count: document.getElementById("results-count")!,
  onChange: (values) => {
    void load({ filters: values }).then((page) => {
      active.setCount(`${page.shown} of ${page.total}`);
    });
  },
  signal: page.signal,
});
```

- A press on a chip's Remove ends its filter, and focus moves to the next chip, or to Clear filters while a filter is left, or to `rest` once none is. `rest` is the count by default, which then takes `tabindex="-1"`. Clear filters ends them all and sends focus to `rest`.
- Clear filters shows only while a filter is on.
- `onChange(values)` runs after each press with the `data-value` of each filter left, in order. The app applies them, such as by writing the URL, and the row keeps no filters of its own.
- `setCount(text)` writes the count at once and announces it politely once it has stayed the same for `settle` ms, 500 by default, so removing three filters in a row is one announcement. A count that reads as the last one announced is not said again.
- `sync()` names the Remove buttons and shows or hides Clear filters after the app adds or replaces chips, and `values` reads the filters in force.
- A Remove button with an `aria-label` keeps it. Otherwise it is named "Remove Kind: TV", and `words.remove(filter)` gives that name in another language.
- `signal` removes the listeners and drops a count not yet announced.
