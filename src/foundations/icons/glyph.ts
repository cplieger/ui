/**
 * glyph.ts — the decorative glyph span a module writes, which icons.css
 * draws by its `data-cp-icon` with no script and no host URL.
 * @module
 * @internal
 */

import type { IconName } from "./icons.js";

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
