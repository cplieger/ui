import { expect, it } from "vitest";

import { syncTable, type TableModel } from "./table.js";

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
