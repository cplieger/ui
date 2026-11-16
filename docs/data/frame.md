# frame

`@cplieger/ui/frame`

The types of the chart data frames a Go service builds with [`github.com/cplieger/go/chartdata`](https://github.com/cplieger/go/blob/chartdata/v1.0.0-dev.1/chartdata/docs/frames.md) and sends as JSON. A frame holds the data one chart draws and nothing about how it looks: the page picks the mark, the words and the colours. The subpath holds types only, so importing it adds no code.

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
- A frame holds at most chartdata's limits: 1,000,000 values, refs and notes included, 1,000 categories, series of a categories frame, grid rows or timeline rows, 2,500 boxes, 6,994 calendar days, and no value beyond ±1e300. chartdata's constructors refuse a frame past them, so only a frame built in the page reaches the chart's refusal of one.
- chartdata's [contract page](https://github.com/cplieger/go/blob/chartdata/v1.0.0-dev.1/chartdata/docs/contract.md) covers how the types and their fixtures are generated.
