import { describe, expect, it } from "vitest";

import { countDigits, measurer, probeDigits } from "./measure.js";

describe("digits", () => {
  it("counts the decimal digits of every numbering system", () => {
    expect(countDigits("1,234.5")).toBe(5);
    expect(countDigits("١٬٢٣٤")).toBe(4);
    expect(countDigits("१२")).toBe(2);
    expect(countDigits("Nov 11, 2:00 PM")).toBe(5);
    expect(countDigits("posts")).toBe(0);
  });

  it("probes the locale's own ten digits", () => {
    expect(probeDigits("en")).toBe("1234567890");
    expect(probeDigits("ar-EG")).toBe("١٢٣٤٥٦٧٨٩٠");
    expect(countDigits(probeDigits("ar-EG"))).toBe(10);
  });
});

describe("measurer", () => {
  // A face whose "1" is narrow, its other digits 7 px, its comma 3 px.
  const font = (text: string) =>
    Array.from(text).reduce(
      (w, c) => w + (c === "1" ? 4 : c === "," ? 3 : /\d/u.test(c) ? 7 : 6),
      0,
    );

  it("measures a number's digits at the widest digit when it beats the tabular advance", () => {
    const m = measurer(font, 6, "en");
    expect(m.number("1,111")).toBe(4 * 7 + 3);
    expect(m.number("1,111")).toBe(m.number("8,888"));
  });

  it("measures them at the tabular advance when it is wider", () => {
    const m = measurer(font, 8, "en");
    expect(m.number("1,234")).toBe(4 * 8 + 3);
    expect(m.number("42 sec")).toBe(2 * 8 + font(" sec"));
  });

  it("measures words as they are", () => {
    const m = measurer(font, 8, "en");
    expect(m.text("1 a")).toBe(font("1 a"));
    expect(m.number("posts")).toBe(font("posts"));
  });

  it("takes the widest of the locale's digits", () => {
    const arabic = (text: string) => Array.from(text).reduce((w, c) => w + (c === "٨" ? 9 : 5), 0);
    expect(measurer(arabic, 6, "ar-EG").number("١٢")).toBe(18);
    expect(measurer(arabic, 6, "en").number("12")).toBe(12);
  });
});
