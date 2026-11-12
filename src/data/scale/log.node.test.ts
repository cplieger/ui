import { describe, expect, it } from "vitest";

import { logTickLists } from "./log.js";

const S = 1_000;
const MIN = 60 * S;
const HR = 60 * MIN;
const DAY = 24 * HR;

describe("logTickLists", () => {
  it("ticks a duration axis at the units people say, then thins to 1 sec, 1 min, 1 hr and the last tick", () => {
    expect(logTickLists(S, 3 * DAY, true)).toEqual([
      [S, 10 * S, MIN, 10 * MIN, HR, 6 * HR, DAY, 3 * DAY],
      [S, MIN, HR, 3 * DAY],
      [S, HR, 3 * DAY],
    ]);
  });

  it("ends each thinned list at the last duration tick inside the domain", () => {
    expect(logTickLists(S, 7 * DAY, true)[1]).toEqual([S, MIN, HR, 7 * DAY]);
    expect(logTickLists(S, 90 * DAY, true)[1]).toEqual([S, MIN, HR, 90 * DAY]);
    expect(logTickLists(S, 5 * DAY, true)[1]).toEqual([S, MIN, HR, 3 * DAY]);
  });

  it("keeps only the ticks inside the domain", () => {
    expect(logTickLists(10 * S, 2 * HR, true)).toEqual([
      [10 * S, MIN, 10 * MIN, HR],
      [MIN, HR],
      [HR],
    ]);
    expect(logTickLists(2 * S, 5 * S, true)).toEqual([[]]);
  });

  it("ticks any other log axis at 1, 2 and 5 times each power of ten, then the powers, then every other one", () => {
    expect(logTickLists(0.5, 2_000, false)).toEqual([
      [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1_000, 2_000],
      [1, 10, 100, 1_000],
      [1, 100],
    ]);
    expect(logTickLists(0.01, 0.2, false)[0]).toEqual([0.01, 0.02, 0.05, 0.1, 0.2]);
  });
});
