/**
 * check.ts — the door every chart spec passes: the chart's own copy, read
 * once, its frame through the frame reader, its mark and encodings checked
 * against that frame, and the pair translated into the plot it draws.
 * @module
 */

import type {
  BinsFrame,
  BoxesFrame,
  CalendarFrame,
  CategoriesFrame,
  EventsFrame,
  Frame,
  FrameNote,
  FrameRef,
  FrameType,
  GridFrame,
  PointsFrame,
  SeriesFrame,
  TreeFrame,
} from "../frame/frame.js";
import { MAX_MAGNITUDE, MAX_ROWS, MAX_SUB_ROWS, MAX_VALUES } from "../frame/limits.js";
import { door, readFrame } from "../frame/read.js";
import { writer, type Format } from "../scale/format.js";
import { position } from "../scale/position.js";

import type { Input, Plot, PlotPanel, Unplaced } from "./plot.js";
import { withinDate } from "./scales.js";

type Door = ReturnType<typeof door>;
type Rec = Record<string, unknown>;

// Datawrapper's advice is to show fewer panels than first planned; past this
// many no reader compares them, and the grid would scroll for screens.
const MOST_PANELS = 100;

// A thousand of the y axis's 40px tick spaces, so a plot draws at most
// about a thousand y ticks. A box's sub-row is 16px and a grouped bar's 13px
// at the default text size, so MAX_SUB_ROWS of them must fit in it (tested).
const MOST_HEIGHT = 40_000;

/** A plot's ceilings: the figure's, shared out evenly among its panels,
 *  since each panel draws a plot of its own. */
export interface Room {
  readonly rows: number;
  readonly subRows: number;
  readonly height: number;
  /** What an error adds after a ceiling: "" for a lone plot. */
  readonly each: string;
}

export function room(panels: number): Room {
  return {
    rows: Math.floor(MAX_ROWS / panels),
    subRows: Math.floor(MAX_SUB_ROWS / panels),
    height: Math.floor(MOST_HEIGHT / panels),
    each: panels > 1 ? ` in each of ${String(panels)} panels` : "",
  };
}

/** The thinnest of `edges`' bins, as a share of the axis from the first
 *  edge to the last on a `type` scale. */
export function thinnestBin(type: "linear" | "log" | "time", edges: readonly number[]): number {
  const at = position(type, edges[0] ?? 0, edges.at(-1) ?? 1, 0, 1);
  let least = 1;
  for (let i = 1; i < edges.length; i++) {
    least = Math.min(least, at(edges[i] ?? 0) - at(edges[i - 1] ?? 0));
  }
  return least;
}

function fail(message: string, type: ErrorConstructor = TypeError): never {
  throw new type(`renderChart: ${message}`);
}

const isObject = (v: unknown): v is Rec => typeof v === "object" && v !== null;

const isArray = (v: unknown): v is readonly unknown[] => Array.isArray(v);

const anyBut = (list: readonly unknown[], ok: (v: unknown) => boolean): boolean =>
  list.some((v) => !ok(v));

function optional(v: unknown, type: "string" | "boolean" | "number", what: string): void {
  if (v !== undefined && typeof v !== type) {
    fail(`${what} must be a ${type}`);
  }
}

const SCALE_TYPES = new Set(["linear", "log", "time", "band"]);
const FORMATS = new Set(["number", "integer", "percent", "duration"]);
const SIDES = new Set(["above", "below", "left", "right"]);

// Intl.PluralRules selects only these (Intl.LDMLPluralRule).
const PLURALS = new Set(["zero", "one", "two", "few", "many", "other"]);

function checkUnit(unit: unknown, what: string): void {
  if (unit === undefined) {
    return;
  }
  if (!(isObject(unit) && typeof unit["other"] === "string")) {
    fail(`${what}.unit must name its "other" form`);
  }
  for (const [key, v] of Object.entries(unit)) {
    if (!PLURALS.has(key)) {
      fail(
        `${what}.unit.${key} is no plural form; a unit takes zero, one, two, few, many and other`,
      );
    }
    optional(v, "string", `${what}.unit.${key}`);
  }
}

function checkFormat(format: unknown, what: string): void {
  const ok =
    format === undefined ||
    typeof format === "function" ||
    isObject(format) ||
    (typeof format === "string" && FORMATS.has(format));
  if (!ok) {
    fail(`${what}.format must be a format name, Intl options or a function`);
  }
  if (isObject(format)) {
    for (const [key, v] of Object.entries(format)) {
      if (
        v !== undefined &&
        typeof v !== "string" &&
        typeof v !== "number" &&
        typeof v !== "boolean"
      ) {
        fail(`${what}.format.${key} must be a string, a number or a boolean`);
      }
    }
    // Intl names a bad option ("unit", "signDisplay") only once it builds the
    // format: a RangeError for a value it lacks, a TypeError for a missing one.
    try {
      writer(format, undefined);
    } catch (e) {
      fail(
        `${what}.format holds options Intl refuses: ${(e as Error).message}`,
        e instanceof TypeError ? TypeError : RangeError,
      );
    }
  }
}

// Infinite and non-numeric values are each check's own to refuse, in its own words.
function within(values: Iterable<unknown>, what: string): void {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) > MAX_MAGNITUDE) {
      fail(`${what} must lie within ±1e300`, RangeError);
    }
  }
}

function checkDomain(domain: unknown, what: string): void {
  if (domain !== undefined && !(isArray(domain) && domain.length === 2)) {
    fail(`${what}.domain must be an array of a low and a high`);
  }
  if (isArray(domain)) {
    if (anyBut(domain, (v) => typeof v === "number")) {
      fail(`${what}.domain must be two numbers`);
    }
    within(domain, `${what}.domain`);
  }
}

function checkScale(scale: unknown, what: string): void {
  if (!isObject(scale)) {
    fail(`${what} must be an object`);
  }
  const { type } = scale;
  if (type !== undefined && !(typeof type === "string" && SCALE_TYPES.has(type))) {
    fail(`${what}.type must be "linear", "log", "time" or "band"`);
  }
  optional(scale["label"], "string", `${what}.label`);
  for (const flag of ["zero", "mono", "reverse"]) {
    optional(scale[flag], "boolean", `${what}.${flag}`);
  }
  checkUnit(scale["unit"], what);
  checkFormat(scale["format"], what);
  checkDomain(scale["domain"], what);
}

