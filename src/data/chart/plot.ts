/**
 * plot.ts — a checked spec as the chart draws it: its frame and mark
 * resolved into one mark's inputs, with rules and notes from its refs.
 * @internal
 * @module
 */

import type { Format, Unit } from "../scale/format.js";

import type { ChartSpec } from "./spec.js";

/** Every value, `null` or `NaN` a gap. */
type Values = readonly (number | null)[];

export type Scale = NonNullable<ChartSpec["x"]>;
type ColourScale = NonNullable<ChartSpec["colour"]>;
type SizeScale = NonNullable<ChartSpec["r"]>;

interface Series {
  readonly name: string;
  readonly slot?: number;
  readonly y: Values;
}

/** The instants a restart broke the data at, from the frame's `resets`. */
interface Breaks {
  readonly breaks?: readonly number[];
}

export interface RectInput extends Breaks {
  readonly mark: "rect";
  readonly x1: readonly number[];
  readonly x2: readonly number[];
  readonly open?: boolean;
  readonly arrange?: "stack" | "group" | "share";
  readonly shape?: "bars" | "area";
  readonly series: readonly Series[];
}

interface LineInput extends Breaks {
  readonly mark: "line";
  readonly x: readonly number[];
  readonly curve?: "linear" | "step";
  readonly series: readonly Series[];
}

interface AreaInput extends Breaks {
  readonly mark: "area";
  readonly x: readonly number[];
  readonly curve?: "linear" | "step";
  readonly arrange?: "stack" | "share";
  readonly series: readonly Series[];
}

interface DotInput {
  readonly mark: "dot";
  readonly slot?: number;
  readonly unit?: Unit;
  readonly rows: readonly { readonly name: string; readonly x: readonly number[] }[];
}

export interface BarInput {
  readonly mark: "bar";
  readonly y: readonly string[];
  readonly arrange?: "stack" | "group" | "share" | "split" | "diverge" | "mirror";
  readonly left?: number;
  readonly centre?: boolean;
  readonly labels?: boolean;
  readonly series: readonly {
    readonly name: string;
    readonly slot?: number;
    readonly below?: number;
    readonly x: Values;
  }[];
}

export interface PointInput {
  readonly mark: "point";
  readonly y: readonly string[];
  readonly link?: "range" | "arrow";
  readonly series: readonly { readonly name: string; readonly slot?: number; readonly x: Values }[];
}

interface SlopeInput {
  readonly mark: "slope";
  readonly x: readonly [string, string];
  readonly series: readonly Series[];
}

export interface ScatterInput {
  readonly mark: "scatter";
  readonly unit?: Unit;
  readonly series: readonly {
    readonly name: string;
    readonly slot?: number;
    readonly names: readonly string[];
    readonly x: Values;
    readonly y: Values;
    readonly r?: Values;
  }[];
}

export interface CellInput {
  readonly mark: "cell";
  readonly x: readonly string[] | { readonly edges: readonly number[] };
  readonly y: readonly string[] | { readonly edges: readonly number[] };
  readonly values: readonly Values[];
}

export interface CalendarInput {
  readonly mark: "cell";
  readonly days: { readonly start: number; readonly values: Values; readonly open?: boolean };
  readonly weekStart?: number;
}

export interface BoxInput {
  readonly mark: "box";
  readonly y: readonly string[];
  readonly whiskers?: string;
  readonly series: readonly {
    readonly name: string;
    readonly slot?: number;
    readonly low: Values;
    readonly q1: Values;
    readonly median: Values;
    readonly q3: Values;
    readonly high: Values;
    readonly outliers?: readonly (readonly number[])[];
  }[];
}

export interface PieInput {
  readonly mark: "pie";
  readonly hole?: boolean;
  readonly unit?: Unit;
  readonly format?: Format;
  readonly slices: readonly {
    readonly name: string;
    readonly slot?: number;
    readonly value: number | null;
  }[];
}

interface TreePart {
  readonly name: string;
  readonly slot?: number;
  readonly value: number | null;
}

export interface TreeInput {
  readonly mark: "tree";
  readonly slot?: number;
  readonly unit?: Unit;
  readonly format?: Format;
  readonly nodes:
    | readonly TreePart[]
    | readonly {
        readonly name: string;
        readonly slot?: number;
        readonly children: readonly TreePart[];
      }[];
}

/** A frame ref drawn as a rule on one axis. */
interface RuleInput {
  readonly mark: "rule";
  readonly x?: number;
  readonly y?: number;
  readonly label: string;
}

/** A frame note at its x, on the plot's top edge or a calendar's day. */
interface TextInput {
  readonly mark: "text";
  readonly x: number;
  readonly text: string;
  readonly side?: "above" | "below" | "left" | "right";
}

export type Input =
  | RectInput
  | LineInput
  | AreaInput
  | DotInput
  | BarInput
  | PointInput
  | SlopeInput
  | ScatterInput
  | CellInput
  | CalendarInput
  | BoxInput
  | PieInput
  | TreeInput
  | RuleInput
  | TextInput;

/** Refs and notes the plot has no place for, which the summary and the
 *  table give instead. */
export interface Unplaced {
  readonly rules: readonly { readonly label: string; readonly value: number }[];
  readonly notes: readonly { readonly text: string; readonly at: number }[];
}

export interface PlotPanel {
  readonly name: string;
  readonly marks: readonly Input[];
  readonly unplaced: Unplaced;
}

export interface Plot {
  readonly x?: Scale;
  readonly y?: Scale;
  readonly r?: SizeScale;
  readonly colour?: ColourScale;
  /** The data mark, then its rules, then its notes; beside `facets`, the
   *  rules every panel shares. */
  readonly marks: readonly Input[];
  readonly unplaced: Unplaced;
  readonly facets?: {
    readonly unit?: Unit;
    readonly context?: boolean;
    readonly panels: readonly PlotPanel[];
  };
  readonly height?: number;
  readonly summary?: ChartSpec["summary"];
  readonly empty?: string;
  /** A calendar's frame's zone, which its days are in. */
  readonly zone?: string;
}
