/**
 * main.ts — the gallery's script. It runs `legacy/`, the gallery's own
 * versions of the elements whose cards do not run on `src/` yet; as an
 * element moves into the library, its card imports the library's module here
 * as an app does, and its legacy version goes.
 */

import { enhanceSelectAll } from "@cplieger/ui/checkbox";
import { enhanceChoiceFields } from "@cplieger/ui/choice";
import { enhanceCopy } from "@cplieger/ui/copy";
import { enhanceReveal, enhanceSecret } from "@cplieger/ui/secret";
import { enhanceStepper } from "@cplieger/ui/stepper";
import { installTooltips } from "@cplieger/ui/tooltip";

import "./legacy/gallery.js";

const all = <E extends Element>(selector: string): E[] => [
  ...document.querySelectorAll<E>(selector),
];

installTooltips();

// The gallery names a group's boxes by data-group and its select-all box by
// data-select-all.
for (const box of all<HTMLInputElement>("input[data-select-all]")) {
  const group = CSS.escape(box.dataset["selectAll"] ?? "");
  enhanceSelectAll(box, () => all<HTMLInputElement>(`input[data-group="${group}"]`));
}
for (const group of all<HTMLElement>(".cp-choices:has(.cp-choice-field)")) {
  enhanceChoiceFields(group);
}
for (const stepper of all<HTMLElement>(".cp-stepper:has(> input)")) {
  enhanceStepper(stepper);
}
for (const secret of all<HTMLElement>(".cp-secret")) {
  enhanceSecret(secret);
}
for (const button of all<HTMLButtonElement>(".cp-input-wrap > .cp-button[aria-pressed]")) {
  const input = button.parentElement?.querySelector("input");
  if (input !== null && input !== undefined) {
    enhanceReveal(button, input);
  }
}
for (const button of all<HTMLButtonElement>(".cp-code > .cp-copy")) {
  const source = button.parentElement?.querySelector("code");
  if (source !== null && source !== undefined) {
    enhanceCopy(button, { source });
  }
}
