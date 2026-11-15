/**
 * dom.ts — the nodes the account screens build, with DOM calls and
 * `textContent` only and no `style` attribute, so caller text stays text
 * and a strict content security policy accepts them.
 * @module
 */

import type { Tone } from "./answer.js";

let seq = 0;

/** An id unique on the page. */
export function uid(part: string): string {
  seq += 1;
  return `cp-account-${part}-${String(seq)}`;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

/** A glyph the system stylesheet draws by its name. */
export function glyph(name: string, part?: string): HTMLSpanElement {
  const span = el("span", "cp-icon");
  span.dataset["cpIcon"] = name;
  span.setAttribute("aria-hidden", "true");
  if (part !== undefined) {
    span.dataset["part"] = part;
  }
  return span;
}

const TONE_GLYPH: Readonly<Record<Tone, string>> = {
  danger: "circle-x",
  warning: "triangle-alert",
  neutral: "info",
  success: "circle-check",
};

/** A `.cp-notice` in `tone`, with `action` at its end. */
export function notice(tone: Tone, body: string | Node, action?: HTMLElement): HTMLDivElement {
  const box = el("div", "cp-notice");
  box.dataset["tone"] = tone;
  const text = el("div");
  text.dataset["part"] = "body";
  text.append(body);
  box.append(glyph(TONE_GLYPH[tone]), text);
  if (action !== undefined) {
    box.append(action);
  }
  return box;
}

export function heading(level: number, text: string): HTMLHeadingElement {
  const h = el(`h${String(Math.min(6, Math.max(1, level)))}` as "h1", undefined, text);
  h.id = uid("title");
  return h;
}

export interface FieldSpec {
  readonly label: string;
  readonly name: string;
  readonly autocomplete: string;
  readonly type?: "text" | "password";
  readonly help?: string;
  readonly value?: string;
}

export interface Field {
  readonly root: HTMLDivElement;
  readonly input: HTMLInputElement;
}

/** A `.cp-field`: label, input, and help under them. A username field
 *  takes no capitals or spell check. */
export function field(spec: FieldSpec): Field {
  const root = el("div", "cp-field");
  const input = el("input", "cp-input");
  input.id = uid(spec.name);
  input.name = spec.name;
  input.type = spec.type ?? "text";
  input.setAttribute("autocomplete", spec.autocomplete);
  if (spec.type !== "password") {
    input.setAttribute("autocapitalize", "none");
    input.spellcheck = false;
  }
  if (spec.value !== undefined) {
    input.value = spec.value;
  }
  const label = el("label", "cp-label", spec.label);
  label.htmlFor = input.id;
  root.append(label, input);
  if (spec.help !== undefined) {
    const help = el("p", "cp-help", spec.help);
    help.id = `${input.id}-help`;
    input.setAttribute("aria-describedby", help.id);
    root.append(help);
  }
  return { root, input };
}

export interface PasswordField extends Field {
  readonly reveal: HTMLButtonElement;
}

/** A password field with its quiet Show button inside its end, in a
 *  `.cp-input-wrap`, for `enhanceReveal`. */
export function passwordField(spec: Omit<FieldSpec, "type">, show: string): PasswordField {
  const { root, input } = field({ ...spec, type: "password" });
  const wrap = el("div", "cp-input-wrap");
  const reveal = el("button", "cp-button");
  reveal.type = "button";
  reveal.dataset["variant"] = "quiet";
  reveal.setAttribute("aria-label", show);
  reveal.dataset["cpTip"] = show;
  reveal.setAttribute("aria-pressed", "false");
  reveal.append(glyph("eye"), glyph("eye-off", "on"));
  input.replaceWith(wrap);
  wrap.append(input, reveal);
  return { root, input, reveal };
}

export interface ButtonSpec {
  readonly icon?: string;
  readonly primary?: boolean;
  readonly type?: "submit" | "button";
}

/** A `.cp-button` with the busy and done glyphs and the `.cp-roll`
 *  `enhanceConfirm` needs. */
export function actionButton(text: string, spec: ButtonSpec = {}): HTMLButtonElement {
  const button = el("button", "cp-button");
  button.type = spec.type ?? "button";
  if (spec.primary === true) {
    button.dataset["variant"] = "primary";
  }
  if (spec.icon !== undefined) {
    button.append(glyph(spec.icon));
  }
  button.append(glyph("spinner-arc", "busy"), glyph("check", "done"), el("span", "cp-roll", text));
  return button;
}

/** A `.cp-button` of `icon` and `text`, for a press with no busy state of
 *  its own, such as one opening a dialog. */
export function plainButton(text: string, icon?: string): HTMLButtonElement {
  const button = el("button", "cp-button");
  button.type = "button";
  if (icon !== undefined) {
    button.append(glyph(icon));
  }
  button.append(text);
  return button;
}

/** A `<p>` of `className` holding `content`, a host's words or node. */
export function line(className: string, content: string | Node): HTMLParagraphElement {
  const p = el("p", className);
  p.append(content);
  return p;
}

/** A form's shape while its state loads. */
export function sketch(): HTMLElement {
  const box = el("div", "cp-stack");
  box.setAttribute("aria-hidden", "true");
  for (const variant of ["heading", "", "heading", "", "last"]) {
    const bar = el("span", "cp-skeleton");
    if (variant !== "") {
      bar.dataset["variant"] = variant;
    }
    box.append(bar);
  }
  return box;
}

/** A `.cp-state`: the state of a thing in its row, its tone's glyph then
 *  its word. */
export function stateMark(tone: Tone, icon: string, text: string): HTMLSpanElement {
  const span = el("span", "cp-state");
  span.dataset["tone"] = tone;
  span.append(glyph(icon), text);
  return span;
}

/** A small `.cp-button` for a table row's actions. */
export function rowButton(
  text: string,
  spec: ButtonSpec & { readonly label?: string } = {},
): HTMLButtonElement {
  const button = actionButton(text, spec);
  button.dataset["size"] = "sm";
  if (spec.label !== undefined) {
    button.setAttribute("aria-label", spec.label);
  }
  return button;
}

export interface Column {
  readonly text: string;
  /** `"actions"` for the last column of row buttons. */
  readonly col?: "actions";
  readonly priority?: "low" | "mid";
}

/** A flush `.cp-panel` holding a `.cp-table` named by `labelledBy`, and
 *  its body. */
export function table(
  labelledBy: string,
  columns: readonly Column[],
): { readonly root: HTMLElement; readonly body: HTMLTableSectionElement } {
  const root = el("div", "cp-panel");
  root.dataset["flush"] = "";
  const t = el("table", "cp-table");
  t.setAttribute("aria-labelledby", labelledBy);
  const row = el("tr");
  for (const c of columns) {
    const th = el("th");
    th.scope = "col";
    if (c.col === "actions") {
      th.dataset["col"] = "actions";
      th.append(el("span", "cp-hidden-narrow", c.text));
    } else {
      th.textContent = c.text;
    }
    if (c.priority !== undefined) {
      th.dataset["priority"] = c.priority;
    }
    row.append(th);
  }
  const head = el("thead");
  head.append(row);
  const body = el("tbody");
  t.append(head, body);
  root.append(t);
  return { root, body };
}

/** A table cell holding `content`. */
export function cell(...content: (string | Node)[]): HTMLTableCellElement {
  const td = el("td");
  td.append(...content);
  return td;
}

/** A `.cp-cell-stack` of `top` over a muted `<small>` line for each of
 *  `lines`. */
export function cellStack(top: string | Node, ...lines: (string | Node)[]): HTMLDivElement {
  const box = el("div", "cp-cell-stack");
  box.append(top);
  for (const l of lines) {
    const small = el("small");
    small.append(l);
    box.append(small);
  }
  return box;
}

/** A date or a time is one unit, so a narrow column never splits it. */
const unbroken = (text: string): string => text.replace(/\s/g, "\u00a0");

/** A `<time>` of `iso`, worded by `format`. */
export function time(iso: string, format: Intl.DateTimeFormatOptions): HTMLTimeElement {
  const t = el("time", undefined, unbroken(new Date(iso).toLocaleString(undefined, format)));
  t.dateTime = iso;
  return t;
}

/** "18:40" today, else "14 Nov, 18:40". */
export function clockAt(at: Date): string {
  const now = new Date();
  const today =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate();
  return unbroken(
    at.toLocaleString(
      undefined,
      today
        ? { hour: "2-digit", minute: "2-digit" }
        : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
    ),
  );
}
