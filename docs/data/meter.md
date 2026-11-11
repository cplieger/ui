# meter

`@cplieger/ui/meter`

A value against its ceiling, such as a store's use against its size, as a native `<meter>` drawn as a bar. The bar is marked at the meter's `low` and `high`, such as 80% and 90%, and the value is written in words under it. Several meters can share one bar, such as a language's subtitles done out of the episodes wanted, one segment per meter.

```html
<div class="cp-meter">
  <label data-part="label" for="store">Store used</label>
  <div data-part="bar">
    <meter id="store" min="0" max="500" low="400" high="450" optimum="0" value="420" aria-describedby="store-words">420 GB of 500 GB</meter>
  </div>
  <small data-part="words" id="store-words">420 GB of 500 GB, past the 80% mark</small>
</div>
```

```ts
import { enhanceMeter } from "@cplieger/ui/meter";

enhanceMeter(store);
```

- The page names each meter, by a `<label>` or an `aria-label`, and writes its value in `[data-part="words"]`, linked to it by `aria-describedby`. The words say what the bar shows, such as which mark the value has passed. The marks are not read.
- `low`, `high` and `optimum` are the native meter's. With `optimum` under `low`, as for a store, a value under `low` is fine, one from `low` to `high` is in the warning tone, and one past `high` in the danger tone. With `optimum` over `high`, as for a battery, a value over `high` is fine, one from `high` down to `low` is in the warning tone, and one under `low` in the danger tone. With `optimum` between them, a value outside them is in the warning tone. These are the regions HTML's [meter algorithm](https://html.spec.whatwg.org/multipage/form-elements.html#the-meter-element) gives. The script sets the tone, so a value at a mark takes the tone past it in every browser.
- Past its optimum the meter draws the tone's glyph before the words, so the level is never colour alone. The `.cp-meter` takes its worst meter's level as `data-cp-level`: `"optimum"`, `"suboptimum"` or `"even-less-good"`.
- At its optimum a meter fills in the accent. A `data-series` or `data-tone` on the `.cp-meter` or on one `<meter>` gives it that colour, such as one [series colour](../design-colour.md#series-colours) per language.
- Meters in one bar share it by their ranges, `max` less `min`, with a 2px gap between them. A mark sits at each `low` and `high` inside its meter, written as a share of that meter in the page's language, such as `80 %` in French.
- The bar is 8px tall and follows every later change to a meter's value or bounds, and to the meters in it. Nothing moves on its own.
- Without the script, the bar still shows each value, its meters at one width and in one colour, with no marks and no tones.
- `signal` removes the marks and the levels when it aborts.
