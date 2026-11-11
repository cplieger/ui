/**
 * main.ts — the gallery's script. It runs `legacy/`, the gallery's own
 * versions of the elements whose cards do not run on `src/` yet; as an
 * element moves into the library, its card imports the library's module here
 * as an app does, and its legacy version goes.
 */

import { enhanceSelectAll } from "@cplieger/ui/checkbox";
import { enhanceChoiceFields } from "@cplieger/ui/choice";
import { enhanceConnectionTest } from "@cplieger/ui/connection-test";
import { enhanceCopy } from "@cplieger/ui/copy";
import { enhanceDateRange } from "@cplieger/ui/date-range";
import { enhanceFiles } from "@cplieger/ui/file";
import { reportErrors } from "@cplieger/ui/form";
import { enhanceRange } from "@cplieger/ui/range";
import { enhanceSearch } from "@cplieger/ui/search";
import { enhancePairs } from "@cplieger/ui/pairs";
import { enhanceRules } from "@cplieger/ui/rules";
import { enhanceReveal, enhanceSecret } from "@cplieger/ui/secret";
import { enhancePanel } from "@cplieger/ui/panel";
import { enhanceStepper } from "@cplieger/ui/stepper";
import { enhanceTextarea } from "@cplieger/ui/textarea";
import { createTokenLimit, enhanceTokens, type TokenLimit } from "@cplieger/ui/tokens";
import { enhanceToggle } from "@cplieger/ui/toggle";
import { installTooltips } from "@cplieger/ui/tooltip";
import { viewTransition } from "@cplieger/ui/view-transition";

import "./legacy/gallery.js";
import { markCards } from "./review.js";

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
// data-max, a limit it shares by data-limit and its note by data-note, and
// data-free takes new words. The search page listens for "tokens".
const limits = new Map<string, TokenLimit>([["hidden-tags", createTokenLimit(4)]]);
for (const box of all<HTMLElement>("[data-tokens]")) {
  const byId = (key: string): HTMLElement | undefined => {
    const id = box.dataset[key];
    return id === undefined ? undefined : (document.getElementById(id) ?? undefined);
  };
  const suggestions = byId("suggest");
  const note = byId("note");
  const max = box.dataset["max"];
  const limit = limits.get(box.dataset["limit"] ?? "");
  enhanceTokens(box, {
    ...(suggestions === undefined ? {} : { suggestions, allowNew: box.hasAttribute("data-free") }),
    ...(note === undefined ? {} : { note }),
    ...(max === undefined ? {} : { max: Number(max) }),
    ...(limit === undefined ? {} : { limit }),
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
// The setup card's test passes for an address with a port, after a second.
for (const button of all<HTMLButtonElement>("button[data-test]")) {
  const status = document.getElementById(button.dataset["test"] ?? "");
  const url = document.getElementById(button.dataset["url"] ?? "");
  const mark = document.getElementById(`${url?.id ?? ""}-error`);
  const step = button.closest<HTMLElement>("[data-step]");
  if (status === null || !(url instanceof HTMLInputElement) || mark === null || step === null) {
    continue;
  }
  enhanceConnectionTest(button, status, {
    root: step,
    run: (signal) =>
      new Promise((done, fail) => {
        const timer = setTimeout(() => {
          done(
            /^https?:\/\/\S+:\d+/.test(url.value)
              ? { ok: true, message: "Connected, Sonarr 4.0.9" }
              : {
                  ok: false,
                  message: "Sonarr did not answer at this address and port.",
                  field: "url",
                  fix: "Check the address and its port, such as http://sonarr.lan:8989.",
                },
          );
        }, 1100);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          fail(new DOMException("The check was ended.", "AbortError"));
        });
      }),
    fields: { url: { input: url, mark } },
  });
}
// A filter chip's state is the app's filter; here a press flips it.
for (const chip of all<HTMLButtonElement>(".cp-filter-chip")) {
  chip.addEventListener("click", () => {
    chip.setAttribute("aria-pressed", String(chip.getAttribute("aria-pressed") !== "true"));
  });
}
for (const range of all<HTMLElement>("[data-range]")) {
  enhanceDateRange(range, { earliest: new Date(2024, 2, 1) });
}
// A file field names its list by data-files and its limit by data-max-size.
// In a dialog, Upload with no file says so on the field.
for (const input of all<HTMLInputElement>("input[type='file'][data-files]")) {
  const list = document.getElementById(input.dataset["files"] ?? "");
  const files = enhanceFiles(input, {
    ...(list === null ? {} : { list }),
    maxSize: Number(input.dataset["maxSize"] ?? Infinity),
  });
  const form = input.form;
  const summary = form?.querySelector<HTMLElement>("[data-summary]");
  if (form === null || summary === null || summary === undefined) {
    continue;
  }
  form.addEventListener("submit", (e) => {
    if (files.files.length === 0) {
      e.preventDefault();
      reportErrors(form, [{ field: input, message: "Choose a file to upload." }], {
        summary,
        heading: (n) => `${String(n)} fields need a fix`,
      });
    }
  });
}
// The sentence editor's pickers: a language each, three to a rule.
const LANGS = ["English", "English (signs and songs)", "French", "German", "Spanish", "Japanese"];
const pickLang = (chosen: string, when: string): HTMLElement => {
  const select = document.createElement("select");
  select.className = "cp-input";
  select.setAttribute("aria-label", `Language ${when}`);
  for (const l of [...LANGS, "nothing"]) {
    select.append(new Option(l, l, false, l === chosen));
  }
  const box = document.createElement("span");
  box.className = "cp-select";
  box.append(select);
  return box;
};
for (const rules of all<HTMLElement>("[data-sentences]")) {
  enhanceRules(rules, {
    max: 3,
    target: (rule) => pickLang("French", rule.dataset["when"] ?? ""),
    rule: () => {
      const li = document.createElement("li");
      li.dataset["when"] = "when the audio is Japanese";
      const when = document.createElement("span");
      when.dataset["part"] = "when";
      when.append("When the audio is", pickLang("Japanese", "for the audio"));
      const verb = document.createElement("span");
      verb.dataset["part"] = "verb";
      verb.textContent = "fetch";
      const targets = document.createElement("span");
      targets.dataset["part"] = "targets";
      const first = document.createElement("span");
      first.className = "cp-rule-target";
      first.append(pickLang("English", li.dataset["when"]));
      targets.append(first);
      li.append(when, verb, targets);
      return li;
    },
    words: {
      add: (when, full, n) =>
        full ? `Add a language ${when}. ${String(n)} is the most.` : `Add a language ${when}`,
      full: (n) => `${String(n)} languages is the most`,
    },
  });
}
for (const box of all<HTMLElement>("[data-pairs]")) {
  enhancePairs(box);
}

// Last, once every card is wired: it only reads the page.
markCards();
