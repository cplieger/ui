# chart

`@cplieger/ui/chart`

Charts with axes: stacked bars per time bucket, a histogram on the duration ladder, a timeline strip of who acts when, and lines, plain or in steps. Each chart has a summary in words, a legend row that carries the values of what is selected, keys that read each point aloud, and a table view of the same data.

Install the announcer once at startup, beside the chart's first use. The keys speak through [announce](../feedback/announce.md), which says nothing without it.

```html
<figure class="cp-chart" id="posts-chart">
  <figcaption>Posts by thread kind</figcaption>
  <div class="cp-toolbar">
    <button class="cp-filter-chip" type="button" aria-pressed="false" hidden><span class="cp-icon" data-cp-icon="check" aria-hidden="true"></span>Table view</button>
  </div>
</figure>
```

```ts
import { installAnnouncer } from "@cplieger/ui/announce";
import { renderChart } from "@cplieger/ui/chart";

installAnnouncer({ signal: page.signal }); // at startup

const toggle = figure.querySelector<HTMLButtonElement>(".cp-filter-chip")!;
const posts = renderChart(figure, null, { signal: page.signal, toggle }); // loading

const data = await loadPosts(range);
posts.update({
  x: { type: "time", domain: [range.start, range.end] },
  y: { label: "Posts", unit: { one: "post", other: "posts" } },
  marks: [
    {
      mark: "rect",
      x1: data.starts, // ms since the epoch, ascending
      x2: data.ends,
      open: true, // the last bucket is still filling
      series: [
        { name: "Announce", slot: 1, y: data.announce },
        { name: "Path", slot: 2, y: data.path },
      ],
    },
  ],
  empty: "No posts in this range.",
});
```

- `renderChart(figure, spec, options)` builds the chart inside the app's `<figure class="cp-chart">` and returns its handle. The figure needs its `<figcaption>`, whose words are the chart's title, or the call throws a `TypeError`.
- The chart wraps the caption's words in a `data-part="title"` span and adds a `data-part="summary"` paragraph beside it, and names the figure by the one and describes it by the other. Change the title through `figure.querySelector('[data-part="title"]')`, never by rewriting the caption: setting its `textContent` deletes both and leaves the figure unnamed.
- A second `renderChart` on a figure that holds a live chart throws an `InvalidStateError`, where [sparkline](sparkline.md)'s `renderSparkline` and `renderMarkdown` draw again on each call. Those hold nothing between calls, while a chart holds listeners, a lifecycle and a selection, so its data changes through `update`. A figure whose chart was torn down by its signal can be rendered again.
- Nothing shows in the figure but its caption until the script runs, since a chart's data are numbers the app fetches.

## Marks

| Mark | Draws | Use it for |
| --- | --- | --- |
| `rect` | a bar from `x1` to `x2` and from 0 to `y`, stacked in series order when it has several series | counts per time bucket, or a histogram's bins on a log x |
| `line` | a 2px path per series through `(x, y)`, `curve: "linear"` (the default) or `"step"`, which holds each value until the next sample | a gauge sampled each minute, in steps |
| `dot` | a 6px dot per value, one row per named row on a band y | who posts when, one row per agent |
| `rule` | a 2px line across the plot at one `x` or one `y`, with its label and value | a median, a percentile, a threshold |

- Marks draw in the order given, so a rule after a rect draws over it.
- Values are columns that share one x, sorted ascending: a line's `x` and a rect's `x1` strictly increase, and a dot row's `x` may repeat, since two posts can share a millisecond.
- `null` or `NaN` in a `y` is a gap. A line breaks there, even across one missed sample at the widest range, a rect draws nothing, a stack counts it as 0 for the segments above, and the table writes "No data".
- A stack's first series sits on the baseline, so put the series compared most first. Neighbouring bars stand 1px apart and stacked segments 1px apart, and a bucket too narrow for a 1px gap and 1px of bar draws touching.
- `open: true` marks a rect's last bucket as still filling: its readings and its table row add "so far", and the summary's busiest bucket leaves it out.
- A rule's `x` or `y` is a finite number. Send no rule when the value is unknown, such as a median with no reads yet.
- Dots keep their glyph when posts crowd: one pixel column's posts draw once, so an agent that posts more often than a dot is wide draws a run, which reads as continuous activity. The legend row, the keys and the table give each post and each count.
- The chart computes nothing statistical: the app sends the bins, the counts and the percentiles it draws.

## Scales and axes

| `type` | For | Domain when the spec gives none |
| --- | --- | --- |
| `linear` | counts and amounts, the default | the data's extent with zero, extended to a round tick |
| `log` | values over several orders of magnitude, such as seconds to days | the smallest positive value to the largest |
| `time` | instants, in milliseconds since the epoch | the data's extent |
| `band` | named rows, the y of a `dot` mark | the rows in the order given |

