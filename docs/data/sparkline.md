# sparkline

`@cplieger/ui/sparkline`

A series of numbers over a range, such as six hours of a gauge sampled each minute, as a line the size of a word. A dot marks the last value, which is written beside it. There is no axis. The line shows the shape of the change, and the number says how much.

```html
<p>Live agents <span class="cp-sparkline" data-series="1" id="live"></span></p>
```

```ts
import { renderSparkline } from "@cplieger/ui/sparkline";

renderSparkline(live, samples, { range: "Last 6 hours" });
```

- `values` are evenly spaced over the range, oldest first. A `null`, or a number that is not finite, is a gap in the line, such as the minutes before a restart. A value between two gaps is drawn as a dot.
- The line spans the plot from the values' own low at the bottom to their own high at the top, with no zero. Sparklines compared in a row share a `domain`, such as `[0, 12]`, and a value outside it is drawn at its edge. A domain that is not a finite low to high throws a `RangeError`.
- The line is 2px in its [series colour](../design-colour.md#series-colours), slot 1 unless `data-series` names another, and the plot is 6rem by 20px. It runs left to right in every language, as time does on a chart.
- The sparkline is an image named by its summary, which gives the range, the last value, the low and the high, such as `Last 6 hours: last 10, low 4, high 12`. With no `range` it reads `Last 10, low 4, high 12`. With every value a gap it reads `Last 6 hours: no data`, with no line and no value. The last value is the last one that is not a gap.
- Numbers are written in the language of the page around the sparkline. `format` writes them another way, such as ``(n) => `${n}\u00A0ms` ``, for both the value beside the line and the summary.
- `last: false` leaves the value unwritten beside the line, for a figure whose number already says it. The summary still says it.
- `words` gives other words: `summary` takes the range and the three values as written, and `empty` takes the range.
- Each call replaces what the last one drew, so a page draws again when a sample comes in. Nothing moves when it does.
