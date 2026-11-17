/**
 * The chart data frames `github.com/cplieger/go/chartdata` sends, as the
 * types its contract generates, at the version `contract/chartdata.json` pins.
 * @module
 */
import type {
  BinsFrame,
  BoxesFrame,
  CalendarFrame,
  CategoriesFrame,
  EventsFrame,
  FlowFrame,
  GridFrame,
  PointsFrame,
  SeriesFrame,
  StatesFrame,
  TreeFrame,
  ValueFrame,
} from "./contract/frame.js";

export type * from "./contract/frame.js";

/**
 * Any of the twelve frames. Every frame's `type` is typed as the whole
 * `FrameType`, so only a run-time check of `type` tells them apart.
 */
export type Frame =
  | BinsFrame
  | BoxesFrame
  | CalendarFrame
  | CategoriesFrame
  | EventsFrame
  | FlowFrame
  | GridFrame
  | PointsFrame
  | SeriesFrame
  | StatesFrame
  | TreeFrame
  | ValueFrame;
