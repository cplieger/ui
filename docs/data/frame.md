# frame

`@cplieger/ui/frame`

The types of the chart data frames a Go service builds with [`github.com/cplieger/go/chartdata`](https://github.com/cplieger/go/blob/chartdata/v1.0.0-dev.1/chartdata/docs/frames.md) and sends as JSON. A frame holds the data one chart draws and nothing about how it looks: the page picks the mark, the words and the colours. The subpath holds those types and `applyEvent`, which applies an event the service sends to a frame already drawn.

```ts
import type { BinsFrame } from "@cplieger/ui/frame";
import { renderChart } from "@cplieger/ui/chart";

const posts = (await (await fetch("/api/posts")).json()) as BinsFrame;
renderChart(
  figure,
  { data: posts, mark: { mark: "rect", keys: [{ key: "direct", name: "Direct" }] } },
  { signal: page.signal },
);
```

- Every type chartdata's contract generates is exported under its own name: the twelve frames (`SeriesFrame`, `BinsFrame`, `CategoriesFrame`, `BoxesFrame`, `PointsFrame`, `GridFrame`, `CalendarFrame`, `TreeFrame`, `FlowFrame`, `EventsFrame`, `StatesFrame` and `ValueFrame`), their parts, `FrameType`, `FrameAxis`, `FrameEventKind` and `FrameEvent`. `Frame` is the union of the twelve frames.
- A frame's `type` names its frame type, but each frame types it as the whole `FrameType`, so TypeScript cannot narrow a `Frame` by it. The chart checks `type` against its mark when it is drawn.
- An instant is a Unix time in milliseconds. A quantity is in its base unit: seconds, bytes, a ratio from 0 to 1, a count, or a plain number. A gap is `null`. A frame's `unit` names that base unit, and the chart picks a value axis's format from it.
- The chart draws nine of the frames, each under the marks [chart](chart.md#data-and-marks) names for it: a `BinsFrame` as rects, a `SeriesFrame` as a line or an area, an `EventsFrame` as dots, a `CategoriesFrame` as bars, points, a slope or a pie, a `PointsFrame` as a scatter, a `GridFrame` or a `CalendarFrame` as cells, a `BoxesFrame` as boxes, and a `TreeFrame` as a treemap. No element draws a `FlowFrame`, a `StatesFrame` or a `ValueFrame` yet.
- The types are generated from chartdata `v1.0.0-dev.1`, the version a service sending these frames requires. The chart reads a frame by the rules chartdata's constructors hold it to and refuses one it cannot draw with a `TypeError` or a `RangeError` naming the field, such as `data.series[1].values`.
- A frame holds at most chartdata's limits: 1,000,000 values, refs and notes included, 1,000 categories, series of a categories frame, grid rows or timeline rows, 2,500 boxes, 6,994 calendar days, and no value beyond ±1e300. chartdata's constructors refuse a frame past them, so a frame a service sends reaches the chart's refusal only as one of the panels of small multiples, which hold the chart's ceilings together. The page's `mark.keys`, `refs` and `notes` add no values.
- chartdata's [contract page](https://github.com/cplieger/go/blob/chartdata/v1.0.0-dev.1/chartdata/docs/contract.md) covers how the types and their fixtures are generated.

## Events

A service keeps a drawn chart current with a `FrameEvent` on its own event stream, as chartdata's [events page](https://github.com/cplieger/go/blob/chartdata/v1.0.0-dev.1/chartdata/docs/events.md) describes. `applyEvent(frame, event)` returns the frame the event makes of the drawn one, and leaves the drawn frame unchanged. The result shares the parts the event leaves as they were, so treat both frames as read-only.

```ts
import { applyEvent, type Frame } from "@cplieger/ui/frame";

let drawn: Frame = await (await fetch("/api/waits")).json();
source.addEventListener("frame", (e) => {
  drawn = applyEvent(drawn, JSON.parse(e.data));
});
```

- `append` adds a column to a `SeriesFrame` or a bin to a `BinsFrame`. Its `x` comes after the last column's, or its bin starts after the last bin starts and ends at or after the last bin ends. The frame keeps its span: its domain, or its x extent when it has none, slides to end at the new column or bin. The columns before the new start drop, as do the bins ending at or before it and the resets before it. The new column is complete, so `open` is cleared.
- `replace` gives the last column or bin the event's values, and a bin its new edges, ordered against the bin before. `open: true` marks it still filling, and an event without it clears the mark.
- `reset` adds `at` to a `SeriesFrame`'s or a `BinsFrame`'s resets, in order and once. A `StatesFrame` gains a gap there, a `null` key at `at`, unless it already has an observation at that instant.
- `set` draws the frame it carries, read as the chart reads a frame. A frame drawn with a domain keeps its span, ending where the new frame's domain ends. When the new frame has a domain, the columns, bins and resets before its start drop.
- A `SeriesFrame` and a `BinsFrame` take every kind, a `StatesFrame` takes `reset` and `set`, and every other frame takes only `set`.
- An event is read as a frame is: one that breaks a rule throws a `TypeError` or a `RangeError` naming the field, such as `applyEvent: event.values[0] must be finite`. A kind the frame does not take, a field of another kind or another frame type, an `x` or bin out of order, and a result past chartdata's limits are refused the same way. A field the contract does not name is ignored.
