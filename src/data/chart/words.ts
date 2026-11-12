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
  | "timeline";

/** The words the chart writes and says, each given its values already formatted. */
export interface ChartWords {
  /** The plot's aria-roledescription. Default "chart". */
  readonly chart?: string;
  /** The plot's description. Default "Arrow keys read the values. Tab leaves the chart." */
  readonly howTo?: string;
  /** The kind in the short description. Defaults "Stacked column chart",
   *  "Grouped column chart", "100% stacked column chart", "Column chart",
   *  "Stacked area chart", "100% stacked area chart", "Area chart",
   *  "Histogram", "Line chart", "Step line", "Timeline". A rect on a log x is
   *  a histogram however it is shaped or arranged; any other rect is a column
   *  or, with shape "area", an area chart, its stacked, grouped or 100% kind
   *  with two or more series. */
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
  /** An open rect's last bucket. Default "{range}, so far". */
  readonly soFar?: (range: string) => string;
  /** The empty state, when the spec gives no `empty`. Default "Nothing to show in this range." */
  readonly empty?: string;
  /** A span of x. Default "{from} to {to}". */
  readonly range?: (from: string, to: string) => string;
  /** The underflow bin. Default "Under {edge}". */
  readonly under?: (edge: string) => string;
  /** A stack's total. Default "Total". */
  readonly total?: string;
  /** A null value. Default "No data". */
  readonly noData?: string;
  /** A silent row's first and last cells. Default "None". */
  readonly none?: string;
  /** A timeline's table head over each row's count, first and last dot.
   *  Defaults "Count", "First", "Last". */
  readonly count?: string;
  readonly first?: string;
  readonly last?: string;
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
  /** Summary and table, a note; at is its place in words. Default "{at}: {text}." */
  readonly note?: (at: string, text: string) => string;
  /** A note added to the reading of the stop it joins. Default "Note: {text}." */
  readonly noteReading?: (text: string) => string;
  /** Summary, line head. Default "{range}, {every}.", or "{range}." when every is "". */
  readonly lineSummary?: (range: string, every: string) => string;
  /** Summary, one line series. Default "{name}: last {last}, low {low}, high {high}." */
  readonly lineSeries?: (name: string, last: string, low: string, high: string) => string;
  /** Summary, dot head. Default "{range}. {rows}, {n}." */
  readonly dotSummary?: (range: string, rows: string, n: string) => string;
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
  noData: "No data",
  none: "None",
  count: "Count",
  first: "First",
  last: "Last",
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
  note: (at, text) => `${at}: ${text}.`,
  noteReading: (text) => `Note: ${text}.`,
  lineSummary: (range, every) => (every === "" ? `${range}.` : `${range}, ${every}.`),
  lineSeries: (name, last, low, high) => `${name}: last ${last}, low ${low}, high ${high}.`,
  dotSummary: (range, rows, n) => `${range}. ${rows}, ${n}.`,
  most: (name, n) => `Most: ${name}, ${n}.`,
  silent: (names) => `None: ${names}.`,
  more: (n) => `and ${n} more`,
};

/** `words` over the defaults, member by member. */
export function chartWords(words: ChartWords = {}): Words {
  const given = Object.fromEntries(Object.entries(words).filter(([, v]) => v !== undefined));
  return { ...DEFAULTS, ...given, kind: { ...DEFAULTS.kind, ...words.kind } };
}
