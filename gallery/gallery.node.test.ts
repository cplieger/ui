import { readdirSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium, firefox, webkit, type Browser, type BrowserType, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildGallery, frameNames, pageNames, templateNames } from "./build.js";

const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".vtt": "text/vtt",
  ".webm": "video/webm",
};
const ENGINES: Record<string, BrowserType> = { chromium, firefox, webkit };
const browsers = (process.env["CPLIEGER_BROWSERS"] ?? "chromium").split(",");
const SYSTEM_DIR = join(import.meta.dirname, "..", "docs", "system");
const SYSTEM_SCREENS = readdirSync(SYSTEM_DIR).filter((file) => file.endsWith(".html"));

/** Runs in the page, and changes it: the id of each aria-required control with
 *  no mark from step 2 of the forms pattern, the field's `.cp-help` reading
 *  "Required." or a `.cp-required` reading "(Required)" in the control's label
 *  or a `.cp-label` of its field. Nothing else counts. A control with no box
 *  first has its closed `details`, `dialog` and popover ancestors opened and every
 *  ancestor's `hidden` dropped; one still without a box is missing. The mark must
 *  pass `checkVisibility`, be at least a pixel each way in the page's scroll area,
 *  lie inside each ancestor clipping its overflow (not a scroller), and show its text uncut. */
const requiredWithoutMark = (): string[] => {
  const root = document.documentElement;
  const start =
    getComputedStyle(root).direction === "rtl" ? root.clientWidth - root.scrollWidth : 0;
  const inScrollArea = (rect: DOMRect): boolean =>
    rect.left >= start - scrollX - 0.5 &&
    rect.right <= start + root.scrollWidth - scrollX + 0.5 &&
    rect.top >= -scrollY - 0.5 &&
    rect.bottom <= root.scrollHeight - scrollY + 0.5;
  const clips = (el: Element): [boolean, boolean] => {
    const style = getComputedStyle(el);
    const paint = /paint|strict|content/.test(style.contain);
    const axis = (overflow: string) => paint || overflow === "hidden" || overflow === "clip";
    return [axis(style.overflowX), axis(style.overflowY)];
  };
  const insideClips = (mark: Element, rect: DOMRect): boolean => {
    for (let el = mark.parentElement; el !== null && el !== root; el = el.parentElement) {
      const [x, y] = clips(el);
      const box = el.getBoundingClientRect();
      const left = box.left + el.clientLeft;
      const top = box.top + el.clientTop;
      if (
        (x && (rect.left < left - 0.5 || rect.right > left + el.clientWidth + 0.5)) ||
        (y && (rect.top < top - 0.5 || rect.bottom > top + el.clientHeight + 0.5))
      ) {
        return false;
      }
    }
    return true;
  };
  // An inline box's clientWidth is 0 (https://www.w3.org/TR/cssom-view-1/#dom-element-clientwidth),
  // and Gecko still reports its scrollWidth, so only a box that clips its own overflow is measured.
  const whole = (mark: Element): boolean => {
    const [x, y] = clips(mark);
    return (
      (!x || mark.scrollWidth <= mark.clientWidth) && (!y || mark.scrollHeight <= mark.clientHeight)
    );
  };
  const shows = (mark: HTMLElement, field: Element): boolean => {
    const away = mark.closest(".cp-visually-hidden");
    if (away !== null && field.contains(away)) {
      return false;
    }
    const rect = mark.getBoundingClientRect();
    return (
      mark.checkVisibility({
        opacityProperty: true,
        visibilityProperty: true,
        contentVisibilityAuto: true,
      }) &&
      rect.width >= 1 &&
      rect.height >= 1 &&
      inScrollArea(rect) &&
      insideClips(mark, rect) &&
      whole(mark)
    );
  };
  const reveal = (control: Element): void => {
    for (let el = control.parentElement; el !== null; el = el.parentElement) {
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
      } else if (el instanceof HTMLDialogElement && !el.open) {
        el.show();
      } else if (el instanceof HTMLElement && el.matches("[popover]:not(:popover-open)")) {
        el.showPopover();
      }
      el.removeAttribute("hidden");
    }
  };
  return [...document.querySelectorAll<HTMLElement>('[aria-required="true"]')].flatMap(
    (control) => {
      const id = control.id !== "" ? control.id : control.outerHTML;
      const field = control.closest(".cp-field");
      if (field === null) {
        return [id];
      }
      const labels = [
        ...((control as Partial<HTMLInputElement>).labels ?? []),
        ...field.querySelectorAll(".cp-label"),
      ];
      const marks = [
        ...[...field.querySelectorAll<HTMLElement>(".cp-help")].filter(
          (help) => help.textContent.trim() === "Required.",
        ),
        ...labels
          .flatMap((label) => [...label.querySelectorAll<HTMLElement>(".cp-required")])
          .filter((mark) => mark.textContent.trim() === "(Required)"),
      ];
      if (!control.checkVisibility()) {
        reveal(control);
      }
      if (!control.checkVisibility()) {
        return [id];
      }
      return marks.some((mark) => shows(mark, field)) ? [] : [id];
    },
  );
};

// WCAG 2.5.3 Label in Name: an account button is named by the initials it
// shows then ", account", or "Account" alone over an avatar with no text.
// Runs in the page, so it closes over nothing.
const misnamedAccounts = (): string[] =>
  [...document.querySelectorAll<HTMLElement>(".cp-account")].flatMap((b) => {
    const text = b.innerText.trim();
    const name = b.getAttribute("aria-label") ?? "";
    return name === (text === "" ? "Account" : `${text}, account`) ? [] : [`${name} / ${text}`];
  });

let out = "";
let origin = "";
let close = (): void => undefined;
const missing = new Set<string>();

beforeAll(async () => {
  out = await mkdtemp(join(tmpdir(), "ui-gallery-"));
  await buildGallery(out);
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    // A page framed the way a preview tab frames it: sandboxed, so at an
    // opaque origin, where reading a stylesheet's rules throws.
    const framed = /^\/framed\/([\w-]+)$/.exec(path);
    if (framed !== null) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        `<link rel="icon" href="data:,"><iframe sandbox="allow-scripts" src="/${framed[1] ?? ""}.html"></iframe>`,
      );
      return;
    }
    // normalize() of a rooted path cannot climb above it, so the join stays under out.
    const file = join(out, normalize(decodeURIComponent(path)));
    readFile(file).then(
      (body) => {
        // An opaque-origin page fetches its module script and fonts by CORS.
        res.writeHead(200, {
          "content-type": TYPES[extname(file)] ?? "application/octet-stream",
          "access-control-allow-origin": "*",
        });
        res.end(body);
      },
      () => {
        missing.add(path);
        res.writeHead(404).end();
      },
    );
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  close = () => {
    server.close();
  };
}, 60_000);

afterAll(async () => {
  close();
  await rm(out, { recursive: true, force: true });
});

type Kind = "self" | "one" | "none" | "many";
interface Point {
  readonly x: number;
  readonly y: number;
}
/** The page side of the hover and row sweeps, which `installProbe` sets
 *  on the tab's `globalThis.cpProbe`. */
interface Probe {
  readonly park: Point;
  /** How many popovers and dialogs the page has. */
  layers(): number;
  /** Shows layer `i`; says whether it shows. */
  open(i: number): boolean;
  close(i: number): void;
  /** Gathers the non-controls a `:hover` rule could paint, in layer `i`
   *  or, given null, the page; returns their count. */
  hoverables(layer: number | null): number;
  /** Scrolls hoverable `i` into view and takes its paint, with the mouse
   *  parked; the point to hover it at, null when controls cover it, or
   *  why it cannot be hovered. */
  aim(i: number): Point | string | null;
  /** What hovering hoverable `i` changed. */
  diff(i: number): Promise<string[]>;
  /** Whether the paint the last aim took still holds, the mouse parked. */
  rested(): Promise<boolean>;
  /** Gathers the rows in layer `i` or the page; returns their kinds. */
  rows(layer: number | null): Kind[];
  /** Scrolls row `i` into view and takes its paint: a one-action row's
   *  point is its far end, any other's a point of it no control covers. */
  aimRow(i: number): Point | string;
  /** What hovering, then pressing, row `i` did wrong. */
  checkRow(i: number, step: "hover" | "press" | "ring"): Promise<string[]>;
  /** Whether row `i` is still the kind its last aim found. */
  same(i: number): boolean;
  /** Gathers one-action row `i`'s parts other than its action that are
   *  focusable or carry a tip; returns whether each toggles on a tap. */
  parts(i: number): boolean[];
  /** Scrolls part `j` into view; the point to hover it at, its centre. */
  aimPart(j: number): Point;
  /** What part `j` did wrong under the mouse resting on it, the mouse
   *  held down on it, a press on it, or a tap on it. */
  checkPart(j: number, step: "rest" | "down" | "press" | "tap"): Promise<string[]>;
}

/**
 * Sets `globalThis.cpProbe`. Self-contained, since Playwright sends this
 * function's source to the page. A control is one by its tag or role, or
 * a row the library marks as one action; a hover is any paint change.
 */
