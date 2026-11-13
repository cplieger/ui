# chart

`@cplieger/ui/chart`

Charts with axes come in seven forms. Stacked columns count per time bucket. A histogram bins waits on the duration ladder, a timeline strip shows who acts when, lines run plain or stepped, and areas stack the parts of a sampled amount. Bars compare categories, stacked, grouped, split or either side of a middle, and dot, range and arrow plots set a few values per category along one axis. Each chart has a summary in words and a legend row that carries the selection's values. Keys read each point aloud, and a table view holds the same data.

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
- The chart wraps the caption's words in a `data-part="title"` span and adds a `data-part="summary"` paragraph beside it. The title names the figure and the summary describes it. Change the title through `figure.querySelector('[data-part="title"]')`, never by rewriting the caption, since setting its `textContent` deletes both and leaves the figure unnamed.
- A second `renderChart` on a figure that holds a live chart throws an `InvalidStateError`, where [sparkline](sparkline.md)'s `renderSparkline` and `renderMarkdown` draw again on each call. Those hold nothing between calls, while a chart holds listeners, a lifecycle and a selection, so its data changes through `update`. A figure whose chart was torn down by its signal can be rendered again.
- Nothing shows in the figure but its caption until the script runs, since a chart's data are numbers the app fetches.

## Choosing a chart