// A cell chart's colour classes come from `steps` over a domain, or from
// `thresholds` alone; `pivot` and `reverse` place a diverging scale's arms.
function checkColour(colour: unknown): void {
  if (!isObject(colour)) {
    fail("colour must be an object");
  }
  const { type, steps, domain, thresholds, pivot, reverse } = colour;
  if (type !== undefined && type !== "sequential" && type !== "diverging") {
    fail('colour.type must be "sequential" or "diverging"');
  }
  optional(colour["label"], "string", "colour.label");
  checkUnit(colour["unit"], "colour");
  checkFormat(colour["format"], "colour");
  checkDomain(domain, "colour");
  if (
    steps !== undefined &&
    !(typeof steps === "number" && Number.isInteger(steps) && steps >= 2 && steps <= 9)
  ) {
    fail("colour.steps must be a whole number of classes from 2 to 9");
  }
  if (thresholds !== undefined) {
    if (!isArray(thresholds) || anyBut(thresholds, (t) => typeof t === "number")) {
      fail("colour.thresholds must be an array of numbers");
    }
    for (const [field, v] of [
      ["steps", steps],
      ["domain", domain],
      ["pivot", pivot],
    ] as const) {
      if (v !== undefined) {
        fail(`colour.${field} has no place beside thresholds, which place every class`);
      }
    }
    const list = thresholds as readonly number[];
    if (list.length < 1 || list.length > 8) {
      fail("colour.thresholds must hold one to eight boundaries, for 2 to 9 classes", RangeError);
    }
    if (list.some((t, k) => !Number.isFinite(t) || (k > 0 && t <= (list[k - 1] ?? 0)))) {
      fail("colour.thresholds must be finite and strictly increase", RangeError);
    }
    within(list, "colour.thresholds");
  }
  if (isArray(domain)) {
    const [lo, hi] = domain as readonly [number, number];
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo >= hi) {
      fail("colour.domain must be finite, low below high", RangeError);
    }
  }
  optional(pivot, "number", "colour.pivot");
  if (typeof pivot === "number" && !Number.isFinite(pivot)) {
    fail("colour.pivot must be finite", RangeError);
  }
  within([pivot], "colour.pivot");
  optional(reverse, "boolean", "colour.reverse");
  if (type !== "diverging") {
    for (const [field, v] of [
      ["pivot", pivot],
      ["reverse", reverse],
    ] as const) {
      if (v !== undefined) {
        fail(`colour.${field} has no place on a sequential scale, which has no middle`);
      }
    }
  }
}

function checkSlot(slot: unknown, what: string): void {
  if (slot === undefined) {
    return;
  }
  if (typeof slot !== "number") {
    fail(`${what} must be a number`);
  }
  if (!Number.isInteger(slot) || slot < 1 || slot > 9) {
    fail(`${what} must be 1 to 9`, RangeError);
  }
}

function oneOf(v: unknown, list: readonly string[], what: string): void {
  if (v !== undefined && !(typeof v === "string" && list.includes(v))) {
    const quoted = list.map((s) => `"${s}"`);
    fail(`${what} must be ${quoted.slice(0, -1).join(", ")} or ${quoted.at(-1) ?? ""}`);
  }
}

// `names` of `v`, each read once, in an object of the chart's own.
function fields(v: Rec, names: readonly string[]): Rec {
  const out: Rec = {};
  for (const name of names) {
    const field = v[name];
    if (field !== undefined) {
      out[name] = field;
    }
  }
  return out;
}

function put(copy: Rec, key: string, to: (v: unknown) => unknown): void {
  if (copy[key] !== undefined) {
    copy[key] = to(copy[key]);
  }
}

// A unit's forms or a format's Intl options, which their checks read as entries.
const entries = (v: unknown): unknown => (isObject(v) ? Object.fromEntries(Object.entries(v)) : v);

const SCALE = ["type", "label", "unit", "domain", "zero", "format", "mono", "reverse"];
const COLOUR = [
  "type",
  "steps",
  "domain",
  "thresholds",
  "pivot",
  "reverse",
  "label",
  "unit",
  "format",
];

type Kind =
  | "rect"
  | "line"
  | "area"
  | "dot"
  | "bar"
  | "point"
  | "slope"
  | "scatter"
  | "cell"
  | "box"
  | "pie"
  | "tree";

// Each mark's frame types and its own fields: what spec.ts documents.
const MARKS: Readonly<Record<Kind, readonly [readonly FrameType[], readonly string[]]>> = {
  rect: [["bins"], ["arrange", "shape", "keys"]],
  line: [["series"], ["curve", "keys"]],
  area: [["series"], ["curve", "arrange", "keys"]],
  dot: [["events"], ["slot", "unit", "keys"]],
  bar: [["categories"], ["arrange", "left", "centre", "labels", "keys"]],
  point: [["categories"], ["link", "keys"]],
  slope: [["categories"], ["keys"]],
  scatter: [["points"], ["unit", "keys"]],
  cell: [["grid", "calendar"], ["weekStart"]],
  box: [["boxes"], ["whiskers", "keys"]],
  pie: [["categories"], ["hole", "unit", "format", "keys"]],
  tree: [["tree"], ["slot", "unit", "format", "keys"]],
};

const isKind = (v: unknown): v is Kind => typeof v === "string" && Object.hasOwn(MARKS, v);

// The marks that draw in panels: a timeline is already a row per name on one
// scale, a slope holds few lines, and a treemap's equal areas in two panels
// would be unequal values.
const FACETED = new Set<Kind>([
  "rect",
  "line",
  "area",
  "bar",
  "point",
  "scatter",
  "box",
  "cell",
  "pie",
]);

// A list of encodings, each an object of `names` keyed by its own `key`,
// two of one key refused. The page's words are no values, so the list is
// bounded by its length alone and charges nothing.
function encodings(v: unknown, field: string, names: readonly string[], d: Door): Map<string, Rec> {
  const out = new Map<string, Rec>();
  if (v === undefined) {
    return out;
  }
  d.list(v, field, {
    each: (one, i) => {
      const at = `${field}[${String(i)}]`;
      if (!isObject(one)) {
        return fail(`${at} must be an object`);
      }
      const copy = fields(one, names);
      const key = copy["key"];
      if (typeof key !== "string") {
        return fail(`${at}.key must be a string`);
      }
      if (out.has(key)) {
        fail(`${at}.key "${key}" is given twice; each key takes one entry`, RangeError);
      }
      out.set(key, { ...copy, at });
      return copy;
    },
  });
  return out;
}

