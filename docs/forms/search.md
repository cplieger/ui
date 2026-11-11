# search

`@cplieger/ui/search`

A search field with the glass at its start and a clear button at its end, which shows only while the field holds text. The stylesheet draws both marks.

```html
<div class="cp-search">
  <input class="cp-input" type="search" placeholder="Search titles…" aria-label="Search titles">
  <button class="cp-button" data-variant="quiet" type="button" aria-label="Clear search" data-cp-tip="Clear search" data-cp-tip="Clear search"></button>
</div>
```

```ts
import { enhanceSearch } from "@cplieger/ui/search";

enhanceSearch(search, { signal: page.signal });
```

- The field needs a placeholder, which is how the stylesheet tells that it is empty. While it is empty, the clear button is hidden, so it is neither reached by Tab nor heard. Name the clear button and give it the same tip, such as "Clear search".
- A press of the clear button empties the field, fires `input` on it as typing would, and gives focus back to it.
- A `.cp-loader` or `.cp-inline-load` placed in the `.cp-search` stands in for the glass while results load.
- `signal` removes the listener.
