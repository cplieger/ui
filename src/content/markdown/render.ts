/**
 * render.ts — the DOM sink: parser operations as the design language's
 * prose, every `href` and `src` through the gate, and the hooks an app adds
 * its own features through. It builds with elements and text nodes only, and
 * judges every operation itself, so the safety contract holds for any source
 * of operations, a worker's included.
 * @module
 */

import { enhanceCopy } from "../../forms/copy/copy.js";
import { detectLanguage } from "../highlight/detect.js";
import { highlightInto } from "../highlight/dom.js";
import { languageName, resolveLanguage } from "../highlight/languages.js";
import { fragmentOnly, gate, payloadShaped, withheld, written } from "./gate.js";
import type { Gated } from "./gate.js";
import { createParser } from "./parser.js";
import type { AttrName, Kind, Sink } from "./parser.js";

export interface LinkNode {
  /** The gated URL; `null` when the gate or `urls` refused the destination. */
  readonly url: URL | null;
  /** The destination as written, its character references decoded once. */
  readonly raw: string;
  readonly title: string;
  /** The link renders without `href` because `withhold` matched it. */
  readonly withheld: boolean;
}

export interface ImageNode {
  readonly url: URL | null;
  readonly raw: string;
  readonly alt: string;
  readonly title: string;
}

export interface CodeNode {
  /** The fence's tag as written, "" when it had none. */
  readonly lang: string;
  readonly text: string;
  /** False for a fence the text never closed. */
  readonly closed: boolean;
}

export interface MathNode {
  readonly tex: string;
  readonly display: boolean;
}

/**
 * Each hook runs with its element attached to its parent, and returns
 * nothing to keep it or a node that takes its place, inserted as given.
 * Inner hooks run before `block`, which runs once for each completed
 * top-level block with what that block's own hook left.
 */
export interface Hooks {
  link?(n: LinkNode, el: HTMLAnchorElement): Node | undefined;
  /** `el` is the image's link form, or in `"load"` mode an `img` with no
   *  `src` yet, which it gets only if what the hook leaves holds it: kept
   *  in place, returned, or wrapped. */
  image?(n: ImageNode, el: Element): Node | undefined;
  /** `el` is the `.cp-code` block, coloured already. */
  code?(n: CodeNode, el: HTMLElement): Node | undefined;
  math?(n: MathNode, el: HTMLElement): Node | undefined;
  block?(el: HTMLElement): Node | undefined;
}

export interface RenderOptions {
  /** What a relative destination resolves against; without it one is refused. */
  readonly base?: string | URL;
  /** Runs after the gate for every `href` and `src`; it can only refuse. */
  readonly urls?: (url: URL, raw: string, kind: "href" | "src") => boolean;
  /** Which cross-origin links render without `href`. Default `payloadShaped`. */
  readonly withhold?: false | ((url: URL) => boolean);
  /** `"link"` (default) renders an image as a link to its source; `"load"` as an `img`. */
  readonly images?: "link" | "load";
  readonly hooks?: Hooks;
  /** The input read, in UTF-8 bytes; default 1 MiB. Past it the text is cut
   *  at a code point and a line says so. */
  readonly maxBytes?: number;
  /** Aborting it stops the render and lets go of its overflow observers. */
  readonly signal?: AbortSignal;
  /** `false` leaves code blocks uncoloured. */
  readonly highlight?: false;
  /** The element `#` renders as; deeper headings shift with it and stop at `h6`. */
  readonly headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
}

/** What a stream adds to the sink; `StreamOptions` owns their contract. */
export interface SinkExtras {
  text?(parent: Element, node: Text): Node | undefined;
  moved?(el: Element): void;
}

/** A sink that renders into its host; `end` closes what is still open. */
export type DomSink = Sink & { end(): void };