- A time axis says `type: "time"`, since a number cannot say it is an instant. A log axis is never inferred.
- A passed `domain` fixes the scale, so charts that sit together compare on one scale. Marks are cut at its ends: a bucket that crosses an end is drawn to the edge and keeps its full interval and value in its readings and its table row, and anything wholly outside is left out.
- A linear y under a `rect` always includes 0, since a bar's length is its value. A chart of lines alone may set `zero: false`.
- Ticks follow the chart's own width, about 80px apart on x and 40px apart on y, so a chart in a narrow panel gets fewer. Labels are never rotated: a label that would come within 8px of the last is dropped, and a time or linear axis moves to a coarser step before dropping more than every other one.
- Time ticks fall on the hours and days of the page's time zone, or of `timeZone`, so a day across a clock change has 23 or 25 hourly ticks. Their labels have two lines, the time and, where the day changes, the date, each in the locale's own order and hour cycle.
- `label` is the axis title. A y title sits above the axis. A time x has none, since its ticks say what it is.
- `unit` is the plural noun of a scale's values, such as `{ one: "post", other: "posts" }`, chosen through `Intl.PluralRules`. On a band y it names the rows, such as agents.
- A band y with `mono: true` writes its names in the mono face, for machine names. A long name is cut with an ellipsis, and the legend row and the table hold it whole.
- `x.reverse` runs x from right to left and moves the y gutter to the right. Otherwise the plot runs left to right in every script, as time does on a chart, while the caption, the legend row, the summary and the table follow the page's direction.

## Formats

`format` on a scale says how its values are written, in the chart's locale, on the axis, in the legend row, the summary and the table:

- `"number"`, the default: `Intl.NumberFormat`'s own, up to three fraction digits.
- `"integer"`: rounded to a whole number.
- `"percent"`: a proportion from 0 to 1, so 0.42 writes "42%".
- `"duration"`: milliseconds, as "1 min, 27 sec", "18 min" or "400 ms". Under 10 of its largest unit a value keeps the next unit too, and from 10 up it keeps the largest alone. A log axis in durations ticks at 1 sec, 10 sec, 1 min, 10 min, 1 hr, 6 hr, 1 day and 3 days, then at each edge of the ladder above.
- An `Intl.NumberFormatOptions` object, passed to `Intl.NumberFormat` as it is, or a function of the value, whose string is used as it is.

## A histogram of waits

```ts
import { durationEdges } from "@cplieger/ui/chart";

const edges = durationEdges(Math.max(retentionMs, longestDelayMs));
reads.update({
  x: { type: "log", format: "duration", label: "Time from post to read", domain: [1_000, edges.at(-1)!] },
  y: { label: "Reads", unit: { one: "read", other: "reads" } },
  marks: [
    { mark: "rect", x1: edges.slice(0, -1), x2: edges.slice(1), series: [{ name: "Reads", y: counts }] },
    { mark: "rule", x: medianMs, label: "Median" },
    { mark: "rule", x: p95Ms, label: "95th percentile" },
  ],
});
```