Pick a chart by the question its data answers, after [Datawrapper's guide to chart types](https://www.datawrapper.de/blog/chart-types-guide) and the [Financial Times Visual Vocabulary](https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary). Readers know line, column and bar charts best, and those make comparing easiest, so prefer one of them unless another answers the question better. Outside the chart: a number now is a `.cp-figure`, with a [sparkline](sparkline.md) for how it moved. One share of one whole inside a figure is a [share bar](share-bar.md). Long names and exact numbers go in a table with [ranked bars](ranked-bars.md).

### Change over time

| Question | Chart | Write |
| --- | --- | --- |
| How did an amount move? | Line chart | `line` |
| How did a level that holds between changes move, such as members live? | Step line | `line`, `curve: "step"` |
| How much happened in each bucket, and of which kind? | Column chart, stacked when it has several series | `rect` |
| The same, when buckets are many and rarely empty | Stacked area chart | `rect`, `shape: "area"` |
| How did the parts of a sampled amount move, such as memory by process? | Stacked area chart | `area` |
| How did the shares of a whole move? | 100% stacked area or column chart | `area` or `rect`, `arrange: "share"` |
| How do two or three series compare in each bucket? | Grouped column chart | `rect`, `arrange: "group"` |
| What changed between two moments, for many categories? | Arrow plot | `point`, `link: "arrow"` |
| Who acted when? | Timeline strip | `dot` |

- **Bars or an area for buckets.** Bars when buckets are few, often empty, or hold small bursty counts: a gap says a bucket is empty, and an area would break into slivers. The area when buckets are many and rarely empty, where the gaps between bars are noise. Both read and list the same numbers.
- An area chart shows the change of the total well and the change of each part less well ([FT Visual Vocabulary, Change over time](https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary)). Only the lowest part sits on a flat baseline, so put the part compared most first.
- Grouped columns suit few buckets and two or three series. A stack shows totals, so do not read totals from grouped columns ([Datawrapper](https://www.datawrapper.de/blog/chart-types-guide)).

### Comparing categories

| Question | Chart | Write |
| --- | --- | --- |
| How much does each category hold? | Bar chart | `bar` |
| How does each category split into parts? | Stacked bar chart | `bar` with several series |
| Which part is larger, category by category? | Grouped bar chart | `bar`, `arrange: "group"` |
| What share does each part take of each category? | 100% stacked bar chart | `bar`, `arrange: "share"` |
| How do the parts compare across categories, each part on its own baseline? | Split bar chart | `bar`, `arrange: "split"` |
| Several values per category, a scale that need not start at 0, or little room | Dot plot | `point` |
| How wide is the gap between two values in each category? | Range plot | `point`, `link: "range"` |

- Bars grow down the page, so they suit a phone better than columns, which squeeze sideways ([Datawrapper](https://www.datawrapper.de/blog/chart-types-guide)).
- Sort bars by value, largest first, unless the categories have an order of their own, such as age groups, answers on a scale or weekdays. The chart keeps the order it is sent, so an update never moves a row under the reader ([FT Visual Vocabulary, Ranking](https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary)).
- A dot plot reads well with three dots a row, five at most ([Datawrapper: dot plot](https://www.datawrapper.de/academy/how-to-create-a-dot-plot)). A split bar chart stays readable up to five or six parts, and folds into grouped bars on a phone ([Datawrapper: split bars](https://www.datawrapper.de/academy/how-to-create-a-split-bar-chart)).

### Above or below a middle

| Question | Chart | Write |
| --- | --- | --- |
| How far above or below 0 is each category? | Diverging bar chart | `bar` with values either side of 0, `below` for the negative slot |
| How do answers from disagree to agree split in each group? | Diverging stacked bar chart | `bar`, `arrange: "diverge"` |
| How do two groups compare along the same categories, such as a population by age and sex? | Population pyramid | `bar`, `arrange: "mirror"` |

### Spread of values

| Question | Chart | Write |
| --- | --- | --- |
| How are waits or sizes spread? | Histogram | `rect` with its bins on a log x |

- The chart computes nothing statistical. The app sends a histogram's bins.

### Parts of a whole

| Question | Chart | Write |
| --- | --- | --- |
| What makes up the whole? | Share bar, one bar with no axis | [`@cplieger/ui/share-bar`](share-bar.md) |
| How do several wholes split into the same parts? | 100% stacked bar chart | `bar`, `arrange: "share"` |
| How did a whole's parts change over time? | 100% stacked area or column chart | `area` or `rect`, `arrange: "share"` |

### Marking a moment or a level

| Question | Mark | Write |
| --- | --- | --- |
| Where is a threshold, a median or a target? | Rule | `rule` |
| What explains a spike or an outlier? | Text annotation | `text` |

On a phone, or when notes would overlap, every note becomes a numbered marker with the notes listed below the plot.

### Not offered

| Type | Use instead |
| --- | --- |
| Maps: choropleth, symbol and locator maps | A bar chart of the regions sorted by value, or a table with [ranked bars](ranked-bars.md). A map needs shapes and a projection that this module does not carry. |
| Stream graphs | A stacked area chart. Exact values are hard to read in a stream graph ([Datawrapper](https://www.datawrapper.de/blog/chart-types-guide)): no layer sits on a flat baseline, so none can be read against the axis. |
| Marimekko charts | A 100% stacked bar chart beside a bar chart of the totals. A Marimekko challenges the reader to compare absolute and relative values at once, as widths and heights ([Datawrapper](https://www.datawrapper.de/blog/chart-types-guide)). |
| Parliament charts | A bar chart of the seats, as election results are almost always shown ([Datawrapper](https://www.datawrapper.de/blog/chart-types-guide)), or a 100% stacked bar chart against a majority `rule`. |
| Waffle and pictogram charts | A [share bar](share-bar.md) for the shares of one whole, a 100% stacked bar chart for several, a bar chart for counts. Both trade readability for illustration ([Datawrapper](https://www.datawrapper.de/blog/chart-types-guide)). |
| Connected scatter plots | Two line charts over the same time x, one per measure. A connected scatter plot carries time only in its path's order, which a reader must trace dot by dot. |
| Radar charts | A dot plot with a row per variable and a dot per series. A radar's outline depends on the order of its axes ([FT Visual Vocabulary, Magnitude](https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary)). |
| 3D charts | The same chart in two dimensions. Projection distorts lengths, angles and areas ([Claus Wilke on 3D charts](https://clauswilke.com/dataviz/no-3d.html)). |

Niche statistical types such as violin plots and dendrograms are not offered either, as Datawrapper's guide leaves them out.

## Marks

| Mark | Draws | Use it for |
| --- | --- | --- |
| `rect` | a column from `x1` to `x2` and from 0 to `y`, stacked in series order when it has several series, side by side with `arrange: "group"`, or stacked to 100% with `arrange: "share"`, and with `shape: "area"` a step area with no gap between buckets | counts per time bucket, or a histogram's bins on a log x |
| `line` | a 2px path per series through `(x, y)`, `curve: "linear"` (the default) or `"step"`, which holds each value until the next sample | a gauge sampled each minute, in steps |
| `area` | a layer per series filled from the one below it (the first from 0) through `(x, y)`, stacked in series order or to 100% with `arrange: "share"`, `curve: "linear"` (the default) or `"step"` | a sampled amount whose parts add up, such as memory by process |
| `dot` | a 6px dot per value, one row per named row on a band y | who posts when, one row per agent |
| `bar` | a horizontal bar per category on a band y, from 0 along a linear x to its value, stacked in series order when it has several series, one under another with `arrange: "group"`, stacked to 100% with `arrange: "share"`, in a panel per series with `arrange: "split"`, either side of 0 with `arrange: "diverge"`, or back to back with `arrange: "mirror"`. One series with values below 0 is a diverging bar chart | how much each category holds, such as median age by country, a change either side of 0 by state, or a population by age and sex |
| `point` | a 10px dot per series on each category's row of a band y, at its value along a linear, log or time x that need not include 0, and with `link` two dots joined by a bold line or an arrow | a few values per category compared, such as median age by country for women and men. With `link: "range"`, the gap between two values, such as pay by degree for women and men. With `link: "arrow"`, the change from one value to another, such as a share in 2013 and in 2023 |
| `slope` | a 2px line per series between two named columns, with an 8px dot and a label at each end | what changed between two moments or two conditions for a few series, such as the share of homes with each pet in 2005 and in 2015 |
| `rule` | a 2px line across the plot at one `x` or one `y`, with its label and value | a median, a percentile, a threshold |
| `text` | a short note beside a place on the plot | what explains a spike or an outlier, such as a deploy |

- A chart holds one data mark, a `rect`, `line`, `area`, `dot`, `bar`, `point` or `slope`, and any number of rules and text marks. The keys, the legend row, the summary and the table read that one mark, so a second data mark throws a `TypeError` rather than draw values they never give.
- Marks draw in the order given, so a rule after a rect draws over it.
- Values are columns that share one x, sorted ascending. A line's `x` and a rect's `x1` strictly increase, and a dot row's `x` may repeat, since two posts can share a millisecond.
- `null` or `NaN` in a `y` is a gap. A line breaks there, even across one missed sample at the widest range, and a rect draws nothing. A stack counts a gap as 0 for the segments above, and the table writes "No data". On a log y, a line's value at or below 0 is a gap too.
- A stack's first series sits on the baseline, so put the series compared most first. Neighbouring bars and stacked segments stand 1px apart, and a bucket too narrow for a 1px gap and 1px of bar draws touching.
- `arrange: "group"` sets a rect's series side by side in each bucket, in series order from the left, to compare the series bucket by bucket. Each group is inset 12.5% of its bucket a side and its columns stand 1px apart. When a column would be under 2px, the inset drops to 0.5px, then the columns touch, and the 1px between groups goes last, so groups never stand closer than their own columns. Grouped columns suit a few buckets of two or three series. Their y fits the tallest column, and their readings, summary and table give no total, since a total read from groups misleads. With one series they draw a plain column chart. `arrange` is `"stack"` by default, and any other value is a `TypeError`.
- `arrange: "share"` stacks a rect's series to 100% of each bucket's total, to show how the parts of a bucket split as its size changes. Send the same values as for a stack: the chart divides each by its bucket's total, and a bucket whose total is 0 draws nothing. Its y runs from 0 to 1 and is written `"percent"` unless `y.format` says another, a passed `y.domain` is a `TypeError`, and a y rule outside 0 to 1 is off the axis. Its readings, legend row, summary and table give each series' share, with the absolute total the shares hide, such as "11:15 AM to 11:30 AM: Announce 43%, Path 32%, Direct 18%, Cards 7%. Total 28 posts." A bucket whose total is 0 reads its values. A share of one series is a `TypeError`, since it would read 100% everywhere.
- `shape: "area"` draws a rect's buckets as a step area: each series' run of touching buckets above 0 is one shape, flat across each bucket at its stacked top, with no gap or seam between neighbouring buckets. A bucket touches the next when its `x2` is the next one's `x1`, and a 0, a `null` or a gap in x ends the run, so a missing bucket is never bridged. Stacked layers keep the bars' 1px gap. The keys, readings, legend row, summary and table are the bars', "so far" included. Choose bars when buckets are few, often empty or hold small bursty counts, where a gap tells the reader a bucket is empty, and the area when buckets are many and rarely empty, where the gaps are noise. `shape` is `"bars"` by default, any other value is a `TypeError`, and so is `"area"` with `arrange: "group"`, since areas cannot stand side by side. A rect on a log x is still a histogram whatever its shape.
- An `area` fills under one series, or stacks several in series order, over samples as a line runs: its `x` strictly increases, and `"step"` holds each value until the next sample. A sample where any series is `null` or `NaN` breaks every layer there, since the layers above would otherwise draw a dip no series made, and a lone sample between gaps fills nothing. Each layer's edge is reduced per pixel column as a line is, so neighbouring layers share one edge with no overlap or hole and no peak is lost, and a layer at least 3px tall stands 1px above the one below it. An area has no stroke. Its y is linear and includes 0, so `zero: false`, a log y and a negative value are refused. Its readings, legend row, summary and table are a line's, with the stack's total after the layers from two series up, "No data" at a gap: "2:00 PM: Gas 1,204, Wind 980, Solar 412. Total 2,596." The legend row with no selection reads the last sample where the stack is whole. From 30rem wide up each layer is labelled with its name and last value in the label gutter, at the middle of its thickness at that sample, and labels that would overlap move apart. Use the step area of a `rect` for counts per bucket.
- `arrange: "share"` stacks an area's series to 100% of each sample's total, for shares that move over time. Send the same values as for a stack: the chart divides each by its sample's total, and a sample whose total is 0 breaks every layer, as a gap does. Its y runs from 0 to 1 and is written `"percent"` unless `y.format` says another, and a passed `y.domain` is a `TypeError`. Its readings, legend row, end labels, summary and table give each layer's share, with the absolute total the shares hide: "2:00 PM: Gas 46%, Wind 38%, Solar 16%. Total 2,596 MW." A sample whose total is 0, or where a series is a gap, reads its values. `arrange` is `"stack"` by default, any other value than the two is a `TypeError`, and so is a share of one series.
- `open: true` marks a rect's last bucket as still filling. Its readings and its table row add "so far", and the summary's busiest bucket or highest value leaves it out.
- A rule's `x` or `y` is a finite number. Send no rule when the value is unknown, such as a median with no reads yet. On a `dot`, `bar` or `point` chart y names rows, so a rule takes `x` and runs down every row, a target or a median each row is read against, and a `y` rule is a `TypeError`. Under `arrange: "split"` it draws in every panel, which share one scale, and once down the folded chart under 30rem. Under `"mirror"` and `"diverge"` it draws on both sides at its distance from the spine or from 0, since the axis reads the same values both ways, and an inferred x widens both sides to hold it. There a rule below 0 is a `RangeError`, as a value below 0 is. However many lines it draws, a rule has one label, from its line in the first panel or from its right-hand line, and reads once.
- A `text` mark writes its `text` beside the place its `x` and `y` name: values on the chart's scales under a `rect`, `line` or `area`, under a `dot` mark a time and a row's name, and under a `bar` or `point` mark a row's name with an `x` that places the note along the row. Under `arrange: "split"`, `"diverge"` or `"mirror"`, where one value would name a place in every panel or on both sides, an `x` is a `TypeError` and the note's point is its row's end, 4px past the outer end of its bar in the last panel, or on the right side, or past that bar's value label. The plot keeps a numbered marker's room past those ends. The chart places the note, so the app tunes no offsets: it sits 4px off its point on its `side`, `"above"` by default or `"below"`, `"left"` or `"right"`, moves to the opposite side when it would cross the plot's edge, and then shifts along that edge until it fits. It wraps at spaces to 12rem, or the plot's width when that is narrower, in ink on a 3px halo of the chart's surface, so it reads over bars and gridlines. A note does not widen an inferred domain, and one outside the domain is not drawn and joins no reading, though the summary and the table still give it. The room an inferred axis rounds its ends out to is outside the domain, so a note is drawn or not at every width alike. Under 30rem, or when two notes would overlap or one cannot fit inside the plot, every note becomes a numbered marker, a 20px ink circle at its point, and the notes are listed in spec order in an `<ol data-part="notes">` below the plot. All notes switch together, so a reader never matches some on the plot and some below it. Both places are required, except the row-end `x` above, so a missing one is a `TypeError`, as are empty text, another `side`, a name on a continuous scale and a number for a row. A non-finite value, a row name not in the band and a value at or below 0 on a log scale are a `RangeError`.
- A `bar` mark names its categories in `y`, top to bottom in the order sent, and each series gives a value per category in `x`, named for the axis it is drawn on. The chart never sorts the rows, so an update never moves a row under the reader: send them largest first unless the categories have an order of their own, such as age groups or weekdays. A `null` or `NaN` draws no bar and writes no label. A negative value draws leftward from 0. One series with a value below 0 is a diverging bar chart: its labels, readings, summary and table write every value but 0 with its sign, "+16%" and "-14.3%", so the sign is in the words as well as the side of 0, and `below` names the slot of its bars below 0, its own slot otherwise. `below` beside other series is a `TypeError`, since there each slot names a series. Several series stack in series order from 0 by default, their negative values leftward and the positive ones rightward, with 1px between segments. `arrange: "group"` sets a row's series one under another in series order instead, each a 12px bar from 0, three quarters of a bar, 1px apart, so a row of three series is 3 × 12 + 2 + 8 = 46px tall, and x reaches the largest single value rather than a row's sum. A `null` leaves its grouped bar's place empty, so the other series keep theirs. Grouping with one series draws a plain bar chart, and an `arrange` other than "stack", "group", "share", "split", "diverge" or "mirror" is a `TypeError`. Each row is `max(24px, 1.75em)` tall with a 16px bar, the name in the y gutter, cut at 40% of the chart's width and at most 12rem, or at the group gutter. Under 30rem each name sits on its own line above its bar, cut to the plot's width, so the plot takes the chart's whole width and a row is 44px. Each bar carries its value 4px past its end, a stack its total and a group each bar its own, in ink on a 3px halo of the chart's surface so a rule crossing it leaves it legible, and x ends short of the plot by the widest label so none crosses it. With labels on there is no x axis and no gridline, since the labels give every value. `labels: false` draws an x axis instead, with vertical gridlines at its ticks. The zero line stands upright. x is linear and includes 0, so a log or time x, `zero: false` and a domain without 0 are refused. A selected row's name turns ink at medium weight and the box around its bars takes the ring, a chosen part the ring alone, with no crosshair. With no selection the legend row counts the rows, in `y.unit` or as "6 categories", and leaves the series' values blank, since a category's values need not add up across rows. A row reads its name and values, with the total from two stacked series up: "Acme: Domestic 40, International 2. Total 42." A grouped row has no total, since a group compares series rather than adding them: "Japan: Female 51.1, Male 48.4." The summary counts the rows, then names the highest and lowest row of each series and, for a stack, of the totals, the first in the order sent on a tie: "15 countries. Highest Holy See 57.4, lowest United States 38.5." The table holds a row per category and a column per series, with a Total column from two stacked series up and none for a group. An empty or repeated name is a `RangeError`, since the readings and the table name a row by it, and so is an infinite value. A `y` of other than names, a series without `x` or of another length, and a `y` rule are a `TypeError`.
- `arrange: "share"` stacks a bar's series to 100% of each row's total, to show what share each part takes of each category. Send the same values as for a stack: the chart divides each by its row's total, and a row whose total is 0 draws nothing. Its x runs from 0 to 1 and is written `"percent"` unless `x.format` says another, with an x axis and vertical gridlines, since every row reaches 100% and no bar has a length of its own to label. A passed `x.domain` and `labels` are a `TypeError`, a negative value is a `RangeError`, and an x rule outside 0 to 1 is off the axis. Its readings and table give each series' share with the absolute total the shares hide, in `x.unit`: "Instagram: Never 34%, Occasionally 8%, A few times a day 58%. Total 100 respondents." A row whose total is 0 reads its values. The summary names each series' highest and lowest share. A share of one series is a `TypeError`, since it would read 100% everywhere.
- `arrange: "split"` draws a panel per series, left to right in series order and 16px apart, each series' bars from its panel's left edge, to compare a few related numbers per category side by side, such as how often each answer was given per network. Every panel draws on one shared scale from 0 to the largest single value, so equal lengths are equal values in every panel. Each panel's name heads it in a line above the plot, cut to the panel's width. The legend row and the table give it whole. Value labels sit 4px past each bar inside its panel, every panel ending short by the widest label, and `labels: false` repeats the x axis under each panel. A selected row rings each panel's bar, a chosen part its own. Left and Right move through the panels as drawn, right to left on a reversed x. Under 30rem the panels would be too thin for their bars (three on a phone are about 85px each), so they fold into one: each row's series stand one under another as with `arrange: "group"`, on the same scale, and the heads go. Values are 0 or more, so a negative one is a `RangeError`. A row reads its values with no total, "Instagram: Daily 34, Weekly 8, Never 7.", the summary names each series' highest and lowest row with no Total sentence, and the table has no Total column. It is a "Split bar chart" at every width, and with one series a plain bar chart. Five or six panels at most stay readable.
- `arrange: "diverge"` sets a row's series either side of 0, for answers on a scale such as disagree, neutral and agree. `left` names how many series, the first ones, stack leftward from 0, the last of them nearest it, so a row reads in series order from left to right, and the rest stack rightward. With `centre: true` the series after the left ones straddles 0, half its value each side, as a neutral answer does. A series' side comes from its place in the order, never from its sign, so every value is 0 or more and a negative one is a `RangeError`. x runs from the widest left extent to the widest right one, each niced, and its axis writes distances from 0 both ways ("40%" left and right, never "-40%"), with vertical gridlines and the zero line, since no bar has one length to label. `labels` is a `TypeError`, as are `left` or `centre` outside "diverge", "diverge" with fewer than two series (three with `centre`), and a `left` that is not a number. A `left` that is not a whole number from 1 to the series count less one (less two with `centre`) is a `RangeError`, so a series lies on each side. The chart draws the values it is sent: send each group's shares, with `x.format: "percent"`, when the groups differ in size. Left and Right move through the segments as drawn. A row reads its values in series order and its total: "Item 3: Strongly disagree 10%, Disagree 15%, Neutral 20%, Agree 30%, Strongly agree 25%. Total 100%." The summary names each series' highest and lowest row and the totals', and the table has a Total column. Give the two most extreme answers the two most distinct slots.
- `arrange: "mirror"` sets exactly two series back to back, the first running leftward from a spine and the second rightward, for two groups compared category by category. Its best-known use is the population pyramid, men and women by age group: send the oldest group first, since rows run top to bottom. Both sides draw on one shared scale from 0 to the larger side's largest value, so equal lengths are equal values on both sides, and they stand 8px apart, each with its baseline a line in the spine. Bars fill their row less 2px, so neighbouring groups stand close and each side's profile reads as one shape. Each side's name heads it above the plot, by the spine. Value labels sit 4px past each bar's outer end, both sides keeping room for the widest, and `labels: false` draws an x axis under each side instead, reading distances from the spine both ways. The names stay in the y gutter at every width, with 24px rows, since a pyramid's names are short and 44px rows would make 21 age groups 924px tall. On a reversed x the first series takes the right side. Values are 0 or more, so a negative one is a `RangeError`, and other than two series is a `TypeError`. Left and Right move between the sides as drawn. A row reads both values and its total: "45-50: Male 2,734,000, Female 2,690,000. Total 5,424,000." The summary names each side's highest and lowest row and the totals', and the table has a Total column. It is a "Back-to-back bar chart".
- A `point` mark names its categories in `y`, top to bottom in the order sent, as a `bar` mark does, and each series gives a value per category in `x`. Each value is a 10px dot in its series' slot on its row's hairline, drawn in series order, so where two dots meet the later series lies on top and the readings and the table give both. A `null` or `NaN` draws no dot. Since no length encodes a value, x is the data's extent, niced, without 0 unless `x.zero` is `true`, so close values stay apart, such as median ages from 38 to 60. A `log` x takes values above 0, for values over several orders of magnitude, and a `time` x takes instants, such as each component's last release. The x axis sits at the bottom with vertical gridlines at its ticks and its title at its end, and a zero line only where a linear x holds 0. Its ends sit 7px inside the plot, so a dot at either end draws whole with its ring. There are no value labels, since dots in one row crowd. Rows are `max(24px, 1.75em)` tall with the names in the y gutter, and under 30rem each name sits on its own line above its dots, a row 38px. A selected row's name turns ink at medium weight and each of its dots takes the ring, a chosen dot the ring alone, with no crosshair. With no selection the legend row counts the rows and leaves the series' values blank. A row reads its values with no total, since its dots are values compared rather than parts: "Japan: Female 51.1, Male 48.4." The summary counts the rows and series, then names each series' highest and lowest row, "Women: highest Doctorate 128,700, lowest Less than 9th grade 29,100.", or on a time x its earliest and latest, "Release: earliest web 8:00 AM, latest api 9:30 AM.", since "highest" reads wrong of an instant. The table holds a row per category and a column per series, an instant in its `<time>`. More than five series still draw, though three dots a row read best. A `zero` on a log or time x, a value at or below 0 on a log x and an infinite value are refused, as are a band x, a `height` and a `y` rule. An empty or repeated name is a `RangeError`.
- A `point` mark with `link` joins each row's two dots, so it takes exactly two series, and Left and Right go to the first dot, then the second. `link: "range"` draws a 4px line in `--cp-border-strong` between them, under the dots, for when the gap matters more than the values: a row reads it last, "Doctorate: Women 128,700, Men 163,500. Gap 34,800.", the legend row's last slot is Gap, the table has a Gap column, and the summary ends with the highest and lowest gap, "Gap: highest Master's 53,310, lowest Less than 9th grade 14,250." `link: "arrow"` draws a 2px `--cp-ink-muted` arrow from the first dot's edge to an 8px head at the second's, so the direction reads in any colour, and Change takes Gap's place, the second value less the first with its sign, "Norway: 2013 5.8%, 2023 93%. Change +87.2%." Where a row's dot centres stand under 18px apart, its arrow has no room for its head, so only the dots draw, and the reading, the legend row and the table still give the change. A gap is never negative, since it is a distance. Both are written in the x format, such as a difference of proportions in percent, and on a time x as a duration. A row with a `null` end draws no link, reads without its gap or change, and gives No data in the legend row and the table. A row with a dot outside a passed domain draws no link either, and still reads its gap or change. Another `link`, or a `link` with other than two series, is a `TypeError`.
- A `slope` mark names its two columns in `x`, left to right, such as `["2005", "2015"]` or `["Before", "After"]`, and each series gives its two ends in `y`. The chart takes no `x` scale, since the columns name themselves, so a passed `x` is a `TypeError`, and so is an x rule. Its y is linear and holds 0 unless `y.zero` is `false`, as a line's does: set `zero: false` when the change matters more than the size, since a scale from 0 flattens every slope. The columns sit at the plot's left and right edges, their names above them in the muted ink, the left flush left and the right flush right. Each series is a 2px line in its slot with an 8px dot at each end, drawn in series order, every line under every dot. There is no y axis and no gridline, since every end carries its value: from 30rem wide up a label "{name} {value}" ends 8px before the left column and starts 8px after the right one, centred on its dot, and under 30rem the left label holds the value alone, so each name is written once, at the right end. Names are cut with an ellipsis so neither label gutter passes 30% of the chart's width, and the group gutters and the steadiness rule hold as for a line's end labels. Labels on one side that would come closer than one line move apart as a group centred on their dots, kept inside the plot, and a label moved more than 4px from its dot is joined to it by a 1px `--cp-ink-muted` leader. The plot is 240px tall, 200px under 30rem, or `height`, and grows to 18px a label on its longer side, so 20 series draw 360px tall rather than overlap. A `null` end draws its other end's dot and label and no line. A y rule runs across both columns. A text mark's `x` names one of the two columns and its `y` is a value, so a number in `x` is a `TypeError` and a name other than the columns a `RangeError`; the note joins that column's reading, whole or one chosen series, and the summary and the table write it at the column's name, "2015: New high." Two columns and other than two values a series are a `TypeError`, as are a column that is not a name and a log y. An empty or repeated column or series name and an infinite value are a `RangeError`. Keep the lines few: an arrow plot fits many categories in less room.
- Dots keep their glyph when posts crowd, since one pixel column's posts draw once. An agent that posts more often than a dot is wide draws a run, which reads as continuous activity. The legend row, the keys and the table give each post and each count.
- The chart computes nothing statistical. The app sends the bins, the counts and the percentiles it draws.

## Scales and axes

| `type` | For | Domain when the spec gives none |
| --- | --- | --- |
| `linear` | counts and amounts, the default | the data's extent with zero, extended to a round tick |
| `log` | values over several orders of magnitude, such as seconds to days | the smallest positive value to the largest |
| `time` | instants, in milliseconds since the epoch | the data's extent |
| `band` | named rows, the y of a `dot`, `bar` or `point` mark | the rows in the order given |

- A time axis says `type: "time"`, since a number cannot say it is an instant. A log axis is never inferred.
- A passed `domain` fixes the scale, so charts that sit together compare on one scale. Marks are cut at its ends. A bucket that crosses an end is drawn to the edge, and its readings and its table row keep its full interval and value. Anything wholly outside is left out.
- A linear y under a `rect` or an `area` always includes 0, since a column's length and a layer's height are their values, and so does a bar's linear x. A chart of lines alone, or a slope, may set `zero: false`. A point's linear x includes 0 only with `zero: true`, since a dot's place, not a length, encodes its value.
- Ticks follow the chart's own width, about 80px apart on x and 40px apart on y, so a chart in a narrow panel gets fewer. Labels are never rotated. A label that would come within 8px of the last is dropped. A time or linear axis moves to a coarser step before it drops more than every other label.
- Time ticks fall on the hours and days of the page's time zone, or of `timeZone`. A day across a clock change has 23 or 25 hourly ticks. Their labels have two lines, the time and, where the day changes, the date, each in the locale's own order and hour cycle.
- `label` is the axis title. A y title sits above the axis. A time x has none, since its ticks say what it is.
- `unit` is the plural noun of a scale's values, such as `{ one: "post", other: "posts" }`, chosen through `Intl.PluralRules`. On a band y it names the rows, such as agents.
- A band y with `mono: true` writes its names in the mono face, for machine names. A long name is cut with an ellipsis, and the legend row and the table hold it whole.
- `x.reverse` runs x from right to left and moves the y gutter to the right. Otherwise the plot runs left to right in every script, as time does on a chart. The caption, the legend row, the summary and the table follow the page's direction.

## Formats

`format` on a scale says how the chart writes its values in its locale, on the axis, the legend row, the summary and the table:

- `"number"`, the default: `Intl.NumberFormat`'s own, up to three fraction digits.
- `"integer"`: rounded to a whole number.
- `"percent"`: a proportion from 0 to 1, so 0.42 writes "42%".
- `"duration"`: milliseconds, as "1 min, 27 sec", "18 min" or "400 ms". Under 10 of its largest unit a value keeps the next unit too, and from 10 up it keeps the largest alone. A log axis in durations ticks at 1 sec, 10 sec, 1 min, 10 min, 1 hr, 6 hr, 1 day and 3 days. Above 3 days it ticks at each edge of the ladder.
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

- `durationEdges(maxMs)` gives the bin edges of the [duration ladder](../design-patterns.md#charts) in milliseconds, from 0 up to the first edge at or above `maxMs`. With no argument it stops at 3 days. `maxMs` is the longest delay the data can hold. That exceeds a retention setting lowered after older data was written. It throws a `RangeError` unless `maxMs` is finite, above 0 and at most 90 days.
- Each bin is `[edge, next edge)`, and the last is closed, so every delay from 0 to the last edge falls in exactly one bin. A server in another language bins on these same edges.
- The first bin, 0 to 1 second, has no place on a log axis. It is drawn below the axis's low end at the width of its neighbour and reads "Under 1 sec". A rule under 1 second is drawn inside it with its true value. A log x holds one such bin, whose `x1` is 0 or below, and a second one throws.
- A rule label sits in a band above the plot. It runs right from its rule, or ends at it near the right edge, and takes a second line when it would meet another label. A rule outside a passed domain draws no line, and its label at the nearer end adds "off the axis".

## Loading, empty and error

| The app | The figure shows |
| --- | --- |
| `renderChart(figure, null, options)`, or `loading()` for a new range | a box the plot's height, which a skeleton fills after 200ms and keeps for 400ms or more, so a fast answer never flashes it |
| `update(spec)` with nothing to draw: every value `null`, every row empty, every bar 0, no point inside the domain, or every area sample 0 or a gap | the spec's `empty` words, or `words.empty` |
| `update(spec)` | the chart |
| `error(notice)` with the app's own `.cp-notice` | the notice in the plot's place, or, after a good render of the same range, under what that render showed |

- `update` checks the spec before anything changes and throws an error naming the broken rule. A number out of range is a `RangeError`, such as a non-finite x, a negative bar or area value, or a slot outside 1 to 9. A spec of the wrong shape is a `TypeError`. While the skeleton keeps its minimum, the last `update` or `error` waits and then draws.
- A refresh each minute is not a load. Call `update` when the answer comes, and the last drawing stays meanwhile.
- `loading()` drops the drawing, its readings, its table and its summary, since they belong to the old range.
- The app announces a load's outcome, such as "Check failed". The chart never announces a state.
- `summary` reads the summary of what shows, or "" while there is none.
- `signal` tears the chart down. A drawing stays as a static image named by its short description, with the view the reader chose, and the toggle is hidden. Later calls are ignored, so a fetch that answers after the page closed throws nothing. When the plot or the toggle held focus, focus moves to the figure.

## Reading the chart

- The summary is the figure's description, a visible sentence or two under the title. An example is "312 posts, every 15 min from 8:00 AM to 2:00 PM: Announce 120, Path 98. Busiest: 11:15 AM to 11:30 AM, 41 posts." Rules follow, then each note at its x, such as "11:15 AM: Deploy.", on a timeline after its row's name, on a bar or point chart at its row's name alone, as in "Facebook: Best.", and on a slope at its column's name. A slope's summary gives each series' two ends and change, then the largest rise and the largest fall, the first in series order on a tie: "2005 to 2015, 8 series. Cats: 50 to 34, -16. … Largest rise: Sheep +15. Largest fall: Cats -16." The rise is left out when no series rose and the fall when none fell, and a series with a missing end has no change to rank. The chart states no trend or correlation, which an app that has one adds through `summary`. A spec's `summary` string replaces it. A function of the generated text edits it, such as adding "38 still unread". An `update` rewrites it silently.
- The legend row above the plot names each series beside its swatch and carries the selection's values. With nothing selected it carries the whole chart's, such as a stack's totals, a histogram's count, a timeline's posts, a line's last values an area's last whole stack with its total, or a slope's right column. Its slots never change size, so the plot never moves under a selection. Lines and areas are also labelled at their end from 30rem wide up.
- A mouse selects the bucket or sample nearest its x, anywhere in the plot's height, and leaving the plot clears it. On a timeline it selects the row, then the nearest dot within 40px, or the row itself. A tap selects, and the selection stays through the lift until a tap outside the plot, Escape or focus leaving the plot. A horizontal drag selects past 8px, and a vertical drag scrolls the page. The selection draws a crosshair and a ring, and nothing appears over the plot. On a bar or point chart a mouse or a tap selects the row under it, anywhere across the plot's width, and a drag never selects, since a vertical one scrolls the page. There is no crosshair. On a slope a mouse or a tap selects the nearer column, anywhere in the plot's height, and a horizontal drag moves between the two.
- The plot is one Tab stop. Left and Right move along x, and Up and Down through a stack's segments, a 100% stack's shares, a group's columns or an area's layers in series order, a line's series or a timeline's rows. Home and End go to the ends, and Page Up and Page Down move by an x tick. Each move is announced, such as "11:15 AM to 11:30 AM: Announce 12, Path 9. Total 28." A note adds itself to the reading of the stop it names, "Note: Deploy.", but never to the legend row: a bucket whose interval holds its x, the sample or timeline post nearest its x, the earlier on a tie, a timeline row with no post, or on a bar or point chart its row, read whole or one part, its x only placing it. Past the first or last sample or post a note joins it only within half the distance to its neighbour. On a step line or stepped area, where the keys stop only at change points, a note joins the change point holding its sample, and a pointer anywhere in that held run reads it too. On a bar or point chart focus selects the first row whole, Up and Down move through the rows, Home and End go to the first and last, and Page Up and Page Down move ten rows. Left and Right choose one part of the row in series order, a bar or a dot, and say it alone, "Acme: Domestic 40.", and Up and Down keep that series chosen on the next row and say the row whole. On a slope focus selects the right column, Left and Right, Home and End move between the two columns, and Page Up and Page Down are left to the page. Up and Down choose a series at the column by its value there, Up to the line drawn above, ties in series order, and say its two ends and its change, "Dogs: 2005 40, 2015 31. Change -9.", with no change when an end is missing. A chosen series is drawn over the others with both its ends ringed, its end labels turn medium weight and its legend chip's name semibold, and Left and Right keep it chosen. Escape clears the selection. Tab leaves the plot, since the chart never takes it.
- `toggle` is the app's Table view button, a `.cp-filter-chip` written `hidden`. A press swaps the plot for a `.cp-table` of the same data and back, and its `aria-pressed` says which shows. The chart shows it only while there is a drawing to switch from, and starting it pressed starts on the table. An app with no table of its own passes it, since without it the reader has no way to the table. `showTable(on)` switches the view from the app's code.
- The table holds a row per bucket or bin, per change point of a step line or stepped area, or per sample of a straight line or area, with an area's Total column from two series up. A timeline's table has a row per timeline row, with its count, first and last. A slope's has a row per series, its two ends under the column names and its signed change under `change`, with the y `label` in the corner, since no axis writes it. Rules and notes follow it as sentences. An `update` while it shows rewrites only the cells that changed, so the reader keeps their place.

## Charts together

- Charts that share an x share its `domain`. Their plots start and end at the same edges through two lengths set once on their common parent. `--cp-chart-axis-gutter` is the least width of the y labels' gutter, and `--cp-chart-label-gutter` of the end labels' gutter.

  ```css
  .stats-charts { container-type: inline-size; --cp-chart-axis-gutter: 8rem; --cp-chart-label-gutter: 5rem; }
  @container (width < 30rem) { .stats-charts > * { --cp-chart-axis-gutter: 5rem; --cp-chart-label-gutter: 0px; } }
  ```

  Under 30rem lines and areas have no end labels, so the group sets its label gutter to 0 there. A row name wider than the axis gutter is cut to it, so it never moves one plot off the shared edge.
- A gutter only grows on `update`, so a top label that goes from 9 to 10 never moves the plot sideways. A resize measures it afresh.
- The plot is 240px tall, 200px under 30rem, or `height` in px. A timeline's, a bar chart's and a point chart's rows are each `max(24px, 1.75em)` tall at the axis's text size, a bar row 44px and a point row 38px under 30rem, and a grouped bar row is its bars and 8px, with the name's line and 2px above them under 30rem, so their height is their rows and a `height` on either is a `TypeError`.

## Colour and surfaces

- Each series takes a slot of the [series colours](../design-colour.md#series-colours), its `slot` or its place in the list. Give a category the same slot in every chart, its most common ones the low numbers. A stack of more than five series is hard to read on a phone, so group the smallest into "Other". A dot mark takes one `slot` for all its rows.
- A chart sits on the page surface or a raised one, never on an overlay such as a dialog or a toast. Under forced colours the plot keeps its theme drawing on that surface inside a border. `--cp-chart-surface` names the surface, which is the page surface, or the raised surface inside a [list-detail](../layout/list-detail.md)'s `.cp-detail` and a `.cp-gate` panel. An app that puts a chart on a raised container of its own sets `--cp-chart-surface: var(--cp-surface-raised)` on it.
- Nothing in a chart moves. An update, a selection and a resize change it in place.

## Words

`locale` and `timeZone` set how numbers and instants are written. By default they are the `lang` of the figure or its nearest ancestor, and the page's time zone. Instants are written as times, with their dates once the time domain spans a whole day: 24 hours, or a day on the time zone's clock, such as a 23-hour spring-forward day. A shorter window across midnight keeps times only. `words` gives every word the chart writes and says, each a string or a function of values already formatted. `ChartWords` lists each with its English default. Among them are `reading(at, parts, total)` for a selection read aloud, the summary's frames and the kinds that start the plot's name: `kind.column` "Column chart", `kind.stackedColumn` "Stacked column chart", `kind.groupedColumn` "Grouped column chart" and `kind.shareColumn` "100% stacked column chart" for a rect, `kind.area` "Area chart", `kind.stackedArea` "Stacked area chart" and `kind.shareArea` "100% stacked area chart" for a rect with `shape: "area"`, `kind.area`, `kind.stackedArea` and `kind.shareArea` for an `area` mark too, whatever its curve, `histogram`, `line`, `step` and `timeline`, and `kind.bar` "Bar chart", `kind.stackedBar` "Stacked bar chart", `kind.groupedBar` "Grouped bar chart" and `kind.shareBar` "100% stacked bar chart", `kind.splitBar` "Split bar chart", `kind.divergingStackedBar` "Diverging stacked bar chart", `kind.mirrorBar` "Back-to-back bar chart" and `kind.divergingBar` "Diverging bar chart", one series with a value below 0, for a `bar` mark, `kind.dotPlot` "Dot plot", `kind.rangePlot` "Range plot" and `kind.arrowPlot` "Arrow plot" for a `point` mark, whose short descriptions end in their row count, such as "Bar chart, 15 countries", since their x is a value, and `kind.slope` "Slope chart", whose short description ends in its two columns, such as "Slope chart, 8 series, 2005 to 2015". A slope's summary opens with `slopeSummary(range, series)`, "{range}, {series}.", or "{range}." for one series, writes each series through `slopeSeries(name, from, to, change)`, "{name}: {from} to {to}, {change}.", or "{name}: {from} to {to}." when `change` is "" for a missing end, and ends with `rise(name, change)`, "Largest rise: {name} {change}.", and `fall(name, change)`, "Largest fall: {name} {change}.". A change is written in the y format with its sign on every value but 0. Without a `y.unit` that count is `categories(n, count)`, "{n} categories", or "{n} category" for one row, and `count` is the number, for the app's own plural. A point chart on a time x summarises each series through `spanSeries(name, first, last)`, "{name}: earliest {first}, latest {last}.". Where every row of a bar or point series, its totals or its gaps holds one value, the summary gives it once through `alike(name, value)`, "Total: 100% each.", and where one row alone holds a value, through `only(name, row)`, "Female: Japan 51.1.". `name` is "" for a chart's one series, which reads "40 each." and "Japan 49.9.". `gap` "Gap" and `change` "Change" name a range's and an arrow's last legend slot, table column and summary sentence, and a slope's Change column, and `gapReading(at, parts, gap)`, "{at}: {parts}. Gap {gap}.", and `changeReading(at, parts, change)`, "{at}: {parts}. Change {change}.", read their rows and a slope's chosen series. A grouped chart's summary names its highest single value through `highest(name, range, n)`, "Highest: Path, 11:15 AM to 11:30 AM, 9 posts.", where a stack names its busiest bucket. `silentRow(name, unit)` writes a silent row, such as "docs-bot: no posts". `note(at, text)`, "{at}: {text}.", writes a note in the summary and after the table, and `noteReading(text)`, "Note: {text}.", the note a reading adds. Neither adds a full stop to a note that already ends in ".", "!", "?" or "…".