function installProbe(): void {
  const ACTION =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="slider"], [role="spinbutton"], [role="combobox"], [role="option"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="treeitem"]';
  const CONTROL = `${ACTION}, [data-cp-row-action]`;
  const ROWS = ".cp-list-row, .cp-table tbody tr, .cp-feed-entry";
  const SELECTED =
    '[aria-current]:not([aria-current="false"]), [aria-pressed="true"], [aria-selected="true"]';
  const PAINT = [
    "background-color",
    "background-image",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
    "color",
    "box-shadow",
    "outline-style",
    "outline-color",
    "text-decoration-line",
    "text-decoration-color",
    "opacity",
    "filter",
    "scale",
    "transform",
    "translate",
  ];
  const isControl = (el: Element): boolean =>
    el.matches(CONTROL) || (el instanceof HTMLLabelElement && el.control !== null);
  /** Whether `el` or an ancestor up to `top`, or to the root, is a control. */
  const underControl = (el: Element, top: Element | null): boolean => {
    for (let n: Element | null = el; n !== null; n = n === top ? null : n.parentElement) {
      if (isControl(n)) {
        return true;
      }
    }
    return false;
  };
  const name = (el: Element): string =>
    `${el.localName}${[...el.classList].map((c) => `.${c}`).join("")} "${el.textContent.trim().replace(/\s+/g, " ").slice(0, 30)}"`;
  const where = (el: Element): string =>
    el.closest(".card")?.querySelector("h2, h3")?.textContent.trim() ??
    el.closest("[popover], dialog")?.id ??
    "";

  const style = document.createElement("style");
  style.textContent =
    "*, *::before, *::after { transition: none !important; animation-play-state: paused !important; }";
  document.head.append(style);
  const park = document.createElement("div");
  Object.assign(park.style, {
    position: "fixed",
    insetBlockEnd: "0",
    insetInlineEnd: "0",
    inlineSize: "4px",
    blockSize: "4px",
    zIndex: "2147483647",
  });
  document.body.append(park);

  const split = (sel: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    let cur = "";
    for (const ch of sel) {
      depth += "([".includes(ch) ? 1 : ")]".includes(ch) ? -1 : 0;
      if (ch === "," && depth === 0) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    return [...out, cur.trim()].filter((s) => s !== "");
  };
  /** The selector up to the end of the compound holding :hover, unhovered. */
  const hovered = (sel: string): string | null => {
    const at = sel.indexOf(":hover");
    if (at < 0) {
      return null;
    }
    let depth = 0;
    let end = at + 6;
    for (; end < sel.length; end++) {
      const ch = sel.charAt(end);
      if ("([".includes(ch)) {
        depth++;
      } else if (")]".includes(ch)) {
        if (depth === 0) {
          break;
        }
        depth--;
      } else if (depth === 0 && /[\s>+~]/.test(ch)) {
        break;
      }
    }
    return sel.slice(0, end).replaceAll(":hover", "") || "*";
  };
  const compounds = new Set<string>();
  const visit = (rules: CSSRuleList, parents: string[]): void => {
    for (const rule of rules) {
      let sels = parents;
      if (rule instanceof CSSStyleRule) {
        const own = split(rule.selectorText);
        sels =
          parents.length === 0
            ? own
            : parents.flatMap((p) =>
                own.map((s) =>
                  s.includes("&") ? s.replaceAll("&", `:is(${p})`) : `:is(${p}) ${s}`,
                ),
              );
        for (const s of sels) {
          const h = hovered(s);
          if (h !== null) {
            compounds.add(h);
          }
        }
      }
      if ("cssRules" in rule) {
        visit(rule.cssRules as CSSRuleList, sels);
      }
    }
  };
  for (const sheet of document.styleSheets) {
    visit(sheet.cssRules, []);
  }

  const layers = [...document.querySelectorAll<HTMLElement>("[popover], dialog")];
  const scopeOf = (layer: number | null): ParentNode =>
    layer === null ? document : (layers[layer] ?? document);
  const shown = (el: Element): boolean => {
    const box = el.getBoundingClientRect();
    return el.checkVisibility() && box.width > 0 && box.height > 0 && el !== park;
  };
  const paint = (el: Element, pseudo?: string): string[] => {
    const cs = getComputedStyle(el, pseudo);
    return PAINT.map((p) => cs.getPropertyValue(p));
  };
  interface Shot {
    readonly el: Element;
    readonly pseudo: string | undefined;
    readonly value: string[];
  }
  const take = (els: Iterable<Element>, also: Element | null): Shot[] => [
    ...[...els].map((el) => ({ el, pseudo: undefined, value: paint(el) })),
    ...(also === null
      ? []
      : ["::before", "::after"].map((pseudo) => ({
          el: also,
          pseudo,
          value: paint(also, pseudo),
        }))),
  ];
  const changes = (shots: readonly Shot[]): string[] =>
    shots.flatMap(({ el, pseudo, value }) => {
      const now = paint(el, pseudo);
      const props = PAINT.filter((_, k) => now[k] !== value[k]);
      return props.length === 0 ? [] : [`${name(el)}${pseudo ?? ""} ${props.join(",")}`];
    });
  // A part of an open layer is in view already; scrolling the page under
  // an anchored popover leaves it a frame behind in WebKit.
  const reveal = (el: Element): void => {
    if (el.closest(":popover-open, dialog[open]") === null) {
      el.scrollIntoView({ block: "center", inline: "nearest" });
    }
  };
  const frame = (): Promise<void> =>
    new Promise((ok) => {
      requestAnimationFrame(() => {
        ok();
      });
    });
  /** A point of `el` in view whose hit, up to `el`, is no control. */
  const blank = (el: Element): Point | null => {
    for (const box of el.getClientRects()) {
      for (const fy of [0.5, 0.2, 0.8, 0.1, 0.35, 0.65, 0.9]) {
        for (const fx of [0.5, 0.15, 0.85, 0.03, 0.97, 0.3, 0.7]) {
          const x = box.left + box.width * fx;
          const y = box.top + box.height * fy;
          if (x < 0 || y < 0 || x >= innerWidth - 8 || y >= innerHeight - 8) {
            continue;
          }
          const hit = document.elementFromPoint(x, y);
          if (hit !== null && el.contains(hit) && !underControl(hit, el)) {
            return { x, y };
          }
        }
      }
    }
    return null;
  };

  let hoverables: Element[] = [];
  let shots: Shot[] = [];
  let rows: { row: Element; kind: Kind; action: HTMLElement | null }[] = [];
  let parts: {
    part: HTMLElement;
    row: (typeof rows)[number];
    at: Point;
    idle: string[];
  }[] = [];
  let pressed: EventTarget | null = null;
  // Only a row's press is caught, so a layer's opener still opens it.
  let catching = false;
  addEventListener(
    "click",
    (e) => {
      if (catching) {
        pressed = e.target;
        e.preventDefault();
        e.stopPropagation();
      }
    },
    { capture: true },
  );

  const classify = (row: Element): { row: Element; kind: Kind; action: HTMLElement | null } => {
    if (row.matches("a[href], button")) {
      return { row, kind: "self", action: row as HTMLElement };
    }
    const actions = [...row.querySelectorAll<HTMLElement>(ACTION)].filter((a) => {
      const layer = a.parentElement?.closest("[popover]");
      return layer == null || layer.contains(row);
    });
    const [only] = actions;
    if (actions.length === 1 && only?.matches("a[href], button") === true) {
      return { row, kind: "one", action: only };
    }
    return { row, kind: actions.length === 0 ? "none" : "many", action: null };
  };

  const FOCUSABLE = '[tabindex]:not([tabindex="-1"]), [data-cp-tip-toggle]';
  /** A row's fill: its own background, and a table row's cells'. */
  const fills = (row: Element): string[] =>
    [row, ...(row instanceof HTMLTableRowElement ? row.cells : [])].map(
      (el) => getComputedStyle(el).backgroundColor,
    );
  const tipSays = (): string | null => {
    const tip = document.querySelector(".cp-tooltip");
    return tip?.matches(":popover-open") === true ? tip.textContent : null;
  };
  /** Polls for the tip to say `words`, as long as a mouse rest takes. */
  const tipFor = async (words: string): Promise<boolean> => {
    for (let n = 0; n < 40; n++) {
      if (tipSays() === words) {
        return true;
      }
      await new Promise((ok) => setTimeout(ok, 50));
    }
    return false;
  };
  const probe: Probe = {
    park: { x: innerWidth - 2, y: innerHeight - 2 },
    layers: () => layers.length,
    open(i) {
      const l = layers[i];
      if (l === undefined) {
        return false;
      }
      // A layer opens as a person opens it, through its opener in view,
      // which pairs an anchored popover with it; shown by script alone,
      // WebKit places the popover at its opener's place in the page.
      const opener =
        l.id === ""
          ? null
          : document.querySelector<HTMLElement>(
              `[popovertarget="${CSS.escape(l.id)}"]:not([popovertargetaction="hide"])`,
            );
      if (opener?.checkVisibility() === true) {
        opener.scrollIntoView({ block: "start", inline: "nearest" });
        opener.click();
        if (l.matches(":popover-open")) {
          return shown(l);
        }
      }
      try {
        if (l instanceof HTMLDialogElement) {
          l.show();
        } else {
          l.showPopover();
        }
      } catch {
        return false;
      }
      return shown(l);
    },
    close(i) {
      const l = layers[i];
      if (l instanceof HTMLDialogElement) {
        l.close();
      } else if (l?.matches(":popover-open") === true) {
        l.hidePopover();
      }
    },
    hoverables(layer) {
      const scope = scopeOf(layer);
      const found = new Set<Element>();
      for (const c of compounds) {
        try {
          for (const el of scope.querySelectorAll(c)) {
            if (shown(el) && !underControl(el, null)) {
              found.add(el);
            }
          }
        } catch {
          // A compound only a :has() or :not() argument held, cut mid-way.
        }
      }
      hoverables = [...found];
      return hoverables.length;
    },
    aim(i) {
      const el = hoverables[i];
      if (el === undefined) {
        return null;
      }
      reveal(el);
      const at = blank(el);
      const parent = el.parentElement;
      const near =
        parent !== null && parent.getElementsByTagName("*").length < 1500
          ? [parent, ...parent.querySelectorAll("*")]
          : [el, ...el.querySelectorAll("*")];
      shots = take(near, el);
      const box = el.getBoundingClientRect();
      const inView =
        box.bottom > 0 && box.right > 0 && box.top < innerHeight && box.left < innerWidth;
      return at ?? (inView ? null : `${where(el)}: ${name(el)} is out of the window`);
    },
    async diff(i) {
      await frame();
      const el = hoverables[i];
      if (el === undefined) {
        return [];
      }
      const said = `${where(el)}: hovering ${name(el)}`;
      return el.matches(":hover")
        ? changes(shots).map((c) => `${said} changed ${c}`)
        : [`${said} did not hover it`];
    },
    async rested() {
      await frame();
      return changes(shots).length === 0;
    },
    rows(layer) {
      rows = [...scopeOf(layer).querySelectorAll(ROWS)].filter(shown).map(classify);
      return rows.map((r) => r.kind);
    },
    aimRow(i) {
      const was = rows[i];
      if (was === undefined) {
        return "gone";
      }
      // A live row, such as a job that ends, may have changed since.
      const r = classify(was.row);
      rows[i] = r;
      reveal(r.row);
      shots = take([r.row, ...r.row.querySelectorAll("*")], null);
      pressed = null;
      catching = true;
      if (r.kind === "self" || r.kind === "one") {
        const box = r.row.getBoundingClientRect();
        return { x: box.right - 3, y: box.top + box.height / 2 };
      }
      return (
        blank(r.row) ??
        `${where(r.row)}: ${r.kind}-action row ${name(r.row)} has no part free of controls`
      );
    },
    same(i) {
      const r = rows[i];
      return r === undefined || classify(r.row).kind === r.kind;
    },
    async checkRow(i, step) {
      await frame();
      const r = rows[i];
      if (r === undefined) {
        return [];
      }
      const said = `${where(r.row)}: ${r.kind}-action row ${name(r.row)}`;
      const whole = r.kind === "self" || r.kind === "one";
      if (step === "hover") {
        const changed = changes(shots);
        if (whole && changed.length === 0 && !r.row.matches(SELECTED)) {
          return [`${said} shows no hover at its far end`];
        }
        return whole ? [] : changed.map((c) => `${said} changed ${c} under the mouse`);
      }
      if (step === "press") {
        catching = false;
        const t = pressed instanceof Element ? pressed : null;
        if (whole) {
          return t !== null && r.action?.contains(t) === true
            ? []
            : [`${said}: a press at its far end reached ${t === null ? "nothing" : name(t)}`];
        }
        return t !== null && underControl(t, r.row)
          ? [`${said}: a press on its blank part reached ${name(t)}`]
          : [];
      }
      if (!whole || r.action === null) {
        return [];
      }
      (document.activeElement as HTMLElement | null)?.blur();
      r.action.focus({ focusVisible: true });
      const box = r.row.getBoundingClientRect();
      const ring =
        r.kind === "one"
          ? getComputedStyle(r.action, "::after")
          : getComputedStyle(
              (r.row.closest('[data-layout="grid"]') === null
                ? null
                : r.row.querySelector(":scope > .cp-cover")) ?? r.row,
            );
      const drawn =
        ring.outlineStyle === "solid" &&
        (r.kind === "self" ||
          (Math.abs(parseFloat(ring.width) - box.width) <= 1 &&
            Math.abs(parseFloat(ring.height) - box.height) <= 1));
      r.action.blur();
      return drawn ? [] : [`${said} draws no ring round itself on focus`];
    },
    parts(i) {
      const r = rows[i];
      const action = r?.action;
      if (r?.kind !== "one" || action == null) {
        parts = [];
        return [];
      }
      parts = [...r.row.querySelectorAll<HTMLElement>(`${FOCUSABLE}, [data-cp-tip]`)]
        .filter((part) => !action.contains(part) && shown(part))
        .map((part) => ({ part, row: r, at: { x: 0, y: 0 }, idle: [] }));
      return parts.map(({ part }) => part.matches("[data-cp-tip-toggle]"));
    },
    aimPart(j) {
      const p = parts[j];
      if (p === undefined) {
        return { x: 0, y: 0 };
      }
      reveal(p.part);
      const box = p.part.getBoundingClientRect();
      p.at = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      p.idle = fills(p.row.row);
      pressed = null;
      catching = true;
      return p.at;
    },
    async checkPart(j, step) {
      const p = parts[j];
      if (p === undefined) {
        return [];
      }
      const { part, row, at } = p;
      const said = `${where(row.row)}: ${name(part)} in one-action row ${name(row.row)}`;
      const own = part.matches(FOCUSABLE);
      const words = part.dataset["cpTip"];
      if (step === "rest") {
        const hit = document.elementFromPoint(at.x, at.y);
        const wrong =
          own && (hit === null || !part.contains(hit))
            ? [`${said} is covered by ${hit === null ? "nothing" : name(hit)}`]
            : [];
        if (own && fills(row.row).join() !== p.idle.join()) {
          wrong.push(`${said} shows the row's hover fill, though a press on it follows nothing`);
        }
        return words === undefined || (await tipFor(words))
          ? wrong
          : [...wrong, `${said} shows no tip to a mouse resting on it`];
      }
      if (step === "down") {
        await frame();
        return own && fills(row.row).join() !== p.idle.join()
          ? [`${said} shows the row's pressed fill, though a press on it follows nothing`]
          : [];
      }
      if (step === "press") {
        catching = false;
        const t = pressed instanceof Element ? pressed : null;
        const followed = t !== null && row.action?.contains(t) === true;
        if (own === followed) {
          return [`${said}: a press on it ${own ? "followed" : "missed"} the row's action`];
        }
        return [];
      }
      const tap = () =>
        document.elementFromPoint(at.x, at.y)?.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            composed: true,
            pointerType: "touch",
          }),
        );
      tap();
      const shows = tipSays() === words;
      tap();
      return shows ? [] : [`${said} shows no tip on a tap`];
    },
  };
  (globalThis as unknown as { cpProbe: () => Probe }).cpProbe = () => probe;
}

// The page's global, which installProbe sets; only callbacks sent to the
// page call it.
declare const cpProbe: () => Probe;

