import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { applyEvent } from "./apply.js";
import type { BinsFrame, Frame, SeriesFrame } from "./frame.js";
import { MAX_VALUES } from "./limits.js";
import { door, readFrame } from "./read.js";

const read = (v: unknown): unknown =>
  readFrame(v, "data", door("test", MAX_VALUES), ["series", "bins"]);

const value = fc.oneof(fc.constant(null), fc.integer({ min: -1000, max: 1000 }));

const keys = fc
  .integer({ min: 0, max: 3 })
  .map((k) => Array.from({ length: k }, (_, i) => `s${String(i)}`));

// Instants strictly increasing from a start, whole milliseconds.
const instants = (most: number) =>
  fc
    .tuple(
      fc.integer({ min: -1e9, max: 1e9 }),
      fc.array(fc.integer({ min: 1, max: 1000 }), { maxLength: most }),
    )
    .map(([start, steps]) =>
      steps.map((_, i) => start + steps.slice(0, i + 1).reduce((a, b) => a + b, 0)),
    );

const series = fc
  .record({
    keys,
    x: instants(8),
    domain: fc.option(
      fc.tuple(fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 1, max: 1000 })),
      {
        nil: undefined,
      },
    ),
    resets: fc.option(instants(4), { nil: undefined }),
    open: fc.option(fc.boolean(), { nil: undefined }),
  })
  .chain(({ keys, x, domain, resets, open }) =>
    fc
      .tuple(...keys.map(() => fc.array(value, { minLength: x.length, maxLength: x.length })))
      .map((values): SeriesFrame => ({
        type: "series",
        name: "n",
        unit: "count",
        x,
        series: keys.map((key, i) => ({ key, values: values[i] ?? [] })),
        ...(domain === undefined
          ? {}
          : { domain: [(x[0] ?? 0) - domain[0], (x.at(-1) ?? 0) + domain[1]] }),
        ...(resets === undefined ? {} : { resets }),
        ...(open === undefined ? {} : { open }),
      })),
  );

// Bins one after another, each from where the one before ends or later.
const bins = fc
  .record({
    keys,
    start: fc.integer({ min: -1e6, max: 1e6 }),
    bins: fc.array(fc.tuple(fc.integer({ min: 0, max: 50 }), fc.integer({ min: 1, max: 100 })), {
      maxLength: 6,
    }),
    domain: fc.option(
      fc.tuple(fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 1, max: 1000 })),
      {
        nil: undefined,
      },
    ),
  })
  .chain(({ keys, start, bins, domain }) => {
    const x1: number[] = [];
    const x2: number[] = [];
    let end = start;
    for (const [gap, width] of bins) {
      x1.push(end + gap);
      end += gap + width;
      x2.push(end);
    }
    return fc
      .tuple(...keys.map(() => fc.array(value, { minLength: x1.length, maxLength: x1.length })))
      .map((values): BinsFrame => ({
        type: "bins",
        name: "n",
        unit: "count",
        axis: "time",
        x1,
        x2,
        series: keys.map((key, i) => ({ key, values: values[i] ?? [] })),
        ...(domain === undefined ? {} : { domain: [start - domain[0], end + domain[1]] }),
      }));
  });

const valuesFor = (frame: SeriesFrame | BinsFrame) =>
  fc.array(value, { minLength: frame.series.length, maxLength: frame.series.length });

const after = (frame: SeriesFrame) =>
  fc.integer({ min: 1, max: 2000 }).map((d) => (frame.x.at(-1) ?? 0) + d);

// An event a series frame takes: an append after its last column, a replace
// of its last, a reset at any instant, or a set of another series frame.
const seriesEvent = (frame: SeriesFrame) =>
  fc.oneof(
    fc.record({
      kind: fc.constant("append"),
      key: fc.constant("k"),
      x: after(frame),
      values: valuesFor(frame),
    }),
    ...(frame.x.length === 0
      ? []
      : [
          fc.record({
            kind: fc.constant("replace"),
            key: fc.constant("k"),
            values: valuesFor(frame),
            open: fc.boolean(),
          }),
        ]),
    fc.record({
      kind: fc.constant("reset"),
      key: fc.constant("k"),
      at: fc.integer({ min: -2e9, max: 2e9 }),
    }),
    fc.record({ kind: fc.constant("set"), key: fc.constant("k"), series }),
  );

