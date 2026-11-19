import { describe, expect, it } from "vitest";

import { bindUnit, durationRecord, noun, withNoun } from "./intl.js";

describe("the duration rule", () => {
  it("splits into the largest unit and, under 10 of it, the next, each whole", () => {
    expect(durationRecord(87_000)).toEqual({ minutes: 1, seconds: 27 });
    expect(durationRecord(1_087_000)).toEqual({ minutes: 18 });
    expect(durationRecord(108_000_000)).toEqual({ days: 1, hours: 6 });
    expect(durationRecord(9 * 86_400_000 + 23 * 3_600_000)).toEqual({ days: 9, hours: 23 });
    expect(durationRecord(12 * 86_400_000 + 20 * 3_600_000)).toEqual({ days: 13 });
    expect(durationRecord(400)).toEqual({ milliseconds: 400 });
    expect(durationRecord(1_500)).toEqual({ seconds: 2 });
  });

  it("drops a next unit that rounds to zero, and carries rounding into the larger unit", () => {
    expect(durationRecord(120_200)).toEqual({ minutes: 2 });
    expect(durationRecord(59_600)).toEqual({ minutes: 1 });
    expect(durationRecord(9_600)).toEqual({ seconds: 10 });
    expect(durationRecord(999.6)).toEqual({ seconds: 1 });
    expect(durationRecord(9 * 3_600_000 + 59.6 * 60_000)).toEqual({ hours: 10 });
    expect(durationRecord(23.6 * 3_600_000)).toEqual({ days: 1 });
    expect(durationRecord(59.7 * 60_000)).toEqual({ hours: 1 });
    expect(durationRecord(-87_000)).toEqual({ minutes: -1, seconds: -27 });
  });
});

describe("words around numbers", () => {
  it("makes only a space between a unit and a number non-breaking, on either side", () => {
    const part = (type: Intl.NumberFormatPartTypes, value: string) => ({ type, value });
    const space = part("literal", " ");
    expect(
      bindUnit([
        part("integer", "1"),
        part("decimal", "."),
        part("fraction", "0"),
        space,
        part("unit", "MB"),
      ]),
    ).toBe("1.0\u00A0MB");
    expect(
      bindUnit([part("unit", "baiti"), space, part("minusSign", "-"), part("integer", "512")]),
    ).toBe("baiti\u00A0-512");
    expect(bindUnit([part("integer", "1"), part("literal", "\u202F"), part("unit", "Mo")])).toBe(
      "1\u202FMo",
    );
    expect(bindUnit([part("integer", "12"), space, part("integer", "34")])).toBe("12 34");
    expect(bindUnit([part("unit", "MB"), part("literal", " / "), part("integer", "1")])).toBe(
      "MB / 1",
    );
  });

  it("picks a unit's noun by Intl.PluralRules, and joins it with a non-breaking space", () => {
    const posts = { one: "post", other: "posts" };
    expect(noun(posts, 1, "en")).toBe("post");
    expect(noun(posts, 0, "en")).toBe("posts");
    expect(noun({ one: "message", other: "messages" }, 0, "fr")).toBe("message");
    expect(noun({ other: "items" }, 1, "en")).toBe("items");
    expect(withNoun("86", "reads")).toBe("86\u00A0reads");
  });
});