interface MarkCopy {
  readonly kind: Kind;
  readonly m: Rec;
  readonly keys: Map<string, Rec>;
}

function readMark(v: unknown, d: Door): MarkCopy {
  if (!isObject(v)) {
    return fail("mark must be an object");
  }
  const kind = v["mark"];
  if (!isKind(kind)) {
    return fail(
      'mark.mark must be "rect", "line", "area", "dot", "bar", "point", "slope", "scatter", "cell", "box", "pie" or "tree"',
    );
  }
  const m = fields(v, MARKS[kind][1]);
  put(m, "unit", entries);
  put(m, "format", entries);
  const keys = encodings(m["keys"], "mark.keys", ["key", "name", "slot", "below"], d);
  for (const k of keys.values()) {
    const at = String(k["at"]);
    optional(k["name"], "string", `${at}.name`);
    if (kind === "dot" && k["slot"] !== undefined) {
      fail(`${at}.slot has no place on a dot mark, whose rows take its slot`);
    }
    checkSlot(k["slot"], `${at}.slot`);
    if (kind !== "bar" && k["below"] !== undefined) {
      fail(`${at}.below has no place outside a bar mark`);
    }
    checkSlot(k["below"], `${at}.below`);
  }
  checkUnit(m["unit"], "mark");
  checkFormat(m["format"], "mark");
  return { kind, m, keys };
}

const nameFor = (c: MarkCopy, key: string): string => {
  const name = c.keys.get(key)?.["name"];
  return typeof name === "string" ? name : key;
};

// The page's name and slot for frame key `key`, the `i`th of its list, at
// field `at`.
function word(c: MarkCopy, key: string, i: number, at: string, slots = true): Rec {
  const slot = c.keys.get(key)?.["slot"];
  if (slots && slot === undefined && i >= 9) {
    fail(
      `${at} needs a slot in mark.keys, since series past the ninth take none of their own`,
      RangeError,
    );
  }
  return {
    name: nameFor(c, key),
    ...(slot === undefined ? {} : { slot }),
  };
}

const UNIT_FORMATS = new Map<string, Format>([
  ["seconds", "duration"],
  ["ratio", "percent"],
]);

// `scale` with the format the frame's unit gives, unless it names its own.
function withUnit(scale: unknown, unit: string | undefined): Rec | undefined {
  const format = unit === undefined ? undefined : UNIT_FORMATS.get(unit);
  const own = isObject(scale) ? scale : undefined;
  if (format === undefined || own?.["format"] !== undefined) {
    return own;
  }
  return { ...own, format };
}

interface Scales {
  x?: Rec | undefined;
  y?: Rec | undefined;
  r?: Rec | undefined;
  colour?: Rec | undefined;
}