// Bins one after another start where the one before ends or later, so a new
// bin from the last end on, or the last bin from its own start, keeps order.
const binsEvent = (frame: BinsFrame) => {
  const lastX1 = frame.x1.at(-1);
  const lastX2 = frame.x2.at(-1) ?? 0;
  const width = fc.integer({ min: 1, max: 100 });
  return fc.oneof(
    fc.tuple(fc.integer({ min: 0, max: 50 }), width, valuesFor(frame)).map(([gap, w, values]) => ({
      kind: "append",
      key: "k",
      x1: lastX2 + gap,
      x2: lastX2 + gap + w,
      values,
    })),
    ...(lastX1 === undefined
      ? []
      : [
          fc.tuple(width, valuesFor(frame), fc.boolean()).map(([w, values, open]) => ({
            kind: "replace",
            key: "k",
            x1: lastX1,
            x2: lastX1 + w,
            values,
            open,
          })),
        ]),
    fc.record({
      kind: fc.constant("reset"),
      key: fc.constant("k"),
      at: fc.integer({ min: -2e9, max: 2e9 }),
    }),
    fc.record({ kind: fc.constant("set"), key: fc.constant("k"), bins }),
  );
};

const withEvent = fc.oneof(
  series.chain((frame) => fc.tuple(fc.constant<Frame>(frame), seriesEvent(frame))),
  bins.chain((frame) => fc.tuple(fc.constant<Frame>(frame), binsEvent(frame))),
);

describe("applyEvent", () => {
  it("never changes the frame it is given, and returns a frame chartdata's rules hold", () => {
    fc.assert(
      fc.property(withEvent, ([frame, event]) => {
        const kept = structuredClone(frame);
        const applied = applyEvent(frame, event);
        expect(frame).toStrictEqual(kept);
        expect(read(applied)).toStrictEqual(applied);
      }),
    );
  });

  it("keeps a domain's span through an append, ending it at the new column", () => {
    const framed = series.filter((f) => f.domain !== undefined);
    fc.assert(
      fc.property(
        framed.chain((frame) => fc.tuple(fc.constant(frame), after(frame), valuesFor(frame))),
        ([frame, x, values]) => {
          const [low = 0, high = 0] = frame.domain ?? [];
          const applied = applyEvent(frame, { kind: "append", key: "k", x, values }) as SeriesFrame;
          expect(applied.domain).toStrictEqual([x - (high - low), x]);
          const kept = applied.x.length - 1;
          const start = applied.domain?.[0] ?? 0;
          expect(applied.x).toStrictEqual([...frame.x.slice(frame.x.length - kept), x]);
          expect(applied.x.every((v) => v >= start)).toBe(true);
          expect(frame.x[frame.x.length - kept - 1] ?? Number.NEGATIVE_INFINITY).toBeLessThan(
            start,
          );
          expect(applied.series).toStrictEqual(
            frame.series.map((s, i) => ({
              key: s.key,
              values: [...s.values.slice(s.values.length - kept), values[i]],
            })),
          );
        },
      ),
    );
  });

  it("keeps the x extent of a frame with no domain as its span through appends", () => {
    const spread = series.filter((f) => f.domain === undefined && f.x.length > 1);
    const steps = fc.array(fc.integer({ min: 1, max: 2000 }), { minLength: 1, maxLength: 4 });
    fc.assert(
      fc.property(spread, steps, (frame, gaps) => {
        const span = (frame.x.at(-1) ?? 0) - (frame.x[0] ?? 0);
        let x = frame.x.at(-1) ?? 0;
        let applied: Frame = frame;
        for (const gap of gaps) {
          x += gap;
          const values = frame.series.map(() => null);
          applied = applyEvent(applied, { kind: "append", key: "k", x, values });
          expect((applied as SeriesFrame).domain).toStrictEqual([x - span, x]);
        }
      }),
    );
  });

  it("gives a replace after an append the column the replace sent", () => {
    fc.assert(
      fc.property(
        series.chain((frame) =>
          fc.tuple(
            fc.constant(frame),
            after(frame),
            valuesFor(frame),
            valuesFor(frame),
            fc.boolean(),
          ),
        ),
        ([frame, x, sent, replaced, open]) => {
          const append = (values: unknown) =>
            applyEvent(frame, { kind: "append", key: "k", x, values });
          const appended = append(replaced);
          expect(
            applyEvent(append(sent), { kind: "replace", key: "k", values: replaced, open }),
          ).toStrictEqual(open ? { ...appended, open } : appended);
        },
      ),
    );
  });

  it("changes only a frame's resets on a reset, the same however often it comes", () => {
    fc.assert(
      fc.property(series, fc.integer({ min: -2e9, max: 2e9 }), (frame, at) => {
        const reset = { kind: "reset", key: "k", at };
        const once = applyEvent(frame, reset) as SeriesFrame;
        expect(applyEvent(once, reset)).toStrictEqual(once);
        const { resets, ...rest } = once;
        expect(resets).toContain(at);
        expect(rest).toStrictEqual(
          Object.fromEntries(Object.entries(frame).filter(([k]) => k !== "resets")),
        );
      }),
    );
  });

  it("draws a set frame the same however often it comes", () => {
    fc.assert(
      fc.property(series, series, (frame, sent) => {
        const set = { kind: "set", key: "k", series: sent };
        const once = applyEvent(frame, set);
        expect(applyEvent(once, set)).toStrictEqual(once);
      }),
    );
  });
});
