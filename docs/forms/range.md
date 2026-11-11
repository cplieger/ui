# range

`@cplieger/ui/range`

A slider in the accent, its track filled to the thumb, with its value at the end of its row and over the thumb while a pointer holds it or keys move it.

```html
<div class="cp-field">
  <label class="cp-label" for="seeders">Minimum seeders</label>
  <div class="cp-range-row">
    <input class="cp-range" id="seeders" type="range" min="0" max="50" value="12">
    <output for="seeders"></output>
  </div>
</div>
```

```ts
import { enhanceRange } from "@cplieger/ui/range";

enhanceRange(range, { output, format: (v) => `${v} seeders`, signal: page.signal });
```

- Each `input` sets the fill, writes `format(value)` into `output` and into the tip over the thumb. Without `format`, the value shows as it is.
- The tip shows while a pointer holds the thumb or the slider has keyboard focus, and follows the thumb, from the right in a right-to-left page.
- A `.cp-range` outside a `.cp-range-row`, such as a video's seek bar, takes the fill and no tip.
- `signal` removes the listeners and the tip.