// The scales `spec` passes, with the type, domain and formats the frame sets.
function scalesOf(spec: Rec, frame: Frame, c: MarkCopy): Scales {
  const { kind, m } = c;
  const out: Scales = {};
  for (const name of ["x", "y", "r", "colour"] as const) {
    const v = spec[name];
    if (isObject(v)) {
      out[name] = v;
    }
  }
  const share = m["arrange"] === "share";
  const unit = "unit" in frame ? frame.unit : undefined;
  switch (kind) {
    case "rect": {
      const bins = frame as BinsFrame;
      const type = out.x?.["type"];
      if (bins.axis === "time") {
        if (type !== undefined && type !== "time") {
          fail('x.type must be "time", since data.axis is "time"');
        }
        out.x = { ...out.x, type: "time" };
        if (!share) {
          out.y = withUnit(out.y, unit);
        }
      } else {
        if (type === "time" || type === "band") {
          fail('x.type must be "linear" or "log", since data.axis is "value"');
        }
        out.x = withUnit(out.x, unit);
      }
      break;
    }
    case "line":
    case "area":
      if (!share) {
        out.y = withUnit(out.y, unit);
      }
      break;
    case "dot": {
      const type = out.x?.["type"];
      if (type !== undefined && type !== "time") {
        fail('x.type must be "time" under a dot mark, whose frame holds instants');
      }
      out.x = { ...out.x, type: "time" };
      break;
    }
    case "bar":
      if (!share) {
        out.x = withUnit(out.x, unit);
      }
      break;
    case "point":
    case "box":
      out.x = withUnit(out.x, unit);
      break;
    case "slope":
      out.y = withUnit(out.y, unit);
      break;
    case "scatter": {
      const { units } = frame as PointsFrame;
      out.x = withUnit(out.x, units.x);
      out.y = withUnit(out.y, units.y);
      if (units.r !== undefined) {
        out.r = withUnit(out.r, units.r);
      }
      break;
    }
    case "cell":
      out.colour = withUnit(out.colour, unit);
      break;
    case "pie":
    case "tree":
      break;
  }
  const domain = "domain" in frame ? frame.domain : undefined;
  if (domain !== undefined && out.x?.["domain"] === undefined) {
    out.x = { ...out.x, domain };
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
}

// The axis a ref sits on by default, the one carrying the frame's unit, and
// the axes the mark has a continuous scale on.
function refAxes(kind: Kind, frame: Frame): readonly [("x" | "y") | undefined, readonly string[]] {
  switch (kind) {
    case "rect":
      return [(frame as BinsFrame).axis === "time" ? "y" : "x", ["x", "y"]];
    case "line":
    case "area":
    case "scatter":
      return ["y", ["x", "y"]];
    case "dot":
    case "bar":
    case "point":
    case "box":
      return ["x", ["x"]];
    case "slope":
      return ["y", ["y"]];
    case "cell": {
      // A grid's binned axes are continuous, so a ref may name one; its
      // unit is on the colour, which holds no rule.
      const grid = frame.type === "grid" ? (frame as GridFrame) : undefined;
      const binned = (["x", "y"] as const).filter((a) => grid?.[a].edges !== undefined);
      return [undefined, binned];
    }
    case "pie":
    case "tree":
      return [undefined, []];
  }
}

// Whether a note has an x place: a split, diverging or mirrored bar's x is
// a place in every panel or on both sides, and a slope's, a grid of names'
// or a whole's x is no value. A split of one series draws a plain bar.
function notesPlaced(kind: Kind, input: Rec): boolean {
  switch (kind) {
    case "bar": {
      const { arrange } = input;
      const series = (input["series"] as readonly unknown[]).length;
      return !(
        arrange === "diverge" ||
        arrange === "mirror" ||
        (arrange === "split" && series > 1)
      );
    }
    case "cell":
      return input["days"] !== undefined || !isArray(input["x"]);
    case "slope":
    case "pie":
    case "tree":
      return false;
    default:
      return true;
  }
}

interface Words {
  readonly refs: Map<string, Rec>;
  readonly notes: Map<string, Rec>;
}

// The rules and notes of `refs` and `notes`, at field `f`, beside data mark
// `input`; those with no place on the plot go to `unplaced`.
function marksOf(
  refs: readonly FrameRef[],
  notes: readonly FrameNote[],
  f: string,
  c: MarkCopy,
  frame: Frame,
  input: Rec,
  words: Words,
  scales: Scales,
): { marks: Input[]; unplaced: Unplaced } {
  const [axis, axes] = refAxes(c.kind, frame);
  const marks: Input[] = [];
  const rules: Unplaced["rules"][number][] = [];
  for (const ref of refs) {
    const w = words.refs.get(ref.key);
    const label = typeof w?.["label"] === "string" ? w["label"] : ref.key;
    const on = (w?.["axis"] as "x" | "y" | undefined) ?? axis;
    if (on === undefined) {
      rules.push({ label, value: ref.value });
    } else {
      marks.push(
        on === "x" ? { mark: "rule", x: ref.value, label } : { mark: "rule", y: ref.value, label },
      );
    }
  }
  const placed = notesPlaced(c.kind, input);
  const log = scales.x?.["type"] === "log";
  const texts: Unplaced["notes"][number][] = [];
  notes.forEach((note, i) => {
    const w = words.notes.get(note.key);
    const text = typeof w?.["text"] === "string" ? w["text"] : note.key;
    if (!placed) {
      texts.push({ text, at: note.at });
      return;
    }
    if (log && note.at <= 0) {
      fail(`${f}.notes[${String(i)}].at must be above 0 on a log x`, RangeError);
    }
    const side = w?.["side"];
    marks.push({
      mark: "text",
      x: note.at,
      text,
      ...(side === undefined ? {} : { side }),
    } as Input);
  });
  for (const w of words.refs.values()) {
    const given = w["axis"];
    if (typeof given === "string" && !axes.includes(given)) {
      fail(
        `${String(w["at"])}.axis "${given}" has no place beside a ${c.kind} mark, which has no continuous ${given} scale for a rule`,
      );
    }
  }
  return { marks, unplaced: { rules, notes: texts } };
}

function checkDiverge(m: Rec, count: number): void {
  const { left, centre } = m;
  optional(centre, "boolean", "mark.centre");
  if (m["arrange"] !== "diverge") {
    for (const [field, v] of [
      ["left", left],
      ["centre", centre],
    ] as const) {
      if (v !== undefined) {
        fail(`mark.${field} has no place outside arrange "diverge"`);
      }
    }
    return;
  }
  if (count < (centre === true ? 3 : 2)) {
    fail(
      centre === true
        ? 'mark.arrange "diverge" with centre needs three or more series: left, centre and right'
        : 'mark.arrange "diverge" needs two or more series, one each side of 0',
    );
  }
  if (typeof left !== "number") {
    fail('mark.left must be a number: how many series lie left of 0 under arrange "diverge"');
  }
  const most = count - (centre === true ? 2 : 1);
  if (!Number.isInteger(left) || left < 1 || left > most) {
    fail(
      `mark.left must be a whole number from 1 to ${String(most)}, leaving a series ${centre === true ? "to straddle 0 and one " : ""}right of 0`,
      RangeError,
    );
  }
}

function shareOfTwo(m: Rec, count: number): void {
  if (m["arrange"] === "share" && count < 2) {
    fail('mark.arrange "share" needs two or more series, since one reads 100% everywhere');
  }
}

function checkRows(names: readonly string[], f: string, most: Room): void {
  if (names.length > most.rows) {
    fail(`${f}.names must name at most ${String(most.rows)} rows${most.each}`, RangeError);
  }
}

function checkSubRows(rows: number, across: number, f: string, most: Room): void {
  if (rows * across > most.subRows) {
    fail(
      `${f}.series must take at most ${String(most.subRows)} sub-rows${most.each}, a sub-row per series in each row, since the plot is as tall as its rows`,
      RangeError,
    );
  }
}

const opt = (key: string, v: unknown): Rec => (v === undefined ? {} : { [key]: v });

// The data mark of `frame`, read at field `f`, in the drawing's terms.
function dataInput(frame: Frame, f: string, c: MarkCopy, most: Room): Rec {
  const { kind, m } = c;
  const seriesOf = (list: readonly { key: string }[], at: string) =>
    list.map((s, i) => word(c, s.key, i, `${at}[${String(i)}]`));
  switch (kind) {
    case "rect": {
      const b = frame as BinsFrame;
      oneOf(m["arrange"], ["stack", "group", "share"], "mark.arrange");
      oneOf(m["shape"], ["bars", "area"], "mark.shape");
      if (m["shape"] === "area" && m["arrange"] === "group") {
        fail('mark.shape "area" takes no arrange "group", since areas cannot stand side by side');
      }
      shareOfTwo(m, b.series.length);
      const words = seriesOf(b.series, `${f}.series`);
      return {
        mark: "rect",
        x1: b.x1,
        x2: b.x2,
        ...opt("open", b.open),
        ...opt("arrange", m["arrange"]),
        ...opt("shape", m["shape"]),
        series: b.series.map((s, i) => ({ ...words[i], y: s.values })),
        ...opt("breaks", b.resets),
      };
    }
    case "line":
    case "area": {
      const s = frame as SeriesFrame;
      oneOf(m["curve"], ["linear", "step"], "mark.curve");
      if (kind === "area") {
        oneOf(m["arrange"], ["stack", "share"], "mark.arrange");
        shareOfTwo(m, s.series.length);
      }
      const words = seriesOf(s.series, `${f}.series`);
      return {
        mark: kind,
        x: s.x,
        ...opt("curve", m["curve"]),
        ...opt("arrange", m["arrange"]),
        series: s.series.map((one, i) => ({ ...words[i], y: one.values })),
        ...opt("breaks", s.resets),
      };
    }
    case "dot": {
      const e = frame as EventsFrame;
      checkSlot(m["slot"], "mark.slot");
      return {
        mark: "dot",
        ...opt("slot", m["slot"]),
        ...opt("unit", m["unit"]),
        rows: e.rows.map((r, i) => ({
          name: word(c, r.key, i, "", false)["name"],
          x: r.at,
        })),
      };
    }
    case "bar": {
      const g = frame as CategoriesFrame;
      const { arrange } = m;
      oneOf(arrange, ["stack", "group", "share", "split", "diverge", "mirror"], "mark.arrange");
      optional(m["labels"], "boolean", "mark.labels");
      if ((arrange === "share" || arrange === "diverge") && m["labels"] !== undefined) {
        fail(
          arrange === "share"
            ? 'mark.labels has no place under arrange "share", whose rows all reach 100%'
            : 'mark.labels has no place under arrange "diverge", whose bars run either side of 0',
        );
      }
      const count = g.series.length;
      shareOfTwo(m, count);
      if (arrange === "mirror" && count !== 2) {
        fail('mark.arrange "mirror" needs exactly two series, one each side of its spine');
      }
      checkDiverge(m, count);
      checkRows(g.names, f, most);
      checkSubRows(g.names.length, arrange === "group" || arrange === "split" ? count : 1, f, most);
      const words = seriesOf(g.series, `${f}.series`);
      return {
        mark: "bar",
        y: g.names,
        ...opt("arrange", arrange),
        ...opt("left", m["left"]),
        ...opt("centre", m["centre"]),
        ...opt("labels", m["labels"]),
        series: g.series.map((s, i) => {
          const below = c.keys.get(s.key)?.["below"];
          if (below !== undefined && count > 1) {
            fail(
              `${String(c.keys.get(s.key)?.["at"])}.below has no place beside other series, whose slots tell them apart`,
            );
          }
          return { ...words[i], ...opt("below", below), x: s.values };
        }),
      };
    }
    case "point": {
      const g = frame as CategoriesFrame;
      oneOf(m["link"], ["range", "arrow"], "mark.link");
      const link = m["link"];
      if (typeof link === "string" && g.series.length !== 2) {
        fail(`mark.link "${link}" needs exactly two series, the two ends it joins`);
      }
      checkRows(g.names, f, most);
      const words = seriesOf(g.series, `${f}.series`);
      return {
        mark: "point",
        y: g.names,
        ...opt("link", m["link"]),
        series: g.series.map((s, i) => ({ ...words[i], x: s.values })),
      };
    }
    case "slope": {
      const g = frame as CategoriesFrame;
      if (g.names.length !== 2) {
        fail(`${f}.names must hold exactly two names, a slope's columns left to right`);
      }
      const words = seriesOf(g.series, `${f}.series`);
      // The legend row, the readings and the table name a series by its name alone.
      const names = words.map((w) => w["name"]);
      if (names.some((n, k) => names.indexOf(n) !== k)) {
        fail("mark.keys must give each series of a slope its own name", RangeError);
      }
      return {
        mark: "slope",
        x: g.names,
        series: g.series.map((s, i) => ({ ...words[i], y: s.values })),
      };
    }
    case "scatter": {
      const p = frame as PointsFrame;
      const words = seriesOf(p.series, `${f}.series`);
      return {
        mark: "scatter",
        ...opt("unit", m["unit"]),
        series: p.series.map((s, i) => ({
          ...words[i],
          names: s.names,
          x: s.x,
          y: s.y,
          ...opt("r", s.r),
        })),
      };
    }
    case "cell": {
      const weekStart = m["weekStart"];
      if (frame.type === "calendar") {
        const k = frame as CalendarFrame;
        if (
          weekStart !== undefined &&
          !(
            typeof weekStart === "number" &&
            Number.isInteger(weekStart) &&
            weekStart >= 1 &&
            weekStart <= 7
          )
        ) {
          fail("mark.weekStart must be an ISO weekday from 1 (Monday) to 7 (Sunday)");
        }
        return {
          mark: "cell",
          days: { start: k.start, values: k.values, ...opt("open", k.open) },
          ...opt("weekStart", weekStart),
        };
      }
      if (weekStart !== undefined) {
        fail("mark.weekStart has no place beside a grid frame; only a calendar lays out weeks");
      }
      const grid = frame as GridFrame;
      const axis = (a: GridFrame["x"]) => a.names ?? { edges: a.edges ?? [] };
      if (grid.y.names !== undefined && grid.y.names.length > most.rows) {
        fail(`${f}.y.names must name at most ${String(most.rows)} rows${most.each}`, RangeError);
      }
      return { mark: "cell", x: axis(grid.x), y: axis(grid.y), values: grid.values };
    }
    case "box": {
      const b = frame as BoxesFrame;
      const { whiskers } = m;
      if (whiskers !== undefined && !(typeof whiskers === "string" && whiskers.trim() !== "")) {
        fail("mark.whiskers must be a non-empty string naming the whiskers' convention");
      }
      checkRows(b.names, f, most);
      checkSubRows(b.names.length, b.series.length, f, most);
      const words = seriesOf(b.series, `${f}.series`);
      return {
        mark: "box",
        y: b.names,
        ...opt("whiskers", whiskers),
        series: b.series.map((s, i) => ({
          ...words[i],
          low: s.low,
          q1: s.q1,
          median: s.median,
          q3: s.q3,
          high: s.high,
          ...opt("outliers", s.outliers),
        })),
      };
    }
    case "pie": {
      const g = frame as CategoriesFrame;
      optional(m["hole"], "boolean", "mark.hole");
      const [one] = g.series;
      if (one === undefined || g.series.length > 1) {
        fail(`${f}.series must hold one series, the whole a pie divides`);
      }
      return {
        mark: "pie",
        ...opt("hole", m["hole"]),
        ...opt("unit", m["unit"]),
        ...opt("format", m["format"] ?? UNIT_FORMATS.get(g.unit)),
        slices: g.names.map((name, i) => {
          const value = one.values[i] ?? null;
          if (value !== null && value < 0) {
            fail(
              `${f}.series[0].values[${String(i)}] cannot be negative; a slice is a part of the whole`,
              RangeError,
            );
          }
          return { ...word(c, name, i, `${f}.names[${String(i)}]`), value };
        }),
      };
    }
    case "tree": {
      const t = frame as TreeFrame;
      checkSlot(m["slot"], "mark.slot");
      const groups = t.groups !== undefined && t.groups.length > 0;
      if (groups && m["slot"] !== undefined) {
        fail("mark.slot has no place beside groups, which take a slot each");
      }
      const value = (v: number | null | undefined) => v ?? null;
      return {
        mark: "tree",
        ...opt("slot", m["slot"]),
        ...opt("unit", m["unit"]),
        ...opt("format", m["format"] ?? UNIT_FORMATS.get(t.unit)),
        nodes: groups
          ? (t.groups ?? []).map((g, k) => ({
              ...word(c, g.key, k, `${f}.groups[${String(k)}]`),
              children: g.children.map((p) => ({ name: p.key, value: value(p.value) })),
            }))
          : (t.parts ?? []).map((p, k) => ({
              ...word(c, p.key, k, "", false),
              value: value(p.value),
            })),
      };
    }
  }
}

// Every instant a time x or a calendar places is written through Intl, so
// each is held to what Date holds by its own field, whatever the domain.
function checkInstants(frame: Frame, f: string, x: Rec | undefined, refsOnX: boolean): void {
  if (x?.["type"] !== "time" && frame.type !== "calendar") {
    return;
  }
  const each = (values: readonly (number | null)[] | undefined, what: string): void => {
    values?.forEach((v, i) => {
      if (typeof v === "number" && Number.isFinite(v)) {
        withinDate(v, `${what}[${String(i)}]`);
      }
    });
  };
  if (isArray(x?.["domain"])) {
    each(x["domain"] as readonly number[], "x.domain");
  }
  switch (frame.type) {
    case "bins":
      each((frame as BinsFrame).x1, `${f}.x1`);
      each((frame as BinsFrame).x2, `${f}.x2`);
      break;
    case "series":
      each((frame as SeriesFrame).x, `${f}.x`);
      break;
    case "events":
      (frame as EventsFrame).rows.forEach((row, r) => {
        each(row.at, `${f}.rows[${String(r)}].at`);
      });
      break;
    case "categories":
      (frame as CategoriesFrame).series.forEach((s, k) => {
        each(s.values, `${f}.series[${String(k)}].values`);
      });
      break;
    case "grid":
      each((frame as GridFrame).x.edges, `${f}.x.edges`);
      break;
    default:
      break;
  }
  if (refsOnX) {
    frame.refs?.forEach((ref, i) => {
      withinDate(ref.value, `${f}.refs[${String(i)}].value`);
    });
  }
  frame.notes?.forEach((note, i) => {
    withinDate(note.at, `${f}.notes[${String(i)}].at`);
  });
}

// The checks that read the plot's scales beside its data mark.
function checkPlot(
  spec: Rec,
  scales: Scales,
  c: MarkCopy,
  input: Rec,
  f: string,
  most: Room,
): void {
  if (c.kind === "scatter") {
    const list = input["series"] as readonly Rec[];
    const sized = list[0]?.["r"] !== undefined;
    for (const axis of sized ? (["x", "y", "r"] as const) : (["x", "y"] as const)) {
      const scale = scales[axis];
      const label = scale?.["label"];
      if (typeof label !== "string" || label === "") {
        fail(`${axis}.label is required on a scatter, whose readings name each measure by it`);
      }
      if (scale?.["unit"] !== undefined) {
        fail(
          `${axis}.unit has no place on a scatter, whose readings name each measure by its label; the mark's unit names the dots`,
        );
      }
    }
  }
  const calendar = c.kind === "cell" && input["days"] !== undefined;
  const binnedY = c.kind === "cell" && !calendar && !isArray(input["y"]);
  const band =
    c.kind === "dot" ||
    c.kind === "bar" ||
    c.kind === "point" ||
    c.kind === "box" ||
    (c.kind === "cell" && !binnedY);
  if (band && spec["height"] !== undefined) {
    fail(
      calendar
        ? "height has no place on a calendar, which is as tall as its weeks"
        : `height has no place on a ${c.kind === "cell" ? "cell chart of categories" : "dot, bar, point or box chart"}, which is as tall as its rows`,
    );
  }
  if (binnedY) {
    const { edges } = input["y"] as { edges: readonly number[] };
    const log = scales.y?.["type"] === "log";
    // A log y's edge at or below 0 is the y scale's to name; the 1e-9 lets a
    // float share of exactly a thousandth (1 / 1000) through.
    if (
      !(log && (edges[0] ?? 0) <= 0) &&
      thinnestBin(log ? "log" : "linear", edges) * most.rows < 1 - 1e-9
    ) {
      fail(
        `${f}.y.edges' thinnest bin must be at least 1/${String(most.rows)} of the axis${most.each}, since the plot grows until it is a row tall`,
        RangeError,
      );
    }
  }
  if (spec["colour"] !== undefined) {
    if (c.kind !== "cell") {
      fail("colour has no place without a cell mark, whose classes it colours");
    }
    checkColour(spec["colour"]);
  }
}

function copyScale(v: unknown, name: string, d: Door): unknown {
  if (!isObject(v)) {
    return v;
  }
  const own = fields(v, name === "colour" ? COLOUR : SCALE);
  put(own, "unit", entries);
  put(own, "format", entries);
  for (const list of ["domain", "thresholds"]) {
    put(own, list, (l) => (isArray(l) ? d.list(l, `${name}.${list}`) : l));
  }
  return own;
}

function checkScales(spec: Rec): void {
  for (const name of ["x", "y", "r"]) {
    if (spec[name] !== undefined) {
      checkScale(spec[name], name);
    }
  }
  const r = spec["r"];
  if (isObject(r)) {
    if (r["type"] !== undefined && r["type"] !== "linear") {
      fail('r.type must be "linear", since a bubble\'s area is proportional to its value');
    }
    for (const flag of ["zero", "mono", "reverse"]) {
      if (r[flag] !== undefined) {
        fail(`r.${flag} has no place on a size scale, which runs from 0 and draws no axis`);
      }
    }
  }
}

function readWords(spec: Rec, d: Door): Words {
  const refs = encodings(spec["refs"], "refs", ["key", "label", "axis"], d);
  for (const w of refs.values()) {
    const at = String(w["at"]);
    optional(w["label"], "string", `${at}.label`);
    oneOf(w["axis"], ["x", "y"], `${at}.axis`);
  }
  const notes = encodings(spec["notes"], "notes", ["key", "text", "side"], d);
  for (const w of notes.values()) {
    const at = String(w["at"]);
    const text = w["text"];
    if (text !== undefined && !(typeof text === "string" && text.trim() !== "")) {
      fail(`${at}.text must be a non-empty string`);
    }
    const side = w["side"];
    if (side !== undefined && !(typeof side === "string" && SIDES.has(side))) {
      fail(`${at}.side must be "above", "below", "left" or "right"`);
    }
  }
  return { refs, notes };
}

interface PanelRead {
  readonly frame: Frame;
  readonly f: string;
  readonly input: Rec;
  readonly scales: Scales;
}

function readPanel(
  v: unknown,
  f: string,
  c: MarkCopy,
  d: Door,
  spec: Rec,
  words: Words,
  most: Room,
): PanelRead {
  const frame = readFrame(v, f, d, MARKS[c.kind][0]);
  const scales = scalesOf(spec, frame, c);
  const input = dataInput(frame, f, c, most);
  checkPlot(spec, scales, c, input, f, most);
  const [axis] = refAxes(c.kind, frame);
  const refsOnX = (frame.refs ?? []).some(
    (ref) => (words.refs.get(ref.key)?.["axis"] ?? axis) === "x",
  );
  checkInstants(frame, f, scales.x, refsOnX);
  return { frame, f, input, scales };
}

// The series a panel holds, by key, or a pie's slices: what its name
// defaults from and what the panels must share.
function seriesKeys(frame: Frame, kind: Kind): readonly string[] {
  if (kind === "pie") {
    return (frame as CategoriesFrame).names;
  }
  return "series" in frame ? frame.series.map((s) => s.key) : [];
}

// What every panel's frame must hold as the first's, with the field naming it.
function sharedFields(frame: Frame): [string, unknown][] {
  const unit: [string, unknown][] = "unit" in frame ? [["unit", frame.unit]] : [];
  return [...unit, ...ownShared(frame)];
}

function ownShared(frame: Frame): [string, unknown][] {
  switch (frame.type) {
    case "categories":
    case "boxes":
      return [["names", (frame as CategoriesFrame).names]];
    case "grid":
      return [
        ["x", (frame as GridFrame).x],
        ["y", (frame as GridFrame).y],
      ];
    case "calendar": {
      const k = frame as CalendarFrame;
      return [
        ["zone", k.zone],
        ["start", k.start],
        ["values.length", k.values.length],
        ["open", k.open === true],
      ];
    }
    default:
      return [];
  }
}

/** Splits the panels' refs into the chart's, each a key and value every
 *  panel holds, drawn once, and each panel's own, the rest. Linear in the refs. */
export function sharedRefs(panels: readonly (readonly FrameRef[])[]): {
  shared: FrameRef[];
  own: FrameRef[][];
} {
  const ids = panels.map((refs) => refs.map((r) => JSON.stringify([r.key, r.value])));
  const counts = ids.map((list) => {
    const m = new Map<string, number>();
    list.forEach((id) => m.set(id, (m.get(id) ?? 0) + 1));
    return m;
  });
  // How many times every panel holds each pair.
  const held = new Map<string, number>();
  for (const id of counts[0]?.keys() ?? []) {
    held.set(id, Math.min(...counts.map((m) => m.get(id) ?? 0)));
  }
  // A panel's first `held` refs of a pair are the chart's, the rest its own.
  const split = (refs: readonly FrameRef[], list: readonly string[]) => {
    const taken = new Map<string, number>();
    const mine: FrameRef[] = [];
    const theirs: FrameRef[] = [];
    refs.forEach((r, k) => {
      const id = list[k] ?? "";
      const n = taken.get(id) ?? 0;
      if (n < (held.get(id) ?? 0)) {
        taken.set(id, n + 1);
        theirs.push(r);
      } else {
        mine.push(r);
      }
    });
    return { mine, theirs };
  };
  const parts = panels.map((refs, p) => split(refs, ids[p] ?? []));
  return { shared: parts[0]?.theirs ?? [], own: parts.map((s) => s.mine) };
}

const same = (a: unknown, b: unknown): boolean =>
  a === b || JSON.stringify(a) === JSON.stringify(b);

function readFacets(facets: unknown, c: MarkCopy, words: Words, d: Door, spec: Rec) {
  if (!isObject(facets)) {
    return fail("facets must be an object");
  }
  const own = fields(facets, ["unit", "context", "panels"]);
  put(own, "unit", entries);
  if (own["unit"] !== undefined) {
    checkUnit(own["unit"], "facets.unit");
  }
  optional(own["context"], "boolean", "facets.context");
  if (!FACETED.has(c.kind)) {
    fail(
      `mark.mark "${c.kind}" draws no panels; facet a rect, line, area, bar, point, scatter, box, cell or pie mark`,
    );
  }
  const given = own["panels"];
  if (!isArray(given)) {
    return fail("facets.panels must be a non-empty array, a panel each");
  }
  // Copied before any panel is read, so its length is read once.
  const list = d.list(given, "facets.panels", {
    most: MOST_PANELS,
    why: "past which no reader compares them",
  });
  const before = d.count();
  const most = room(list.length);
  const seen = new Set<string>();
  const read = list.map((panel, k) => {
    const at = `facets.panels[${String(k)}]`;
    if (!isObject(panel)) {
      return fail(`${at} must be an object`);
    }
    const p = fields(panel, ["key", "name", "data"]);
    const key = p["key"];
    if (typeof key !== "string") {
      return fail(`${at}.key must be a string`);
    }
    if (key === "" || seen.has(key)) {
      fail(`${at}.key "${key}" must be unique and not empty`, RangeError);
    }
    seen.add(key);
    optional(p["name"], "string", `${at}.name`);
    return { name: p["name"], read: readPanel(p["data"], `${at}.data`, c, d, spec, words, most) };
  });
  if (own["context"] === true) {
    d.add(Math.max(0, read.length - 1) * (d.count() - before), "facets.context");
  }
  const [head] = read;
  if (head === undefined) {
    return fail("facets.panels must be a non-empty array, a panel each");
  }
  const theirs = sharedFields(head.read.frame);
  const shares =
    c.kind === "pie"
      ? "set of slices"
      : head.read.frame.type === "calendar"
        ? "calendar"
        : head.read.frame.type === "grid"
          ? "grid"
          : "band of rows";
  for (const { read: r } of read.slice(1)) {
    if (r.frame.type !== head.read.frame.type) {
      fail(
        `${r.f}.type must be "${head.read.frame.type}", facets.panels[0]'s; every panel draws one kind`,
      );
    }
    sharedFields(r.frame).forEach(([field, value], j) => {
      if (!same(value, theirs[j]?.[1])) {
        fail(`${r.f}.${field} must be facets.panels[0]'s; the panels share one ${shares}`);
      }
    });
  }
  const lists = read.map((p) => seriesKeys(p.read.frame, c.kind));
  const [first = []] = lists;
  const alike = lists.every((l) => l.length === first.length && l.every((n, i) => n === first[i]));
  const perSeries = lists.every((l) => l.length === 1);
  if (!perSeries && !alike) {
    fail("facets.panels must each hold one series, or all the same series in the same order");
  }
  if (own["context"] === true) {
    if (c.kind !== "line" && c.kind !== "scatter") {
      fail("facets.context draws behind line or scatter panels only");
    }
    if (!perSeries) {
      fail("facets.context needs one series a panel, each drawn behind the others");
    }
  }
  const names = new Set<string>();
  const panelNames = read.map((p, k) => {
    const list = lists[k] ?? [];
    const one = list.length === 1 ? (list[0] ?? "") : undefined;
    const name =
      typeof p.name === "string" ? p.name : one === undefined ? undefined : nameFor(c, one);
    const at = `facets.panels[${String(k)}]`;
    if (name === undefined) {
      return fail(
        list.length === 0
          ? `${at}.name is required; a ${c.kind} panel has no series to name it`
          : `${at}.name is required on a panel of ${String(list.length)} series`,
      );
    }
    if (name === "" || names.has(name)) {
      fail(`${at}'s name "${name}" must be unique and not empty`, RangeError);
    }
    names.add(name);
    return name;
  });
  const { shared, own: ownRefs } = sharedRefs(read.map((p) => p.read.frame.refs ?? []));
  const panels: PlotPanel[] = read.map((p, k) => {
    const { marks, unplaced } = marksOf(
      ownRefs[k] ?? [],
      p.read.frame.notes ?? [],
      p.read.f,
      c,
      p.read.frame,
      p.read.input,
      words,
      p.read.scales,
    );
    return {
      name: panelNames[k] ?? "",
      marks: [p.read.input as unknown as Input, ...marks],
      unplaced,
    };
  });
  const chart = marksOf(
    shared,
    [],
    "facets.panels[0].data",
    c,
    head.read.frame,
    head.read.input,
    words,
    head.read.scales,
  );
  return {
    facets: { ...opt("unit", own["unit"]), ...opt("context", own["context"]), panels },
    chart,
    scales: mergeScales(read.map((p) => p.read.scales)),
    most,
    zone: head.read.frame.type === "calendar" ? (head.read.frame as CalendarFrame).zone : undefined,
  };
}

// The panels' frames set their scales alike, one unit and kind shared, but
// for x's domain: the span of every panel's, or the data's when a panel's
// frame holds none.
function mergeScales(list: readonly Scales[]): Scales {
  const [first = {}] = list;
  const domains = list.map((s) => s.x?.["domain"] as readonly number[] | undefined);
  if (domains.every((dm) => dm === domains[0])) {
    return first;
  }
  if (domains.some((dm) => dm === undefined)) {
    const { domain: _, ...x } = first.x ?? {};
    return { ...first, x };
  }
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const dm of domains) {
    lo = Math.min(lo, dm?.[0] ?? 0);
    hi = Math.max(hi, dm?.[1] ?? 0);
  }
  return { ...first, x: { ...first.x, domain: [lo, hi] } };
}

