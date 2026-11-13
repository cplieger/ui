/**
 * words.ts — the words a chart writes and says, and their English defaults.
 * @module
 */

type Kind =
  | "stackedColumn"
  | "groupedColumn"
  | "shareColumn"
  | "column"
  | "stackedArea"
  | "shareArea"
  | "area"
  | "histogram"
  | "line"
  | "step"
  | "timeline"
  | "bar"
  | "stackedBar"
  | "groupedBar"
  | "shareBar"
  | "divergingBar"
  | "splitBar"
  | "divergingStackedBar"
  | "mirrorBar"
  | "dotPlot"
  | "rangePlot"
  | "arrowPlot"
  | "slope"
  | "scatter"
  | "bubble"
  | "heatmap"
  | "histogram2d"
  | "calendar";

/** The words the chart writes and says, each given its values already formatted. */
export interface ChartWords {
  /** The plot's aria-roledescription. Default "chart". */
  readonly chart?: string;
  /** The plot's description. Default "Arrow keys read the values. Tab leaves the chart." */
  readonly howTo?: string;
  /** The kind that starts the short description, by key, each with an
   *  English default ("Column chart", "Back-to-back bar chart", "Dot plot"
   *  and the rest). A rect on a log x is a histogram; one series of a rect
   *  is a column chart, of a bar a bar chart or, with a value below 0, a
   *  diverging one; two or more take their arrangement's kind; an area
   *  mark, or a rect with shape "area", an area chart; a scatter whose
   *  series carry r a bubble chart; a cell mark a heatmap, a 2D histogram
   *  when both its axes are binned, or with days a calendar heatmap. */
  readonly kind?: Readonly<Partial<Record<Kind, string>>>;
  /** Default "{n} series". */
  readonly seriesCount?: (n: string) => string;
  /** The plot's name. Default "{kind}, {series}, {range}", or "{kind}, {range}"
   *  for one series (series is then ""). */
  readonly shortDescription?: (kind: string, series: string, range: string) => string;
  /** A selection, as announced. parts are joined by ", "; total is a stack's
   *  formatted total, or "" when there is none. Default "{at}: {parts}. Total
   *  {total}.", or "{at}: {parts}." without a total. */
  readonly reading?: (at: string, parts: string, total: string) => string;
  /** One segment of a stack or one line series. Default "{at}: {name} {value}." */
  readonly segment?: (at: string, name: string, value: string) => string;
  /** A timeline row with no dot in the domain; unit is the dot mark's plural
   *  noun, or "" without one. Default "{name}: no {unit}", or "{name}: none". */
  readonly silentRow?: (name: string, unit: string) => string;
  /** An open rect's last bucket, or a calendar's open last day and its
   *  value in the table. Default "{range}, so far". */
  readonly soFar?: (range: string) => string;
  /** The empty state, when the spec gives no `empty`. Default "Nothing to show in this range." */
  readonly empty?: string;
  /** A span of x. Default "{from} to {to}". */
  readonly range?: (from: string, to: string) => string;
  /** The underflow bin. Default "Under {edge}". */
  readonly under?: (edge: string) => string;
  /** A stack's total. Default "Total". */
  readonly total?: string;
  /** A range plot's distance between a row's two values, in the legend
   *  row, the table head and the summary. Default "Gap". */
  readonly gap?: string;
  /** An arrow plot's second value less its first, where `gap` names a
   *  range's, and a slope's right end less its left. Default "Change". */
  readonly change?: string;
  /** A range plot's row, as announced. Default "{at}: {parts}. Gap {gap}." */
  readonly gapReading?: (at: string, parts: string, gap: string) => string;
  /** An arrow plot's row, or a slope's chosen series, as announced.
   *  Default "{at}: {parts}. Change {change}." */
  readonly changeReading?: (at: string, parts: string, change: string) => string;
  /** A null value. Default "No data". */
  readonly noData?: string;
  /** A silent row's first and last cells. Default "None". */
  readonly none?: string;
  /** A timeline's table head over each row's count, first and last dot.
   *  Defaults "Count", "First", "Last". */
  readonly count?: string;
  readonly first?: string;
  readonly last?: string;
  /** A scatter's table head over each dot's series. Default "Series". */
  readonly series?: string;
  /** A rule outside a passed domain, on the plot. Default "{label} {value}, off the axis". */
  readonly offAxis?: (label: string, value: string) => string;
  /** Equal buckets or samples. Default "every {size}". */
  readonly every?: (size: string) => string;
  /** Summary, a column chart. Default "{total}, {every} from {range}: {parts}.",
   *  or "{total} from {range}: {parts}." when every is ""; with parts "" it
   *  ends after the range. */
  readonly stackSummary?: (total: string, every: string, range: string, parts: string) => string;
  /** Summary, busiest bucket. Default "Busiest: {range}, {n}." */
  readonly busiest?: (range: string, n: string) => string;
  /** Summary, a grouped chart's largest single value. Default "Highest:
   *  {name}, {range}, {n}." */
  readonly highest?: (name: string, range: string, n: string) => string;
  /** The x range of a log x whose underflow bin is drawn below the low end;
   *  edge is the low end. Default "under {edge} to {to}". */
  readonly underRange?: (edge: string, to: string) => string;
  /** Summary, histogram. Default "{n} from {range}." */
  readonly binSummary?: (n: string, range: string) => string;
  /** Summary, a stacked histogram's series totals. Default "{parts}." */
  readonly binParts?: (parts: string) => string;
  /** Summary and table, a rule. Default "{label} {value}." */
  readonly rule?: (label: string, value: string) => string;
  /** Summary and table, a note; at is its place in words. Default "{at}: {text}.",
   *  with no stop added when the text ends in one. */
  readonly note?: (at: string, text: string) => string;
  /** A note added to the reading of the stop it joins. Default "Note: {text}.",
   *  with no stop added when the text ends in one. */
  readonly noteReading?: (text: string) => string;
  /** A band's rows when the y scale names no unit; count is n as a number,
   *  for the plural. Default "{n} categories", or "{n} category" for one. */
  readonly categories?: (n: string, count: number) => string;
  /** A scatter's dots when its mark names no unit; count is n as a number,
   *  for the plural. Default "{n} points", or "{n} point" for one. */
  readonly points?: (n: string, count: number) => string;
  /** A cell chart's size in the short description: rows and columns are
   *  the y and x counts, each in its axis's unit when it names one.
   *  Default "{rows} by {columns}". */
  readonly grid?: (rows: string, columns: string) => string;
  /** A cell chart's cells in the legend row with no selection and in the
   *  summary; count is n as a number, for the plural. Default "{n} cells",
   *  or "{n} cell" for one. */
  readonly cells?: (n: string, count: number) => string;
  /** A calendar's days in the legend row with no selection, the summary and
   *  the short description; count is n as a number, for the plural.
   *  Default "{n} days", or "{n} day" for one. */
  readonly days?: (n: string, count: number) => string;
  /** A cell's place in the legend row, the readings, the summary and a
   *  note's place: its column's and its row's name, or a bin as
   *  `measure` of its range. Default "{row}, {column}". */
  readonly cellPlace?: (column: string, row: string) => string;
  /** Summary, a cell chart; high and low are each "{place}: {value}", or ""
   *  when no cell holds a value. Default "{count}. Highest {high}. Lowest
   *  {low}.", or "{count}." without them. */
  readonly cellSummary?: (count: string, high: string, low: string) => string;
  /** A scatter dot's value with its axis label, in the legend row, the
   *  readings and a note's place. Default "{label} {value}". */
  readonly measure?: (label: string, value: string) => string;
  /** Summary, a bar, point or scatter chart's head; series is "" for one series. Default
   *  "{count}, {series}.", or "{count}." with one series. */
  readonly countSummary?: (count: string, series: string) => string;
  /** Summary, one series of a bar or point chart, or its totals under
   *  `total`, or one measure of a scatter under its label; high and low are
   *  each "{row} {value}" or "{dot} {value}". Default "{name}: highest
   *  {high}, lowest {low}." */
  readonly barSeries?: (name: string, high: string, low: string) => string;
  /** Summary, a bar or point chart of one series. Default "Highest {high},
   *  lowest {low}." */
  readonly extremes?: (high: string, low: string) => string;
  /** Summary, a bar or point series whose rows all hold one value, or a
   *  scatter measure whose dots do; name is "" for a chart's one series.
   *  Default "{name}: {value} each.", or "{value} each." */
  readonly alike?: (name: string, value: string) => string;
  /** Summary, a bar or point series with one row holding a value, or a
   *  scatter of one dot; row is "{row} {value}" and name "" for a chart's
   *  one series. Default "{name}: {row}.", or "{row}." */
  readonly only?: (name: string, row: string) => string;
  /** Summary, one series of a point chart on a time x; first and last are
   *  each "{row} {time}". Default "{name}: earliest {first}, latest {last}." */
  readonly spanSeries?: (name: string, first: string, last: string) => string;
  /** Summary, line head. Default "{range}, {every}.", or "{range}." when every is "". */
  readonly lineSummary?: (range: string, every: string) => string;
  /** Summary, one line series. Default "{name}: last {last}, low {low}, high {high}." */
  readonly lineSeries?: (name: string, last: string, low: string, high: string) => string;
  /** Summary, dot head. Default "{range}. {rows}, {n}." */
  readonly dotSummary?: (range: string, rows: string, n: string) => string;
  /** Summary, slope head; series is "" for one series. Default "{range},
   *  {series}.", or "{range}." with one series. */
  readonly slopeSummary?: (range: string, series: string) => string;
  /** Summary, one slope series; change is "" when an end is missing.
   *  Default "{name}: {from} to {to}, {change}.", or "{name}: {from} to {to}." */
  readonly slopeSeries?: (name: string, from: string, to: string, change: string) => string;
  /** Summary, a slope's largest rise. Default "Largest rise: {name} {change}." */
  readonly rise?: (name: string, change: string) => string;
  /** Summary, a slope's largest fall. Default "Largest fall: {name} {change}." */
  readonly fall?: (name: string, change: string) => string;
  /** Summary, the busiest row. Default "Most: {name}, {n}." */
  readonly most?: (name: string, n: string) => string;
  /** Summary, rows with no dot. Default "None: {names}." */
  readonly silent?: (names: string) => string;
  /** After the fifth silent name. Default "and {n} more". */
  readonly more?: (n: string) => string;
}

