import { expect, it } from "vitest";

import { chartModel } from "./model.js";
import { syncTable, tableModel, type TableModel } from "./table.js";
import { chartWords } from "./words.js";

it("builds a table of 129,600 rows, a 90-day line sampled each minute", () => {
  const t: TableModel = {
    corner: "Time",
    columns: [{ text: "Live", num: true }],
    rows: Array.from({ length: 129_600 }, (_, i) => ({
      key: String(i),
      head: [String(i)],
      cells: [{ parts: ["1"], num: true }],
    })),
    after: "",
  };
  const panel = document.createElement("div");
  syncTable(panel, t, "Agents", false);
  expect(panel.querySelectorAll("tbody tr")).toHaveLength(129_600);
});

// HTML's date strings: a year of four or more digits above 0, with no sign.
it("writes a datetime HTML reads for years past 9999, and none before year 1", () => {
  const last = tableModel(
    chartModel(
      { marks: [{ mark: "cell", days: { start: 8.64e15 - 86_400_000, values: [1, 2] } }] },
      "en",
      "UTC",
    ),
    chartWords(),
  );
  const ten = Date.UTC(10_000, 0, 1, 12, 30);
  const bc = new Date(0).setUTCFullYear(0);
  const t: TableModel = {
    ...last,
    rows: [
      ...last.rows,
      { key: "ten", head: [{ at: ten, text: "Jan 1, 10000" }], cells: [] },
      { key: "bc", head: [{ at: bc, text: "Jan 1, 1 BC", date: true }], cells: [] },
    ],
  };
  const panel = document.createElement("div");
  syncTable(panel, t, "Days", false);
  const heads = [...panel.querySelectorAll("tbody th")];
  expect(heads.map((th) => th.querySelector("time")?.dateTime)).toEqual([
    "275760-09-07",
    "010000-01-01T12:30:00.000Z",
    undefined,
  ]);
  expect(heads.map((th) => th.textContent)).toEqual([
    "Sep 7, 275760",
    "Jan 1, 10000",
    "Jan 1, 1 BC",
  ]);
});
