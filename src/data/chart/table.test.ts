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
  syncTable(panel, t, "chart-title", false);
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
  syncTable(panel, t, "chart-title", false);
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

it("heads small multiples' column groups in a row above their columns, each over its <colgroup>", () => {
  const panel = (name: string, a: number) => ({
    name,
    marks: [
      {
        mark: "rect" as const,
        x1: [0],
        x2: [10],
        series: [
          { name: "Coal", y: [a] },
          { name: "Gas", y: [1] },
        ],
      },
    ],
  });
  const t = tableModel(
    chartModel(
      {
        x: { label: "Hour" },
        marks: [],
        facets: { panels: [panel("Germany", 2), panel("France", 3)] },
      },
      "en",
      "UTC",
    ),
    chartWords(),
  );
  const el = document.createElement("div");
  syncTable(el, t, "chart-title", false);
  const table = el.querySelector("table");
  expect([...(table?.querySelectorAll("colgroup") ?? [])].map((g) => g.span)).toEqual([1, 3, 3]);
  const [top, below] = [...(table?.tHead?.rows ?? [])];
  expect(
    [...(top?.cells ?? [])].map((c) => [
      c.textContent,
      c.rowSpan,
      c.colSpan,
      c.getAttribute("scope"),
    ]),
  ).toEqual([
    ["Hour", 2, 1, "col"],
    ["Germany", 1, 3, "colgroup"],
    ["France", 1, 3, "colgroup"],
  ]);
  expect([...(below?.cells ?? [])].map((c) => c.textContent)).toEqual([
    "Coal",
    "Gas",
    "Total",
    "Coal",
    "Gas",
    "Total",
  ]);
  expect([...(table?.tBodies[0]?.rows[0]?.cells ?? [])].map((c) => c.textContent)).toEqual([
    "0 to 10",
    "2",
    "1",
    "3",
    "3",
    "1",
    "4",
  ]);
});

it("heads each scatter panel's <tbody> with its name across every column", () => {
  const dots = (name: string) => ({
    marks: [{ mark: "scatter" as const, series: [{ name, names: ["a"], x: [1], y: [2] }] }],
  });
  const t = tableModel(
    chartModel(
      {
        x: { label: "Income" },
        y: { label: "Age" },
        marks: [],
        facets: { panels: [dots("Europe"), dots("Africa")] },
      },
      "en",
      "UTC",
    ),
    chartWords(),
  );
  const el = document.createElement("div");
  syncTable(el, t, "chart-title", true);
  const bodies = [...(el.querySelector("table")?.tBodies ?? [])];
  expect(
    bodies.map((b) => {
      const th = b.rows[0]?.cells[0];
      return [
        b.dataset["key"],
        th?.getAttribute("scope"),
        th?.colSpan,
        th?.querySelector("bdi")?.textContent,
      ];
    }),
  ).toEqual([
    ["Europe", "rowgroup", 3, "Europe"],
    ["Africa", "rowgroup", 3, "Africa"],
  ]);
  expect(bodies.map((b) => b.rows.length)).toEqual([2, 2]);
});
