import { describe, expect, it } from "vitest";

import { nextPath } from "./screen.js";

const ORIGINS = [
  "https://app.example",
  "http://localhost:8080",
  "http://[::1]:3000",
  "http://192.168.1.2",
];

/** Every "/" followed by up to `depth` of these parts: the slashes, dots,
 *  percent forms, controls and host-like words a crafted `next` is made
 *  of. */
const PARTS = [
  "/",
  "\\",
  ".",
  "..",
  "%2e",
  "%2E",
  "%2f",
  "%5c",
  "\t",
  "\n",
  "\r",
  "evil.com",
  "@",
  "?",
  "#",
  ":",
  "a",
  " ",
  "%09",
  "%00",
];

function* values(depth: number): Generator<string> {
  function* tails(n: number): Generator<string> {
    if (n === 0) {
      yield "";
      return;
    }
    for (const p of PARTS) {
      for (const rest of tails(n - 1)) {
        yield p + rest;
      }
    }
  }
  for (let n = 1; n <= depth; n += 1) {
    for (const tail of tails(n)) {
      yield `/${tail}`;
    }
  }
}

describe("nextPath", () => {
  it.each(ORIGINS)(
    "on %s, answers a path a navigation from any page keeps on the origin",
    (origin) => {
      let leaks = 0;
      let unstable = 0;
      let kept = 0;
      for (const raw of values(4)) {
        const path = nextPath(raw, origin);
        if (path !== "/") {
          kept += 1;
        }
        // The browser resolves the answer against the page the person is on.
        const there = new URL(path, `${origin}/sign-in/deep/page?x=1`);
        if (there.origin !== origin || !path.startsWith("/") || path.startsWith("//")) {
          leaks += 1;
        }
        if (nextPath(path, origin) !== path) {
          unstable += 1;
        }
      }
      expect({ leaks, unstable }).toEqual({ leaks: 0, unstable: 0 });
      // The corpus reaches values that stay: the check is not vacuous.
      expect(kept).toBeGreaterThan(100_000);
    },
  );

  it.each([
    ["/feed?page=2#top", "/feed?page=2#top"],
    ["/a/../b", "/b"],
    ["/%2e%2e/x", "/x"],
    ["/caf\u00e9", "/caf%C3%A9"],
    [null, "/"],
    ["", "/"],
    ["feed", "/"],
    ["//evil.example/x", "/"],
    ["/\\evil.example", "/"],
    ["/\t/evil.example", "/"],
    ["/.//evil.example", "/"],
    ["https://evil.example/", "/"],
    ["//", "/"],
    ["///", "/"],
    ["//?x", "/"],
    ["/\\", "/"],
    ["/\\/", "/"],
  ])("answers %j as %j", (raw, path) => {
    expect(nextPath(raw, "https://app.example")).toBe(path);
  });
});