/** The chart's own copy of `given` as the plot it draws, which no later code
 *  reads again; throws a `TypeError` or `RangeError` naming the first rule
 *  the spec breaks. */
export function check(given: unknown): Plot {
  if (!isObject(given)) {
    return fail("the spec must be an object");
  }
  const d = door("renderChart", MAX_VALUES);
  const spec = fields(given, [
    "data",
    "mark",
    "x",
    "y",
    "r",
    "colour",
    "refs",
    "notes",
    "facets",
    "height",
    "summary",
    "empty",
  ]);
  for (const name of ["x", "y", "r", "colour"]) {
    put(spec, name, (v) => copyScale(v, name, d));
  }
  checkScales(spec);
  const c = readMark(spec["mark"], d);
  const words = readWords(spec, d);
  const facets = spec["facets"];
  if ((spec["data"] === undefined) === (facets === undefined)) {
    fail(
      spec["data"] === undefined
        ? "data must be given, or facets whose panels each hold their data"
        : "data has no place beside facets, whose panels each hold their data",
    );
  }
  let plot: Rec;
  let most: Room;
  if (facets === undefined) {
    most = room(1);
    const p = readPanel(spec["data"], "data", c, d, spec, words, most);
    const { marks, unplaced } = marksOf(
      p.frame.refs ?? [],
      p.frame.notes ?? [],
      "data",
      c,
      p.frame,
      p.input,
      words,
      p.scales,
    );
    plot = {
      ...p.scales,
      marks: [p.input as unknown as Input, ...marks],
      unplaced,
      ...opt("zone", p.frame.type === "calendar" ? (p.frame as CalendarFrame).zone : undefined),
    };
  } else {
    const f = readFacets(facets, c, words, d, spec);
    most = f.most;
    plot = {
      ...f.scales,
      marks: f.chart.marks,
      unplaced: f.chart.unplaced,
      facets: f.facets,
      ...opt("zone", f.zone),
    };
  }
  const height = spec["height"];
  optional(height, "number", "height");
  if (typeof height === "number" && !(height > 0 && height <= most.height)) {
    fail(
      `height must be a number of px above 0 and at most ${String(most.height)}${most.each}`,
      RangeError,
    );
  }
  const summary = spec["summary"];
  if (summary !== undefined && typeof summary !== "string" && typeof summary !== "function") {
    fail("summary must be a string or a function");
  }
  optional(spec["empty"], "string", "empty");
  return {
    ...plot,
    ...opt("height", height),
    ...opt("summary", summary),
    ...opt("empty", spec["empty"]),
  } as unknown as Plot;
}