- `durationEdges(maxMs)` gives the bin edges of the [duration ladder](../design-patterns.md#charts) in milliseconds, from 0 up to the first edge at or above `maxMs`, or 3 days with no argument. `maxMs` is the longest delay the data can hold, which is more than a retention setting when the setting was lowered after older data was written. It throws a `RangeError` unless `maxMs` is finite, above 0 and at most 90 days.
- Each bin is `[edge, next edge)`, and the last is closed, so every delay from 0 to the last edge falls in exactly one bin. A server in another language bins on these same edges.
- The first bin, 0 to 1 second, has no place on a log axis, so it is drawn below the axis's low end at the width of its neighbour and read "Under 1 sec". A rule under 1 second is drawn inside it with its true value. A log x holds one such bin, whose `x1` is 0 or below, and a second one throws.
- A rule label sits in a band above the plot. It runs right from its rule, or ends at it near the right edge, and takes a second line when it would meet another label. A rule outside a passed domain draws no line, and its label at the nearer end adds "off the axis".

## Loading, empty and error

| The app | The figure shows |
| --- | --- |
| `renderChart(figure, null, options)`, or `loading()` for a new range | a box the height of the plot, which a skeleton fills after 200ms and keeps for at least 400ms, so a fast answer never flashes it |
| `update(spec)` with nothing to draw: every value `null`, every row empty or every bar 0 | the spec's `empty` words, or `words.empty` |
| `update(spec)` | the chart |
| `error(notice)` with the app's own `.cp-notice` | the notice in the plot's place, or, after a good render of the same range, under what that render showed |

- `update` checks the spec before anything changes and throws an error naming the broken rule. A number outside what it may be, such as an x that is not finite, a negative bar or a slot outside 1 to 9, is a `RangeError`, and a spec of the wrong shape a `TypeError`. While the skeleton keeps its minimum, the last `update` or `error` waits and then draws.
- A refresh each minute is not a load: call `update` when the answer comes, and the last drawing stays meanwhile.
- `loading()` drops the drawing, its readings, its table and its summary, since they belong to the old range.
- The app announces a load's outcome, such as "Check failed". The chart never announces a state.
- `summary` reads the summary of what shows, or "" while there is none.
- `signal` tears the chart down. A drawing stays as a static image named by its short description, with the view the reader chose, and the toggle is hidden. Later calls are ignored, so a fetch that answers after the page closed throws nothing. When the plot or the toggle held focus, focus moves to the figure.

## Reading the chart

- The summary is the figure's description, a visible sentence or two under the title, such as "312 posts, every 15 min from 8:00 AM to 2:00 PM: Announce 120, Path 98. Busiest: 11:15 AM to 11:30 AM, 41 posts." A spec's `summary` string replaces it, and a function of the generated text edits it, such as adding "38 still unread". An `update` rewrites it silently.
- The legend row above the plot names each series beside its swatch and carries the values of the selection, or with nothing selected the whole chart's: a stack's totals, a histogram's count, a timeline's posts, a line's last values. Its slots never change size, so the plot never moves under a selection. Lines are also labelled at their end from 30rem wide up.
- A mouse selects the bucket or sample nearest its x, anywhere in the plot's height, and leaving the plot clears it. On a timeline it selects the row, then the nearest dot within 40px, or the row itself. A tap selects, and the selection stays through the lift until a tap outside the plot, Escape or focus leaving the plot. A horizontal drag selects past 8px, and a vertical drag scrolls the page. The selection draws a crosshair and a ring, and nothing appears over the plot.
- The plot is one Tab stop. Left and Right move along x, Up and Down through a stack's segments, a line's series or a timeline's rows, Home and End to the ends, and Page Up and Page Down by an x tick. Each move is announced, such as "11:15 AM to 11:30 AM: Announce 12, Path 9. Total 28." Escape clears the selection. Tab leaves the plot, since the chart never takes it.
- `toggle` is the app's Table view button, a `.cp-filter-chip` written `hidden`, which swaps the plot for a `.cp-table` of the same data and back, by its `aria-pressed`. The chart shows it only while there is a drawing to switch from, and starting it pressed starts on the table. An app with no table of its own passes it, since without it the reader has no way to the table. `showTable(on)` switches the view from the app's code.
- The table holds a row per bucket or bin, per change point of a step line, per sample of a straight line, or per row of a timeline with its count, first and last. A rule follows it as a sentence. An `update` while it shows rewrites only the cells that changed, so the reader keeps their place.

## Charts together

- Charts that share an x share its `domain`. Their plots start and end at the same edges through two lengths set once on their common parent. `--cp-chart-axis-gutter` is the least width of the y labels' gutter, and `--cp-chart-label-gutter` of the line end labels' gutter.

  ```css
  .stats-charts { container-type: inline-size; --cp-chart-axis-gutter: 8rem; --cp-chart-label-gutter: 5rem; }
  @container (width < 30rem) { .stats-charts > * { --cp-chart-axis-gutter: 5rem; --cp-chart-label-gutter: 0px; } }
  ```

  Under 30rem lines have no end labels, so the group sets its label gutter to 0 there. A row name wider than the axis gutter is cut to it, so it never moves one plot off the shared edge.
- A gutter only grows on `update`, so a top label that goes from 9 to 10 never moves the plot sideways. A resize measures it afresh.
- The plot is 240px tall, 200px under 30rem, or `height` in px. A timeline's rows are each `max(24px, 1.75em)` tall at the axis's text size, so its height is its rows.

## Colour and surfaces

- Each series takes a slot of the [series colours](../design-colour.md#series-colours), its `slot` or its place in the list. Give a category the same slot in every chart, its most common ones the low numbers. A stack of more than five series is hard to read on a phone, so group the smallest into "Other". A dot mark takes one `slot` for all its rows.
- A chart sits on the page surface or a raised one, never on an overlay such as a dialog or a toast. Under forced colours the plot keeps its theme drawing on that surface inside a border, and `--cp-chart-surface` names it: the page surface, and the raised surface inside a [list-detail](../layout/list-detail.md)'s `.cp-detail` and a `.cp-gate` panel. An app that puts a chart on a raised container of its own sets `--cp-chart-surface: var(--cp-surface-raised)` on it.
- Nothing in a chart moves: an update, a selection and a resize change it in place.

## Words

`locale` and `timeZone` set how numbers and instants are written. By default they are the `lang` of the figure or its nearest ancestor, and the page's time zone. `words` gives every word the chart writes and says, each a string or a function of values already formatted. Among them are `reading(at, parts, total)` for an announced selection, `silentRow(name, unit)` for "docs-bot: no posts", the kinds that start the plot's name, such as "Stacked bar chart", and the frames of the summary. `ChartWords` lists each with its English default.
