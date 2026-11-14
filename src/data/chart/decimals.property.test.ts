import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { decimalFormatter } from "../scale/format.js";
import { linearAxis, linearTicks } from "../scale/linear.js";

import { classes } from "./classes.js";

// n × 10^exp, as a literal reads it.
const dec = (n: number, exp: number): number => Number(`${n}e${exp}`);

// A count of a decimal unit and the unit's exponent, from 1e-12 to 1e12 at six figures.
const exp = fc.integer({ min: -12, max: 6 });
const count = fc.integer({ min: -999_999, max: 999_999 });

// Every value names the decimal its `digits` write, lies in [lo, hi], strictly increases, and is never -0.
function exact(values: readonly number[], digits: number, lo: number, hi: number): void {
  for (const [k, v] of values.entries()) {
    expect(v).toBe(Number(v.toFixed(digits)));
    expect(v >= lo && v <= hi).toBe(true);
    expect(Object.is(v, -0)).toBe(false);
    expect(k === 0 || v > (values[k - 1] ?? Number.NaN)).toBe(true);
  }
}

describe("decimal ticks and class boundaries", () => {
  it("tick at the decimals their step names, inside a niced or passed domain", () => {
    fc.assert(
      fc.property(
        exp,
        count,
        count,
        fc.integer({ min: 100, max: 1200 }),
        fc.constantFrom(40, 80),
        fc.boolean(),
        (e, a, b, px, spacing, nice) => {
          fc.pre(a !== b);
          const [lo, hi] = [dec(Math.min(a, b), e), dec(Math.max(a, b), e)];
          const { domain, step } = linearAxis(lo, hi, px, spacing, { nice, integer: false });
          expect(domain[0] <= lo && hi <= domain[1]).toBe(true);
          const digits = Math.max(0, -step.exp);
          exact(linearTicks(domain[0], domain[1], step), digits, domain[0], domain[1]);
          if (nice) {
            exact(domain, digits, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY);
          } else {
            expect(domain).toEqual([lo, hi]);
          }
        },
      ),
    );
  });

  it("bound inferred classes at decimals, with or without a pivot", () => {
    fc.assert(
      fc.property(
        exp,
        fc.array(count, { minLength: 1, maxLength: 12 }),
        fc.option(count, { nil: undefined }),
        fc.integer({ min: 2, max: 9 }),
        (e, counts, pivot, steps) => {
          const values = counts.map((c) => dec(c, e));
          const spec =
            pivot === undefined
              ? { steps }
              : { type: "diverging" as const, steps, pivot: dec(pivot, e) };
          const c = classes(spec, values);
          const [least, most] = c.digits ?? [Number.NaN, Number.NaN];
          // The boundaries are exact at the values' own digits; `most` writes them unless capped.
          exact(
            c.thresholds,
            Math.max(most, -e),
            Number.NEGATIVE_INFINITY,
            Number.POSITIVE_INFINITY,
          );
          expect(least <= most && most <= least + 3).toBe(true);
          if (most < least + 3) {
            exact(c.thresholds, most, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY);
          }
          // `least` is the least: one fewer fails to write some boundary or the pivot.
          const written = pivot === undefined ? c.thresholds : [...c.thresholds, dec(pivot, e)];
          if (least > 0) {
            expect(written.some((v) => v !== Number(v.toFixed(least - 1)))).toBe(true);
          }
          const write = decimalFormatter(undefined, "en", least, most);
          expect(written.map(write).filter((t) => /^-0(\.0+)?%?$/.test(t))).toEqual([]);
        },
      ),
    );
  });

  it("divide a passed domain at the decimals it names, with or without a pivot", () => {
    fc.assert(
      fc.property(
        exp,
        count,
        fc.integer({ min: 1, max: 99_999 }),
        fc.integer({ min: 2, max: 9 }),
        fc.boolean(),
        fc.nat({ max: 9 }),
        (e, start, width, steps, diverging, short) => {
          const digits = Math.max(0, -e);
          if (!diverging) {
            // n classes `width` wide from `start`: each boundary is start + k × width.
            const [lo, hi] = [dec(start, e), dec(start + steps * width, e)];
            const c = classes({ steps, domain: [lo, hi] }, []);
            expect(c.thresholds).toEqual(
              Array.from({ length: steps - 1 }, (_, k) => dec(start + (k + 1) * width, e)),
            );
            exact(c.thresholds, digits, lo, hi);
            return;
          }
          // About `start`, its longer arm `units` × `width` and the other no longer: an odd
          // count's boundaries lie an odd count of `width` from it (half its classes), an
          // even count's a whole count.
          const m = Math.floor(steps / 2);
          const odd = steps % 2 === 1;
          const units = odd ? steps : m;
          const [lo, hi] = [
            dec(start - Math.min(short, units) * width, e),
            dec(start + units * width, e),
          ];
          const c = classes(
            { type: "diverging", steps, pivot: dec(start, e), domain: [lo, hi] },
            [],
          );
          const offsets = Array.from({ length: steps - 1 }, (_, j) =>
            odd ? 1 - 2 * m + 2 * j : 1 - m + j,
          );
          expect(c.thresholds).toEqual(offsets.map((o) => dec(start + o * width, e)));
          // Symmetric about the pivot, the classes span its longer arm both ways.
          exact(c.thresholds, digits, dec(start - units * width, e), hi);
        },
      ),
    );
  });
});