export type Words = Required<Omit<ChartWords, "kind">> & {
  readonly kind: Readonly<Record<Kind, string>>;
};

// An app's note may already be a sentence ("Deploy of 1.4.0."), which a second stop would end twice.
const sentence = (t: string): string => (/[.!?\u2026]$/u.test(t) ? t : `${t}.`);

const DEFAULTS: Words = {
  chart: "chart",
  howTo: "Arrow keys read the values. Tab leaves the chart.",
  kind: {
    stackedColumn: "Stacked column chart",
    groupedColumn: "Grouped column chart",
    shareColumn: "100% stacked column chart",
    column: "Column chart",
    stackedArea: "Stacked area chart",
    shareArea: "100% stacked area chart",
    area: "Area chart",
    histogram: "Histogram",
    line: "Line chart",
    step: "Step line",
    timeline: "Timeline",
    bar: "Bar chart",
    stackedBar: "Stacked bar chart",
    groupedBar: "Grouped bar chart",
    shareBar: "100% stacked bar chart",
    divergingBar: "Diverging bar chart",
    splitBar: "Split bar chart",
    divergingStackedBar: "Diverging stacked bar chart",
    mirrorBar: "Back-to-back bar chart",
    dotPlot: "Dot plot",
    rangePlot: "Range plot",
    arrowPlot: "Arrow plot",
    slope: "Slope chart",
    scatter: "Scatter plot",
    bubble: "Bubble chart",
    heatmap: "Heatmap",
    histogram2d: "2D histogram",
    calendar: "Calendar heatmap",
  },
  seriesCount: (n) => `${n} series`,
  shortDescription: (kind, series, range) =>
    series === "" ? `${kind}, ${range}` : `${kind}, ${series}, ${range}`,
  reading: (at, parts, total) =>
    total === "" ? `${at}: ${parts}.` : `${at}: ${parts}. Total ${total}.`,
  segment: (at, name, value) => `${at}: ${name} ${value}.`,
  silentRow: (name, unit) => (unit === "" ? `${name}: none` : `${name}: no ${unit}`),
  soFar: (range) => `${range}, so far`,
  empty: "Nothing to show in this range.",
  range: (from, to) => `${from} to ${to}`,
  under: (edge) => `Under ${edge}`,
  total: "Total",
  gap: "Gap",
  change: "Change",
  gapReading: (at, parts, gap) => `${at}: ${parts}. Gap ${gap}.`,
  changeReading: (at, parts, change) => `${at}: ${parts}. Change ${change}.`,
  noData: "No data",
  none: "None",
  count: "Count",
  first: "First",
  last: "Last",
  series: "Series",
  offAxis: (label, value) => `${label} ${value}, off the axis`,
  every: (size) => `every ${size}`,
  stackSummary: (total, every, range, parts) => {
    const head = every === "" ? `${total} from ${range}` : `${total}, ${every} from ${range}`;
    return parts === "" ? `${head}.` : `${head}: ${parts}.`;
  },
  busiest: (range, n) => `Busiest: ${range}, ${n}.`,
  highest: (name, range, n) => `Highest: ${name}, ${range}, ${n}.`,
  underRange: (edge, to) => `under ${edge} to ${to}`,
  binSummary: (n, range) => `${n} from ${range}.`,
  binParts: (parts) => `${parts}.`,
  rule: (label, value) => `${label} ${value}.`,
  note: (at, text) => sentence(`${at}: ${text}`),
  noteReading: (text) => sentence(`Note: ${text}`),
  categories: (n, count) => (count === 1 ? `${n} category` : `${n} categories`),
  points: (n, count) => (count === 1 ? `${n} point` : `${n} points`),
  grid: (rows, columns) => `${rows} by ${columns}`,
  cells: (n, count) => (count === 1 ? `${n} cell` : `${n} cells`),
  days: (n, count) => (count === 1 ? `${n} day` : `${n} days`),
  cellPlace: (column, row) => `${row}, ${column}`,
  cellSummary: (count, high, low) =>
    high === "" ? `${count}.` : `${count}. Highest ${high}. Lowest ${low}.`,
  measure: (label, value) => `${label} ${value}`,
  countSummary: (count, series) => (series === "" ? `${count}.` : `${count}, ${series}.`),
  barSeries: (name, high, low) => `${name}: highest ${high}, lowest ${low}.`,
  extremes: (high, low) => `Highest ${high}, lowest ${low}.`,
  alike: (name, value) => (name === "" ? `${value} each.` : `${name}: ${value} each.`),
  only: (name, row) => (name === "" ? `${row}.` : `${name}: ${row}.`),
  spanSeries: (name, first, last) => `${name}: earliest ${first}, latest ${last}.`,
  lineSummary: (range, every) => (every === "" ? `${range}.` : `${range}, ${every}.`),
  lineSeries: (name, last, low, high) => `${name}: last ${last}, low ${low}, high ${high}.`,
  dotSummary: (range, rows, n) => `${range}. ${rows}, ${n}.`,
  slopeSummary: (range, series) => (series === "" ? `${range}.` : `${range}, ${series}.`),
  slopeSeries: (name, from, to, change) =>
    change === "" ? `${name}: ${from} to ${to}.` : `${name}: ${from} to ${to}, ${change}.`,
  rise: (name, change) => `Largest rise: ${name} ${change}.`,
  fall: (name, change) => `Largest fall: ${name} ${change}.`,
  most: (name, n) => `Most: ${name}, ${n}.`,
  silent: (names) => `None: ${names}.`,
  more: (n) => `and ${n} more`,
};

/** `words` over the defaults, member by member. */
export function chartWords(words: ChartWords = {}): Words {
  const given = Object.fromEntries(Object.entries(words).filter(([, v]) => v !== undefined));
  return { ...DEFAULTS, ...given, kind: { ...DEFAULTS.kind, ...words.kind } };
}
