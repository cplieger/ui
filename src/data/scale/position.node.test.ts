import { describe, expect, it } from "vitest";

import { position } from "./position.js";

const MIN = 60_000;
const S = Date.UTC(2026, 10, 12, 9);

describe("position", () => {
  it("maps each end of a 20 min domain exactly onto 425 px, either way round", () => {
    const at = position("time", S, S + 20 * MIN, 0, 425);
    expect(at(S)).toBe(0);
    expect(at(S + 20 * MIN)).toBe(425);
    const back = position("time", S, S + 20 * MIN, 425, 0);
    expect(back(S)).toBe(425);
    expect(back(S + 20 * MIN)).toBe(0);
  });

  it("maps each end of a log domain exactly onto its range", () => {
    const at = position("log", 1, 100, 0, 200);
    expect(at(1)).toBe(0);
    expect(at(100)).toBe(200);
    expect(at(10)).toBeCloseTo(100, 9);
  });

  it("maps a domain of one value to the range's middle", () => {
    expect(position("linear", 4, 4, 0, 300)(4)).toBe(150);
  });
});
