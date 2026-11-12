import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createParser } from "./parser.js";
import type { Sink } from "./parser.js";

/** What breaks the sink contract: a close with nothing open, text or an
 *  attribute outside every token, or a token still open after `end`. */
interface Breaches {
  count: number;
}

function checkingSink(b: Breaches): Sink & { depth: () => number } {
  let depth = 0;
  return {
    depth: () => depth,
    open() {
      depth += 1;
    },
    close() {
      depth -= 1;
      if (depth < 0) {
        b.count += 1;
      }
    },
    text() {
      if (depth <= 0) {
        b.count += 1;
      }
    },
    attr() {
      if (depth <= 0) {
        b.count += 1;
      }
    },
  };
}

/** Writes `chunks` in order, then ends, and expects every operation kept the contract. */
function keepsContract(chunks: readonly string[]): void {
  const b: Breaches = { count: 0 };
  const sink = checkingSink(b);
  const p = createParser(sink);
  for (const chunk of chunks) {
    p.write(chunk);
  }
  p.end();
  expect(b.count).toBe(0);
  expect(sink.depth()).toBe(0);
}

function splitAt(input: string, cuts: readonly number[]): string[] {
  const points = [...new Set(cuts.map((c) => c % (input.length + 1)))].sort((a, b) => a - b);
  const chunks: string[] = [];
  let prev = 0;
  for (const point of points) {
    chunks.push(input.slice(prev, point));
    prev = point;
  }
  chunks.push(input.slice(prev));
  return chunks;
}

describe("parser fuzz", () => {
  it("keeps the sink contract on arbitrary input in one write", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 2000 }), (input) => keepsContract([input])),
      { numRuns: 500 },
    );
  });

  it("keeps the sink contract on arbitrary input split anywhere", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 1000 }),
        fc.array(fc.nat(), { minLength: 1, maxLength: 20 }),
        (input, cuts) => keepsContract(splitAt(input, cuts)),
      ),
      { numRuns: 500 },
    );
  });

  it("keeps the sink contract on null bytes, controls and empty writes", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.string({ maxLength: 100 }),
            fc.constantFrom("\0", "\x01", "\x7f", "\r", "\u2028", ""),
          ),
          { minLength: 1, maxLength: 50 },
        ),
        (chunks) => keepsContract(chunks),
      ),
      { numRuns: 500 },
    );
  });

  it("keeps the sink contract on markdown's own characters split anywhere", () => {
    const syntax = fc
      .array(
        fc.constantFrom(..."[]()<>\\\"' \t\n#`|-:*_~$&;!+1.hx", "http://", "](", "![", "```"),
        { maxLength: 300 },
      )
      .map((parts) => parts.join(""));
    fc.assert(
      fc.property(syntax, fc.array(fc.nat(), { maxLength: 20 }), (input, cuts) =>
        keepsContract(splitAt(input, cuts)),
      ),
      { numRuns: 500 },
    );
  });
});

describe("code fence fuzz", () => {
  const ticks = (min: number, max: number): fc.Arbitrary<string> =>
    fc.integer({ min, max }).map((n) => "`".repeat(n));
  const fenceLang = fc.oneof(
    fc.string({ maxLength: 50 }),
    fc.constantFrom("", "javascript", "\0"),
    ticks(1, 20),
  );
  const fenceBody = fc.oneof(
    fc.string({ maxLength: 500 }),
    ticks(1, 30),
    fc.constantFrom("```\n```\n```", "````\ncontent\n````", "\0\0\0"),
  );
  const fenceMarker = ticks(3, 8);

  it("keeps the sink contract on adversarial fences", () => {
    fc.assert(
      fc.property(fenceMarker, fenceLang, fenceBody, fenceMarker, (open, lang, body, close) =>
        keepsContract([`${open}${lang}\n${body}\n${close}\n`]),
      ),
      { numRuns: 500 },
    );
  });

  it("keeps the sink contract on fences after fences", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fenceMarker, fenceLang, fenceBody), { minLength: 1, maxLength: 5 }),
        (fences) =>
          keepsContract([
            fences.map(([marker, lang, body]) => `${marker}${lang}\n${body}\n${marker}\n`).join(""),
          ]),
      ),
      { numRuns: 300 },
    );
  });
});