describe.each(browsers)("the gallery in %s", (name) => {
  let browser: Browser | undefined;

  beforeAll(async () => {
    const engine = ENGINES[name];
    if (engine === undefined) {
      throw new TypeError(`unknown browser ${name}`);
    }
    browser = await engine.launch();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  /** Presses Tab once: whether it reached the page's first tabbable element,
   *  what it reached, and the page's scroll after it. */
  const tabFromStart = async (tab: Page) => {
    await tab.keyboard.press("Tab");
    return tab.evaluate(() => {
      const first = [
        ...document.querySelectorAll<HTMLElement>(
          "a[href], button, input, select, textarea, summary, [tabindex]",
        ),
      ].find(
        (el) =>
          el.tabIndex >= 0 &&
          !el.matches(":disabled") &&
          el.checkVisibility() &&
          el.closest("[inert], [hidden], dialog:not([open])") === null,
      );
      return {
        first: first !== undefined && document.activeElement === first,
        at: document.activeElement?.outerHTML.slice(0, 60) ?? "",
        y: scrollY,
      };
    });
  };

  it.each([...pageNames, ...frameNames, ...templateNames])(
    "loads %s with no error, every icon painted, every row title an element, nothing wider than a phone and each account button named by its text",
    async (page) => {
      const report: Record<string, unknown> = {};
      for (const width of [1440, 390]) {
        const tab = await (browser as Browser).newPage({ viewport: { width, height: 900 } });
        const errors: string[] = [];
        tab.on("pageerror", (e) => errors.push(e.message));
        await tab.goto(`${origin}/${page}.html`);
        await tab.evaluate(() => document.fonts.ready.then(() => undefined));
        const state = {
          ...(await tab.evaluate(() => ({
            wide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            unpainted: [...document.querySelectorAll<HTMLElement>(".cp-icon")].filter(
              (i) =>
                getComputedStyle(i).getPropertyValue("--cp-icon-image") === "" &&
                i.checkVisibility({ visibilityProperty: true }),
            ).length,
            // A row's lines are set as a pair only when its title is an element.
            bareTitles: [
              ...document.querySelectorAll(".cp-list > li > .cp-list-row > .cp-cell-stack"),
            ].filter(
              (s) =>
                s.childElementCount > 0 &&
                [...s.childNodes].some(
                  (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "",
                ),
            ).length,
          }))),
          misnamed: await tab.evaluate(misnamedAccounts),
        };
        if (
          errors.length > 0 ||
          (width === 390 && state.wide) ||
          state.unpainted > 0 ||
          state.bareTitles > 0 ||
          state.misnamed.length > 0
        ) {
          report[String(width)] = { errors, ...state };
        }
        await tab.close();
      }
      expect(report).toEqual({});
    },
    60_000,
  );

  it("names an account button by its initials, or Account alone over an empty avatar", async () => {
    const tab = await (browser as Browser).newPage();
    const button = (name: string, text: string): string =>
      `<button class="cp-button cp-account" type="button" aria-label="${name}"><span class="cp-avatar" data-size="sm">${text}</span></button>`;
    await tab.setContent(
      [
        button("CP, account", "CP"),
        button("C, account", "C"),
        button("Account", ""),
        button("Account", "CP"),
        button("CP, account", ""),
      ].join(""),
    );
    const misnamed = await tab.evaluate(misnamedAccounts);
    await tab.close();
    expect(misnamed).toEqual(["Account / CP", "CP, account / "]);
  });

  it("fills the sign-in page's gate panel with the account screen, refusing a wrong password in its words", async () => {
    const tab = await (browser as Browser).newPage();
    await tab.goto(`${origin}/sign-in.html`);
    const panel = tab.locator("main.cp-gate > .cp-panel");
    await expect.poll(() => panel.locator("form").count()).toBeGreaterThan(0);
    expect(await tab.locator("h1").allInnerTexts()).toEqual(["Sign in"]);
    expect(await tab.locator("main [class*='g-']").count()).toBe(0);
    await panel.getByLabel("Username").fill("mika");
    await panel.getByLabel("Password", { exact: true }).fill("wrong");
    await panel.locator("button[type='submit']").first().click();
    await expect
      .poll(() => panel.locator(".cp-notice[data-tone='danger']:not([hidden])").innerText(), {
        timeout: 10_000,
      })
      .toContain("username or password");
    await tab.close();
  }, 60_000);

  it("clears every row of a choices set whose legend has a button under the floats, and no other set's", async () => {
    const wrong: string[] = [];
    let floated = 0;
    for (const page of ["forms", "settings", "overlays"]) {
      const tab = await (browser as Browser).newPage();
      await tab.goto(`${origin}/${page}.html`);
      const seen = await tab.evaluate(() => {
        const out = { floated: 0, wrong: [] as string[] };
        for (const set of document.querySelectorAll(".cp-choices")) {
          const legend = set.firstElementChild;
          const button = legend?.nextElementSibling;
          const has = legend?.localName === "legend" && button?.matches(".cp-button") === true;
          out.floated += has ? 1 : 0;
          for (const row of set.children) {
            const want = has && row !== legend && row !== button ? "both" : "none";
            if (getComputedStyle(row).clear !== want) {
              out.wrong.push(`${row.outerHTML.slice(0, 80)}: not ${want}`);
            }
          }
        }
        return out;
      });
      floated += seen.floated;
      wrong.push(...seen.wrong.map((w) => `${page}: ${w}`));
      await tab.close();
    }
    expect(floated).toBeGreaterThan(0);
    expect(wrong).toEqual([]);
  }, 60_000);

  // A `:has()` left of a combinator whose last compound names no class, type
  // or attribute makes Chromium restyle the whole page on every insertion,
  // about 9,800 elements here; Chromium's trace counts the elements each
  // restyle visits. How Blink's `:has()` invalidation works:
  // https://blogs.igalia.com/blee/posts/2023/05/31/how-blink-invalidates-styles-when-has-in-use.html
  it.runIf(name === "chromium")(
    "restyles under a tenth of the page, not all of it, once a node is added to a chart",
    async () => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 1440, height: 900 } });
      await tab.goto(`${origin}/charts.html`);
      // A font load restyles the whole tree in Blink, so the page settles and
      // flushes before the bracketed insertion.
      await tab.evaluate(async () => {
        await document.fonts.ready;
        await new Promise(requestAnimationFrame);
        void getComputedStyle(document.body).color;
      });
      const cdp = await tab.context().newCDPSession(tab);
      const events: Record<string, unknown>[] = [];
      cdp.on("Tracing.dataCollected", (e) => events.push(...e.value));
      const done = new Promise((ok) => cdp.once("Tracing.tracingComplete", ok));
      await cdp.send("Tracing.start", { categories: "devtools.timeline" });
      const page = await tab.evaluate(() => {
        const plot = document.querySelector('.cp-chart > [data-part="plot"]') as Element;
        void getComputedStyle(plot).color;
        console.timeStamp("insert:start");
        plot.append(document.createElement("span"));
        void getComputedStyle(plot).color;
        console.timeStamp("insert:end");
        return document.getElementsByTagName("*").length;
      });
      await cdp.send("Tracing.end");
      await done;
      await tab.close();
      const mark = (message: string): number | undefined =>
        events.find(
          (e) =>
            e["name"] === "TimeStamp" &&
            (e["args"] as { data?: { message?: unknown } } | undefined)?.data?.message === message,
        )?.["ts"] as number | undefined;
      const start = mark("insert:start") ?? Infinity;
      const end = mark("insert:end") ?? -Infinity;
      const counts = events.flatMap((e) => {
        const count = (e["args"] as { elementCount?: unknown } | undefined)?.elementCount;
        const ts = e["ts"] as number;
        return e["name"] === "UpdateLayoutTree" &&
          typeof count === "number" &&
          ts > start &&
          ts < end
          ? [count]
          : [];
      });
      expect(counts).toHaveLength(1);
      expect(counts[0]).toBeLessThan(page / 10);
    },
    60_000,
  );

  it.each([...pageNames, ...frameNames, ...templateNames])(
    "draws %s's tip toggles as focusable text, and each info glyph bare on its text's cap band",
    async (page) => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 1440, height: 900 } });
      await tab.goto(`${origin}/${page}.html`);
      await tab.evaluate(() => document.fonts.ready.then(() => undefined));
      const wrong = await tab.evaluate(() => {
        const found: string[] = [];
        const name = (el: Element) =>
          `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent).trim().slice(0, 40)}"`;
        const glyphs = new Set(["info", "circle-help"]);
        for (const b of document.querySelectorAll('button, [role="button"]')) {
          const kids = [...b.children];
          if (
            kids.length > 0 &&
            kids.every((k) => glyphs.has(k.getAttribute("data-cp-icon") ?? "")) &&
            b.textContent.trim() === ""
          ) {
            found.push(`an info glyph drawn as a button: ${name(b)}`);
          }
        }
        for (const t of document.querySelectorAll<HTMLElement>("[data-cp-tip-toggle]")) {
          if (t.matches('button, [role="button"]')) {
            found.push(`a tip toggle that is a button: ${name(t)}`);
          } else if (t.closest('[aria-hidden="true"]') === null && t.tabIndex !== 0) {
            found.push(`a tip toggle the keyboard cannot reach: ${name(t)}`);
          }
        }
        for (const g of document.querySelectorAll<HTMLElement>(".cp-info")) {
          if (!g.checkVisibility()) {
            continue;
          }
          const text = g.parentElement as HTMLElement;
          const probe = document.createElement("span");
          Object.assign(probe.style, {
            display: "inline-block",
            inlineSize: "0",
            blockSize: "1cap",
          });
          text.append(probe);
          const band = probe.getBoundingClientRect();
          probe.remove();
          const box = g.getBoundingClientRect();
          const off = box.top + box.height / 2 - (band.top + band.height / 2);
          if (text.textContent.trim() === "" || Math.abs(off) > 0.5) {
            found.push(`an info glyph ${off.toFixed(2)}px off its text's cap band: ${name(g)}`);
          }
          if (g.matches("button, [role='button']") || g.tabIndex !== 0) {
            found.push(`an info glyph that is not a focusable span: ${name(g)}`);
          }
          for (const state of ["rest", "focus"]) {
            if (state === "focus") {
              g.focus({ focusVisible: true });
            }
            const cs = getComputedStyle(g);
            const sides = [
              cs.borderTopStyle,
              cs.borderRightStyle,
              cs.borderBottomStyle,
              cs.borderLeftStyle,
            ];
            if (
              cs.backgroundColor !== "rgba(0, 0, 0, 0)" ||
              cs.backgroundImage !== "none" ||
              sides.some((s) => s !== "none") ||
              cs.boxShadow !== "none"
            ) {
              found.push(`an info glyph with a box at ${state}: ${name(g)}`);
            }
          }
          g.blur();
        }
        return found;
      });
      await tab.close();
      expect(wrong).toEqual([]);
    },
    60_000,
  );

  it("states a component's failing rule in its details, beside how often it is checked, with no glyph on its state", async () => {
    const tab = await (browser as Browser).newPage({ viewport: { width: 1440, height: 900 } });
    await tab.goto(`${origin}/navigation.html`);
    const blocks = await tab.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('ul.cp-list[aria-labelledby^="cs-"]')].map(
        (ul) => {
          const details = ul.querySelector("details") as HTMLDetailsElement;
          details.open = true;
          const facts = [...ul.querySelectorAll(".cp-facts > dt")].map((dt) => [
            dt.textContent.trim(),
            (dt.nextElementSibling as Element).textContent.trim(),
            (dt as HTMLElement).checkVisibility(),
          ]);
          const outside = (s: string) =>
            [...ul.querySelectorAll(s)].filter((el) => !details.contains(el)).length;
          return {
            name: ul.getAttribute("aria-labelledby"),
            facts,
            stateGlyphs: ul.querySelectorAll(
              '.cp-state :is(.cp-info, [data-cp-tip-toggle], [data-cp-icon="info"])',
            ).length,
            tips: outside("[data-cp-tip-toggle], .cp-info, [data-cp-icon='info']"),
            stateTip: ul.querySelector(".cp-state")?.hasAttribute("data-cp-tip"),
          };
        },
      ),
    );
    await tab.close();
    const rule = {
      "cs-sonarr": "2 failed checks in a row",
      "cs-seadex": "2 unanswered checks in a row",
    };
    expect(blocks.map((b) => b.name)).toEqual(Object.keys(rule));
    for (const b of blocks) {
      const at = b.facts.findIndex(([dt]) => dt === "Checked");
      expect(b.facts[at + 1], `${b.name} rule beside Checked`).toEqual([
        "Fails after",
        rule[b.name as keyof typeof rule],
        true,
      ]);
      expect([b.stateGlyphs, b.tips, b.stateTip], `${b.name} glyphs`).toEqual([0, 0, false]);
    }
  });

  it.each([...pageNames, ...frameNames, ...templateNames])(
    "changes nothing on %s under the mouse but its controls",
    async (page) => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 1440, height: 900 } });
      await tab.goto(`${origin}/${page}.html`);
      await tab.evaluate(() => document.fonts.ready.then(() => undefined));
      await tab.evaluate(installProbe);
      const park = await tab.evaluate(() => cpProbe().park);
      const wrong: string[] = [];
      const layers = await tab.evaluate(() => cpProbe().layers());
      for (const layer of [null, ...Array.from({ length: layers }, (_, k) => k)]) {
        if (layer !== null && !(await tab.evaluate((l) => cpProbe().open(l), layer))) {
          continue;
        }
        const count = await tab.evaluate((l) => cpProbe().hoverables(l), layer);
        /** What hovering hoverable `i` changed. */
        const hover = async (i: number): Promise<string[]> => {
          await tab.mouse.move(park.x, park.y);
          const at = await tab.evaluate((k) => cpProbe().aim(k), i);
          if (typeof at === "string") {
            return [at];
          }
          if (at === null) {
            return [];
          }
          await tab.mouse.move(at.x, at.y);
          return tab.evaluate((k) => cpProbe().diff(k), i);
        };
        /** Whether what hovering changed stays with the mouse parked, so
         *  the page changed by itself, as a live job that ends. */
        const moved = async (): Promise<boolean> => {
          await tab.mouse.move(park.x, park.y);
          return !(await tab.evaluate(() => cpProbe().rested()));
        };
        for (let i = 0; i < count; i++) {
          let found = await hover(i);
          for (let n = 0; n < 2 && found.length > 0 && (await moved()); n++) {
            found = await hover(i);
          }
          wrong.push(...found);
        }
        if (layer !== null) {
          await tab.evaluate((l) => {
            cpProbe().close(l);
          }, layer);
        }
      }
      await tab.close();
      expect(wrong).toEqual([]);
    },
    300_000,
  );

  it.each([...pageNames, ...frameNames, ...templateNames])(
    "makes each row on %s of one action that action, whole, and leaves any other row to its controls",
    async (page) => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 1440, height: 900 } });
      await tab.goto(`${origin}/${page}.html`);
      await tab.evaluate(() => document.fonts.ready.then(() => undefined));
      await tab.evaluate(installProbe);
      const park = await tab.evaluate(() => cpProbe().park);
      const wrong: string[] = [];
      const layers = await tab.evaluate(() => cpProbe().layers());
      for (const layer of [null, ...Array.from({ length: layers }, (_, k) => k)]) {
        if (layer !== null && !(await tab.evaluate((l) => cpProbe().open(l), layer))) {
          continue;
        }
        const kinds = await tab.evaluate((l) => cpProbe().rows(l), layer);
        /** What row `i` did wrong, through each step. */
        const sweep = async (i: number): Promise<string[]> => {
          const out: string[] = [];
          await tab.mouse.move(park.x, park.y);
          const at = await tab.evaluate((k) => cpProbe().aimRow(k), i);
          if (typeof at === "string") {
            return [at];
          }
          await tab.mouse.move(at.x, at.y);
          out.push(...(await tab.evaluate((k) => cpProbe().checkRow(k, "hover"), i)));
          await tab.mouse.down();
          await tab.mouse.up();
          out.push(...(await tab.evaluate((k) => cpProbe().checkRow(k, "press"), i)));
          await tab.mouse.move(park.x, park.y);
          // A key press puts the page in keyboard modality, so the ring
          // step's focus() matches :focus-visible after the mouse press.
          await tab.keyboard.press("Shift");
          out.push(...(await tab.evaluate((k) => cpProbe().checkRow(k, "ring"), i)));
          const toggles = await tab.evaluate((k) => cpProbe().parts(k), i);
          for (const [j, toggle] of toggles.entries()) {
            await tab.mouse.move(park.x, park.y);
            const part = await tab.evaluate((p) => cpProbe().aimPart(p), j);
            await tab.mouse.move(part.x, part.y);
            out.push(...(await tab.evaluate((p) => cpProbe().checkPart(p, "rest"), j)));
            await tab.mouse.down();
            out.push(...(await tab.evaluate((p) => cpProbe().checkPart(p, "down"), j)));
            await tab.mouse.up();
            out.push(...(await tab.evaluate((p) => cpProbe().checkPart(p, "press"), j)));
            if (toggle) {
              await tab.mouse.move(park.x, park.y);
              out.push(...(await tab.evaluate((p) => cpProbe().checkPart(p, "tap"), j)));
            }
          }
          return out;
        };
        for (const [i] of kinds.entries()) {
          // A live row, such as a job that ends, can change kind between
          // its aim and its checks, so a changed row is swept again.
          let found = await sweep(i);
          for (let n = 0; n < 2 && !(await tab.evaluate((k) => cpProbe().same(k), i)); n++) {
            found = await sweep(i);
          }
          wrong.push(...found);
        }
        if (layer !== null) {
          await tab.evaluate((l) => {
            cpProbe().close(l);
          }, layer);
        }
      }
      await tab.close();
      expect(wrong).toEqual([]);
    },
    300_000,
  );

  it("finds every file the pages ask for", () => {
    expect([...missing]).toEqual([]);
  });

  describe("the conversation's address", () => {
    const M = "/messages.html";
    /** The conversations the page knows by address, with their titles: the
     *  list's rows, then the first page Show older brings in. */
    const KNOWN: Record<string, string> = {
      "c-internal": "/workspace/grelot/internal",
      "c-announce": "Announcements",
      "c-kiro-codex": "@kiro and @codex",
      "c-ui-data": "/workspace/ui/src/data",
      "c-marotte": "/workspace/marotte/static-src",
      "c-claude-gpt": "@claude and @gpt",
      "c-kiro-gpt": "@kiro and @gpt",
      "c-leads": "@library-reorg-lead and @ui-design-research",
      "c-ci": "/workspace/ci/.github/workflows",
      "c-codex-claude": "@codex and @claude",
      "c-monitoring": "/workspace/monitoring/alerts/rules",
    };
    type Action =
      | `load ${string}`
      | `press #${string}`
      | `chip #${string}`
      | `svg #${string}`
      | `area #${string}`
      | `malformed ${string}`
      | `unseen #${string}`
      | `unseen-chip #${string}`
      | `filter ${string}`
      | `focus #${string}`
      | `resize ${number}`
      | "author"
      | "ctrl-author"
      | "older"
      | "close"
      | "escape"
      | "back"
      | "forward"
      | "reload";
    /** An action, the address it ends on, and where focus ends when that is the point.
     *  Close and Escape default to the closed row, or the list's tab stop; a chip
     *  that opened the entry takes focus back, as list-detail returns it to its opener. */
    type Step = readonly [Action, string, string?];
    interface Want {
      readonly address: string;
      readonly length?: number;
      readonly focus?: string;
      readonly top?: number;
      readonly scrollY?: number;
      /** An element whose top must sit in the viewport. */
      readonly inView?: string;
      /** The page's scroll before a press on what is shown, and how far the
       *  heading lay outside the viewport: it must be wholly in view, the
       *  page moved by no more than that. */
      readonly reveal?: { readonly y: number; readonly most: number };
    }

    // In every document of the tab: the feed's scroller, and a record of
    // the rows made current from the moment `cpWatch()` is called.
    const helpers = () => {
      Object.assign(window, {
        cpScroller: (): Element => {
          for (let at = document.getElementById("msg-feed")?.parentElement; at;) {
            const y = getComputedStyle(at).overflowY;
            if ((y === "auto" || y === "scroll") && at.scrollHeight > at.clientHeight) {
              return at;
            }
            at = at.parentElement;
          }
          return document.documentElement;
        },
        cpWatch: (): void => {
          const made: string[] = [];
          Object.assign(window, { cpMade: made });
          new MutationObserver((records) => {
            for (const r of records) {
              if (r.target instanceof Element && r.target.hasAttribute("aria-current")) {
                made.push(r.target.getAttribute("href") ?? "");
              }
            }
          }).observe(document.getElementById("msg-list") ?? document, {
            subtree: true,
            attributeFilter: ["aria-current"],
          });
        },
      });
    };
    interface Helpers {
      cpScroller: () => Element;
      cpWatch: () => void;
      cpMade?: string[];
    }

    /** Invariant 1 on the page now, and `want`'s address, history length,
     *  focus, feed scroll and page scroll: each one that does not hold. */
    const broken = (tab: Page, want: Want) =>
      tab.evaluate(
        ({ w, known }) => {
          const out: string[] = [];
          const at = location.pathname + location.hash;
          if (at !== w.address) {
            out.push(`address ${at}`);
          }
          if (w.length !== undefined && history.length !== w.length) {
            out.push(`history.length ${String(history.length)}, was ${String(w.length)}`);
          }
          if (location.pathname !== "/messages.html") {
            return out;
          }
          if (document.querySelector("[data-build]") === null) {
            return [...out, "not wired yet"];
          }
          const title = document.getElementById("msg-title");
          const detail = title?.closest<HTMLElement>(".cp-detail");
          const dialog = document.querySelector<HTMLDialogElement>("#msg + dialog");
          const docked = document.getElementById("msg")?.hasAttribute("data-cp-docked") === true;
          const shown = detail?.hidden === false && (docked || dialog?.open === true);
          const name = known[location.hash.slice(1)];
          if (name === undefined ? shown : !shown || title?.textContent !== name) {
            out.push(`shows ${shown ? (title?.textContent ?? "") : "nothing"}`);
          }
          const rows = [...document.querySelectorAll("#msg-list a.cp-list-row")];
          const current = rows
            .filter((a) => a.hasAttribute("aria-current"))
            .map((a) => a.getAttribute("href"))
            .join(" ");
          const loaded = rows.some((a) => a.getAttribute("href") === location.hash);
          if (current !== (name !== undefined && loaded ? location.hash : "")) {
            out.push(`current "${current}"`);
          }
          const focused = document.activeElement;
          if (w.focus !== undefined && focused?.matches(w.focus) !== true) {
            out.push(`focus on ${focused?.outerHTML.slice(0, 50) ?? "nothing"}`);
          }
          if (w.top !== undefined) {
            const top = (window as unknown as Helpers).cpScroller().scrollTop;
            if (Math.abs(top - w.top) > 1) {
              out.push(`feed scrolled to ${String(top)}`);
            }
          }
          if (w.scrollY !== undefined && Math.abs(scrollY - w.scrollY) > 1) {
            out.push(`page scrolled to ${String(scrollY)}, was ${String(w.scrollY)}`);
          }
          const vh = document.documentElement.clientHeight;
          if (w.inView !== undefined) {
            const top = document.querySelector(w.inView)?.getBoundingClientRect().top;
            if (top === undefined || top < 0 || top >= vh) {
              out.push(`${w.inView}'s top at ${String(top)}`);
            }
          }
          if (w.reveal !== undefined) {
            const r = title?.getBoundingClientRect();
            const pad =
              Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
            if (r === undefined || r.top < pad - 1 || r.bottom > vh + 1) {
              out.push(`heading at ${String(r?.top)} to ${String(r?.bottom)}`);
            }
            if (w.reveal.most < 0) {
              out.push("the heading was in view before the press");
            } else if (Math.abs(scrollY - w.reveal.y) > w.reveal.most + 1) {
              out.push(
                `page scrolled ${String(scrollY - w.reveal.y)}, past ${String(w.reveal.most)}`,
              );
            }
          }
          return out;
        },
        { w: want, known: KNOWN },
      );
    /** What still breaks once the page settles: polled up to 5 s, then read again. */
    const settle = async (tab: Page, want: Want): Promise<string[]> => {
      const read = () =>
        broken(tab, want).catch((e: unknown) => [`unreadable: ${String(e).slice(0, 60)}`]);
      let last = await read();
      for (const end = Date.now() + 5000; last.length > 0 && Date.now() < end;) {
        await tab.waitForTimeout(100);
        last = await read();
      }
      await tab.waitForTimeout(300);
      return read();
    };
    const enter = async (tab: Page, selector: string) => {
      await tab.locator(selector).first().focus();
      await tab.keyboard.press("Enter");
    };

    /** Runs `steps` on a tab `width` wide and reports each step that broke an invariant. */
    const run = async (width: number, fresh: boolean, steps: readonly Step[]) => {
      const tab = await (browser as Browser).newPage({ viewport: { width, height: 800 } });
      await tab.addInitScript(helpers);
      const errors: string[] = [];
      tab.on("pageerror", (e) => errors.push(e.message));
      if (!fresh) {
        await tab.goto(`${origin}/index.html`);
      }
      const wide = width >= 52 * 16;
      const report: string[] = [];
      for (const [i, [action, address, focus]] of steps.entries()) {
        const [verb = "", arg = ""] = action.split(" ");
        let want: Want = focus === undefined ? { address } : { address, focus };
        const before = await tab
          .evaluate(() => ({
            length: history.length,
            href: location.href,
            hidden: document.querySelector("#msg-title")?.closest<HTMLElement>(".cp-detail")
              ?.hidden,
            // Invariant 2's focus: the closed row, or the list's tab stop when it is not drawn.
            closes:
              document.querySelector(`#msg-list a.cp-list-row[href="${location.hash}"]`) === null
                ? '#msg-list a.cp-list-row[tabindex="0"]'
                : `#msg-list a.cp-list-row[href="${location.hash}"]`,
          }))
          .catch(() => undefined);
        switch (verb) {
          case "load":
          case "reload": {
            await (verb === "load" ? tab.goto(`${origin}/${arg}`) : tab.reload());
            const named = KNOWN[new URL(tab.url()).hash.slice(1)] !== undefined;
            // Invariant 3: docked with focus at the page's start, or in the phone's dialog.
            want = { ...want, focus: focus ?? (wide || !named ? "body" : "#msg-title") };
            break;
          }
          case "press":
          case "chip":
          case "svg":
          case "area":
          case "malformed": {
            if (verb === "svg" || verb === "area" || verb === "malformed") {
              // A link to `arg` under the detail's heading: an SVG <a>, an image
              // map's <area>, or an HTML <a> whose address does not parse. That
              // one's default is cancelled after the router's listener, so the
              // row reads the router alone, not the browser's own handling.
              await tab.evaluate(
                ([kind, href]) => {
                  document.getElementById("probe-link")?.closest(".probe")?.remove();
                  const box = document.createElement("p");
                  box.className = "probe";
                  if (kind === "svg") {
                    const ns = "http://www.w3.org/2000/svg";
                    const svg = document.createElementNS(ns, "svg");
                    svg.setAttribute("width", "80");
                    svg.setAttribute("height", "20");
                    const a = document.createElementNS(ns, "a");
                    a.id = "probe-link";
                    a.setAttribute("href", href);
                    const text = document.createElementNS(ns, "text");
                    text.setAttribute("y", "15");
                    text.textContent = "Open";
                    a.append(text);
                    svg.append(a);
                    box.append(svg);
                  } else if (kind === "malformed") {
                    const a = Object.assign(document.createElement("a"), { id: "probe-link" });
                    a.setAttribute("href", href);
                    a.textContent = "Open";
                    box.append(a);
                    addEventListener("click", (e) => e.preventDefault(), { once: true });
                  } else {
                    const img = document.createElement("img");
                    Object.assign(img, { src: "media/graph.svg", alt: "", width: 80, height: 20 });
                    img.useMap = "#probe-map";
                    const map = document.createElement("map");
                    map.name = "probe-map";
                    const area = document.createElement("area");
                    Object.assign(area, { id: "probe-link", shape: "rect", coords: "0,0,80,20" });
                    Object.assign(area, { href, alt: "Open" });
                    map.append(area);
                    box.append(img, map);
                  }
                  document.getElementById("msg-title")?.after(box);
                },
                [verb, arg] as const,
              );
            }
            const selector =
              verb === "press"
                ? `#msg-list a.cp-list-row[href="${arg}"]`
                : verb === "chip"
                  ? `#agent-history a.cp-filter-chip[href="${arg}"]`
                  : "#probe-link";
            if (before?.hidden === false && new URL(before.href).hash === arg) {
              // Invariant 4: a press on what is shown keeps history and both
              // scrolls, and focuses its heading. The page leaves 10px of the
              // heading in view below the sticky bar's scroll padding, with the
              // reader's focus on what they press.
              const y = await tab.evaluate(() => {
                (window as unknown as Helpers).cpScroller().scrollTop = 120;
                const bottom = document.getElementById("msg-title")?.getBoundingClientRect().bottom;
                const pad =
                  Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) ||
                  0;
                scrollTo(0, (bottom ?? 0) + scrollY - pad - 10);
                return scrollY;
              });
              await tab.waitForFunction(
                (at) =>
                  Math.abs((window as unknown as Helpers).cpScroller().scrollTop - 120) <= 1 &&
                  Math.abs(scrollY - at) <= 1,
                y,
              );
              want = { ...want, length: before.length, focus: "#msg-title", top: 120, scrollY: y };
              await tab.evaluate((sel) => {
                document.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true });
              }, selector);
              await tab.keyboard.press("Enter");
              break;
            }
            if (before !== undefined && KNOWN[new URL(before.href).hash.slice(1)] !== undefined) {
              // A press on another entry while one is shown replaces the entry.
              want = { ...want, length: before.length };
            }
            if (verb === "malformed" && before !== undefined) {
              want = { ...want, length: before.length, focus: "#probe-link" };
            }
            await enter(tab, selector);
            break;
          }
          case "unseen":
          case "unseen-chip": {
            const selector =
              verb === "unseen"
                ? `#msg-list a.cp-list-row[href="${arg}"]`
                : `#agent-history a.cp-filter-chip[href="${arg}"]`;
            // The heading lies 200px above the viewport when the reader presses.
            const out = await tab.evaluate(() => {
              const bottom = document.getElementById("msg-title")?.getBoundingClientRect().bottom;
              scrollTo(0, (bottom ?? 0) + scrollY + 200);
              return { y: scrollY };
            });
            await tab.waitForFunction((y) => Math.abs(scrollY - y) <= 1, out.y);
            const most = await tab.evaluate((sel) => {
              document.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true });
              const r = document.getElementById("msg-title")?.getBoundingClientRect();
              // How far the heading lies above the band the sticky bar's scroll padding keeps clear.
              return r === undefined || r.bottom > 0
                ? -1
                : (Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) ||
                    0) - r.top;
            }, selector);
            want = {
              ...want,
              ...(before === undefined ? {} : { length: before.length }),
              focus: "#msg-title",
              reveal: { y: out.y, most },
            };
            await tab.keyboard.press("Enter");
            break;
          }
          case "author":
            await enter(tab, '#msg-feed header > a[href="#agent-codex"]');
            want = { ...want, focus: focus ?? "#agent-codex", inView: "#agent-codex" };
            break;
          case "ctrl-author": {
            // Opens the agent in another tab, so this page navigates nothing.
            const link = '#msg-feed header > a[href="#agent-codex"]';
            await tab.locator(link).first().focus();
            await tab.keyboard.press("ControlOrMeta+Enter");
            want = { ...want, ...(before === undefined ? {} : { length: before.length }) };
            break;
          }
          case "filter":
            await enter(tab, `#msg-filters a[data-show="${arg}"]`);
            break;
          case "focus":
            await tab.locator(`#msg-list a.cp-list-row[href="${arg}"]`).focus();
            break;
          case "resize":
            await tab.setViewportSize({ width: Number(arg), height: 800 });
            break;
          case "older": {
            const rows = () => document.querySelectorAll("#msg-list a.cp-list-row").length;
            const had = await tab.evaluate(rows);
            await tab.locator("[data-msg-older-rows]").click();
            await tab
              .waitForFunction(
                (n) => document.querySelectorAll("#msg-list a.cp-list-row").length > n,
                had,
                {
                  timeout: 5000,
                },
              )
              .catch(() => undefined);
            want = { ...want, ...(before === undefined ? {} : { length: before.length }) };
            break;
          }
          case "close":
          case "escape":
            want = {
              ...want,
              focus: focus ?? before?.closes ?? "body",
              ...(verb === "escape" && focus !== undefined ? { inView: focus } : {}),
            };
            await tab.evaluate(() => {
              (window as unknown as Helpers).cpWatch();
            });
            await (verb === "close"
              ? tab.locator(".cp-detail [data-detail-close]").click()
              : tab.keyboard.press("Escape"));
            break;
          case "back":
            await tab.goBack();
            want = focus === undefined ? want : { ...want, inView: focus };
            break;
          case "forward":
            await tab.goForward();
            break;
        }
        const left = await settle(tab, want);
        if (errors.length > 0) {
          left.push(`page error: ${errors.splice(0).join("; ")}`);
        }
        if ((verb === "load" || verb === "reload") && want.focus === "body") {
          // Invariant 3: a load moves no focus and no scroll, so Tab starts at the page's start.
          const y = await tab.evaluate(() => scrollY);
          if (verb === "load" && y > 1) {
            left.push(`load scrolled the page to ${String(y)}`);
          }
          const tabbed = await tabFromStart(tab);
          if (!tabbed.first || (verb === "load" && tabbed.y > 1)) {
            left.push(`Tab reached ${tabbed.at} at ${String(tabbed.y)}`);
          }
          // The next step starts from the load's focus again.
          await tab.evaluate(() => {
            (document.activeElement as HTMLElement | null)?.blur();
          });
        }
        if (verb === "close" || verb === "escape") {
          // Invariant 2: at most one Back, so no entry on the way shows its row.
          const made = await tab
            .evaluate(() => (window as unknown as Helpers).cpMade ?? [])
            .catch(() => []);
          if (made.length > 0) {
            left.push(`made current on the way: ${made.join(" ")}`);
          }
        }
        if (left.length > 0) {
          report.push(`${String(i + 1)} ${action} → ${address}: ${left.join("; ")}`);
        }
      }
      await tab.close();
      return report;
    };

    const W = 1280;
    const P = 390;
    const AFTER = false;
    const FRESH = true;
    it.each<readonly [string, number, boolean, readonly Step[]]>([
      [
        "two presses, then Close, Back and Forward, and a press",
        W,
        AFTER,
        [
          ["load messages.html", `${M}#c-internal`],
          ["press #c-announce", `${M}#c-announce`],
          ["press #c-kiro-codex", `${M}#c-kiro-codex`],
          ["close", M],
          ["back", `${M}#c-kiro-codex`],
          ["forward", M],
          ["press #c-announce", `${M}#c-announce`],
        ],
      ],
      [
        "Back and Forward through the list between two docked conversations, then Close",
        W,
        AFTER,
        [
          ["load messages.html", `${M}#c-internal`],
          ["close", M],
          ["press #c-marotte", `${M}#c-marotte`],
          ["back", M],
          ["back", `${M}#c-internal`],
          ["forward", M],
          ["forward", `${M}#c-marotte`],
          ["close", M],
          ["back", `${M}#c-internal`],
        ],
      ],
      [
        "the list, a press, a press on another row, Close, Back",
        W,
        AFTER,
        [
          ["load messages.html", `${M}#c-internal`],
          ["close", M],
          ["press #c-marotte", `${M}#c-marotte`],
          ["press #c-announce", `${M}#c-announce`],
          ["close", M],
          ["back", `${M}#c-internal`],
        ],
      ],
      [
        "the list, a press, a press on another row, Back",
        W,
        AFTER,
        [
          ["load messages.html", `${M}#c-internal`],
          ["close", M],
          ["press #c-marotte", `${M}#c-marotte`],
          ["press #c-announce", `${M}#c-announce`],
          ["back", M, '#msg-list a[href="#c-announce"]'],
          ["forward", `${M}#c-announce`],
        ],
      ],
      [
        "Close, a press, Close, then Back out of the page",
        W,
        AFTER,
        [
          ["load messages.html", `${M}#c-internal`],
          ["close", M],
          ["press #c-marotte", `${M}#c-marotte`],
          ["close", M],
          ["back", `${M}#c-internal`],
          ["back", "/index.html"],
        ],
      ],
      [
        "a load on a conversation a later page brings in, Show older, Close",
        W,
        AFTER,
        [
          ["load messages.html#c-ci", `${M}#c-ci`],
          ["older", `${M}#c-ci`],
          ["close", M],
          ["back", `${M}#c-ci`],
          ["back", "/index.html"],
        ],
      ],
      [
        "a load on a conversation a later page brings in, Show older, Close, a press",
        W,
        FRESH,
        [
          ["load messages.html#c-ci", `${M}#c-ci`],
          ["older", `${M}#c-ci`],
          ["close", M],
          ["press #c-marotte", `${M}#c-marotte`],
        ],
      ],
      [
        "a wide load on a conversation, a resize to a phone, Close",
        W,
        AFTER,
        [
          ["load messages.html#c-marotte", `${M}#c-marotte`],
          ["resize 390", `${M}#c-marotte`, "#msg-title"],
          ["close", M],
          ["back", `${M}#c-marotte`],
        ],
      ],
      [
        "Close, a press, focus moved to another row, Back",
        W,
        AFTER,
        [
          ["load messages.html", `${M}#c-internal`],
          ["close", M],
          ["press #c-marotte", `${M}#c-marotte`],
          ["focus #c-announce", `${M}#c-marotte`, '#msg-list a[href="#c-announce"]'],
          ["back", M, '#msg-list a[href="#c-announce"]'],
        ],
      ],
      [
        "a press, an author link, Back, Close",
        W,
        AFTER,
        [
          ["load messages.html", `${M}#c-internal`],
          ["press #c-marotte", `${M}#c-marotte`],
          ["author", `${M}#agent-codex`],
          ["back", `${M}#c-marotte`],
          ["close", M],
          ["back", `${M}#c-marotte`],
        ],
      ],
      [
        "an author link, Back, Close",
        W,
        AFTER,
        [
          ["load messages.html", `${M}#c-internal`],
          ["author", `${M}#agent-codex`],
          ["back", `${M}#c-internal`],
          ["close", M],
          ["back", `${M}#c-internal`],
        ],
      ],
      [
        "a press on the open row and on its chip, then Close",
        W,
        AFTER,
        [
          ["load messages.html#c-internal", `${M}#c-internal`],
          ["press #c-internal", `${M}#c-internal`],
          ["chip #c-internal", `${M}#c-internal`],
          ["close", M, '#agent-history a[href="#c-internal"]'],
          ["back", `${M}#c-internal`],
          ["back", "/index.html"],
        ],
      ],
      [
        "a press on the open row and on its chip with its heading out of view, then Close",
        W,
        AFTER,
        [
          ["load messages.html#c-internal", `${M}#c-internal`],
          ["unseen #c-internal", `${M}#c-internal`],
          ["unseen-chip #c-internal", `${M}#c-internal`],
          ["close", M, '#agent-history a[href="#c-internal"]'],
          ["back", `${M}#c-internal`],
        ],
      ],
      [
        "Close, a press, a filter that leaves its row out, Close",
        W,
        AFTER,
        [
          ["load messages.html", `${M}#c-internal`],
          ["close", M],
          ["press #c-marotte", `${M}#c-marotte`],
          ["filter Direct", `${M}#c-marotte`],
          ["close", M],
          ["back", `${M}#c-internal`],
        ],
      ],
      [
        "a press on the open row, Close, a press",
        W,
        FRESH,
        [
          ["load messages.html#c-ui-data", `${M}#c-ui-data`],
          ["press #c-ui-data", `${M}#c-ui-data`],
          ["close", M],
          ["press #c-marotte", `${M}#c-marotte`],
        ],
      ],
      [
        "a press, the same row again, a chip to another, Close",
        W,
        AFTER,
        [
          ["load messages.html", `${M}#c-internal`],
          ["press #c-marotte", `${M}#c-marotte`],
          ["press #c-marotte", `${M}#c-marotte`],
          ["chip #c-kiro-codex", `${M}#c-kiro-codex`],
          ["close", M, '#agent-history a[href="#c-kiro-codex"]'],
          ["back", `${M}#c-kiro-codex`],
        ],
      ],
      [
        "a reload after a press, then Close",
        W,
        AFTER,
        [
          ["load messages.html", `${M}#c-internal`],
          ["press #c-marotte", `${M}#c-marotte`],
          ["reload", `${M}#c-marotte`],
          ["close", M],
          ["back", `${M}#c-marotte`],
        ],
      ],
      [
        "two presses on a page that loaded on one, Close, Back and Forward, then a press",
        W,
        AFTER,
        [
          ["load messages.html#c-ui-data", `${M}#c-ui-data`],
          ["press #c-marotte", `${M}#c-marotte`],
          ["press #c-announce", `${M}#c-announce`],
          ["close", M],
          ["back", `${M}#c-announce`],
          ["forward", M],
          ["press #c-ui-data", `${M}#c-ui-data`],
        ],
      ],
      [
        "Back out of the page and Forward into it, then Close",
        W,
        AFTER,
        [
          ["load messages.html#c-ui-data", `${M}#c-ui-data`],
          ["press #c-marotte", `${M}#c-marotte`],
          ["back", "/index.html"],
          ["forward", `${M}#c-marotte`],
          ["close", M],
          ["back", `${M}#c-marotte`],
        ],
      ],
      [
        "a load on an address that names no conversation, a press, Close",
        W,
        AFTER,
        [
          ["load messages.html#agent-kiro", `${M}#agent-kiro`],
          ["press #c-marotte", `${M}#c-marotte`],
          ["close", `${M}#agent-kiro`],
          ["back", "/index.html"],
        ],
      ],
      [
        "a phone's load on a conversation, then Close",
        P,
        AFTER,
        [
          ["load messages.html#c-ui-data", `${M}#c-ui-data`],
          ["close", M],
          ["back", `${M}#c-ui-data`],
          ["back", "/index.html"],
        ],
      ],
      [
        "a phone's load on the list, a press, Back, a press, Escape",
        P,
        AFTER,
        [
          ["load messages.html", M],
          ["press #c-marotte", `${M}#c-marotte`],
          ["back", M, '#msg-list a[href="#c-marotte"]'],
          ["press #c-marotte", `${M}#c-marotte`],
          ["escape", M],
          ["back", "/index.html"],
        ],
      ],
      [
        "a phone's load on a conversation a later page brings in, Close, Show older, a press",
        P,
        FRESH,
        [
          ["load messages.html#c-ci", `${M}#c-ci`],
          ["close", M],
          ["older", M],
          ["press #c-ci", `${M}#c-ci`],
          ["close", M],
        ],
      ],
      [
        "a phone's reload after a press, then Close",
        P,
        AFTER,
        [
          ["load messages.html", M],
          ["press #c-marotte", `${M}#c-marotte`],
          ["reload", `${M}#c-marotte`],
          ["close", M],
          ["back", "/index.html"],
        ],
      ],
      [
        "a phone's press, an author link, Back, Close",
        P,
        AFTER,
        [
          ["load messages.html", M],
          ["press #c-marotte", `${M}#c-marotte`],
          ["author", `${M}#agent-codex`],
          ["back", `${M}#c-marotte`],
          ["close", M],
          ["back", "/index.html"],
        ],
      ],
      [
        "a press, Ctrl+Enter on an author link, Back",
        W,
        AFTER,
        [
          ["load messages.html#agent-kiro", `${M}#agent-kiro`],
          ["press #c-marotte", `${M}#c-marotte`],
          ["ctrl-author", `${M}#c-marotte`],
          ["back", `${M}#agent-kiro`, '#msg-list a[href="#c-marotte"]'],
        ],
      ],
      [
        "a phone's press, Ctrl+Enter on an author link, Back",
        P,
        AFTER,
        [
          ["load messages.html", M],
          ["press #c-marotte", `${M}#c-marotte`],
          ["ctrl-author", `${M}#c-marotte`],
          ["back", M, '#msg-list a[href="#c-marotte"]'],
        ],
      ],
      [
        "a phone's press, Ctrl+Enter on an author link, Escape",
        P,
        AFTER,
        [
          ["load messages.html", M],
          ["press #c-marotte", `${M}#c-marotte`],
          ["ctrl-author", `${M}#c-marotte`],
          ["escape", M, '#msg-list a[href="#c-marotte"]'],
        ],
      ],
      [
        "a phone's press on a chip, then Close",
        P,
        AFTER,
        [
          ["load messages.html", M],
          ["chip #c-announce", `${M}#c-announce`],
          ["close", M, '#agent-history a[href="#c-announce"]'],
          ["back", "/index.html"],
        ],
      ],
      [
        "a press on a link whose address does not parse, with a conversation shown",
        W,
        AFTER,
        [
          ["load messages.html#c-internal", `${M}#c-internal`],
          ["malformed http://[::1", `${M}#c-internal`],
          ["close", M],
        ],
      ],
      ...(["svg", "area"] as const).flatMap(
        (kind): (readonly [string, number, boolean, readonly Step[]])[] => [
          [
            `the list, a press, an ${kind} link to another conversation, Close, Back`,
            W,
            AFTER,
            [
              ["load messages.html", `${M}#c-internal`],
              ["close", M],
              ["press #c-marotte", `${M}#c-marotte`],
              [`${kind} #c-leads`, `${M}#c-leads`],
              ["close", M],
              ["back", `${M}#c-internal`],
            ],
          ],
          [
            `a phone's press, an ${kind} link in the sheet to another conversation, Close`,
            P,
            AFTER,
            [
              ["load messages.html", M],
              ["press #c-marotte", `${M}#c-marotte`],
              [`${kind} #c-leads`, `${M}#c-leads`],
              ["close", M],
              ["back", "/index.html"],
            ],
          ],
          [
            `an ${kind} link to the open conversation, then Close`,
            W,
            AFTER,
            [
              ["load messages.html#c-internal", `${M}#c-internal`],
              [`${kind} #c-internal`, `${M}#c-internal`],
              ["close", M],
              ["back", `${M}#c-internal`],
              ["back", "/index.html"],
            ],
          ],
        ],
      ),
    ])(
      "holds after each step of %s",
      async (_, width, fresh, steps) => {
        expect(await run(width, fresh, steps)).toEqual([]);
      },
      120_000,
    );

    it("keeps the app's own keys in each entry's state through a press, Close and Forward", async () => {
      const tab = await (browser as Browser).newPage({ viewport: { width: W, height: 800 } });
      await tab.goto(`${origin}/index.html`);
      await tab.goto(`${origin}${M}`);
      await tab.waitForFunction(() => document.querySelector("[data-build]") !== null);
      const own = (key: string) =>
        tab.evaluate((k) => {
          history.replaceState({ ...(history.state as object), app: k }, "");
        }, key);
      const read = () =>
        tab.evaluate(() => (history.state as Record<string, unknown> | null)?.["app"]);
      // Close on the docked conversation the page loaded with pushes the list's address.
      await tab.locator(".cp-detail [data-detail-close]").click();
      await tab.waitForFunction(() => location.hash === "");
      await own("list");
      await enter(tab, '#msg-list a.cp-list-row[href="#c-marotte"]');
      await tab.waitForFunction(() => location.hash === "#c-marotte" && history.state !== null);
      await own("marotte");
      await tab.locator(".cp-detail [data-detail-close]").click();
      await tab.waitForFunction(() => location.hash === "");
      const listed = await read();
      await tab.goForward();
      await tab.waitForFunction(() => location.hash === "#c-marotte");
      const forward = await read();
      await tab.close();
      expect({ listed, forward }).toEqual({ listed: "list", forward: "marotte" });
    }, 60_000);
  });

  describe("the master and detail's address", () => {
    const N = "/navigation.html";
    /** The address, what the detail shows, the rows marked current, and the focused row's href. */
    const read = (tab: Page) =>
      tab.evaluate(() => {
        const root = document.getElementById("md");
        const title = document.getElementById("md-title");
        const docked = root?.hasAttribute("data-cp-docked") === true;
        const open = document.querySelector<HTMLDialogElement>("#md + dialog")?.open === true;
        const hidden = title?.closest<HTMLElement>(".cp-detail")?.hidden !== false;
        return {
          address: location.pathname + location.hash,
          shows: !hidden && (docked || open) ? (title?.textContent ?? "") : "nothing",
          current: [...(root?.querySelectorAll("a.cp-list-row[aria-current]") ?? [])].map((a) =>
            a.getAttribute("href"),
          ),
          focus: ((el) => el?.getAttribute("href") ?? (el?.id || el?.tagName))(
            document.activeElement,
          ),
          app: (history.state as Record<string, unknown> | null)?.["app"],
        };
      });
    /** Waits for `address`, a detail at rest (docked, in its open sheet, or
     *  back in the box once the sheet's exit has ended) and, when given, focus
     *  as `read` names it, which the sheet's close event can move last. */
    const at = async (tab: Page, address: string, focus?: string) => {
      await tab.waitForFunction(
        ({ a, f }) => {
          const root = document.getElementById("md");
          const dialog = document.querySelector<HTMLDialogElement>("#md + dialog");
          const detail = document.getElementById("md-title")?.closest<HTMLElement>(".cp-detail");
          if (location.pathname + location.hash !== a || !root || !dialog || !detail) {
            return false;
          }
          if (dialog.getAnimations().length > 0 || dialog.hasAttribute("data-cp-leaving")) {
            return false;
          }
          const home = !detail.hidden && !root.hasAttribute("data-cp-docked") ? dialog : root;
          const el = document.activeElement;
          return (
            detail.parentElement === home &&
            (home === root || dialog.open) &&
            (f === undefined || (el?.getAttribute("href") ?? (el?.id || el?.tagName)) === f)
          );
        },
        { a: address, f: focus },
        { timeout: 5000 },
      );
      return read(tab);
    };
    const press = async (tab: Page, href: string) => {
      await tab.locator(`#md a.cp-list-row[href="${href}"]`).focus();
      await tab.keyboard.press("Enter");
    };
    const closeDetail = (tab: Page) => tab.locator("#md-title ~ [data-detail-close]").click();
    const wired = (tab: Page) =>
      tab.waitForFunction(() => document.querySelector("[data-build]") !== null);

    // Each target names this top-level page, so the press navigates it.
    it.each([
      ["no target", null, null],
      ["target=_SELF", "_SELF", null],
      ["target=_top", "_top", null],
      ["target=_Parent", "_Parent", null],
      ["target=the window's name", "md-page", "md-page"],
    ] as const)(
      "replaces the entry on a press on another row while one is open, so Close ends on the list, %s",
      async (_, target, name) => {
        const tab = await (browser as Browser).newPage({ viewport: { width: 1280, height: 800 } });
        await tab.goto(`${origin}/index.html`);
        await tab.goto(`${origin}${N}`);
        await wired(tab);
        if (target !== null) {
          await tab.locator('#md a.cp-list-row[href="#md/mushishi"]').evaluate(
            (a, [t, n]) => {
              a.setAttribute("target", t);
              if (n !== null) {
                window.name = n;
              }
            },
            [target, name] as const,
          );
        }
        await press(tab, "#md/frieren");
        await at(tab, `${N}#md/frieren`);
        const opened = await tab.evaluate(() => history.length);
        await press(tab, "#md/mushishi");
        const second = await at(tab, `${N}#md/mushishi`).catch(() => read(tab));
        const replaced = await tab.evaluate(() => history.length);
        await closeDetail(tab);
        const closed = await at(tab, N).catch(() => read(tab));
        const length = await tab.evaluate(() => history.length);
        await tab.goForward();
        const forward = await at(tab, `${N}#md/mushishi`).catch(() => read(tab));
        await tab.close();
        expect({ second: second.shows, replaced, closed, length, forward: forward.shows }).toEqual({
          second: "Mushishi",
          replaced: opened,
          closed: {
            address: N,
            shows: "nothing",
            current: [],
            focus: "#md/mushishi",
            app: undefined,
          },
          length: opened,
          forward: "Mushishi",
        });
      },
      60_000,
    );

    it("leaves a press on another row to the browser when the page's base opens a new window", async () => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 1280, height: 800 } });
      await tab.goto(`${origin}/index.html`);
      await tab.goto(`${origin}${N}`);
      await wired(tab);
      await press(tab, "#md/frieren");
      await at(tab, `${N}#md/frieren`);
      const opened = await tab.evaluate(() => {
        const base = document.createElement("base");
        base.target = "_blank";
        document.head.append(base);
        return history.length;
      });
      const popup = tab.waitForEvent("popup", { timeout: 5000 }).catch(() => null);
      await press(tab, "#md/mushishi");
      const other = await popup;
      const url = other === null ? null : new URL(other.url());
      await other?.close();
      const stays = await at(tab, `${N}#md/frieren`).catch(() => read(tab));
      const length = await tab.evaluate(() => history.length);
      await tab.close();
      expect({
        popup: url === null ? null : url.pathname + url.hash,
        shows: stays.shows,
        length,
      }).toEqual({
        popup: `${N}#md/mushishi`,
        shows: "Frieren: Beyond Journey's End",
        length: opened,
      });
    }, 60_000);

    /** Opens Frieren from the list at `width`, gives `href` a `download`
     *  attribute (a row, or a link added to the detail when `inDetail`), presses
     *  it, then Close, reading the address, history and scroll after each. */
    const pressDownload = async (width: number, href: string, inDetail = false) => {
      const tab = await (browser as Browser).newPage({ viewport: { width, height: 800 } });
      await tab.goto(`${origin}/index.html`);
      await tab.goto(`${origin}${N}`);
      await wired(tab);
      await press(tab, "#md/frieren");
      await at(tab, `${N}#md/frieren`, "md-title");
      // WebKit scrolls to a focused element on a zero-delay timer
      // (https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/LocalFrameView.cpp,
      // scheduleScrollToFocusedElement), so the heading is in view only after it.
      await tab.waitForFunction(() => {
        const r = document.getElementById("md-title")?.getBoundingClientRect();
        return r !== undefined && r.top >= 0 && r.bottom <= document.documentElement.clientHeight;
      });
      const marks = () =>
        tab.evaluate(() => ({
          length: history.length,
          fromList: (history.state as Record<string, unknown> | null)?.["cp-gallery-from-list"],
          y: Math.round(scrollY),
        }));
      const before = await marks();
      const link = await tab.evaluate(
        ([h, d]) => {
          let a = document.querySelector<HTMLAnchorElement>(`#md a.cp-list-row[href="${h}"]`);
          if (d) {
            a = document.createElement("a");
            a.href = h;
            a.textContent = "Download";
            document.getElementById("md-title")?.after(a);
          }
          a?.setAttribute("download", "");
          a?.focus({ preventScroll: true });
          return a?.closest("dialog") !== null;
        },
        [href, inDetail] as const,
      );
      await tab.keyboard.press("Enter");
      const pressed = await at(tab, `${N}${href}`, "md-title").catch(() => read(tab));
      const afterPress = await marks();
      await closeDetail(tab);
      const closed = await at(tab, N, href).catch(() => read(tab));
      const afterClose = await marks();
      await tab.close();
      return { link, before, pressed, afterPress, closed, afterClose };
    };

    it.each([
      ["another row at 1280 wide", 1280, "#md/mushishi", false, "Mushishi"],
      ["the open row at 1280 wide", 1280, "#md/frieren", false, "Frieren: Beyond Journey's End"],
      [
        "a link in the sheet at 390 wide",
        390,
        "#md/frieren",
        true,
        "Frieren: Beyond Journey's End",
      ],
    ] as const)(
      "routes a press on a download link to an entry like any press, so Close is one Back, %s",
      async (_, width, href, inDetail, shows) => {
        const r = await pressDownload(width, href, inDetail);
        // A press on the open entry also keeps the page's scroll.
        const same = href === "#md/frieren";
        expect({
          inSheet: r.link,
          pressed: [r.pressed.address, r.pressed.shows, r.pressed.focus],
          afterPress: same ? r.afterPress : { ...r.afterPress, y: r.before.y },
          closed: [r.closed.address, r.closed.shows, r.closed.focus],
          afterClose: r.afterClose.length,
        }).toEqual({
          inSheet: inDetail,
          pressed: [`${N}${href}`, shows, "md-title"],
          afterPress: r.before,
          closed: [N, "nothing", href],
          afterClose: r.before.length,
        });
      },
      60_000,
    );

    it("ends on the list on Back after a press on another row while one is open", async () => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 1280, height: 800 } });
      await tab.goto(`${origin}/index.html`);
      await tab.goto(`${origin}${N}`);
      await wired(tab);
      await press(tab, "#md/frieren");
      await at(tab, `${N}#md/frieren`);
      await press(tab, "#md/mushishi");
      await at(tab, `${N}#md/mushishi`);
      await tab.goBack();
      const back = await at(tab, N).catch(() => read(tab));
      await tab.close();
      expect(back).toEqual({
        address: N,
        shows: "nothing",
        current: [],
        focus: "#md/mushishi",
        app: undefined,
      });
    }, 60_000);

    it("closes onto the list after a deep link and a press on another row, and Back reopens the last", async () => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 1280, height: 800 } });
      await tab.goto(`${origin}/index.html`);
      await tab.goto(`${origin}${N}#md/frieren`);
      await wired(tab);
      await press(tab, "#md/mushishi");
      await at(tab, `${N}#md/mushishi`);
      await closeDetail(tab);
      const closed = await at(tab, `${N}#detail`).catch(() => read(tab));
      await tab.goBack();
      const back = await at(tab, `${N}#md/mushishi`).catch(() => read(tab));
      await tab.goBack();
      const left = await at(tab, "/index.html").catch(() => read(tab));
      await tab.close();
      expect({
        closed: [closed.address, closed.shows],
        back: back.shows,
        left: left.address,
      }).toEqual({
        closed: [`${N}#detail`, "nothing"],
        back: "Mushishi",
        left: "/index.html",
      });
    }, 60_000);

    it("closes a loaded entry onto the list, focusing its row, and keeps the app's key on it", async () => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 1280, height: 800 } });
      await tab.goto(`${origin}/index.html`);
      await tab.goto(`${origin}${N}#md/mushishi`);
      await wired(tab);
      await tab.evaluate(() => {
        history.replaceState({ ...(history.state as object), app: "loaded" }, "");
      });
      const loaded = await read(tab);
      const loadY = await tab.evaluate(() => scrollY);
      const tabbed = await tabFromStart(tab);
      await closeDetail(tab);
      const closed = await at(tab, `${N}#detail`).catch(() => read(tab));
      await tab.goBack();
      const back = await at(tab, `${N}#md/mushishi`).catch(() => read(tab));
      await tab.goBack();
      const left = await at(tab, "/index.html").catch(() => read(tab));
      await tab.goForward();
      const forward = await at(tab, `${N}#md/mushishi`).catch(() => read(tab));
      await tab.close();
      expect({
        loaded: [loaded.focus, loadY],
        tabbed: [tabbed.first, tabbed.y],
        closed: [closed.address, closed.shows, closed.focus],
        back: [back.address, back.shows, back.app],
        left: left.address,
        forward: [forward.address, forward.shows, forward.app],
      }).toEqual({
        loaded: ["BODY", 0],
        tabbed: [true, 0],
        closed: [`${N}#detail`, "nothing", "#md/mushishi"],
        back: [`${N}#md/mushishi`, "Mushishi", "loaded"],
        left: "/index.html",
        forward: [`${N}#md/mushishi`, "Mushishi", "loaded"],
      });
    }, 60_000);

    it("closes onto the list from a phone's load, focusing the row, and Back reopens it", async () => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 390, height: 800 } });
      await tab.goto(`${origin}/index.html`);
      await tab.goto(`${origin}${N}#md/mushishi`);
      await wired(tab);
      const loaded = await at(tab, `${N}#md/mushishi`, "md-title").catch(() => read(tab));
      await closeDetail(tab);
      const closed = await at(tab, `${N}#detail`, "#md/mushishi").catch(() => read(tab));
      await tab.goBack();
      const back = await at(tab, `${N}#md/mushishi`, "md-title").catch(() => read(tab));
      await tab.goBack();
      const left = await at(tab, "/index.html").catch(() => read(tab));
      await tab.close();
      expect({
        loaded: [loaded.shows, loaded.focus],
        closed: [closed.shows, closed.focus],
        back: [back.shows, back.focus],
        left: left.address,
      }).toEqual({
        loaded: ["Mushishi", "md-title"],
        closed: ["nothing", "#md/mushishi"],
        back: ["Mushishi", "md-title"],
        left: "/index.html",
      });
    }, 60_000);

    it("closes onto the list after a wide load moves into the phone's sheet, focusing the row", async () => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 1280, height: 800 } });
      await tab.goto(`${origin}/index.html`);
      await tab.goto(`${origin}${N}#md/mushishi`);
      await wired(tab);
      await tab.setViewportSize({ width: 390, height: 800 });
      await tab.waitForFunction(
        () => document.querySelector<HTMLDialogElement>("#md + dialog")?.open === true,
      );
      const moved = await at(tab, `${N}#md/mushishi`, "md-title").catch(() => read(tab));
      await closeDetail(tab);
      const closed = await at(tab, `${N}#detail`, "#md/mushishi").catch(() => read(tab));
      await tab.goBack();
      const back = await at(tab, `${N}#md/mushishi`).catch(() => read(tab));
      await tab.close();
      expect({
        moved: [moved.shows, moved.focus],
        closed: [closed.shows, closed.focus],
        back: back.shows,
      }).toEqual({
        moved: ["Mushishi", "md-title"],
        closed: ["nothing", "#md/mushishi"],
        back: "Mushishi",
      });
    }, 60_000);

    it("ends on the page index's link target, its top in view, when the detail closes", async () => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 1280, height: 800 } });
      await tab.goto(`${origin}/index.html`);
      await tab.goto(`${origin}${N}`);
      await wired(tab);
      await press(tab, "#md/mushishi");
      await at(tab, `${N}#md/mushishi`);
      await tab.locator('nav.g-index a[href="#tabs"]').focus();
      await tab.keyboard.press("Enter");
      const after = await at(tab, `${N}#tabs`, "tabs").catch(() => read(tab));
      const top = await tab.evaluate(() => {
        const r = document.getElementById("tabs")?.getBoundingClientRect();
        return r !== undefined && r.top >= 0 && r.top < innerHeight;
      });
      await tab.close();
      expect({ shows: after.shows, focus: after.focus, top }).toEqual({
        shows: "nothing",
        focus: "tabs",
        top: true,
      });
    }, 60_000);

    /** Loads Mushishi docked, scrolls the page so the heading's bottom sits
     *  `bottom` px below the band the sticky bar's scroll padding keeps clear,
     *  and presses its open row there. */
    const pressShown = async (bottom: number, target?: string) => {
      const tab = await (browser as Browser).newPage({ viewport: { width: 1280, height: 800 } });
      await tab.goto(`${origin}/index.html`);
      await tab.goto(`${origin}${N}#md/mushishi`);
      await wired(tab);
      await at(tab, `${N}#md/mushishi`);
      if (target !== undefined) {
        await tab.locator('#md a.cp-list-row[href="#md/mushishi"]').evaluate((a, t) => {
          a.setAttribute("target", t);
        }, target);
      }
      const before = await tab.evaluate((b) => {
        const r = document.getElementById("md-title")?.getBoundingClientRect();
        scrollTo(
          0,
          (r?.bottom ?? 0) +
            scrollY -
            (Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0) -
            b,
        );
        return { length: history.length, y: scrollY };
      }, bottom);
      await tab.waitForFunction((y) => Math.abs(scrollY - y) <= 1, before.y);
      const out = await tab.evaluate(() => {
        document
          .querySelector<HTMLElement>('#md a.cp-list-row[href="#md/mushishi"]')
          ?.focus({ preventScroll: true });
        const pad =
          Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        return pad - (document.getElementById("md-title")?.getBoundingClientRect().top ?? 0);
      });
      await tab.keyboard.press("Enter");
      await tab.waitForFunction(() => document.activeElement?.id === "md-title");
      const after = await tab.evaluate(() => {
        const r = document.getElementById("md-title")?.getBoundingClientRect();
        const vh = document.documentElement.clientHeight;
        return {
          length: history.length,
          y: scrollY,
          seen:
            r !== undefined &&
            r.top >=
              (Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) ||
                0) -
                1 &&
            r.bottom <= vh + 1,
        };
      });
      const state = await read(tab);
      await tab.close();
      return { before, out, after, address: state.address, shows: state.shows };
    };

    it.each([
      ["no target", undefined],
      ["target=_self", "_self"],
    ] as const)(
      "keeps history and the page's scroll on a press on the open row, focusing its heading, %s",
      async (_, target) => {
        // 10px of the heading stays in view.
        const { before, after, address, shows } = await pressShown(10, target);
        expect({ length: after.length, y: after.y, address, shows }).toEqual({
          ...before,
          address: `${N}#md/mushishi`,
          shows: "Mushishi",
        });
      },
      60_000,
    );

    it("brings the heading into view on a press on the open row when none of it is in view", async () => {
      const { before, out, after, address, shows } = await pressShown(-200);
      expect({
        length: after.length,
        seen: after.seen,
        within: out > 0 && Math.abs(after.y - before.y) <= out + 1,
        address,
        shows,
      }).toEqual({
        length: before.length,
        seen: true,
        within: true,
        address: `${N}#md/mushishi`,
        shows: "Mushishi",
      });
    }, 60_000);
  });

  // docs/design-colour.md "Contrast": secondary text 4.5:1, and 7:1 with more contrast.
  it("draws the layouts page's frame notes at 4.5:1, 7:1 with more contrast", async () => {
    const low: string[] = [];
    let seen = 0;
    for (const contrast of ["no-preference", "more"] as const) {
      for (const theme of ["light", "dark"]) {
        for (const width of [1440, 390]) {
          const tab = await (browser as Browser).newPage({
            viewport: { width, height: 900 },
            contrast,
          });
          await tab.goto(`${origin}/layouts.html`);
          await tab.evaluate(async (t) => {
            document.documentElement.dataset["theme"] = t;
            await new Promise(requestAnimationFrame);
            await Promise.all(
              document
                .getAnimations()
                .filter((a) => a instanceof CSSTransition)
                .map((a) => a.finished.catch(() => undefined)),
            );
          }, theme);
          const ratios = await tab.evaluate(() => {
            const ctx = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true });
            if (ctx === null) {
              throw new Error("no 2d context");
            }
            const lum = (): number => {
              const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
              const lin = (v: number) =>
                v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4;
              return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
            };
            const paint = (colour: string): void => {
              ctx.fillStyle = colour;
              ctx.fillRect(0, 0, 1, 1);
            };
            return [...document.querySelectorAll<HTMLElement>(".f-box > small")]
              .filter((s) => s.checkVisibility())
              .map((small) => {
                const chain: Element[] = [];
                for (let e = small.parentElement; e; e = e.parentElement) {
                  chain.unshift(e);
                }
                paint("#fff");
                for (const e of chain) {
                  paint(getComputedStyle(e).backgroundColor);
                }
                const bg = lum();
                paint(getComputedStyle(small).color);
                const [hi, lo] = [bg, lum()].sort((x, y) => y - x) as [number, number];
                return { text: small.textContent, ratio: (hi + 0.05) / (lo + 0.05) };
              });
          });
          await tab.close();
          seen += ratios.length;
          const floor = contrast === "more" ? 7 : 4.5;
          for (const { text, ratio } of ratios) {
            if (ratio < floor) {
              low.push(
                `${contrast} ${theme} ${String(width)}: ${String(text)} ${ratio.toFixed(2)}`,
              );
            }
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(low).toEqual([]);
  }, 60_000);

  // WAI-ARIA 1.2 prohibits aria-label on a label, which has no role, so only the label's own text
  // names its radio in every engine.
  it("names the settings page's accent swatches by their labels' own words", async () => {
    const tab = await (browser as Browser).newPage();
    await tab.goto(`${origin}/settings.html`);
    const swatches = await tab.evaluate(() =>
      [...document.querySelectorAll<HTMLInputElement>("input[name='g-accent']")].map((radio) => ({
        words: radio.labels?.[0]?.textContent.trim(),
        labelNamed: radio.labels?.[0]?.hasAttribute("aria-label"),
      })),
    );
    await tab.close();
    expect(swatches).toEqual(
      ["Blue", "Green", "Terracotta", "Violet", "Pink", "Teal"].map((words) => ({
        words,
        labelNamed: false,
      })),
    );
  }, 60_000);

  // An empty `required` field matches :invalid at rest, and Firefox and WebKit
  // then expose it as an invalid entry before anything was typed (WCAG 2.2
  // 3.3.1), so the composer marks its fields aria-required and checks on send.
  it("reads no field of the messages composer as invalid before anything is typed", async () => {
    const tab = await (browser as Browser).newPage();
    await tab.goto(`${origin}/messages.html`);
    const fields = await tab.evaluate(() =>
      [...document.querySelectorAll<HTMLInputElement>("#msg-compose .cp-input")].map((field) => ({
        name: field.name,
        invalid: field.matches(":invalid") || field.getAttribute("aria-invalid") === "true",
        required: field.getAttribute("aria-required"),
        help: [...(field.closest(".cp-field")?.querySelectorAll(".cp-help") ?? [])].map((help) =>
          help.textContent.trim(),
        ),
      })),
    );
    await tab.close();
    expect(fields).toEqual(
      ["subject", "body"].map((name) => ({
        name,
        invalid: false,
        required: "true",
        help: ["Required."],
      })),
    );
  }, 60_000);

  it("finds each required field that shows no Required mark", async () => {
    const tab = await (browser as Browser).newPage();
    await tab.setContent(`<!doctype html>
      <div class="cp-field"><label for="a">A</label><input id="a" aria-required="true"><span class="cp-help">Required.</span></div>
      <div class="cp-field"><label for="b">B <span class="cp-required">(Required)</span></label><input id="b" aria-required="true"><span class="cp-help">From the provider.</span></div>
      <div class="cp-field"><label for="c">C</label><input id="c" aria-required="true"><span class="cp-help">From the provider.</span></div>
      <div class="cp-field"><label for="d">D</label><input id="d" aria-required="true"><span class="cp-help" hidden>Required.</span></div>
      <div class="cp-field"><label for="e">E</label><input id="e" aria-required="true"><span class="cp-help" style="position:absolute;width:1px;height:1px;overflow:hidden">Required.</span></div>
      <label for="f">F</label><input id="f" aria-required="true">
      <div class="cp-field" hidden><label for="g">G</label><input id="g" aria-required="true"><span class="cp-help">Required.</span></div>
      <div class="cp-field"><label for="h">H</label><input id="h" aria-required="false"></div>
      <div class="cp-field"><label for="i">I <span class="cp-required cp-visually-hidden">(Required)</span></label><input id="i" aria-required="true"><span class="cp-help">From the provider.</span></div>
      <div class="cp-field"><label for="j">J</label><input id="j" aria-required="true"><span class="cp-help" style="visibility:hidden">Required.</span></div>
      <div class="cp-field"><label for="k">K</label><input id="k" aria-required="true"><span class="cp-help" style="opacity:0">Required.</span></div>
      <div class="cp-field"><label for="l">L</label><input id="l" aria-required="true"><span class="cp-help" style="position:absolute;left:-9999px">Required.</span></div>
      <div class="cp-field"><label for="n">N</label><input id="n" aria-required="true"><span class="cp-help">Not Required.</span></div>
      <div class="cp-field"><label class="cp-label" for="p">P <span>(Required)</span></label><input id="p" aria-required="true"></div>
      <div class="cp-field"><label for="q">Q</label><input id="q" aria-required="true"><span class="cp-help" style="display:block;content-visibility:hidden">Required.</span></div>
      <div class="cp-field"><label for="r">R <span class="cp-required" style="opacity:0">(Required)</span></label><input id="r" aria-required="true"></div>
      <div class="cp-field"><label for="s">S <span class="cp-required">(Optional)</span></label><input id="s" aria-required="true"></div>
      <div style="overflow:auto;block-size:3em"><div style="block-size:10em"></div><div class="cp-field"><label for="t">T</label><input id="t" aria-required="true"><span class="cp-help">Required.</span></div></div>
      <div style="overflow:hidden"><div class="cp-field"><label for="u">U</label><input id="u" aria-required="true"><span class="cp-help">Required.</span></div></div>
      <div class="cp-field"><label for="v">V</label><input id="v" aria-required="true"><span class="cp-help" style="display:block;contain:paint;height:0">Required.</span></div>
      <div class="cp-field"><label class="cp-label" for="w">W (Required)</label><input id="w" aria-required="true"></div>
      <div class="cp-field"><label for="x">X</label><input id="x" aria-required="true"><span class="cp-help">Required<span>.</span></span></div>
      <div class="cp-field"><label for="y">Y <span class="cp-visually-hidden"><span class="cp-required">(Required)</span></span></label><input id="y" aria-required="true"></div>
      <div class="cp-field"><label for="z" style="display:block;width:9ch;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Name <span class="cp-required">(Required)</span></label><input id="z" aria-required="true"></div>
      <dialog><div class="cp-field"><label for="dialog">Dialog</label><input id="dialog" aria-required="true"><span class="cp-help" style="opacity:0">Required.</span></div></dialog>
      <details><summary>More</summary><div class="cp-field"><label for="details">Details</label><input id="details" aria-required="true"><span class="cp-help" style="opacity:0">Required.</span></div></details>
      <div hidden><div class="cp-field"><label for="hidden">Hidden <span class="cp-visually-hidden"><span class="cp-required">(Required)</span></span></label><input id="hidden" aria-required="true"><span class="cp-help">From the provider.</span></div></div>
      <dialog><div class="cp-field"><label for="in-dialog">In a dialog</label><input id="in-dialog" aria-required="true"><span class="cp-help">Required.</span></div></dialog>
      <details><summary>More</summary><div class="cp-field"><label for="in-details">In details</label><input id="in-details" aria-required="true"><span class="cp-help">Required.</span></div></details>
      <details name="g"><summary>One</summary><div class="cp-field"><label for="in-one">One</label><input id="in-one" aria-required="true"><span class="cp-help">Required.</span></div></details>
      <details name="g"><summary>Two</summary><div class="cp-field"><label for="in-two">Two</label><input id="in-two" aria-required="true"><span class="cp-help">Required.</span></div></details>
      <dialog><details><summary>More</summary><div class="cp-field"><label for="in-both">In both</label><input id="in-both" aria-required="true"><span class="cp-help">Required.</span></div></details></dialog>
      <div popover><div class="cp-field"><label for="in-popover">In a popover</label><input id="in-popover" aria-required="true"><span class="cp-help">Required.</span></div></div>
      <div popover><div class="cp-field"><label for="popover">Popover</label><input id="popover" aria-required="true"><span class="cp-help" style="opacity:0">Required.</span></div></div>`);
    const missing = await tab.evaluate(requiredWithoutMark);
    await tab.close();
    expect(missing).toEqual([..."cdefijklnpqrsvwyz", "dialog", "details", "hidden", "popover"]);
  }, 60_000);

  it.each([...pageNames, ...templateNames])(
    "shows Required on every required field of %s",
    async (page) => {
      const tab = await (browser as Browser).newPage();
      await tab.goto(`${origin}/${page}.html`);
      const missing = await tab.evaluate(requiredWithoutMark);
      await tab.close();
      expect(missing).toEqual([]);
    },
    60_000,
  );

  it.each(SYSTEM_SCREENS)(
    "shows Required on every required field of the reference screen %s",
    async (file) => {
      const tab = await (browser as Browser).newPage();
      await tab.goto(pathToFileURL(join(SYSTEM_DIR, file)).href);
      const missing = await tab.evaluate(requiredWithoutMark);
      await tab.close();
      expect(missing).toEqual([]);
    },
    60_000,
  );

  it("shows a template's destination as a route change, focus on its h1", async () => {
    const tab = await (browser as Browser).newPage({ viewport: { width: 1440, height: 900 } });
    await tab.goto(`${origin}/templates/app.html`);
    const item = tab.locator(".cp-header .cp-nav-item:not([aria-current])").first();
    const label = await item.locator(".cp-nav-label").textContent();
    await item.click();
    const state = await tab.evaluate(() => ({
      heading: document.querySelector("main h1")?.textContent,
      current: document.querySelector(".cp-nav-item[aria-current='page'] .cp-nav-label")
        ?.textContent,
      focused: document.activeElement === document.querySelector("main h1"),
    }));
    await tab.close();
    expect(state).toEqual({ heading: label, current: label, focused: true });
  }, 60_000);

  it.each(pageNames)(
    "runs %s's script to its end inside a sandboxed frame, as a preview tab shows it",
    async (page) => {
      const tab = await (browser as Browser).newPage();
      const errors: string[] = [];
      tab.on("pageerror", (e) => errors.push(e.message));
      await tab.goto(`${origin}/framed/${page}`);
      const frame = tab.frames()[1];
      // The marks run last, so a page they reach ran every wiring before them.
      // The module runs to its end before the frame loads, which delays the
      // tab's load that goto waits for: a later look could find nothing more.
      const marked = await frame?.evaluate(() => document.querySelector("[data-build]") !== null);
      await tab.close();
      expect({ errors, marked }).toEqual({ errors: [], marked: true });
    },
    60_000,
  );
});