const MIB = 1 << 20;
const LANG = /^[A-Za-z0-9_+.#-]{1,32}$/;
const START = /^\d{1,9}$/;
const ALIGNS = new Set(["start", "center", "end"]);
const XHTML = "http://www.w3.org/1999/xhtml";
const REL = "noopener noreferrer nofollow";

const TAGS: ReadonlyMap<string, string> = new Map([
  ["paragraph", "p"],
  ["blockquote", "blockquote"],
  ["list-unordered", "ul"],
  ["list-ordered", "ol"],
  ["list-item", "li"],
  ["emphasis", "em"],
  ["strong", "strong"],
  ["strike", "del"],
  ["code-inline", "code"],
  ["break", "br"],
  ["rule", "hr"],
  ["link", "a"],
]);

const HEADING = /^heading-([1-6])$/;

interface Frame {
  /** The kind it opened as; `null` for the root and for a kind outside the vocabulary. */
  readonly kind: Kind | null;
  /** Where its children and text go. */
  readonly into: Element;
  /** What stands for it in its parent; `null` while an image waits for its close. */
  readonly node: Element | null;
  readonly top: boolean;
  /** A cut table cell or a token inside one: it builds nothing and runs no hook. */
  readonly dropped: boolean;
  readonly attrs: Map<string, string>;
  /** An image's alt text, a table's column alignments, a row's next column. */
  alt: string;
  align: readonly string[];
  column: number;
}

function isHTMLElement(node: Node): node is HTMLElement {
  return node.nodeType === 1 && (node as Element).namespaceURI === XHTML;
}

/**
 * Runs a hook on `el` and puts what it returns where `el` stood when it
 * ran, which `el` itself may no longer mark: a wrapping hook has moved it
 * into the wrapper. Returns what stands there now.
 */
function place(el: ChildNode, hook: () => Node | undefined): Node {
  const parent = el.parentNode;
  const next = el.nextSibling;
  const result = hook();
  if (result === undefined || result === el || parent === null) {
    return el;
  }
  if (el.parentNode === parent) {
    el.replaceWith(result);
  } else {
    parent.insertBefore(result, next?.parentNode === parent ? next : null);
  }
  return result;
}

/** Sets an `ol`'s `data-cp-digits` to its widest number's digit count,
 *  which `.cp-prose` widens the marker gutter by. Runs as items arrive, so a
 *  streamed list widens when it reaches 10 or 100. */
function fitMarkers(ol: Element): void {
  const start = Number(ol.getAttribute("start") ?? "1");
  const digits = String(start + Math.max(ol.children.length - 1, 0)).length;
  if (digits > 1) {
    ol.setAttribute("data-cp-digits", String(digits));
  }
}

function checkLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > 6) {
    throw new RangeError(`headingLevel must be 1 to 6, not ${String(level)}`);
  }
  return level;
}

