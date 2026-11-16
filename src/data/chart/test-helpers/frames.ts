import type {
  BinsFrame,
  BoxesFrame,
  CalendarFrame,
  CategoriesFrame,
  EventsFrame,
  FrameBoxes,
  FrameGridAxis,
  FramePoints,
  FrameSeries,
  FrameTreeGroup,
  FrameTreePart,
  GridFrame,
  PointsFrame,
  SeriesFrame,
  TreeFrame,
} from "../../frame/frame.js";
import { DURATION_EDGES } from "../../frame/limits.js";

const THREE_DAYS = 259_200;

/** chartdata's duration ladder in seconds, from 0 to its first edge at or
 *  above `max`, as a server bins delays on it: 3 days by default. */
export function ladder(max = THREE_DAYS): readonly number[] {
  return DURATION_EDGES.slice(0, DURATION_EDGES.findIndex((edge) => edge >= max) + 1);
}

type Values = readonly (number | null)[];

/** Series keyed by their names, in order, so the readings say them. */
export const named = (...series: (readonly [string, Values])[]): FrameSeries[] =>
  series.map(([key, values]) => ({ key, values: [...values] }));

// Series keyed "a", "b", ... in order, a value list each.
const keyed = (values: readonly Values[]): FrameSeries[] =>
  values.map((v, i) => ({ key: String.fromCharCode(97 + i), values: [...v] }));

/** A series frame over `x`, a series per values list keyed "a", "b", .... */
export const seriesFrame = (
  x: readonly number[],
  values: readonly Values[],
  more: Partial<SeriesFrame> = {},
): SeriesFrame => ({
  type: "series",
  name: "s",
  unit: "count",
  x: [...x],
  series: keyed(values),
  ...more,
});

/** A bins frame over `x1` to `x2`, a time axis unless `more` says another. */
export const binsFrame = (
  x1: readonly number[],
  x2: readonly number[],
  values: readonly Values[],
  more: Partial<BinsFrame> = {},
): BinsFrame => ({
  type: "bins",
  name: "b",
  unit: "count",
  axis: "time",
  x1: [...x1],
  x2: [...x2],
  series: keyed(values),
  ...more,
});

/** Unit bins from 0, bin i from i to i + 1, on a value axis. */
export const unitBins = (values: readonly Values[], more: Partial<BinsFrame> = {}): BinsFrame => {
  const n = values[0]?.length ?? 0;
  return binsFrame(
    Array.from({ length: n }, (_, i) => i),
    Array.from({ length: n }, (_, i) => i + 1),
    values,
    { axis: "value", ...more },
  );
};

export const categories = (
  names: readonly string[],
  values: readonly Values[],
  more: Partial<CategoriesFrame> = {},
): CategoriesFrame => ({
  type: "categories",
  name: "c",
  unit: "count",
  names: [...names],
  series: keyed(values),
  ...more,
});

/** An events frame, a row per instants list keyed by `keys`. */
export const events = (
  rows: Readonly<Record<string, readonly number[]>>,
  more: Partial<EventsFrame> = {},
): EventsFrame => ({
  type: "events",
  name: "e",
  rows: Object.entries(rows).map(([key, at]) => ({ key, at: [...at] })),
  ...more,
});

export const points = (
  series: readonly FramePoints[],
  more: Partial<PointsFrame> = {},
): PointsFrame => ({
  type: "points",
  name: "p",
  units: { x: "none", y: "none", ...(series[0]?.r === undefined ? {} : { r: "none" }) },
  series: [...series],
  ...more,
});

export const grid = (
  x: FrameGridAxis,
  y: FrameGridAxis,
  values: readonly Values[],
  more: Partial<GridFrame> = {},
): GridFrame => ({
  type: "grid",
  name: "g",
  unit: "count",
  x,
  y,
  values: values.map((row) => [...row]),
  ...more,
});

export const calendar = (
  start: number,
  values: Values,
  more: Partial<CalendarFrame> = {},
): CalendarFrame => ({
  type: "calendar",
  name: "k",
  unit: "count",
  zone: "UTC",
  start,
  values: [...values],
  ...more,
});

export const boxes = (
  names: readonly string[],
  series: readonly FrameBoxes[],
  more: Partial<BoxesFrame> = {},
): BoxesFrame => ({
  type: "boxes",
  name: "x",
  unit: "count",
  names: [...names],
  series: [...series],
  ...more,
});

export const tree = (
  nodes:
    { readonly parts: readonly FrameTreePart[] } | { readonly groups: readonly FrameTreeGroup[] },
  more: Partial<TreeFrame> = {},
): TreeFrame => ({
  type: "tree",
  name: "t",
  unit: "count",
  ...("parts" in nodes ? { parts: [...nodes.parts] } : { groups: [...nodes.groups] }),
  ...more,
});
