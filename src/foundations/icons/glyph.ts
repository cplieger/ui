/**
 * glyph.ts — the decorative glyph span a module writes, which icons.css
 * draws by its `data-cp-icon` with no script and no host URL.
 * @module
 * @internal
 */

import type { IconName } from "./icons.js";

/** A tone a surface takes as `data-tone`, which leads its words with its glyph. */
export type Tone = "neutral" | "success" | "warning" | "danger";

const TONE_GLYPH: Readonly<Record<Tone, IconName>> = {
  neutral: "info",
  success: "circle-check",
  warning: "triangle-alert",
  danger: "circle-x",
};

/** The glyph `tone` leads with; no glyph serves two tones. */
export function toneGlyph(tone: Tone): IconName {
  return TONE_GLYPH[tone];
}

/** A `span.cp-icon[data-cp-icon=name]`, hidden from readers, with
 *  `data-part` set when `part` is given. */
export function glyph(name: IconName, part?: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "cp-icon";
  span.dataset["cpIcon"] = name;
  if (part !== undefined) {
    span.dataset["part"] = part;
  }
  span.setAttribute("aria-hidden", "true");
  return span;
}