/** The sink behind `createDomSink`, with a stream's extras. */
export function domSink(
  host: Element,
  options: RenderOptions = {},
  extras: SinkExtras = {},
): DomSink {
  const doc = host.ownerDocument;
  const hooks = options.hooks ?? {};
  const base = options.base === undefined ? null : new URL(options.base);
  const withhold = options.withhold ?? payloadShaped;
  const loadImages = options.images === "load";
  const shift = checkLevel(options.headingLevel ?? 1) - 1;
  const signal = options.signal;
  const root: Frame = {
    kind: null,
    into: host,
    node: host,
    top: false,
    dropped: false,
    attrs: new Map(),
    alt: "",
    align: [],
    column: 0,
  };
  const stack: Frame[] = [root];
  let done = signal?.aborted === true;

  const scrollers = new WeakMap<Element, Element>();
  let observer: ResizeObserver | null = null;
  signal?.addEventListener(
    "abort",
    () => {
      done = true;
      observer?.disconnect();
      observer = null;
    },
    { once: true },
  );

  function el<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] {
    return doc.createElement(tag);
  }

  /** A `pre` or a table region takes a tab stop only while it overflows,
   *  since Safari makes no scroller focusable on its own. */
  function syncOverflow(scroller: Element): void {
    const over = scroller.scrollWidth > scroller.clientWidth;
    if (scroller.tagName === "PRE") {
      if (over) {
        scroller.setAttribute("tabindex", "0");
      } else {
        scroller.removeAttribute("tabindex");
      }
      return;
    }
    // A table that fits is no landmark, so the three go on and off together.
    if (over) {
      scroller.setAttribute("role", "region");
      scroller.setAttribute("aria-label", "Table");
      scroller.setAttribute("tabindex", "0");
    } else {
      scroller.removeAttribute("role");
      scroller.removeAttribute("aria-label");
      scroller.removeAttribute("tabindex");
    }
  }

  /** Watches `targets` for the size changes that move `scroller`'s overflow:
   *  the scroller's own box, and its content growing a line or a row at a
   *  time. The observer reads after layout, so a render forces none. */
  function watch(scroller: Element, ...targets: Element[]): void {
    const RO = (doc.defaultView as { readonly ResizeObserver?: typeof ResizeObserver } | null)
      ?.ResizeObserver;
    if (done || RO === undefined) {
      return;
    }
    observer ??= new RO((entries) => {
      for (const entry of entries) {
        const s = scrollers.get(entry.target);
        if (s !== undefined) {
          syncOverflow(s);
        }
      }
    });
    for (const target of [scroller, ...targets]) {
      scrollers.set(target, scroller);
      observer.observe(target);
    }
  }

  function push(kind: Kind | null, into: Element, node: Element | null, dropped = false): Frame {
    const frame: Frame = {
      kind,
      into,
      node,
      top: stack.length === 1,
      dropped,
      attrs: new Map(),
      alt: "",
      align: [],
      column: 0,
    };
    stack.push(frame);
    return frame;
  }

  function current(): Frame {
    return stack[stack.length - 1] ?? root;
  }

  function openCode(parent: Frame): void {
    const block = el("div");
    block.className = "cp-code";
    block.setAttribute("data-variant", "block");
    const bar = el("div");
    bar.setAttribute("data-part", "bar");
    const label = el("span");
    label.setAttribute("data-part", "lang");
    const actions = el("div");
    actions.setAttribute("data-part", "actions");
    const copy = el("button");
    copy.className = "cp-button cp-copy";
    copy.type = "button";
    copy.setAttribute("data-variant", "quiet");
    copy.setAttribute("data-size", "sm");
    const glyph = el("span");
    glyph.className = "cp-icon";
    glyph.setAttribute("aria-hidden", "true");
    const check = el("span");
    check.className = "cp-icon";
    check.setAttribute("data-part", "done");
    check.setAttribute("aria-hidden", "true");
    copy.append(glyph, check, "Copy");
    actions.append(copy);
    bar.append(label, actions);
    const pre = el("pre");
    const code = el("code");
    pre.append(code);
    // Inside the block, so a hook that replaces the block takes the hint too.
    const hint = el("span");
    hint.className = "cp-help";
    hint.hidden = true;
    block.append(bar, pre, hint);
    enhanceCopy(copy, { source: code, hint });
    parent.into.append(block);
    push("code", code, block);
    // The code is max-content wide, so a widening line resizes it when the pre's box stays put.
    watch(pre, code);
  }

  function openTable(parent: Frame): void {
    const region = el("div");
    region.className = "cp-table-scroll";
    const table = el("table");
    region.append(table);
    parent.into.append(region);
    push("table", table, region);
    watch(region, table);
  }

  function openRow(parent: Frame): void {
    if (parent.kind !== "table") {
      push(null, parent.into, null);
      return;
    }
    const table = parent.into as HTMLTableElement;
    const section =
      table.tHead === null
        ? table.appendChild(el("thead"))
        : (table.tBodies[0] ?? table.appendChild(el("tbody")));
    const tr = el("tr");
    section.append(tr);
    push("table-row", tr, tr);
  }

  /** The header row's cell count, which every body row keeps (GFM 4.10);
   *  `null` for the header row itself. */
  function columns(row: Element): number | null {
    const head = row.closest("table")?.querySelector("thead > tr") ?? null;
    return head === null || head === row ? null : head.children.length;
  }

  function appendCell(row: Frame, table: Frame): HTMLTableCellElement {
    const cell = el(row.into.parentElement?.tagName === "THEAD" ? "th" : "td");
    const align = table.align[row.column] ?? "";
    row.column += 1;
    if (ALIGNS.has(align)) {
      cell.setAttribute("data-align", align);
    }
    row.into.append(cell);
    return cell;
  }

  function openCell(parent: Frame): void {
    const table = stack[stack.length - 2];
    if (parent.kind !== "table-row" || table === undefined) {
      push(null, parent.into, null);
      return;
    }
    const count = columns(parent.into);
    if (count !== null && parent.column >= count) {
      // A cell past the header's count is dropped, its content with it.
      push(null, parent.into, null, true);
      return;
    }
    const cell = appendCell(parent, table);
    push("table-cell", cell, cell);
  }

  function closeRow(row: Frame): void {
    const table = current();
    const count = columns(row.into);
    if (count === null || table.kind !== "table") {
      return;
    }
    while (row.column < count) {
      appendCell(row, table);
    }
  }

  function open(kind: Kind): void {
    const parent = current();
    if (parent.dropped) {
      push(null, parent.into, null, true);
      return;
    }
    const heading = HEADING.exec(kind);
    if (heading !== null) {
      const level = Math.min(6, Number(heading[1]) + shift);
      const h = doc.createElement(`h${String(level)}`);
      parent.into.append(h);
      push(kind, h, h);
      return;
    }
    switch (kind) {
      case "code":
        openCode(parent);
        return;
      case "table":
        openTable(parent);
        return;
      case "table-row":
        openRow(parent);
        return;
      case "table-cell":
        openCell(parent);
        return;
      case "image":
        push(kind, parent.into, null);
        return;
      case "checkbox": {
        const box = el("input");
        box.type = "checkbox";
        box.disabled = true;
        box.setAttribute("aria-label", "Task item");
        parent.into.append(box);
        push(kind, box, box);
        return;
      }
      case "equation-inline":
      case "equation-block": {
        const code = el("code");
        code.setAttribute("data-math", kind === "equation-block" ? "block" : "inline");
        parent.into.append(code);
        push(kind, code, code);
        return;
      }
      default: {
        const tag = TAGS.get(kind);
        if (tag === undefined) {
          push(null, parent.into, null);
          return;
        }
        const node = doc.createElement(tag);
        parent.into.append(node);
        push(kind, node, node);
        if (kind === "list-item" && parent.kind === "list-ordered") {
          fitMarkers(parent.into);
        }
      }
    }
  }

  function setLang(frame: Frame, lang: string): void {
    if (!LANG.test(lang)) {
      return;
    }
    frame.attrs.set("lang", lang);
    frame.into.className = `language-${lang}`;
    const label = frame.node?.querySelector('[data-part="lang"]') ?? null;
    if (label !== null) {
      label.textContent = languageName(lang) || lang;
    }
  }

  function attr(name: AttrName, value: string): void {
    const frame = current();
    if (frame === root || frame.dropped) {
      return;
    }
    if (name === "lang" && frame.kind === "code") {
      setLang(frame, value);
    } else if (name === "start" && frame.kind === "list-ordered") {
      if (START.test(value)) {
        frame.into.setAttribute("start", String(Number(value)));
        fitMarkers(frame.into);
      }
    } else if (name === "align" && frame.kind === "table") {
      frame.align = value.split(",");
    } else if (name === "checked" && frame.kind === "checkbox") {
      frame.into.setAttribute("checked", "");
    } else {
      frame.attrs.set(name, value);
    }
  }

  function text(s: string): void {
    const frame = current();
    if (frame.dropped) {
      return;
    }
    if (frame.kind === "image") {
      frame.alt += s;
      return;
    }
    if (s === "") {
      return;
    }
    const node = doc.createTextNode(s);
    frame.into.append(node);
    if (extras.text !== undefined) {
      place(node, () => extras.text?.(frame.into, node));
    }
  }

  /** The gate, then `urls`. */
  function admit(raw: string, kind: "href" | "src"): Gated | null {
    const gated = gate(raw, base);
    return gated === null || options.urls?.(gated.url, raw, kind) === false ? null : gated;
  }

  /** Gives an anchor its destination, withheld or live; returns whether it was withheld. */
  function point(a: HTMLAnchorElement, gated: Gated): boolean {
    const page = new URL(doc.URL);
    if (withheld(gated, withhold, page.origin)) {
      a.setAttribute("data-cp-withheld", "");
      const dest = el("span");
      dest.setAttribute("data-part", "dest");
      dest.textContent = gated.url.href;
      a.append(dest);
      return true;
    }
    a.setAttribute("href", written(gated, new URL(doc.baseURI)));
    a.setAttribute("rel", REL);
    const web = gated.url.protocol === "http:" || gated.url.protocol === "https:";
    // Both apps hold a live feed and an unsent draft a navigation would lose.
    if (web && !fragmentOnly(gated, page)) {
      a.setAttribute("target", "_blank");
    }
    return false;
  }

  function closeLink(frame: Frame, a: HTMLAnchorElement): Node {
    const raw = frame.attrs.get("href") ?? "";
    const title = frame.attrs.get("title") ?? "";
    if (title !== "") {
      a.setAttribute("title", title);
    }
    const gated = admit(raw, "href");
    const held = gated !== null && point(a, gated);
    return place(a, () => hooks.link?.({ url: gated?.url ?? null, raw, title, withheld: held }, a));
  }

  function closeImage(frame: Frame): Node {
    const raw = frame.attrs.get("src") ?? "";
    const title = frame.attrs.get("title") ?? "";
    const alt = frame.alt;
    const gated = gate(raw, base);
    const n = (url: URL | null): ImageNode => ({ url, raw, alt, title });
    if (
      gated !== null &&
      loadImages &&
      options.urls?.(gated.url, raw, "src") !== false &&
      !withheld(gated, withhold, new URL(doc.URL).origin)
    ) {
      const img = el("img");
      img.setAttribute("alt", alt);
      if (title !== "") {
        img.setAttribute("title", title);
      }
      img.setAttribute("referrerpolicy", "no-referrer");
      img.setAttribute("loading", "lazy");
      frame.into.append(img);
      return place(img, () => {
        const result = hooks.image?.(n(gated.url), img);
        // Only an img in what the library inserts gets src, so a replaced one is never fetched.
        const kept =
          result === undefined
            ? img.parentNode !== null
            : result === img || (result instanceof Node && result.contains(img));
        if (kept) {
          img.setAttribute("src", written(gated, new URL(doc.baseURI)));
        }
        return result;
      });
    }
    const a = el("a");
    if (title !== "") {
      a.setAttribute("title", title);
    }
    const linked = gated === null ? null : admit(raw, "href");
    if (linked === null) {
      a.textContent = alt === "" ? "Image" : alt;
    } else {
      a.textContent = alt === "" ? linked.url.host + linked.url.pathname || linked.url.href : alt;
      point(a, linked);
    }
    frame.into.append(a);
    return place(a, () => hooks.image?.(n(linked?.url ?? null), a));
  }

  function closeCode(frame: Frame, block: HTMLElement): Node {
    const code = frame.into;
    const tag = frame.attrs.get("lang") ?? "";
    const source = code.textContent;
    if (options.highlight !== false) {
      let lang = resolveLanguage(tag);
      if (tag === "") {
        lang = detectLanguage(source);
        const label = block.querySelector('[data-part="lang"]');
        if (label !== null) {
          label.textContent = languageName(lang);
        }
      }
      if (lang !== "") {
        highlightInto(code, source, lang);
      }
    }
    const closed = !frame.attrs.has("unclosed");
    return place(block, () => hooks.code?.({ lang: tag, text: source, closed }, block));
  }

  /** An inline token the text never closed is its delimiter, then its content. */
  function unwrap(frame: Frame, delim: string): void {
    if (frame.kind === "image") {
      frame.into.append(doc.createTextNode(delim + frame.alt));
      return;
    }
    const node = frame.node;
    if (node === null) {
      return;
    }
    extras.moved?.(node);
    node.replaceWith(doc.createTextNode(delim), ...node.childNodes);
  }

  function finish(frame: Frame): Node | null {
    if (frame.dropped) {
      return null;
    }
    const node = frame.node;
    const delim = frame.attrs.get("unclosed");
    switch (frame.kind) {
      case "code":
        return node !== null && isHTMLElement(node) ? closeCode(frame, node) : node;
      case "link":
        if (delim !== undefined) {
          unwrap(frame, delim);
          return null;
        }
        return closeLink(frame, node as HTMLAnchorElement);
      case "image":
        if (delim !== undefined) {
          unwrap(frame, delim);
          return null;
        }
        return closeImage(frame);
      case "equation-inline":
      case "equation-block": {
        if (delim !== undefined) {
          unwrap(frame, delim);
          return null;
        }
        const math = node as HTMLElement;
        const tex = math.textContent;
        const display = frame.kind === "equation-block";
        return place(math, () => hooks.math?.({ tex, display }, math));
      }
      case "table-row":
        closeRow(frame);
        return node;
      case "emphasis":
      case "strong":
      case "strike":
      case "code-inline":
        if (delim !== undefined) {
          unwrap(frame, delim);
          return null;
        }
        return node;
      default:
        return node;
    }
  }

  function close(): void {
    const frame = stack.pop();
    if (frame === undefined || frame === root) {
      stack.length = 1;
      return;
    }
    const left = finish(frame);
    if (frame.top && left !== null && isHTMLElement(left)) {
      place(left, () => hooks.block?.(left));
    }
  }

  return {
    open(kind) {
      if (!done) {
        open(kind);
      }
    },
    close() {
      if (!done) {
        close();
      }
    },
    text(s) {
      if (!done) {
        text(s);
      }
    },
    attr(name, value) {
      if (!done) {
        attr(name, value);
      }
    },
    end() {
      while (!done && stack.length > 1) {
        close();
      }
      done = true;
    },
  };
}

