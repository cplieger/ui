import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DURATION_TICKS } from "./ladder.js";

const MIN = 60;
const HR = 60 * MIN;
const DAY = 24 * HR;

// chartdata's duration ladder, as the sync vendors it.
const LADDER = JSON.parse(
  await readFile(
    join(import.meta.dirname, "..", "frame", "contract", "fixtures", "duration-edges.json"),
    "utf8",
  ),
) as { readonly edges: readonly number[]; readonly unit: string };

describe("DURATION_TICKS", () => {
  it("ticks in seconds at the units people say, then at every ladder edge from 3 days", () => {
    expect(LADDER.unit).toBe("seconds");
    expect(DURATION_TICKS).toEqual([
      1,
      10,
      MIN,
      10 * MIN,
      HR,
      6 * HR,
      DAY,
      ...LADDER.edges.filter((edge) => edge >= 3 * DAY),
    ]);
    expect(DURATION_TICKS.slice(7)).toEqual([3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 90 * DAY]);
  });
});
