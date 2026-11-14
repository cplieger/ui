import { describe, expect, it } from "vitest";

import { build, q, useSystemSheet } from "../../system/test-helpers/css.js";

useSystemSheet();

const LINES =
  '<li><code class="cp-mono">/srv/web</code></li><li><code class="cp-mono">/srv/api</code></li><li><code class="cp-mono">/srv/docs</code></li>';

const box = (el: Element) => el.getBoundingClientRect();

/** The space between each line's end and the next line's start, in px. */
const spacing = (list: Element) => {
  const lines = [...list.children];
  return lines.slice(1).map((li, i) => Math.round(box(li).top - box(lines[i] as Element).bottom));
};

describe("stack", () => {
  it("draws a tight list as lines 4px apart, with no marker, indent or margin", () => {
    const host = build(`<ul class="cp-stack" data-gap="tight">${LINES}</ul>`);
    const list = q(host, "ul");
    const cs = getComputedStyle(list);
    expect([cs.display, cs.rowGap, cs.listStyleType]).toEqual(["grid", "4px", "none"]);
    expect([cs.marginBlockStart, cs.marginBlockEnd, cs.paddingInlineStart]).toEqual([
      "0px",
      "0px",
      "0px",
    ]);
    expect(spacing(list)).toEqual([4, 4]);
    for (const li of list.children) {
      expect(box(li).left).toBe(box(list).left);
    }
  });

  it("keeps a list's lines the stack's own gap apart without data-gap", () => {
    const list = q(build(`<ol class="cp-stack">${LINES}</ol>`), "ol");
    expect([
      getComputedStyle(list).listStyleType,
      getComputedStyle(list).paddingInlineStart,
    ]).toEqual(["none", "0px"]);
    expect(spacing(list)).toEqual([16, 16]);
  });

  it("brings any stack's children 4px apart with data-gap tight", () => {
    const stack = q(
      build('<div class="cp-stack" data-gap="tight"><p>One</p><p>Two</p></div>'),
      ".cp-stack",
    );
    expect(spacing(stack)).toEqual([4]);
  });

  it("sits in prose's flow like any block, its lines spaced by the gap alone", () => {
    const host = build(
      `<div class="cp-prose"><p>Before</p><ul class="cp-stack" data-gap="tight">${LINES}</ul></div>`,
    );
    const list = q(host, "ul");
    const cs = getComputedStyle(list);
    expect([cs.marginBlockStart, cs.paddingInlineStart, cs.listStyleType]).toEqual([
      "12px",
      "0px",
      "none",
    ]);
    expect(spacing(list)).toEqual([4, 4]);
  });

  it("lays out the values of one fact from the value's start", () => {
    const host = build(
      `<dl class="cp-facts"><dt>Paths</dt><dd><ul class="cp-stack" data-gap="tight">${LINES}</ul></dd></dl>`,
    );
    const list = q(host, "dd > ul");
    expect([box(list).left, box(list).top]).toEqual([
      box(q(host, "dd")).left,
      box(q(host, "dd")).top,
    ]);
    expect(spacing(list)).toEqual([4, 4]);
  });

  it("lets an app's own class on the list, in a later sheet, win", () => {
    const host = build(
      `<style>.app-lines { padding-inline-start: 8px; list-style-type: square; }</style><ul class="cp-stack app-lines">${LINES}</ul>`,
    );
    const cs = getComputedStyle(q(host, "ul"));
    expect([cs.paddingInlineStart, cs.listStyleType]).toEqual(["8px", "square"]);
  });
});
