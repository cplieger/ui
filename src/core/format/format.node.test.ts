import { describe, expect, it } from "vitest";

import { bytes, count, date, duration, number, percent, relative } from "./format.js";

describe("format without a page", () => {
  it("writes in the platform's language where there is no document", () => {
    expect("document" in globalThis).toBe(false);
    expect(number(1234.5)).toBe(new Intl.NumberFormat().format(1234.5));
    expect(percent(0.509, "en")).toBe("51%");
    expect(count(3, { one: "run", other: "runs" }, "en")).toBe("3\u00A0runs");
    expect(bytes(999_950, "decimal", "en")).toBe("1.0\u00A0MB");
    expect(duration(42_000, "digital", "en")).toBe("0:42");
    expect(date(new Date(2026, 10, 19), "date", "de")).toBe("19.11.2026");
  });

  it("counts a relative time from the present by default", () => {
    expect(relative(Date.now() - 3 * 3_600_000, { locale: "en", style: "long" })).toBe(
      "3\u00A0hours ago",
    );
  });
});
