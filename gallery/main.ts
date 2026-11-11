/**
 * main.ts — the gallery's script. It runs `legacy/`, the gallery's own
 * versions of the elements whose cards do not run on `src/` yet; as an
 * element moves into the library, its card imports the library's module here
 * as an app does, and its legacy version goes.
 */

import { enhanceSelectAll } from "@cplieger/ui/checkbox";
import { enhanceChoiceFields } from "@cplieger/ui/choice";
import { enhanceCopy } from "@cplieger/ui/copy";
import { enhanceRange } from "@cplieger/ui/range";
import { enhanceSearch } from "@cplieger/ui/search";
import { enhanceReveal, enhanceSecret } from "@cplieger/ui/secret";
import { enhancePanel } from "@cplieger/ui/panel";
import { enhanceStepper } from "@cplieger/ui/stepper";
import { enhanceTextarea } from "@cplieger/ui/textarea";
import { enhanceTokens } from "@cplieger/ui/tokens";
import { enhanceToggle } from "@cplieger/ui/toggle";
import { installTooltips } from "@cplieger/ui/tooltip";
import { viewTransition } from "@cplieger/ui/view-transition";

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
// A token field names its suggestions by data-suggest, its limit by
// data-max and its note by data-note, and data-free takes new words. The
// search page listens for "tokens".
for (const box of all<HTMLElement>("[data-tokens]")) {
  const byId = (key: string): HTMLElement | undefined => {
    const id = box.dataset[key];
    return id === undefined ? undefined : (document.getElementById(id) ?? undefined);
  };
  const suggestions = byId("suggest");
  const note = byId("note");
  const max = box.dataset["max"];
  enhanceTokens(box, {
    ...(suggestions === undefined ? {} : { suggestions, allowNew: box.hasAttribute("data-free") }),
    ...(note === undefined ? {} : { note }),
    ...(max === undefined ? {} : { max: Number(max) }),
    onChange: () => box.dispatchEvent(new CustomEvent("tokens", { bubbles: true })),
  });
}
for (const search of all<HTMLElement>(".cp-search")) {
  enhanceSearch(search);
}
// A text area names its limit by data-max and its count by data-count.
for (const area of all<HTMLTextAreaElement>("textarea[data-max]")) {
  const count = document.getElementById(area.dataset["count"] ?? "");
  enhanceTextarea(area, { max: Number(area.dataset["max"]), ...(count === null ? {} : { count }) });
}
// A range names its output by data-out.
for (const range of all<HTMLInputElement>("input.cp-range")) {
  const output = document.getElementById(range.dataset["out"] ?? "");
  enhanceRange(range, output instanceof HTMLOutputElement ? { output } : {});
}
for (const panel of all<HTMLElement>(".cp-popover[data-variant='panel']")) {
  enhancePanel(panel);
}
// The header's theme toggle: dark while pressed, the new look growing from
// the button, and the tip naming the next press.
const root = document.documentElement;
for (const button of all<HTMLButtonElement>("[data-theme-toggle]")) {
  const toggle = enhanceToggle(button, {
    onChange: (dark) => {
      void viewTransition(
        () => {
          root.dataset["theme"] = dark ? "dark" : "light";
        },
        { from: button },
      );
    },
  });
  const show = (): void => {
    const dark = root.dataset["theme"] === "dark";
    if (toggle.on !== dark) {
      toggle.set(dark);
    }
    button.dataset["cpTip"] = dark ? "Switch to light" : "Switch to dark";
  };
  new MutationObserver(show).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  show();
}