/**
 * A sink that renders the operations it receives into `host`, after what
 * `host` holds: one long-lived sink can take a worker's batches in turn.
 * `maxBytes` is not read here; the text's producer applies it.
 */
export function createDomSink(host: Element, options?: RenderOptions): DomSink {
  const s = domSink(host, options);
  return {
    open: (kind) => {
      s.open(kind);
    },
    close: () => {
      s.close();
    },
    text: (t) => {
      s.text(t);
    },
    attr: (name, value) => {
      s.attr(name, value);
    },
    end: () => {
      s.end();
    },
  };
}

/** What `maxBytes` lets through of a text written in one or more chunks. */
interface ByteBudget {
  /** The part of `chunk` that fits, cut at a code point; a lead surrogate
   *  ending it waits for the next chunk to say what it costs. "" once the
   *  budget is spent. */
  take(chunk: string): string;
  /** What the last chunk held back, once no chunk follows. */
  flush(): string;
  /** Some text did not fit. */
  readonly cut: boolean;
}

function isLead(c: number): boolean {
  return c >= 0xd800 && c <= 0xdbff;
}

function isTrail(c: number): boolean {
  return c >= 0xdc00 && c <= 0xdfff;
}

/** @internal */
export function byteBudget(max: number): ByteBudget {
  let left = max;
  let cut = false;
  // In UTF-8 bytes a pair costs 4 and a lone surrogate U+FFFD's 3.
  let held = "";
  return {
    take(chunk) {
      if (cut) {
        return "";
      }
      const text = held + chunk;
      held = "";
      for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        let cost = c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
        if (isLead(c)) {
          if (i + 1 === text.length) {
            held = text.slice(i);
            return text.slice(0, i);
          }
          if (isTrail(text.charCodeAt(i + 1))) {
            cost = 4;
          }
        }
        if (cost > left) {
          cut = true;
          return text.slice(0, i);
        }
        left -= cost;
        if (cost === 4) {
          i += 1;
        }
      }
      return text;
    },
    flush() {
      const lead = held;
      held = "";
      if (cut || lead === "") {
        return "";
      }
      if (left < 3) {
        cut = true;
        return "";
      }
      left -= 3;
      return lead;
    },
    get cut() {
      return cut;
    },
  };
}

