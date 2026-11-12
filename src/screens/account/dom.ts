/**
 * dom.ts — the nodes the account screens build, with DOM calls and
 * `textContent` only and no `style` attribute, so caller text stays text
 * and a strict content security policy accepts them.
 * @module
 */

import type { Tone } from "./answer.js";

let seq = 0;

/** An id unique on the page. */
function uid(part: string): string {
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

/** A glyph account.css draws, inside an element marked `data-cp-account`. */
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

/** A `<p>` of `className` holding `content`, a host's words or node. */
export function line(className: string, content: string | Node): HTMLParagraphElement {
  const p = el("p", className);
  p.append(content);
  return p;
}