/** The line shown once where `maxBytes` cut the text. */
export function truncationLine(doc: Document, maxBytes: number): HTMLParagraphElement {
  const line = doc.createElement("p");
  line.setAttribute("data-cp-truncated", "");
  const unit = maxBytes >= MIB ? "megabyte" : maxBytes >= 1024 ? "kilobyte" : "byte";
  const size = new Intl.NumberFormat(undefined, {
    style: "unit",
    unit,
    // CLDR's short English byte is "byte" whatever the count; the long form is plural.
    unitDisplay: unit === "byte" ? "long" : "short",
    maximumFractionDigits: 1,
  }).format(maxBytes >= MIB ? maxBytes / MIB : maxBytes >= 1024 ? maxBytes / 1024 : maxBytes);
  line.textContent = `The text stops here, after its first ${size}.`;
  return line;
}

/** `maxBytes`, checked. */
export function byteLimit(options: RenderOptions): number {
  const max = options.maxBytes ?? MIB;
  if (!Number.isInteger(max) || max < 0) {
    throw new RangeError(`maxBytes must be a whole number of bytes, not ${String(max)}`);
  }
  return max;
}

/**
 * Renders `text` into `host`, after what `host` holds, and closes every
 * token so the last block's hooks run too. Throws a `RangeError` for a
 * `headingLevel` or `maxBytes` out of range, and a `TypeError` for a `base`
 * that is not a URL.
 */
export function renderMarkdown(host: Element, text: string, options: RenderOptions = {}): void {
  const max = byteLimit(options);
  const sink = domSink(host, options);
  const budget = byteBudget(max);
  const parser = createParser(sink);
  parser.write(budget.take(text) + budget.flush());
  parser.end();
  sink.end();
  if (budget.cut && options.signal?.aborted !== true) {
    host.append(truncationLine(host.ownerDocument, max));
  }
}
